-- ConnectyHub API product controls
-- Adds idempotency support, public API defaults, and retry-friendly delivery metadata.

create table if not exists public.connectyhub_api_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.connectyhub_api_clients(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  api_key_id uuid references public.connectyhub_api_keys(id) on delete set null,
  key text not null,
  request_hash text not null,
  method text not null,
  endpoint text not null,
  status_code integer not null,
  response_body jsonb not null default '{}'::jsonb,
  unit_type text,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_connectyhub_api_idempotency_client_key
  on public.connectyhub_api_idempotency_keys (client_id, key);

create index if not exists idx_connectyhub_api_idempotency_expires
  on public.connectyhub_api_idempotency_keys (expires_at);

alter table public.connectyhub_api_idempotency_keys enable row level security;

drop policy if exists "api idempotency visible by organization" on public.connectyhub_api_idempotency_keys;
create policy "api idempotency visible by organization"
on public.connectyhub_api_idempotency_keys for select
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "api idempotency managed by admins" on public.connectyhub_api_idempotency_keys;
create policy "api idempotency managed by admins"
on public.connectyhub_api_idempotency_keys for all
using (public.is_platform_admin() or public.is_organization_admin(organization_id))
with check (public.is_platform_admin() or public.is_organization_admin(organization_id));

alter table public.connectyhub_webhook_deliveries
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_retry_at timestamptz;

create index if not exists idx_connectyhub_webhook_deliveries_endpoint_created
  on public.connectyhub_webhook_deliveries (endpoint_id, created_at desc);

alter table public.connectyhub_api_keys
  alter column scopes set default array[
    'instances:read',
    'instances:write',
    'messages:send',
    'webhooks:read',
    'webhooks:write',
    'uazapi:proxy'
  ]::text[];
