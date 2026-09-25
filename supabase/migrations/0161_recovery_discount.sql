-- Optional payment-recovery discount chosen by the store owner in Automações.
-- Empty (null) means no discount: nothing is ever offered unless the owner sets it.
alter table public.automation_policies add column if not exists recovery_discount_percent numeric(4,2)
  check (recovery_discount_percent is null or (recovery_discount_percent>0 and recovery_discount_percent<=50));

-- The existing two-step order revision (claim, retire the previous charge, finish) accepts an
-- optional discount_total. The current definitions (0132 + 0140 + 0142 patches) are patched in
-- place at known anchors; without that key both functions behave exactly as before.
do $$
declare definition text; needle text;
begin
  select replace(pg_get_functiondef('public.assert_sales_catalog_revision_payload(uuid,jsonb)'::regprocedure),chr(13),'') into definition;
  if position('v_discount' in definition)>0 then return; end if;
  needle:='  v_total:=round(v_subtotal-public.checkout_money(o.discount_total)+v_shipping,2);';
  if position(needle in definition)=0 or position('v_price text; v_sale_price text;' in definition)=0 then raise exception 'RECOVERY_DISCOUNT_ASSERT_UNEXPECTED'; end if;
  definition:=replace(definition,'v_price text; v_sale_price text;','v_price text; v_sale_price text; v_discount numeric;');
  definition:=replace(definition,needle,'  -- A revision may carry a new discount (payment recovery); otherwise the order keeps its own.
  v_discount:=case when p_payload ? ''discount_total'' then (p_payload->>''discount_total'')::numeric else public.checkout_money(o.discount_total) end;
  if v_discount is null or v_discount::text in (''NaN'',''Infinity'',''-Infinity'') or v_discount<0 or round(v_discount,2)<>v_discount or v_discount>v_subtotal then raise exception ''CHECKOUT_INVALID_TOTAL''; end if;
  v_total:=round(v_subtotal-v_discount+v_shipping,2);');
  execute definition;
end $$;

do $$
declare definition text; needle text;
begin
  select replace(pg_get_functiondef('public.finish_sales_catalog_order_revision(uuid,uuid,text,uuid)'::regprocedure),chr(13),'') into definition;
  if position('discount_total=case when r.payload' in definition)>0 then return; end if;
  needle:='update public.sales_catalog_orders set subtotal=v_subtotal::text,total=(r.payload->>''expected_total''),';
  if position(needle in definition)=0 then raise exception 'RECOVERY_DISCOUNT_FINISH_UNEXPECTED'; end if;
  execute replace(definition,needle,needle||'
    discount_total=case when r.payload ? ''discount_total'' then (r.payload->>''discount_total'') else discount_total end,');
end $$;

revoke all on function public.assert_sales_catalog_revision_payload(uuid,jsonb),public.finish_sales_catalog_order_revision(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.assert_sales_catalog_revision_payload(uuid,jsonb),public.finish_sales_catalog_order_revision(uuid,uuid,text,uuid) to service_role;

notify pgrst, 'reload schema';
