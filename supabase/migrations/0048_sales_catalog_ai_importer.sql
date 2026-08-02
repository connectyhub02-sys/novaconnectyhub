-- Sales catalog AI importer
-- Stores import jobs and reviewable draft items before publishing either
-- to the internal ConnectyHub checkout catalog or to tracked external buttons.

create table if not exists public.sales_catalog_import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  source_kind text not null
    check (source_kind in ('text', 'csv', 'excel', 'site', 'pdf', 'image', 'mixed')),
  target_mode text not null default 'review'
    check (target_mode in ('connectyhub_checkout', 'external_site', 'review')),
  default_sales_destination text not null default 'connectyhub_checkout'
    check (default_sales_destination in ('connectyhub_checkout', 'external_site', 'manual_handoff')),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'extracting', 'review_required', 'ready_to_publish', 'publishing', 'published', 'failed')),
  title text,
  input_url text,
  source_summary text,
  settings jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  error_message text,
  processed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_catalog_import_sources (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.sales_catalog_import_jobs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null
    check (kind in ('text', 'csv', 'excel', 'site', 'pdf', 'image', 'html', 'file')),
  file_name text,
  content_type text,
  file_size bigint,
  storage_url text,
  source_url text,
  text_excerpt text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_catalog_import_items (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.sales_catalog_import_jobs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'published', 'discarded', 'error')),
  sales_destination text not null default 'connectyhub_checkout'
    check (sales_destination in ('connectyhub_checkout', 'external_site', 'manual_handoff')),
  title text not null,
  description text,
  category text,
  price text,
  currency text not null default 'BRL',
  product_url text,
  image_url text,
  attributes jsonb not null default '[]'::jsonb,
  skus jsonb not null default '[]'::jsonb,
  add_ons jsonb not null default '[]'::jsonb,
  inventory jsonb not null default '{}'::jsonb,
  shipping jsonb not null default '{}'::jsonb,
  fulfillment jsonb not null default '{}'::jsonb,
  offer jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) not null default 0.500
    check (confidence >= 0 and confidence <= 1),
  warnings text[] not null default array[]::text[],
  source_evidence jsonb not null default '{}'::jsonb,
  published_catalog_item_id uuid references public.intelligence_memory(id) on delete set null,
  published_link_button_id uuid references public.intelligence_memory(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_catalog_import_events (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid references public.sales_catalog_import_jobs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  level text not null default 'info'
    check (level in ('info', 'warning', 'error')),
  event_type text not null,
  title text not null,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_catalog_import_jobs_org_created
  on public.sales_catalog_import_jobs (organization_id, created_at desc);

create index if not exists idx_sales_catalog_import_jobs_org_status
  on public.sales_catalog_import_jobs (organization_id, status, updated_at desc);

create index if not exists idx_sales_catalog_import_sources_job
  on public.sales_catalog_import_sources (import_job_id, created_at);

create index if not exists idx_sales_catalog_import_items_job
  on public.sales_catalog_import_items (import_job_id, created_at);

create index if not exists idx_sales_catalog_import_items_org_status
  on public.sales_catalog_import_items (organization_id, status, updated_at desc);

create index if not exists idx_sales_catalog_import_items_destination
  on public.sales_catalog_import_items (organization_id, sales_destination, status);

create index if not exists idx_sales_catalog_import_events_job
  on public.sales_catalog_import_events (import_job_id, created_at desc);

drop trigger if exists trg_sales_catalog_import_jobs_updated_at on public.sales_catalog_import_jobs;
create trigger trg_sales_catalog_import_jobs_updated_at
before update on public.sales_catalog_import_jobs
for each row execute function public.touch_updated_at();

drop trigger if exists trg_sales_catalog_import_items_updated_at on public.sales_catalog_import_items;
create trigger trg_sales_catalog_import_items_updated_at
before update on public.sales_catalog_import_items
for each row execute function public.touch_updated_at();

alter table public.sales_catalog_import_jobs enable row level security;
alter table public.sales_catalog_import_sources enable row level security;
alter table public.sales_catalog_import_items enable row level security;
alter table public.sales_catalog_import_events enable row level security;

drop policy if exists "sales catalog import jobs visible by organization" on public.sales_catalog_import_jobs;
create policy "sales catalog import jobs visible by organization"
on public.sales_catalog_import_jobs for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "sales catalog import jobs managed by organization admins" on public.sales_catalog_import_jobs;
create policy "sales catalog import jobs managed by organization admins"
on public.sales_catalog_import_jobs for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "sales catalog import sources visible by organization" on public.sales_catalog_import_sources;
create policy "sales catalog import sources visible by organization"
on public.sales_catalog_import_sources for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "sales catalog import sources managed by organization admins" on public.sales_catalog_import_sources;
create policy "sales catalog import sources managed by organization admins"
on public.sales_catalog_import_sources for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "sales catalog import items visible by organization" on public.sales_catalog_import_items;
create policy "sales catalog import items visible by organization"
on public.sales_catalog_import_items for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "sales catalog import items managed by organization admins" on public.sales_catalog_import_items;
create policy "sales catalog import items managed by organization admins"
on public.sales_catalog_import_items for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "sales catalog import events visible by organization" on public.sales_catalog_import_events;
create policy "sales catalog import events visible by organization"
on public.sales_catalog_import_events for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "sales catalog import events managed by organization admins" on public.sales_catalog_import_events;
create policy "sales catalog import events managed by organization admins"
on public.sales_catalog_import_events for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);
