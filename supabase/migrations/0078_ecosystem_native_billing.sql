-- Operator-authorized ecosystem rollout; provider credentials still determine who receives.
alter table public.billing_payments add column if not exists checkout_revision bigint not null default 0;
create table if not exists public.billing_card_attempts (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  subscription_id uuid not null references public.organization_subscriptions(id),
  invoice_id uuid not null references public.billing_invoices(id),
  payment_id uuid not null references public.billing_payments(id),
  amount numeric(18,2) not null check(amount>0),
  recurring_amount numeric(18,2) not null check(recurring_amount>0),
  external_reference text not null unique,
  state text not null check(state in ('processing','unknown','pending','approved','rejected','error','cancelled','refunded')),
  stage text not null default 'preparing' check(stage in ('preparing','charging','submitted')),
  provider_subscription_id text,
  provider_payment_id text,
  previous_subscription_id text,
  effects_completed_state text,
  effects_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists billing_one_active_card_attempt on public.billing_card_attempts(payment_id) where state in ('processing','unknown','pending');
alter table public.billing_card_attempts enable row level security;
revoke all on public.billing_card_attempts from anon,authenticated;
grant all on public.billing_card_attempts to service_role;

create or replace function public.guard_billing_checkout_change() returns trigger language plpgsql set search_path=public as $$
declare v_invoice uuid;
begin
  if TG_TABLE_NAME='billing_invoice_items' then
    v_invoice:=case when TG_OP='DELETE' then old.invoice_id else new.invoice_id end;
    perform 1 from public.billing_invoices where id=v_invoice for update;
  elsif TG_TABLE_NAME='billing_invoices' then
    if (new.total_brl,new.metadata->'selected_bump_codes') is not distinct from (old.total_brl,old.metadata->'selected_bump_codes') then return new; end if;
    v_invoice:=old.id;
  else
    if (new.amount_brl,new.payload->'selected_bump_codes') is not distinct from (old.amount_brl,old.payload->'selected_bump_codes') then return new; end if;
    v_invoice:=old.invoice_id;
    new.checkout_revision:=old.checkout_revision+1;
  end if;
  if exists(select 1 from public.billing_payments where invoice_id=v_invoice and payload->>'pix_creation_pending'='true') then raise exception 'BILLING_PIX_PENDING'; end if;
  if exists(select 1 from public.billing_card_attempts where invoice_id=v_invoice and state in ('processing','unknown','pending')) then raise exception 'BILLING_PAYMENT_BUSY'; end if;
  if TG_OP='DELETE' then return old; end if; return new;
end $$;
drop trigger if exists guard_billing_card_items on public.billing_invoice_items;
create trigger guard_billing_card_items before insert or update or delete on public.billing_invoice_items for each row execute function public.guard_billing_checkout_change();
drop trigger if exists guard_billing_card_invoice on public.billing_invoices;
create trigger guard_billing_card_invoice before update on public.billing_invoices for each row execute function public.guard_billing_checkout_change();
drop trigger if exists guard_billing_card_payment on public.billing_payments;
create trigger guard_billing_card_payment before update on public.billing_payments for each row execute function public.guard_billing_checkout_change();

create or replace function public.sync_native_billing_cart(p_org uuid,p_subscription uuid,p_invoice uuid,p_payment uuid,p_amount numeric,p_metadata jsonb,p_items jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare s public.organization_subscriptions; p public.billing_payments;
begin
  select * into s from public.organization_subscriptions where id=p_subscription and organization_id=p_org for update;
  if not found then raise exception 'BILLING_NOT_FOUND'; end if;
  perform 1 from public.billing_invoices where id=p_invoice and organization_id=p_org and subscription_id=s.id for update;
  if not found then raise exception 'BILLING_NOT_FOUND'; end if;
  select * into p from public.billing_payments where id=p_payment and invoice_id=p_invoice and subscription_id=s.id and organization_id=p_org for update;
  if not found or p.status not in ('pending','rejected','in_process') or p_amount<=0 then raise exception 'BILLING_NOT_PAYABLE'; end if;
  if p.amount_brl=p_amount and coalesce(p.payload->'selected_bump_codes','[]')=coalesce(p_metadata->'selected_bump_codes','[]') then return; end if;
  if p.payload->>'pix_creation_pending'='true' or (p.payload->>'pix_qr_code' is not null and p.provider_payment_id is not null and p.status in ('pending','in_process')) then raise exception 'BILLING_PIX_PENDING'; end if;
  if exists(select 1 from public.billing_card_attempts where payment_id=p.id and state in ('processing','unknown','pending')) then raise exception 'BILLING_PAYMENT_BUSY'; end if;
  delete from public.billing_invoice_items where invoice_id=p_invoice and organization_id=p_org and metadata->>'source'='dashboard_plan_checkout_bump';
  insert into public.billing_invoice_items(invoice_id,organization_id,item_type,description,quantity,unit_price_brl,total_brl,credit_amount,metadata)
    select p_invoice,p_org,r->>'item_type',r->>'description',1,(r->>'unit_price_brl')::numeric,(r->>'total_brl')::numeric,nullif(r->>'credit_amount','')::numeric,r->'metadata' from jsonb_array_elements(p_items) r;
  update public.organization_subscriptions set billing_provider='asaas',metadata=coalesce(metadata,'{}')||p_metadata where id=s.id;
  update public.billing_invoices set subtotal_brl=p_amount,discount_brl=0,total_brl=p_amount,provider='asaas',metadata=coalesce(metadata,'{}')||p_metadata where id=p_invoice;
  update public.billing_payments set amount_brl=p_amount,provider='asaas',payload=coalesce(payload,'{}')||p_metadata where id=p.id;
end $$;
revoke all on function public.sync_native_billing_cart(uuid,uuid,uuid,uuid,numeric,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sync_native_billing_cart(uuid,uuid,uuid,uuid,numeric,jsonb,jsonb) to service_role;

create or replace function public.claim_native_billing_card(p_org uuid,p_payment uuid,p_attempt uuid,p_revision bigint,p_amount numeric,p_recurring numeric,p_reference text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.billing_payments; a public.billing_card_attempts; v_subscription uuid; v_invoice uuid; v_previous text;
begin
  select subscription_id,invoice_id into v_subscription,v_invoice from public.billing_payments where id=p_payment and organization_id=p_org;
  if not found then raise exception 'BILLING_NOT_FOUND'; end if;
  select provider_subscription_id into v_previous from public.organization_subscriptions where id=v_subscription and organization_id=p_org for update;
  perform 1 from public.billing_invoices where id=v_invoice and organization_id=p_org for update;
  select * into p from public.billing_payments where id=p_payment and organization_id=p_org for update;
  select * into a from public.billing_card_attempts where id=p_attempt;
  if found then
    if a.organization_id<>p_org or a.payment_id<>p.id then raise exception 'BILLING_ATTEMPT_CONFLICT'; end if;
    return jsonb_build_object('claimed',false,'attempt',to_jsonb(a));
  end if;
  select * into a from public.billing_card_attempts where payment_id=p.id and state in ('processing','unknown','pending','approved') order by created_at desc limit 1;
  if found then return jsonb_build_object('claimed',false,'attempt',to_jsonb(a)); end if;
  if p.status not in ('pending','rejected','in_process') then raise exception 'BILLING_NOT_PAYABLE'; end if;
  if p.payload->>'pix_creation_pending'='true' then raise exception 'BILLING_PIX_PENDING'; end if;
  if p.checkout_revision<>p_revision or p.amount_brl<>p_amount or p_recurring<=0 or p_recurring>p_amount then raise exception 'BILLING_CHANGED'; end if;
  if (select count(*) from public.billing_card_attempts where payment_id=p.id and created_at>now()-interval '15 minutes')>=5 then raise exception 'BILLING_RATE_LIMIT'; end if;
  insert into public.billing_card_attempts(id,organization_id,subscription_id,invoice_id,payment_id,amount,recurring_amount,external_reference,state,previous_subscription_id)
    values(p_attempt,p_org,p.subscription_id,p.invoice_id,p.id,p_amount,p_recurring,p_reference,'processing',v_previous) returning * into a;
  update public.billing_payments set status='in_process',provider_status='NATIVE_CARD_PROCESSING',payload=coalesce(payload,'{}')||jsonb_build_object('native_card_attempt_id',a.id,'payment_method','card','billing_payment_method','card','pix_qr_code',null,'pix_qr_code_base64',null,'pix_ticket_url',null) where id=p.id;
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',p_org,'billing_payment',p.id,'billing.native_card_attempt_started','Pagamento iniciado no painel','Tentativa de cartão registrada antes do envio ao provedor.','organization',array['billing','payment'],jsonb_build_object('subscription_id',p.subscription_id,'invoice_id',p.invoice_id,'payment_id',p.id,'attempt_id',a.id,'amount',p_amount));
  return jsonb_build_object('claimed',true,'attempt',to_jsonb(a));
end $$;
revoke all on function public.claim_native_billing_card(uuid,uuid,uuid,bigint,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.claim_native_billing_card(uuid,uuid,uuid,bigint,numeric,numeric,text) to service_role;

create or replace function public.finish_native_billing_card(p_attempt uuid,p_state text,p_provider_payment text default null,p_provider_status text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a public.billing_card_attempts; v_changed boolean;
begin
  if p_state not in ('unknown','pending','approved','rejected','error','cancelled','refunded') then raise exception 'BILLING_INVALID_STATE'; end if;
  select * into a from public.billing_card_attempts where id=p_attempt for update;
  if not found then raise exception 'BILLING_NOT_FOUND'; end if;
  if a.state='refunded' or a.state='approved' and p_state<>'refunded' then return to_jsonb(a); end if;
  v_changed:=a.state<>p_state;
  update public.billing_card_attempts set state=p_state,provider_payment_id=coalesce(p_provider_payment,provider_payment_id),updated_at=now(),effects_completed_state=case when v_changed then null else effects_completed_state end,effects_claimed_at=case when v_changed then null else effects_claimed_at end where id=a.id returning * into a;
  update public.billing_payments set provider_payment_id=coalesce(p_provider_payment,provider_payment_id),provider_status=coalesce(p_provider_status,upper(p_state)),
    status=case when p_state in ('unknown','pending') then 'in_process' when p_state='cancelled' then 'canceled' when p_state='error' then 'rejected' else p_state end,
    paid_at=case when p_state='approved' then coalesce(paid_at,now()) else paid_at end where id=a.payment_id and status<>'refunded' and (status<>'approved' or p_state='refunded');
  if v_changed then insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',a.organization_id,'billing_payment',a.payment_id,'billing.native_card_'||p_state,'Atualização do pagamento no painel','Estado do pagamento: '||p_state,'organization',array['billing','payment'],jsonb_build_object('subscription_id',a.subscription_id,'invoice_id',a.invoice_id,'payment_id',a.payment_id,'attempt_id',a.id,'amount',a.amount,'status',p_state)); end if;
  return to_jsonb(a);
end $$;
revoke all on function public.finish_native_billing_card(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_native_billing_card(uuid,text,text,text) to service_role;

-- Notifications are processed for every outcome, not only approvals/refunds.
create or replace function public.reset_checkout_effects_on_state() returns trigger language plpgsql set search_path=public as $$
begin if new.state is distinct from old.state then new.effects_completed_state:=null; new.effects_claimed_at:=null; end if; return new; end $$;
drop trigger if exists reset_checkout_effects_on_state on public.sales_catalog_card_attempts;
create trigger reset_checkout_effects_on_state before update of state on public.sales_catalog_card_attempts for each row execute function public.reset_checkout_effects_on_state();
create or replace function public.claim_checkout_payment_effects(p_attempt_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a public.sales_catalog_card_attempts;
begin
  update public.sales_catalog_card_attempts set effects_claimed_at=now()
    where id=p_attempt_id and state<>'processing' and effects_completed_state is distinct from state
      and (effects_claimed_at is null or effects_claimed_at<now()-interval '5 minutes') returning * into a;
  if not found then return null; end if; return to_jsonb(a);
end $$;
revoke all on function public.claim_checkout_payment_effects(uuid) from public,anon,authenticated;
grant execute on function public.claim_checkout_payment_effects(uuid) to service_role;

create table if not exists public.billing_native_renewals (
  provider_payment_id text primary key,
  attempt_id uuid not null references public.billing_card_attempts(id),
  invoice_id uuid not null references public.billing_invoices(id),
  payment_id uuid not null references public.billing_payments(id)
);
alter table public.billing_native_renewals enable row level security;
revoke all on public.billing_native_renewals from anon,authenticated;
grant all on public.billing_native_renewals to service_role;
create or replace function public.bind_native_billing_renewal(p_attempt uuid,p_provider_payment text,p_amount numeric) returns text
language plpgsql security definer set search_path=public as $$
declare a public.billing_card_attempts; r public.billing_native_renewals; v_invoice uuid:=gen_random_uuid(); v_payment uuid:=gen_random_uuid(); v_metadata jsonb; v_bumps jsonb; v_reference text;
begin
  select * into a from public.billing_card_attempts where id=p_attempt for update;
  if not found or a.state<>'approved' or a.recurring_amount<>p_amount then raise exception 'BILLING_INVALID_RENEWAL'; end if;
  select * into r from public.billing_native_renewals where provider_payment_id=p_provider_payment;
  if found then
    if r.attempt_id<>a.id then raise exception 'BILLING_REFERENCE_CONFLICT'; end if;
    return 'connectyhub_subscription:'||a.organization_id||':'||a.subscription_id||':'||r.invoice_id||':'||r.payment_id;
  end if;
  perform 1 from public.organization_subscriptions where id=a.subscription_id for update;
  select payload into v_metadata from public.billing_payments where id=a.payment_id;
  select coalesce(jsonb_agg(b),'[]') into v_bumps from jsonb_array_elements(coalesce(v_metadata->'selected_bumps','[]')) b where b->>'recurrence'='monthly';
  v_reference:='connectyhub_subscription:'||a.organization_id||':'||a.subscription_id||':'||v_invoice||':'||v_payment;
  v_metadata:=jsonb_build_object('checkout_kind','renewal','target_plan_code',v_metadata->'target_plan_code','selected_bumps',v_bumps,'selected_bump_codes',(select coalesce(jsonb_agg(b->>'code'),'[]') from jsonb_array_elements(v_bumps) b),'external_reference',v_reference,'checkout_total_brl',p_amount,'checkout_url','/dashboard/planos/checkout/'||a.subscription_id,'native_recurring_attempt_id',a.id);
  insert into public.billing_invoices(id,organization_id,subscription_id,status,subtotal_brl,total_brl,provider,provider_payment_id,metadata) values(v_invoice,a.organization_id,a.subscription_id,'open',p_amount,p_amount,'asaas',p_provider_payment,v_metadata);
  insert into public.billing_invoice_items(invoice_id,organization_id,item_type,description,quantity,unit_price_brl,total_brl,metadata) values(v_invoice,a.organization_id,'plan','Renovação mensal ConnectyHub',1,p_amount,p_amount,jsonb_build_object('native_recurring_attempt_id',a.id));
  insert into public.billing_payments(id,organization_id,subscription_id,invoice_id,provider,provider_payment_id,status,amount_brl,payload) values(v_payment,a.organization_id,a.subscription_id,v_invoice,'asaas',p_provider_payment,'pending',p_amount,v_metadata);
  insert into public.billing_native_renewals values(p_provider_payment,a.id,v_invoice,v_payment);
  return v_reference;
end $$;
revoke all on function public.bind_native_billing_renewal(uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.bind_native_billing_renewal(uuid,text,numeric) to service_role;

-- Shared invoice lock serializes Pix creation with native card claims.
create or replace function public.claim_native_billing_pix(p_org uuid,p_payment uuid) returns void
language plpgsql security definer set search_path=public as $$
declare p public.billing_payments; v_subscription uuid; v_invoice uuid;
begin
 select subscription_id,invoice_id into v_subscription,v_invoice from public.billing_payments where id=p_payment and organization_id=p_org;
 if not found then raise exception 'BILLING_NOT_FOUND'; end if;
 perform 1 from public.organization_subscriptions where id=v_subscription for update;
 perform 1 from public.billing_invoices where id=v_invoice for update;
 select * into p from public.billing_payments where id=p_payment for update;
 if p.status not in ('pending','rejected','in_process') or p.payload->>'pix_creation_pending'='true' or exists(select 1 from public.billing_card_attempts where payment_id=p.id and state in ('processing','unknown','pending','approved')) then raise exception 'BILLING_PAYMENT_BUSY'; end if;
 update public.billing_payments set payload=coalesce(payload,'{}')||jsonb_build_object('pix_creation_pending',true),updated_at=now() where id=p.id;
end $$;
revoke all on function public.claim_native_billing_pix(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_native_billing_pix(uuid,uuid) to service_role;
