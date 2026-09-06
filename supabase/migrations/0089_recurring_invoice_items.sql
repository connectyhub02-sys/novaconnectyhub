create or replace function public.bind_native_billing_renewal(p_attempt uuid,p_provider_payment text,p_amount numeric,p_start timestamptz,p_end timestamptz) returns text
language plpgsql security definer set search_path=public as $$
declare a public.billing_card_attempts; r public.billing_native_renewals; s public.organization_subscriptions;
  v_invoice uuid:=gen_random_uuid(); v_payment uuid:=gen_random_uuid(); m jsonb; bumps jsonb; bump jsonb;
  ref text; start_at timestamptz; end_at timestamptz; plan_amount numeric;
begin
  perform 1 from public.organizations where id=(select organization_id from public.billing_card_attempts where id=p_attempt) for update;
  select * into s from public.organization_subscriptions where id=(select subscription_id from public.billing_card_attempts where id=p_attempt) for update;
  select * into a from public.billing_card_attempts where id=p_attempt for update;
  if not found or a.state<>'approved' or a.recurring_amount<>p_amount or p_amount<=0 then raise exception 'BILLING_INVALID_RENEWAL'; end if;
  select * into r from public.billing_native_renewals where provider_payment_id=p_provider_payment;
  if found then
    if r.attempt_id<>a.id then raise exception 'BILLING_REFERENCE_CONFLICT'; end if;
    return 'connectyhub_subscription:'||a.organization_id||':'||a.subscription_id||':'||r.invoice_id||':'||r.payment_id;
  end if;
  select payload into m from public.billing_payments where id=a.payment_id;
  if m#>>'{commercial_terms,billing_cycle}'='one_time' then raise exception 'BILLING_ONE_TIME_NOT_RENEWABLE'; end if;
  select coalesce(jsonb_agg(b),'[]') into bumps from jsonb_array_elements(coalesce(m->'selected_bumps','[]')) b where b->>'recurrence' in ('monthly','weekly','quarterly','yearly');
  start_at:=coalesce(p_start,s.current_period_end,now());
  end_at:=coalesce(p_end,start_at+case m#>>'{commercial_terms,billing_interval}' when 'week' then interval '7 days' when 'quarter' then interval '3 months' when 'year' then interval '1 year' else interval '1 month' end);
  if end_at<=start_at then raise exception 'BILLING_INVALID_PERIOD'; end if;
  ref:='connectyhub_subscription:'||a.organization_id||':'||a.subscription_id||':'||v_invoice||':'||v_payment;
  plan_amount:=p_amount-coalesce((select sum((b->>'price_brl')::numeric) from jsonb_array_elements(bumps) b),0);
  if plan_amount<0 then raise exception 'BILLING_INVALID_RENEWAL'; end if;
  m:=jsonb_build_object('purchase_kind',m->'purchase_kind','purchase_product_id',m->'purchase_product_id','commercial_terms',coalesce(m->'commercial_terms','{}'),'checkout_kind','renewal','target_plan_code',m->'target_plan_code',
    'selected_bumps',bumps,'selected_bump_codes',(select coalesce(jsonb_agg(b->>'code'),'[]') from jsonb_array_elements(bumps) b),
    'external_reference',ref,'checkout_total_brl',p_amount,'plan_amount_brl',plan_amount,'checkout_url','/dashboard/planos/checkout/'||a.subscription_id,
    'cycle_start_at',start_at,'cycle_end_at',end_at,'previous_current_period_end',s.current_period_end,'native_recurring_attempt_id',a.id);
  insert into public.billing_invoices(id,organization_id,subscription_id,status,subtotal_brl,total_brl,provider,provider_payment_id,metadata)
    values(v_invoice,a.organization_id,a.subscription_id,'open',p_amount,p_amount,'asaas',p_provider_payment,m);
  insert into public.billing_invoice_items(invoice_id,organization_id,item_type,description,quantity,unit_price_brl,total_brl,metadata)
    values(v_invoice,a.organization_id,'plan','Renovação ConnectyHub',1,plan_amount,plan_amount,jsonb_build_object('native_recurring_attempt_id',a.id,'platform_product_id',m->'purchase_product_id','recurrence','recurring'));
  for bump in select * from jsonb_array_elements(bumps) loop
    insert into public.billing_invoice_items(invoice_id,organization_id,item_type,description,quantity,unit_price_brl,total_brl,credit_amount,metadata)
      values(v_invoice,a.organization_id,coalesce(bump->>'item_type','adjustment'),coalesce(bump->>'title','Adicional ConnectyHub'),1,
        (bump->>'price_brl')::numeric,(bump->>'price_brl')::numeric,coalesce((bump->>'credit_amount')::numeric,0),
        jsonb_build_object('platform_product_id',bump->'platform_product_id','recurrence',bump->'recurrence','bump',bump));
  end loop;
  insert into public.billing_payments(id,organization_id,subscription_id,invoice_id,provider,provider_payment_id,status,amount_brl,payload)
    values(v_payment,a.organization_id,a.subscription_id,v_invoice,'asaas',p_provider_payment,'pending',p_amount,m);
  insert into public.billing_native_renewals values(p_provider_payment,a.id,v_invoice,v_payment);
  return ref;
end $$;
revoke all on function public.bind_native_billing_renewal(uuid,text,numeric,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.bind_native_billing_renewal(uuid,text,numeric,timestamptz,timestamptz) to service_role;
create or replace function public.bind_native_billing_renewal(p_attempt uuid,p_provider_payment text,p_amount numeric) returns text
language sql security definer set search_path=public as $$select public.bind_native_billing_renewal(p_attempt,p_provider_payment,p_amount,null,null)$$;
