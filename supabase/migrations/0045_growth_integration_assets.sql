-- Growth integrations normalized assets and metric snapshots.
-- Stores OAuth-discovered Meta/Google accounts, pages and campaign snapshots
-- so dashboards, comment-to-direct campaigns and traffic AI can use one model.

create table if not exists public.integration_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_integration_id uuid references public.organization_integrations(id) on delete cascade,
  provider_id text not null references public.integration_providers(id) on delete restrict,
  asset_type text not null
    check (
      asset_type in (
        'meta_ad_account',
        'facebook_page',
        'instagram_business_account',
        'google_ads_customer',
        'google_business_profile',
        'google_search_console_site',
        'meta_campaign',
        'google_campaign',
        'meta_post',
        'google_keyword'
      )
    ),
  external_id text not null,
  parent_external_id text,
  label text not null default '',
  status text not null default 'available'
    check (status in ('available', 'selected', 'disabled', 'error', 'archived')),
  is_selected boolean not null default false,
  permissions text[] not null default '{}'::text[],
  metrics_summary jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_integration_assets_provider_external_unique
  on public.integration_assets (organization_id, provider_id, asset_type, external_id);

create index if not exists idx_integration_assets_org_provider
  on public.integration_assets (organization_id, provider_id, asset_type, status, updated_at desc);

create index if not exists idx_integration_assets_selected
  on public.integration_assets (organization_id, provider_id, is_selected)
  where is_selected = true;

create index if not exists idx_integration_assets_raw_payload
  on public.integration_assets using gin (raw_payload);

create table if not exists public.integration_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_integration_id uuid references public.organization_integrations(id) on delete set null,
  provider_id text not null references public.integration_providers(id) on delete restrict,
  asset_id uuid references public.integration_assets(id) on delete set null,
  resource_type text not null
    check (
      resource_type in (
        'ad_account',
        'campaign',
        'ad_set',
        'ad',
        'post',
        'page',
        'instagram_account',
        'customer',
        'keyword',
        'site'
      )
    ),
  external_id text not null,
  label text not null default '',
  date_start date,
  date_stop date,
  metrics jsonb not null default '{}'::jsonb,
  dimensions jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_integration_metric_snapshots_unique_window
  on public.integration_metric_snapshots (
    organization_id,
    provider_id,
    resource_type,
    external_id,
    coalesce(date_start, '1970-01-01'::date),
    coalesce(date_stop, '1970-01-01'::date)
  );

create index if not exists idx_integration_metric_snapshots_org_collected
  on public.integration_metric_snapshots (organization_id, provider_id, collected_at desc);

create index if not exists idx_integration_metric_snapshots_asset_collected
  on public.integration_metric_snapshots (asset_id, collected_at desc);

create index if not exists idx_integration_metric_snapshots_metrics
  on public.integration_metric_snapshots using gin (metrics);

drop trigger if exists touch_integration_assets_updated_at on public.integration_assets;
create trigger touch_integration_assets_updated_at
before update on public.integration_assets
for each row execute function public.touch_updated_at();

alter table public.integration_assets enable row level security;
alter table public.integration_metric_snapshots enable row level security;

drop policy if exists "integration assets visible by members" on public.integration_assets;
create policy "integration assets visible by members"
on public.integration_assets for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "integration assets managed by org admins" on public.integration_assets;
create policy "integration assets managed by org admins"
on public.integration_assets for all
using (public.is_platform_admin() or public.is_organization_admin(organization_id))
with check (public.is_platform_admin() or public.is_organization_admin(organization_id));

drop policy if exists "integration metric snapshots visible by members" on public.integration_metric_snapshots;
create policy "integration metric snapshots visible by members"
on public.integration_metric_snapshots for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "integration metric snapshots managed by org admins" on public.integration_metric_snapshots;
create policy "integration metric snapshots managed by org admins"
on public.integration_metric_snapshots for all
using (public.is_platform_admin() or public.is_organization_admin(organization_id))
with check (public.is_platform_admin() or public.is_organization_admin(organization_id));

update public.integration_providers
set
  status = 'active',
  auth_type = 'oauth',
  plan_codes = array['pro', 'scale']::text[],
  feature_flags = coalesce(feature_flags, '{}'::jsonb) || jsonb_build_object(
    'guided_oauth', true,
    'normalized_assets', true,
    'comment_to_direct_ready', true,
    'organic_insights_ready', true,
    'paid_traffic_scale_only', true
  ),
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'phase', 'phase_2_growth_assets',
    'normalized_tables', array['integration_assets', 'integration_metric_snapshots']::text[],
    'pro_features', array['meta_social_inbox', 'meta_comment_to_direct', 'meta_organic_insights']::text[],
    'scale_features', array['meta_ads_analytics', 'ai_traffic_manager']::text[]
  ),
  updated_at = now()
where id = 'meta-ads';

update public.integration_providers
set
  status = 'active',
  auth_type = 'oauth',
  plan_codes = array['scale']::text[],
  feature_flags = coalesce(feature_flags, '{}'::jsonb) || jsonb_build_object(
    'guided_oauth', true,
    'normalized_assets', true,
    'paid_traffic_scale_only', true
  ),
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'phase', 'phase_2_growth_assets',
    'normalized_tables', array['integration_assets', 'integration_metric_snapshots']::text[],
    'scale_features', array['google_ads_analytics', 'ai_traffic_manager']::text[]
  ),
  updated_at = now()
where id = 'google-growth';
