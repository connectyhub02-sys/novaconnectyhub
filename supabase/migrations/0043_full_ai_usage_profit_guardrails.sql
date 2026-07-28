-- Full AI metering guardrails.
-- Keeps provider costs internal while making every customer-facing AI workload billable in credits.

insert into public.provider_features (
  cost_center_id,
  feature_code,
  name,
  description,
  unit,
  included_in_plans,
  metadata
)
select
  cc.id,
  seed.feature_code,
  seed.name,
  seed.description,
  seed.unit::public.billing_unit,
  seed.included_in_plans,
  seed.metadata
from public.provider_cost_centers cc
cross join (
  values
    ('audio_transcription', 'Transcricao de audio recebido', 'Transcricao de audio enviado pelo lead antes do agente responder.', 'output_token', array['trial','starter','pro','scale']::text[], '{"bill_to_client":true,"public_label":"Transcricao de audio","public_category":"audio","provider_cost_visible_to":"admin"}'::jsonb),
    ('media_image_analysis', 'Leitura de imagem recebida', 'Analise de foto, print ou imagem enviada pelo lead.', 'output_token', array['trial','starter','pro','scale']::text[], '{"bill_to_client":true,"public_label":"Leitura de imagem","public_category":"midia","provider_cost_visible_to":"admin"}'::jsonb),
    ('media_video_analysis', 'Leitura de video recebido', 'Analise de video enviado pelo lead.', 'output_token', array['trial','starter','pro','scale']::text[], '{"bill_to_client":true,"public_label":"Leitura de video","public_category":"midia","provider_cost_visible_to":"admin"}'::jsonb),
    ('media_document_analysis', 'Leitura de documento recebido', 'Analise de PDF, documento ou arquivo enviado pelo lead.', 'output_token', array['trial','starter','pro','scale']::text[], '{"bill_to_client":true,"public_label":"Leitura de documento","public_category":"midia","provider_cost_visible_to":"admin"}'::jsonb),
    ('human_handoff_detection', 'Deteccao de pedido humano', 'Classificacao contextual para decidir intervencao humana.', 'output_token', array['trial','starter','pro','scale']::text[], '{"bill_to_client":true,"public_label":"Analise de atendimento","public_category":"texto","provider_cost_visible_to":"admin"}'::jsonb),
    ('conversation_learning', 'Aprendizado de conversa', 'Extracao de aprendizado anonimo para melhorar atendimento.', 'output_token', array['trial','starter','pro','scale']::text[], '{"bill_to_client":true,"public_label":"Memoria de conversa","public_category":"texto","provider_cost_visible_to":"admin"}'::jsonb),
    ('lead_memory', 'Memoria do lead', 'Atualizacao de memoria individual do lead.', 'output_token', array['trial','starter','pro','scale']::text[], '{"bill_to_client":true,"public_label":"Memoria do lead","public_category":"texto","provider_cost_visible_to":"admin"}'::jsonb),
    ('clone_memory', 'Memoria do clone', 'Atualizacao de memoria de estilo do agente.', 'output_token', array['trial','starter','pro','scale']::text[], '{"bill_to_client":true,"public_label":"Memoria do agente","public_category":"texto","provider_cost_visible_to":"admin"}'::jsonb),
    ('conversation_state', 'Estado da conversa', 'Resumo de arco conversacional e estado de negociacao.', 'output_token', array['trial','starter','pro','scale']::text[], '{"bill_to_client":true,"public_label":"Resumo de conversa","public_category":"texto","provider_cost_visible_to":"admin"}'::jsonb),
    ('follow_up_generation', 'Geracao de follow-up', 'Mensagem proativa gerada por IA para retomar conversa.', 'output_token', array['trial','starter','pro','scale']::text[], '{"bill_to_client":true,"public_label":"Follow-up automatico","public_category":"texto","provider_cost_visible_to":"admin"}'::jsonb),
    ('prompt_assistant', 'Assistente de prompt', 'Geracao assistida de prompt no painel do usuario.', 'output_token', array['trial','starter','pro','scale']::text[], '{"bill_to_client":true,"public_label":"Assistente de prompt","public_category":"painel","provider_cost_visible_to":"admin"}'::jsonb),
    ('clone_profile_import', 'Importacao de DNA por historico', 'Analise de historico para construir perfil de atendimento.', 'output_token', array['trial','starter','pro','scale']::text[], '{"bill_to_client":true,"public_label":"Importacao de DNA","public_category":"painel","provider_cost_visible_to":"admin"}'::jsonb)
) as seed(feature_code, name, description, unit, included_in_plans, metadata)
where cc.provider = 'gemini'
on conflict (cost_center_id, feature_code) do update
set
  name = excluded.name,
  description = excluded.description,
  unit = excluded.unit,
  included_in_plans = excluded.included_in_plans,
  billable = true,
  enabled = true,
  metadata = public.provider_features.metadata || excluded.metadata,
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
    -- Gemini 2.5 Flash paid-tier text guardrail, converted with USD/BRL 6.0 and sold at 4x provider cost.
    ('gemini', 'chat_completion', 'gemini-2.5-flash', 'input_token', 0.00000180, 0.00072000, 1.000000, '{"preset":"profit_guardrail_2026_07","direction":"input","usd_fx_guardrail":6.0,"markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'chat_completion', 'gemini-2.5-flash', 'output_token', 0.00001500, 0.00600000, 1.000000, '{"preset":"profit_guardrail_2026_07","direction":"output","usd_fx_guardrail":6.0,"markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'chat_completion', 'gemini-2.5-pro', 'input_token', 0.00000750, 0.00300000, 2.000000, '{"preset":"profit_guardrail_2026_07","direction":"input","usd_fx_guardrail":6.0,"markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'chat_completion', 'gemini-2.5-pro', 'output_token', 0.00006000, 0.02400000, 2.000000, '{"preset":"profit_guardrail_2026_07","direction":"output","usd_fx_guardrail":6.0,"markup_on_provider_cost":4}'::jsonb),

    ('gemini', 'lead_analysis', null, 'input_token', 0.00000180, 0.00072000, 1.000000, '{"preset":"profit_guardrail_2026_07","direction":"input","markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'lead_analysis', null, 'output_token', 0.00001500, 0.00600000, 1.000000, '{"preset":"profit_guardrail_2026_07","direction":"output","markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'conversation_summary', null, 'input_token', 0.00000180, 0.00072000, 1.000000, '{"preset":"profit_guardrail_2026_07","direction":"input","markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'conversation_summary', null, 'output_token', 0.00001500, 0.00600000, 1.000000, '{"preset":"profit_guardrail_2026_07","direction":"output","markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'content_generation', null, 'input_token', 0.00000180, 0.00072000, 1.000000, '{"preset":"profit_guardrail_2026_07","direction":"input","markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'content_generation', null, 'output_token', 0.00001500, 0.00600000, 1.000000, '{"preset":"profit_guardrail_2026_07","direction":"output","markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'traffic_agent', 'gemini-2.5-pro', 'input_token', 0.00000750, 0.00300000, 2.000000, '{"preset":"profit_guardrail_2026_07","direction":"input","markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'traffic_agent', 'gemini-2.5-pro', 'output_token', 0.00006000, 0.02400000, 2.000000, '{"preset":"profit_guardrail_2026_07","direction":"output","markup_on_provider_cost":4}'::jsonb),

    ('gemini', 'audio_transcription', null, 'input_token', 0.00000180, 0.00072000, 2.000000, '{"preset":"full_metering_2026_07","direction":"input","public_tier":"audio_received"}'::jsonb),
    ('gemini', 'audio_transcription', null, 'output_token', 0.00001500, 0.00600000, 2.000000, '{"preset":"full_metering_2026_07","direction":"output","public_tier":"audio_received"}'::jsonb),
    ('gemini', 'audio_transcription', null, 'media', 0.00000000, 2.00000000, 2.000000, '{"preset":"full_metering_2026_07","direction":"event_minimum","public_tier":"audio_received"}'::jsonb),

    ('gemini', 'media_image_analysis', null, 'input_token', 0.00000180, 0.00072000, 3.000000, '{"preset":"full_metering_2026_07","direction":"input","public_tier":"image"}'::jsonb),
    ('gemini', 'media_image_analysis', null, 'output_token', 0.00001500, 0.00600000, 3.000000, '{"preset":"full_metering_2026_07","direction":"output","public_tier":"image"}'::jsonb),
    ('gemini', 'media_image_analysis', null, 'media', 0.00000000, 2.00000000, 3.000000, '{"preset":"full_metering_2026_07","direction":"event_minimum","public_tier":"image"}'::jsonb),
    ('gemini', 'media_video_analysis', null, 'input_token', 0.00000180, 0.00072000, 10.000000, '{"preset":"full_metering_2026_07","direction":"input","public_tier":"video"}'::jsonb),
    ('gemini', 'media_video_analysis', null, 'output_token', 0.00001500, 0.00600000, 10.000000, '{"preset":"full_metering_2026_07","direction":"output","public_tier":"video"}'::jsonb),
    ('gemini', 'media_video_analysis', null, 'media', 0.00000000, 8.00000000, 10.000000, '{"preset":"full_metering_2026_07","direction":"event_minimum","public_tier":"video"}'::jsonb),
    ('gemini', 'media_document_analysis', null, 'input_token', 0.00000180, 0.00072000, 5.000000, '{"preset":"full_metering_2026_07","direction":"input","public_tier":"document"}'::jsonb),
    ('gemini', 'media_document_analysis', null, 'output_token', 0.00001500, 0.00600000, 5.000000, '{"preset":"full_metering_2026_07","direction":"output","public_tier":"document"}'::jsonb),
    ('gemini', 'media_document_analysis', null, 'media', 0.00000000, 4.00000000, 5.000000, '{"preset":"full_metering_2026_07","direction":"event_minimum","public_tier":"document"}'::jsonb),

    ('gemini', 'human_handoff_detection', null, 'input_token', 0.00000180, 0.00072000, 1.000000, '{"preset":"full_metering_2026_07","direction":"input"}'::jsonb),
    ('gemini', 'human_handoff_detection', null, 'output_token', 0.00001500, 0.00600000, 1.000000, '{"preset":"full_metering_2026_07","direction":"output"}'::jsonb),
    ('gemini', 'conversation_learning', null, 'input_token', 0.00000180, 0.00072000, 1.000000, '{"preset":"full_metering_2026_07","direction":"input"}'::jsonb),
    ('gemini', 'conversation_learning', null, 'output_token', 0.00001500, 0.00600000, 1.000000, '{"preset":"full_metering_2026_07","direction":"output"}'::jsonb),
    ('gemini', 'lead_memory', null, 'input_token', 0.00000180, 0.00072000, 1.000000, '{"preset":"full_metering_2026_07","direction":"input"}'::jsonb),
    ('gemini', 'lead_memory', null, 'output_token', 0.00001500, 0.00600000, 1.000000, '{"preset":"full_metering_2026_07","direction":"output"}'::jsonb),
    ('gemini', 'clone_memory', null, 'input_token', 0.00000180, 0.00072000, 1.000000, '{"preset":"full_metering_2026_07","direction":"input"}'::jsonb),
    ('gemini', 'clone_memory', null, 'output_token', 0.00001500, 0.00600000, 1.000000, '{"preset":"full_metering_2026_07","direction":"output"}'::jsonb),
    ('gemini', 'conversation_state', null, 'input_token', 0.00000180, 0.00072000, 1.000000, '{"preset":"full_metering_2026_07","direction":"input"}'::jsonb),
    ('gemini', 'conversation_state', null, 'output_token', 0.00001500, 0.00600000, 1.000000, '{"preset":"full_metering_2026_07","direction":"output"}'::jsonb),
    ('gemini', 'follow_up_generation', null, 'input_token', 0.00000180, 0.00072000, 2.000000, '{"preset":"full_metering_2026_07","direction":"input"}'::jsonb),
    ('gemini', 'follow_up_generation', null, 'output_token', 0.00001500, 0.00600000, 2.000000, '{"preset":"full_metering_2026_07","direction":"output"}'::jsonb),
    ('gemini', 'prompt_assistant', null, 'input_token', 0.00000180, 0.00072000, 5.000000, '{"preset":"full_metering_2026_07","direction":"input","public_tier":"dashboard"}'::jsonb),
    ('gemini', 'prompt_assistant', null, 'output_token', 0.00001500, 0.00600000, 5.000000, '{"preset":"full_metering_2026_07","direction":"output","public_tier":"dashboard"}'::jsonb),
    ('gemini', 'clone_profile_import', null, 'input_token', 0.00000180, 0.00072000, 10.000000, '{"preset":"full_metering_2026_07","direction":"input","public_tier":"dashboard"}'::jsonb),
    ('gemini', 'clone_profile_import', null, 'output_token', 0.00001500, 0.00600000, 10.000000, '{"preset":"full_metering_2026_07","direction":"output","public_tier":"dashboard"}'::jsonb),

    -- TTS fallbacks prevent a future model change from producing zero-charge audio.
    ('gemini', 'voice_reply_whatsapp', null, 'character', 0.00025000, 0.06000000, 15.000000, '{"preset":"profit_guardrail_2026_07","channel":"whatsapp_audio","public_tier":"low_cost","credit_unit_brl":0.01,"source_note":"provider_family_fallback"}'::jsonb),
    ('gemini', 'text_to_speech', null, 'character', 0.00025000, 0.06000000, 15.000000, '{"preset":"profit_guardrail_2026_07","channel":"generic_audio","public_tier":"low_cost","credit_unit_brl":0.01,"source_note":"provider_family_fallback"}'::jsonb),
    ('elevenlabs', 'voice_reply_whatsapp', 'eleven_multilingual_v2', 'character', 0.00060000, 0.24000000, 50.000000, '{"preset":"profit_guardrail_2026_07","channel":"whatsapp_audio","public_tier":"premium","credit_unit_brl":0.01,"source_note":"fallback_or_cloned_voice_model"}'::jsonb),
    ('elevenlabs', 'voice_reply_whatsapp', null, 'character', 0.00080000, 0.32000000, 60.000000, '{"preset":"profit_guardrail_2026_07","channel":"whatsapp_audio","public_tier":"premium","credit_unit_brl":0.01,"source_note":"provider_family_fallback"}'::jsonb)
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
  margin_multiplier = case
    when resolved.provider_cost_per_unit > 0 then round(((resolved.connecty_price_per_unit * 0.01) / resolved.provider_cost_per_unit)::numeric, 4)
    else br.margin_multiplier
  end,
  minimum_charge_credits = resolved.minimum_charge_credits,
  metadata = br.metadata || resolved.metadata || '{"status":"active","guardrail":"full_ai_usage_profit"}'::jsonb,
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
    ('gemini', 'chat_completion', 'gemini-2.5-flash', 'input_token', 0.00000180, 0.00072000, 1.000000, '{"preset":"profit_guardrail_2026_07","direction":"input","usd_fx_guardrail":6.0,"markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'chat_completion', 'gemini-2.5-flash', 'output_token', 0.00001500, 0.00600000, 1.000000, '{"preset":"profit_guardrail_2026_07","direction":"output","usd_fx_guardrail":6.0,"markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'chat_completion', 'gemini-2.5-pro', 'input_token', 0.00000750, 0.00300000, 2.000000, '{"preset":"profit_guardrail_2026_07","direction":"input","usd_fx_guardrail":6.0,"markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'chat_completion', 'gemini-2.5-pro', 'output_token', 0.00006000, 0.02400000, 2.000000, '{"preset":"profit_guardrail_2026_07","direction":"output","usd_fx_guardrail":6.0,"markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'lead_analysis', null, 'input_token', 0.00000180, 0.00072000, 1.000000, '{"preset":"profit_guardrail_2026_07","direction":"input","markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'lead_analysis', null, 'output_token', 0.00001500, 0.00600000, 1.000000, '{"preset":"profit_guardrail_2026_07","direction":"output","markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'conversation_summary', null, 'input_token', 0.00000180, 0.00072000, 1.000000, '{"preset":"profit_guardrail_2026_07","direction":"input","markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'conversation_summary', null, 'output_token', 0.00001500, 0.00600000, 1.000000, '{"preset":"profit_guardrail_2026_07","direction":"output","markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'content_generation', null, 'input_token', 0.00000180, 0.00072000, 1.000000, '{"preset":"profit_guardrail_2026_07","direction":"input","markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'content_generation', null, 'output_token', 0.00001500, 0.00600000, 1.000000, '{"preset":"profit_guardrail_2026_07","direction":"output","markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'traffic_agent', 'gemini-2.5-pro', 'input_token', 0.00000750, 0.00300000, 2.000000, '{"preset":"profit_guardrail_2026_07","direction":"input","markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'traffic_agent', 'gemini-2.5-pro', 'output_token', 0.00006000, 0.02400000, 2.000000, '{"preset":"profit_guardrail_2026_07","direction":"output","markup_on_provider_cost":4}'::jsonb),
    ('gemini', 'audio_transcription', null, 'input_token', 0.00000180, 0.00072000, 2.000000, '{"preset":"full_metering_2026_07","direction":"input"}'::jsonb),
    ('gemini', 'audio_transcription', null, 'output_token', 0.00001500, 0.00600000, 2.000000, '{"preset":"full_metering_2026_07","direction":"output"}'::jsonb),
    ('gemini', 'audio_transcription', null, 'media', 0.00000000, 2.00000000, 2.000000, '{"preset":"full_metering_2026_07","direction":"event_minimum"}'::jsonb),
    ('gemini', 'media_image_analysis', null, 'input_token', 0.00000180, 0.00072000, 3.000000, '{"preset":"full_metering_2026_07","direction":"input"}'::jsonb),
    ('gemini', 'media_image_analysis', null, 'output_token', 0.00001500, 0.00600000, 3.000000, '{"preset":"full_metering_2026_07","direction":"output"}'::jsonb),
    ('gemini', 'media_image_analysis', null, 'media', 0.00000000, 2.00000000, 3.000000, '{"preset":"full_metering_2026_07","direction":"event_minimum"}'::jsonb),
    ('gemini', 'media_video_analysis', null, 'input_token', 0.00000180, 0.00072000, 10.000000, '{"preset":"full_metering_2026_07","direction":"input"}'::jsonb),
    ('gemini', 'media_video_analysis', null, 'output_token', 0.00001500, 0.00600000, 10.000000, '{"preset":"full_metering_2026_07","direction":"output"}'::jsonb),
    ('gemini', 'media_video_analysis', null, 'media', 0.00000000, 8.00000000, 10.000000, '{"preset":"full_metering_2026_07","direction":"event_minimum"}'::jsonb),
    ('gemini', 'media_document_analysis', null, 'input_token', 0.00000180, 0.00072000, 5.000000, '{"preset":"full_metering_2026_07","direction":"input"}'::jsonb),
    ('gemini', 'media_document_analysis', null, 'output_token', 0.00001500, 0.00600000, 5.000000, '{"preset":"full_metering_2026_07","direction":"output"}'::jsonb),
    ('gemini', 'media_document_analysis', null, 'media', 0.00000000, 4.00000000, 5.000000, '{"preset":"full_metering_2026_07","direction":"event_minimum"}'::jsonb),
    ('gemini', 'human_handoff_detection', null, 'input_token', 0.00000180, 0.00072000, 1.000000, '{"preset":"full_metering_2026_07","direction":"input"}'::jsonb),
    ('gemini', 'human_handoff_detection', null, 'output_token', 0.00001500, 0.00600000, 1.000000, '{"preset":"full_metering_2026_07","direction":"output"}'::jsonb),
    ('gemini', 'conversation_learning', null, 'input_token', 0.00000180, 0.00072000, 1.000000, '{"preset":"full_metering_2026_07","direction":"input"}'::jsonb),
    ('gemini', 'conversation_learning', null, 'output_token', 0.00001500, 0.00600000, 1.000000, '{"preset":"full_metering_2026_07","direction":"output"}'::jsonb),
    ('gemini', 'lead_memory', null, 'input_token', 0.00000180, 0.00072000, 1.000000, '{"preset":"full_metering_2026_07","direction":"input"}'::jsonb),
    ('gemini', 'lead_memory', null, 'output_token', 0.00001500, 0.00600000, 1.000000, '{"preset":"full_metering_2026_07","direction":"output"}'::jsonb),
    ('gemini', 'clone_memory', null, 'input_token', 0.00000180, 0.00072000, 1.000000, '{"preset":"full_metering_2026_07","direction":"input"}'::jsonb),
    ('gemini', 'clone_memory', null, 'output_token', 0.00001500, 0.00600000, 1.000000, '{"preset":"full_metering_2026_07","direction":"output"}'::jsonb),
    ('gemini', 'conversation_state', null, 'input_token', 0.00000180, 0.00072000, 1.000000, '{"preset":"full_metering_2026_07","direction":"input"}'::jsonb),
    ('gemini', 'conversation_state', null, 'output_token', 0.00001500, 0.00600000, 1.000000, '{"preset":"full_metering_2026_07","direction":"output"}'::jsonb),
    ('gemini', 'follow_up_generation', null, 'input_token', 0.00000180, 0.00072000, 2.000000, '{"preset":"full_metering_2026_07","direction":"input"}'::jsonb),
    ('gemini', 'follow_up_generation', null, 'output_token', 0.00001500, 0.00600000, 2.000000, '{"preset":"full_metering_2026_07","direction":"output"}'::jsonb),
    ('gemini', 'prompt_assistant', null, 'input_token', 0.00000180, 0.00072000, 5.000000, '{"preset":"full_metering_2026_07","direction":"input"}'::jsonb),
    ('gemini', 'prompt_assistant', null, 'output_token', 0.00001500, 0.00600000, 5.000000, '{"preset":"full_metering_2026_07","direction":"output"}'::jsonb),
    ('gemini', 'clone_profile_import', null, 'input_token', 0.00000180, 0.00072000, 10.000000, '{"preset":"full_metering_2026_07","direction":"input"}'::jsonb),
    ('gemini', 'clone_profile_import', null, 'output_token', 0.00001500, 0.00600000, 10.000000, '{"preset":"full_metering_2026_07","direction":"output"}'::jsonb),
    ('gemini', 'voice_reply_whatsapp', null, 'character', 0.00025000, 0.06000000, 15.000000, '{"preset":"profit_guardrail_2026_07","channel":"whatsapp_audio","public_tier":"low_cost","credit_unit_brl":0.01,"source_note":"provider_family_fallback"}'::jsonb),
    ('gemini', 'text_to_speech', null, 'character', 0.00025000, 0.06000000, 15.000000, '{"preset":"profit_guardrail_2026_07","channel":"generic_audio","public_tier":"low_cost","credit_unit_brl":0.01,"source_note":"provider_family_fallback"}'::jsonb),
    ('elevenlabs', 'voice_reply_whatsapp', 'eleven_multilingual_v2', 'character', 0.00060000, 0.24000000, 50.000000, '{"preset":"profit_guardrail_2026_07","channel":"whatsapp_audio","public_tier":"premium","credit_unit_brl":0.01,"source_note":"fallback_or_cloned_voice_model"}'::jsonb),
    ('elevenlabs', 'voice_reply_whatsapp', null, 'character', 0.00080000, 0.32000000, 60.000000, '{"preset":"profit_guardrail_2026_07","channel":"whatsapp_audio","public_tier":"premium","credit_unit_brl":0.01,"source_note":"provider_family_fallback"}'::jsonb)
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
  case
    when resolved.provider_cost_per_unit > 0 then round(((resolved.connecty_price_per_unit * 0.01) / resolved.provider_cost_per_unit)::numeric, 4)
    else null
  end,
  resolved.minimum_charge_credits,
  resolved.metadata || '{"status":"active","guardrail":"full_ai_usage_profit"}'::jsonb
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
