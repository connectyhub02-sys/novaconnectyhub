alter table public.billing_plans add column offer_kind text not null default 'plan' check(offer_kind in ('plan','product'));
alter table public.billing_plans drop constraint billing_plan_one_time_duration;
alter table public.billing_plans add constraint billing_plan_one_time_duration check(billing_cycle<>'one_time' or offer_kind='product' or access_duration_days is not null);
alter table public.organization_subscriptions add column subscription_kind text not null default 'plan' check(subscription_kind in ('plan','product'));
drop index public.idx_organization_subscriptions_active;
create unique index idx_organization_subscriptions_active on public.organization_subscriptions(organization_id)
  where status in ('pending','active','past_due','incomplete') and subscription_kind='plan';
create index product_subscription_buyer on public.organization_subscriptions(organization_id,plan_code) where subscription_kind='product';

-- One payment pipeline; product contracts never carry platform operating rights.
create or replace function public.create_product_purchase_intent(p_org uuid,p_user uuid,p_product uuid,p_amount numeric,p_terms jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare product public.platform_products; plan public.billing_plans; sub public.organization_subscriptions; inv uuid:=gen_random_uuid(); pay uuid:=gen_random_uuid(); ref text; meta jsonb; cycle_end timestamptz;
begin
  perform 1 from public.organizations where id=p_org and owner_id=p_user for update;
  if not found then raise exception 'PRODUCT_BUYER_MISMATCH'; end if;
  select * into product from public.platform_products where id=p_product and status='active' and owner_type='connectyhub' and sales_channel_type='direct';
  if not found or p_amount<=0 then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
  select * into sub from public.organization_subscriptions where organization_id=p_org and subscription_kind='product' and plan_code='product_'||p_product
    and status in ('pending','incomplete') order by created_at desc limit 1 for update;
  if found then return sub.id; end if;
  insert into public.billing_plans(plan_code,name,status,monthly_price_brl,included_credits,offer_kind,billing_cycle,billing_interval,access_duration_days)
    values('product_'||p_product,product.name,'draft',p_amount,coalesce((p_terms->>'included_credits')::numeric,0),'product',product.billing_cycle,product.billing_interval,null)
    on conflict(plan_code) do update set name=excluded.name,monthly_price_brl=excluded.monthly_price_brl,billing_cycle=excluded.billing_cycle,billing_interval=excluded.billing_interval
    returning * into plan;
  insert into public.organization_subscriptions(organization_id,plan_id,plan_code,status,billing_provider,payer_email,subscription_kind,metadata)
    values(p_org,plan.id,plan.plan_code,'pending','asaas',(select email from auth.users where id=p_user),'product',jsonb_build_object('commercial_terms',p_terms,'purchase_product_id',p_product)) returning * into sub;
  ref:='connectyhub_subscription:'||p_org||':'||sub.id||':'||inv||':'||pay;
  cycle_end:=case product.billing_interval when 'week' then now()+interval '7 days' when 'quarter' then now()+interval '3 months' when 'year' then now()+interval '1 year' else now()+interval '1 month' end;
  meta:=jsonb_build_object('commercial_terms',p_terms,'purchase_kind','product','purchase_product_id',p_product,'target_plan_code',plan.plan_code,'checkout_kind','initial',
    'external_reference',ref,'cycle_start_at',now(),'cycle_end_at',cycle_end,'checkout_url','/dashboard/meus-produtos/checkout/'||sub.id,'checkout_total_brl',p_amount,'plan_amount_brl',p_amount);
  insert into public.billing_invoices(id,organization_id,subscription_id,status,subtotal_brl,total_brl,provider,metadata)
    values(inv,p_org,sub.id,'open',p_amount,p_amount,'asaas',meta);
  insert into public.billing_invoice_items(invoice_id,organization_id,item_type,description,quantity,unit_price_brl,total_brl,credit_amount,metadata)
    values(inv,p_org,'plan',product.name,1,p_amount,p_amount,plan.included_credits,jsonb_build_object('platform_product_id',p_product,'recurrence',case when product.billing_cycle='recurring' then 'recurring' else 'one_time' end));
  insert into public.billing_payments(id,organization_id,subscription_id,invoice_id,status,provider,amount_brl,payload)
    values(pay,p_org,sub.id,inv,'pending','asaas',p_amount,meta);
  return sub.id;
end $$;
revoke all on function public.create_product_purchase_intent(uuid,uuid,uuid,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.create_product_purchase_intent(uuid,uuid,uuid,numeric,jsonb) to service_role;
