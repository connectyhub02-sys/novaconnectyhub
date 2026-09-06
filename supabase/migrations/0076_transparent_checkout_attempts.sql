-- Durable checkout revisions and payment claims. No card data is stored here.
alter table public.sales_catalog_orders add column if not exists checkout_revision bigint not null default 0;
alter table public.sales_catalog_orders add column if not exists checkout_payment_lock uuid;

-- Explicit per-store rollout. Existing payment links keep their order identity.
create table if not exists public.sales_catalog_checkout_capabilities (
  organization_id uuid primary key references public.organizations(id),
  transparent_card_enabled boolean not null default false,
  validation_reference text,
  check (not transparent_card_enabled or nullif(trim(validation_reference),'') is not null),
  updated_at timestamptz not null default now()
);
alter table public.sales_catalog_checkout_capabilities enable row level security;
revoke all on public.sales_catalog_checkout_capabilities from anon,authenticated;
grant all on public.sales_catalog_checkout_capabilities to service_role;

create table if not exists public.sales_catalog_card_attempts (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  order_id uuid not null references public.sales_catalog_orders(id),
  source_session_id uuid not null references public.sales_catalog_payment_sessions(id),
  payment_session_id uuid not null references public.sales_catalog_payment_sessions(id),
  revision bigint not null,
  amount numeric(14,2) not null check(amount > 0),
  installments integer not null default 1 check(installments between 1 and 12),
  state text not null check(state in ('processing','unknown','pending','approved','rejected','error','cancelled','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sales_catalog_one_active_card_attempt on public.sales_catalog_card_attempts(order_id)
  where state in ('processing','unknown','pending');
alter table public.sales_catalog_card_attempts enable row level security;
revoke all on public.sales_catalog_card_attempts from anon, authenticated;
grant all on public.sales_catalog_card_attempts to service_role;

create or replace function public.checkout_money(p_text text) returns numeric language plpgsql immutable set search_path=public as $$
declare v text := regexp_replace(coalesce(p_text,'0'), '[^0-9,.-]', '', 'g');
begin
  if position(',' in v)>0 then v:=replace(replace(v,'.',''),',','.'); end if;
  return round(coalesce(nullif(v,'')::numeric,0),2);
end $$;

create or replace function public.guard_checkout_order_revision() returns trigger language plpgsql set search_path=public as $$
begin
  if old.checkout_payment_lock is not null and new.latest_payment_session_id is distinct from old.latest_payment_session_id
    and new.latest_payment_session_id is distinct from old.checkout_payment_lock
    and new.payment_status::text not in ('confirmed','refunded') then raise exception 'CHECKOUT_PAYMENT_BUSY'; end if;
  if (new.subtotal,new.total,new.discount_total,new.shipping_total,new.shipping_method,new.destination_cep,new.destination_address)
    is distinct from (old.subtotal,old.total,old.discount_total,old.shipping_total,old.shipping_method,old.destination_cep,old.destination_address) then
    if old.checkout_payment_lock is not null then raise exception 'CHECKOUT_PAYMENT_BUSY'; end if;
    if exists(select 1 from public.sales_catalog_payment_sessions where order_id=old.id and metadata->>'gateway_request_inflight'='true') then raise exception 'CHECKOUT_PAYMENT_BUSY'; end if;
    new.checkout_revision:=old.checkout_revision+1;
  end if;
  return new;
end $$;
drop trigger if exists guard_checkout_order_revision on public.sales_catalog_orders;
create trigger guard_checkout_order_revision before update on public.sales_catalog_orders for each row execute function public.guard_checkout_order_revision();

create or replace function public.guard_checkout_item_revision() returns trigger language plpgsql set search_path=public as $$
declare v_order public.sales_catalog_orders;
begin
  if TG_OP='UPDATE' and new.order_id is distinct from old.order_id then raise exception 'CHECKOUT_ITEM_MOVE_NOT_ALLOWED'; end if;
  select * into v_order from public.sales_catalog_orders where id=case when TG_OP='DELETE' then old.order_id else new.order_id end for update;
  if v_order.checkout_payment_lock is not null then raise exception 'CHECKOUT_PAYMENT_BUSY'; end if;
  if exists(select 1 from public.sales_catalog_payment_sessions where order_id=v_order.id and metadata->>'gateway_request_inflight'='true') then raise exception 'CHECKOUT_PAYMENT_BUSY'; end if;
  update public.sales_catalog_orders set checkout_revision=checkout_revision+1 where id=v_order.id;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists guard_checkout_item_revision on public.sales_catalog_order_items;
create trigger guard_checkout_item_revision before insert or update or delete on public.sales_catalog_order_items for each row execute function public.guard_checkout_item_revision();

create or replace function public.claim_checkout_card_attempt(p_session_id uuid,p_attempt_id uuid,p_revision bigint,p_amount numeric,p_installments integer default 1)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.sales_catalog_payment_sessions; o public.sales_catalog_orders; a public.sales_catalog_card_attempts;
begin
  select * into s from public.sales_catalog_payment_sessions where id=p_session_id;
  if not found or s.provider<>'asaas' then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  select * into o from public.sales_catalog_orders where id=s.order_id and organization_id=s.organization_id for update;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  if o.payment_status::text in ('confirmed','refunded') or o.status::text in ('paid','in_preparation','shipped','delivered','cancelled') then raise exception 'CHECKOUT_CLOSED'; end if;
  select * into a from public.sales_catalog_card_attempts where id=p_attempt_id;
  if found then
    if a.order_id<>o.id or a.organization_id<>o.organization_id then raise exception 'CHECKOUT_ATTEMPT_CONFLICT'; end if;
    return jsonb_build_object('claimed',false,'attempt',to_jsonb(a));
  end if;
  select * into a from public.sales_catalog_card_attempts where order_id=o.id and state in ('processing','unknown','pending','approved') order by created_at desc limit 1;
  if found then return jsonb_build_object('claimed',false,'attempt',to_jsonb(a)); end if;
  if (select count(*) from public.sales_catalog_card_attempts where order_id=o.id and created_at>now()-interval '15 minutes')>=5 then raise exception 'CHECKOUT_RATE_LIMIT'; end if;
  if o.checkout_revision<>p_revision or public.checkout_money(o.total)<>round(p_amount,2) then raise exception 'CHECKOUT_CHANGED'; end if;
  if o.checkout_payment_lock is not null then raise exception 'CHECKOUT_PAYMENT_BUSY'; end if;
  if exists(select 1 from public.sales_catalog_payment_sessions where order_id=o.id and metadata->>'gateway_request_inflight'='true') then raise exception 'CHECKOUT_PAYMENT_BUSY'; end if;
  insert into public.sales_catalog_payment_sessions(id,organization_id,order_id,integration_id,provider,method,status,amount,payer_email,idempotency_key,external_reference,metadata,payment_owner_type,commercial_flow_type,revenue_owner_type,commission_context)
  values(p_attempt_id,o.organization_id,o.id,s.integration_id,'asaas','card','pending',p_amount,o.customer_email,p_attempt_id::text,'checkout_card:'||p_attempt_id,
    jsonb_build_object('transparent_checkout',true,'source_session_id',s.id,'checkout_revision',p_revision,'agent_id',s.metadata->'agent_id','checkout_agent_id',s.metadata->'checkout_agent_id','payment_owner',s.metadata->'payment_owner'),s.payment_owner_type,s.commercial_flow_type,s.revenue_owner_type,s.commission_context);
  insert into public.sales_catalog_card_attempts(id,organization_id,order_id,source_session_id,payment_session_id,revision,amount,installments,state)
    values(p_attempt_id,o.organization_id,o.id,s.id,p_attempt_id,p_revision,p_amount,p_installments,'processing') returning * into a;
  update public.sales_catalog_orders set checkout_payment_lock=p_attempt_id,latest_payment_session_id=p_attempt_id where id=o.id;
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',o.organization_id,'sales_catalog_payment_session',p_attempt_id,'sales_catalog.card_attempt_started','Pagamento iniciado','O cliente confirmou uma tentativa de pagamento no checkout da loja.','organization',array['sales_catalog','payment','lead_tracking'],
      jsonb_build_object('lead_id',o.lead_id,'conversation_id',o.conversation_id,'order_id',o.id,'payment_session_id',p_attempt_id,'amount',p_amount,'installments',p_installments,'revision',p_revision));
  return jsonb_build_object('claimed',true,'attempt',to_jsonb(a));
end $$;
revoke all on function public.claim_checkout_card_attempt(uuid,uuid,bigint,numeric,integer) from public,anon,authenticated;
grant execute on function public.claim_checkout_card_attempt(uuid,uuid,bigint,numeric,integer) to service_role;

create or replace function public.sync_checkout_card_attempt() returns trigger language plpgsql set search_path=public as $$
declare a public.sales_catalog_card_attempts; v_state text;
begin
  select * into a from public.sales_catalog_card_attempts where payment_session_id=new.id;
  if not found then return new; end if;
  if a.state='refunded' then return new; end if;
  if a.state='approved' and new.status not in ('approved','refunded') then return new; end if;
  v_state:=case when new.status='expired' then 'cancelled' when new.status='created' then 'pending' else new.status end;
  update public.sales_catalog_card_attempts set state=v_state,updated_at=now() where id=a.id;
  if v_state in ('approved','rejected','error','cancelled','refunded') then
    update public.sales_catalog_orders set checkout_payment_lock=null where id=a.order_id and checkout_payment_lock=a.id;
  end if;
  return new;
end $$;
drop trigger if exists sync_checkout_card_attempt on public.sales_catalog_payment_sessions;
create trigger sync_checkout_card_attempt after update of status on public.sales_catalog_payment_sessions for each row execute function public.sync_checkout_card_attempt();

-- The payment result and the lead's financial timeline commit together.
create or replace function public.finish_checkout_card_attempt(p_attempt_id uuid,p_state text,p_provider_id text default null,p_provider_status text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.sales_catalog_card_attempts; o public.sales_catalog_orders; v_changed boolean;
begin
  if p_state not in ('unknown','pending','approved','rejected','error','cancelled','refunded') then raise exception 'CHECKOUT_INVALID_STATE'; end if;
  select * into a from public.sales_catalog_card_attempts where id=p_attempt_id;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  select * into o from public.sales_catalog_orders where id=a.order_id for update;
  select * into a from public.sales_catalog_card_attempts where id=p_attempt_id for update;
  if a.state='refunded' or (a.state='approved' and p_state<>'refunded') then
    return jsonb_build_object('changed',false,'attempt',to_jsonb(a));
  end if;
  v_changed := a.state is distinct from p_state;
  update public.sales_catalog_payment_sessions set
    status=case when p_state='unknown' then 'pending' else p_state end,
    provider_payment_id=coalesce(p_provider_id,provider_payment_id),
    provider_status=coalesce(p_provider_status,provider_status),
    provider_status_detail=case when p_state='unknown' then 'verification_pending' else 'transparent_checkout' end,
    paid_at=case when p_state='approved' then coalesce(paid_at,now()) else paid_at end,
    updated_at=now()
    where id=a.payment_session_id;
  update public.sales_catalog_card_attempts set state=p_state,updated_at=now() where id=a.id returning * into a;
  if p_state='approved' then
    update public.sales_catalog_orders set payment_status='confirmed',status=case when status::text in ('draft','pending_payment','needs_human') then 'paid'::public.sales_catalog_order_status else status end,
      payment_method='Cartão de crédito',latest_payment_session_id=a.payment_session_id,checkout_payment_lock=null,updated_at=now() where id=o.id;
  elsif p_state='refunded' then
    update public.sales_catalog_orders set payment_status='refunded',checkout_payment_lock=null,updated_at=now() where id=o.id;
  elsif o.payment_status::text not in ('confirmed','refunded') then
    update public.sales_catalog_orders set payment_status=case when p_state in ('rejected','error','cancelled') then 'failed'::public.sales_catalog_payment_status else 'pending'::public.sales_catalog_payment_status end,
      checkout_payment_lock=case when p_state in ('rejected','error','cancelled') then null else a.id end,updated_at=now() where id=o.id;
  end if;
  if v_changed then
    insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
      values('organization',o.organization_id,'sales_catalog_payment_session',a.payment_session_id,'sales_catalog.card_payment_'||p_state,
        'Pagamento no checkout','Resultado do pagamento: '||p_state,'organization',array['sales_catalog','payment','lead_tracking'],
        jsonb_build_object('lead_id',o.lead_id,'conversation_id',o.conversation_id,'order_id',o.id,'payment_session_id',a.payment_session_id,'amount',a.amount,'payment_status',p_state));
  end if;
  return jsonb_build_object('changed',v_changed,'attempt',to_jsonb(a));
end $$;
revoke all on function public.finish_checkout_card_attempt(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_checkout_card_attempt(uuid,text,text,text) to service_role;

create or replace function public.set_checkout_order_bumps(p_order_id uuid,p_organization_id uuid,p_revision bigint,p_rows jsonb,p_shipping numeric,p_shipping_method text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.sales_catalog_orders; v_subtotal numeric; v_total numeric; v_existing jsonb; v_next jsonb;
begin
  select * into o from public.sales_catalog_orders where id=p_order_id and organization_id=p_organization_id for update;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  if o.checkout_payment_lock is not null then raise exception 'CHECKOUT_PAYMENT_BUSY'; end if;
  if o.checkout_revision<>p_revision then raise exception 'CHECKOUT_CHANGED'; end if;
  if o.payment_status::text in ('confirmed','refunded') or o.status::text in ('paid','in_preparation','shipped','delivered','cancelled') then raise exception 'CHECKOUT_CLOSED'; end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>12 or p_shipping<0 then raise exception 'CHECKOUT_INVALID_CART'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r where not exists(select 1 from public.intelligence_memory m where m.id=(r->>'catalog_item_id')::uuid and m.organization_id=o.organization_id and m.memory_type='sales_catalog_item')) then raise exception 'CHECKOUT_INVALID_PRODUCT'; end if;
  select coalesce(jsonb_agg(jsonb_build_array(catalog_item_id,public.checkout_money(total)) order by catalog_item_id),'[]') into v_existing from public.sales_catalog_order_items where order_id=o.id and metadata->>'order_bump'='true';
  select coalesce(jsonb_agg(jsonb_build_array(r->>'catalog_item_id',(r->>'total')::numeric) order by r->>'catalog_item_id'),'[]') into v_next from jsonb_array_elements(p_rows) r;
  if v_existing=v_next and public.checkout_money(o.shipping_total)=p_shipping then return to_jsonb(o); end if;
  -- A concurrently created Pix/hosted payment must not remain payable for an old total.
  if exists(select 1 from public.sales_catalog_payment_sessions where order_id=o.id and
    (metadata->>'gateway_request_inflight'='true' or provider_payment_id is not null and status in ('created','pending','error'))) then raise exception 'CHECKOUT_PREVIOUS_PAYMENT_PENDING'; end if;
  delete from public.sales_catalog_order_items where order_id=o.id and metadata->>'order_bump'='true';
  insert into public.sales_catalog_order_items(organization_id,order_id,catalog_item_id,sku_id,sku_code,title,tag,quantity,unit_price,sale_price,total,attributes,fulfillment,metadata,product_origin_type,commercial_flow_type,revenue_owner_type,commission_eligible,platform_product_id)
  select o.organization_id,o.id,(r->>'catalog_item_id')::uuid,nullif(r->>'sku_id','')::uuid,r->>'sku_code',r->>'title',r->>'tag',1,r->>'unit_price',r->>'sale_price',r->>'total',coalesce(r->'attributes','[]'),coalesce(r->'fulfillment','{}'),coalesce(r->'metadata','{}')||'{"order_bump":true}'::jsonb,
    r->>'product_origin_type',r->>'commercial_flow_type',r->>'revenue_owner_type',coalesce((r->>'commission_eligible')::boolean,false),nullif(r->>'platform_product_id','')::uuid from jsonb_array_elements(p_rows) r;
  select round(sum(public.checkout_money(total)),2) into v_subtotal from public.sales_catalog_order_items where order_id=o.id;
  if v_subtotal is null or v_subtotal<=0 then raise exception 'CHECKOUT_EMPTY_CART'; end if;
  v_total:=round(v_subtotal-public.checkout_money(o.discount_total)+p_shipping,2);
  if v_total<=0 then raise exception 'CHECKOUT_INVALID_TOTAL'; end if;
  update public.sales_catalog_orders set subtotal=v_subtotal::text,total=v_total::text,shipping_total=p_shipping::text,shipping_method=p_shipping_method,
    metadata=coalesce(metadata,'{}')||jsonb_build_object('order_bump_product_ids',(select coalesce(jsonb_agg(r->>'catalog_item_id'),'[]') from jsonb_array_elements(p_rows) r),'order_bump_updated_at',now()),updated_at=now() where id=o.id returning * into o;
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',o.organization_id,'sales_catalog_order',o.id,'sales_catalog.checkout_cart_updated','Carrinho atualizado no checkout','O cliente confirmou as ofertas do pedido.','organization',array['sales_catalog','order_bump','lead_tracking'],
      jsonb_build_object('lead_id',o.lead_id,'conversation_id',o.conversation_id,'order_id',o.id,'previous_offers',v_existing,'selected_offers',v_next,'subtotal',v_subtotal,'shipping',p_shipping,'amount',v_total,'revision',o.checkout_revision));
  return to_jsonb(o);
end $$;
revoke all on function public.set_checkout_order_bumps(uuid,uuid,bigint,jsonb,numeric,text) from public,anon,authenticated;
grant execute on function public.set_checkout_order_bumps(uuid,uuid,bigint,jsonb,numeric,text) to service_role;

create or replace function public.begin_checkout_gateway_request(p_session_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare s public.sales_catalog_payment_sessions; o public.sales_catalog_orders;
begin
  select * into s from public.sales_catalog_payment_sessions where id=p_session_id;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  select * into o from public.sales_catalog_orders where id=s.order_id for update;
  if o.checkout_payment_lock is not null or o.payment_status::text in ('confirmed','refunded') then raise exception 'CHECKOUT_PAYMENT_BUSY'; end if;
  if exists(select 1 from public.sales_catalog_payment_sessions where order_id=o.id and metadata->>'gateway_request_inflight'='true') then raise exception 'CHECKOUT_PAYMENT_BUSY'; end if;
  update public.sales_catalog_payment_sessions set metadata=coalesce(metadata,'{}')||jsonb_build_object('gateway_request_inflight',true,'gateway_request_started_at',now()) where id=s.id;
end $$;
revoke all on function public.begin_checkout_gateway_request(uuid) from public,anon,authenticated;
grant execute on function public.begin_checkout_gateway_request(uuid) to service_role;

alter table public.sales_catalog_card_attempts add column if not exists effects_completed_state text;
alter table public.sales_catalog_card_attempts add column if not exists effects_claimed_at timestamptz;
create or replace function public.claim_checkout_payment_effects(p_attempt_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a public.sales_catalog_card_attempts;
begin
  update public.sales_catalog_card_attempts set effects_claimed_at=now()
    where id=p_attempt_id and state in ('approved','refunded') and effects_completed_state is distinct from state
      and (effects_claimed_at is null or effects_claimed_at<now()-interval '5 minutes') returning * into a;
  if not found then return null; end if;
  return to_jsonb(a);
end $$;
revoke all on function public.claim_checkout_payment_effects(uuid) from public,anon,authenticated;
grant execute on function public.claim_checkout_payment_effects(uuid) to service_role;
-- Inventory and its idempotency marker commit together before delivery side effects.
create or replace function public.deduct_transparent_checkout_inventory(p_attempt_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare a public.sales_catalog_card_attempts; o public.sales_catalog_orders; item record; stock record; v_inventory jsonb; v_quantity integer; v_next integer; v_status text; v_deductions jsonb:='[]';
begin
  select * into a from public.sales_catalog_card_attempts where id=p_attempt_id;
  if not found or a.state<>'approved' then raise exception 'CHECKOUT_PAYMENT_NOT_APPROVED'; end if;
  select * into o from public.sales_catalog_orders where id=a.order_id and organization_id=a.organization_id for update;
  if o.payment_status::text<>'confirmed' then raise exception 'CHECKOUT_PAYMENT_NOT_APPROVED'; end if;
  if o.metadata->>'inventory_deducted_at' is not null then return false; end if;
  for item in select sku_id,catalog_item_id,sum(greatest(coalesce(quantity,1),1))::integer as quantity from public.sales_catalog_order_items where order_id=o.id and organization_id=o.organization_id group by sku_id,catalog_item_id order by sku_id nulls last,catalog_item_id loop
    if item.sku_id is not null then
      select * into stock from public.sales_catalog_skus where id=item.sku_id and catalog_item_id=item.catalog_item_id and organization_id=o.organization_id for update;
      if not found then raise exception 'CHECKOUT_STOCK_NOT_FOUND'; end if;
      if stock.stock_quantity is null then continue; end if;
      v_quantity:=stock.stock_quantity;
      v_next:=greatest(0,v_quantity-item.quantity);
      v_status:=case when v_next>0 then 'in_stock' when stock.stock_status='on_backorder' then 'on_backorder' else 'out_of_stock' end;
      update public.sales_catalog_skus set stock_quantity=v_next,stock_status=v_status,updated_at=now(),metadata=coalesce(metadata,'{}')||jsonb_build_object('inventory_updated_at',now(),'inventory_updated_from_order_id',o.id,'inventory_update_reason','payment_approved') where id=stock.id;
      v_deductions:=v_deductions||jsonb_build_array(jsonb_build_object('kind','sku','sku_id',stock.id,'catalog_item_id',item.catalog_item_id,'deducted_quantity',item.quantity,'previous_quantity',v_quantity,'next_quantity',v_next,'next_status',v_status));
    elsif item.catalog_item_id is not null then
      select * into stock from public.intelligence_memory where id=item.catalog_item_id and organization_id=o.organization_id and memory_type='sales_catalog_item' for update;
      if not found then raise exception 'CHECKOUT_STOCK_NOT_FOUND'; end if;
      v_inventory:=coalesce(stock.metadata->'inventory','{}');
      if nullif(v_inventory->>'quantity','') is null then continue; end if;
      v_quantity:=(v_inventory->>'quantity')::integer;
      v_next:=greatest(0,v_quantity-item.quantity);
      v_status:=case when v_next>0 then 'in_stock' when coalesce(v_inventory->>'allow_backorder',v_inventory->>'allowBackorder','false')='true' then 'on_backorder' else 'out_of_stock' end;
      update public.intelligence_memory set updated_at=now(),metadata=coalesce(metadata,'{}')||jsonb_build_object('inventory',v_inventory||jsonb_build_object('quantity',v_next,'status',v_status),'inventory_updated_at',now(),'inventory_updated_from_order_id',o.id,'inventory_update_reason','payment_approved') where id=stock.id;
      v_deductions:=v_deductions||jsonb_build_array(jsonb_build_object('kind','product','product_id',stock.id,'deducted_quantity',item.quantity,'previous_quantity',v_quantity,'next_quantity',v_next,'next_status',v_status));
    end if;
  end loop;
  update public.sales_catalog_orders set metadata=coalesce(metadata,'{}')||jsonb_build_object('inventory_deducted_at',now(),'inventory_deducted_by','payment_gateway','inventory_deducted_source','checkout_card','inventory_deducted_payment_session_id',a.payment_session_id,'inventory_deducted_items',v_deductions) where id=o.id;
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',o.organization_id,'sales_catalog_order',o.id,'sales_catalog.inventory_deducted','Estoque conferido após pagamento','A baixa de estoque foi registrada junto ao pedido.','organization',array['sales_catalog','payment','lead_tracking'],jsonb_build_object('lead_id',o.lead_id,'order_id',o.id,'payment_session_id',a.payment_session_id,'deductions',v_deductions));
  return jsonb_array_length(v_deductions)>0;
end $$;
revoke all on function public.deduct_transparent_checkout_inventory(uuid) from public,anon,authenticated;
grant execute on function public.deduct_transparent_checkout_inventory(uuid) to service_role;
