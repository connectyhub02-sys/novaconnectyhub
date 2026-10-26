-- A received initial payment does not depend on consent for future payments.
alter table public.billing_pix_authorizations add column initial_payment_absent boolean not null default false;
alter table public.billing_pix_authorizations add column initial_payment_refunded boolean not null default false;
create or replace function public.sync_billing_pix_authorization(p_id uuid,p_remote jsonb,p_failure text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a public.billing_pix_authorizations; next_state text;
begin
 perform 1 from public.organizations where id=(select organization_id from public.billing_pix_authorizations where id=p_id) for update;
 perform 1 from public.organization_subscriptions where id=(select subscription_id from public.billing_pix_authorizations where id=p_id) for update;
 select * into a from public.billing_pix_authorizations where id=p_id for update;
 if not found then raise exception 'PIX_NOT_FOUND'; end if;
 next_state:=case when p_failure='provider_rejected' then 'failed' when p_failure is not null then 'unknown' else p_remote->>'status' end;
 if next_state not in ('unknown','failed','CREATED','ACTIVE','CANCELLED','EXPIRED','REFUSED') then raise exception 'PIX_INVALID_STATE'; end if;
 if a.state in ('CANCELLED','EXPIRED','REFUSED','failed') or (a.state='ACTIVE' and next_state in ('CREATED','unknown','failed')) then return to_jsonb(a); end if;
 if p_failure is null then
  if p_remote->>'contractId' is distinct from a.contract_id or p_remote->>'customerId' is distinct from a.customer_id or (p_remote->>'value')::numeric is distinct from a.recurring_amount
   or p_remote->>'frequency' is distinct from a.frequency or p_remote->>'paymentCreationMode'<>'SUBSCRIPTION' or (p_remote->>'startDate')::date is distinct from a.start_date
   or nullif(p_remote->>'id','') is null or (a.provider_id is not null and a.provider_id<>p_remote->>'id') then raise exception 'PIX_MISMATCH'; end if;
  if next_state='ACTIVE' and nullif(p_remote->>'subscriptionId','') is null then raise exception 'PIX_MISMATCH'; end if;
 end if;
 update public.billing_pix_authorizations set state=next_state,
  provider_id=coalesce(nullif(p_remote->>'id',''),provider_id),provider_subscription_id=coalesce(nullif(p_remote->>'subscriptionId',''),provider_subscription_id),
  conciliation_id=coalesce(nullif(p_remote->>'conciliationIdentifier',''),conciliation_id),
  qr_payload=case when next_state in ('ACTIVE','CANCELLED','EXPIRED','REFUSED','failed') then null else coalesce(nullif(p_remote->>'payload',''),qr_payload) end,
  qr_image=case when next_state in ('ACTIVE','CANCELLED','EXPIRED','REFUSED','failed') then null else coalesce(nullif(p_remote->>'encodedImage',''),qr_image) end,
  qr_expires_at=coalesce(nullif(p_remote->>'expirationDate',''),qr_expires_at), error_code=p_failure,updated_at=now(),checked_at=now() where id=a.id returning * into a;
 -- Activation can arrive after the initial payment was already fulfilled.
 if next_state='ACTIVE' and a.initial_provider_payment_id is not null then
   update public.organization_subscriptions set provider_subscription_id=a.provider_subscription_id,
     metadata=coalesce(metadata,'{}')||jsonb_build_object('pix_automatic_authorization_id',a.id)
     where id=a.subscription_id;
   update public.billing_pix_authorizations set activated_at=coalesce(activated_at,now()) where id=a.id;
 end if;
 -- REFUSED may still have a received initial Pix. Reconcile it before unlocking.
 if next_state='failed' then
  update public.billing_payments set payload=payload||'{"pix_creation_pending":false}'::jsonb where id=a.payment_id and status<>'approved';
 end if;
 insert into public.billing_pix_events(event_id,authorization_id,event_type,resource_status,completed_at) values('state:'||a.id||':'||next_state,a.id,'authorization_state',next_state,now()) on conflict do nothing;
 return to_jsonb(a);
end $$;

create or replace function public.bind_billing_pix_payment(p_authorization uuid,p_provider_payment text,p_amount numeric,p_initial boolean,p_start timestamptz,p_end timestamptz) returns text
language plpgsql security definer set search_path=public as $$
declare a public.billing_pix_authorizations; s public.organization_subscriptions; bound public.billing_pix_payments; pay public.billing_payments;
 inv uuid:=gen_random_uuid(); payment_key uuid:=gen_random_uuid(); m jsonb; bumps jsonb; bump jsonb; plan_amount numeric;
begin
 perform 1 from public.organizations where id=(select organization_id from public.billing_pix_authorizations where id=p_authorization) for update;
 select * into s from public.organization_subscriptions where id=(select subscription_id from public.billing_pix_authorizations where id=p_authorization) for update;
 select * into a from public.billing_pix_authorizations where id=p_authorization for update;
 if not found then raise exception 'PIX_NOT_FOUND'; end if;
 select * into bound from public.billing_pix_payments where provider_payment_id=p_provider_payment;
 if found then
  if bound.authorization_id<>a.id then raise exception 'PIX_CONFLICT'; end if;
  return 'connectyhub_subscription:'||a.organization_id||':'||a.subscription_id||':'||bound.invoice_id||':'||bound.payment_id;
 end if;
 if p_initial then
  if a.state not in ('CREATED','ACTIVE','REFUSED','CANCELLED','EXPIRED') or p_amount<>a.amount or a.initial_provider_payment_id is not null or a.provider_id is null or a.conciliation_id is null then raise exception 'PIX_NOT_ACTIVE'; end if;
  select * into pay from public.billing_payments where id=a.payment_id for update;
  if pay.status='approved' or pay.amount_brl<>p_amount or pay.provider_payment_id is not null then raise exception 'PIX_CONFLICT'; end if;
  update public.billing_pix_authorizations set initial_provider_payment_id=p_provider_payment,initial_payment_absent=false,activated_at=case when state='ACTIVE' then now() else activated_at end where id=a.id;
  update public.organization_subscriptions set provider_subscription_id=a.provider_subscription_id,metadata=coalesce(metadata,'{}')||jsonb_build_object('pix_automatic_authorization_id',a.id) where id=s.id;
 else
  if a.initial_provider_payment_id is null or a.state not in ('ACTIVE','CANCELLED','EXPIRED') or p_amount<>a.recurring_amount or p_start is null or p_end<=p_start
   or (s.current_period_end at time zone 'America/Sao_Paulo')::date is distinct from (p_start at time zone 'America/Sao_Paulo')::date then raise exception 'PIX_INVALID_RENEWAL'; end if;
  select payload into m from public.billing_payments where id=a.payment_id;
  select coalesce(jsonb_agg(b),'[]') into bumps from jsonb_array_elements(coalesce(m->'selected_bumps','[]')) b where b->>'recurrence' in ('monthly','weekly','quarterly','yearly');
  plan_amount:=p_amount-coalesce((select sum((b->>'price_brl')::numeric) from jsonb_array_elements(bumps) b),0);
  if plan_amount<=0 then raise exception 'PIX_INVALID_RENEWAL'; end if;
  m:=jsonb_build_object('purchase_kind','plan','commercial_terms',m->'commercial_terms','checkout_kind','renewal','target_plan_code',s.plan_code,
   'selected_bumps',bumps,'selected_bump_codes',(select coalesce(jsonb_agg(b->>'code'),'[]') from jsonb_array_elements(bumps) b),
   'checkout_total_brl',p_amount,'plan_amount_brl',plan_amount,'cycle_start_at',p_start,'cycle_end_at',p_end,'previous_current_period_end',s.current_period_end,
   'pix_automatic_authorization_id',a.id,'payment_method','pix_automatic','billing_payment_method','pix_automatic');
  insert into public.billing_invoices(id,organization_id,subscription_id,status,subtotal_brl,total_brl,provider,provider_payment_id,metadata)
   values(inv,a.organization_id,s.id,'open',p_amount,p_amount,'asaas',p_provider_payment,m);
  insert into public.billing_invoice_items(invoice_id,organization_id,item_type,description,quantity,unit_price_brl,total_brl,metadata)
   values(inv,a.organization_id,'plan','Renovação ConnectyHub',1,plan_amount,plan_amount,jsonb_build_object('recurrence','recurring'));
  for bump in select * from jsonb_array_elements(bumps) loop
   insert into public.billing_invoice_items(invoice_id,organization_id,item_type,description,quantity,unit_price_brl,total_brl,credit_amount,metadata)
    values(inv,a.organization_id,coalesce(bump->>'item_type','adjustment'),coalesce(bump->>'title','Adicional ConnectyHub'),1,(bump->>'price_brl')::numeric,(bump->>'price_brl')::numeric,coalesce((bump->>'credit_amount')::numeric,0),jsonb_build_object('platform_product_id',bump->'platform_product_id','recurrence',bump->'recurrence','bump',bump));
  end loop;
  insert into public.billing_payments(id,organization_id,subscription_id,invoice_id,status,provider,amount_brl,payload)
   values(payment_key,a.organization_id,s.id,inv,'pending','asaas',p_amount,m) returning * into pay;
 end if;
 insert into public.billing_pix_payments(provider_payment_id,authorization_id,payment_id,invoice_id,cycle_start) values(p_provider_payment,a.id,pay.id,pay.invoice_id,case when p_initial then null else p_start end);
 update public.billing_payments set provider_payment_id=p_provider_payment,payload=payload||jsonb_build_object('pix_creation_pending',false,'pix_automatic_authorization_id',a.id,'payment_method','pix_automatic','billing_payment_method','pix_automatic') where id=pay.id;
 return 'connectyhub_subscription:'||a.organization_id||':'||a.subscription_id||':'||pay.invoice_id||':'||pay.id;
end $$;

-- Called by the service only after a fresh provider GET and a complete payment scan.
create function public.confirm_billing_pix_initial_absent(p_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a public.billing_pix_authorizations;
begin
 perform 1 from public.organizations where id=(select organization_id from public.billing_pix_authorizations where id=p_id) for update;
 perform 1 from public.organization_subscriptions where id=(select subscription_id from public.billing_pix_authorizations where id=p_id) for update;
 select * into a from public.billing_pix_authorizations where id=p_id for update;
 if a.id is null or a.state<>'REFUSED' or a.initial_provider_payment_id is not null or a.initial_effects_completed then raise exception 'PIX_PAYMENT_CHECK_REQUIRED'; end if;
 update public.billing_pix_authorizations set initial_payment_absent=true,checked_at=now() where id=a.id returning * into a;
 update public.billing_payments set payload=payload||'{"pix_creation_pending":false}'::jsonb
 where id=a.payment_id and status not in ('approved','refunded') and provider_payment_id is null and payload->>'pix_automatic_authorization_id'=a.id::text;
 return to_jsonb(a);
end $$;
revoke all on function public.confirm_billing_pix_initial_absent(uuid) from public,anon,authenticated;
grant execute on function public.confirm_billing_pix_initial_absent(uuid) to service_role;
