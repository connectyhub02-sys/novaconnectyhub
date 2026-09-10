-- Keep platform text workloads aligned with the same model's public API tariff.
-- Historical usage is evidence: this migration NEVER creates retroactive debits.
alter table public.usage_events add column if not exists debit_retry_at timestamptz;
create index if not exists usage_debit_retry on public.usage_events(debit_retry_at)
  where status='pending' and debit_retry_at is not null;
insert into public.billing_rates (
  cost_center_id,feature_id,model_id,plan_code,unit,provider_cost_per_unit,
  connecty_price_per_unit,margin_multiplier,minimum_charge_credits,currency,
  effective_from,effective_to,active,metadata
)
select r.cost_center_id,f.id,r.model_id,r.plan_code,r.unit,r.provider_cost_per_unit,
  r.connecty_price_per_unit,r.margin_multiplier,
  greatest(r.minimum_charge_credits,coalesce((select max(old.minimum_charge_credits)
    from public.billing_rates old where old.feature_id=f.id and old.active
    and old.plan_code is null and (old.effective_to is null or old.effective_to>now())),0)),
  r.currency,greatest(r.effective_from,now()),r.effective_to,true,
  r.metadata || jsonb_build_object('audit','2026-09-10','source_api_rate_id',r.id)
from public.billing_rates r
join public.provider_features source on source.id=r.feature_id and source.feature_code='external_ai'
join public.provider_models m on m.id=r.model_id
join public.provider_features f on f.cost_center_id=r.cost_center_id
where r.active and r.plan_code is null and (r.effective_to is null or r.effective_to>now())
  and r.unit in ('input_token','output_token')
  and m.provider_model_id in ('gemini-3.5-flash','gemini-3.5-flash-lite','gemini-3.6-flash',
    'gemini-3.7-flash','gemini-3.8-flash','gemini-3.1-pro-preview','gemini-3.1-pro-preview-customtools')
  and f.feature_code in ('chat_completion','lead_analysis','conversation_summary','content_generation',
    'traffic_agent','audio_transcription','media_image_analysis','media_video_analysis','media_document_analysis',
    'human_handoff_detection','conversation_learning','lead_memory','clone_memory','conversation_state',
    'follow_up_generation','prompt_assistant','clone_profile_import')
  and not exists(select 1 from public.billing_rates existing where existing.feature_id=f.id
    and existing.model_id=r.model_id and existing.unit=r.unit and existing.plan_code is null
    and existing.active and existing.metadata->>'source_api_rate_id'=r.id::text);

-- Audio production uses the provider's measured input and generated audio units.
-- Separate feature avoids adding a character tariff to the same generation.
do $migration$
declare cc uuid; feature uuid; mid uuid; item record; price record;
begin
  select id into cc from public.provider_cost_centers where provider='gemini';
  insert into public.provider_features(cost_center_id,feature_code,name,description,unit,enabled,billable)
    values(cc,'voice_generation_audio','Geração de voz','Créditos pelo processamento e áudio produzido.','output_token',true,true)
    on conflict(cost_center_id,feature_code) do update set name=excluded.name returning id into feature;
  for item in select * from (values ('gemini-3.1-flash-tts-preview',1.0,20.0),
    ('gemini-2.5-flash-preview-tts',0.5,10.0),('gemini-2.5-pro-preview-tts',1.0,20.0)) as t(model,input_usd,output_usd) loop
    select id into mid from public.provider_models where cost_center_id=cc and provider_model_id=item.model;
    if mid is null then continue; end if;
    for price in select * from (values ('input_token',item.input_usd),('output_token',item.output_usd)) as p(unit,usd) loop
      insert into public.billing_rates(cost_center_id,feature_id,model_id,unit,provider_cost_per_unit,connecty_price_per_unit,
        margin_multiplier,minimum_charge_credits,currency,effective_from,active,metadata)
      values(cc,feature,mid,price.unit::public.billing_unit,price.usd*6/1000000,price.usd*2400/1000000,
        4,1,'BRL',now(),true,'{"audit":"2026-09-10","pricing_source":"https://ai.google.dev/gemini-api/docs/pricing","usd_fx_guardrail":6,"markup":4}');
    end loop;
  end loop;
end $migration$;

-- Wallet lock serializes duplicates, including retries after an ambiguous HTTP result.
-- Keep the old plan/trial and reservation checks, but never debit one usage twice.
create or replace function public.debit_credit_wallet(
  p_organization_id uuid,p_amount_credits numeric,p_provider public.billing_provider default null,
  p_usage_event_id uuid default null,p_description text default null,p_metadata jsonb default '{}'
) returns uuid language plpgsql security definer set search_path=public as $$
declare w public.credit_wallets; u public.usage_events; transaction_id uuid; owner_org uuid;
begin
  if p_amount_credits is null or p_amount_credits<=0 then raise exception 'Invalid credit amount.'; end if;
  perform public.ensure_credit_wallet(p_organization_id);
  select * into w from public.credit_wallets where organization_id=p_organization_id for update;
  if p_usage_event_id is not null then
    select * into u from public.usage_events where id=p_usage_event_id for update;
    select coalesce(billing_organization_id,id) into owner_org from public.organizations where id=u.organization_id;
    if u.id is null or owner_org is distinct from p_organization_id
      or u.provider is distinct from p_provider or u.connecty_charge_credits is distinct from p_amount_credits then
      raise exception 'Usage does not match the debit.';
    end if;
    select id into transaction_id from public.credit_transactions
      where usage_event_id=p_usage_event_id and transaction_type='debit' limit 1;
    if transaction_id is not null then
      update public.usage_events set status='completed',error_message=null,debit_retry_at=null,
        connecty_revenue_estimate=p_amount_credits*0.01,
        gross_margin_estimate=p_amount_credits*0.01-coalesce(provider_cost,0),
        metadata=(coalesce(metadata,'{}')-'debit_failure') || jsonb_build_object('debit_transaction_id',transaction_id)
        where id=p_usage_event_id;
      return transaction_id;
    end if;
    if u.status not in ('pending','completed') then raise exception 'Usage is not billable.'; end if;
  end if;
  if w.reserved_credits>0 and w.balance_credits-w.reserved_credits<p_amount_credits then
    raise exception 'Insufficient available ConnectyHub credits (active reservations).';
  end if;
  transaction_id := public.debit_credit_wallet_before_ai(p_organization_id,p_amount_credits,p_provider,p_usage_event_id,p_description,p_metadata);
  if p_usage_event_id is not null then
    update public.usage_events set status='completed',error_message=null,debit_retry_at=null,
      connecty_revenue_estimate=p_amount_credits*0.01,
      gross_margin_estimate=p_amount_credits*0.01-coalesce(provider_cost,0),
      metadata=(coalesce(metadata,'{}')-'debit_failure') || jsonb_build_object('debit_transaction_id',transaction_id)
      where id=p_usage_event_id;
  end if;
  return transaction_id;
end $$;
revoke all on function public.debit_credit_wallet(uuid,numeric,public.billing_provider,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.debit_credit_wallet(uuid,numeric,public.billing_provider,uuid,text,jsonb) to service_role;
