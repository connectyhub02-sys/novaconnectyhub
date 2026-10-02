-- Voice Studio phase A: priced like the provider prices us, by character and model.
-- 1) Text-to-speech tariffs for Flash v2.5, Turbo v2.5 and v3 (provider table of the
--    account x R$ 6/US$ x 4; Multilingual v2 already existed), minimum 5 credits.
-- 2) "long_tts": long texts (e-books) quoted and reserved in full before any audio
--    is produced; stored as parts and delivered as one MP3. Up to 250 MB only for it.
-- 3) Operation names of the next phases are accepted (capabilities stay disabled
--    until their tariffs are confirmed).

alter table public.studio_capabilities drop constraint if exists studio_capabilities_operation_check;
alter table public.studio_capabilities add constraint studio_capabilities_operation_check check (operation in (
  'transcription','audio_isolation','voice_change','forced_alignment','dialogue','voice_design','voice_design_save',
  'dictionary_create','dubbing','gemini_tts','long_tts','sound_effects','music','voice_remix'));
alter table public.studio_operations drop constraint if exists studio_operations_storage_reserved_bytes_check;
alter table public.studio_operations add constraint studio_operations_storage_reserved_bytes_check check (storage_reserved_bytes between 1 and 250000000);

do $migration$
declare cc uuid; tts uuid; item record; model uuid;
begin
  select id into cc from public.provider_cost_centers where provider = 'elevenlabs';
  if cc is null then raise exception 'ELEVENLABS_COST_CENTER_REQUIRED'; end if;
  select id into tts from public.provider_features where cost_center_id = cc and feature_code = 'text_to_speech';
  if tts is null then raise exception 'TEXT_TO_SPEECH_FEATURE_REQUIRED'; end if;
  insert into public.provider_models(cost_center_id, provider_model_id, display_name, feature_code, supports_billing, enabled, input_unit, output_unit, metadata)
    values (cc, 'eleven_turbo_v2_5', 'Eleven Turbo v2.5', 'text_to_speech', true, true, 'character', 'character', '{"added":"2026-10-02"}')
    on conflict (cost_center_id, provider_model_id) do update set enabled = true;
  -- USD per 1,000 characters on the account's API table (Creator); cost in BRL at the tariff rate 6, price at 4x.
  for item in select * from (values ('eleven_flash_v2_5', 0.05), ('eleven_turbo_v2_5', 0.05), ('eleven_v3', 0.10)) as t(model_id, usd_per_thousand) loop
    select id into model from public.provider_models where cost_center_id = cc and provider_model_id = item.model_id;
    if model is null then raise exception 'MODEL_REQUIRED %', item.model_id; end if;
    if not exists (select 1 from public.billing_rates where feature_id = tts and model_id = model and unit = 'character' and active and plan_code is null) then
      insert into public.billing_rates(cost_center_id, feature_id, model_id, plan_code, unit, provider_cost_per_unit, connecty_price_per_unit,
        margin_multiplier, minimum_charge_credits, currency, effective_from, active, metadata)
      values (cc, tts, model, null, 'character', item.usd_per_thousand * 6 / 1000, item.usd_per_thousand * 2400 / 1000, 4, 5, 'BRL', now(), true,
        jsonb_build_object('audit', '2026-10-02', 'usd_per_thousand_characters', item.usd_per_thousand, 'usd_fx_guardrail', 6, 'markup', 4,
          'pricing_source', 'ElevenLabs API table of the account (Creator)'));
    end if;
  end loop;
end $migration$;

