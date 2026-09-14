-- Persist the confirmed location with the existing atomic checkout operations.
-- Verify the known function body before patching; preserve locks, claims, permissions and financial behavior.
do $patch$
declare v_oid regprocedure := 'public.finish_sales_catalog_order_revision(uuid,uuid,text,uuid)'::regprocedure; v_definition text; v_hash text;
begin
  select md5(replace(prosrc,chr(13),'')) into v_hash from pg_proc where oid=v_oid;
  if v_hash='f765b902eb2935f7553b0d868a6e3e66' then return; end if;
  if v_hash<>'53a255b7e523fd8dc1273d0aa361c5ae' then raise exception 'DELIVERY_SNAPSHOT_UNEXPECTED_FUNCTION: finish_sales_catalog_order_revision'; end if;
  v_definition:=pg_get_functiondef(v_oid);
  if position($old$'checkout_revised_at',now(),$old$ in v_definition)=0 then raise exception 'DELIVERY_SNAPSHOT_ANCHOR_MISSING'; end if;
  execute replace(v_definition,$old$'checkout_revised_at',now(),$old$,$new$'checkout_revised_at',now(),'shipping_quote',coalesce(v_shipping->'quote','{}'::jsonb),$new$);
  if (select md5(replace(prosrc,chr(13),'')) from pg_proc where oid=v_oid)<>'f765b902eb2935f7553b0d868a6e3e66' then raise exception 'DELIVERY_SNAPSHOT_HASH_MISMATCH'; end if;
end $patch$;

-- Customer, freight: retain an address-bound point for the saved delivery address.
do $patch$
declare v_oid regprocedure := 'public.set_checkout_delivery(uuid,bigint,jsonb,numeric,text,jsonb)'::regprocedure; v_definition text; v_hash text;
begin
  select md5(replace(prosrc,chr(13),'')) into v_hash from pg_proc where oid=v_oid;
  if v_hash='48db1c1bbff40145c47b10f5bea08311' then return; end if;
  if v_hash<>'fbd33e7e574f66f59495cf35774bda5c' then raise exception 'DELIVERY_SNAPSHOT_UNEXPECTED_FUNCTION: set_checkout_delivery'; end if;
  v_definition:=pg_get_functiondef(v_oid);
  if position($old$'billing_address',p_customer->>'destination_address', 'delivery_address',p_customer->>'destination_address'$old$ in v_definition)=0 then raise exception 'DELIVERY_SNAPSHOT_ANCHOR_MISSING'; end if;
  execute replace(v_definition,$old$'billing_address',p_customer->>'destination_address', 'delivery_address',p_customer->>'destination_address'$old$,$new$'billing_address',p_customer->>'destination_address', 'delivery_address',p_customer->>'destination_address',
    'delivery_location',jsonb_build_object('coordinates',p_quote->'coordinates','destination_address',p_customer->>'destination_address','cep',p_customer->>'destination_cep')$new$);
  if (select md5(replace(prosrc,chr(13),'')) from pg_proc where oid=v_oid)<>'48db1c1bbff40145c47b10f5bea08311' then raise exception 'DELIVERY_SNAPSHOT_HASH_MISMATCH'; end if;
end $patch$;
