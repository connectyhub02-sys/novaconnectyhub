create table public.billing_payment_fulfillments (
  payment_id uuid primary key references public.billing_payments(id), subscription_id uuid not null references public.organization_subscriptions(id),
  cycle_start timestamptz not null, cycle_end timestamptz not null, credit_transaction_id uuid, bump_credit_transaction_id uuid,
  created_at timestamptz not null default now()
);
alter table public.billing_payment_fulfillments enable row level security;
revoke all on public.billing_payment_fulfillments from anon,authenticated;
grant all on public.billing_payment_fulfillments to service_role;

create or replace function public.fulfill_confirmed_billing_payment(p_payment uuid,p_plan_code text,p_cycle_start timestamptz,p_cycle_end timestamptz,p_metadata jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.billing_payments; s public.organization_subscriptions; o public.organizations; plan public.billing_plans;
  prior public.billing_payment_fulfillments; credits numeric; bumps numeric; credit_id uuid; bump_id uuid; m jsonb; apply_plan boolean;
begin
  select * into o from public.organizations where id=(select organization_id from public.billing_payments where id=p_payment) for update;
  select * into s from public.organization_subscriptions where id=(select subscription_id from public.billing_payments where id=p_payment) for update;
  perform 1 from public.billing_invoices where id=(select invoice_id from public.billing_payments where id=p_payment) for update;
  select * into p from public.billing_payments where id=p_payment for update;
  if p.id is null or s.id is null or p.organization_id<>s.organization_id or p.status<>'approved' then raise exception 'BILLING_PAYMENT_NOT_CONFIRMED'; end if;
  select * into prior from public.billing_payment_fulfillments where payment_id=p.id;
  if found then return to_jsonb(prior)||jsonb_build_object('already_applied',true); end if;
  if p_cycle_end<=p_cycle_start then raise exception 'BILLING_INVALID_PERIOD'; end if;
  if coalesce(p.payload->>'target_plan_code',s.plan_code)<>p_plan_code then raise exception 'BILLING_PLAN_MISMATCH'; end if;
  select * into plan from public.billing_plans where plan_code=p_plan_code;
  if not found then raise exception 'BILLING_PLAN_NOT_FOUND'; end if;
  if s.subscription_kind='plan' then perform public.prepare_trial_conversion(o.id,coalesce(p.paid_at,now())); end if;
  credits:=coalesce((p.payload#>>'{commercial_terms,included_credits}')::numeric,plan.included_credits,0);
  select coalesce(sum(credit_amount),0) into bumps from public.billing_invoice_items where invoice_id=p.invoice_id and item_type<>'plan';
  credit_id:=nullif(p.payload->>'credit_transaction_id','')::uuid;
  bump_id:=nullif(p.payload->>'bump_credit_transaction_id','')::uuid;
  if credit_id is null and credits>0 then credit_id:=public.grant_credit_wallet(o.id,credits,'Créditos do plano '||plan.name,'billing_payment:'||p.id,
    jsonb_build_object('payment_id',p.id,'plan_code',p_plan_code,'credit_policy_version','rollover_v1'),case when s.subscription_kind='product' then 'purchase'::public.credit_transaction_type else 'grant'::public.credit_transaction_type end); end if;
  if bump_id is null and bumps>0 then bump_id:=public.grant_credit_wallet(o.id,bumps,'Créditos adicionais ConnectyHub','billing_payment:'||p.id||':bumps',jsonb_build_object('payment_id',p.id),'purchase'); end if;
  m:=coalesce(p.payload,'{}')||public.lead_archive_safe_json(p_metadata)||jsonb_build_object('credit_transaction_id',credit_id,'bump_credit_transaction_id',bump_id,
    'cycle_start_at',p_cycle_start,'cycle_end_at',p_cycle_end,'last_fulfilled_payment_created_at',p.created_at);
  apply_plan:=p.created_at>=coalesce((s.metadata->>'last_fulfilled_payment_created_at')::timestamptz,'-infinity');
  if apply_plan and s.subscription_kind='plan' then
    update public.organization_subscriptions set status=case when status='paused' then status else 'active' end,
      plan_id=plan.id,plan_code=p_plan_code,billing_provider=p.provider,
      provider_subscription_id=coalesce(m->>'provider_subscription_id',provider_subscription_id),
      current_period_start=p_cycle_start,current_period_end=p_cycle_end,
      next_billing_at=case when m#>>'{commercial_terms,billing_cycle}'='one_time' then null else p_cycle_end end,
      included_credits_granted=credits,metadata=m,updated_at=now() where id=s.id;
    update public.organizations set plan_code=p_plan_code,
      status=case when status in ('trial','trial_expired','trial_pending','active','past_due','expired','payment_pending') then 'active' else status end,updated_at=now() where id=o.id;
    insert into public.billing_cycles(organization_id,subscription_id,plan_id,cycle_start,cycle_end,included_credits,status,metadata)
      select o.id,s.id,plan.id,p_cycle_start,p_cycle_end,credits,'open',jsonb_build_object('payment_id',p.id)
      where not exists(select 1 from public.billing_cycles where organization_id=o.id and cycle_start=p_cycle_start and cycle_end=p_cycle_end);
    update public.billing_cycles set subscription_id=s.id where organization_id=o.id and cycle_start=p_cycle_start and cycle_end=p_cycle_end and subscription_id is null;
    update public.trial_conversion_messages set status='canceled' where organization_id=o.id and status='pending';
  end if;
  if apply_plan and s.subscription_kind='product' then
    update public.organization_subscriptions set status=case when status='paused' then status else 'active' end,
      current_period_start=p_cycle_start,current_period_end=case when m#>>'{commercial_terms,billing_cycle}'='one_time' then null else p_cycle_end end,
      next_billing_at=case when m#>>'{commercial_terms,billing_cycle}'='one_time' then null else p_cycle_end end,
      provider_subscription_id=coalesce(m->>'provider_subscription_id',provider_subscription_id),metadata=m,updated_at=now() where id=s.id;
  end if;
  update public.billing_invoices set status='paid',paid_at=coalesce(p.paid_at,now()),metadata=m,updated_at=now() where id=p.invoice_id;
  update public.billing_payments set payload=m,updated_at=now() where id=p.id;
  perform public.sync_billing_product_entitlements(p.id);
  insert into public.billing_payment_fulfillments(payment_id,subscription_id,cycle_start,cycle_end,credit_transaction_id,bump_credit_transaction_id)
    values(p.id,s.id,p_cycle_start,p_cycle_end,credit_id,bump_id) returning * into prior;
  return to_jsonb(prior)||jsonb_build_object('already_applied',false,'plan_applied',apply_plan);
end $$;
revoke all on function public.fulfill_confirmed_billing_payment(uuid,text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.fulfill_confirmed_billing_payment(uuid,text,timestamptz,timestamptz,jsonb) to service_role;

-- Delayed non-final events cannot erase a confirmed payment or a refund.
create or replace function public.guard_billing_payment_transition() returns trigger
language plpgsql set search_path=public as $$
begin
  if old.status='refunded' and new.status<>'refunded' then return old; end if;
  if old.status='approved' and new.status not in ('approved','refunded') then return old; end if;
  return new;
end $$;
create trigger guard_billing_payment_transition before update of status on public.billing_payments for each row execute function public.guard_billing_payment_transition();
