-- Central de Integracoes: modelo base para conexoes por cliente e Webhook Universal.
-- Mantem Mercado Pago isolado nas tabelas atuais de catalogo/pagamento.

create table if not exists public.integration_providers (
  id text primary key,
  name text not null,
  category text not null
    check (category in ('payments', 'ads', 'commerce', 'calendar', 'shipping', 'webhooks')),
  status text not null default 'planned'
    check (status in ('active', 'next', 'planned', 'built_in', 'disabled')),
  mode text not null default 'external'
    check (mode in ('external', 'internal', 'hybrid')),
  auth_type text not null default 'none'
    check (auth_type in ('none', 'oauth', 'api_key', 'webhook_secret', 'internal')),
  headline text not null default '',
  description text not null default '',
  plan_codes text[] not null default '{}'::text[],
  feature_flags jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider_id text not null references public.integration_providers(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'available', 'connected', 'disabled', 'error')),
  connection_label text,
  external_account_id text,
  external_account_label text,
  auth_kind text not null default 'none'
    check (auth_kind in ('none', 'oauth', 'api_key', 'webhook_secret', 'internal')),
  scopes text[] not null default '{}'::text[],
  last_sync_at timestamptz,
  last_test_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_organization_integrations_provider_unique
  on public.organization_integrations (organization_id, provider_id);

create index if not exists idx_organization_integrations_org_status
  on public.organization_integrations (organization_id, status, updated_at desc);

create table if not exists public.integration_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_integration_id uuid references public.organization_integrations(id) on delete set null,
  provider_id text not null default 'webhook-universal' references public.integration_providers(id) on delete restrict,
  label text not null default 'Webhook Universal',
  status text not null default 'active'
    check (status in ('active', 'paused', 'disabled')),
  url_path text not null unique,
  secret_hash text not null,
  events text[] not null default array['lead.created', 'order.updated', 'payment.updated', 'custom.event']::text[],
  received_count integer not null default 0 check (received_count >= 0),
  last_received_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_integration_webhook_endpoints_org_status
  on public.integration_webhook_endpoints (organization_id, status, created_at desc);

create index if not exists idx_integration_webhook_endpoints_provider
  on public.integration_webhook_endpoints (provider_id, status);

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_integration_id uuid references public.organization_integrations(id) on delete set null,
  endpoint_id uuid references public.integration_webhook_endpoints(id) on delete set null,
  provider_id text not null references public.integration_providers(id) on delete restrict,
  direction text not null default 'inbound'
    check (direction in ('inbound', 'outbound')),
  event_type text not null,
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed')),
  source_event_id text,
  payload jsonb not null default '{}'::jsonb,
  headers jsonb not null default '{}'::jsonb,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_integration_events_org_received
  on public.integration_events (organization_id, received_at desc);

create index if not exists idx_integration_events_endpoint_received
  on public.integration_events (endpoint_id, received_at desc);

create index if not exists idx_integration_events_payload
  on public.integration_events using gin (payload);

create table if not exists public.integration_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_integration_id uuid references public.organization_integrations(id) on delete cascade,
  provider_id text not null references public.integration_providers(id) on delete restrict,
  job_type text not null default 'sync',
  status text not null default 'queued'
    check (status in ('queued', 'running', 'success', 'failed', 'cancelled')),
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_integration_sync_jobs_org_created
  on public.integration_sync_jobs (organization_id, created_at desc);

