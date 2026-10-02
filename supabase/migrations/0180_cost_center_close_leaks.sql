-- Cost center phase 2: close leaks without changing any existing price.
-- 1) Tariffs for two Gemini features that were metered but had no rate (catalog
--    import and traffic AI analysis): same rates as content generation, minimum 5.
-- 2) Voice API and Studio settlements keep their exact logic; a wrapper then
--    attributes the usage to the organization that used it (the wallet stays the
--    billing organization) and records overage in the open cycle, like the
--    central wallet debit does.
-- 3) Monthly report lists usage waiting for a missing tariff.

do $migration$
declare cc uuid; item record; feature uuid;
begin
  select id into cc from public.provider_cost_centers where provider = 'gemini';
  if cc is null then raise exception 'GEMINI_COST_CENTER_REQUIRED'; end if;
  for item in select * from (values
    ('sales_catalog_import', 'Importador inteligente de catalogo', 'Leitura de arquivos e links para montar itens do catalogo.'),
    ('ai_traffic_manager', 'Analise IA de trafego pago', 'Diagnostico e recomendacoes de campanhas pagas no painel.')
  ) as t(code, name, description) loop
    insert into public.provider_features(cost_center_id, feature_code, name, description, unit, enabled, billable)
      values (cc, item.code, item.name, item.description, 'output_token', true, true)
      on conflict (cost_center_id, feature_code) do nothing;
    select id into feature from public.provider_features where cost_center_id = cc and feature_code = item.code;
    insert into public.billing_rates(cost_center_id, feature_id, model_id, plan_code, unit, provider_cost_per_unit,
      connecty_price_per_unit, margin_multiplier, minimum_charge_credits, currency, effective_from, effective_to, active, metadata)
    select r.cost_center_id, feature, r.model_id, null, r.unit, r.provider_cost_per_unit, r.connecty_price_per_unit,
      r.margin_multiplier, greatest(r.minimum_charge_credits, 5), r.currency, greatest(coalesce(r.effective_from, now()), now()),
      r.effective_to, true,
      coalesce(r.metadata, '{}') || jsonb_build_object('audit', '2026-10-02', 'copied_from_rate_id', r.id, 'copied_from_feature', 'content_generation')
    from public.billing_rates r
    join public.provider_features source on source.id = r.feature_id and source.feature_code = 'content_generation' and source.cost_center_id = cc
    where r.active and r.plan_code is null and (r.effective_to is null or r.effective_to > now())
      and not exists (select 1 from public.billing_rates existing where existing.feature_id = feature
        and existing.metadata ->> 'copied_from_rate_id' = r.id::text);
  end loop;
end $migration$;

