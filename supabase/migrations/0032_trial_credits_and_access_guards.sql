alter table public.profiles
add column if not exists trial_whatsapp_opt_in boolean not null default false,
add column if not exists trial_whatsapp_opt_in_at timestamptz,
add column if not exists trial_whatsapp_opt_in_source text;

create table if not exists public.trial_conversion_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  trigger_code text not null,
  channel text not null default 'whatsapp',
  template_key text not null,
  scheduled_at timestamptz not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (trigger_code in ('trial_started', 'trial_three_days_remaining', 'trial_no_credits', 'trial_one_day_remaining', 'trial_expired')),
  check (channel in ('whatsapp', 'email', 'in_app')),
  check (status in ('pending', 'sent', 'skipped', 'canceled', 'failed'))
);

create unique index if not exists idx_trial_conversion_messages_unique_trigger
  on public.trial_conversion_messages (organization_id, trigger_code, channel);

create index if not exists idx_trial_conversion_messages_pending
  on public.trial_conversion_messages (scheduled_at)
  where status = 'pending';

drop trigger if exists touch_trial_conversion_messages_updated_at on public.trial_conversion_messages;
create trigger touch_trial_conversion_messages_updated_at
before update on public.trial_conversion_messages
for each row execute function public.touch_updated_at();

alter table public.trial_conversion_messages enable row level security;

drop policy if exists "trial conversion messages visible to platform admins" on public.trial_conversion_messages;
create policy "trial conversion messages visible to platform admins"
on public.trial_conversion_messages for select
using (public.is_platform_admin());

