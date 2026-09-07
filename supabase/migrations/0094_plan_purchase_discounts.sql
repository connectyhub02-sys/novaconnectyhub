-- Catalog promotions do not change the commercial terms of existing contracts.
alter table public.billing_plans
  add column first_purchase_discount_percent numeric(5,2) not null default 0 check (first_purchase_discount_percent >= 0 and first_purchase_discount_percent < 100),
  add column annual_discount_percent numeric(5,2) not null default 0 check (annual_discount_percent >= 0 and annual_discount_percent < 100);

-- A reservation prevents the same buyer using the welcome offer on two companies.
-- Rejected attempts retain the reservation for retries; a cancelled unpaid invoice releases it.
create table public.billing_first_purchase_discounts (
  buyer_user_id uuid primary key references auth.users(id),
  payment_id uuid not null unique references public.billing_payments(id),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.billing_first_purchase_discounts enable row level security;
revoke all on public.billing_first_purchase_discounts from public,anon,authenticated;
grant all on public.billing_first_purchase_discounts to service_role;

create or replace function public.prepare_plan_purchase_discount(p_payment uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.billing_payments; s public.organization_subscriptions; buyer uuid;
  terms jsonb; pricing jsonb; reservation public.billing_first_purchase_discounts;
  list_price numeric; renewal numeric; annual_percent numeric; first_percent numeric;
  applied_first numeric:=0; amount numeric; discount numeric; eligible boolean:=false;
begin
  select * into p from public.billing_payments where id=p_payment;
  if not found then raise exception 'BILLING_NOT_FOUND'; end if;
  select * into s from public.organization_subscriptions where id=p.subscription_id;
  select owner_id into buyer from public.organizations where id=p.organization_id;
  if buyer is null or s.subscription_kind is distinct from 'plan' then raise exception 'BILLING_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended('first_plan_purchase:'||buyer,0));
  perform 1 from public.organization_subscriptions where id=p.subscription_id for update;
  perform 1 from public.billing_invoices where id=p.invoice_id for update;
  select * into p from public.billing_payments where id=p_payment for update;
  if p.payload->'plan_pricing' is not null and p.payload->'plan_pricing'<>'null'::jsonb then
    return jsonb_build_object('amount_brl',p.amount_brl,'pricing',p.payload->'plan_pricing');
  end if;
  if p.payload->>'checkout_kind' is distinct from 'initial' or p.status not in ('pending','rejected') or p.provider_payment_id is not null
    or p.payload->>'pix_creation_pending'='true' or exists(select 1 from public.billing_card_attempts where payment_id=p.id) then
    raise exception 'BILLING_DISCOUNT_CHECKOUT_BUSY';
  end if;
  terms:=p.payload->'commercial_terms';
  renewal:=(terms->>'price_brl')::numeric;
  list_price:=coalesce((terms->>'list_price_brl')::numeric,renewal);
  annual_percent:=coalesce((terms->>'annual_discount_percent')::numeric,0);
  first_percent:=coalesce((terms->>'first_purchase_discount_percent')::numeric,0);
  if renewal is null or renewal<=0 or list_price<renewal or first_percent<0 or first_percent>=100 then raise exception 'BILLING_INVALID_DISCOUNT'; end if;
  if first_percent>annual_percent then
    select * into reservation from public.billing_first_purchase_discounts where buyer_user_id=buyer;
    if reservation.consumed_at is null and (reservation.payment_id is null or reservation.payment_id=p.id
      or exists(select 1 from public.billing_payments where id=reservation.payment_id and status='cancelled' and paid_at is null)) then
      eligible:=not exists(
        select 1 from public.billing_payments previous
        join public.organization_subscriptions subscription on subscription.id=previous.subscription_id
        join public.organizations organization on organization.id=previous.organization_id
        where organization.owner_id=buyer and subscription.subscription_kind='plan'
          and (previous.paid_at is not null or previous.status in ('approved','refunded','charged_back'))
      );
    end if;
  end if;
  if eligible then
    applied_first:=first_percent;
    insert into public.billing_first_purchase_discounts(buyer_user_id,payment_id) values(buyer,p.id)
      on conflict(buyer_user_id) do update set payment_id=excluded.payment_id,created_at=now();
  end if;
  amount:=case when eligible then least(renewal,(round(list_price*100)-round(round(list_price*100)*first_percent/100))/100) else renewal end;
  if amount<0.01 then raise exception 'BILLING_INVALID_DISCOUNT'; end if;
  discount:=list_price-amount;
  pricing:=jsonb_build_object('version',1,'list_price_brl',list_price,'price_brl',amount,'renewal_price_brl',renewal,
    'annual_discount_percent',annual_percent,'first_purchase_discount_percent',applied_first,'discount_brl',discount,'combination','best_discount');
  update public.billing_invoices set subtotal_brl=list_price,discount_brl=discount,total_brl=amount,
    metadata=coalesce(metadata,'{}')||jsonb_build_object('plan_pricing',pricing,'plan_amount_brl',amount,'checkout_total_brl',amount) where id=p.invoice_id;
  update public.billing_invoice_items set unit_price_brl=list_price,total_brl=list_price where invoice_id=p.invoice_id and item_type='plan';
  update public.billing_payments set amount_brl=amount,payload=coalesce(payload,'{}')||jsonb_build_object('plan_pricing',pricing,'plan_amount_brl',amount,'checkout_total_brl',amount) where id=p.id;
  insert into public.platform_customer_journey(user_id,event_key,event_type,source_id,payload)
    values(buyer,'plan_pricing:'||p.id,'plan_pricing',p.id,pricing||jsonb_build_object('subscription_id',s.id,'payment_id',p.id,'billing_interval',terms->'billing_interval','billing_cycle',terms->'billing_cycle'))
    on conflict(event_key) do nothing;
  return jsonb_build_object('amount_brl',amount,'pricing',pricing);
end $$;
revoke all on function public.prepare_plan_purchase_discount(uuid) from public,anon,authenticated;
grant execute on function public.prepare_plan_purchase_discount(uuid) to service_role;

create or replace function public.consume_plan_purchase_discount() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status in ('approved','refunded','charged_back') or new.paid_at is not null then
    update public.billing_first_purchase_discounts set consumed_at=coalesce(consumed_at,now()) where payment_id=new.id;
  end if;
  return new;
end $$;
create trigger consume_plan_purchase_discount after update of status,paid_at on public.billing_payments
  for each row execute function public.consume_plan_purchase_discount();
revoke all on function public.consume_plan_purchase_discount() from public,anon,authenticated;

-- Changing optional extras must preserve the invoice's original promotion.
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
  if p.payload->>'checkout_kind'='renewal' then raise exception 'BILLING_RENEWAL_TERMS_FIXED'; end if;
  if p.payload->>'pix_creation_pending'='true' or (p.payload->>'pix_qr_code' is not null and p.provider_payment_id is not null and p.status in ('pending','in_process')) then raise exception 'BILLING_PIX_PENDING'; end if;
  if exists(select 1 from public.billing_card_attempts where payment_id=p.id and state in ('processing','unknown','pending')) then raise exception 'BILLING_PAYMENT_BUSY'; end if;
  delete from public.billing_invoice_items where invoice_id=p_invoice and organization_id=p_org and metadata->>'source'='dashboard_plan_checkout_bump';
  insert into public.billing_invoice_items(invoice_id,organization_id,item_type,description,quantity,unit_price_brl,total_brl,credit_amount,metadata)
    select p_invoice,p_org,r->>'item_type',r->>'description',1,(r->>'unit_price_brl')::numeric,(r->>'total_brl')::numeric,nullif(r->>'credit_amount','')::numeric,r->'metadata' from jsonb_array_elements(p_items) r;
  update public.organization_subscriptions set metadata=coalesce(metadata,'{}')||jsonb_build_object('pending_checkout_cart',p_metadata) where id=s.id;
  update public.billing_invoices set subtotal_brl=p_amount+coalesce(discount_brl,0),total_brl=p_amount,provider='asaas',metadata=coalesce(metadata,'{}')||p_metadata where id=p_invoice;
  update public.billing_payments set amount_brl=p_amount,provider='asaas',payload=coalesce(payload,'{}')||p_metadata where id=p.id;
end $$;
revoke all on function public.sync_native_billing_cart(uuid,uuid,uuid,uuid,numeric,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sync_native_billing_cart(uuid,uuid,uuid,uuid,numeric,jsonb,jsonb) to service_role;

-- A welcome discount may make the first charge lower than subsequent renewals.
-- Validate the recurring amount against the contract, not against today's charge.
create or replace function public.claim_native_billing_card(p_org uuid,p_payment uuid,p_attempt uuid,p_revision bigint,p_amount numeric,p_recurring numeric,p_reference text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.billing_payments; a public.billing_card_attempts; v_subscription uuid; v_invoice uuid; v_previous text; expected_recurring numeric;
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
  if p.payload#>>'{commercial_terms,billing_cycle}'='one_time' then expected_recurring:=0;
  elsif p.payload#>>'{commercial_terms,price_brl}' is not null then
    expected_recurring:=(p.payload#>>'{commercial_terms,price_brl}')::numeric
      +coalesce((select sum((b->>'price_brl')::numeric) from jsonb_array_elements(coalesce(p.payload->'selected_bumps','[]')) b where b->>'recurrence' in ('weekly','monthly','quarterly','yearly')),0);
  end if;
  if p.checkout_revision<>p_revision or p.amount_brl<>p_amount or p_recurring<0
    or (expected_recurring is not null and p_recurring<>expected_recurring)
    or (expected_recurring is null and p_recurring>p_amount) then raise exception 'BILLING_CHANGED'; end if;
  if (select count(*) from public.billing_card_attempts where payment_id=p.id and created_at>now()-interval '15 minutes')>=5 then raise exception 'BILLING_RATE_LIMIT'; end if;
  insert into public.billing_card_attempts(id,organization_id,subscription_id,invoice_id,payment_id,amount,recurring_amount,external_reference,state,previous_subscription_id)
    values(p_attempt,p_org,p.subscription_id,p.invoice_id,p.id,p_amount,p_recurring,p_reference,'processing',v_previous) returning * into a;
  update public.billing_payments set status='in_process',provider_status='NATIVE_CARD_PROCESSING',payload=coalesce(payload,'{}')||jsonb_build_object('native_card_attempt_id',a.id,'payment_method','card','billing_payment_method','card','pix_qr_code',null,'pix_qr_code_base64',null,'pix_ticket_url',null) where id=p.id;
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',p_org,'billing_payment',p.id,'billing.native_card_attempt_started','Pagamento iniciado no painel','Tentativa de cartão registrada antes do envio ao provedor.','organization',array['billing','payment'],jsonb_build_object('subscription_id',p.subscription_id,'invoice_id',p.invoice_id,'payment_id',p.id,'attempt_id',a.id,'amount',p_amount,'recurring_amount',p_recurring));
  return jsonb_build_object('claimed',true,'attempt',to_jsonb(a));
end $$;
revoke all on function public.claim_native_billing_card(uuid,uuid,uuid,bigint,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.claim_native_billing_card(uuid,uuid,uuid,bigint,numeric,numeric,text) to service_role;