create or replace function public.attribute_voice_settlement(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.voice_generations;
begin
  select * into r from public.voice_generations where id = p_id;
  if r.id is null or r.usage_event_id is null then return; end if;
  update public.usage_events
    set organization_id = r.organization_id,
      metadata = coalesce(metadata, '{}') || jsonb_build_object('billing_organization_id', r.billing_organization_id)
    where id = r.usage_event_id and organization_id is distinct from r.organization_id;
  update public.credit_transactions
    set metadata = coalesce(metadata, '{}') || jsonb_build_object('usage_organization_id', r.organization_id)
    where usage_event_id = r.usage_event_id and transaction_type = 'debit'
      and not (coalesce(metadata, '{}') ? 'usage_organization_id');
  if coalesce(r.charged_credits, 0) > 0 then
    update public.billing_cycles
      set overage_credits = greatest(coalesce(overage_credits, 0), used_credits - included_credits), updated_at = now()
      where id = (select id from public.billing_cycles where organization_id = r.billing_organization_id and status = 'open'
        and cycle_start <= r.created_at and cycle_end > r.created_at order by cycle_end limit 1)
        and used_credits > included_credits;
  end if;
end $$;
revoke all on function public.attribute_voice_settlement(uuid) from public, anon, authenticated;
grant execute on function public.attribute_voice_settlement(uuid) to service_role;

do $migration$
begin
  if to_regprocedure('public.finish_voice_generation_before_attribution(uuid,text,text)') is null then
    alter function public.finish_voice_generation(uuid, text, text) rename to finish_voice_generation_before_attribution;
  end if;
  if to_regprocedure('public.finish_studio_operation_before_attribution(uuid,text,numeric,numeric,jsonb,text)') is null then
    alter function public.finish_studio_operation(uuid, text, numeric, numeric, jsonb, text) rename to finish_studio_operation_before_attribution;
  end if;
end $migration$;
revoke all on function public.finish_voice_generation_before_attribution(uuid, text, text),
  public.finish_studio_operation_before_attribution(uuid, text, numeric, numeric, jsonb, text) from public, anon, authenticated, service_role;

create or replace function public.finish_voice_generation(p_id uuid, p_status text, p_error text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  result := public.finish_voice_generation_before_attribution(p_id, p_status, p_error);
  perform public.attribute_voice_settlement(p_id);
  return result;
end $$;

create or replace function public.finish_studio_operation(p_id uuid, p_status text, p_charge numeric default null, p_cost numeric default null, p_units jsonb default null, p_error text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  result := public.finish_studio_operation_before_attribution(p_id, p_status, p_charge, p_cost, p_units, p_error);
  perform public.attribute_voice_settlement(p_id);
  return result;
end $$;
revoke all on function public.finish_voice_generation(uuid, text, text),
  public.finish_studio_operation(uuid, text, numeric, numeric, jsonb, text) from public, anon, authenticated;
grant execute on function public.finish_voice_generation(uuid, text, text),
  public.finish_studio_operation(uuid, text, numeric, numeric, jsonb, text) to service_role;

create or replace function public.cost_center_month_report(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'cost_center_invalid_period';
  end if;

  with usage as (
    select provider::text as provider, feature_code, coalesce(model_id, '') as model_id,
      coalesce(billing_mode::text, 'unknown') as billing_mode,
      count(*) as events,
      count(*) filter (where connecty_charge_credits > 0) as charged_events,
      sum(coalesce(input_tokens, 0)) as input_tokens,
      sum(coalesce(output_tokens, 0)) as output_tokens,
      sum(case when jsonb_typeof(metadata #> '{geminiUsage,cachedTokens}') = 'number'
        then (metadata #>> '{geminiUsage,cachedTokens}')::numeric else 0 end) as cached_tokens,
      sum(case when jsonb_typeof(metadata #> '{geminiUsage,thoughtsTokens}') = 'number'
        then (metadata #>> '{geminiUsage,thoughtsTokens}')::numeric else 0 end) as thoughts_tokens,
      sum(case when provider::text = 'elevenlabs' and feature_code in ('voice_reply_whatsapp', 'text_to_speech')
        then coalesce(output_units, 0) else 0 end) as characters,
      sum(coalesce(connecty_charge_credits, 0)) as credits,
      sum(coalesce(provider_cost, 0)) as cost_brl_registered,
      -- New events carry the USD amount; older ones were registered at the tariff rate (R$ 6 unless the rate says otherwise).
      sum(case
        when jsonb_typeof(metadata #> '{metering,providerCostUsd}') = 'number' then (metadata #>> '{metering,providerCostUsd}')::numeric
        when jsonb_typeof(metadata #> '{metering,matchedRates,0,costFxUsdBrl}') = 'number'
          and (metadata #>> '{metering,matchedRates,0,costFxUsdBrl}')::numeric > 0
          then coalesce(provider_cost, 0) / (metadata #>> '{metering,matchedRates,0,costFxUsdBrl}')::numeric
        else coalesce(provider_cost, 0) / 6 end) as cost_usd
    from public.usage_events
    where occurred_at >= p_from and occurred_at < p_to and status::text in ('completed', 'pending')
    group by 1, 2, 3, 4
  ),
  credit_flow as (
    select case
        when transaction_type::text = 'purchase' then 'purchase'
        when transaction_type::text = 'grant' and metadata ? 'payment_id' then 'paid_plan'
        when transaction_type::text = 'grant' and (description ilike '%teste%' or description ilike '%trial%') then 'trial'
        when transaction_type::text in ('grant', 'adjustment') and amount_credits > 0 then 'administrative'
        when transaction_type::text = 'debit' and usage_event_id is not null then 'consumed'
        when transaction_type::text = 'refund' then 'refund'
        when transaction_type::text = 'expiration' then 'expired'
        else 'administrative_removal' end as origin,
      count(*) as transactions, sum(amount_credits) as credits
    from public.credit_transactions
    where created_at >= p_from and created_at < p_to
    group by 1
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'usage', coalesce((select jsonb_agg(to_jsonb(u)) from usage u), '[]'),
    'credit_flow', coalesce((select jsonb_agg(to_jsonb(c)) from credit_flow c), '[]'),
    'cash', jsonb_build_object(
      'invoices_paid_brl', (select coalesce(sum(total_brl), 0) from public.billing_invoices where status = 'paid' and paid_at >= p_from and paid_at < p_to),
      'invoices_paid', (select count(*) from public.billing_invoices where status = 'paid' and paid_at >= p_from and paid_at < p_to),
      'payments_without_invoice_brl', (select coalesce(sum(amount_brl), 0) from public.billing_payments
        where status = 'approved' and invoice_id is null and coalesce(paid_at, created_at) >= p_from and coalesce(paid_at, created_at) < p_to),
      'refunded_brl', (select coalesce(sum(amount_brl), 0) from public.billing_payments
        where status = 'refunded' and updated_at >= p_from and updated_at < p_to)
    ),
    'snapshot', jsonb_build_object(
      'wallet_balance_credits', (select coalesce(sum(balance_credits), 0) from public.credit_wallets),
      'wallet_reserved_credits', (select coalesce(sum(reserved_credits), 0) from public.credit_wallets),
      'connected_instances', (select count(*) from public.whatsapp_instances where provider = 'uazapi' and status = 'connected'),
      'paying_organizations', (select count(*) from public.organizations where status = 'active' and coalesce(plan_code, '') not in ('', 'trial', 'internal'))
    ),
    'missing_rates', coalesce((select jsonb_agg(jsonb_build_object('feature_code', feature_code, 'model_id', model_id, 'events', events))
      from (select feature_code, model_id, count(*) as events from public.usage_events
        where occurred_at >= p_from and occurred_at < p_to and status::text = 'pending' and error_message = 'billing_rate_missing'
        group by 1, 2) missing), '[]'),
    'settings', coalesce((select jsonb_object_agg(setting_key, value) from public.cost_center_settings), '{}'),
    'fixed_costs', coalesce((select jsonb_agg(to_jsonb(f) order by f.cost_key) from public.platform_fixed_costs f where f.active), '[]')
  ) into result;
  return result;
end $$;

revoke all on function public.cost_center_month_report(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.cost_center_month_report(timestamptz, timestamptz) to service_role;
