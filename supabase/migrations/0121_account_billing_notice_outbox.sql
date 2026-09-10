-- Persist notification intent in the same transaction as the account change.
create table public.account_billing_notice_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  payment_id uuid references public.billing_payments(id),
  event_type text not null check(event_type in ('credit_topup_enabled','credit_topup_disabled','credit_topup_action_required','payment_canceled','payment_refunded')),
  dedupe_key text not null unique,
  metadata jsonb not null default '{}',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.account_billing_notice_outbox enable row level security;
revoke all on public.account_billing_notice_outbox from public,anon,authenticated;
grant all on public.account_billing_notice_outbox to service_role;
create index account_billing_notice_due on public.account_billing_notice_outbox(next_attempt_at);

create function public.queue_topup_attention(p_org uuid,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare p public.credit_topup_policies; k text;
begin
  select * into p from public.credit_topup_policies where organization_id=p_org;
  if not found then return; end if;
  k:='topup:attention:'||p_org||':'||p.authorized_at||':'||p_reason||case when p_reason='monthly_cap' then ':'||to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM') else '' end;
  -- Do not re-create an intent after it was consumed into the notification log.
  if exists(select 1 from public.billing_notification_events where dedupe_key=k) then return; end if;
  insert into public.account_billing_notice_outbox(organization_id,event_type,dedupe_key,metadata)
    values(p_org,'credit_topup_action_required',k,jsonb_build_object('reason',p_reason,'policy_authorized_at',p.authorized_at,'cap_month',to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM')))
    on conflict(dedupe_key) do nothing;
end $$;

create function public.queue_topup_policy_notice() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.event_type='credit_topup_reauthorization_required' then
    perform public.queue_topup_attention((new.payload->>'organization_id')::uuid,'offer_changed');
  elsif new.event_type='credit_topup_policy_changed' then
    insert into public.account_billing_notice_outbox(organization_id,event_type,dedupe_key,metadata)
      values((new.payload->>'organization_id')::uuid,
        case when (new.payload->>'enabled')::boolean then 'credit_topup_enabled' else 'credit_topup_disabled' end,
        'topup:policy:'||new.event_key,
        jsonb_build_object('policy_authorized_at',new.payload#>'{conditions,authorized_at}'))
      on conflict(dedupe_key) do nothing;
  end if;
  return new;
end $$;
create trigger queue_topup_policy_notice after insert on public.platform_customer_journey
for each row when (new.event_type in ('credit_topup_policy_changed','credit_topup_reauthorization_required'))
execute function public.queue_topup_policy_notice();

create function public.queue_terminal_payment_notice() returns trigger
language plpgsql security definer set search_path=public as $$
declare kind text;
begin
  if new.status is not distinct from old.status or new.status not in ('refunded','canceled','cancelled') then return new; end if;
  kind:=case when new.status='refunded' then 'payment_refunded' else 'payment_canceled' end;
  insert into public.account_billing_notice_outbox(organization_id,payment_id,event_type,dedupe_key)
    values(new.organization_id,new.id,kind,'billing:payment:'||new.id||':'||kind)
    on conflict(dedupe_key) do nothing;
  return new;
end $$;
create trigger queue_terminal_payment_notice after update of status on public.billing_payments
for each row execute function public.queue_terminal_payment_notice();
revoke all on function public.queue_topup_attention(uuid,text),public.queue_topup_policy_notice(),public.queue_terminal_payment_notice() from public,anon,authenticated;
grant execute on function public.queue_topup_attention(uuid,text) to service_role;

-- Existing charge guards preserved; blocked purchases now leave an alert intent.
create or replace function public.claim_credit_topup(p_org uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare policy public.credit_topup_policies;product public.platform_products;owner_user uuid;balance numeric;spent numeric;sub uuid;p public.billing_payments;attempt uuid:=gen_random_uuid();result jsonb;reference text;amount numeric;
begin
 select owner_id into owner_user from public.organizations where id=p_org for update;
 select * into policy from public.credit_topup_policies where organization_id=p_org for update;
 if policy.organization_id is null or not policy.enabled then return null;end if;
 if not coalesce((public.resolve_organization_contract_access(p_org)->>'allowed')::boolean,false) then return null;end if;
 select balance_credits into balance from public.credit_wallets where organization_id=p_org for update;
 if balance is null or balance>policy.threshold_credits then return null;end if;
 if not exists(select 1 from public.billing_asaas_card_vault where id=policy.card_method_id and organization_id=p_org and status='active') then perform public.queue_topup_attention(p_org,'card_unavailable');return null;end if;
 if exists(select 1 from public.credit_topup_runs r join public.billing_card_attempts a on a.id=r.attempt_id where r.organization_id=p_org and (a.state in ('processing','unknown','pending') or r.created_at>now()-interval '1 hour')) then return null;end if;
 select coalesce(sum(r.amount_brl),0) into spent from public.credit_topup_runs r join public.billing_card_attempts a on a.id=r.attempt_id where r.organization_id=p_org and r.created_at>=date_trunc('month',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' and a.state not in ('rejected','error','cancelled');
 if spent+policy.agreed_amount_brl>policy.monthly_cap_brl then perform public.queue_topup_attention(p_org,'monthly_cap');return null;end if;
 select * into product from public.platform_products where id=policy.product_id and status='active' and owner_type='connectyhub' and sales_channel_type='direct' and billing_cycle='one_time';
 amount:=public.checkout_money(coalesce(product.offer->>'sale_price',product.offer->>'salePrice',product.price::text));
 if product.id is null or amount is distinct from policy.agreed_amount_brl or public.platform_product_credit_amount(product)<>policy.agreed_credits then
  update public.credit_topup_policies set enabled=false,updated_at=now() where organization_id=p_org;
  insert into public.platform_customer_journey(user_id,event_key,event_type,payload) values(owner_user,'topup_offer_changed:'||gen_random_uuid(),'credit_topup_reauthorization_required',jsonb_build_object('organization_id',p_org));
  return null;
 end if;
 -- A pending manual checkout is never silently converted into an automatic charge.
 if exists(select 1 from public.organization_subscriptions where organization_id=p_org and subscription_kind='product' and plan_code='product_'||product.id and status in ('pending','incomplete')) then return null;end if;
 sub:=public.create_product_purchase_intent(p_org,owner_user,product.id,amount,jsonb_build_object('billing_cycle','one_time','billing_interval',product.billing_interval,'price_brl',amount,'included_credits',policy.agreed_credits,'access_duration_days',null));
 select * into p from public.billing_payments where subscription_id=sub order by created_at desc limit 1;
 reference:='billing_topup:'||p.id;
 result:=public.claim_native_billing_card(p_org,p.id,attempt,p.checkout_revision,amount,0,reference);
 if not coalesce((result->>'claimed')::boolean,false) then raise exception 'TOPUP_CLAIM_FAILED';end if;
 update public.billing_payments set payload=payload||jsonb_build_object('automatic_topup',true,'topup_policy',to_jsonb(policy),'managed_external_reference',reference) where id=p.id;
 insert into public.credit_topup_runs(organization_id,payment_id,attempt_id,amount_brl,credits,policy_snapshot) values(p_org,p.id,attempt,amount,policy.agreed_credits,to_jsonb(policy));
 insert into public.platform_customer_journey(user_id,event_key,event_type,source_id,payload) values(owner_user,'topup_attempt:'||attempt,'credit_topup_started',p.id,jsonb_build_object('amount_brl',amount,'credits',policy.agreed_credits,'subscription_id',sub));
 return result||jsonb_build_object('method_id',policy.card_method_id);
end $$;

-- Access-only notices do not request payment for a canceled renewal.
create or replace function public.claim_billing_notice(p_event uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare n public.billing_notification_events; s public.organization_subscriptions; p public.billing_payments; expected timestamptz;
begin
  select * into n from public.billing_notification_events where id=p_event for update;
  if not found or n.status not in ('pending','failed') or n.delivery_uncertain or n.delivery_claimed_at is not null or n.attempts>=5 or n.next_attempt_at>now() then return false; end if;
  select * into s from public.organization_subscriptions where id=n.subscription_id;
  expected:=nullif(n.metadata->>'current_period_end','')::timestamptz;
  if expected is not null and (coalesce(s.current_period_end,s.next_billing_at) is distinct from expected or (s.status='canceled' and n.event_type not in ('paid_access_ending','paid_access_ended'))) then
    update public.billing_notification_events set status='skipped',error_message='Ciclo alterado; aviso anterior cancelado.' where id=n.id; return false;
  end if;
  if n.payment_id is not null then
    select * into p from public.billing_payments where id=n.payment_id;
    if (n.event_type in ('subscription_pending','payment_pending','payment_rejected','payment_canceled','payment_started','checkout_payment_started','checkout_cart_updated') and p.status in ('approved','refunded'))
      or (n.event_type='payment_approved' and p.status<>'approved') then
      update public.billing_notification_events set status='skipped',error_message='Situação financeira alterada.' where id=n.id; return false;
    end if;
  end if;
  update public.billing_notification_events set delivery_claimed_at=now() where id=n.id;
  return true;
end $$;
revoke all on function public.claim_billing_notice(uuid) from public,anon,authenticated;
grant execute on function public.claim_billing_notice(uuid) to service_role;
