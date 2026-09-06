create table public.platform_product_contents (
  product_id uuid primary key references public.platform_products(id) on delete restrict,
  body text not null default '', files jsonb not null default '[]', updated_at timestamptz not null default now()
);
create table public.platform_product_entitlements (
  id uuid primary key default gen_random_uuid(), buyer_user_id uuid references auth.users(id),
  product_id uuid not null references public.platform_products(id) on delete restrict,
  source_type text not null check(source_type in ('billing','store')),
  source_item_id uuid not null, payment_id uuid not null, order_id uuid,
  billing_organization_id uuid references public.organizations(id),
  title text not null, billing_cycle text not null check(billing_cycle in ('one_time','recurring')),
  state text not null default 'active' check(state in ('active','revoked','review')),
  starts_at timestamptz not null default now(), ends_at timestamptz,
  metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(source_type,source_item_id,payment_id)
);
create index platform_product_library_buyer on public.platform_product_entitlements(buyer_user_id,state);
alter table public.platform_product_contents enable row level security;
alter table public.platform_product_entitlements enable row level security;
revoke all on public.platform_product_contents,public.platform_product_entitlements from anon,authenticated;
grant all on public.platform_product_contents,public.platform_product_entitlements to service_role;
insert into storage.buckets(id,name,public) values('platform-deliverables','platform-deliverables',false) on conflict(id) do update set public=false;

create or replace function public.snapshot_platform_product_sale() returns trigger
language plpgsql security definer set search_path=public as $$
declare p public.platform_products;
begin
  if new.platform_product_id is null then return new; end if;
  select * into p from public.platform_products where id=new.platform_product_id;
  if found then
    new.metadata:=coalesce(new.metadata,'{}')||jsonb_build_object('billing_cycle',p.billing_cycle,'billing_interval',p.billing_interval,'platform_product_id',p.id);
  end if;
  return new;
end $$;
create trigger snapshot_platform_product_sale before insert on public.sales_catalog_order_items for each row execute function public.snapshot_platform_product_sale();

create or replace function public.sync_billing_product_entitlements(p_payment uuid) returns void
language plpgsql security definer set search_path=public as $$
declare p public.billing_payments; item public.billing_invoice_items; product uuid; buyer uuid; cycle text;
begin
  select * into p from public.billing_payments where id=p_payment;
  if not found then return; end if;
  if p.status='refunded' then
    update public.platform_product_entitlements set state='revoked',updated_at=now() where source_type='billing' and payment_id=p.id;
    return;
  end if;
  if p.status<>'approved' then return; end if;
  select owner_id into buyer from public.organizations where id=p.organization_id;
  for item in select * from public.billing_invoice_items where invoice_id=p.invoice_id and organization_id=p.organization_id loop
    if coalesce(item.metadata->>'platform_product_id','') !~* '^[0-9a-f-]{36}$' then continue; end if;
    product:=(item.metadata->>'platform_product_id')::uuid;
    cycle:=case when item.metadata->>'recurrence' in ('monthly','weekly','quarterly','yearly','recurring') then 'recurring' else 'one_time' end;
    insert into public.platform_product_entitlements(buyer_user_id,product_id,source_type,source_item_id,payment_id,billing_organization_id,title,billing_cycle,ends_at,metadata)
      values(buyer,product,'billing',item.id,p.id,p.organization_id,item.description,cycle,
        case when cycle='recurring' then (p.payload->>'cycle_end_at')::timestamptz else null end,
        jsonb_build_object('invoice_id',p.invoice_id,'source','confirmed_billing_payment')) on conflict(source_type,source_item_id,payment_id) do update set ends_at=excluded.ends_at,updated_at=now();
  end loop;
end $$;

create or replace function public.sync_store_product_entitlements(p_order uuid) returns void
language plpgsql security definer set search_path=public as $$
declare o public.sales_catalog_orders; item public.sales_catalog_order_items; buyer uuid; cycle text; approved_payment uuid;
begin
  select * into o from public.sales_catalog_orders where id=p_order;
  if not found then return; end if;
  if o.payment_status='refunded' then
    update public.platform_product_entitlements set state='revoked',updated_at=now() where source_type='store' and order_id=o.id;
    return;
  end if;
  if o.payment_status<>'confirmed' then return; end if;
  select id into approved_payment from public.sales_catalog_payment_sessions where order_id=o.id and status='approved' order by created_at desc limit 1;
  if approved_payment is null then return; end if;
  -- An email verified by the authentication service binds the paid purchase; cookies are not authorization.
  select id into buyer from auth.users where lower(email)=lower(o.customer_email) and email_confirmed_at is not null order by created_at limit 1;
  for item in select * from public.sales_catalog_order_items where order_id=o.id and platform_product_id is not null and revenue_owner_type='connectyhub' loop
    cycle:=coalesce(item.metadata->>'billing_cycle','one_time');
    insert into public.platform_product_entitlements(buyer_user_id,product_id,source_type,source_item_id,payment_id,order_id,title,billing_cycle,state,metadata)
      values(buyer,item.platform_product_id,'store',item.id,approved_payment,o.id,item.title,cycle,
        case when item.metadata ? 'billing_cycle' then 'active' else 'review' end,
        jsonb_build_object('source','confirmed_store_payment','source_organization_id',o.organization_id,'lead_id',o.lead_id)) on conflict do nothing;
  end loop;
end $$;

create or replace function public.sync_product_entitlement_trigger() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name='billing_payments' then perform public.sync_billing_product_entitlements(new.id);
  elsif tg_table_name='sales_catalog_payment_sessions' then perform public.sync_store_product_entitlements(new.order_id);
  else perform public.sync_store_product_entitlements(new.id); end if;
  return new;
end $$;
create trigger billing_product_library after insert or update of status,payload on public.billing_payments for each row execute function public.sync_product_entitlement_trigger();
create trigger store_product_library after update of payment_status on public.sales_catalog_orders for each row execute function public.sync_product_entitlement_trigger();
create trigger store_session_product_library after update of status on public.sales_catalog_payment_sessions for each row execute function public.sync_product_entitlement_trigger();

create or replace function public.claim_verified_product_purchases(p_user uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  update public.platform_product_entitlements e set buyer_user_id=p_user,updated_at=now()
    from public.sales_catalog_orders o,auth.users u
    where u.id=p_user and u.email_confirmed_at is not null and lower(o.customer_email)=lower(u.email)
      and e.order_id=o.id and e.source_type='store' and e.buyer_user_id is null;
end $$;
revoke all on function public.sync_billing_product_entitlements(uuid),public.sync_store_product_entitlements(uuid),public.claim_verified_product_purchases(uuid) from public,anon,authenticated;
grant execute on function public.sync_billing_product_entitlements(uuid),public.sync_store_product_entitlements(uuid),public.claim_verified_product_purchases(uuid) to service_role;
