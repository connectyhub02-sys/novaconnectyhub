-- Lead-aware push subscriptions and push campaign foundation.
-- This lets ConnectyHub store browser push consent in the lead file and later
-- send push campaigns to the customer's own leads.

alter table public.push_subscriptions
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null,
  add column if not exists lead_phone text,
  add column if not exists subscription_scope text not null default 'platform',
  add column if not exists traffic_source text,
  add column if not exists consent_status text not null default 'granted',
  add column if not exists last_campaign_at timestamptz,
  add column if not exists unsubscribed_at timestamptz;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_subscription_scope_check,
  add constraint push_subscriptions_subscription_scope_check
    check (subscription_scope in ('platform', 'client'));

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_consent_status_check,
  add constraint push_subscriptions_consent_status_check
    check (consent_status in ('granted', 'denied', 'default', 'prompt', 'unknown', 'unsubscribed'));

create index if not exists idx_push_subscriptions_org_lead
  on public.push_subscriptions (organization_id, lead_id, last_seen_at desc)
  where organization_id is not null and lead_id is not null;

create index if not exists idx_push_subscriptions_org_active
  on public.push_subscriptions (organization_id, subscription_scope, last_seen_at desc)
  where organization_id is not null
    and permission = 'granted'
    and unsubscribed_at is null;

create index if not exists idx_push_subscriptions_lead_phone
  on public.push_subscriptions (organization_id, lead_phone, last_seen_at desc)
  where organization_id is not null and lead_phone is not null;

drop policy if exists "push subscriptions visible by organization" on public.push_subscriptions;
create policy "push subscriptions visible by organization"
on public.push_subscriptions for select
using (
  public.is_platform_admin()
  or (
    organization_id is not null
    and public.is_organization_member(organization_id)
  )
);

drop policy if exists "push subscriptions managed by organization admins" on public.push_subscriptions;
create policy "push subscriptions managed by organization admins"
on public.push_subscriptions for update
using (
  public.is_platform_admin()
  or (
    organization_id is not null
    and public.is_organization_admin(organization_id)
  )
)
with check (
  public.is_platform_admin()
  or (
    organization_id is not null
    and public.is_organization_admin(organization_id)
  )
);

create table if not exists public.push_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  scope text not null default 'client' check (scope in ('platform', 'client')),
  name text not null,
  title text not null,
  body text not null,
  target_url text,
  target_filters jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  scheduled_at timestamptz,
  started_at timestamptz,
  sent_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_campaigns_org_status
  on public.push_campaigns (organization_id, status, created_at desc)
  where organization_id is not null;

create index if not exists idx_push_campaigns_platform_status
  on public.push_campaigns (scope, status, created_at desc)
  where scope = 'platform';

drop trigger if exists trg_push_campaigns_updated_at on public.push_campaigns;
create trigger trg_push_campaigns_updated_at
before update on public.push_campaigns
for each row execute function public.touch_updated_at();

alter table public.push_campaigns enable row level security;

drop policy if exists "push campaigns visible by organization" on public.push_campaigns;
create policy "push campaigns visible by organization"
on public.push_campaigns for select
using (
  public.is_platform_admin()
  or (
    organization_id is not null
    and public.is_organization_member(organization_id)
  )
);

drop policy if exists "push campaigns managed by organization admins" on public.push_campaigns;
create policy "push campaigns managed by organization admins"
on public.push_campaigns for all
using (
  public.is_platform_admin()
  or (
    organization_id is not null
    and public.is_organization_admin(organization_id)
  )
)
with check (
  public.is_platform_admin()
  or (
    organization_id is not null
    and public.is_organization_admin(organization_id)
  )
);

create table if not exists public.push_campaign_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.push_campaigns(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  endpoint_hash text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'clicked', 'failed', 'expired', 'skipped')),
  error_message text,
  sent_at timestamptz,
  clicked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_campaign_deliveries_campaign
  on public.push_campaign_deliveries (campaign_id, status, created_at desc);

create index if not exists idx_push_campaign_deliveries_org_lead
  on public.push_campaign_deliveries (organization_id, lead_id, created_at desc)
  where organization_id is not null and lead_id is not null;

drop trigger if exists trg_push_campaign_deliveries_updated_at on public.push_campaign_deliveries;
create trigger trg_push_campaign_deliveries_updated_at
before update on public.push_campaign_deliveries
for each row execute function public.touch_updated_at();

alter table public.push_campaign_deliveries enable row level security;

drop policy if exists "push campaign deliveries visible by organization" on public.push_campaign_deliveries;
create policy "push campaign deliveries visible by organization"
on public.push_campaign_deliveries for select
using (
  public.is_platform_admin()
  or (
    organization_id is not null
    and public.is_organization_member(organization_id)
  )
);

drop policy if exists "push campaign deliveries managed by organization admins" on public.push_campaign_deliveries;
create policy "push campaign deliveries managed by organization admins"
on public.push_campaign_deliveries for all
using (
  public.is_platform_admin()
  or (
    organization_id is not null
    and public.is_organization_admin(organization_id)
  )
)
with check (
  public.is_platform_admin()
  or (
    organization_id is not null
    and public.is_organization_admin(organization_id)
  )
);
