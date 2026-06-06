do $do$
begin
  create type public.billing_provider as enum (
    'gemini',
    'elevenlabs',
    'uazapi',
    'meta',
    'google_ads',
    'r2',
    'inngest',
    'stripe',
    'wordpress',
    'vercel',
    'openai',
    'supabase',
    'custom'
  );
exception when duplicate_object then null;
end $do$;

do $do$
begin
  create type public.billing_unit as enum (
    'input_token',
    'output_token',
    'character',
    'credit',
    'request',
    'minute',
    'megabyte',
    'instance',
    'message',
    'media',
    'custom'
  );
exception when duplicate_object then null;
end $do$;

do $do$
begin
  create type public.credit_transaction_type as enum (
    'grant',
    'purchase',
    'debit',
    'refund',
    'adjustment',
    'expiration'
  );
exception when duplicate_object then null;
end $do$;

do $do$
begin
  create type public.usage_event_status as enum (
    'pending',
    'completed',
    'failed',
    'refunded'
  );
exception when duplicate_object then null;
end $do$;

create table if not exists public.provider_cost_centers (
  id uuid primary key default gen_random_uuid(),
  provider public.billing_provider not null unique,
  name text not null,
  description text,
  enabled boolean not null default true,
  default_margin_multiplier numeric(12,4) not null default 3,
  default_markup_percent numeric(8,4) not null default 0,
  currency text not null default 'BRL',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_features (
  id uuid primary key default gen_random_uuid(),
  cost_center_id uuid not null references public.provider_cost_centers(id) on delete cascade,
  feature_code text not null,
  name text not null,
  description text,
  unit public.billing_unit not null default 'credit',
  enabled boolean not null default true,
  billable boolean not null default true,
  included_in_plans text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cost_center_id, feature_code)
);

create table if not exists public.provider_models (
  id uuid primary key default gen_random_uuid(),
  cost_center_id uuid not null references public.provider_cost_centers(id) on delete cascade,
  provider_model_id text not null,
  display_name text not null,
  feature_code text,
  supports_billing boolean not null default true,
  enabled boolean not null default true,
  input_unit public.billing_unit,
  output_unit public.billing_unit,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cost_center_id, provider_model_id)
);

create table if not exists public.billing_rates (
  id uuid primary key default gen_random_uuid(),
  cost_center_id uuid not null references public.provider_cost_centers(id) on delete cascade,
  feature_id uuid references public.provider_features(id) on delete cascade,
  model_id uuid references public.provider_models(id) on delete cascade,
  plan_code text,
  unit public.billing_unit not null,
  provider_cost_per_unit numeric(18,8) not null default 0,
  connecty_price_per_unit numeric(18,8) not null default 0,
  margin_multiplier numeric(12,4),
  minimum_charge_credits numeric(18,6) not null default 0,
  currency text not null default 'BRL',
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_wallets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  balance_credits numeric(18,6) not null default 0,
  reserved_credits numeric(18,6) not null default 0,
  lifetime_purchased_credits numeric(18,6) not null default 0,
  lifetime_used_credits numeric(18,6) not null default 0,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (balance_credits >= 0),
  check (reserved_credits >= 0)
);