drop policy if exists "trial conversion messages managed by platform admins" on public.trial_conversion_messages;
create policy "trial conversion messages managed by platform admins"
on public.trial_conversion_messages for all
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
values (
  'trial',
  'Teste gratis',
  'Teste de 7 dias com creditos limitados para validar o atendimento no WhatsApp.',
  'active',
  5,
  false,
  0,
  1000,
  0.01,
  0,
  0,
  7,
  1,
  1,
  1,
  array['whatsapp_agent', 'sales_catalog', 'crm_basic', 'voice_ai']::text[],
  '{"seed":"trial_credit_catalog","credit_unit_brl":0.01,"target_markup":4,"included_credit_value_brl":10,"target_provider_cost_brl":2.5,"credits_expire_with_trial":true,"editable":true}'::jsonb
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

create or replace function public.grant_connectyhub_trial_credits(
  p_organization_id uuid,
  p_user_id uuid default auth.uid(),
  p_cycle_start timestamptz default now(),
  p_external_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  plan_row public.billing_plans%rowtype;
  cycle_id uuid;
  transaction_id uuid;
  cycle_start_at timestamptz;
  cycle_end_at timestamptz;
begin
  select *
  into plan_row
  from public.billing_plans
  where plan_code = 'trial'
    and status in ('active', 'draft')
  limit 1;

  if not found then
    raise exception 'Trial billing plan not found.';
  end if;

  cycle_start_at := coalesce(p_cycle_start, now());
  cycle_end_at := cycle_start_at + make_interval(days => greatest(coalesce(plan_row.trial_days, 7), 1));

  perform public.ensure_credit_wallet(p_organization_id);

  insert into public.organization_billing_limits (
    organization_id,
    monthly_credit_limit,
    daily_credit_limit,
    allow_overage,
    overage_limit_credits,
    hard_block_when_empty,
    alert_threshold_percent,
    metadata
  )
  values (
    p_organization_id,
    plan_row.included_credits,
    null,
    false,
    0,
    true,
    80,
    '{"source":"trial_credit_catalog"}'::jsonb
  )
  on conflict (organization_id) do update
  set
    monthly_credit_limit = excluded.monthly_credit_limit,
    allow_overage = false,
    overage_limit_credits = 0,
    hard_block_when_empty = true,
    metadata = public.organization_billing_limits.metadata || excluded.metadata,
    updated_at = now();

  update public.organizations
  set
    plan_code = 'trial',
    status = 'trial'
  where id = p_organization_id
    and (plan_code is null or plan_code = 'trial' or status in ('trial', 'trial_expired'));

  select id
  into cycle_id
  from public.billing_cycles
  where organization_id = p_organization_id
    and plan_id = plan_row.id
    and status in ('open', 'closed')
  order by cycle_start asc
  limit 1;

  if cycle_id is null then
    insert into public.billing_cycles (
      organization_id,
      plan_id,
      cycle_start,
      cycle_end,
      included_credits,
      status,
      metadata
    )
    values (
      p_organization_id,
      plan_row.id,
      cycle_start_at,
      cycle_end_at,
      plan_row.included_credits,
      'open',
      jsonb_build_object(
        'source', 'trial_credit_grant',
        'plan_code', plan_row.plan_code,
        'expires_credits_at', cycle_end_at
      )
    )
    returning id into cycle_id;
  else
    update public.billing_cycles
    set
      plan_id = plan_row.id,
      status = case when cycle_end > now() then 'open' else status end,
      included_credits = plan_row.included_credits,
      metadata = metadata || jsonb_build_object(
        'source', 'trial_credit_grant',
        'plan_code', plan_row.plan_code,
        'expires_credits_at', cycle_end
      ),
      updated_at = now()
    where id = cycle_id;
  end if;

  select id
  into transaction_id
  from public.credit_transactions
  where organization_id = p_organization_id
    and metadata ->> 'source' = 'trial_credit_grant'
  order by created_at asc
  limit 1;

  if transaction_id is not null then
    return transaction_id;
  end if;

  transaction_id := public.grant_credit_wallet(
    p_organization_id,
    plan_row.included_credits,
    'Creditos do teste gratis ConnectyHub',
    p_external_reference,
    jsonb_build_object(
      'source', 'trial_credit_grant',
      'plan_code', plan_row.plan_code,
      'billing_cycle_id', cycle_id,
      'included_credits', plan_row.included_credits,
      'expires_at', cycle_end_at,
      'user_id', p_user_id
    ),
    'grant'
  );

  return transaction_id;
end;
$fn$;

grant execute on function public.grant_connectyhub_trial_credits(uuid, uuid, timestamptz, text) to authenticated;
grant execute on function public.grant_connectyhub_trial_credits(uuid, uuid, timestamptz, text) to service_role;

create or replace function public.schedule_connectyhub_trial_messages(
  p_organization_id uuid,
  p_user_id uuid default auth.uid(),
  p_opt_in boolean default true
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  trial_cycle public.billing_cycles%rowtype;
  inserted_count integer := 0;
begin
  if not coalesce(p_opt_in, false) then
    return 0;
  end if;

  select bc.*
  into trial_cycle
  from public.billing_cycles bc
  join public.billing_plans bp on bp.id = bc.plan_id
  where bc.organization_id = p_organization_id
    and bp.plan_code = 'trial'
  order by bc.cycle_end desc
  limit 1;

  if trial_cycle.id is null then
    return 0;
  end if;

  insert into public.trial_conversion_messages (
    organization_id,
    user_id,
    trigger_code,
    template_key,
    scheduled_at,
    payload
  )
  values
    (
      p_organization_id,
      p_user_id,
      'trial_started',
      'trial_started_v1',
      greatest(now(), trial_cycle.cycle_start),
      jsonb_build_object('trial_ends_at', trial_cycle.cycle_end, 'included_credits', trial_cycle.included_credits)
    ),
    (
      p_organization_id,
      p_user_id,
      'trial_three_days_remaining',
      'trial_three_days_remaining_v1',
      greatest(now(), trial_cycle.cycle_end - interval '3 days'),
      jsonb_build_object('trial_ends_at', trial_cycle.cycle_end)
    ),
    (
      p_organization_id,
      p_user_id,
      'trial_one_day_remaining',
      'trial_one_day_remaining_v1',
      greatest(now(), trial_cycle.cycle_end - interval '1 day'),
      jsonb_build_object('trial_ends_at', trial_cycle.cycle_end)
    ),
    (
      p_organization_id,
      p_user_id,
      'trial_expired',
      'trial_expired_v1',
      trial_cycle.cycle_end,
      jsonb_build_object('trial_ends_at', trial_cycle.cycle_end)
    )
  on conflict (organization_id, trigger_code, channel) do update
  set
    user_id = excluded.user_id,
    template_key = excluded.template_key,
    scheduled_at = excluded.scheduled_at,
    payload = public.trial_conversion_messages.payload || excluded.payload,
    status = case
      when public.trial_conversion_messages.status in ('sent', 'canceled') then public.trial_conversion_messages.status
      else 'pending'
    end,
    updated_at = now();

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$fn$;

grant execute on function public.schedule_connectyhub_trial_messages(uuid, uuid, boolean) to authenticated;
grant execute on function public.schedule_connectyhub_trial_messages(uuid, uuid, boolean) to service_role;

create or replace function public.enqueue_connectyhub_trial_no_credits_message(
  p_organization_id uuid,
  p_user_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  message_id uuid;
  effective_user_id uuid;
begin
  effective_user_id := p_user_id;

  if effective_user_id is null then
    select owner_id
    into effective_user_id
    from public.organizations
    where id = p_organization_id
    limit 1;
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = effective_user_id
      and trial_whatsapp_opt_in = true
  ) then
    return null;
  end if;

  insert into public.trial_conversion_messages (
    organization_id,
    user_id,
    trigger_code,
    template_key,
    scheduled_at,
    payload
  )
  values (
    p_organization_id,
    effective_user_id,
    'trial_no_credits',
    'trial_no_credits_v1',
    now(),
    '{"reason":"credits_empty"}'::jsonb
  )
  on conflict (organization_id, trigger_code, channel) do update
  set
    user_id = excluded.user_id,
    scheduled_at = case
      when public.trial_conversion_messages.status = 'sent' then public.trial_conversion_messages.scheduled_at
      else now()
    end,
    status = case
      when public.trial_conversion_messages.status = 'sent' then 'sent'
      else 'pending'
    end,
    updated_at = now()
  returning id into message_id;

  return message_id;
end;
$fn$;

grant execute on function public.enqueue_connectyhub_trial_no_credits_message(uuid, uuid) to authenticated;
grant execute on function public.enqueue_connectyhub_trial_no_credits_message(uuid, uuid) to service_role;

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
  organization_row public.organizations%rowtype;
  transaction_id uuid;
  cycle_id uuid;
  reset_trial_balance boolean := false;
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

  select *
  into organization_row
  from public.organizations
  where id = p_organization_id
  limit 1;

  if not found then
    raise exception 'Organization not found.';
  end if;

  if plan_row.included_credits <= 0 then
    return null;
  end if;

  perform public.ensure_credit_wallet(p_organization_id);

  reset_trial_balance := plan_row.plan_code <> 'trial'
    and (coalesce(organization_row.plan_code, '') = 'trial' or coalesce(organization_row.status, '') in ('trial', 'trial_expired'));

  if reset_trial_balance then
    update public.credit_wallets
    set
      balance_credits = 0,
      metadata = metadata || '{"trial_balance_removed_on_paid_conversion":true}'::jsonb,
      updated_at = now()
    where organization_id = p_organization_id;

    update public.billing_cycles bc
    set
      status = 'closed',
      updated_at = now(),
      metadata = bc.metadata || '{"closed_reason":"paid_conversion"}'::jsonb
    from public.billing_plans bp
    where bc.plan_id = bp.id
      and bc.organization_id = p_organization_id
      and bp.plan_code = 'trial'
      and bc.status = 'open';

    update public.trial_conversion_messages
    set
      status = 'canceled',
      updated_at = now()
    where organization_id = p_organization_id
      and status = 'pending';
  end if;

  select id
  into cycle_id
  from public.billing_cycles
  where organization_id = p_organization_id
    and cycle_start = p_cycle_start
    and cycle_end = p_cycle_end
  limit 1;

  if cycle_id is null then
    insert into public.billing_cycles (
      organization_id,
      plan_id,
      cycle_start,
      cycle_end,
      status,
      included_credits,
      metadata
    )
    values (
      p_organization_id,
      plan_row.id,
      p_cycle_start,
      p_cycle_end,
      'open',
      plan_row.included_credits,
      jsonb_build_object(
        'source', 'monthly_plan_credit_grant',
        'plan_code', plan_row.plan_code
      )
    )
    returning id into cycle_id;
  else
    update public.billing_cycles
    set
      plan_id = plan_row.id,
      status = 'open',
      included_credits = plan_row.included_credits,
      metadata = metadata || jsonb_build_object(
        'source', 'monthly_plan_credit_grant',
        'plan_code', plan_row.plan_code
      ),
      updated_at = now()
    where id = cycle_id;
  end if;

  update public.organizations
  set
    plan_code = plan_row.plan_code,
    status = case when plan_row.plan_code = 'trial' then 'trial' else 'active' end
  where id = p_organization_id;

  transaction_id := public.grant_credit_wallet(
    p_organization_id,
    plan_row.included_credits,
    'Creditos inclusos do plano ' || plan_row.name,
    p_external_reference,
    jsonb_build_object(
      'source', case when plan_row.plan_code = 'trial' then 'trial_credit_grant' else 'monthly_plan_credit_grant' end,
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

create or replace function public.debit_credit_wallet(
  p_organization_id uuid,
  p_amount_credits numeric,
  p_provider public.billing_provider default null,
  p_usage_event_id uuid default null,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  wallet public.credit_wallets%rowtype;
  limits public.organization_billing_limits%rowtype;
  organization_row public.organizations%rowtype;
  trial_cycle public.billing_cycles%rowtype;
  transaction_id uuid;
  next_balance numeric(18,6);
  available_credits numeric(18,6);
begin
  if p_amount_credits <= 0 then
    raise exception 'Debit amount must be greater than zero.';
  end if;

  select *
  into organization_row
  from public.organizations
  where id = p_organization_id
  limit 1;

  if not found then
    raise exception 'Organization not found.';
  end if;

  if coalesce(organization_row.plan_code, '') = 'trial' or coalesce(organization_row.status, '') in ('trial', 'trial_expired') then
    select bc.*
    into trial_cycle
    from public.billing_cycles bc
    join public.billing_plans bp on bp.id = bc.plan_id
    where bc.organization_id = p_organization_id
      and bp.plan_code = 'trial'
    order by bc.cycle_end desc
    limit 1;

    if trial_cycle.id is not null and trial_cycle.cycle_end <= now() then
      raise exception 'ConnectyHub trial expired.';
    end if;

    if trial_cycle.id is null and organization_row.created_at + interval '7 days' <= now() then
      raise exception 'ConnectyHub trial expired.';
    end if;
  end if;

  perform public.ensure_credit_wallet(p_organization_id);

  select *
  into wallet
  from public.credit_wallets
  where organization_id = p_organization_id
  for update;

  select *
  into limits
  from public.organization_billing_limits
  where organization_id = p_organization_id;

  available_credits := wallet.balance_credits;

  if coalesce(limits.allow_overage, false) then
    available_credits := available_credits + coalesce(limits.overage_limit_credits, 0);
  end if;

  if coalesce(limits.hard_block_when_empty, true) and available_credits < p_amount_credits then
    raise exception 'Insufficient ConnectyHub credits.';
  end if;

  next_balance := wallet.balance_credits - p_amount_credits;

  update public.credit_wallets
  set
    balance_credits = greatest(next_balance, 0),
    lifetime_used_credits = lifetime_used_credits + p_amount_credits
  where id = wallet.id;

  update public.billing_cycles
  set
    used_credits = used_credits + p_amount_credits,
    overage_credits = case
      when used_credits + p_amount_credits > included_credits
      then used_credits + p_amount_credits - included_credits
      else overage_credits
    end,
    updated_at = now()
  where id = (
    select id
    from public.billing_cycles
    where organization_id = p_organization_id
      and status = 'open'
      and cycle_start <= now()
      and cycle_end > now()
    order by cycle_end asc
    limit 1
  );

  insert into public.credit_transactions (
    organization_id,
    wallet_id,
    transaction_type,
    amount_credits,
    balance_after_credits,
    provider,
    usage_event_id,
    description,
    metadata,
    created_by
  )
  values (
    p_organization_id,
    wallet.id,
    'debit',
    p_amount_credits * -1,
    greatest(next_balance, 0),
    p_provider,
    p_usage_event_id,
    p_description,
    p_metadata,
    auth.uid()
  )
  returning id into transaction_id;

  if greatest(next_balance, 0) = 0
    and (coalesce(organization_row.plan_code, '') = 'trial' or coalesce(organization_row.status, '') = 'trial') then
    perform public.enqueue_connectyhub_trial_no_credits_message(p_organization_id, organization_row.owner_id);
  end if;

  return transaction_id;
end;
$fn$;

grant execute on function public.debit_credit_wallet(uuid, numeric, public.billing_provider, uuid, text, jsonb) to authenticated;
grant execute on function public.debit_credit_wallet(uuid, numeric, public.billing_provider, uuid, text, jsonb) to service_role;
