-- Cost center phase 1: real monthly numbers without changing any charge.
-- Admin-only (service role). Never creates debits, never reprices past usage.

create table if not exists public.cost_center_settings (
  setting_key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.platform_fixed_costs (
  id uuid primary key default gen_random_uuid(),
  cost_key text not null unique,
  name text not null,
  provider text,
  currency text not null check (currency in ('BRL','USD')),
  monthly_amount numeric(18,2) not null check (monthly_amount >= 0),
  allocation text not null default 'platform' check (allocation in ('platform','per_instance')),
  capacity_units integer check (capacity_units is null or capacity_units > 0),
  quota_units numeric(18,2) check (quota_units is null or quota_units > 0),
  quota_unit text,
  active boolean not null default true,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.cost_center_settings enable row level security;
alter table public.platform_fixed_costs enable row level security;
revoke all on public.cost_center_settings, public.platform_fixed_costs from public, anon, authenticated;
grant select, insert, update on public.cost_center_settings, public.platform_fixed_costs to service_role;

-- Values informed by the account owner on 02/10/2026; editable in Admin > Financeiro.
insert into public.cost_center_settings(setting_key, value) values
  ('usd_brl_reference', '{"rate":5.23,"as_of":"2026-10-02","source":"Cotação comercial de 02/10/2026"}'),
  ('credit_target_markup', '{"value":4}')
on conflict (setting_key) do nothing;

insert into public.platform_fixed_costs(cost_key, name, provider, currency, monthly_amount, allocation, capacity_units, quota_unit, notes) values
  ('vps', 'VPS (aplicação, banco e automações)', 'vps', 'USD', 20, 'platform', null, null, 'Informado pelo titular em 02/10/2026.'),
  ('uazapi', 'UAZAPI — instâncias WhatsApp', 'uazapi', 'BRL', 138, 'per_instance', 100, null, 'R$ 138 por mês para até 100 instâncias.'),
  ('elevenlabs_subscription', 'ElevenLabs — assinatura de voz', 'elevenlabs', 'USD', 22, 'platform', null, 'character', 'Franquia mensal a confirmar no painel do fornecedor.')
on conflict (cost_key) do nothing;

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
    'settings', coalesce((select jsonb_object_agg(setting_key, value) from public.cost_center_settings), '{}'),
    'fixed_costs', coalesce((select jsonb_agg(to_jsonb(f) order by f.cost_key) from public.platform_fixed_costs f where f.active), '[]')
  ) into result;
  return result;
end $$;

revoke all on function public.cost_center_month_report(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.cost_center_month_report(timestamptz, timestamptz) to service_role;
