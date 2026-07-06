-- Sales catalog payment gateway and SKU foundation
-- Adds variant/SKU inventory and Mercado Pago-ready checkout sessions.

create table if not exists public.sales_catalog_skus (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  catalog_item_id uuid not null references public.intelligence_memory(id) on delete cascade,
  sku_code text not null,
  title text,
  attributes jsonb not null default '[]'::jsonb,
  price text,
  sale_price text,
  currency text not null default 'BRL',
  stock_status text not null default 'in_stock'
    check (stock_status in ('in_stock', 'out_of_stock', 'on_backorder')),
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  low_stock_threshold integer check (low_stock_threshold is null or low_stock_threshold >= 0),
  weight_grams integer check (weight_grams is null or weight_grams > 0),
  dimensions jsonb not null default '{}'::jsonb,
  media_ids text[] not null default array[]::text[],
  status text not null default 'active'
    check (status in ('active', 'draft', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku_code),
  unique (catalog_item_id, sku_code)
);

create index if not exists idx_sales_catalog_skus_org_item
  on public.sales_catalog_skus (organization_id, catalog_item_id, status);

create index if not exists idx_sales_catalog_skus_org_updated
  on public.sales_catalog_skus (organization_id, updated_at desc);

create table if not exists public.sales_catalog_payment_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'mercado_pago'
    check (provider in ('mercado_pago')),
  mode text not null default 'production'
    check (mode in ('production', 'sandbox')),
  status text not null default 'pending'
    check (status in ('pending', 'connected', 'disabled', 'error')),
  account_label text,
  provider_account_id text,
  public_key text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_scope text,
  token_expires_at timestamptz,
  connected_at timestamptz,
  last_error text,
  webhook_secret_encrypted text,
  webhook_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create index if not exists idx_sales_catalog_payment_integrations_org
  on public.sales_catalog_payment_integrations (organization_id, provider, status);

create table if not exists public.sales_catalog_payment_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.sales_catalog_orders(id) on delete cascade,
  integration_id uuid references public.sales_catalog_payment_integrations(id) on delete set null,
  provider text not null default 'mercado_pago'
    check (provider in ('mercado_pago')),
  method text not null default 'pix'
    check (method in ('pix', 'card', 'checkout_link')),
  status text not null default 'created'
    check (status in ('created', 'pending', 'approved', 'rejected', 'cancelled', 'expired', 'refunded', 'error')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'BRL',
  payer_email text,
  provider_payment_id text,
  provider_status text,
  provider_status_detail text,
  checkout_url text,
  pix_qr_code text,
  pix_qr_code_base64 text,
  pix_ticket_url text,
  idempotency_key text not null,
  external_reference text not null,
  expires_at timestamptz,
  paid_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id),
  unique (provider, idempotency_key)
);

create index if not exists idx_sales_catalog_payment_sessions_org_created
  on public.sales_catalog_payment_sessions (organization_id, created_at desc);

create index if not exists idx_sales_catalog_payment_sessions_order
  on public.sales_catalog_payment_sessions (order_id, created_at desc);

create table if not exists public.sales_catalog_payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'mercado_pago'
    check (provider in ('mercado_pago')),
  provider_event_id text,
  provider_payment_id text,
  organization_id uuid references public.organizations(id) on delete set null,
  payment_session_id uuid references public.sales_catalog_payment_sessions(id) on delete set null,
  event_type text,
  action text,
  signature_header text,
  request_id text,
  data_id text,
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index if not exists idx_sales_catalog_payment_webhook_events_provider_event
  on public.sales_catalog_payment_webhook_events (provider, provider_event_id)
  where provider_event_id is not null;

create index if not exists idx_sales_catalog_payment_webhook_events_org_received
  on public.sales_catalog_payment_webhook_events (organization_id, received_at desc)
  where organization_id is not null;

alter table public.sales_catalog_order_items
  add column if not exists sku_id uuid references public.sales_catalog_skus(id) on delete set null,
  add column if not exists sku_code text;

create index if not exists idx_sales_catalog_order_items_sku
  on public.sales_catalog_order_items (sku_id)
  where sku_id is not null;

alter table public.sales_catalog_orders
  add column if not exists latest_payment_session_id uuid references public.sales_catalog_payment_sessions(id) on delete set null;

create index if not exists idx_sales_catalog_orders_payment_session
  on public.sales_catalog_orders (latest_payment_session_id)
  where latest_payment_session_id is not null;

drop trigger if exists trg_sales_catalog_skus_updated_at on public.sales_catalog_skus;
create trigger trg_sales_catalog_skus_updated_at
before update on public.sales_catalog_skus
for each row execute function public.touch_updated_at();

drop trigger if exists trg_sales_catalog_payment_integrations_updated_at on public.sales_catalog_payment_integrations;
create trigger trg_sales_catalog_payment_integrations_updated_at
before update on public.sales_catalog_payment_integrations
for each row execute function public.touch_updated_at();

drop trigger if exists trg_sales_catalog_payment_sessions_updated_at on public.sales_catalog_payment_sessions;
create trigger trg_sales_catalog_payment_sessions_updated_at
before update on public.sales_catalog_payment_sessions
for each row execute function public.touch_updated_at();

alter table public.sales_catalog_skus enable row level security;
alter table public.sales_catalog_payment_integrations enable row level security;
alter table public.sales_catalog_payment_sessions enable row level security;
alter table public.sales_catalog_payment_webhook_events enable row level security;

drop policy if exists "sales catalog skus visible by organization" on public.sales_catalog_skus;
create policy "sales catalog skus visible by organization"
on public.sales_catalog_skus for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "sales catalog skus managed by organization admins" on public.sales_catalog_skus;
create policy "sales catalog skus managed by organization admins"
on public.sales_catalog_skus for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "sales catalog payment integrations visible by organization" on public.sales_catalog_payment_integrations;
create policy "sales catalog payment integrations visible by organization"
on public.sales_catalog_payment_integrations for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "sales catalog payment integrations managed by organization admins" on public.sales_catalog_payment_integrations;
create policy "sales catalog payment integrations managed by organization admins"
on public.sales_catalog_payment_integrations for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "sales catalog payment sessions visible by organization" on public.sales_catalog_payment_sessions;
create policy "sales catalog payment sessions visible by organization"
on public.sales_catalog_payment_sessions for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "sales catalog payment sessions managed by organization admins" on public.sales_catalog_payment_sessions;
create policy "sales catalog payment sessions managed by organization admins"
on public.sales_catalog_payment_sessions for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "sales catalog payment webhooks visible by organization" on public.sales_catalog_payment_webhook_events;
create policy "sales catalog payment webhooks visible by organization"
on public.sales_catalog_payment_webhook_events for select
using (
  public.is_platform_admin()
  or (organization_id is not null and public.is_organization_member(organization_id))
);

drop policy if exists "sales catalog payment webhooks managed by platform admins" on public.sales_catalog_payment_webhook_events;
create policy "sales catalog payment webhooks managed by platform admins"
on public.sales_catalog_payment_webhook_events for all
using (public.is_platform_admin())
with check (public.is_platform_admin());
