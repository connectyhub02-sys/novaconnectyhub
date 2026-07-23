create table if not exists public.billing_credit_packs (
  id uuid primary key default gen_random_uuid(),
  pack_code text not null unique,
  name text not null,
  short_description text,
  status text not null default 'active',
  sort_order integer not null default 100,
  price_brl numeric(18,2) not null default 0,
  credit_amount numeric(18,6) not null default 0,
  bonus_percent numeric(8,4) not null default 0,
  auto_recharge_enabled boolean not null default true,
  mercado_pago_item_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pack_code ~ '^[a-z0-9_-]{2,60}$'),
  check (status in ('draft', 'active', 'archived')),
  check (price_brl >= 0),
  check (credit_amount >= 0),
  check (bonus_percent >= 0)
);

drop trigger if exists touch_billing_credit_packs_updated_at on public.billing_credit_packs;
create trigger touch_billing_credit_packs_updated_at
before update on public.billing_credit_packs
for each row execute function public.touch_updated_at();

alter table public.billing_credit_packs enable row level security;

drop policy if exists "billing credit packs visible to logged users" on public.billing_credit_packs;
create policy "billing credit packs visible to logged users"
on public.billing_credit_packs for select
using (auth.uid() is not null and status = 'active');

drop policy if exists "billing credit packs managed by platform admins" on public.billing_credit_packs;
create policy "billing credit packs managed by platform admins"
on public.billing_credit_packs for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

insert into public.billing_plans (
  plan_code,
  name,
  short_description,
  status,
  sort_order,
  highlighted,
  monthly_price_brl,
  included_credits,
  overage_credit_price_brl,
  auto_recharge_min_credits,
  overage_limit_credits,
  trial_days,
  agent_limit,
  whatsapp_instance_limit,
  user_limit,
  module_codes,
  metadata
)
values
  (
    'starter',
    'Start',
    'Entrada com agente WhatsApp, catalogo e creditos iniciais para validar vendas.',
    'active',
    10,
    false,
    97,
    3000,
    0.01,
    600,
    0,
    0,
    1,
    1,
    2,
    array['whatsapp_agent', 'sales_catalog', 'crm_basic', 'voice_ai']::text[],
    '{"seed":"commercial_credit_catalog","credit_unit_brl":0.01,"target_markup":4,"included_credit_value_brl":30,"target_provider_cost_brl":7.5,"editable":true}'::jsonb
  ),
  (
    'pro',
    'Pro',
    'Plano para operacao com mais agentes, automacoes e maior volume de conversas.',
    'active',
    20,
    true,
    247,
    10000,
    0.01,
    2000,
    0,
    0,
    3,
    2,
    5,
    array['whatsapp_agent', 'sales_catalog', 'crm_basic', 'automations', 'voice_ai', 'reports', 'team_users']::text[],
    '{"seed":"commercial_credit_catalog","credit_unit_brl":0.01,"target_markup":4,"included_credit_value_brl":100,"target_provider_cost_brl":25,"editable":true}'::jsonb
  ),
  (
    'scale',
    'Scale',
    'Plano para times com varias instancias, voz, automacoes e escala comercial.',
    'active',
    30,
    false,
    497,
    25000,
    0.01,
    5000,
    0,
    0,
    8,
    5,
    15,
    array['whatsapp_agent', 'sales_catalog', 'crm_basic', 'automations', 'voice_ai', 'api_whatsapp', 'reports', 'team_users']::text[],
    '{"seed":"commercial_credit_catalog","credit_unit_brl":0.01,"target_markup":4,"included_credit_value_brl":250,"target_provider_cost_brl":62.5,"editable":true}'::jsonb
  )
on conflict (plan_code) do update
set
  name = excluded.name,
  short_description = excluded.short_description,
  status = excluded.status,
  sort_order = excluded.sort_order,
  highlighted = excluded.highlighted,
  monthly_price_brl = excluded.monthly_price_brl,
  included_credits = excluded.included_credits,
  overage_credit_price_brl = excluded.overage_credit_price_brl,
  auto_recharge_min_credits = excluded.auto_recharge_min_credits,
  overage_limit_credits = excluded.overage_limit_credits,
  trial_days = excluded.trial_days,
  agent_limit = excluded.agent_limit,
  whatsapp_instance_limit = excluded.whatsapp_instance_limit,
  user_limit = excluded.user_limit,
  module_codes = excluded.module_codes,
  metadata = public.billing_plans.metadata || excluded.metadata,
  updated_at = now();

update public.billing_plans
set
  status = 'archived',
  highlighted = false,
  metadata = metadata || '{"superseded_by":"starter","archived_by":"commercial_credit_catalog"}'::jsonb,
  updated_at = now()
where plan_code = 'basic';