create or replace function public.reserve_studio_operation(p_project uuid,p_key uuid,p_idempotency text,p_hash text,p_operation text,p_model text,p_voice text,p_characters integer,p_charge numeric,p_cost numeric,p_rates jsonb,p_input jsonb,p_units jsonb,p_storage_bytes integer,p_storage_files integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb; c public.studio_capabilities; g public.voice_generations; e record; u public.organization_storage_usage;
begin
 select * into c from public.studio_capabilities where operation=p_operation and model_id=p_model and enabled;
 if c.operation is null then raise exception 'voice_capability_unavailable'; end if;
 if p_charge is null or p_charge<0 or p_charge::text in ('NaN','Infinity','-Infinity') or p_storage_bytes is null or p_storage_bytes not between 1 and (case when p_operation = 'long_tts' then 250000000 else 20000000 end) or p_storage_files is null or p_storage_files not between 1 and 4 then raise exception 'voice_price_invalid'; end if;
 -- The existing function creates the hold and applies all shared limits. The
 -- placeholder is replaced in this same transaction, never visible as a clone.
 r:=public.reserve_voice_generation(p_project,p_key,p_idempotency,p_hash,p_voice,p_model,p_characters,p_charge,p_cost,p_rates,'voice_clone');
 if not (r->>'claimed')::boolean then
  if not exists(select 1 from public.studio_operations where id=(r->>'id')::uuid) then raise exception 'voice_idempotency_conflict'; end if;
  return r;
 end if;
 select * into g from public.voice_generations where id=(r->>'id')::uuid;
 perform public.record_organization_storage_usage(g.billing_organization_id,0,0,'generated_media','{}');
 select * into u from public.organization_storage_usage where organization_id=g.billing_organization_id for update;
 select * into e from public.get_organization_storage_entitlement(g.organization_id);
 if e.total_storage_limit_bytes is null or e.total_storage_limit_bytes<=0 or p_storage_bytes>e.storage_file_max_bytes
 or u.used_bytes+p_storage_bytes>e.total_storage_limit_bytes or (e.total_storage_file_limit>0 and u.billable_file_count+p_storage_files>e.total_storage_file_limit) then raise exception 'voice_storage_limit'; end if;
 if p_input?'asset_id' then
  perform 1 from public.studio_assets where id=(p_input->>'asset_id')::uuid and project_id=g.project_id and organization_id=g.organization_id and status='ready' for update;
  if not found then raise exception 'voice_asset_state'; end if;
 end if;
 if p_input?'preview_id' then
  perform 1 from public.studio_resources sr join public.voice_generations parent on parent.id=sr.operation_id
  where sr.id=(p_input->>'preview_id')::uuid and sr.project_id=g.project_id and sr.organization_id=g.organization_id
  and sr.kind='voice_preview' and sr.status='ready' and parent.status='completed' for update of sr;
  if not found then raise exception 'voice_resource_state'; end if;
 end if;
 insert into public.studio_operations(id,operation,model_id,provider,feature_code,input,reserved_units,storage_reserved_bytes,storage_reserved_files)
 values(g.id,p_operation,p_model,c.provider,c.feature_code,p_input,p_units,p_storage_bytes,p_storage_files);
 update public.voice_generations set operation='studio' where id=g.id returning * into g;
 perform public.record_organization_storage_usage(g.billing_organization_id,p_storage_bytes,p_storage_files,'generated_media',jsonb_build_object('studio_operation_id',g.id,'reserved',true));
 return to_jsonb(g)||'{"claimed":true}'::jsonb;
end $$;

-- Long texts: one capability per model, confirmed with the exact active tariff row.
insert into public.studio_capabilities(operation, model_id, provider, feature_code, enabled, confirmed_at, cost_evidence, confirmed_rates)
select 'long_tts', m.provider_model_id, 'elevenlabs', 'text_to_speech', true, now(),
  'Mesma tarifa por caractere da geração avulsa (tabela da conta x 6 x 4), conferida em 02/10/2026.',
  jsonb_build_array(jsonb_build_object('id', r.id, 'unit', 'character',
    'providerCostPerUnit', coalesce(source.provider_cost_per_unit, r.provider_cost_per_unit),
    'connectyPricePerUnit', r.connecty_price_per_unit, 'minimumChargeCredits', r.minimum_charge_credits))
from public.billing_rates r
join public.provider_features f on f.id = r.feature_id and f.feature_code = 'text_to_speech'
join public.provider_models m on m.id = r.model_id
join public.provider_cost_centers c on c.id = r.cost_center_id and c.provider = 'elevenlabs'
left join public.billing_rates source on source.id::text = r.metadata ->> 'provider_cost_source_rate_id'
where r.active and r.plan_code is null and r.unit = 'character' and (r.effective_to is null or r.effective_to > now())
  and m.provider_model_id in ('eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_turbo_v2_5', 'eleven_v3')
on conflict (operation, model_id) do update set enabled = excluded.enabled, confirmed_at = excluded.confirmed_at,
  cost_evidence = excluded.cost_evidence, confirmed_rates = excluded.confirmed_rates, feature_code = excluded.feature_code;
