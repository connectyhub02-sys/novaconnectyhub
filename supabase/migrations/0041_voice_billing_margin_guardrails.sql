-- Keep voice metering profitable when provider prices are paid in USD and ConnectyHub charges in BRL credits.
-- 1 credit = R$0.01 in src/lib/billing/credit-economics.ts.

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
    ('gemini-2.5-flash-preview-tts', 'Gemini 2.5 Flash Preview TTS', 'voice_reply_whatsapp', 'character', 'character', '{"latency":"low","tts":true,"pricing_guardrail":"voice_margin_2026_07"}'::jsonb)
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
    -- Low-cost audio. Provider cost is an estimated BRL/character equivalent from USD TTS audio-token pricing.
    ('gemini', 'voice_reply_whatsapp', 'gemini-3.1-flash-tts-preview', 'character', 0.00025000, 0.06000000, 15.000000, '{"preset":"voice_margin_2026_07","channel":"whatsapp_audio","public_tier":"low_cost","credit_unit_brl":0.01,"usd_fx_guardrail":6.0,"source_note":"official_usd_pricing_converted_to_brl_character_estimate"}'::jsonb),
    ('gemini', 'text_to_speech', 'gemini-3.1-flash-tts-preview', 'character', 0.00025000, 0.06000000, 15.000000, '{"preset":"voice_margin_2026_07","channel":"generic_audio","public_tier":"low_cost","credit_unit_brl":0.01,"usd_fx_guardrail":6.0,"source_note":"official_usd_pricing_converted_to_brl_character_estimate"}'::jsonb),
    ('gemini', 'voice_reply_whatsapp', 'gemini-2.5-flash-preview-tts', 'character', 0.00025000, 0.06000000, 15.000000, '{"preset":"voice_margin_2026_07","channel":"whatsapp_audio","public_tier":"low_cost","credit_unit_brl":0.01,"usd_fx_guardrail":6.0,"source_note":"fallback_tts_model_guardrail"}'::jsonb),
    ('gemini', 'text_to_speech', 'gemini-2.5-flash-preview-tts', 'character', 0.00025000, 0.06000000, 15.000000, '{"preset":"voice_margin_2026_07","channel":"generic_audio","public_tier":"low_cost","credit_unit_brl":0.01,"usd_fx_guardrail":6.0,"source_note":"fallback_tts_model_guardrail"}'::jsonb),

    -- Premium audio. Flash/Turbo is lower provider cost; Multilingual/custom/cloned voices are higher.
    ('elevenlabs', 'voice_reply_whatsapp', 'eleven_flash_v2_5', 'character', 0.00030000, 0.12000000, 30.000000, '{"preset":"voice_margin_2026_07","channel":"whatsapp_audio","public_tier":"premium","credit_unit_brl":0.01,"usd_fx_guardrail":6.0,"source_note":"official_usd_pricing_converted_to_brl"}'::jsonb),
    ('elevenlabs', 'text_to_speech', 'eleven_multilingual_v2', 'character', 0.00060000, 0.24000000, 50.000000, '{"preset":"voice_margin_2026_07","channel":"generic_audio","public_tier":"premium","credit_unit_brl":0.01,"usd_fx_guardrail":6.0,"source_note":"official_usd_pricing_converted_to_brl"}'::jsonb),

    -- Voice cloning is a request-level recovery charge for paid voice capacity plus automatic preview generation.
    ('elevenlabs', 'voice_clone', null, 'request', 1.00000000, 500.00000000, 500.000000, '{"preset":"voice_margin_2026_07","public_tier":"premium","credit_unit_brl":0.01,"includes":"voice_clone_request_and_preview","source_note":"capacity_recovery_guardrail"}'::jsonb)
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
  join public.provider_features pf on pf.cost_center_id = cc.id and pf.feature_code = seed_rates.feature_code
  left join public.provider_models pm on pm.cost_center_id = cc.id and pm.provider_model_id = seed_rates.provider_model_id
)
update public.billing_rates br
set
  provider_cost_per_unit = resolved.provider_cost_per_unit,
  connecty_price_per_unit = resolved.connecty_price_per_unit,
  margin_multiplier = round(((resolved.connecty_price_per_unit * 0.01) / nullif(resolved.provider_cost_per_unit, 0))::numeric, 4),
  minimum_charge_credits = resolved.minimum_charge_credits,
  metadata = br.metadata || resolved.metadata || '{"status":"active","guardrail":"connecty_revenue_brl_gt_provider_cost_brl"}'::jsonb,
  updated_at = now()
