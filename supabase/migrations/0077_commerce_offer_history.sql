create table if not exists public.lead_commerce_offer_states (
  organization_id uuid not null references public.organizations(id),
  lead_id uuid not null references public.leads(id),
  catalog_item_id uuid not null references public.intelligence_memory(id),
  status text not null check(status in ('shown','accepted','declined','removed')),
  surface text not null,
  updated_at timestamptz not null default now(),
  primary key(organization_id,lead_id,catalog_item_id)
);
alter table public.lead_commerce_offer_states enable row level security;
revoke all on public.lead_commerce_offer_states from anon,authenticated;
grant all on public.lead_commerce_offer_states to service_role;

-- Derive offer decisions from the same attributed event already stored in the lead timeline.
create or replace function public.sync_lead_commerce_offer_state() returns trigger language plpgsql set search_path=public as $$
declare v_lead uuid; v_product uuid; v_status text;
begin
  if new.event_type='sales_catalog.checkout_cart_updated' and new.organization_id is not null and coalesce(new.payload->>'lead_id','')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_lead:=(new.payload->>'lead_id')::uuid;
    if not exists(select 1 from public.leads where id=v_lead and organization_id=new.organization_id) then return new; end if;
    insert into public.lead_commerce_offer_states(organization_id,lead_id,catalog_item_id,status,surface)
      select new.organization_id,v_lead,m.id,
        case when exists(select 1 from jsonb_array_elements(coalesce(new.payload->'selected_offers','[]')) r where r->>0=m.id::text) then 'accepted' else 'removed' end,'checkout'
      from public.intelligence_memory m where m.organization_id=new.organization_id and m.memory_type='sales_catalog_item'
        and exists(select 1 from jsonb_array_elements(coalesce(new.payload->'selected_offers','[]')||coalesce(new.payload->'previous_offers','[]')) r where r->>0=m.id::text)
      on conflict(organization_id,lead_id,catalog_item_id) do update set status=excluded.status,surface=excluded.surface,updated_at=now();
    return new;
  end if;
  v_status := case new.event_type when 'sales_catalog.upsell_created' then 'accepted' when 'commerce.offer_shown' then 'shown' when 'commerce.offer_accepted' then 'accepted' when 'commerce.offer_declined' then 'declined' when 'commerce.offer_removed' then 'removed' when 'commerce.order_bump_selected' then 'accepted' when 'commerce.order_bump_unselected' then 'removed' else null end;
  if v_status is null or new.organization_id is null then return new; end if;
  if coalesce(new.payload->>'lead_id','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or coalesce(new.payload->>'offer_product_id','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return new; end if;
  v_lead := (new.payload->>'lead_id')::uuid;
  v_product := (new.payload->>'offer_product_id')::uuid;
  if not exists(select 1 from public.leads where id=v_lead and organization_id=new.organization_id) or not exists(select 1 from public.intelligence_memory where id=v_product and organization_id=new.organization_id and memory_type='sales_catalog_item') then return new; end if;
  insert into public.lead_commerce_offer_states(organization_id,lead_id,catalog_item_id,status,surface)
    values(new.organization_id,v_lead,v_product,v_status,coalesce(new.payload->>'surface','checkout'))
    on conflict(organization_id,lead_id,catalog_item_id) do update set status=excluded.status,surface=excluded.surface,updated_at=now()
      where excluded.status<>'shown' or lead_commerce_offer_states.status='shown';
  return new;
end $$;
drop trigger if exists sync_lead_commerce_offer_state on public.intelligence_events;
create trigger sync_lead_commerce_offer_state after insert on public.intelligence_events for each row execute function public.sync_lead_commerce_offer_state();

alter table public.sales_catalog_orders add column if not exists parent_order_id uuid references public.sales_catalog_orders(id);
create table if not exists public.sales_catalog_upsell_orders (
  parent_order_id uuid not null references public.sales_catalog_orders(id),
  catalog_item_id uuid not null references public.intelligence_memory(id),
  order_id uuid not null unique references public.sales_catalog_orders(id),
  primary key(parent_order_id,catalog_item_id)
);
alter table public.sales_catalog_upsell_orders enable row level security;
revoke all on public.sales_catalog_upsell_orders from anon,authenticated;
grant all on public.sales_catalog_upsell_orders to service_role;

create or replace function public.create_checkout_upsell_order(p_parent_id uuid,p_organization_id uuid,p_order_id uuid,p_product_id uuid,p_product_updated_at timestamptz,p_item jsonb,p_shipping numeric,p_shipping_method text)
returns uuid language plpgsql security definer set search_path=public as $$
declare o public.sales_catalog_orders; v_existing uuid; v_price numeric;
begin
  select * into o from public.sales_catalog_orders where id=p_parent_id and organization_id=p_organization_id for update;
  if not found or o.payment_status::text<>'confirmed' then raise exception 'CHECKOUT_PARENT_NOT_PAID'; end if;
  select order_id into v_existing from public.sales_catalog_upsell_orders where parent_order_id=o.id and catalog_item_id=p_product_id;
  if found then return v_existing; end if;
  if not exists(select 1 from public.intelligence_memory where id=p_product_id and organization_id=p_organization_id and memory_type='sales_catalog_item' and updated_at is not distinct from p_product_updated_at) then raise exception 'CHECKOUT_PRODUCT_CHANGED'; end if;
  v_price:=public.checkout_money(p_item->>'total');
  if v_price<=0 or p_shipping<0 then raise exception 'CHECKOUT_INVALID_TOTAL'; end if;
  insert into public.sales_catalog_orders(id,organization_id,parent_order_id,lead_id,conversation_id,source,status,payment_status,customer_name,customer_phone,customer_document,customer_email,destination_cep,destination_address,subtotal,total,discount_total,shipping_total,shipping_method,metadata)
    values(p_order_id,o.organization_id,o.id,o.lead_id,o.conversation_id,'checkout_upsell','pending_payment','pending',o.customer_name,o.customer_phone,o.customer_document,o.customer_email,o.destination_cep,o.destination_address,v_price::text,(v_price+p_shipping)::text,'0',p_shipping::text,p_shipping_method,
      jsonb_build_object('parent_order_id',o.id,'upsell_product_id',p_product_id,'agent_id',o.metadata->'agent_id','checkout_agent_id',o.metadata->'checkout_agent_id','upsell_accepted_at',now()));
  insert into public.sales_catalog_order_items(organization_id,order_id,catalog_item_id,sku_id,sku_code,title,tag,quantity,unit_price,sale_price,total,attributes,fulfillment,metadata,product_origin_type,commercial_flow_type,revenue_owner_type,commission_eligible,platform_product_id)
    values(o.organization_id,p_order_id,p_product_id,nullif(p_item->>'sku_id','')::uuid,p_item->>'sku_code',p_item->>'title',p_item->>'tag',1,p_item->>'unit_price',p_item->>'sale_price',p_item->>'total',coalesce(p_item->'attributes','[]'),coalesce(p_item->'fulfillment','{}'),coalesce(p_item->'metadata','{}')||jsonb_build_object('upsell',true,'parent_order_id',o.id),p_item->>'product_origin_type',p_item->>'commercial_flow_type',p_item->>'revenue_owner_type',coalesce((p_item->>'commission_eligible')::boolean,false),nullif(p_item->>'platform_product_id','')::uuid);
  insert into public.sales_catalog_upsell_orders values(o.id,p_product_id,p_order_id);
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',o.organization_id,'sales_catalog_order',p_order_id,'sales_catalog.upsell_created','Oferta adicional selecionada','Novo pedido vinculado à compra original, aguardando confirmação do pagamento.','organization',array['sales_catalog','upsell','lead_tracking'],
      jsonb_build_object('lead_id',o.lead_id,'conversation_id',o.conversation_id,'order_id',p_order_id,'parent_order_id',o.id,'product_id',p_product_id,'offer_product_id',p_product_id,'surface','confirmation','amount',v_price+p_shipping,'shipping',p_shipping));
  return p_order_id;
end $$;
revoke all on function public.create_checkout_upsell_order(uuid,uuid,uuid,uuid,timestamptz,jsonb,numeric,text) from public,anon,authenticated;
grant execute on function public.create_checkout_upsell_order(uuid,uuid,uuid,uuid,timestamptz,jsonb,numeric,text) to service_role;
