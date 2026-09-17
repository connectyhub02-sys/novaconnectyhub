-- Pix Automatic Journey 3. No payment/authorization is created by this migration.
create table public.billing_pix_authorizations (
 id uuid primary key, organization_id uuid not null references public.organizations(id),
 subscription_id uuid not null references public.organization_subscriptions(id),
 invoice_id uuid not null references public.billing_invoices(id), payment_id uuid not null references public.billing_payments(id),
 actor_id uuid not null references auth.users(id), mode text not null check(mode in ('sandbox','production')),
 contract_id text not null unique, amount numeric not null check(amount>0), recurring_amount numeric not null check(recurring_amount>0),
 frequency text not null check(frequency in ('WEEKLY','MONTHLY','QUARTERLY','SEMIANNUALLY','ANNUALLY')), start_date date not null,
 state text not null default 'preparing' check(state in ('preparing','dispatching','unknown','CREATED','ACTIVE','CANCELLED','EXPIRED','REFUSED','failed')),
 customer_id text, provider_id text unique, provider_subscription_id text unique, conciliation_id text unique,
 qr_payload text, qr_image text, qr_expires_at text, initial_provider_payment_id text unique,
 consent_version text not null default 'connectyhub-pix-automatic-v1', error_code text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), checked_at timestamptz,
 activated_at timestamptz, initial_effects_completed boolean not null default false
);
create unique index billing_pix_one_live on public.billing_pix_authorizations(subscription_id) where state in ('preparing','dispatching','unknown','CREATED','ACTIVE');
create table public.billing_pix_events (
 event_id text primary key, authorization_id uuid references public.billing_pix_authorizations(id),
 event_type text not null, resource_id text, resource_status text, completed_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.billing_pix_payments (
 provider_payment_id text primary key, authorization_id uuid not null references public.billing_pix_authorizations(id),
 payment_id uuid not null references public.billing_payments(id), invoice_id uuid not null references public.billing_invoices(id),
 created_at timestamptz not null default now(), cycle_start timestamptz
);
create unique index billing_pix_one_payment_per_cycle on public.billing_pix_payments(authorization_id,cycle_start) where cycle_start is not null;
alter table public.billing_pix_authorizations enable row level security;
alter table public.billing_pix_events enable row level security;
alter table public.billing_pix_payments enable row level security;
revoke all on public.billing_pix_authorizations,public.billing_pix_events,public.billing_pix_payments from public,anon,authenticated;
grant all on public.billing_pix_authorizations,public.billing_pix_events,public.billing_pix_payments to service_role;

create function public.begin_billing_pix_authorization(p_org uuid,p_actor uuid,p_subscription uuid,p_payment uuid,p_request uuid,p_mode text,p_revision bigint,p_amount numeric,p_recurring numeric,p_frequency text,p_start date) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.organization_subscriptions; p public.billing_payments; a public.billing_pix_authorizations; expected numeric;
begin
 perform 1 from public.organizations where id=p_org for update;
 if not exists(select 1 from public.organizations where id=p_org and owner_id=p_actor) and not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and role in ('owner','admin')) then raise exception 'PIX_FORBIDDEN'; end if;
 select * into s from public.organization_subscriptions where id=p_subscription and organization_id=p_org for update;
 if not found then raise exception 'PIX_NOT_FOUND'; end if;
 select * into a from public.billing_pix_authorizations where id=p_request;
 if found then
  if a.organization_id<>p_org or a.subscription_id<>p_subscription or a.actor_id<>p_actor then raise exception 'PIX_CONFLICT'; end if;
  return jsonb_build_object('claimed',false,'authorization',to_jsonb(a));
 end if;
 select * into a from public.billing_pix_authorizations where subscription_id=s.id and state in ('preparing','dispatching','unknown','CREATED','ACTIVE');
 if found then return jsonb_build_object('claimed',false,'authorization',to_jsonb(a)); end if;
 if s.status not in ('pending','incomplete') or s.subscription_kind<>'plan' or s.billing_provider<>'asaas' or s.provider_subscription_id is not null then raise exception 'PIX_INITIAL_ONLY'; end if;
 perform 1 from public.billing_invoices where id=(select invoice_id from public.billing_payments where id=p_payment) for update;
 select * into p from public.billing_payments where id=p_payment and subscription_id=s.id and organization_id=p_org for update;
 if not found or p.provider<>'asaas' or p.status not in ('pending','rejected') or p.provider_payment_id is not null or p.payload->>'pix_creation_pending'='true'
 or exists(select 1 from public.billing_card_attempts where subscription_id=s.id and state in ('processing','unknown','pending','approved')) then raise exception 'PIX_BUSY'; end if;
 if coalesce(p.payload->>'checkout_kind','initial')<>'initial' or coalesce(p.payload#>>'{commercial_terms,billing_cycle}','recurring')<>'recurring' then raise exception 'PIX_INITIAL_ONLY'; end if;
 expected:=coalesce((p.payload#>>'{campaign_pricing,next_price_brl}')::numeric,(p.payload#>>'{commercial_terms,price_brl}')::numeric)
  +coalesce((select sum((b->>'price_brl')::numeric) from jsonb_array_elements(coalesce(p.payload->'selected_bumps','[]')) b where b->>'recurrence' in ('weekly','monthly','quarterly','yearly')),0);
 if expected is null or expected<>p_recurring or p.checkout_revision<>p_revision or p.amount_brl<>p_amount or p_start<=current_date then raise exception 'PIX_CHANGED'; end if;
 if (select count(*) from public.billing_pix_authorizations where subscription_id=s.id and created_at>now()-interval '1 hour')>=5 then raise exception 'PIX_RATE_LIMIT'; end if;
 insert into public.billing_pix_authorizations(id,organization_id,subscription_id,invoice_id,payment_id,actor_id,mode,contract_id,amount,recurring_amount,frequency,start_date)
 values(p_request,p_org,s.id,p.invoice_id,p.id,p_actor,p_mode,replace(p_request::text,'-',''),p_amount,p_recurring,p_frequency,p_start) returning * into a;
 update public.billing_payments set payload=coalesce(payload,'{}')||jsonb_build_object('pix_creation_pending',true,'pix_automatic_authorization_id',a.id,'payment_method','pix_automatic','billing_payment_method','pix_automatic'),updated_at=now() where id=p.id;
 insert into public.billing_pix_events(event_id,authorization_id,event_type,resource_status,completed_at) values('request:'||a.id,a.id,'authorization_requested','preparing',now());
 return jsonb_build_object('claimed',true,'authorization',to_jsonb(a));
end $$;

create function public.sync_billing_pix_authorization(p_id uuid,p_remote jsonb,p_failure text default null) returns jsonb
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
 -- Keep the checkout locked until payment is bound or a definitive refusal.
 if next_state in ('failed','REFUSED') then
  update public.billing_payments set payload=payload||'{"pix_creation_pending":false}'::jsonb where id=a.payment_id and status<>'approved';
 end if;
 insert into public.billing_pix_events(event_id,authorization_id,event_type,resource_status,completed_at) values('state:'||a.id||':'||next_state,a.id,'authorization_state',next_state,now()) on conflict do nothing;
 return to_jsonb(a);
end $$;

create function public.bind_billing_pix_payment(p_authorization uuid,p_provider_payment text,p_amount numeric,p_initial boolean,p_start timestamptz,p_end timestamptz) returns text
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
  if a.state<>'ACTIVE' or p_amount<>a.amount or a.initial_provider_payment_id is not null or nullif(a.provider_subscription_id,'') is null then raise exception 'PIX_NOT_ACTIVE'; end if;
  select * into pay from public.billing_payments where id=a.payment_id for update;
  if pay.status='approved' or pay.amount_brl<>p_amount or pay.provider_payment_id is not null then raise exception 'PIX_CONFLICT'; end if;
  update public.billing_pix_authorizations set initial_provider_payment_id=p_provider_payment,activated_at=now() where id=a.id;
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
revoke all on function public.begin_billing_pix_authorization(uuid,uuid,uuid,uuid,uuid,text,bigint,numeric,numeric,text,date),public.sync_billing_pix_authorization(uuid,jsonb,text),public.bind_billing_pix_payment(uuid,text,numeric,boolean,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.begin_billing_pix_authorization(uuid,uuid,uuid,uuid,uuid,text,bigint,numeric,numeric,text,date),public.sync_billing_pix_authorization(uuid,jsonb,text),public.bind_billing_pix_payment(uuid,text,numeric,boolean,timestamptz,timestamptz) to service_role;

-- A definitive mandate refusal may be followed by a manual Pix checkout.
-- Clear its old mandate pointer in the SAME invoice lock as the manual claim,
-- so the existing timeout-recovery worker can reconcile that manual payment.
alter function public.claim_native_billing_pix(uuid,uuid) rename to claim_native_billing_pix_before_automatic;
create function public.claim_native_billing_pix(p_org uuid,p_payment uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 perform public.claim_native_billing_pix_before_automatic(p_org,p_payment);
 update public.billing_payments set payload=(payload-'pix_automatic_authorization_id')||jsonb_build_object('payment_method','pix','billing_payment_method','pix') where id=p_payment and organization_id=p_org;
end $$;
revoke all on function public.claim_native_billing_pix(uuid,uuid),public.claim_native_billing_pix_before_automatic(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_native_billing_pix(uuid,uuid) to service_role;
