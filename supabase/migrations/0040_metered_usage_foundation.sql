-- Metering foundation for customer, trial and internal platform agents.

alter table public.usage_events
  add column if not exists billing_mode text not null default 'customer_billable',
  add column if not exists agent_scope text not null default 'customer',
  add column if not exists agent_run_id uuid references public.agent_runs(id) on delete set null,
  add column if not exists input_tokens numeric(18,6) not null default 0,
  add column if not exists output_tokens numeric(18,6) not null default 0,
  add column if not exists total_tokens numeric(18,6) not null default 0;

do $do$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'usage_events_billing_mode_check'
      and conrelid = 'public.usage_events'::regclass
  ) then
    alter table public.usage_events
      add constraint usage_events_billing_mode_check
      check (billing_mode in (
        'customer_billable',
        'trial_billable',
        'internal_shadow',
        'platform_absorbed',
        'free'
      ));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'usage_events_agent_scope_check'
      and conrelid = 'public.usage_events'::regclass
  ) then
    alter table public.usage_events
      add constraint usage_events_agent_scope_check
      check (agent_scope in ('customer', 'platform', 'internal', 'unknown'));
  end if;
end $do$;

create index if not exists idx_usage_events_billing_mode_time
  on public.usage_events (billing_mode, occurred_at desc);

create index if not exists idx_usage_events_agent_scope_time
  on public.usage_events (agent_scope, occurred_at desc);

create index if not exists idx_usage_events_agent_run
  on public.usage_events (agent_run_id)
  where agent_run_id is not null;

with duplicated_request_ids as (
  select
    id,
    request_id,
    row_number() over (
      partition by organization_id, provider, feature_code, request_id
      order by occurred_at asc, created_at asc, id asc
    ) as duplicate_rank
  from public.usage_events
  where request_id is not null
),
duplicates_to_rename as (
  select id, request_id
  from duplicated_request_ids
  where duplicate_rank > 1
)
update public.usage_events ue
set
  request_id = ue.request_id || ':duplicate:' || ue.id::text,
  metadata = ue.metadata || jsonb_build_object('original_request_id_before_metering_unique_index', duplicates_to_rename.request_id)
from duplicates_to_rename
where ue.id = duplicates_to_rename.id;

create unique index if not exists idx_usage_events_request_identity
  on public.usage_events (organization_id, provider, feature_code, request_id)
  where request_id is not null;

update public.usage_events
set
  input_tokens = case
    when input_tokens = 0 and feature_code in ('chat_completion', 'lead_analysis', 'conversation_summary', 'content_generation', 'traffic_agent', 'embedding_memory')
      then input_units
    else input_tokens
  end,
  output_tokens = case
    when output_tokens = 0 and feature_code in ('chat_completion', 'lead_analysis', 'conversation_summary', 'content_generation', 'traffic_agent')
      then output_units
    else output_tokens
  end;

update public.usage_events
set total_tokens = input_tokens + output_tokens
where total_tokens = 0
  and (input_tokens > 0 or output_tokens > 0);