insert into public.billing_credit_packs (
  pack_code,
  name,
  short_description,
  status,
  sort_order,
  price_brl,
  credit_amount,
  bonus_percent,
  auto_recharge_enabled,
  metadata
)
values
  (
    'credits_3000',
    '3.000 creditos',
    'Recarga rapida para continuar atendimentos e respostas por voz.',
    'active',
    10,
    30,
    3000,
    0,
    true,
    '{"credit_unit_brl":0.01,"target_markup":4}'::jsonb
  ),
  (
    'credits_10500',
    '10.500 creditos',
    'Pacote intermediario com bonus para clientes com maior volume.',
    'active',
    20,
    97,
    10500,
    8.2474,
    true,
    '{"credit_unit_brl":0.009238,"target_markup":4}'::jsonb
  ),
  (
    'credits_28000',
    '28.000 creditos',
    'Pacote de escala para operacoes que usam agentes e voz diariamente.',
    'active',
    30,
    247,
    28000,
    13.3603,
    true,
    '{"credit_unit_brl":0.008821,"target_markup":4}'::jsonb
  ),
  (
    'credits_60000',
    '60.000 creditos',
    'Pacote premium para alto volume e recarga automatica.',
    'active',
    40,
    497,
    60000,
    20.7243,
    true,
    '{"credit_unit_brl":0.008283,"target_markup":4}'::jsonb
  )
on conflict (pack_code) do update
set
  name = excluded.name,
  short_description = excluded.short_description,
  status = excluded.status,
  sort_order = excluded.sort_order,
  price_brl = excluded.price_brl,
  credit_amount = excluded.credit_amount,
  bonus_percent = excluded.bonus_percent,
  auto_recharge_enabled = excluded.auto_recharge_enabled,
  metadata = public.billing_credit_packs.metadata || excluded.metadata,
  updated_at = now();

insert into public.provider_features (cost_center_id, feature_code, name, description, unit, included_in_plans, metadata)
select
  cc.id,
  'voice_reply_economy',
  'Voz economica',
  'Sistema de voz 1 para respostas em audio com custo reduzido usando Gemini.',
  'character'::public.billing_unit,
  array['starter','pro','scale']::text[],
  '{"bill_to_client":true,"product_label":"Sistema de voz 1","provider_hidden_label":"gemini_tts"}'::jsonb
from public.provider_cost_centers cc
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
select
  cc.id,
  'gemini-3.1-flash-tts-preview',
  'Sistema de voz 1',
  'voice_reply_economy',
  'character'::public.billing_unit,
  'character'::public.billing_unit,
  '{"tier":"economy","provider_hidden_label":"gemini_tts"}'::jsonb
from public.provider_cost_centers cc
where cc.provider = 'gemini'
on conflict (cost_center_id, provider_model_id) do update
set
  display_name = excluded.display_name,
  feature_code = excluded.feature_code,
  input_unit = excluded.input_unit,
  output_unit = excluded.output_unit,
  metadata = public.provider_models.metadata || excluded.metadata,
  updated_at = now();

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
  cc.id,
  pf.id,
  pm.id,
  null,
  'character'::public.billing_unit,
  0.0001,
  0.04,
  4,
  20,
  '{"seed":"commercial_credit_catalog","product_label":"Sistema de voz 1","charge_note":"0.04 creditos por caractere, minimo 20 creditos"}'::jsonb
from public.provider_cost_centers cc
join public.provider_features pf on pf.cost_center_id = cc.id and pf.feature_code = 'voice_reply_economy'
left join public.provider_models pm on pm.cost_center_id = cc.id and pm.provider_model_id = 'gemini-3.1-flash-tts-preview'
where cc.provider = 'gemini'
  and not exists (
    select 1
    from public.billing_rates br
    where br.cost_center_id = cc.id
      and br.feature_id = pf.id
      and coalesce(br.model_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(pm.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and br.plan_code is null
      and br.unit = 'character'::public.billing_unit
      and br.active = true
  );

create or replace function public.grant_billing_plan_credits(
  p_organization_id uuid,
  p_plan_code text,
  p_cycle_start timestamptz default now(),
  p_cycle_end timestamptz default now() + interval '1 month',
  p_external_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  plan_row public.billing_plans%rowtype;
  transaction_id uuid;
  cycle_id uuid;
begin
  select *
  into plan_row
  from public.billing_plans
  where plan_code = p_plan_code
    and status in ('active', 'draft')
  limit 1;

  if not found then
    raise exception 'Billing plan not found.';
  end if;

  if plan_row.included_credits <= 0 then
    return null;
  end if;

  perform public.ensure_credit_wallet(p_organization_id);

  select id
  into cycle_id
  from public.billing_cycles
  where organization_id = p_organization_id
    and period_start = p_cycle_start
    and period_end = p_cycle_end
  limit 1;

  if cycle_id is null then
    insert into public.billing_cycles (
      organization_id,
      plan_id,
      period_start,
      period_end,
      status,
      included_credits_granted
    )
    values (
      p_organization_id,
      plan_row.id,
      p_cycle_start,
      p_cycle_end,
      'open',
      plan_row.included_credits
    )
    returning id into cycle_id;
  else
    update public.billing_cycles
    set
      plan_id = plan_row.id,
      status = 'open',
      included_credits_granted = plan_row.included_credits,
      updated_at = now()
    where id = cycle_id;
  end if;

  transaction_id := public.grant_credit_wallet(
    p_organization_id,
    plan_row.included_credits,
    'Creditos inclusos do plano ' || plan_row.name,
    p_external_reference,
    jsonb_build_object(
      'source', 'monthly_plan_credit_grant',
      'plan_code', plan_row.plan_code,
      'billing_cycle_id', cycle_id,
      'included_credits', plan_row.included_credits
    ),
    'grant'
  );

  return transaction_id;
end;
$fn$;

grant execute on function public.grant_billing_plan_credits(uuid, text, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.grant_billing_plan_credits(uuid, text, timestamptz, timestamptz, text) to service_role;
