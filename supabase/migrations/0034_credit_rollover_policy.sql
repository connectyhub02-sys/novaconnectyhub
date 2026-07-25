update public.billing_plans
set
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'credit_policy_version', 'rollover_v1',
    'credits_rollover_enabled', true,
    'credits_require_active_plan', true,
    'trial_credits_convert_to_paid_plan', true,
    'trial_credit_conversion_grace_days', 7,
    'credits_expire_with_trial', false
  ),
  updated_at = now()
where plan_code = 'trial';

update public.billing_plans
set
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'credit_policy_version', 'rollover_v1',
    'credits_rollover_enabled', true,
    'credits_require_active_plan', true,
    'inactive_plan_freezes_credits', true,
    'monthly_plan_credits_accumulate', true
  ),
  updated_at = now()
where plan_code in ('starter', 'pro', 'scale');

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
  converting_trial_to_paid boolean := false;
  preserved_balance_credits numeric(18,6) := 0;
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

  select coalesce(balance_credits, 0)
  into preserved_balance_credits
  from public.credit_wallets
  where organization_id = p_organization_id;

  converting_trial_to_paid := plan_row.plan_code <> 'trial'
    and (coalesce(organization_row.plan_code, '') = 'trial' or coalesce(organization_row.status, '') in ('trial', 'trial_expired'));

  if converting_trial_to_paid then
    update public.credit_wallets
    set
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'credit_policy_version', 'rollover_v1',
        'trial_balance_preserved_on_paid_conversion', true,
        'trial_balance_preserved_credits', preserved_balance_credits,
        'trial_converted_at', now(),
        'credits_rollover_enabled', true,
        'credits_require_active_plan', true
      ),
      updated_at = now()
    where organization_id = p_organization_id;

    update public.billing_cycles bc
    set
      status = 'closed',
      updated_at = now(),
      metadata = coalesce(bc.metadata, '{}'::jsonb) || jsonb_build_object(
        'closed_reason', 'paid_conversion',
        'trial_balance_preserved_credits', preserved_balance_credits,
        'credit_policy_version', 'rollover_v1'
      )
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
        'plan_code', plan_row.plan_code,
        'credit_policy_version', 'rollover_v1',
        'credits_rollover_enabled', true,
        'previous_balance_credits', preserved_balance_credits
      )
    )
    returning id into cycle_id;
  else
    update public.billing_cycles
    set
      plan_id = plan_row.id,
      status = 'open',
      included_credits = plan_row.included_credits,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'monthly_plan_credit_grant',
        'plan_code', plan_row.plan_code,
        'credit_policy_version', 'rollover_v1',
        'credits_rollover_enabled', true,
        'previous_balance_credits', preserved_balance_credits
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
    jsonb_strip_nulls(jsonb_build_object(
      'source', case when plan_row.plan_code = 'trial' then 'trial_credit_grant' else 'monthly_plan_credit_grant' end,
      'plan_code', plan_row.plan_code,
      'billing_cycle_id', cycle_id,
      'included_credits', plan_row.included_credits,
      'credit_policy_version', 'rollover_v1',
      'credits_rollover_enabled', true,
      'previous_balance_credits', preserved_balance_credits,
      'converted_trial_balance_credits', case when converting_trial_to_paid then preserved_balance_credits else null end
    )),
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
  normalized_plan_code text;
  normalized_status text;
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

  normalized_plan_code := lower(coalesce(organization_row.plan_code, ''));
  normalized_status := lower(coalesce(organization_row.status, ''));

  if normalized_plan_code = 'trial' or normalized_status in ('trial', 'trial_expired') then
    if normalized_status = 'trial_expired' then
      raise exception 'ConnectyHub trial expired.';
    end if;

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

  if normalized_plan_code <> 'internal'
    and normalized_status in ('expired', 'past_due', 'cancelled', 'canceled', 'inactive', 'suspended', 'paused', 'pending', 'payment_pending', 'incomplete') then
    raise exception 'ConnectyHub plan inactive.';
  end if;

  if normalized_plan_code not in ('', 'trial', 'internal')
    and normalized_status not in ('active', 'trial') then
    raise exception 'ConnectyHub paid plan inactive.';
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
    lifetime_used_credits = lifetime_used_credits + p_amount_credits,
    updated_at = now()
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
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'credit_policy_version', 'rollover_v1',
      'credits_require_active_plan', true
    ),
    auth.uid()
  )
  returning id into transaction_id;

  if greatest(next_balance, 0) = 0
    and (normalized_plan_code = 'trial' or normalized_status = 'trial') then
    perform public.enqueue_connectyhub_trial_no_credits_message(p_organization_id, organization_row.owner_id);
  end if;

  return transaction_id;
end;
$fn$;

grant execute on function public.debit_credit_wallet(uuid, numeric, public.billing_provider, uuid, text, jsonb) to authenticated;
grant execute on function public.debit_credit_wallet(uuid, numeric, public.billing_provider, uuid, text, jsonb) to service_role;
