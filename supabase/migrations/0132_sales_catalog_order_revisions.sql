-- A confirmed conversational revision keeps the order identity. Gateway retirement
-- happens between begin/finish; its durable claim blocks every competing writer.
create table public.sales_catalog_order_revisions (
  organization_id uuid not null references public.organizations(id),
  order_id uuid not null references public.sales_catalog_orders(id),
  request_id text not null check (length(request_id) between 1 and 200),
  claim_token uuid not null,
  expected_revision bigint not null check (expected_revision >= 0),
  payload jsonb not null,
  state text not null check (state in ('processing','applied','blocked','failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,order_id,request_id)
);
create unique index sales_catalog_one_pending_order_revision on public.sales_catalog_order_revisions(order_id)
  where state in ('processing','blocked');
alter table public.sales_catalog_order_revisions enable row level security;
revoke all on public.sales_catalog_order_revisions from public,anon,authenticated;
grant all on public.sales_catalog_order_revisions to service_role;

create function public.assert_sales_catalog_revision_payload(p_order_id uuid,p_payload jsonb) returns numeric
language plpgsql security definer set search_path=public as $$
declare o public.sales_catalog_orders; r jsonb; m public.intelligence_memory; s public.sales_catalog_skus;
  v_subtotal numeric:=0; v_amount numeric; v_quantity integer; v_shipping numeric; v_total numeric; v_platform boolean; v_pickup boolean:=false;
  v_price text; v_sale_price text;
begin
  select * into o from public.sales_catalog_orders where id=p_order_id;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  if jsonb_typeof(p_payload->'rows') is distinct from 'array' then raise exception 'CHECKOUT_INVALID_CART'; end if;
  if jsonb_array_length(p_payload->'rows') not between 1 and 100 then raise exception 'CHECKOUT_EMPTY_CART'; end if;
  if p_payload->>'preferred_payment_method' is not null and p_payload->>'preferred_payment_method' not in ('pix','card') then raise exception 'CHECKOUT_INVALID_METHOD'; end if;
  v_shipping:=(p_payload->'shipping'->>'total')::numeric;
  if v_shipping is null or v_shipping::text in ('NaN','Infinity','-Infinity') or v_shipping<0 or round(v_shipping,2)<>v_shipping then raise exception 'CHECKOUT_INVALID_TOTAL'; end if;
  if p_payload->'shipping'->>'method'='Retirada na loja' then
    select coalesce(metadata->>'local_pickup','false')='true' into v_pickup from public.intelligence_memory
      where organization_id=o.organization_id and scope='organization' and memory_type='sales_catalog_shipping_settings' order by updated_at desc limit 1;
    if not coalesce(v_pickup,false) or v_shipping<>0 then raise exception 'CHECKOUT_DELIVERY_REQUIRED'; end if;
  end if;
  for r in select value from jsonb_array_elements(p_payload->'rows') loop
    if (r->>'organization_id' is not null and r->>'organization_id'<>o.organization_id::text)
      or (r->>'order_id' is not null and r->>'order_id'<>o.id::text) then raise exception 'CHECKOUT_NOT_FOUND'; end if;
    select * into m from public.intelligence_memory where id=(r->>'catalog_item_id')::uuid and organization_id=o.organization_id and memory_type='sales_catalog_item' for share;
    if not found or coalesce(m.metadata->>'status','active') in ('draft','archived','inactive') then raise exception 'CHECKOUT_INVALID_PRODUCT'; end if;
    v_price:=nullif(m.metadata->>'price','');
    v_sale_price:=coalesce(nullif(m.metadata->'offer'->>'sale_price',''),nullif(m.metadata->'offer'->>'salePrice',''));
    if nullif(r->>'sku_id','') is not null then
      select * into s from public.sales_catalog_skus where id=(r->>'sku_id')::uuid and organization_id=o.organization_id and catalog_item_id=m.id for share;
      if not found or s.status<>'active' then raise exception 'CHECKOUT_INVALID_PRODUCT'; end if;
      v_price:=coalesce(nullif(s.price,''),v_price);
      v_sale_price:=coalesce(nullif(s.sale_price,''),v_sale_price);
    end if;
    if coalesce(r->>'quantity','') !~ '^[0-9]+$' then raise exception 'CHECKOUT_INVALID_CART'; end if;
    v_quantity:=(r->>'quantity')::integer;
    if v_quantity not between 1 and 100000 or nullif(trim(r->>'title'),'') is null then raise exception 'CHECKOUT_INVALID_CART'; end if;
    if nullif(r->>'total','') is null or coalesce(nullif(r->>'sale_price',''),nullif(r->>'unit_price','')) is null then raise exception 'CHECKOUT_INVALID_TOTAL'; end if;
    if (nullif(r->>'unit_price','') is null) is distinct from (v_price is null)
      or (nullif(r->>'sale_price','') is null) is distinct from (v_sale_price is null)
      or public.checkout_money(r->>'unit_price')<>public.checkout_money(v_price)
      or public.checkout_money(r->>'sale_price')<>public.checkout_money(v_sale_price) then raise exception 'CHECKOUT_CHANGED'; end if;
    v_amount:=public.checkout_money(r->>'total');
    if v_amount<0 or v_amount<>round((public.checkout_money(coalesce(nullif(r->>'sale_price',''),r->>'unit_price'))
      +public.checkout_money(r->'metadata'->>'conversation_cart_attribute_modifier_total'))*v_quantity,2) then raise exception 'CHECKOUT_INVALID_TOTAL'; end if;
    v_subtotal:=v_subtotal+v_amount;
    -- Classification comes from the scoped catalog; a revision cannot move money
    -- between the seller, platform or another commercial ownership arrangement.
    v_platform:=coalesce(m.metadata->>'product_origin_type','client')='connectyhub' or nullif(m.metadata->>'platform_product_id','') is not null;
    if v_platform is distinct from o.contains_platform_products
      or coalesce(r->>'product_origin_type','client')<>coalesce(m.metadata->>'product_origin_type','client')
      or coalesce(r->>'commercial_flow_type','client_direct')<>coalesce(m.metadata->>'commercial_flow_type','client_direct')
      or coalesce(r->>'commercial_flow_type','client_direct')<>o.commercial_flow_type
      or coalesce(r->>'revenue_owner_type','client')<>coalesce(m.metadata->>'revenue_owner_type','client')
      or coalesce(r->>'revenue_owner_type','client')<>o.revenue_owner_type
      or nullif(r->>'platform_product_id','') is distinct from nullif(m.metadata->>'platform_product_id','')
      or coalesce((r->>'commission_eligible')::boolean,false) is distinct from coalesce((m.metadata->>'commission_eligible')::boolean,false)
      then raise exception 'CHECKOUT_FINANCIAL_OWNER_CHANGED'; end if;
    if coalesce(m.metadata->'fulfillment'->>'mode','physical')='physical' and not coalesce(v_pickup,false) and (nullif(trim(p_payload->'shipping'->>'method'),'') is null
      or coalesce(p_payload->'shipping'->>'destination_cep','') !~ '^[0-9]{8}$'
      or length(trim(coalesce(p_payload->'shipping'->>'destination_address','')))<12) then raise exception 'CHECKOUT_DELIVERY_REQUIRED'; end if;
  end loop;
  v_total:=round(v_subtotal-public.checkout_money(o.discount_total)+v_shipping,2);
  if v_total<=0 or (p_payload->>'expected_total')::numeric is distinct from v_total then raise exception 'CHECKOUT_INVALID_TOTAL'; end if;
  return v_subtotal;
end $$;

create function public.begin_sales_catalog_order_revision(p_order_id uuid,p_organization_id uuid,p_lead_id uuid,p_conversation_id uuid,
  p_revision bigint,p_request_id text,p_claim_token uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare o public.sales_catalog_orders; r public.sales_catalog_order_revisions; needs_retirement boolean;
begin
  select * into o from public.sales_catalog_orders where id=p_order_id and organization_id=p_organization_id
    and lead_id=p_lead_id and conversation_id=p_conversation_id for update;
  if not found or not exists(select 1 from public.conversations where id=p_conversation_id and organization_id=p_organization_id and lead_id=p_lead_id)
    or not exists(select 1 from public.leads where id=p_lead_id and organization_id=p_organization_id) then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  if p_revision is null or p_revision<0 or p_claim_token is null or length(trim(coalesce(p_request_id,''))) not between 1 and 200 then raise exception 'CHECKOUT_INVALID_CART'; end if;
  select * into r from public.sales_catalog_order_revisions where order_id=o.id and organization_id=o.organization_id and request_id=p_request_id;
  if found then
    if r.payload is distinct from p_payload or r.expected_revision<>p_revision then raise exception 'CHECKOUT_REVISION_CONFLICT'; end if;
    if r.state='applied' then return jsonb_build_object('replay',true,'order',r.result); end if;
    if r.state='blocked' then raise exception 'CHECKOUT_REVISION_BLOCKED'; end if;
    if r.state='processing' then raise exception 'CHECKOUT_REVISION_BUSY'; end if;
  end if;
  if exists(select 1 from public.sales_catalog_order_revisions where order_id=o.id and state in ('processing','blocked')) then raise exception 'CHECKOUT_REVISION_BUSY'; end if;
  if o.checkout_revision<>p_revision then raise exception 'CHECKOUT_CHANGED'; end if;
  if o.payment_status::text in ('confirmed','refunded','proof_sent') or o.status::text not in ('draft','pending_payment','needs_human')
    or o.metadata->>'inventory_deducted_at' is not null or o.metadata->>'commercial_agreement_id' is not null then raise exception 'CHECKOUT_CLOSED'; end if;
  perform public.assert_checkout_review_clear(o.id);
  if o.checkout_payment_lock is not null or exists(select 1 from public.sales_catalog_card_attempts where order_id=o.id and state in ('processing','unknown','pending','approved','refunded'))
    or exists(select 1 from public.sales_catalog_payment_sessions where order_id=o.id and (metadata->>'gateway_request_inflight'='true'
      or status in ('approved','refunded') or provider_status_detail='verification_pending')) then raise exception 'CHECKOUT_PAYMENT_BUSY'; end if;
  if exists(select 1 from public.sales_catalog_payment_sessions where order_id=o.id and status in ('created','pending','error')
    and provider_payment_id is not null and (provider<>'asaas' or metadata->>'transparent_checkout'='true' and status='pending')) then raise exception 'CHECKOUT_PREVIOUS_PAYMENT_PENDING'; end if;
  perform public.assert_sales_catalog_revision_payload(o.id,p_payload);
  select exists(select 1 from public.sales_catalog_payment_sessions where order_id=o.id and status in ('created','pending','error') and provider_payment_id is not null) into needs_retirement;
  insert into public.sales_catalog_order_revisions(organization_id,order_id,request_id,claim_token,expected_revision,payload,state)
    values(o.organization_id,o.id,p_request_id,p_claim_token,p_revision,p_payload,'processing')
    on conflict(organization_id,order_id,request_id) do update set state='processing',claim_token=excluded.claim_token,updated_at=now();
  return jsonb_build_object('claimed',true,'needs_retirement',needs_retirement);
end $$;

-- The parent row is always locked before reading the claim. This closes the gap
-- between the HTTP gateway call and SQL commit without leasing an uncertain charge.
create function public.guard_sales_catalog_revision_claim() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_order_id uuid; v_gateway_start boolean:=false; v_order public.sales_catalog_orders;
begin
  if tg_table_name='sales_catalog_orders' then
    if (new.subtotal,new.total,new.discount_total,new.shipping_total,new.shipping_method,new.destination_cep,new.destination_address,new.payment_method,new.commercial_flow_type,new.revenue_owner_type,new.contains_platform_products,new.commission_eligible,new.lead_id,new.conversation_id)
      is not distinct from (old.subtotal,old.total,old.discount_total,old.shipping_total,old.shipping_method,old.destination_cep,old.destination_address,old.payment_method,old.commercial_flow_type,old.revenue_owner_type,old.contains_platform_products,old.commission_eligible,old.lead_id,old.conversation_id)
      or new.payment_status::text in ('confirmed','refunded') then return new; end if;
    v_order_id:=new.id;
  elsif tg_table_name='sales_catalog_order_items' then
    v_order_id:=case when tg_op='DELETE' then old.order_id else new.order_id end;
  else
    if tg_op='UPDATE' and old.metadata->>'order_revision_superseded_by_request_id' is not null then
      new.metadata:=coalesce(new.metadata,'{}')||jsonb_build_object('order_revision_superseded_by_request_id',old.metadata->>'order_revision_superseded_by_request_id');
    end if;
    v_gateway_start:=tg_op='UPDATE' and coalesce(new.metadata->>'gateway_request_inflight','false')='true' and coalesce(old.metadata->>'gateway_request_inflight','false')<>'true';
    if tg_op='UPDATE' and not v_gateway_start
      and not (new.status in ('created','pending') and (old.status not in ('created','pending')
        or (new.provider_payment_id,new.amount,new.method) is distinct from (old.provider_payment_id,old.amount,old.method))) then return new; end if;
    if tg_op='INSERT' and new.status not in ('created','pending') then return new; end if;
    v_order_id:=new.order_id;
  end if;
  select * into v_order from public.sales_catalog_orders where id=v_order_id for update;
  if exists(select 1 from public.sales_catalog_order_revisions where order_id=v_order_id and state in ('processing','blocked')) then raise exception 'CHECKOUT_REVISION_BUSY'; end if;
  if tg_table_name='sales_catalog_payment_sessions' then
    if (v_gateway_start and (new.status not in ('created','pending','error') or new.amount is distinct from public.checkout_money(v_order.total)))
      or new.metadata->>'order_revision_superseded_by_request_id' is not null then raise exception 'CHECKOUT_CHANGED'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger sales_catalog_revision_order_guard before update on public.sales_catalog_orders for each row execute function public.guard_sales_catalog_revision_claim();
create trigger sales_catalog_revision_item_guard before insert or update or delete on public.sales_catalog_order_items for each row execute function public.guard_sales_catalog_revision_claim();
create trigger sales_catalog_revision_payment_guard before insert or update on public.sales_catalog_payment_sessions for each row execute function public.guard_sales_catalog_revision_claim();

create function public.finish_sales_catalog_order_revision(p_order_id uuid,p_organization_id uuid,p_request_id text,p_claim_token uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare o public.sales_catalog_orders; r public.sales_catalog_order_revisions; v_subtotal numeric; v_rows jsonb; v_shipping jsonb; previous_items jsonb;
begin
  select * into o from public.sales_catalog_orders where id=p_order_id and organization_id=p_organization_id for update;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  select * into r from public.sales_catalog_order_revisions where order_id=o.id and organization_id=o.organization_id and request_id=p_request_id for update;
  if not found or r.claim_token is distinct from p_claim_token then raise exception 'CHECKOUT_REVISION_CONFLICT'; end if;
  if r.state='applied' then return r.result; end if;
  if r.state<>'processing' then raise exception 'CHECKOUT_REVISION_BLOCKED'; end if;
  if o.checkout_revision<>r.expected_revision then raise exception 'CHECKOUT_CHANGED'; end if;
  if o.payment_status::text in ('confirmed','refunded','proof_sent') or o.status::text not in ('draft','pending_payment','needs_human') then raise exception 'CHECKOUT_CLOSED'; end if;
  perform public.assert_checkout_review_clear(o.id);
  if o.checkout_payment_lock is not null or exists(select 1 from public.sales_catalog_card_attempts where order_id=o.id and state in ('processing','unknown','pending','approved','refunded')) then raise exception 'CHECKOUT_PAYMENT_BUSY'; end if;
  if exists(select 1 from public.sales_catalog_payment_sessions where order_id=o.id and
    (metadata->>'gateway_request_inflight'='true' or status in ('approved','refunded') or provider_status_detail='verification_pending'
      or provider_payment_id is not null and status in ('created','pending','error'))) then raise exception 'CHECKOUT_PREVIOUS_PAYMENT_PENDING'; end if;
  v_subtotal:=public.assert_sales_catalog_revision_payload(o.id,r.payload);
  v_rows:=r.payload->'rows'; v_shipping:=r.payload->'shipping';
  select coalesce(jsonb_agg(to_jsonb(i)),'[]') into previous_items from public.sales_catalog_order_items i where order_id=o.id;
  -- This unblocks our writes inside this transaction only. The locked order keeps
  -- competing writers waiting; rollback also restores the durable processing state.
  update public.sales_catalog_order_revisions set state='applied' where order_id=o.id and request_id=p_request_id;
  -- An earlier job may have saved a local session but not yet called the gateway.
  -- It must not resume later and send the pre-revision amount or item description.
  update public.sales_catalog_payment_sessions set status='cancelled',
    metadata=coalesce(metadata,'{}')||jsonb_build_object('order_revision_superseded_by_request_id',p_request_id),updated_at=now()
    where order_id=o.id and provider_payment_id is null and status in ('created','pending','error');
  delete from public.sales_catalog_order_items where order_id=o.id;
  insert into public.sales_catalog_order_items(organization_id,order_id,catalog_item_id,sku_id,sku_code,title,tag,quantity,unit_price,sale_price,total,attributes,fulfillment,metadata,product_origin_type,commercial_flow_type,revenue_owner_type,commission_eligible,platform_product_id)
    select o.organization_id,o.id,(j->>'catalog_item_id')::uuid,nullif(j->>'sku_id','')::uuid,j->>'sku_code',j->>'title',j->>'tag',(j->>'quantity')::integer,j->>'unit_price',j->>'sale_price',j->>'total',coalesce(j->'attributes','[]'),coalesce(j->'fulfillment','{}'),coalesce(j->'metadata','{}'),
      coalesce(j->>'product_origin_type','client'),coalesce(j->>'commercial_flow_type','client_direct'),coalesce(j->>'revenue_owner_type','client'),coalesce((j->>'commission_eligible')::boolean,false),nullif(j->>'platform_product_id','')::uuid from jsonb_array_elements(v_rows) j;
  update public.sales_catalog_orders set subtotal=v_subtotal::text,total=(r.payload->>'expected_total'),shipping_total=(v_shipping->>'total'),shipping_method=v_shipping->>'method',
    destination_cep=v_shipping->>'destination_cep',destination_address=v_shipping->>'destination_address',
    commission_eligible=(select bool_or(coalesce((j->>'commission_eligible')::boolean,false)) from jsonb_array_elements(v_rows) j),
    metadata=coalesce(metadata,'{}')||jsonb_build_object('checkout_items_ready',true,'checkout_revision_request_id',p_request_id,'checkout_revised_at',now(),
      'preferred_payment_method',coalesce(r.payload->>'preferred_payment_method',metadata->>'preferred_payment_method'),
      'selected_catalog_item_ids',(select jsonb_agg(j->>'catalog_item_id') from jsonb_array_elements(v_rows) j),
      'selected_catalog_item_tags',(select jsonb_agg(j->>'tag') from jsonb_array_elements(v_rows) j),
      'billing_cycles',(select jsonb_agg(distinct coalesce(j->'metadata'->>'billing_cycle','one_time')) from jsonb_array_elements(v_rows) j),
      'platform_product_ids',(select coalesce(jsonb_agg(j->>'platform_product_id') filter(where nullif(j->>'platform_product_id','') is not null),'[]') from jsonb_array_elements(v_rows) j),
      'order_bump_product_ids',(select coalesce(jsonb_agg(j->>'catalog_item_id') filter(where j->'metadata'->>'order_bump'='true'),'[]') from jsonb_array_elements(v_rows) j),
      'commission_eligible',(select bool_or(coalesce((j->>'commission_eligible')::boolean,false)) from jsonb_array_elements(v_rows) j),
      'conversation_cart_items',(select jsonb_agg(jsonb_build_object('catalog_item_id',j->>'catalog_item_id','title',j->>'title','tag',j->>'tag','quantity',(j->>'quantity')::integer,'selected_attributes',j->'attributes')) from jsonb_array_elements(v_rows) j)),
    updated_at=now() where id=o.id returning * into o;
  update public.sales_catalog_order_revisions set result=to_jsonb(o),updated_at=now() where order_id=o.id and request_id=p_request_id;
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',o.organization_id,'sales_catalog_order',o.id,'sales_catalog.order_revised','Pedido alterado após confirmação','Itens, entrega e total atualizados no mesmo pedido.','organization',array['sales_catalog','order_revision','lead_tracking'],
      jsonb_build_object('lead_id',o.lead_id,'conversation_id',o.conversation_id,'order_id',o.id,'request_id',p_request_id,'previous_items',previous_items,'items',v_rows,'amount',o.total,'revision',o.checkout_revision));
  return to_jsonb(o);
end $$;

create function public.fail_sales_catalog_order_revision(p_order_id uuid,p_organization_id uuid,p_request_id text,p_claim_token uuid,p_uncertain boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.sales_catalog_orders where id=p_order_id and organization_id=p_organization_id for update;
  update public.sales_catalog_order_revisions set state=case when p_uncertain then 'blocked' else 'failed' end,updated_at=now()
    where order_id=p_order_id and organization_id=p_organization_id and request_id=p_request_id and claim_token=p_claim_token and state='processing';
end $$;

revoke all on function public.assert_sales_catalog_revision_payload(uuid,jsonb),public.begin_sales_catalog_order_revision(uuid,uuid,uuid,uuid,bigint,text,uuid,jsonb),public.finish_sales_catalog_order_revision(uuid,uuid,text,uuid),public.fail_sales_catalog_order_revision(uuid,uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.assert_sales_catalog_revision_payload(uuid,jsonb),public.begin_sales_catalog_order_revision(uuid,uuid,uuid,uuid,bigint,text,uuid,jsonb),public.finish_sales_catalog_order_revision(uuid,uuid,text,uuid),public.fail_sales_catalog_order_revision(uuid,uuid,text,uuid,boolean) to service_role;