create table if not exists public.organization_billing_limits (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  monthly_credit_limit numeric(18,6),
  daily_credit_limit numeric(18,6),
  allow_overage boolean not null default false,
  overage_limit_credits numeric(18,6) not null default 0,
  hard_block_when_empty boolean not null default true,
  alert_threshold_percent numeric(8,4) not null default 80,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  provider public.billing_provider not null,
  feature_code text not null,
  model_id text,
  agent_id text,
  conversation_id text,
  lead_id text,
  status public.usage_event_status not null default 'completed',
  input_units numeric(18,6) not null default 0,
  output_units numeric(18,6) not null default 0,
  provider_cost numeric(18,8) not null default 0,
  connecty_charge_credits numeric(18,6) not null default 0,
  connecty_revenue_estimate numeric(18,8) not null default 0,
  gross_margin_estimate numeric(18,8) not null default 0,
  currency text not null default 'BRL',
  request_id text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (input_units >= 0),
  check (output_units >= 0),
  check (provider_cost >= 0),
  check (connecty_charge_credits >= 0)
);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  wallet_id uuid not null references public.credit_wallets(id) on delete cascade,
  transaction_type public.credit_transaction_type not null,
  amount_credits numeric(18,6) not null,
  balance_after_credits numeric(18,6) not null,
  provider public.billing_provider,
  usage_event_id uuid references public.usage_events(id) on delete set null,
  external_reference text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (amount_credits <> 0)
);

create table if not exists public.customer_voices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  provider public.billing_provider not null default 'elevenlabs',
  provider_voice_id text,
  name text not null,
  status text not null default 'draft',
  consent_status text not null default 'pending',
  default_for_agents boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generated_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  usage_event_id uuid references public.usage_events(id) on delete set null,
  provider public.billing_provider,
  media_type text not null,
  storage_url text,
  r2_object_key text,
  duration_seconds numeric(12,3),
  bytes_size bigint,
  transcript text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_provider_features_cost_center
  on public.provider_features (cost_center_id, enabled);

create index if not exists idx_provider_models_cost_center
  on public.provider_models (cost_center_id, enabled);

create index if not exists idx_billing_rates_lookup
  on public.billing_rates (cost_center_id, feature_id, model_id, plan_code, unit, active);

create index if not exists idx_usage_events_org_time
  on public.usage_events (organization_id, occurred_at desc);

create index if not exists idx_usage_events_provider_time
  on public.usage_events (provider, occurred_at desc);

create index if not exists idx_credit_transactions_org_time
  on public.credit_transactions (organization_id, created_at desc);

create index if not exists idx_customer_voices_org
  on public.customer_voices (organization_id, status);

create index if not exists idx_generated_media_org_time
  on public.generated_media (organization_id, created_at desc);

drop trigger if exists touch_provider_cost_centers_updated_at on public.provider_cost_centers;
create trigger touch_provider_cost_centers_updated_at
before update on public.provider_cost_centers
for each row execute function public.touch_updated_at();

drop trigger if exists touch_provider_features_updated_at on public.provider_features;
create trigger touch_provider_features_updated_at
before update on public.provider_features
for each row execute function public.touch_updated_at();

drop trigger if exists touch_provider_models_updated_at on public.provider_models;
create trigger touch_provider_models_updated_at
before update on public.provider_models
for each row execute function public.touch_updated_at();

drop trigger if exists touch_billing_rates_updated_at on public.billing_rates;
create trigger touch_billing_rates_updated_at
before update on public.billing_rates
for each row execute function public.touch_updated_at();

drop trigger if exists touch_credit_wallets_updated_at on public.credit_wallets;
create trigger touch_credit_wallets_updated_at
before update on public.credit_wallets
for each row execute function public.touch_updated_at();

drop trigger if exists touch_organization_billing_limits_updated_at on public.organization_billing_limits;
create trigger touch_organization_billing_limits_updated_at
before update on public.organization_billing_limits
for each row execute function public.touch_updated_at();

drop trigger if exists touch_customer_voices_updated_at on public.customer_voices;
create trigger touch_customer_voices_updated_at
before update on public.customer_voices
for each row execute function public.touch_updated_at();

create or replace function public.ensure_credit_wallet(p_organization_id uuid)
returns public.credit_wallets
language plpgsql
security definer
set search_path = public
as $fn$
declare
  wallet public.credit_wallets%rowtype;
