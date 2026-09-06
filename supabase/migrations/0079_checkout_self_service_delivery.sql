-- Customer, freight, order total and lead history commit together under the payment lock.
create or replace function public.set_checkout_delivery(
  p_session_id uuid, p_revision bigint, p_customer jsonb,
  p_shipping numeric, p_shipping_method text, p_quote jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.sales_catalog_payment_sessions; o public.sales_catalog_orders; v_total numeric; v_customer jsonb;
begin
  select * into s from public.sales_catalog_payment_sessions where id=p_session_id and provider='asaas';
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  select * into o from public.sales_catalog_orders where id=s.order_id and organization_id=s.organization_id for update;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  if o.checkout_revision<>p_revision then raise exception 'CHECKOUT_CHANGED'; end if;
  if o.checkout_payment_lock is not null then raise exception 'CHECKOUT_PAYMENT_BUSY'; end if;
  if o.payment_status::text in ('confirmed','refunded') or o.status::text in ('paid','in_preparation','shipped','delivered','cancelled') then raise exception 'CHECKOUT_CLOSED'; end if;
  if exists(select 1 from public.sales_catalog_payment_sessions where order_id=o.id and organization_id=o.organization_id and
    (metadata->>'gateway_request_inflight'='true' or provider_payment_id is not null and status in ('created','pending','error'))) then raise exception 'CHECKOUT_PAYMENT_PENDING'; end if;
  if p_shipping is null or p_shipping<0 or p_shipping>1000000 or jsonb_typeof(p_customer)<>'object' then raise exception 'CHECKOUT_INVALID_DELIVERY'; end if;
  v_total:=public.checkout_money(o.subtotal)-public.checkout_money(o.discount_total)+round(p_shipping,2);
  if v_total<=0 then raise exception 'CHECKOUT_INVALID_TOTAL'; end if;
  v_customer:=jsonb_build_object(
    'person_name',p_customer->>'customer_name', 'email',p_customer->>'customer_email',
    'customer_document',p_customer->>'customer_document', 'phone',p_customer->>'customer_phone',
    'billing_cep',p_customer->>'destination_cep', 'delivery_cep',p_customer->>'destination_cep',
    'billing_address',p_customer->>'destination_address', 'delivery_address',p_customer->>'destination_address'
  );
  update public.sales_catalog_orders set
    customer_name=p_customer->>'customer_name',customer_email=p_customer->>'customer_email',
    customer_phone=p_customer->>'customer_phone',customer_document=p_customer->>'customer_document',
    destination_cep=p_customer->>'destination_cep',destination_address=p_customer->>'destination_address',
    shipping_total=round(p_shipping,2)::text,shipping_method=p_shipping_method,total=v_total::text,
    checkout_revision=o.checkout_revision+1,
    metadata=coalesce(metadata,'{}')||jsonb_build_object('shipping_quote',p_quote,'delivery_updated_from','public_checkout','delivery_updated_at',now()),
    updated_at=now() where id=o.id returning * into o;
  -- Empty/deferred sessions have no remote charge to invalidate. Existing real payments were retired first.
  update public.sales_catalog_payment_sessions set payer_email=o.customer_email,
    amount=case when provider_payment_id is null then v_total else amount end,
    metadata=coalesce(metadata,'{}')||jsonb_build_object('payment_deferred',false,'delivery_revision',o.checkout_revision),
    updated_at=now() where order_id=o.id and organization_id=o.organization_id;
  if o.lead_id is not null then
    update public.leads set display_name=o.customer_name,phone_number=o.customer_phone,
      metadata=coalesce(metadata,'{}')||v_customer||jsonb_build_object('lead_memory',coalesce(metadata->'lead_memory','{}')||v_customer),
      last_event_summary='Dados e entrega atualizados no checkout.',updated_at=now()
      where id=o.lead_id and organization_id=o.organization_id;
  end if;
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
  values('organization',o.organization_id,'sales_catalog_order',o.id,'sales_catalog.checkout_delivery_updated','Entrega confirmada no checkout',
    'Cliente confirmou os dados e o frete diretamente na loja.','organization',array['sales_catalog','shipping','checkout','lead_tracking'],
    jsonb_build_object('lead_id',o.lead_id,'conversation_id',o.conversation_id,'order_id',o.id,'payment_session_id',s.id,
      'shipping_total',p_shipping,'shipping_method',p_shipping_method,'shipping_quote',p_quote,'total',v_total,'checkout_revision',o.checkout_revision));
  return to_jsonb(o);
end $$;
revoke all on function public.set_checkout_delivery(uuid,bigint,jsonb,numeric,text,jsonb) from public,anon,authenticated;
grant execute on function public.set_checkout_delivery(uuid,bigint,jsonb,numeric,text,jsonb) to service_role;
