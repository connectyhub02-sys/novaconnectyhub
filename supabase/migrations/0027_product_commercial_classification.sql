-- Product commercial classification
-- Separates client-owned sales, ConnectyHub resale with commission, and ConnectyHub direct sales.

alter table public.platform_products
  add column if not exists owner_type text not null default 'connectyhub',
  add column if not exists sales_channel_type text not null default 'resale',
  add column if not exists revenue_owner_type text not null default 'connectyhub',
  add column if not exists commission_policy_type text not null default 'percentage',
  add column if not exists payout_target_type text not null default 'connectyhub';

alter table public.platform_products
  drop constraint if exists platform_products_owner_type_check,
  drop constraint if exists platform_products_sales_channel_type_check,
  drop constraint if exists platform_products_revenue_owner_type_check,
  drop constraint if exists platform_products_commission_policy_type_check,
  drop constraint if exists platform_products_payout_target_type_check;

alter table public.platform_products
  add constraint platform_products_owner_type_check
    check (owner_type in ('connectyhub', 'client', 'external_provider')),
  add constraint platform_products_sales_channel_type_check
    check (sales_channel_type in ('direct', 'resale', 'affiliate', 'marketplace')),
  add constraint platform_products_revenue_owner_type_check
    check (revenue_owner_type in ('connectyhub', 'client', 'split', 'external_provider')),
  add constraint platform_products_commission_policy_type_check
    check (commission_policy_type in ('none', 'percentage', 'fixed', 'custom')),
  add constraint platform_products_payout_target_type_check
    check (payout_target_type in ('connectyhub', 'client', 'split', 'external_provider'));

create index if not exists idx_platform_products_commercial_flow
  on public.platform_products (owner_type, sales_channel_type, revenue_owner_type, commission_policy_type);

alter table public.platform_product_imports
  add column if not exists sales_channel_type text not null default 'resale',
  add column if not exists revenue_owner_type text not null default 'connectyhub',
  add column if not exists commission_policy_type text not null default 'percentage',
  add column if not exists commission_snapshot jsonb not null default '{}'::jsonb;

alter table public.platform_product_imports
  drop constraint if exists platform_product_imports_sales_channel_type_check,
  drop constraint if exists platform_product_imports_revenue_owner_type_check,
  drop constraint if exists platform_product_imports_commission_policy_type_check;

alter table public.platform_product_imports
  add constraint platform_product_imports_sales_channel_type_check
    check (sales_channel_type in ('resale', 'affiliate', 'marketplace')),
  add constraint platform_product_imports_revenue_owner_type_check
    check (revenue_owner_type in ('connectyhub', 'split', 'external_provider')),
  add constraint platform_product_imports_commission_policy_type_check
    check (commission_policy_type in ('percentage', 'fixed', 'custom'));

alter table public.sales_catalog_orders
  add column if not exists commercial_flow_type text not null default 'client_direct',
  add column if not exists revenue_owner_type text not null default 'client',
  add column if not exists contains_platform_products boolean not null default false,
  add column if not exists commission_eligible boolean not null default false;

alter table public.sales_catalog_orders
  drop constraint if exists sales_catalog_orders_commercial_flow_type_check,
  drop constraint if exists sales_catalog_orders_revenue_owner_type_check;

alter table public.sales_catalog_orders
  add constraint sales_catalog_orders_commercial_flow_type_check
    check (commercial_flow_type in ('client_direct', 'connectyhub_resale', 'connectyhub_direct', 'external_marketplace')),
  add constraint sales_catalog_orders_revenue_owner_type_check
    check (revenue_owner_type in ('client', 'connectyhub', 'split', 'external_provider'));

alter table public.sales_catalog_order_items
  add column if not exists product_origin_type text not null default 'client',
  add column if not exists commercial_flow_type text not null default 'client_direct',
  add column if not exists revenue_owner_type text not null default 'client',
  add column if not exists commission_eligible boolean not null default false,
  add column if not exists platform_product_id uuid references public.platform_products(id) on delete set null,
  add column if not exists platform_product_import_id uuid references public.platform_product_imports(id) on delete set null;

alter table public.sales_catalog_order_items
  drop constraint if exists sales_catalog_order_items_product_origin_type_check,
  drop constraint if exists sales_catalog_order_items_commercial_flow_type_check,
  drop constraint if exists sales_catalog_order_items_revenue_owner_type_check;

alter table public.sales_catalog_order_items
  add constraint sales_catalog_order_items_product_origin_type_check
    check (product_origin_type in ('client', 'connectyhub', 'external_provider')),
  add constraint sales_catalog_order_items_commercial_flow_type_check
    check (commercial_flow_type in ('client_direct', 'connectyhub_resale', 'connectyhub_direct', 'external_marketplace')),
  add constraint sales_catalog_order_items_revenue_owner_type_check
    check (revenue_owner_type in ('client', 'connectyhub', 'split', 'external_provider'));

create index if not exists idx_sales_catalog_order_items_commercial_flow
  on public.sales_catalog_order_items (organization_id, commercial_flow_type, created_at desc);

create index if not exists idx_sales_catalog_order_items_platform_product
  on public.sales_catalog_order_items (platform_product_id, created_at desc)
  where platform_product_id is not null;

alter table public.sales_catalog_payment_sessions
  add column if not exists payment_owner_type text not null default 'client',
  add column if not exists commercial_flow_type text not null default 'client_direct',
  add column if not exists revenue_owner_type text not null default 'client',
  add column if not exists commission_context jsonb not null default '{}'::jsonb;

alter table public.sales_catalog_payment_sessions
  drop constraint if exists sales_catalog_payment_sessions_payment_owner_type_check,
  drop constraint if exists sales_catalog_payment_sessions_commercial_flow_type_check,
  drop constraint if exists sales_catalog_payment_sessions_revenue_owner_type_check;

alter table public.sales_catalog_payment_sessions
  add constraint sales_catalog_payment_sessions_payment_owner_type_check
    check (payment_owner_type in ('client', 'connectyhub', 'split', 'external_provider')),
  add constraint sales_catalog_payment_sessions_commercial_flow_type_check
    check (commercial_flow_type in ('client_direct', 'connectyhub_resale', 'connectyhub_direct', 'external_marketplace')),
  add constraint sales_catalog_payment_sessions_revenue_owner_type_check
    check (revenue_owner_type in ('client', 'connectyhub', 'split', 'external_provider'));

create index if not exists idx_sales_catalog_payment_sessions_commercial_flow
  on public.sales_catalog_payment_sessions (organization_id, commercial_flow_type, created_at desc);

update public.sales_catalog_order_items
set
  product_origin_type = 'connectyhub',
  commercial_flow_type = 'connectyhub_resale',
  revenue_owner_type = 'connectyhub',
  commission_eligible = true,
  platform_product_id = (metadata->>'platform_product_id')::uuid
where metadata->>'platform_product_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

update public.sales_catalog_orders orders
set
  commercial_flow_type = 'connectyhub_resale',
  revenue_owner_type = 'connectyhub',
  contains_platform_products = true,
  commission_eligible = true
where exists (
  select 1
  from public.sales_catalog_order_items items
  where items.order_id = orders.id
    and items.product_origin_type = 'connectyhub'
);

update public.sales_catalog_payment_sessions
set
  payment_owner_type = 'connectyhub',
  commercial_flow_type = 'connectyhub_resale',
  revenue_owner_type = 'connectyhub',
  commission_context = coalesce(metadata, '{}'::jsonb)
where metadata->>'payment_owner' = 'connectyhub'
   or metadata->>'platform_product_marketplace' = 'true';
