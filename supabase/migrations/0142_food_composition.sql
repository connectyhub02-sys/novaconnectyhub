begin;

-- Food units retain separate financial rows. Recompute from the locked catalog at
-- insert, confirmed revision, and new payment start; never block a payment callback.
create function public.food_money_cents(p_text text) returns numeric
language plpgsql immutable set search_path=public as $$
declare v text:=regexp_replace(trim(p_text),'^R\$\s*','','i'); n numeric;
begin
  if position(',' in v)>0 then v:=replace(replace(v,'.',''),',','.'); end if;
  if v is null or v !~ '^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'CHECKOUT_INVALID_FOOD_PRICE'; end if;
  n:=v::numeric*100;
  if n>9007199254740991 then raise exception 'CHECKOUT_INVALID_FOOD_PRICE'; end if;
  return n;
end $$;

create function public.food_unit_cents(p jsonb,u jsonb) returns numeric
language plpgsql immutable set search_path=public as $$
declare s jsonb; f jsonb; c jsonb; g jsonb; opt jsonb; target jsonb;
  portions integer; maximum integer; count integer; used integer:=0; total numeric:=0; weighted numeric:=0;
  price numeric; option_total numeric:=0; fraction integer; targets jsonb;
  flavor_ids text[]:='{}'; option_keys text[]:='{}'; option_key text;
begin
  if p->>'enabled' is distinct from 'true' or p->>'pricing' not in ('fixed','highest','weighted')
    or p->>'pricing' is null or jsonb_typeof(u) is distinct from 'object'
    or jsonb_typeof(u->'flavors') is distinct from 'array' or jsonb_typeof(u->'options') is distinct from 'array'
    or jsonb_typeof(u->'note') is distinct from 'string' or length(u->>'note')>500 then raise exception 'CHECKOUT_INVALID_FOOD'; end if;
  select value into s from jsonb_array_elements(p->'sizes') where value->>'id'=u->>'sizeId' and value->>'active'='true';
  if s is null then raise exception 'CHECKOUT_INVALID_FOOD_SIZE'; end if;
  portions:=(s->>'portions')::integer; maximum:=(s->>'maxFlavors')::integer;
  if portions not between 1 and 12 or maximum not between 1 and portions or jsonb_array_length(u->'flavors')>maximum then raise exception 'CHECKOUT_INVALID_FOOD_PORTIONS'; end if;
  for c in select value from jsonb_array_elements(u->'flavors') loop
    select value into f from jsonb_array_elements(p->'flavors') where value->>'id'=c->>'flavorId' and value->>'active'='true';
    if f is null or c->>'flavorId'=any(flavor_ids) or coalesce(c->>'portions','') !~ '^[0-9]+$' then raise exception 'CHECKOUT_INVALID_FOOD_FLAVOR'; end if;
    count:=(c->>'portions')::integer;
    if count not between 1 and portions then raise exception 'CHECKOUT_INVALID_FOOD_PORTIONS'; end if;
    if exists(select 1 from jsonb_array_elements_text(f->'incompatibleWith') x where x=any(array(select value->>'flavorId' from jsonb_array_elements(u->'flavors')))) then raise exception 'CHECKOUT_INCOMPATIBLE_FOOD'; end if;
    flavor_ids:=array_append(flavor_ids,c->>'flavorId'); used:=used+count;
    if p->>'pricing'<>'fixed' then
      price:=public.food_money_cents(f->'prices'->>(s->>'id'));
      total:=greatest(total,price); weighted:=weighted+price*count;
    end if;
  end loop;
  if (jsonb_array_length(p->'flavors')>0 or p->>'pricing'<>'fixed') and used<>portions then raise exception 'CHECKOUT_INVALID_FOOD_PORTIONS'; end if;
  if p->>'pricing'='fixed' then total:=public.food_money_cents(s->>'price');
  elsif p->>'pricing'='weighted' then total:=round(weighted/portions); end if;
  for c in select value from jsonb_array_elements(u->'options') loop
    select value into g from jsonb_array_elements(p->'groups') where value->>'id'=c->>'groupId';
    select value into opt from jsonb_array_elements(g->'options') where value->>'id'=c->>'optionId' and value->>'active'='true';
    if g is null or opt is null or coalesce(c->>'quantity','') !~ '^[0-9]+$' then raise exception 'CHECKOUT_INVALID_FOOD_OPTION'; end if;
    count:=(c->>'quantity')::integer;
    if count not between 1 and least(30,(opt->>'maxQuantity')::integer) then raise exception 'CHECKOUT_INVALID_FOOD_OPTION'; end if;
    option_key:=(g->>'id')||':'||(opt->>'id')||':'||coalesce(c->>'flavorId','');
    if option_key=any(option_keys) then raise exception 'CHECKOUT_DUPLICATE_FOOD_OPTION'; end if;
    option_keys:=array_append(option_keys,option_key);
    fraction:=portions;
    if g->>'scope'='portion' then
      select (value->>'portions')::integer into fraction from jsonb_array_elements(u->'flavors') where value->>'flavorId'=c->>'flavorId';
      if fraction is null then raise exception 'CHECKOUT_INVALID_FOOD_TARGET'; end if;
    elsif g->>'scope' is distinct from 'unit' or nullif(c->>'flavorId','') is not null then raise exception 'CHECKOUT_INVALID_FOOD_TARGET'; end if;
    option_total:=option_total+round(public.food_money_cents(opt->>'price')*count*fraction/portions);
  end loop;
  for g in select value from jsonb_array_elements(p->'groups') loop
    targets:=case when g->>'scope'='portion' then u->'flavors' else '[{"flavorId":null}]'::jsonb end;
    for target in select value from jsonb_array_elements(targets) loop
      select coalesce(sum((value->>'quantity')::integer),0) into count from jsonb_array_elements(u->'options')
        where value->>'groupId'=g->>'id' and nullif(value->>'flavorId','') is not distinct from target->>'flavorId';
      if count<(g->>'min')::integer or count>(g->>'max')::integer then raise exception 'CHECKOUT_INVALID_FOOD_LIMIT'; end if;
    end loop;
  end loop;
  total:=total+option_total;
  if total<1 or total>9007199254740991 then raise exception 'CHECKOUT_INVALID_FOOD_PRICE'; end if;
  return total;
