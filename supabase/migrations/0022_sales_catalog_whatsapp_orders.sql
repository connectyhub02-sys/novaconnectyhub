-- Sales catalog WhatsApp orders
-- Persists conversational orders created from the sales catalog.

do $$
begin
  create type public.sales_catalog_order_status as enum (
    'draft',
    'pending_payment',
    'paid',
    'in_preparation',
    'shipped',
    'delivered',
    'cancelled',
    'needs_human'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.sales_catalog_payment_status as enum (
    'pending',
    'proof_sent',
    'confirmed',
    'failed',
    'refunded'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.sales_catalog_fulfillment_status as enum (
    'pending',
    'scheduled',
    'in_progress',
    'fulfilled',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.sales_catalog_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  source text not null default 'dashboard',
  status public.sales_catalog_order_status not null default 'draft',
  payment_status public.sales_catalog_payment_status not null default 'pending',
  fulfillment_status public.sales_catalog_fulfillment_status not null default 'pending',
  customer_name text,
  customer_phone text,
  customer_document text,
  customer_email text,
  destination_cep text,
  destination_address text,
  subtotal text,
  discount_total text,
  shipping_total text,
  total text,
  payment_method text,
  shipping_method text,
  agent_notes text,
  internal_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_catalog_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_catalog_orders(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  catalog_item_id uuid references public.intelligence_memory(id) on delete set null,
  title text not null,
  tag text,
  quantity integer not null default 1 check (quantity > 0 and quantity <= 100000),
  unit_price text,
  sale_price text,
  total text,
  attributes jsonb not null default '[]'::jsonb,
  fulfillment jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_catalog_orders_org_updated
  on public.sales_catalog_orders (organization_id, updated_at desc);

create index if not exists idx_sales_catalog_orders_org_status_updated
  on public.sales_catalog_orders (organization_id, status, updated_at desc);

create index if not exists idx_sales_catalog_orders_lead_updated
  on public.sales_catalog_orders (lead_id, updated_at desc)
  where lead_id is not null;

create index if not exists idx_sales_catalog_order_items_order
  on public.sales_catalog_order_items (order_id);

create index if not exists idx_sales_catalog_order_items_org
  on public.sales_catalog_order_items (organization_id, created_at desc);

drop trigger if exists trg_sales_catalog_orders_updated_at on public.sales_catalog_orders;
create trigger trg_sales_catalog_orders_updated_at
before update on public.sales_catalog_orders
for each row execute function public.touch_updated_at();

alter table public.sales_catalog_orders enable row level security;
alter table public.sales_catalog_order_items enable row level security;

drop policy if exists "sales catalog orders visible by organization" on public.sales_catalog_orders;
create policy "sales catalog orders visible by organization"
on public.sales_catalog_orders for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "sales catalog orders managed by organization admins" on public.sales_catalog_orders;
create policy "sales catalog orders managed by organization admins"
on public.sales_catalog_orders for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "sales catalog order items visible by organization" on public.sales_catalog_order_items;
create policy "sales catalog order items visible by organization"
on public.sales_catalog_order_items for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "sales catalog order items managed by organization admins" on public.sales_catalog_order_items;
create policy "sales catalog order items managed by organization admins"
on public.sales_catalog_order_items for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);
