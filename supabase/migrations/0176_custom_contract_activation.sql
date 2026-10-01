-- Administrative release of negotiated terms is distinct from payment confirmation.
create table public.custom_contract_activations (
  contract_id uuid primary key references public.organization_custom_contracts(id),
  organization_id uuid not null references public.organizations(id),
  subscription_id uuid not null references public.organization_subscriptions(id),
  actor_id uuid not null references auth.users(id),
  activated_at timestamptz not null default now(),
  cycle_start timestamptz not null,
  cycle_end timestamptz not null,
  credits_granted numeric not null check (credits_granted>=0),
  credit_transaction_id uuid,
  payment_id uuid references public.billing_payments(id)
);
alter table public.custom_contract_activations enable row level security;
revoke all on public.custom_contract_activations from public,anon,authenticated;
grant select,insert on public.custom_contract_activations to service_role;

create function public.activate_custom_contract(p_organization uuid,p_contract uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.organization_custom_contracts; o public.organizations; s public.organization_subscriptions;
  plan public.billing_plans; prior public.custom_contract_activations; terms jsonb; m jsonb; invoice jsonb; pending public.billing_payments;
  starts timestamptz; ends timestamptz; credits numeric; granted numeric:=0; tx uuid; updating boolean;
begin
  if not exists(select 1 from public.profiles where id=p_actor and is_platform_admin) then raise exception 'ADMIN_REQUIRED'; end if;
  select * into o from public.organizations where id=p_organization for update;
  if not found or (o.billing_organization_id is not null and o.billing_organization_id<>o.id) then raise exception 'BILLING_ACCOUNT_REQUIRED'; end if;
  if o.plan_code='internal' or o.status in ('suspended','paused','blocked','inactive','archived') then raise exception 'ACCOUNT_SUSPENDED'; end if;
  select * into c from public.organization_custom_contracts where id=p_contract and organization_id=o.id;
  if not found then raise exception 'CONTRACT_NOT_FOUND'; end if;
  select * into prior from public.custom_contract_activations where contract_id=c.id;
  if found then return to_jsonb(prior)||jsonb_build_object('already_applied',true); end if;
  if c.effective_at>now() then raise exception 'CONTRACT_NOT_EFFECTIVE'; end if;
  if c.id is distinct from (select id from public.organization_custom_contracts where organization_id=o.id and effective_at<=now() order by effective_at desc,version desc limit 1) then raise exception 'CONTRACT_VERSION_CHANGED'; end if;
  select * into plan from public.billing_plans where plan_code=c.base_plan_code and status='active';
  if not found then raise exception 'PLAN_UNAVAILABLE'; end if;
  select * into s from public.organization_subscriptions where organization_id=o.id and subscription_kind='plan'
    and status in ('pending','active','past_due','incomplete','paused') order by created_at desc limit 1 for update;
  if s.status='paused' then raise exception 'ACCOUNT_SUSPENDED'; end if;
  if s.provider_subscription_id is not null then raise exception 'PROVIDER_SUBSCRIPTION_REVIEW_REQUIRED'; end if;
  if exists(select 1 from public.billing_card_attempts where subscription_id=s.id and state in ('processing','pending','unknown')) then raise exception 'PAYMENT_IN_PROGRESS'; end if;
  updating:=s.metadata#>>'{commercial_terms,custom_contract_id}' is not null and s.current_period_end>now() and s.status='active';
  if updating then
    starts:=s.current_period_start; ends:=s.current_period_end;
    granted:=coalesce(s.included_credits_granted,0);
  else
    starts:=now(); ends:=c.first_period_end;
    if ends<=starts then raise exception 'CONTRACT_DEADLINE_EXPIRED'; end if;
    perform public.prepare_trial_conversion(o.id,now());
  end if;
  credits:=greatest(c.included_credits-granted,0);
  -- An unpaid local invoice can be replaced, never rewritten. An invoice already
  -- sent to a provider requires reconciliation before changing the contract.
  for pending in select * from public.billing_payments where subscription_id=s.id
    and payload->>'checkout_kind'='renewal' and (payload->>'previous_current_period_end')::timestamptz=ends
    and status in ('pending','in_process','rejected') for update
  loop
    if pending.provider_payment_id is not null or pending.status='in_process'
      or pending.payload->>'pix_creation_pending'='true' or pending.payload->>'pix_qr_code' is not null
      or exists(select 1 from public.billing_card_attempts where payment_id=pending.id and state in ('processing','pending','unknown','approved'))
      then raise exception 'PENDING_INVOICE_REVIEW_REQUIRED'; end if;
    update public.billing_payments set status='canceled',payload=payload||jsonb_build_object('checkout_status','replaced_by_contract_activation','replaced_by_contract_id',c.id,'replaced_at',now()),updated_at=now() where id=pending.id;
    update public.billing_invoices set status='void',metadata=metadata||jsonb_build_object('replaced_by_contract_id',c.id,'replaced_at',now()),updated_at=now() where id=pending.invoice_id;
  end loop;
  terms:=jsonb_build_object('billing_cycle','recurring','billing_interval','month','access_duration_days',null,
    'price_brl',c.monthly_price_brl,'list_price_brl',c.monthly_price_brl,'first_purchase_discount_percent',0,'annual_discount_percent',0,
    'included_credits',c.included_credits,'custom_contract_id',c.id,'custom_contract_version',c.version,'name',c.name,
    'features',c.features,'resource_limits',c.resource_limits,'development_scope',c.development_scope);
  -- The previous payment's IDs/credentials are not identities for a new cycle.
  -- Financial history remains on its invoice and payment, not this active snapshot.
  m:=jsonb_build_object('source','admin_custom_contract_activation','manual_activation',true,'auto_charge_disabled',true,
      'actor_id',p_actor,'custom_contract_activated_at',now(),'commercial_terms',terms,
      'last_fulfilled_payment_created_at',now(),'purchase_kind','plan','target_plan_code',c.base_plan_code,'requested_plan_code',c.base_plan_code);
  if s.id is null then
    insert into public.organization_subscriptions(organization_id,plan_id,plan_code,status,billing_provider,current_period_start,current_period_end,next_billing_at,included_credits_granted,metadata)
      values(o.id,plan.id,c.base_plan_code,'active','asaas',starts,ends,ends,greatest(granted,c.included_credits),m) returning * into s;
  else
    update public.organization_subscriptions set plan_id=plan.id,plan_code=c.base_plan_code,status='active',billing_provider='asaas',
      current_period_start=starts,current_period_end=ends,next_billing_at=ends,included_credits_granted=greatest(granted,c.included_credits),metadata=m,updated_at=now()
      where id=s.id returning * into s;
  end if;
  update public.organizations set plan_code=c.base_plan_code,status='active',updated_at=now() where id=o.id;
  insert into public.organization_billing_limits(organization_id,allow_overage,overage_limit_credits,hard_block_when_empty,alert_threshold_percent)
    values(o.id,false,0,true,80) on conflict(organization_id) do nothing;
  if credits>0 then
    tx:=public.grant_credit_wallet(o.id,credits,'Franquia liberada administrativamente: '||c.name,'custom_contract_activation:'||c.id,
      jsonb_build_object('source','admin_custom_contract_activation','contract_id',c.id,'subscription_id',s.id,'actor_id',p_actor,'credit_policy_version','rollover_v1'),'grant');
  end if;
  if updating then
    update public.billing_cycles set included_credits=greatest(included_credits,c.included_credits),metadata=metadata||jsonb_build_object('custom_contract_id',c.id)
      where subscription_id=s.id and cycle_start=starts and cycle_end=ends;
  else
    insert into public.billing_cycles(organization_id,subscription_id,plan_id,cycle_start,cycle_end,included_credits,status,metadata)
      values(o.id,s.id,plan.id,starts,ends,c.included_credits,'open',jsonb_build_object('custom_contract_id',c.id,'source','admin_custom_contract_activation','payment_pending',true));
  end if;
  -- Local invoice only. No provider request, card debit or payment confirmation.
  -- Retired local invoices retain their immutable terms in history.
  invoice:=public.prepare_contract_renewal(s.id,ends,ends,ends+interval '1 month','asaas',jsonb_build_object('auto_charge_disabled',true,'source','admin_custom_contract_activation'));
  if not coalesce((invoice->>'reused')::boolean,false) then
    update public.billing_invoices set due_at=ends where id=(invoice->>'invoice_id')::uuid;
  end if;
  update public.trial_conversion_messages set status='canceled' where organization_id=o.id and status='pending';
  insert into public.custom_contract_activations(contract_id,organization_id,subscription_id,actor_id,cycle_start,cycle_end,credits_granted,credit_transaction_id,payment_id)
    values(c.id,o.id,s.id,p_actor,starts,ends,credits,tx,(invoice->>'payment_id')::uuid) returning * into prior;
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',o.id,'custom_contract',c.id,'billing.custom_contract_activated','Contrato personalizado ativado',
      'Acesso e franquia liberados administrativamente. Pagamento permanece pendente.','organization',array['billing','custom_contract'],to_jsonb(prior));
  return to_jsonb(prior)||jsonb_build_object('already_applied',false,'invoice_reused',invoice->'reused');
end $$;
revoke all on function public.activate_custom_contract(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.activate_custom_contract(uuid,uuid,uuid) to service_role;

-- Renewal metadata is derived from the subscription. A prior payment's credit
-- transaction must never suppress the new invoice's own idempotent grant.
create function public.fresh_custom_contract_payment() returns trigger language plpgsql set search_path=public as $$
begin
  if new.payload#>>'{commercial_terms,custom_contract_id}' is not null then
    new.payload:=new.payload-'credit_transaction_id'-'bump_credit_transaction_id';
  end if;
  return new;
end $$;
create trigger zzz_fresh_custom_contract_payment before insert on public.billing_payments
for each row execute function public.fresh_custom_contract_payment();
revoke all on function public.fresh_custom_contract_payment() from public,anon,authenticated;
