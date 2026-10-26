-- Same spendable balance for use, alerts and authorized topups. No policy changes.
create or replace function public.claim_credit_topup(p_org uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare policy public.credit_topup_policies;product public.platform_products;owner_user uuid;balance numeric;spent numeric;sub uuid;p public.billing_payments;attempt uuid:=gen_random_uuid();result jsonb;reference text;amount numeric;
begin
 select owner_id into owner_user from public.organizations where id=p_org for update;
 select * into policy from public.credit_topup_policies where organization_id=p_org for update;
 if policy.organization_id is null or not policy.enabled then return null;end if;
 if not coalesce((public.resolve_organization_contract_access(p_org)->>'allowed')::boolean,false) then return null;end if;
 select greatest(0,balance_credits-reserved_credits) into balance from public.credit_wallets where organization_id=p_org and status='active' for update;
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

create or replace function public.queue_wallet_alert() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' or new.balance_credits is distinct from old.balance_credits or new.reserved_credits is distinct from old.reserved_credits then
    insert into public.wallet_alert_queue(organization_id) values(new.organization_id) on conflict(organization_id) do update set updated_at=now();
    insert into public.wallet_alert_state(organization_id,reference_credits) values(new.organization_id,greatest(new.balance_credits,0)) on conflict(organization_id) do nothing;
    if tg_op='UPDATE' and new.balance_credits>old.balance_credits then
      update public.wallet_alert_state set reference_credits=greatest(reference_credits,new.balance_credits),
        episode=case when new.balance_credits>coalesce(absolute_low_credits,reference_credits*0.2) then gen_random_uuid() else episode end,
        last_level=case when new.balance_credits>coalesce(absolute_low_credits,reference_credits*0.2) then 100 else last_level end,updated_at=now()
        where organization_id=new.organization_id;
    end if;
  end if;
  return new;
end $$;
drop trigger queue_wallet_alert on public.credit_wallets;
create trigger queue_wallet_alert after insert or update of balance_credits,reserved_credits on public.credit_wallets for each row execute function public.queue_wallet_alert();
create or replace function public.claim_wallet_alert(p_org uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.credit_wallets;s public.wallet_alert_state;sub public.organization_subscriptions;ref numeric;level integer;access jsonb;available numeric;
begin
 select * into w from public.credit_wallets where organization_id=p_org for update;
 access:=public.resolve_organization_contract_access(p_org);
 if not coalesce((access->>'allowed')::boolean,false) or access->>'plan_code' in ('trial','internal') then return null; end if;
 select * into sub from public.organization_subscriptions where id=(access->>'subscription_id')::uuid;
 if sub.id is null then return null; end if;
 ref:=coalesce((sub.metadata#>>'{commercial_terms,included_credits}')::numeric,sub.included_credits_granted,0);
 if ref<=0 then select coalesce(max(balance_after_credits),w.balance_credits,0) into ref from public.credit_transactions where organization_id=p_org and amount_credits>0; end if;
 insert into public.wallet_alert_state(organization_id,reference_credits) values(p_org,ref) on conflict do nothing;
 select * into s from public.wallet_alert_state where organization_id=p_org for update;
 ref:=greatest(ref,s.reference_credits);
 available:=greatest(0,w.balance_credits-w.reserved_credits);
 level:=case when available<=0 then 0 when available<=coalesce(s.absolute_critical_credits,ref*0.1) then 10 when available<=coalesce(s.absolute_low_credits,ref*0.2) then 20 else 100 end;
 if level>=s.last_level or level=100 then return null; end if;
 if s.last_notice_at>now()-interval '15 minutes' then return jsonb_build_object('deferred',true,'available_at',s.last_notice_at+interval '15 minutes');end if;
 update public.wallet_alert_state set claimed_until=now()+interval '2 minutes',reference_credits=ref where organization_id=p_org;
 return jsonb_build_object('organization_id',p_org,'subscription_id',sub.id,'episode',s.episode,'level',level,'reference_credits',ref,'balance_credits',available,'plan_code',sub.plan_code,'plan_name',coalesce(sub.metadata#>>'{commercial_terms,name}',sub.plan_code),'amount_brl',coalesce(sub.metadata#>>'{commercial_terms,price_brl}','0'));
end $$;

alter table public.credit_topup_policies add column last_error_code text, add column last_error_at timestamptz;
create function public.clear_reauthorized_topup_error() returns trigger language plpgsql set search_path=public as $$
begin
 if new.authorized_at is distinct from old.authorized_at then new.last_error_code:=null;new.last_error_at:=null;end if;
 return new;
end $$;
create trigger clear_reauthorized_topup_error before update on public.credit_topup_policies for each row execute function public.clear_reauthorized_topup_error();
revoke all on function public.clear_reauthorized_topup_error() from public,anon,authenticated;
