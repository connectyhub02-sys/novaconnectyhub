-- Voice phase D: sound effects, music and voice remix, priced like the provider bills
-- the account (public API table, USD x 6 x 4 / R$ 0,01, minimum 5 credits):
--   sound effects US$ 0.12/min -> 288 credits per minute of generated audio
--   music         US$ 0.15/min -> 360 credits per minute
--   voice remix   same basis as voice design (US$ 0.10 per 1,000 preview characters)
-- The requested duration is chosen before generation, so every quote is exact.

do $migration$
declare cc uuid; item record; feature uuid; model uuid;
begin
  select id into cc from public.provider_cost_centers where provider = 'elevenlabs';
  if cc is null then raise exception 'ELEVENLABS_COST_CENTER_REQUIRED'; end if;
  for item in select * from (values
    ('studio_sound_effects', 'Efeitos sonoros', 'eleven_text_to_sound_v2', 'Eleven Sound Effects v2', 'minute', 0.12),
    ('studio_music', 'Música', 'music_v1', 'Eleven Music v1', 'minute', 0.15),
    ('studio_voice_remix', 'Remix de voz', 'voice-remix-default', 'Remix de voz', 'character', 0.0001)
  ) as t(feature_code, feature_name, model_id, model_name, unit, usd_per_unit) loop
    insert into public.provider_features(cost_center_id, feature_code, name, description, unit, enabled, billable)
      values (cc, item.feature_code, item.feature_name, item.feature_name || ' no Estúdio de Voz', item.unit::public.billing_unit, true, true)
      on conflict (cost_center_id, feature_code) do nothing;
    select id into feature from public.provider_features where cost_center_id = cc and feature_code = item.feature_code;
    insert into public.provider_models(cost_center_id, provider_model_id, display_name, feature_code, supports_billing, enabled, input_unit, output_unit, metadata)
      values (cc, item.model_id, item.model_name, item.feature_code, true, true, item.unit::public.billing_unit, item.unit::public.billing_unit, '{"added":"2026-10-02"}')
      on conflict (cost_center_id, provider_model_id) do update set enabled = true;
    select id into model from public.provider_models where cost_center_id = cc and provider_model_id = item.model_id;
    if not exists (select 1 from public.billing_rates where feature_id = feature and model_id = model and active and plan_code is null) then
      insert into public.billing_rates(cost_center_id, feature_id, model_id, plan_code, unit, provider_cost_per_unit, connecty_price_per_unit,
        margin_multiplier, minimum_charge_credits, currency, effective_from, active, metadata)
      values (cc, feature, model, null, item.unit::public.billing_unit, item.usd_per_unit * 6, item.usd_per_unit * 2400, 4, 5, 'BRL', now(), true,
        jsonb_build_object('audit', '2026-10-02', 'usd_per_unit', item.usd_per_unit, 'usd_fx_guardrail', 6, 'markup', 4,
          'pricing_source', 'https://elevenlabs.io/pricing/api'));
    end if;
  end loop;
end $migration$;

insert into public.studio_capabilities(operation, model_id, provider, feature_code, enabled, confirmed_at, cost_evidence, confirmed_rates)
select op.operation, m.provider_model_id, 'elevenlabs', f.feature_code, true, now(),
  'Tabela de API do fornecedor x 6 x 4, mínimo 5 créditos, conferida em 02/10/2026.',
  jsonb_build_array(jsonb_build_object('id', r.id, 'unit', r.unit, 'providerCostPerUnit', r.provider_cost_per_unit,
    'connectyPricePerUnit', r.connecty_price_per_unit, 'minimumChargeCredits', r.minimum_charge_credits))
from (values ('sound_effects', 'studio_sound_effects'), ('music', 'studio_music'), ('voice_remix', 'studio_voice_remix')) as op(operation, feature_code)
join public.provider_features f on f.feature_code = op.feature_code
join public.provider_cost_centers c on c.id = f.cost_center_id and c.provider = 'elevenlabs'
join public.billing_rates r on r.feature_id = f.id and r.active and r.plan_code is null
join public.provider_models m on m.id = r.model_id
on conflict (operation, model_id) do update set enabled = excluded.enabled, confirmed_at = excluded.confirmed_at,
  cost_evidence = excluded.cost_evidence, confirmed_rates = excluded.confirmed_rates, feature_code = excluded.feature_code;