create table if not exists public.integration_action_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  organization_integration_id uuid references public.organization_integrations(id) on delete set null,
  provider_id text references public.integration_providers(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  status text not null default 'success'
    check (status in ('success', 'warning', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_integration_action_logs_org_created
  on public.integration_action_logs (organization_id, created_at desc);

drop trigger if exists touch_integration_providers_updated_at on public.integration_providers;
create trigger touch_integration_providers_updated_at
before update on public.integration_providers
for each row execute function public.touch_updated_at();

drop trigger if exists touch_organization_integrations_updated_at on public.organization_integrations;
create trigger touch_organization_integrations_updated_at
before update on public.organization_integrations
for each row execute function public.touch_updated_at();

drop trigger if exists touch_integration_webhook_endpoints_updated_at on public.integration_webhook_endpoints;
create trigger touch_integration_webhook_endpoints_updated_at
before update on public.integration_webhook_endpoints
for each row execute function public.touch_updated_at();

drop trigger if exists touch_integration_sync_jobs_updated_at on public.integration_sync_jobs;
create trigger touch_integration_sync_jobs_updated_at
before update on public.integration_sync_jobs
for each row execute function public.touch_updated_at();

alter table public.integration_providers enable row level security;
alter table public.organization_integrations enable row level security;
alter table public.integration_webhook_endpoints enable row level security;
alter table public.integration_events enable row level security;
alter table public.integration_sync_jobs enable row level security;
alter table public.integration_action_logs enable row level security;

drop policy if exists "integration providers visible to authenticated users" on public.integration_providers;
create policy "integration providers visible to authenticated users"
on public.integration_providers for select
using (auth.uid() is not null);

drop policy if exists "integration providers managed by platform admins" on public.integration_providers;
create policy "integration providers managed by platform admins"
on public.integration_providers for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "organization integrations visible by members" on public.organization_integrations;
create policy "organization integrations visible by members"
on public.organization_integrations for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "organization integrations managed by org admins" on public.organization_integrations;
create policy "organization integrations managed by org admins"
on public.organization_integrations for all
using (public.is_platform_admin() or public.is_organization_admin(organization_id))
with check (public.is_platform_admin() or public.is_organization_admin(organization_id));

drop policy if exists "integration webhook endpoints visible by members" on public.integration_webhook_endpoints;
create policy "integration webhook endpoints visible by members"
on public.integration_webhook_endpoints for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "integration webhook endpoints managed by org admins" on public.integration_webhook_endpoints;
create policy "integration webhook endpoints managed by org admins"
on public.integration_webhook_endpoints for all
using (public.is_platform_admin() or public.is_organization_admin(organization_id))
with check (public.is_platform_admin() or public.is_organization_admin(organization_id));

drop policy if exists "integration events visible by members" on public.integration_events;
create policy "integration events visible by members"
on public.integration_events for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "integration events managed by org admins" on public.integration_events;
create policy "integration events managed by org admins"
on public.integration_events for all
using (public.is_platform_admin() or public.is_organization_admin(organization_id))
with check (public.is_platform_admin() or public.is_organization_admin(organization_id));

drop policy if exists "integration sync jobs visible by members" on public.integration_sync_jobs;
create policy "integration sync jobs visible by members"
on public.integration_sync_jobs for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "integration sync jobs managed by org admins" on public.integration_sync_jobs;
create policy "integration sync jobs managed by org admins"
on public.integration_sync_jobs for all
using (public.is_platform_admin() or public.is_organization_admin(organization_id))
with check (public.is_platform_admin() or public.is_organization_admin(organization_id));

drop policy if exists "integration action logs visible by members" on public.integration_action_logs;
create policy "integration action logs visible by members"
on public.integration_action_logs for select
using (
  public.is_platform_admin()
  or organization_id is null
  or public.is_organization_member(organization_id)
);

drop policy if exists "integration action logs insert by authenticated users" on public.integration_action_logs;
create policy "integration action logs insert by authenticated users"
on public.integration_action_logs for insert
with check (auth.uid() is not null);

insert into public.integration_providers (
  id,
  name,
  category,
  status,
  mode,
  auth_type,
  headline,
  description,
  feature_flags
)
values
  (
    'mercado-pago',
    'Mercado Pago',
    'payments',
    'active',
    'external',
    'oauth',
    'Recebimento por Pix e cartao no catalogo',
    'Gateway unico nesta etapa. O fluxo funcional continua em sales_catalog_payment_integrations.',
    '{"protected_existing_flow": true, "source_table": "sales_catalog_payment_integrations"}'::jsonb
  ),
  (
    'meta-ads',
    'Meta Ads / Instagram / Facebook',
    'ads',
    'next',
    'external',
    'oauth',
    'Acompanhamento de campanhas e leads',
    'Leitura de campanhas, gasto, leads, CTR, CPL, criativos, direct e comentarios.',
    '{"initial_mode": "read_only", "future_ai_operations": true}'::jsonb
  ),
  (
    'google-growth',
    'Google Ads / Business / Search Console',
    'ads',
    'next',
    'external',
    'oauth',
    'Painel de aquisicao e presenca Google',
    'Leitura de campanhas, conversoes, palavras-chave, avaliacoes e presenca local.',
    '{"initial_mode": "read_only", "future_ai_operations": true}'::jsonb
  ),
  (
    'ecommerce-hub',
    'E-commerce',
    'commerce',
    'planned',
    'external',
    'oauth',
    'Produtos, estoque, pedidos e carrinho',
    'Camada para Shopify, WooCommerce e Nuvemshop.',
    '{"providers": ["shopify", "woocommerce", "nuvemshop"]}'::jsonb
  ),
  (
    'calendar-hub',
    'Agenda ConnectyHub',
    'calendar',
    'built_in',
    'hybrid',
    'internal',
    'Agenda propria com Google Calendar opcional',
    'Agenda interna como base; Google Calendar como espelho opcional.',
    '{"internal_first": true, "optional_sync": ["google_calendar"]}'::jsonb
  ),
  (
    'shipping-hub',
    'Envios e frete',
    'shipping',
    'planned',
    'hybrid',
    'api_key',
    'Camada propria de logistica',
    'Frete, rastreio, retirada e provedores como Melhor Envio, Correios, Jadlog, Kangu e Loggi.',
    '{"providers": ["melhor_envio", "correios", "jadlog", "kangu", "loggi"]}'::jsonb
  ),
  (
    'webhook-universal',
    'Webhook Universal',
    'webhooks',
    'active',
    'hybrid',
    'webhook_secret',
    'Entrada e saida generica de eventos',
    'Endpoint assinado para receber leads externos e eventos customizados.',
    '{"inbound": true, "outbound_future": true}'::jsonb
  )
on conflict (id) do update
set
  name = excluded.name,
  category = excluded.category,
  status = excluded.status,
  mode = excluded.mode,
  auth_type = excluded.auth_type,
  headline = excluded.headline,
  description = excluded.description,
  feature_flags = excluded.feature_flags,
  updated_at = now();
