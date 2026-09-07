-- Compute campaign prices before exposing a renewal invoice to any worker.
alter function public.prepare_contract_renewal(uuid,timestamptz,timestamptz,timestamptz,text,jsonb) rename to prepare_contract_renewal_before_campaigns;
create function public.prepare_contract_renewal(p_subscription uuid,p_expected_end timestamptz,p_start timestamptz,p_end timestamptz,p_provider text,p_metadata jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb; a public.commercial_agreements;
begin
 result:=public.prepare_contract_renewal_before_campaigns(p_subscription,p_expected_end,p_start,p_end,p_provider,p_metadata);
 select * into a from public.commercial_agreements where platform_subscription_id=p_subscription and state='active'
  and target_id=(select coalesce(metadata->>'purchase_product_id',plan_code) from public.organization_subscriptions where id=p_subscription) order by created_at desc limit 1;
 if a.id is not null and not exists(select 1 from public.commercial_agreement_periods where platform_payment_id=(result->>'payment_id')::uuid) then
  update public.billing_payments set payload=payload-'campaign_pricing'-'campaign_selection'-'plan_pricing' where id=(result->>'payment_id')::uuid;
  perform public.apply_platform_campaign_period(a.id,(result->>'payment_id')::uuid,a.paid_cycles);
 end if;
 return result;
end $$;
revoke all on function public.prepare_contract_renewal(uuid,timestamptz,timestamptz,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_contract_renewal(uuid,timestamptz,timestamptz,timestamptz,text,jsonb) to service_role;

-- An explicitly selected period must also change the period delivered by this invoice.
create or replace function public.stamp_campaign_period() returns trigger language plpgsql set search_path=public as $$
declare start_at timestamptz; months integer; days integer; pricing jsonb;
begin
 pricing:=new.payload->'campaign_pricing';
 if pricing is null or pricing='null'::jsonb or pricing is not distinct from old.payload->'campaign_pricing' then return new; end if;
 start_at:=coalesce((new.payload->>'cycle_start_at')::timestamptz,now());
 months:=case pricing->>'interval' when 'year' then 12 when 'semester' then 6 when 'quarter' then 3 when 'month' then 1 else 0 end;
 days:=case pricing->>'interval' when 'week' then 7 else 0 end;
 new.payload:=new.payload||jsonb_build_object('cycle_start_at',start_at,'cycle_end_at',start_at+make_interval(months=>months,days=>days));
 return new;
end $$;
create trigger stamp_campaign_period before update of payload on public.billing_payments for each row execute function public.stamp_campaign_period();
revoke all on function public.stamp_campaign_period() from public,anon,authenticated;

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
    expected_recurring:=coalesce((p.payload#>>'{campaign_pricing,next_price_brl}')::numeric,(p.payload#>>'{commercial_terms,price_brl}')::numeric)
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

create or replace function public.claim_managed_asaas_renewal(p_subscription uuid,p_payment uuid,p_attempt uuid,p_method uuid,p_expected_end timestamptz,p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.organization_subscriptions; p public.billing_payments; day date:=(p_now at time zone 'America/Sao_Paulo')::date; days integer; result jsonb;
begin
  perform 1 from public.organizations where id=(select organization_id from public.organization_subscriptions where id=p_subscription) for update;
  select * into s from public.organization_subscriptions where id=p_subscription for update;
  if not found or s.status<>'active' or s.current_period_end is distinct from p_expected_end or s.billing_provider<>'asaas'
    or s.provider_subscription_id is not null or s.metadata#>>'{commercial_terms,billing_cycle}'='one_time' then return null; end if;
  days:=(s.current_period_end at time zone 'America/Sao_Paulo')::date-day;
  if days not between 1 and 3 or extract(hour from p_now at time zone 'America/Sao_Paulo')<9 or p_now>=s.current_period_end then return null; end if;
  if not exists(select 1 from public.billing_asaas_card_vault where id=p_method and organization_id=s.organization_id and subscription_id=s.id and status='active') then return null; end if;
  if exists(select 1 from public.billing_card_attempts where subscription_id=s.id and automatic_period_end=p_expected_end and automatic_day=day) then return null; end if;
  select * into p from public.billing_payments where id=p_payment and subscription_id=s.id and organization_id=s.organization_id;
  if not found or p.provider<>'asaas' or p.payload->>'checkout_kind'<>'renewal'
    or (p.payload->>'previous_current_period_end')::timestamptz is distinct from p_expected_end or p.payload->>'auto_charge_disabled'='true'
    or p.payload->>'pix_creation_pending'='true' or p.payload->>'pix_qr_code' is not null then return null; end if;
  if exists(select 1 from public.billing_card_attempts where payment_id=p.id and state in ('processing','unknown','pending','approved')) then return null; end if;
  result:=public.claim_native_billing_card(s.organization_id,p.id,p_attempt,p.checkout_revision,p.amount_brl,coalesce((p.payload#>>'{campaign_pricing,next_price_brl}')::numeric,(p.payload#>>'{commercial_terms,price_brl}')::numeric)+(select coalesce(sum(total_brl),0) from public.billing_invoice_items where invoice_id=p.invoice_id and item_type<>'plan' and metadata->>'recurrence'<>'one_time'),'billing_card:'||p_attempt);
  if coalesce((result->>'claimed')::boolean,false) then
    update public.billing_card_attempts set automatic_day=day,automatic_period_end=p_expected_end,managed_renewal=true where id=p_attempt;
    update public.billing_payments set payload=payload||jsonb_build_object('managed_external_reference','billing_managed:'||p.id,'asaas_customer_id',(select customer_id from public.billing_asaas_card_vault where id=p_method)) where id=p.id;
    select jsonb_build_object('claimed',true,'attempt',to_jsonb(a)) into result from public.billing_card_attempts a where a.id=p_attempt;
  end if;
  return result;
end $$;
revoke all on function public.claim_managed_asaas_renewal(uuid,uuid,uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_managed_asaas_renewal(uuid,uuid,uuid,uuid,timestamptz,timestamptz) to service_role;
