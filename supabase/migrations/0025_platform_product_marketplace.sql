create table if not exists public.platform_products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique,
  slug text not null unique,
  name text not null,
  short_description text,
  commercial_description text not null default '',
  category text,
  status text not null default 'draft',
  marketplace_status text not null default 'hidden',
  price text,
  currency text not null default 'BRL',
  attributes jsonb not null default '[]'::jsonb,
  inventory jsonb not null default '{}'::jsonb,
  offer jsonb not null default '{}'::jsonb,
  fulfillment jsonb not null default '{}'::jsonb,
  shipping jsonb not null default '{}'::jsonb,
  skus jsonb not null default '[]'::jsonb,
  media jsonb not null default '[]'::jsonb,
  agent_tag text not null unique,
  agent_prompt text,
  sales_notes text,
  commission_percentage numeric(6,2) not null default 0,
  commission_base text not null default 'gross',
  commission_release_days integer not null default 15,
  recurring_commission_months integer not null default 0,
  refund_window_days integer not null default 7,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (product_code ~ '^[A-Z0-9_-]{2,64}$'),
  check (status in ('draft', 'active', 'paused', 'archived')),
  check (marketplace_status in ('hidden', 'visible', 'featured')),
  check (commission_percentage >= 0 and commission_percentage <= 100),
  check (commission_base in ('gross', 'net')),
  check (commission_release_days >= 0 and commission_release_days <= 365),
  check (recurring_commission_months >= 0 and recurring_commission_months <= 120),
  check (refund_window_days >= 0 and refund_window_days <= 365)
);

create index if not exists idx_platform_products_marketplace
  on public.platform_products (marketplace_status, status, updated_at desc);

create index if not exists idx_platform_products_category
  on public.platform_products (category)
  where category is not null;

create table if not exists public.platform_product_imports (
  id uuid primary key default gen_random_uuid(),
  platform_product_id uuid not null references public.platform_products(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  imported_by uuid references auth.users(id) on delete set null,
  local_catalog_item_id uuid references public.intelligence_memory(id) on delete set null,
  status text not null default 'active',
  local_title text,
  local_agent_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(platform_product_id, organization_id),
  check (status in ('active', 'paused', 'removed'))
);

create index if not exists idx_platform_product_imports_org
  on public.platform_product_imports (organization_id, created_at desc);

create index if not exists idx_platform_product_imports_product
  on public.platform_product_imports (platform_product_id, created_at desc);

create table if not exists public.platform_product_commissions (
  id uuid primary key default gen_random_uuid(),
  platform_product_id uuid not null references public.platform_products(id) on delete restrict,
  import_id uuid references public.platform_product_imports(id) on delete set null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid references public.sales_catalog_orders(id) on delete set null,
  payment_session_id uuid references public.sales_catalog_payment_sessions(id) on delete set null,
  status text not null default 'pending',
  currency text not null default 'BRL',
  sale_amount numeric(18,2) not null default 0,
  commission_percentage numeric(6,2) not null default 0,
  commission_amount numeric(18,2) not null default 0,
  release_at timestamptz,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('pending', 'available', 'paid', 'cancelled', 'blocked')),
  check (sale_amount >= 0),
  check (commission_percentage >= 0 and commission_percentage <= 100),
  check (commission_amount >= 0)
);

create index if not exists idx_platform_product_commissions_org
  on public.platform_product_commissions (organization_id, status, created_at desc);

create index if not exists idx_platform_product_commissions_product
  on public.platform_product_commissions (platform_product_id, created_at desc);

drop trigger if exists touch_platform_products_updated_at on public.platform_products;
create trigger touch_platform_products_updated_at
before update on public.platform_products
for each row execute function public.touch_updated_at();

drop trigger if exists touch_platform_product_imports_updated_at on public.platform_product_imports;
create trigger touch_platform_product_imports_updated_at
before update on public.platform_product_imports
for each row execute function public.touch_updated_at();

drop trigger if exists touch_platform_product_commissions_updated_at on public.platform_product_commissions;
create trigger touch_platform_product_commissions_updated_at
before update on public.platform_product_commissions
for each row execute function public.touch_updated_at();

alter table public.platform_products enable row level security;
alter table public.platform_product_imports enable row level security;
alter table public.platform_product_commissions enable row level security;

drop policy if exists "platform products visible to logged users" on public.platform_products;
create policy "platform products visible to logged users"
on public.platform_products for select
using (
  public.is_platform_admin()
  or (
    auth.uid() is not null
    and status = 'active'
    and marketplace_status in ('visible', 'featured')
  )
);

drop policy if exists "platform products managed by platform admins" on public.platform_products;
create policy "platform products managed by platform admins"
on public.platform_products for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "platform product imports visible to org members or platform admins" on public.platform_product_imports;
create policy "platform product imports visible to org members or platform admins"
on public.platform_product_imports for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "platform product imports managed by org members or platform admins" on public.platform_product_imports;
create policy "platform product imports managed by org members or platform admins"
on public.platform_product_imports for all
using (public.is_platform_admin() or public.is_organization_member(organization_id))
with check (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "platform product commissions visible to org members or platform admins" on public.platform_product_commissions;
create policy "platform product commissions visible to org members or platform admins"
on public.platform_product_commissions for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "platform product commissions managed by platform admins" on public.platform_product_commissions;
create policy "platform product commissions managed by platform admins"
on public.platform_product_commissions for all
using (public.is_platform_admin())
with check (public.is_platform_admin());