from resolved
where br.cost_center_id = resolved.cost_center_id
  and br.feature_id = resolved.feature_id
  and coalesce(br.model_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(resolved.model_id, '00000000-0000-0000-0000-000000000000'::uuid)
  and br.plan_code is null
  and br.unit = resolved.unit
  and br.active = true;

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
    ('gemini', 'voice_reply_whatsapp', 'gemini-3.1-flash-tts-preview', 'character', 0.00025000, 0.06000000, 15.000000, '{"preset":"voice_margin_2026_07","channel":"whatsapp_audio","public_tier":"low_cost","credit_unit_brl":0.01,"usd_fx_guardrail":6.0}'::jsonb),
    ('gemini', 'text_to_speech', 'gemini-3.1-flash-tts-preview', 'character', 0.00025000, 0.06000000, 15.000000, '{"preset":"voice_margin_2026_07","channel":"generic_audio","public_tier":"low_cost","credit_unit_brl":0.01,"usd_fx_guardrail":6.0}'::jsonb),
    ('gemini', 'voice_reply_whatsapp', 'gemini-2.5-flash-preview-tts', 'character', 0.00025000, 0.06000000, 15.000000, '{"preset":"voice_margin_2026_07","channel":"whatsapp_audio","public_tier":"low_cost","credit_unit_brl":0.01,"usd_fx_guardrail":6.0}'::jsonb),
    ('gemini', 'text_to_speech', 'gemini-2.5-flash-preview-tts', 'character', 0.00025000, 0.06000000, 15.000000, '{"preset":"voice_margin_2026_07","channel":"generic_audio","public_tier":"low_cost","credit_unit_brl":0.01,"usd_fx_guardrail":6.0}'::jsonb),
    ('elevenlabs', 'voice_reply_whatsapp', 'eleven_flash_v2_5', 'character', 0.00030000, 0.12000000, 30.000000, '{"preset":"voice_margin_2026_07","channel":"whatsapp_audio","public_tier":"premium","credit_unit_brl":0.01,"usd_fx_guardrail":6.0}'::jsonb),
    ('elevenlabs', 'text_to_speech', 'eleven_multilingual_v2', 'character', 0.00060000, 0.24000000, 50.000000, '{"preset":"voice_margin_2026_07","channel":"generic_audio","public_tier":"premium","credit_unit_brl":0.01,"usd_fx_guardrail":6.0}'::jsonb),
    ('elevenlabs', 'voice_clone', null, 'request', 1.00000000, 500.00000000, 500.000000, '{"preset":"voice_margin_2026_07","public_tier":"premium","credit_unit_brl":0.01,"includes":"voice_clone_request_and_preview"}'::jsonb)
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
  join public.provider_features pf on pf.cost_center_id = cc.id and pf.feature_code = seed_rates.feature_code
  left join public.provider_models pm on pm.cost_center_id = cc.id and pm.provider_model_id = seed_rates.provider_model_id
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
  round(((resolved.connecty_price_per_unit * 0.01) / nullif(resolved.provider_cost_per_unit, 0))::numeric, 4),
  resolved.minimum_charge_credits,
  resolved.metadata || '{"status":"active","guardrail":"connecty_revenue_brl_gt_provider_cost_brl"}'::jsonb
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

update public.billing_rates br
set
  connecty_price_per_unit = round(((br.provider_cost_per_unit * 4) / 0.01)::numeric, 8),
  margin_multiplier = 4,
  minimum_charge_credits = greatest(br.minimum_charge_credits, 1),
  metadata = br.metadata || '{"guardrail":"auto_raised_to_minimum_4x_revenue_on_provider_cost"}'::jsonb,
  updated_at = now()
where br.active = true
  and br.provider_cost_per_unit > 0
  and (br.connecty_price_per_unit * 0.01) <= br.provider_cost_per_unit;

update public.billing_rates br
set
  active = false,
  metadata = br.metadata || '{"disabled_reason":"zero_price_placeholder_requires_real_cost_before_billing"}'::jsonb,
  updated_at = now()
from public.provider_cost_centers cc
where br.cost_center_id = cc.id
  and cc.provider in ('gemini', 'elevenlabs')
  and br.active = true
  and br.provider_cost_per_unit = 0
  and br.connecty_price_per_unit = 0
  and coalesce(br.metadata->>'status', '') = 'placeholder';
