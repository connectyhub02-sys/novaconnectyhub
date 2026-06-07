-- ConnectyHub autonomous company foundation
-- Admin OS controls platform agents, intelligence memory, plan entitlements,
-- and all customer WhatsApp instances.

do $$
begin
  create type public.agent_scope as enum ('platform', 'organization');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.agent_status as enum ('draft', 'online', 'paused', 'needs_review', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.agent_run_status as enum ('queued', 'running', 'completed', 'failed', 'needs_approval', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.whatsapp_instance_status as enum ('draft', 'qr_pending', 'connected', 'disconnected', 'blocked', 'error', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.content_pipeline_status as enum ('idea', 'researching', 'draft', 'review', 'approved', 'scheduled', 'published', 'archived');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null,
  feature_code text not null,
  label text not null,
  description text,
  enabled boolean not null default true,
  value_type text not null default 'boolean',
  boolean_value boolean,
  numeric_limit numeric(18, 6),
  text_value text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_code, feature_code)
);

create table if not exists public.agent_registry (
  id uuid primary key default gen_random_uuid(),
  scope public.agent_scope not null default 'platform',
  organization_id uuid references public.organizations(id) on delete cascade,
  sector_code text not null,
  sector_name text not null,
  agent_code text not null,
  name text not null,
  persona_name text not null default '',
  avatar_url text,
  avatar_alt text,
  profile_bio text,
  role_title text not null,
  description text,
  prompt text not null default '',
  llm_provider text not null default 'gemini',
  model_id text,
  status public.agent_status not null default 'draft',
  autonomy_level integer not null default 0 check (autonomy_level >= 0 and autonomy_level <= 100),
  requires_human_approval boolean not null default true,
  tools text[] not null default '{}'::text[],
  triggers text[] not null default '{}'::text[],
  schedule_rrule text,
  inngest_event_name text,
  memory_access_level text not null default 'sector',
  monthly_budget_credits numeric(18, 6),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_agent_registry_platform_unique
  on public.agent_registry (agent_code)
  where scope = 'platform' and organization_id is null;

create unique index if not exists idx_agent_registry_organization_unique
  on public.agent_registry (organization_id, agent_code)
  where scope = 'organization';

create table if not exists public.agent_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_registry(id) on delete cascade,
  version_number integer not null,
  prompt text not null,
  change_note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (agent_id, version_number)
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_registry(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  run_status public.agent_run_status not null default 'queued',
  trigger_source text,
  inngest_run_id text,
  input_summary text,
  output_summary text,
  error_message text,
  input_tokens numeric(18, 6),
  output_tokens numeric(18, 6),
  cost_credits numeric(18, 6),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.intelligence_events (
  id uuid primary key default gen_random_uuid(),
  scope public.agent_scope not null default 'platform',
  organization_id uuid references public.organizations(id) on delete cascade,
  source_type text not null,
  source_id text,
  producer_agent_id uuid references public.agent_registry(id) on delete set null,
  event_type text not null,
  title text not null,
  summary text,
  confidence numeric(6, 4),
  visibility text not null default 'platform',
  tags text[] not null default '{}'::text[],
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.intelligence_memory (
  id uuid primary key default gen_random_uuid(),
  scope public.agent_scope not null default 'platform',
  organization_id uuid references public.organizations(id) on delete cascade,
  memory_type text not null default 'insight',
  title text not null,
  content text not null,
  source_event_id uuid references public.intelligence_events(id) on delete set null,
  created_by_agent_id uuid references public.agent_registry(id) on delete set null,
  vector_status text not null default 'pending',
  importance numeric(6, 4) not null default 0.5,
  expires_at timestamptz,
  tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  provider text not null default 'uazapi',
  provider_instance_id text,
  phone_number text,
  display_name text,
  status public.whatsapp_instance_status not null default 'draft',
  qr_status text,
  instance_token_preview text,
  webhook_url text,
  last_heartbeat_at timestamptz,
  last_message_at timestamptz,
  connected_at timestamptz,
  disconnected_at timestamptz,
  plan_code text,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_whatsapp_instances_provider_unique
  on public.whatsapp_instances (provider, provider_instance_id)
  where provider_instance_id is not null;

create table if not exists public.content_pipeline_items (
  id uuid primary key default gen_random_uuid(),
  scope public.agent_scope not null default 'platform',
  organization_id uuid references public.organizations(id) on delete cascade,
  content_type text not null default 'blog',
  status public.content_pipeline_status not null default 'idea',
  title text not null,
  summary text,
  body text,
  source_url text,
  producer_agent_id uuid references public.agent_registry(id) on delete set null,
  reviewer_id uuid references auth.users(id) on delete set null,
  scheduled_for timestamptz,
  published_at timestamptz,
  tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_plan_entitlements_plan_enabled
  on public.plan_entitlements (plan_code, enabled);

create index if not exists idx_agent_registry_scope_status
  on public.agent_registry (scope, status);

create index if not exists idx_agent_registry_org_status
  on public.agent_registry (organization_id, status);

create index if not exists idx_agent_registry_sector
  on public.agent_registry (sector_code);

create index if not exists idx_agent_runs_agent_started
  on public.agent_runs (agent_id, started_at desc);

create index if not exists idx_agent_runs_org_started
  on public.agent_runs (organization_id, started_at desc);

create index if not exists idx_intelligence_events_scope_time
  on public.intelligence_events (scope, occurred_at desc);

create index if not exists idx_intelligence_events_org_time
  on public.intelligence_events (organization_id, occurred_at desc);

create index if not exists idx_intelligence_events_tags
  on public.intelligence_events using gin (tags);

create index if not exists idx_intelligence_events_payload
  on public.intelligence_events using gin (payload);

create index if not exists idx_intelligence_memory_scope_importance
  on public.intelligence_memory (scope, importance desc);

create index if not exists idx_intelligence_memory_org
  on public.intelligence_memory (organization_id);

create index if not exists idx_intelligence_memory_tags
  on public.intelligence_memory using gin (tags);

create index if not exists idx_whatsapp_instances_org_status
  on public.whatsapp_instances (organization_id, status);

create index if not exists idx_whatsapp_instances_status
  on public.whatsapp_instances (status);

create index if not exists idx_whatsapp_instances_provider_id
  on public.whatsapp_instances (provider_instance_id);

create index if not exists idx_content_pipeline_status_schedule
  on public.content_pipeline_items (status, scheduled_for);

create index if not exists idx_content_pipeline_type_status
  on public.content_pipeline_items (content_type, status);

create index if not exists idx_content_pipeline_tags
  on public.content_pipeline_items using gin (tags);

drop trigger if exists trg_plan_entitlements_updated_at on public.plan_entitlements;
create trigger trg_plan_entitlements_updated_at
before update on public.plan_entitlements
for each row execute function public.touch_updated_at();

drop trigger if exists trg_agent_registry_updated_at on public.agent_registry;
create trigger trg_agent_registry_updated_at
before update on public.agent_registry
for each row execute function public.touch_updated_at();

drop trigger if exists trg_intelligence_memory_updated_at on public.intelligence_memory;
create trigger trg_intelligence_memory_updated_at
before update on public.intelligence_memory
for each row execute function public.touch_updated_at();

drop trigger if exists trg_whatsapp_instances_updated_at on public.whatsapp_instances;
create trigger trg_whatsapp_instances_updated_at
before update on public.whatsapp_instances
for each row execute function public.touch_updated_at();

drop trigger if exists trg_content_pipeline_items_updated_at on public.content_pipeline_items;
create trigger trg_content_pipeline_items_updated_at
before update on public.content_pipeline_items
for each row execute function public.touch_updated_at();

alter table public.plan_entitlements enable row level security;
alter table public.agent_registry enable row level security;
alter table public.agent_prompt_versions enable row level security;
alter table public.agent_runs enable row level security;
alter table public.intelligence_events enable row level security;
alter table public.intelligence_memory enable row level security;
alter table public.whatsapp_instances enable row level security;
alter table public.content_pipeline_items enable row level security;

drop policy if exists "plan entitlements readable by authenticated users" on public.plan_entitlements;
create policy "plan entitlements readable by authenticated users"
on public.plan_entitlements for select
using (auth.uid() is not null);

drop policy if exists "plan entitlements managed by platform admins" on public.plan_entitlements;
create policy "plan entitlements managed by platform admins"
on public.plan_entitlements for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "agents visible by scope" on public.agent_registry;
create policy "agents visible by scope"
on public.agent_registry for select
using (
  public.is_platform_admin()
  or (
    scope = 'organization'
    and organization_id is not null
    and public.is_organization_member(organization_id)
  )
);

drop policy if exists "agents managed by owners" on public.agent_registry;
create policy "agents managed by owners"
on public.agent_registry for all
using (
  public.is_platform_admin()
  or (
    scope = 'organization'
    and organization_id is not null
    and public.is_organization_admin(organization_id)
  )
)
with check (
  public.is_platform_admin()
  or (
    scope = 'organization'
    and organization_id is not null
    and public.is_organization_admin(organization_id)
  )
);

drop policy if exists "agent prompt versions visible by agent scope" on public.agent_prompt_versions;
create policy "agent prompt versions visible by agent scope"
on public.agent_prompt_versions for select
using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.agent_registry agents
    where agents.id = agent_prompt_versions.agent_id
      and agents.scope = 'organization'
      and agents.organization_id is not null
      and public.is_organization_member(agents.organization_id)
  )
);

drop policy if exists "agent prompt versions managed by owners" on public.agent_prompt_versions;
create policy "agent prompt versions managed by owners"
on public.agent_prompt_versions for all
using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.agent_registry agents
    where agents.id = agent_prompt_versions.agent_id
      and agents.scope = 'organization'
      and agents.organization_id is not null
      and public.is_organization_admin(agents.organization_id)
  )
)
with check (
  public.is_platform_admin()
  or exists (
    select 1
    from public.agent_registry agents
    where agents.id = agent_prompt_versions.agent_id
      and agents.scope = 'organization'
      and agents.organization_id is not null
      and public.is_organization_admin(agents.organization_id)
  )
);

drop policy if exists "agent runs visible by organization" on public.agent_runs;
create policy "agent runs visible by organization"
on public.agent_runs for select
using (
  public.is_platform_admin()
  or (
    organization_id is not null
    and public.is_organization_member(organization_id)
  )
  or exists (
    select 1
    from public.agent_registry agents
    where agents.id = agent_runs.agent_id
      and agents.scope = 'organization'
      and agents.organization_id is not null
      and public.is_organization_member(agents.organization_id)
  )
);

drop policy if exists "agent runs managed by admins" on public.agent_runs;
create policy "agent runs managed by admins"
on public.agent_runs for all
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

drop policy if exists "intelligence events visible by scope" on public.intelligence_events;
create policy "intelligence events visible by scope"
on public.intelligence_events for select
using (
  public.is_platform_admin()
  or (
    scope = 'organization'
    and organization_id is not null
    and public.is_organization_member(organization_id)
  )
);

drop policy if exists "intelligence events managed by owners" on public.intelligence_events;
create policy "intelligence events managed by owners"
on public.intelligence_events for all
using (
  public.is_platform_admin()
  or (
    scope = 'organization'
    and organization_id is not null
    and public.is_organization_admin(organization_id)
  )
)
with check (
  public.is_platform_admin()
  or (
    scope = 'organization'
    and organization_id is not null
    and public.is_organization_admin(organization_id)
  )
);

drop policy if exists "intelligence memory visible by scope" on public.intelligence_memory;
create policy "intelligence memory visible by scope"
on public.intelligence_memory for select
using (
  public.is_platform_admin()
  or (
    scope = 'organization'
    and organization_id is not null
    and public.is_organization_member(organization_id)
  )
);

drop policy if exists "intelligence memory managed by owners" on public.intelligence_memory;
create policy "intelligence memory managed by owners"
on public.intelligence_memory for all
using (
  public.is_platform_admin()
  or (
    scope = 'organization'
    and organization_id is not null
    and public.is_organization_admin(organization_id)
  )
)
with check (
  public.is_platform_admin()
  or (
    scope = 'organization'
    and organization_id is not null
    and public.is_organization_admin(organization_id)
  )
);

drop policy if exists "whatsapp instances visible by organization" on public.whatsapp_instances;
create policy "whatsapp instances visible by organization"
on public.whatsapp_instances for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "whatsapp instances managed by owners" on public.whatsapp_instances;
create policy "whatsapp instances managed by owners"
on public.whatsapp_instances for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "content pipeline visible by scope" on public.content_pipeline_items;
create policy "content pipeline visible by scope"
on public.content_pipeline_items for select
using (
  public.is_platform_admin()
  or (
    scope = 'organization'
    and organization_id is not null
    and public.is_organization_member(organization_id)
  )
);

drop policy if exists "content pipeline managed by owners" on public.content_pipeline_items;
create policy "content pipeline managed by owners"
on public.content_pipeline_items for all
using (
  public.is_platform_admin()
  or (
    scope = 'organization'
    and organization_id is not null
    and public.is_organization_admin(organization_id)
  )
)
with check (
  public.is_platform_admin()
  or (
    scope = 'organization'
    and organization_id is not null
    and public.is_organization_admin(organization_id)
  )
);

insert into public.plan_entitlements (
  plan_code,
  feature_code,
  label,
  description,
  enabled,
  value_type,
  boolean_value,
  numeric_limit,
  metadata
)
values
  ('trial', 'whatsapp_instances', 'Instancias WhatsApp', 'Numeros de WhatsApp que o cliente pode conectar.', true, 'number', null, 1, '{}'::jsonb),
  ('trial', 'client_agents', 'Agentes do cliente', 'Agentes operacionais liberados no painel do cliente.', true, 'number', null, 1, '{}'::jsonb),
  ('trial', 'monthly_tokens', 'Creditos mensais', 'Creditos incluidos no periodo de teste.', true, 'number', null, 1000, '{}'::jsonb),
  ('trial', 'woocommerce', 'WooCommerce', 'Integracao com loja WordPress e carrinho abandonado.', false, 'boolean', false, null, '{}'::jsonb),
  ('trial', 'instagram', 'Instagram', 'Direct, comentarios e captura social.', false, 'boolean', false, null, '{}'::jsonb),
  ('trial', 'voice_replies', 'Audio por IA', 'Resposta por voz usando ElevenLabs.', false, 'boolean', false, null, '{}'::jsonb),
  ('trial', 'voice_cloning', 'Clonagem de voz', 'Clone autorizado de voz no painel do cliente.', false, 'boolean', false, null, '{}'::jsonb),
  ('trial', 'paid_traffic_agent', 'Agente de trafego pago', 'Agente para Google Ads e Meta Ads.', false, 'boolean', false, null, '{}'::jsonb),
  ('trial', 'organic_agent', 'Agente organico', 'Agente para posts, comentarios e conteudo organico.', false, 'boolean', false, null, '{}'::jsonb),
  ('trial', 'advanced_automations', 'Automacoes avancadas', 'Rotinas Inngest e funis automatizados.', false, 'boolean', false, null, '{}'::jsonb),

  ('starter', 'whatsapp_instances', 'Instancias WhatsApp', 'Numeros de WhatsApp que o cliente pode conectar.', true, 'number', null, 1, '{}'::jsonb),
  ('starter', 'client_agents', 'Agentes do cliente', 'Agentes operacionais liberados no painel do cliente.', true, 'number', null, 3, '{}'::jsonb),
  ('starter', 'monthly_tokens', 'Creditos mensais', 'Creditos incluidos no plano.', true, 'number', null, 10000, '{}'::jsonb),
  ('starter', 'woocommerce', 'WooCommerce', 'Integracao com loja WordPress e carrinho abandonado.', true, 'boolean', true, null, '{}'::jsonb),
  ('starter', 'instagram', 'Instagram', 'Direct, comentarios e captura social.', false, 'boolean', false, null, '{}'::jsonb),
  ('starter', 'voice_replies', 'Audio por IA', 'Resposta por voz usando ElevenLabs.', true, 'boolean', true, null, '{}'::jsonb),
  ('starter', 'voice_cloning', 'Clonagem de voz', 'Clone autorizado de voz no painel do cliente.', false, 'boolean', false, null, '{}'::jsonb),
  ('starter', 'paid_traffic_agent', 'Agente de trafego pago', 'Agente para Google Ads e Meta Ads.', false, 'boolean', false, null, '{}'::jsonb),
  ('starter', 'organic_agent', 'Agente organico', 'Agente para posts, comentarios e conteudo organico.', true, 'boolean', true, null, '{}'::jsonb),
  ('starter', 'advanced_automations', 'Automacoes avancadas', 'Rotinas Inngest e funis automatizados.', false, 'boolean', false, null, '{}'::jsonb),

  ('pro', 'whatsapp_instances', 'Instancias WhatsApp', 'Numeros de WhatsApp que o cliente pode conectar.', true, 'number', null, 3, '{}'::jsonb),
  ('pro', 'client_agents', 'Agentes do cliente', 'Agentes operacionais liberados no painel do cliente.', true, 'number', null, 10, '{}'::jsonb),
  ('pro', 'monthly_tokens', 'Creditos mensais', 'Creditos incluidos no plano.', true, 'number', null, 60000, '{}'::jsonb),
  ('pro', 'woocommerce', 'WooCommerce', 'Integracao com loja WordPress e carrinho abandonado.', true, 'boolean', true, null, '{}'::jsonb),
  ('pro', 'instagram', 'Instagram', 'Direct, comentarios e captura social.', true, 'boolean', true, null, '{}'::jsonb),
  ('pro', 'voice_replies', 'Audio por IA', 'Resposta por voz usando ElevenLabs.', true, 'boolean', true, null, '{}'::jsonb),
  ('pro', 'voice_cloning', 'Clonagem de voz', 'Clone autorizado de voz no painel do cliente.', true, 'boolean', true, null, '{}'::jsonb),
  ('pro', 'paid_traffic_agent', 'Agente de trafego pago', 'Agente para Google Ads e Meta Ads.', true, 'boolean', true, null, '{}'::jsonb),
  ('pro', 'organic_agent', 'Agente organico', 'Agente para posts, comentarios e conteudo organico.', true, 'boolean', true, null, '{}'::jsonb),
  ('pro', 'advanced_automations', 'Automacoes avancadas', 'Rotinas Inngest e funis automatizados.', true, 'boolean', true, null, '{}'::jsonb),

  ('scale', 'whatsapp_instances', 'Instancias WhatsApp', 'Numeros de WhatsApp que o cliente pode conectar.', true, 'number', null, 10, '{}'::jsonb),
  ('scale', 'client_agents', 'Agentes do cliente', 'Agentes operacionais liberados no painel do cliente.', true, 'number', null, 30, '{}'::jsonb),
  ('scale', 'monthly_tokens', 'Creditos mensais', 'Creditos incluidos no plano.', true, 'number', null, 250000, '{}'::jsonb),
  ('scale', 'woocommerce', 'WooCommerce', 'Integracao com loja WordPress e carrinho abandonado.', true, 'boolean', true, null, '{}'::jsonb),
  ('scale', 'instagram', 'Instagram', 'Direct, comentarios e captura social.', true, 'boolean', true, null, '{}'::jsonb),
  ('scale', 'voice_replies', 'Audio por IA', 'Resposta por voz usando ElevenLabs.', true, 'boolean', true, null, '{}'::jsonb),
  ('scale', 'voice_cloning', 'Clonagem de voz', 'Clone autorizado de voz no painel do cliente.', true, 'boolean', true, null, '{}'::jsonb),
  ('scale', 'paid_traffic_agent', 'Agente de trafego pago', 'Agente para Google Ads e Meta Ads.', true, 'boolean', true, null, '{}'::jsonb),
  ('scale', 'organic_agent', 'Agente organico', 'Agente para posts, comentarios e conteudo organico.', true, 'boolean', true, null, '{}'::jsonb),
  ('scale', 'advanced_automations', 'Automacoes avancadas', 'Rotinas Inngest e funis automatizados.', true, 'boolean', true, null, '{}'::jsonb)
on conflict (plan_code, feature_code) do update
set
  label = excluded.label,
  description = excluded.description,
  enabled = excluded.enabled,
  value_type = excluded.value_type,
  boolean_value = excluded.boolean_value,
  numeric_limit = excluded.numeric_limit,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.agent_registry (
  scope,
  sector_code,
  sector_name,
  agent_code,
  name,
  persona_name,
  avatar_url,
  avatar_alt,
  profile_bio,
  role_title,
  description,
  prompt,
  llm_provider,
  model_id,
  status,
  autonomy_level,
  requires_human_approval,
  tools,
  triggers,
  inngest_event_name,
  memory_access_level,
  monthly_budget_credits,
  metadata
)
select
  'platform'::public.agent_scope,
  seed.sector_code,
  seed.sector_name,
  seed.agent_code,
  seed.name,
  seed.persona_name,
  seed.avatar_url,
  seed.avatar_alt,
  seed.profile_bio,
  seed.role_title,
  seed.description,
  seed.prompt,
  'gemini',
  'gemini-2.5-flash',
  seed.status::public.agent_status,
  seed.autonomy_level,
  seed.requires_human_approval,
  seed.tools,
  seed.triggers,
  seed.inngest_event_name,
  seed.memory_access_level,
  seed.monthly_budget_credits,
  seed.metadata
from (
  values
    (
      'diretoria',
      'Diretoria',
      'ceo-digital-connectyhub',
      'CEO Digital ConnectyHub',
      'Helena Moura',
      'https://api.dicebear.com/9.x/personas/svg?seed=Helena%20Moura',
      'Foto de Helena Moura',
      'Executiva IA responsavel por coordenar gerentes, prioridades e relatorios da ConnectyHub.',
      'Orquestrador executivo',
      'Coordena gerentes, prioridades, relatorios e protecao do patrimonio digital.',
      'Voce e o CEO digital da ConnectyHub. Leia a central de inteligencia, cobre relatorios dos gerentes e recomende decisoes com foco em crescimento, margem e seguranca.',
      'needs_review',
      40,
      true,
      array['relatorios', 'aprovacoes', 'centro_de_custo']::text[],
      array['daily_digest', 'critical_alert']::text[],
      'connectyhub/admin.ceo.digest',
      'global',
      5000::numeric,
      '{"manager":true}'::jsonb
    ),
    (
      'atendimento_ia',
      'Atendimento IA',
      'gerente-atendimento',
      'Gerente de Atendimento IA',
      'Rafael Nunes',
      'https://api.dicebear.com/9.x/personas/svg?seed=Rafael%20Nunes',
      'Foto de Rafael Nunes',
      'Gerente IA do setor de atendimento, qualidade conversacional e funis comerciais.',
      'Gerente de setor',
      'Supervisiona agentes de WhatsApp, qualidade de resposta e funis conversacionais.',
      'Voce gerencia o setor de atendimento IA. Audite conversas, proponha melhorias de prompt e envie relatorios de qualidade para o CEO digital.',
      'needs_review',
      50,
      true,
      array['whatsapp', 'lead_scoring', 'prompt_review']::text[],
      array['conversation_review', 'weekly_report']::text[],
      'connectyhub/admin.support.manager',
      'sector',
      4000::numeric,
      '{"manager":true}'::jsonb
    ),
    (
      'atendimento_ia',
      'Atendimento IA',
      'agente-whatsapp-sistema',
      'Agente WhatsApp do Sistema',
      'Nina Almeida',
      'https://api.dicebear.com/9.x/personas/svg?seed=Nina%20Almeida',
      'Foto de Nina Almeida',
      'Atendente IA de WhatsApp focada em capturar leads, entender intencao e conduzir vendas.',
      'Atendente IA',
      'Atende leads, identifica intencao, registra origem e aciona automacoes.',
      'Voce atende leads no WhatsApp como humano comercial. Colete contexto, responda de forma clara e alimente a central de inteligencia com objecoes, interesses e oportunidades.',
      'paused',
      35,
      true,
      array['uazapi', 'gemini', 'crm']::text[],
      array['uazapi.message.received']::text[],
      'connectyhub/whatsapp.message.received',
      'organization',
      10000::numeric,
      '{"client_operational":true}'::jsonb
    ),
    (
      'inteligencia_comercial',
      'Inteligencia Comercial',
      'agente-analise-leads',
      'Analista de Conversas e Leads',
      'Caio Martins',
      'https://api.dicebear.com/9.x/personas/svg?seed=Caio%20Martins',
      'Foto de Caio Martins',
      'Analista IA que transforma conversas, objecoes e sinais de compra em dados estruturados.',
      'Analista IA',
      'Transforma conversas em sinais estruturados para vendas, produto e marketing.',
      'Analise conversas, extraia objecoes, desejos, etapa do funil, produto de interesse e valor potencial. Grave tudo na central de inteligencia.',
      'needs_review',
      55,
      true,
      array['crm', 'lead_scoring', 'intelligence_memory']::text[],
      array['conversation_closed', 'lead_updated']::text[],
      'connectyhub/intelligence.lead.analyzed',
      'global',
      5000::numeric,
      '{}'::jsonb
    ),
    (
      'inteligencia_externa',
      'Inteligencia Externa',
      'agente-pesquisa-web',
      'Pesquisador Web',
      'Lara Batista',
      'https://api.dicebear.com/9.x/personas/svg?seed=Lara%20Batista',
      'Foto de Lara Batista',
      'Pesquisadora IA para temas de mercado, tendencias, concorrentes e oportunidades externas.',
      'Coletor externo',
      'Pesquisa temas, tendencias, concorrentes e oportunidades para alimentar o ecossistema.',
      'Pesquise informacoes externas relevantes para a ConnectyHub, resuma com fontes e grave insights reutilizaveis na central de inteligencia.',
      'paused',
      45,
      true,
      array['web_search', 'intelligence_memory']::text[],
      array['scheduled_research']::text[],
      'connectyhub/research.web.scheduled',
      'global',
      3000::numeric,
      '{}'::jsonb
    ),
    (
      'noticias',
      'Noticias',
      'agente-noticias',
      'Agente de Noticias',
      'Bruno Leal',
      'https://api.dicebear.com/9.x/personas/svg?seed=Bruno%20Leal',
      'Foto de Bruno Leal',
      'Curador IA de noticias sobre IA, WhatsApp, automacao, trafego e mercado digital.',
      'Curador IA',
      'Monitora noticias de IA, WhatsApp, trafego pago e mercado digital.',
      'Monitore noticias relevantes e gere resumos acionaveis para marketing, conteudo e estrategia comercial.',
      'paused',
      45,
      true,
      array['web_search', 'content_pipeline']::text[],
      array['scheduled_news_scan']::text[],
      'connectyhub/news.scan',
      'global',
      2500::numeric,
      '{}'::jsonb
    ),
    (
      'conteudo',
      'Conteudo',
      'agente-blog',
      'Agente de Blog',
      'Sofia Campos',
      'https://api.dicebear.com/9.x/personas/svg?seed=Sofia%20Campos',
      'Foto de Sofia Campos',
      'Redatora IA que transforma a central de inteligencia em pautas, artigos e posts.',
      'Redator IA',
      'Cria pautas, artigos e materiais a partir da central de inteligencia.',
      'Use os dados da central de inteligencia para criar pautas e artigos sobre atendimento IA, WhatsApp, afiliados, trafego e vendas sem site.',
      'needs_review',
      50,
      true,
      array['content_pipeline', 'seo', 'blog']::text[],
      array['content_idea_approved', 'weekly_content']::text[],
      'connectyhub/content.blog.generate',
      'global',
      3500::numeric,
      '{}'::jsonb
    ),
    (
      'trafego_pago',
      'Trafego Pago',
      'agente-trafego-pago',
      'Agente de Trafego Pago',
      'Diego Torres',
      'https://api.dicebear.com/9.x/personas/svg?seed=Diego%20Torres',
      'Foto de Diego Torres',
      'Gestor IA de midia paga para campanhas, criativos, custo por lead e recomendacoes de budget.',
      'Gestor de midia IA',
      'Planeja campanhas, analisa custo por lead e recomenda investimento.',
      'Analise campanhas, leads e margem. Sugira criativos, segmentacoes e ajustes de budget com aprovacao humana ate liberacao autonoma.',
      'needs_review',
      30,
      true,
      array['meta_ads', 'google_ads', 'lead_tracking']::text[],
      array['campaign_daily_check']::text[],
      'connectyhub/ads.daily.check',
      'global',
      5000::numeric,
      '{}'::jsonb
    ),
    (
      'auditoria',
      'Auditoria',
      'agente-auditoria',
      'Auditor do Sistema',
      'Marina Rocha',
      'https://api.dicebear.com/9.x/personas/svg?seed=Marina%20Rocha',
      'Foto de Marina Rocha',
      'Auditora IA de conexoes, custos, credenciais, webhooks e riscos operacionais.',
      'Auditor IA',
      'Verifica falhas, custos, credenciais, automacoes e riscos operacionais.',
      'Audite conexoes, custos, uso de tokens, credenciais, erros de webhook e tarefas Inngest. Aponte riscos e prioridades.',
      'needs_review',
      55,
      true,
      array['maintenance', 'billing', 'logs']::text[],
      array['daily_health_check', 'connection_failed']::text[],
      'connectyhub/audit.health.check',
      'global',
      2500::numeric,
      '{}'::jsonb
    ),
    (
      'financeiro_ia',
      'Financeiro IA',
      'agente-financeiro',
      'Analista Financeiro IA',
      'Henrique Vale',
      'https://api.dicebear.com/9.x/personas/svg?seed=Henrique%20Vale',
      'Foto de Henrique Vale',
      'Controller IA que calcula custo real, margem, creditos e consumo por provedor.',
      'Controller IA',
      'Calcula custo real, margem, creditos e consumo de provedores.',
      'Acompanhe uso de Gemini, ElevenLabs e automacoes. Calcule custo real, preco ConnectyHub, margem e alertas de consumo.',
      'needs_review',
      50,
      true,
      array['billing_rates', 'usage_events', 'credit_wallets']::text[],
      array['usage_event_created', 'daily_margin_report']::text[],
      'connectyhub/finance.margin.report',
      'global',
      2500::numeric,
      '{}'::jsonb
    )
) as seed(
  sector_code,
  sector_name,
  agent_code,
  name,
  persona_name,
  avatar_url,
  avatar_alt,
  profile_bio,
  role_title,
  description,
  prompt,
  status,
  autonomy_level,
  requires_human_approval,
  tools,
  triggers,
  inngest_event_name,
  memory_access_level,
  monthly_budget_credits,
  metadata
)
where not exists (
  select 1
  from public.agent_registry existing
  where existing.scope = 'platform'
    and existing.organization_id is null
    and existing.agent_code = seed.agent_code
);

insert into public.intelligence_memory (
  scope,
  memory_type,
  title,
  content,
  created_by_agent_id,
  importance,
  tags,
  metadata
)
select
  'platform'::public.agent_scope,
  'strategy',
  'ConnectyHub vende sem site',
  'A proposta central e permitir que o cliente venda produtos e servicos no WhatsApp sem pagina de vendas, usando agentes, funil, trafego, remarketing e dados estruturados.',
  agents.id,
  0.95,
  array['posicionamento', 'whatsapp', 'mvp']::text[],
  '{"seed":true}'::jsonb
from public.agent_registry agents
where agents.agent_code = 'ceo-digital-connectyhub'
  and not exists (
    select 1
    from public.intelligence_memory memory
    where memory.scope = 'platform'
      and memory.title = 'ConnectyHub vende sem site'
  );

insert into public.content_pipeline_items (
  scope,
  content_type,
  status,
  title,
  summary,
  producer_agent_id,
  tags,
  metadata
)
select
  'platform'::public.agent_scope,
  'blog',
  'idea'::public.content_pipeline_status,
  'Como vender pelo WhatsApp sem pagina de vendas',
  'Primeira pauta do ecossistema: explicar a proposta da ConnectyHub para afiliados, prestadores e pequenos negocios.',
  agents.id,
  array['blog', 'whatsapp', 'afiliados']::text[],
  '{"seed":true}'::jsonb
from public.agent_registry agents
where agents.agent_code = 'agente-blog'
  and not exists (
    select 1
    from public.content_pipeline_items item
    where item.scope = 'platform'
      and item.title = 'Como vender pelo WhatsApp sem pagina de vendas'
  );