end $$;

create function public.assert_food_order_row(p_organization_id uuid,r jsonb) returns numeric
language plpgsql security definer set search_path=public as $$
declare m public.intelligence_memory; snapshot jsonb:=nullif(r->'metadata'->'food_composition','null'::jsonb); cents numeric;
begin
  select * into m from public.intelligence_memory where id=(r->>'catalog_item_id')::uuid and organization_id=p_organization_id and memory_type='sales_catalog_item' for share;
  if snapshot is null and coalesce(m.metadata->'food_composition'->>'enabled','false')<>'true' then return null; end if;
  if m.id is null or coalesce(m.metadata->>'status','active')<>'active' or r->>'quantity' is distinct from '1'
    or nullif(r->>'sku_id','') is not null or nullif(r->>'sale_price','') is not null
    or jsonb_array_length(snapshot->'units') is distinct from 1 or snapshot->>'version' is distinct from '1'
    or snapshot->>'pricing' is distinct from m.metadata->'food_composition'->>'pricing'
    or public.checkout_money(r->'metadata'->>'conversation_cart_attribute_modifier_total')<>0 then raise exception 'CHECKOUT_INVALID_FOOD'; end if;
  cents:=public.food_unit_cents(m.metadata->'food_composition',snapshot->'units'->0->'selection');
  if (snapshot->>'totalCents')::numeric is distinct from cents or (snapshot->'units'->0->>'totalCents')::numeric is distinct from cents
    or public.food_money_cents(r->>'total')<>cents or public.food_money_cents(r->>'unit_price')<>cents then raise exception 'CHECKOUT_FOOD_CHANGED'; end if;
  return cents/100;
end $$;

create function public.guard_food_order_item() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' and row(new.catalog_item_id,new.quantity,new.unit_price,new.sale_price,new.total,new.metadata->'food_composition',new.metadata->'conversation_cart_attribute_modifier_total')
    is not distinct from row(old.catalog_item_id,old.quantity,old.unit_price,old.sale_price,old.total,old.metadata->'food_composition',old.metadata->'conversation_cart_attribute_modifier_total') then return new; end if;
  perform public.assert_food_order_row(new.organization_id,to_jsonb(new));
  return new;
end $$;
create trigger sales_catalog_food_item_guard before insert or update of catalog_item_id,quantity,unit_price,sale_price,total,metadata
  on public.sales_catalog_order_items for each row execute function public.guard_food_order_item();

create function public.guard_food_payment_start() returns trigger
language plpgsql security definer set search_path=public as $$
declare r public.sales_catalog_order_items;
begin
  if tg_op='UPDATE' and (new.metadata->>'gateway_request_inflight' is distinct from 'true' or old.metadata->>'gateway_request_inflight'='true') then return new; end if;
  for r in select * from public.sales_catalog_order_items where order_id=new.order_id and organization_id=new.organization_id loop
    perform public.assert_food_order_row(new.organization_id,to_jsonb(r));
  end loop;
  return new;
end $$;
create trigger sales_catalog_food_payment_guard before insert or update of metadata on public.sales_catalog_payment_sessions
  for each row execute function public.guard_food_payment_start();

