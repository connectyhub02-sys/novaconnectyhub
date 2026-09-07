-- Buying the same recurring platform product renews its contract instead of creating
-- two concurrent subscriptions. One-time goods/credit purchases retain their flow.
alter function public.create_product_purchase_intent(uuid,uuid,uuid,numeric,jsonb) rename to create_product_purchase_intent_before_campaigns;
create function public.create_product_purchase_intent(p_org uuid,p_user uuid,p_product uuid,p_amount numeric,p_terms jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare s public.organization_subscriptions; product public.platform_products; start_at timestamptz; end_at timestamptz; result jsonb;
begin
 perform 1 from public.organizations where id=p_org and owner_id=p_user for update;
 if not found then raise exception 'PRODUCT_BUYER_MISMATCH'; end if;
 select * into product from public.platform_products where id=p_product and status='active' and owner_type='connectyhub' and sales_channel_type='direct';
 if not found then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
 if product.billing_cycle='recurring' then
  select * into s from public.organization_subscriptions where organization_id=p_org and subscription_kind='product' and plan_code='product_'||p_product and status in ('active','past_due') order by created_at desc limit 1 for update;
  if found then
   start_at:=greatest(now(),s.current_period_end);
   end_at:=start_at+case s.metadata#>>'{commercial_terms,billing_interval}' when 'week' then interval '7 days' when 'quarter' then interval '3 months' when 'semester' then interval '6 months' when 'year' then interval '1 year' else interval '1 month' end;
   result:=public.prepare_contract_renewal(s.id,s.current_period_end,start_at,end_at,'asaas',jsonb_build_object('target_plan_code',s.plan_code,'checkout_url','/dashboard/meus-produtos/checkout/'||s.id));
   return s.id;
  end if;
 end if;
 return public.create_product_purchase_intent_before_campaigns(p_org,p_user,p_product,p_amount,p_terms);
end $$;
revoke all on function public.create_product_purchase_intent(uuid,uuid,uuid,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.create_product_purchase_intent(uuid,uuid,uuid,numeric,jsonb) to service_role;
