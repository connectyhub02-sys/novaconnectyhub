-- Voice phase E: real-time voice agents linked to the company's WhatsApp agents.
-- A voice agent mirrors an agent's prompt and identity on the provider's agent
-- platform. Each finished conversation is charged once from the company wallet:
-- the larger of 192 credits/minute (speech engine US$ 0.08/min x 6 x 4) and the
-- provider's total conversation cost (speech + language model) x 6 x 4, minimum 5.

create table if not exists public.voice_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_registry_id uuid not null references public.agent_registry(id) on delete cascade,
  provider_agent_id text unique,
  name text not null,
  voice_id text not null,
  first_message text not null,
  language text not null default 'pt',
  max_duration_seconds integer not null default 300 check (max_duration_seconds between 60 and 1800),
  status text not null default 'active' check (status in ('active', 'paused', 'deleted')),
  last_synced_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_registry_id)
);

create table if not exists public.voice_agent_conversations (
  id uuid primary key default gen_random_uuid(),
  voice_agent_id uuid not null references public.voice_agents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider_conversation_id text not null unique,
  status text not null,
  duration_seconds integer not null default 0,
  cost_usd numeric(18,6),
  charged_credits numeric(18,6),
  usage_event_id uuid references public.usage_events(id) on delete set null,
  started_at timestamptz,
  metered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists voice_agent_conversations_agent_date on public.voice_agent_conversations(voice_agent_id, created_at desc);

alter table public.voice_agents enable row level security;
alter table public.voice_agent_conversations enable row level security;
revoke all on public.voice_agents, public.voice_agent_conversations from public, anon, authenticated;
grant select, insert, update, delete on public.voice_agents, public.voice_agent_conversations to service_role;

do $migration$
declare cc uuid; feature uuid; model uuid;
begin
  select id into cc from public.provider_cost_centers where provider = 'elevenlabs';
  if cc is null then raise exception 'ELEVENLABS_COST_CENTER_REQUIRED'; end if;
  insert into public.provider_features(cost_center_id, feature_code, name, description, unit, enabled, billable)
    values (cc, 'voice_agent_conversation', 'Agente de voz', 'Conversa em tempo real com agente de voz', 'minute', true, true)
    on conflict (cost_center_id, feature_code) do nothing;
  select id into feature from public.provider_features where cost_center_id = cc and feature_code = 'voice_agent_conversation';
  insert into public.provider_models(cost_center_id, provider_model_id, display_name, feature_code, supports_billing, enabled, input_unit, output_unit, metadata)
    values (cc, 'elevenlabs-agents', 'ElevenLabs Agents', 'voice_agent_conversation', true, true, 'minute'::public.billing_unit, 'minute'::public.billing_unit, '{"added":"2026-10-02"}')
    on conflict (cost_center_id, provider_model_id) do update set enabled = true;
  select id into model from public.provider_models where cost_center_id = cc and provider_model_id = 'elevenlabs-agents';
  if not exists (select 1 from public.billing_rates where feature_id = feature and model_id = model and active and plan_code is null) then
    insert into public.billing_rates(cost_center_id, feature_id, model_id, plan_code, unit, provider_cost_per_unit, connecty_price_per_unit,
      margin_multiplier, minimum_charge_credits, currency, effective_from, active, metadata)
    values (cc, feature, model, null, 'minute', 0.48, 192, 4, 5, 'BRL', now(), true,
      jsonb_build_object('audit', '2026-10-02', 'usd_per_minute', 0.08, 'usd_fx_guardrail', 6, 'markup', 4,
        'note', 'Speech engine base; the language model cost reported per conversation is added at the same 4x',
        'pricing_source', 'https://elevenlabs.io/pricing/api'));
  end if;
end $migration$;
