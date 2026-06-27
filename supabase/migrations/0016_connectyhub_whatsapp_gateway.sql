-- ConnectyHub WhatsApp Gateway
-- Turns ConnectyHub into the API/provider layer customers call instead of Uazapi.

create table if not exists public.connectyhub_api_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  contact_email text,
  plan_code text not null default 'api_starter',
  monthly_message_limit integer,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_connectyhub_api_clients_slug
  on public.connectyhub_api_clients (slug)
  where slug is not null;

create index if not exists idx_connectyhub_api_clients_org_status
  on public.connectyhub_api_clients (organization_id, status);

create table if not exists public.connectyhub_api_keys (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.connectyhub_api_clients(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default array['instances:read', 'instances:write', 'messages:send', 'webhooks:read']::text[],
  status text not null default 'active' check (status in ('active', 'paused', 'revoked')),
  last_used_at timestamptz,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_connectyhub_api_keys_client_status
  on public.connectyhub_api_keys (client_id, status);

create table if not exists public.connectyhub_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.connectyhub_api_clients(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  url text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  events text[] not null default array['messages', 'messages_update', 'connection']::text[],
  secret_encrypted text,
  secret_preview text,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_connectyhub_webhook_endpoints_client_status
  on public.connectyhub_webhook_endpoints (client_id, status);

create table if not exists public.connectyhub_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid references public.connectyhub_webhook_endpoints(id) on delete set null,
  client_id uuid references public.connectyhub_api_clients(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  whatsapp_instance_id uuid references public.whatsapp_instances(id) on delete set null,
  webhook_event_id uuid references public.whatsapp_webhook_events(id) on delete set null,
  event_type text not null,
  target_url text not null,
  status text not null default 'queued' check (status in ('queued', 'delivered', 'failed')),
  status_code integer,
  attempt_count integer not null default 0,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  response_preview text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_connectyhub_webhook_deliveries_client_created
  on public.connectyhub_webhook_deliveries (client_id, created_at desc);

create index if not exists idx_connectyhub_webhook_deliveries_status_created
  on public.connectyhub_webhook_deliveries (status, created_at desc);

create table if not exists public.connectyhub_api_usage_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.connectyhub_api_clients(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  api_key_id uuid references public.connectyhub_api_keys(id) on delete set null,
  whatsapp_instance_id uuid references public.whatsapp_instances(id) on delete set null,
  request_id text,
  method text not null,
  endpoint text not null,
  status_code integer,
  unit_type text not null default 'request',
  quantity numeric(18, 6) not null default 1,
  provider text,
  provider_status integer,
  latency_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_connectyhub_api_usage_client_created
  on public.connectyhub_api_usage_events (client_id, created_at desc);

create index if not exists idx_connectyhub_api_usage_org_created
  on public.connectyhub_api_usage_events (organization_id, created_at desc);

alter table public.whatsapp_instances
  add column if not exists connectyhub_api_client_id uuid references public.connectyhub_api_clients(id) on delete set null,
  add column if not exists connectyhub_api_instance_id uuid not null default gen_random_uuid(),
  add column if not exists connectyhub_api_visibility text not null default 'internal' check (connectyhub_api_visibility in ('internal', 'api_customer', 'hybrid'));

create unique index if not exists idx_whatsapp_instances_connectyhub_api_instance
  on public.whatsapp_instances (connectyhub_api_instance_id);

create index if not exists idx_whatsapp_instances_api_client
  on public.whatsapp_instances (connectyhub_api_client_id, status);

drop trigger if exists touch_connectyhub_api_clients_updated_at on public.connectyhub_api_clients;
create trigger touch_connectyhub_api_clients_updated_at
before update on public.connectyhub_api_clients
for each row execute function public.touch_updated_at();

drop trigger if exists touch_connectyhub_api_keys_updated_at on public.connectyhub_api_keys;
create trigger touch_connectyhub_api_keys_updated_at
before update on public.connectyhub_api_keys
for each row execute function public.touch_updated_at();

drop trigger if exists touch_connectyhub_webhook_endpoints_updated_at on public.connectyhub_webhook_endpoints;
create trigger touch_connectyhub_webhook_endpoints_updated_at
before update on public.connectyhub_webhook_endpoints
for each row execute function public.touch_updated_at();

alter table public.connectyhub_api_clients enable row level security;
alter table public.connectyhub_api_keys enable row level security;
alter table public.connectyhub_webhook_endpoints enable row level security;
alter table public.connectyhub_webhook_deliveries enable row level security;
alter table public.connectyhub_api_usage_events enable row level security;

drop policy if exists "api clients visible by organization" on public.connectyhub_api_clients;
create policy "api clients visible by organization"
on public.connectyhub_api_clients for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "api clients managed by admins" on public.connectyhub_api_clients;
create policy "api clients managed by admins"
on public.connectyhub_api_clients for all
using (public.is_platform_admin() or public.is_organization_admin(organization_id))
with check (public.is_platform_admin() or public.is_organization_admin(organization_id));

drop policy if exists "api keys visible by organization" on public.connectyhub_api_keys;
create policy "api keys visible by organization"
on public.connectyhub_api_keys for select
using (public.is_platform_admin() or public.is_organization_admin(organization_id));

drop policy if exists "api keys managed by admins" on public.connectyhub_api_keys;
create policy "api keys managed by admins"
on public.connectyhub_api_keys for all
using (public.is_platform_admin() or public.is_organization_admin(organization_id))
with check (public.is_platform_admin() or public.is_organization_admin(organization_id));

drop policy if exists "api webhook endpoints visible by organization" on public.connectyhub_webhook_endpoints;
create policy "api webhook endpoints visible by organization"
on public.connectyhub_webhook_endpoints for select
using (public.is_platform_admin() or public.is_organization_admin(organization_id));

drop policy if exists "api webhook endpoints managed by admins" on public.connectyhub_webhook_endpoints;
create policy "api webhook endpoints managed by admins"
on public.connectyhub_webhook_endpoints for all
using (public.is_platform_admin() or public.is_organization_admin(organization_id))
with check (public.is_platform_admin() or public.is_organization_admin(organization_id));

drop policy if exists "api webhook deliveries visible by organization" on public.connectyhub_webhook_deliveries;
create policy "api webhook deliveries visible by organization"
on public.connectyhub_webhook_deliveries for select
using (
  public.is_platform_admin()
  or (
    organization_id is not null
    and public.is_organization_admin(organization_id)
  )
);

drop policy if exists "api usage visible by organization" on public.connectyhub_api_usage_events;
create policy "api usage visible by organization"
on public.connectyhub_api_usage_events for select
using (
  public.is_platform_admin()
  or (
    organization_id is not null
    and public.is_organization_admin(organization_id)
  )
);