-- Preserve existing revision locking/retirement logic; only replace its catalog
-- price with an independently validated food-unit price before the usual checks.
do $$
declare definition text; needle text; replacement text;
begin
  select pg_get_functiondef('public.assert_sales_catalog_revision_payload(uuid,jsonb)'::regprocedure) into definition;
  definition:=replace(definition,chr(13),'');
  needle:='    if (nullif(r->>''unit_price'','''') is null) is distinct from (v_price is null)';
  replacement:='    if m.metadata->''food_composition''->>''enabled''=''true'' or nullif(r->''metadata''->''food_composition'',''null''::jsonb) is not null then
      v_price:=public.assert_food_order_row(o.organization_id,r)::text; v_sale_price:=null;
    end if;
'||needle;
  if position(replace(needle,chr(13),'') in definition)=0 or position('assert_food_order_row' in definition)>0 then raise exception 'FOOD_REVISION_PATCH_UNEXPECTED'; end if;
  execute replace(definition,replace(needle,chr(13),''),replace(replacement,chr(13),''));
end $$;

revoke all on function public.food_money_cents(text),public.food_unit_cents(jsonb,jsonb),public.assert_food_order_row(uuid,jsonb),public.guard_food_order_item(),public.guard_food_payment_start() from public,anon,authenticated;
grant execute on function public.food_money_cents(text),public.food_unit_cents(jsonb,jsonb),public.assert_food_order_row(uuid,jsonb),public.guard_food_order_item(),public.guard_food_payment_start() to service_role;

-- The same retirement protocol for a bearer checkout that may have no WhatsApp
-- conversation. The conversational entry point retains its strict scope checks.
do $$
declare definition text; needle text; replacement text;
begin
  select pg_get_functiondef('public.begin_sales_catalog_order_revision(uuid,uuid,uuid,uuid,bigint,text,uuid,jsonb)'::regprocedure) into definition;
  definition:=replace(definition,chr(13),'');
  definition:=replace(definition,'public.begin_sales_catalog_order_revision(','public.begin_sales_catalog_checkout_revision(');
  needle:='p_payload jsonb)';
  if position(replace(needle,chr(13),'') in definition)=0 then raise exception 'FOOD_CHECKOUT_SIGNATURE_UNEXPECTED'; end if;
  definition:=replace(definition,needle,'p_payload jsonb, p_session_id uuid)');
  needle:='    and lead_id=p_lead_id and conversation_id=p_conversation_id for update;';
  replacement:='    and lead_id is not distinct from p_lead_id and conversation_id is not distinct from p_conversation_id
    and exists(select 1 from public.sales_catalog_payment_sessions ps where ps.id=p_session_id and ps.organization_id=p_organization_id and ps.order_id=p_order_id and ps.provider=''asaas'') for update;';
  if position(replace(needle,chr(13),'') in definition)=0 then raise exception 'FOOD_CHECKOUT_SCOPE_UNEXPECTED'; end if;
  definition:=replace(definition,replace(needle,chr(13),''),replace(replacement,chr(13),''));
  needle:='  if not found or not exists(select 1 from public.conversations where id=p_conversation_id and organization_id=p_organization_id and lead_id=p_lead_id)
    or not exists(select 1 from public.leads where id=p_lead_id and organization_id=p_organization_id) then raise exception ''CHECKOUT_NOT_FOUND''; end if;';
  replacement:='  if not found or (p_conversation_id is not null and not exists(select 1 from public.conversations where id=p_conversation_id and organization_id=p_organization_id and lead_id=p_lead_id))
    or (p_lead_id is not null and not exists(select 1 from public.leads where id=p_lead_id and organization_id=p_organization_id)) then raise exception ''CHECKOUT_NOT_FOUND''; end if;';
  if position(replace(needle,chr(13),'') in definition)=0 then raise exception 'FOOD_CHECKOUT_CONTEXT_UNEXPECTED'; end if;
  execute replace(definition,replace(needle,chr(13),''),replace(replacement,chr(13),''));
end $$;
revoke all on function public.begin_sales_catalog_checkout_revision(uuid,uuid,uuid,uuid,bigint,text,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.begin_sales_catalog_checkout_revision(uuid,uuid,uuid,uuid,bigint,text,uuid,jsonb,uuid) to service_role;

-- BEGIN FOOD SEARCH: retain full-catalog search, now including configured flavors,
-- crusts and combo choices. Rebuild the expression index after changing its input.
create or replace function public.catalog_search_document(p_title text,p_content text,p_metadata jsonb) returns tsvector
language sql immutable parallel safe set search_path=public as $$
 select setweight(to_tsvector('portuguese',coalesce(p_metadata->>'title',p_title,'')),'A')
 || setweight(to_tsvector('portuguese',coalesce(p_metadata->>'category','')||' '||coalesce(p_metadata->'attributes','[]')::text||' '||coalesce(p_metadata->'food_composition','{}')::text),'B')
 || setweight(to_tsvector('portuguese',coalesce(p_metadata->>'description',p_content,'')),'D');
$$;
do $$ begin if to_regclass('public.catalog_runtime_search_idx') is not null then reindex index public.catalog_runtime_search_idx; end if; end $$;
-- This existing immutable invoker helper only transforms its arguments. Preserve
-- its ACL so callers authorized to maintain catalog indexes keep that access.
-- END FOOD SEARCH

commit;