insert into public.provider_features (cost_center_id, feature_code, name, description, unit, included_in_plans, metadata)
select cc.id, seed.feature_code, seed.name, seed.description, seed.unit::public.billing_unit, seed.included_in_plans, seed.metadata
from public.provider_cost_centers cc
cross join (
  values
    ('text_to_speech', 'Texto para audio Gemini', 'Sintese de voz economica via Gemini TTS.', 'character', array['trial','starter','pro','scale']::text[], '{"bill_to_client":true,"provider_family":"gemini_tts"}'::jsonb),
    ('voice_reply_whatsapp', 'Resposta por audio Gemini no WhatsApp', 'Audio do agente no WhatsApp usando Gemini TTS economico.', 'character', array['trial','starter','pro','scale']::text[], '{"bill_to_client":true,"provider_family":"gemini_tts"}'::jsonb)
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
    ('gemini-3.1-flash-tts-preview', 'Gemini 3.1 Flash TTS Preview', 'voice_reply_whatsapp', 'character', 'character', '{"latency":"low","tts":true}'::jsonb)
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

with seed_rates (
  provider,
  feature_code,
  provider_model_id,
  unit,
  provider_cost_per_unit,
  connecty_price_per_unit,
  minimum_charge_credits,
  metadata
) as (
  values
    ('gemini', 'chat_completion', 'gemini-2.5-flash', 'input_token', 0.00000002, 0.00015000, 0.000000, '{"preset":"mvp_metering","direction":"input"}'::jsonb),
    ('gemini', 'chat_completion', 'gemini-2.5-flash', 'output_token', 0.00000012, 0.00060000, 1.000000, '{"preset":"mvp_metering","direction":"output"}'::jsonb),
    ('gemini', 'chat_completion', 'gemini-2.5-pro', 'input_token', 0.00000008, 0.00030000, 0.000000, '{"preset":"mvp_metering","direction":"input"}'::jsonb),
    ('gemini', 'chat_completion', 'gemini-2.5-pro', 'output_token', 0.00000036, 0.00120000, 2.000000, '{"preset":"mvp_metering","direction":"output"}'::jsonb),
    ('gemini', 'lead_analysis', null, 'input_token', 0.00000002, 0.00012000, 0.000000, '{"preset":"mvp_metering","direction":"input"}'::jsonb),
    ('gemini', 'lead_analysis', null, 'output_token', 0.00000012, 0.00050000, 1.000000, '{"preset":"mvp_metering","direction":"output"}'::jsonb),
    ('gemini', 'conversation_summary', null, 'input_token', 0.00000002, 0.00010000, 0.000000, '{"preset":"mvp_metering","direction":"input"}'::jsonb),
    ('gemini', 'conversation_summary', null, 'output_token', 0.00000012, 0.00045000, 1.000000, '{"preset":"mvp_metering","direction":"output"}'::jsonb),
    ('gemini', 'content_generation', null, 'input_token', 0.00000002, 0.00015000, 0.000000, '{"preset":"mvp_metering","direction":"input"}'::jsonb),
    ('gemini', 'content_generation', null, 'output_token', 0.00000012, 0.00065000, 1.000000, '{"preset":"mvp_metering","direction":"output"}'::jsonb),
    ('gemini', 'traffic_agent', 'gemini-2.5-pro', 'input_token', 0.00000008, 0.00030000, 0.000000, '{"preset":"mvp_metering","direction":"input"}'::jsonb),
    ('gemini', 'traffic_agent', 'gemini-2.5-pro', 'output_token', 0.00000036, 0.00120000, 2.000000, '{"preset":"mvp_metering","direction":"output"}'::jsonb),
    ('gemini', 'embedding_memory', null, 'input_token', 0.00000001, 0.00005000, 0.250000, '{"preset":"mvp_metering","direction":"input"}'::jsonb),
    ('gemini', 'voice_reply_whatsapp', 'gemini-3.1-flash-tts-preview', 'character', 0.00000500, 0.00200000, 2.000000, '{"preset":"mvp_metering","channel":"whatsapp_audio"}'::jsonb),
    ('gemini', 'text_to_speech', 'gemini-3.1-flash-tts-preview', 'character', 0.00000500, 0.00200000, 2.000000, '{"preset":"mvp_metering","channel":"generic_audio"}'::jsonb),
    ('elevenlabs', 'voice_reply_whatsapp', 'eleven_flash_v2_5', 'character', 0.00003000, 0.00600000, 5.000000, '{"preset":"mvp_metering","channel":"whatsapp_audio"}'::jsonb),
    ('elevenlabs', 'text_to_speech', 'eleven_multilingual_v2', 'character', 0.00005000, 0.00800000, 5.000000, '{"preset":"mvp_metering","channel":"generic_audio"}'::jsonb)
),
resolved as (
  select
    cc.id as cost_center_id,
    pf.id as feature_id,
    pm.id as model_id,
    seed_rates.unit::public.billing_unit as unit,
    seed_rates.provider_cost_per_unit::numeric(18,8) as provider_cost_per_unit,
    seed_rates.connecty_price_per_unit::numeric(18,8) as connecty_price_per_unit,
    seed_rates.minimum_charge_credits::numeric(18,6) as minimum_charge_credits,
    seed_rates.metadata
  from seed_rates
  join public.provider_cost_centers cc on cc.provider = seed_rates.provider::public.billing_provider
  join public.provider_features pf
    on pf.cost_center_id = cc.id
   and pf.feature_code = seed_rates.feature_code
  left join public.provider_models pm
    on pm.cost_center_id = cc.id
   and seed_rates.provider_model_id is not null
   and pm.provider_model_id = seed_rates.provider_model_id
),
updated as (
  update public.billing_rates br
  set
    provider_cost_per_unit = resolved.provider_cost_per_unit,
    connecty_price_per_unit = resolved.connecty_price_per_unit,
    minimum_charge_credits = resolved.minimum_charge_credits,
    margin_multiplier = null,
    metadata = br.metadata || resolved.metadata,
    updated_at = now()
  from resolved
  where br.cost_center_id = resolved.cost_center_id
    and br.feature_id = resolved.feature_id
    and coalesce(br.model_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(resolved.model_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and br.plan_code is null
    and br.unit = resolved.unit
    and br.active = true
  returning br.id
)
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
  resolved.cost_center_id,
  resolved.feature_id,
  resolved.model_id,
  null,
  resolved.unit,
  resolved.provider_cost_per_unit,
  resolved.connecty_price_per_unit,
  null,
  resolved.minimum_charge_credits,
  resolved.metadata
from resolved
where not exists (
  select 1
  from public.billing_rates br
  where br.cost_center_id = resolved.cost_center_id
    and br.feature_id = resolved.feature_id
    and coalesce(br.model_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(resolved.model_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and br.plan_code is null
    and br.unit = resolved.unit
    and br.active = true
);