begin
  insert into public.credit_wallets (organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  select *
  into wallet
  from public.credit_wallets
  where organization_id = p_organization_id;

  return wallet;
end;
$fn$;

create or replace function public.grant_credit_wallet(
  p_organization_id uuid,
  p_amount_credits numeric,
  p_description text default null,
  p_external_reference text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_transaction_type public.credit_transaction_type default 'grant'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  wallet public.credit_wallets%rowtype;
  transaction_id uuid;
  next_balance numeric(18,6);
begin
  if p_amount_credits <= 0 then
    raise exception 'Credit amount must be greater than zero.';
  end if;

  perform public.ensure_credit_wallet(p_organization_id);

  select *
  into wallet
  from public.credit_wallets
  where organization_id = p_organization_id
  for update;

  next_balance := wallet.balance_credits + p_amount_credits;

  update public.credit_wallets
  set
    balance_credits = next_balance,
    lifetime_purchased_credits = lifetime_purchased_credits + p_amount_credits
  where id = wallet.id;

  insert into public.credit_transactions (
    organization_id,
    wallet_id,
    transaction_type,
    amount_credits,
    balance_after_credits,
    external_reference,
    description,
    metadata,
    created_by
  )
  values (
    p_organization_id,
    wallet.id,
    p_transaction_type,
    p_amount_credits,
    next_balance,
    p_external_reference,
    p_description,
    p_metadata,
    auth.uid()
  )
  returning id into transaction_id;

  return transaction_id;
end;
$fn$;

create or replace function public.debit_credit_wallet(
  p_organization_id uuid,
  p_amount_credits numeric,
  p_provider public.billing_provider default null,
  p_usage_event_id uuid default null,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  wallet public.credit_wallets%rowtype;
  limits public.organization_billing_limits%rowtype;
  transaction_id uuid;
  next_balance numeric(18,6);
  available_credits numeric(18,6);
begin
  if p_amount_credits <= 0 then
    raise exception 'Debit amount must be greater than zero.';
  end if;

  perform public.ensure_credit_wallet(p_organization_id);

  select *
  into wallet
  from public.credit_wallets
  where organization_id = p_organization_id
  for update;

  select *
  into limits
  from public.organization_billing_limits
  where organization_id = p_organization_id;

  available_credits := wallet.balance_credits;

  if coalesce(limits.allow_overage, false) then
    available_credits := available_credits + coalesce(limits.overage_limit_credits, 0);
  end if;

  if coalesce(limits.hard_block_when_empty, true) and available_credits < p_amount_credits then
    raise exception 'Insufficient ConnectyHub credits.';
  end if;

  next_balance := wallet.balance_credits - p_amount_credits;

  update public.credit_wallets
  set
    balance_credits = greatest(next_balance, 0),
    lifetime_used_credits = lifetime_used_credits + p_amount_credits
  where id = wallet.id;

  insert into public.credit_transactions (
    organization_id,
    wallet_id,
    transaction_type,
    amount_credits,
    balance_after_credits,
    provider,
    usage_event_id,
    description,
    metadata,
    created_by
  )
  values (
    p_organization_id,
    wallet.id,
    'debit',
    p_amount_credits * -1,
    greatest(next_balance, 0),
    p_provider,
    p_usage_event_id,
    p_description,
    p_metadata,
    auth.uid()
  )
  returning id into transaction_id;

  return transaction_id;
end;
$fn$;

alter table public.provider_cost_centers enable row level security;
alter table public.provider_features enable row level security;
alter table public.provider_models enable row level security;
alter table public.billing_rates enable row level security;
alter table public.credit_wallets enable row level security;
alter table public.organization_billing_limits enable row level security;
alter table public.usage_events enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.customer_voices enable row level security;
alter table public.generated_media enable row level security;

drop policy if exists "cost centers readable by authenticated users" on public.provider_cost_centers;
create policy "cost centers readable by authenticated users"
on public.provider_cost_centers for select
using (auth.uid() is not null and (enabled = true or public.is_platform_admin()));

drop policy if exists "cost centers managed by platform admins" on public.provider_cost_centers;
create policy "cost centers managed by platform admins"
on public.provider_cost_centers for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "provider features readable by authenticated users" on public.provider_features;
create policy "provider features readable by authenticated users"
on public.provider_features for select
using (auth.uid() is not null and (enabled = true or public.is_platform_admin()));

drop policy if exists "provider features managed by platform admins" on public.provider_features;
create policy "provider features managed by platform admins"
on public.provider_features for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "provider models readable by authenticated users" on public.provider_models;
create policy "provider models readable by authenticated users"
on public.provider_models for select
using (auth.uid() is not null and (enabled = true or public.is_platform_admin()));

drop policy if exists "provider models managed by platform admins" on public.provider_models;
create policy "provider models managed by platform admins"
on public.provider_models for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "billing rates visible to platform admins" on public.billing_rates;
create policy "billing rates visible to platform admins"
on public.billing_rates for select
using (public.is_platform_admin());

drop policy if exists "billing rates managed by platform admins" on public.billing_rates;
create policy "billing rates managed by platform admins"
on public.billing_rates for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "wallets visible to org members or platform admins" on public.credit_wallets;
create policy "wallets visible to org members or platform admins"
on public.credit_wallets for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "wallets managed by platform admins" on public.credit_wallets;
create policy "wallets managed by platform admins"
on public.credit_wallets for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "billing limits visible to org members or platform admins" on public.organization_billing_limits;
create policy "billing limits visible to org members or platform admins"
on public.organization_billing_limits for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "billing limits managed by org admins or platform admins" on public.organization_billing_limits;
create policy "billing limits managed by org admins or platform admins"
on public.organization_billing_limits for all
using (public.is_platform_admin() or public.is_organization_admin(organization_id))
with check (public.is_platform_admin() or public.is_organization_admin(organization_id));

drop policy if exists "usage events visible to org members or platform admins" on public.usage_events;
create policy "usage events visible to org members or platform admins"
on public.usage_events for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "usage events inserted by org members or platform admins" on public.usage_events;
create policy "usage events inserted by org members or platform admins"
on public.usage_events for insert
with check (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "credit transactions visible to org members or platform admins" on public.credit_transactions;
create policy "credit transactions visible to org members or platform admins"
on public.credit_transactions for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "credit transactions inserted by org admins or platform admins" on public.credit_transactions;
create policy "credit transactions inserted by org admins or platform admins"
on public.credit_transactions for insert
with check (public.is_platform_admin() or public.is_organization_admin(organization_id));

drop policy if exists "voices visible to org members or platform admins" on public.customer_voices;
create policy "voices visible to org members or platform admins"
on public.customer_voices for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "voices managed by org admins or platform admins" on public.customer_voices;
create policy "voices managed by org admins or platform admins"
on public.customer_voices for all
using (public.is_platform_admin() or public.is_organization_admin(organization_id))
with check (public.is_platform_admin() or public.is_organization_admin(organization_id));

drop policy if exists "media visible to org members or platform admins" on public.generated_media;
create policy "media visible to org members or platform admins"
on public.generated_media for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "media inserted by org members or platform admins" on public.generated_media;
create policy "media inserted by org members or platform admins"
on public.generated_media for insert
with check (public.is_platform_admin() or public.is_organization_member(organization_id));

insert into public.provider_cost_centers (
  provider,
  name,
  description,
  default_margin_multiplier,
  default_markup_percent,
  currency,
  metadata
)
values
  (
    'gemini',
    'Gemini / Google AI Core',
    'Centro de custo para LLM, agentes, analise de leads, embeddings e revenda de tokens da ConnectyHub.',
    5,
    0,
    'BRL',
    '{"owner":"Setor de Inteligencia Artificial","billing_strategy":"provider_cost_plus_margin"}'::jsonb
  ),
  (
    'elevenlabs',
    'ElevenLabs / Voz e clonagem',
    'Centro de custo para sintese de voz, clonagem autorizada, respostas por audio e biblioteca de vozes dos clientes.',
    5,
    0,
    'BRL',
    '{"owner":"Setor de Experiencia","billing_strategy":"provider_cost_plus_margin"}'::jsonb
  )
on conflict (provider) do update
set
  name = excluded.name,
  description = excluded.description,
  default_margin_multiplier = excluded.default_margin_multiplier,
  default_markup_percent = excluded.default_markup_percent,
  currency = excluded.currency,
  metadata = public.provider_cost_centers.metadata || excluded.metadata,
  updated_at = now();

insert into public.provider_features (cost_center_id, feature_code, name, description, unit, included_in_plans, metadata)
select cc.id, seed.feature_code, seed.name, seed.description, seed.unit::public.billing_unit, seed.included_in_plans, seed.metadata
from public.provider_cost_centers cc
cross join (
  values
    ('chat_completion', 'Atendimento IA', 'Mensagens do agente Gemini no WhatsApp, Instagram, direct e chat.', 'output_token', array['trial','starter','pro','scale']::text[], '{"bill_to_client":true}'::jsonb),
    ('lead_analysis', 'Analise de leads', 'Classificacao, score, resumo e proximo passo de cada lead.', 'output_token', array['pro','scale']::text[], '{"bill_to_client":true}'::jsonb),
    ('conversation_summary', 'Resumo de conversas', 'Memoria operacional e resumo de conversas para CRM e remarketing.', 'output_token', array['starter','pro','scale']::text[], '{"bill_to_client":true}'::jsonb),
    ('content_generation', 'Conteudo e trafego organico', 'Criacao de posts, legendas, respostas e ideias de campanha.', 'output_token', array['pro','scale']::text[], '{"bill_to_client":true}'::jsonb),
    ('traffic_agent', 'Agente de trafego pago', 'Analise e recomendacao de campanhas Google Ads e Meta Ads.', 'output_token', array['scale']::text[], '{"bill_to_client":true}'::jsonb),
    ('embedding_memory', 'Memoria semantica', 'Embeddings para busca, memoria da empresa e base de conhecimento.', 'input_token', array['pro','scale']::text[], '{"bill_to_client":true}'::jsonb)
) as seed(feature_code, name, description, unit, included_in_plans, metadata)
where cc.provider = 'gemini'
on conflict (cost_center_id, feature_code) do update
set
  name = excluded.name,
  description = excluded.description,
  unit = excluded.unit,
  included_in_plans = excluded.included_in_plans,
  metadata = public.provider_features.metadata || excluded.metadata,
  updated_at = now();

insert into public.provider_features (cost_center_id, feature_code, name, description, unit, included_in_plans, metadata)
select cc.id, seed.feature_code, seed.name, seed.description, seed.unit::public.billing_unit, seed.included_in_plans, seed.metadata
from public.provider_cost_centers cc
cross join (
  values
    ('text_to_speech', 'Texto para audio', 'Audio gerado para respostas humanizadas no WhatsApp e demos.', 'character', array['pro','scale']::text[], '{"bill_to_client":true}'::jsonb),
    ('voice_clone', 'Clone de voz autorizado', 'Criacao e treinamento de voz com consentimento do cliente.', 'request', array['scale']::text[], '{"bill_to_client":true,"requires_consent":true}'::jsonb),
    ('voice_library', 'Biblioteca de vozes', 'Armazenamento e uso de vozes padrao ou personalizadas.', 'request', array['pro','scale']::text[], '{"bill_to_client":true}'::jsonb),
    ('voice_reply_whatsapp', 'Resposta por audio no WhatsApp', 'Geracao de audio conectada a conversas e funis de venda.', 'character', array['pro','scale']::text[], '{"bill_to_client":true}'::jsonb),
    ('voice_changer', 'Conversao e ajuste de voz', 'Transformacao de audio para experiencias e campanhas futuras.', 'request', array['scale']::text[], '{"bill_to_client":true}'::jsonb)
) as seed(feature_code, name, description, unit, included_in_plans, metadata)
where cc.provider = 'elevenlabs'
on conflict (cost_center_id, feature_code) do update
set
  name = excluded.name,
  description = excluded.description,
  unit = excluded.unit,
  included_in_plans = excluded.included_in_plans,
  metadata = public.provider_features.metadata || excluded.metadata,
  updated_at = now();

insert into public.provider_models (
  cost_center_id,
  provider_model_id,
  display_name,
  feature_code,
  input_unit,
  output_unit,
  metadata
)
select cc.id, seed.provider_model_id, seed.display_name, seed.feature_code, seed.input_unit::public.billing_unit, seed.output_unit::public.billing_unit, seed.metadata
from public.provider_cost_centers cc
cross join (
  values
    ('gemini-2.5-flash', 'Gemini 2.5 Flash', 'chat_completion', 'input_token', 'output_token', '{"default_candidate":true}'::jsonb),
    ('gemini-2.5-pro', 'Gemini 2.5 Pro', 'traffic_agent', 'input_token', 'output_token', '{"premium_candidate":true}'::jsonb)
) as seed(provider_model_id, display_name, feature_code, input_unit, output_unit, metadata)
where cc.provider = 'gemini'
on conflict (cost_center_id, provider_model_id) do update
set
  display_name = excluded.display_name,
  feature_code = excluded.feature_code,
  input_unit = excluded.input_unit,
  output_unit = excluded.output_unit,
  metadata = public.provider_models.metadata || excluded.metadata,
  updated_at = now();

insert into public.provider_models (
  cost_center_id,
  provider_model_id,
  display_name,
  feature_code,
  input_unit,
  output_unit,
  metadata
)
select cc.id, seed.provider_model_id, seed.display_name, seed.feature_code, seed.input_unit::public.billing_unit, seed.output_unit::public.billing_unit, seed.metadata
from public.provider_cost_centers cc
cross join (
  values
    ('eleven_multilingual_v2', 'Eleven Multilingual v2', 'text_to_speech', 'character', 'character', '{"quality":"high"}'::jsonb),
    ('eleven_flash_v2_5', 'Eleven Flash v2.5', 'voice_reply_whatsapp', 'character', 'character', '{"latency":"low"}'::jsonb)
) as seed(provider_model_id, display_name, feature_code, input_unit, output_unit, metadata)
where cc.provider = 'elevenlabs'
on conflict (cost_center_id, provider_model_id) do update
set
  display_name = excluded.display_name,
  feature_code = excluded.feature_code,
  input_unit = excluded.input_unit,
  output_unit = excluded.output_unit,
  metadata = public.provider_models.metadata || excluded.metadata,
  updated_at = now();

insert into public.billing_rates (
  cost_center_id,
  feature_id,
  model_id,
  plan_code,
  unit,
  provider_cost_per_unit,
  connecty_price_per_unit,
  margin_multiplier,
  minimum_charge_credits,
  metadata
)
select
  cc.id,
  pf.id,
  pm.id,
  null,
  pf.unit,
  0,
  0,
  cc.default_margin_multiplier,
  0,
  '{"status":"placeholder","action":"configure_real_provider_cost_before_production"}'::jsonb
from public.provider_cost_centers cc
join public.provider_features pf on pf.cost_center_id = cc.id
left join public.provider_models pm on pm.cost_center_id = cc.id and pm.feature_code = pf.feature_code
where cc.provider in ('gemini', 'elevenlabs')
  and not exists (
    select 1
    from public.billing_rates br
    where br.cost_center_id = cc.id
      and br.feature_id = pf.id
      and coalesce(br.model_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(pm.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and br.plan_code is null
      and br.unit = pf.unit
      and br.active = true
  );
