-- Cost center phase 3: compare the cache-friendly prompt order with the current one.
-- Per prompt order: replies, input and cached tokens, credits and the humanity
-- benchmark score of the same agent runs. Read-only; no price or behavior change.

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
    'prompt_orders', coalesce((select jsonb_agg(to_jsonb(p)) from (
      select coalesce(u.metadata ->> 'promptOrder', 'unmeasured') as prompt_order,
        count(*) as replies,
        sum(coalesce(u.input_tokens, 0)) as input_tokens,
        sum(case when jsonb_typeof(u.metadata #> '{geminiUsage,cachedTokens}') = 'number' then (u.metadata #>> '{geminiUsage,cachedTokens}')::numeric else 0 end) as cached_tokens,
        sum(coalesce(u.connecty_charge_credits, 0)) as credits,
        count(t.score) as scored_replies,
        round(avg(t.score), 1) as avg_humanity_score
      from public.usage_events u
      left join (
        select e.payload ->> 'agentRunId' as run_id, max((e.payload ->> 'score')::numeric) as score
        from public.intelligence_events e
        where e.event_type = 'whatsapp.clone.turing_benchmark' and jsonb_typeof(e.payload -> 'score') = 'number'
          and e.created_at >= p_from - interval '1 day' and e.created_at < p_to + interval '1 day'
        group by 1) t on t.run_id = u.agent_run_id::text
      where u.occurred_at >= p_from and u.occurred_at < p_to and u.feature_code = 'chat_completion'
        and u.status::text = 'completed' and u.provider::text = 'gemini'
      group by 1) p), '[]'),
    'settings', coalesce((select jsonb_object_agg(setting_key, value) from public.cost_center_settings), '{}'),
    'fixed_costs', coalesce((select jsonb_agg(to_jsonb(f) order by f.cost_key) from public.platform_fixed_costs f where f.active), '[]')
  ) into result;
  return result;
end $$;

revoke all on function public.cost_center_month_report(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.cost_center_month_report(timestamptz, timestamptz) to service_role;
