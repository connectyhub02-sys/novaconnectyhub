-- Trial bonus expiration policy.
-- The remaining trial balance is a conversion bonus only while the 7-day trial is active.

update public.billing_plans
set
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'credit_policy_version', 'trial_bonus_expires_v2',
    'credits_rollover_enabled', false,
    'credits_require_active_plan', true,
    'trial_credits_convert_to_paid_plan', true,
    'trial_credit_conversion_grace_days', 0,
    'credits_expire_with_trial', true,
    'trial_bonus_requires_payment_before_cycle_end', true
  ),
  updated_at = now()
where plan_code = 'trial';

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
      'trial_started_v2',
      greatest(now(), trial_cycle.cycle_start),
      jsonb_build_object(
        'trial_ends_at', trial_cycle.cycle_end,
        'benefit_expires_at', trial_cycle.cycle_end,
        'included_credits', trial_cycle.included_credits,
        'credit_policy_version', 'trial_bonus_expires_v2'
      )
    ),
    (
      p_organization_id,
      p_user_id,
      'trial_three_days_remaining',
      'trial_three_days_remaining_v2',
      greatest(now(), trial_cycle.cycle_end - interval '3 days'),
      jsonb_build_object(
        'trial_ends_at', trial_cycle.cycle_end,
        'benefit_expires_at', trial_cycle.cycle_end,
        'credit_policy_version', 'trial_bonus_expires_v2'
      )
    ),
    (
      p_organization_id,
      p_user_id,
      'trial_one_day_remaining',
      'trial_one_day_remaining_v2',
      greatest(now(), trial_cycle.cycle_end - interval '1 day'),
      jsonb_build_object(
        'trial_ends_at', trial_cycle.cycle_end,
        'benefit_expires_at', trial_cycle.cycle_end,
        'credit_policy_version', 'trial_bonus_expires_v2'
      )
    ),
    (
      p_organization_id,
      p_user_id,
      'trial_expired',
      'trial_expired_v2',
      trial_cycle.cycle_end,
      jsonb_build_object(
        'trial_ends_at', trial_cycle.cycle_end,
        'benefit_expires_at', trial_cycle.cycle_end,
        'credit_policy_version', 'trial_bonus_expires_v2'
      )
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

create or replace function public.expire_connectyhub_trial_credits(
  p_now timestamptz default now(),
  p_limit integer default 100
)
returns table (
  organization_id uuid,
  wallet_id uuid,
  trial_cycle_id uuid,
  expired_balance_credits numeric
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  target record;
  limited_count integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  for target in
    select
      o.id as organization_id,
      cw.id as wallet_id,
      coalesce(cw.balance_credits, 0) as balance_credits,
      bc.id as trial_cycle_id,
      bc.cycle_end as trial_ends_at
    from public.organizations o
    join public.credit_wallets cw on cw.organization_id = o.id
    join lateral (
      select latest_bc.*
      from public.billing_cycles latest_bc
      join public.billing_plans latest_bp on latest_bp.id = latest_bc.plan_id
      where latest_bc.organization_id = o.id
        and latest_bp.plan_code = 'trial'
      order by latest_bc.cycle_end desc
      limit 1
    ) bc on true
    where (coalesce(o.plan_code, '') = 'trial' or coalesce(o.status, '') in ('trial', 'trial_expired'))
      and bc.cycle_end <= coalesce(p_now, now())
      and coalesce(cw.balance_credits, 0) > 0
    order by bc.cycle_end asc
    limit limited_count
    for update of cw skip locked
  loop
    update public.credit_wallets
    set
      balance_credits = 0,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'credit_policy_version', 'trial_bonus_expires_v2',
        'trial_balance_expired', true,
        'trial_balance_expired_on', coalesce(p_now, now()),
        'trial_balance_expired_credits', target.balance_credits,
        'trial_cycle_id', target.trial_cycle_id,
        'credits_require_active_plan', true
      ),
      updated_at = now()
    where id = target.wallet_id;

    insert into public.credit_transactions (
      organization_id,
      wallet_id,
      transaction_type,
      amount_credits,
      balance_after_credits,
      external_reference,
      description,
      metadata,
      created_by
    )
    values (
      target.organization_id,
      target.wallet_id,
      'expiration',
      target.balance_credits * -1,
      0,
      'trial_expired:' || target.organization_id::text || ':' || target.trial_cycle_id::text,
      'Saldo do teste gratis expirado',
      jsonb_build_object(
        'source', 'trial_credit_expiration',
        'credit_policy_version', 'trial_bonus_expires_v2',
        'trial_cycle_id', target.trial_cycle_id,
        'trial_ends_at', target.trial_ends_at,
        'expired_balance_credits', target.balance_credits
      ),
      auth.uid()
    );

    update public.billing_cycles
    set
      status = 'closed',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'closed_reason', 'trial_expired',
        'trial_balance_expired_credits', target.balance_credits,
        'credit_policy_version', 'trial_bonus_expires_v2'
      ),
      updated_at = now()
    where id = target.trial_cycle_id;

    update public.organizations
    set
      status = 'trial_expired',
      updated_at = now()
    where id = target.organization_id
      and (coalesce(plan_code, '') = 'trial' or coalesce(status, '') = 'trial');

    return query
    select
      target.organization_id::uuid,
      target.wallet_id::uuid,
      target.trial_cycle_id::uuid,
      target.balance_credits::numeric;
  end loop;
end;
$fn$;

grant execute on function public.expire_connectyhub_trial_credits(timestamptz, integer) to authenticated;
grant execute on function public.expire_connectyhub_trial_credits(timestamptz, integer) to service_role;

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
  wallet_row public.credit_wallets%rowtype;
  trial_cycle public.billing_cycles%rowtype;
  transaction_id uuid;
  cycle_id uuid;
  converting_trial_to_paid boolean := false;
  conversion_during_trial boolean := false;
  previous_balance_credits numeric(18,6) := 0;
  preserved_balance_credits numeric(18,6) := 0;
  expired_trial_balance_credits numeric(18,6) := 0;
  conversion_reference_at timestamptz;
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

  select *
  into wallet_row
  from public.credit_wallets
  where organization_id = p_organization_id
  for update;

  previous_balance_credits := coalesce(wallet_row.balance_credits, 0);
  conversion_reference_at := coalesce(p_cycle_start, now());

  converting_trial_to_paid := plan_row.plan_code <> 'trial'
    and (coalesce(organization_row.plan_code, '') = 'trial' or coalesce(organization_row.status, '') in ('trial', 'trial_expired'));

  if converting_trial_to_paid then
    select bc.*
    into trial_cycle
    from public.billing_cycles bc
    join public.billing_plans bp on bp.id = bc.plan_id
    where bc.organization_id = p_organization_id
      and bp.plan_code = 'trial'
    order by bc.cycle_end desc
    limit 1;

    if trial_cycle.id is not null then
      conversion_during_trial := conversion_reference_at <= trial_cycle.cycle_end;
    else
      conversion_during_trial := organization_row.created_at + interval '7 days' >= conversion_reference_at;
    end if;

    if conversion_during_trial then
      preserved_balance_credits := previous_balance_credits;

      update public.credit_wallets
      set
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'credit_policy_version', 'trial_bonus_expires_v2',
          'trial_balance_preserved_on_paid_conversion', true,
          'trial_balance_preserved_credits', preserved_balance_credits,
          'trial_converted_at', now(),
          'trial_bonus_was_valid', true,
          'credits_require_active_plan', true
        ),
        updated_at = now()
      where id = wallet_row.id;
    else
      expired_trial_balance_credits := greatest(previous_balance_credits, 0);
      preserved_balance_credits := 0;

      if expired_trial_balance_credits > 0 then
        update public.credit_wallets
        set
          balance_credits = 0,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'credit_policy_version', 'trial_bonus_expires_v2',
            'trial_balance_expired_on_paid_conversion', true,
            'trial_balance_expired_credits', expired_trial_balance_credits,
            'trial_converted_at', now(),
            'trial_bonus_was_valid', false,
            'credits_require_active_plan', true
          ),
          updated_at = now()
        where id = wallet_row.id;

        insert into public.credit_transactions (
          organization_id,
          wallet_id,
          transaction_type,
          amount_credits,
          balance_after_credits,
          external_reference,
          description,
          metadata,
          created_by
        )
        values (
          p_organization_id,
          wallet_row.id,
          'expiration',
          expired_trial_balance_credits * -1,
          0,
          'trial_expired:' || p_organization_id::text || ':' || coalesce(trial_cycle.id::text, 'no_cycle'),
          'Saldo do teste gratis expirado antes da assinatura',
          jsonb_build_object(
            'source', 'trial_credit_expiration_on_paid_conversion',
            'credit_policy_version', 'trial_bonus_expires_v2',
            'trial_cycle_id', trial_cycle.id,
            'trial_ends_at', trial_cycle.cycle_end,
            'expired_balance_credits', expired_trial_balance_credits,
            'paid_conversion_at', conversion_reference_at
          ),
          auth.uid()
        );
      end if;
    end if;

    update public.billing_cycles bc
    set
      status = 'closed',
      updated_at = now(),
      metadata = coalesce(bc.metadata, '{}'::jsonb) || jsonb_build_object(
        'closed_reason', 'paid_conversion',
        'trial_balance_preserved_credits', preserved_balance_credits,
        'trial_balance_expired_credits', expired_trial_balance_credits,
        'trial_bonus_was_valid', conversion_during_trial,
        'credit_policy_version', 'trial_bonus_expires_v2'
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
      jsonb_strip_nulls(jsonb_build_object(
        'source', 'monthly_plan_credit_grant',
        'plan_code', plan_row.plan_code,
        'credit_policy_version', 'trial_bonus_expires_v2',
        'credits_rollover_enabled', true,
        'previous_balance_credits', preserved_balance_credits,
        'expired_trial_balance_credits', case when expired_trial_balance_credits > 0 then expired_trial_balance_credits else null end
      ))
    )
    returning id into cycle_id;
  else
    update public.billing_cycles
    set
      plan_id = plan_row.id,
      status = 'open',
      included_credits = plan_row.included_credits,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'source', 'monthly_plan_credit_grant',
        'plan_code', plan_row.plan_code,
        'credit_policy_version', 'trial_bonus_expires_v2',
        'credits_rollover_enabled', true,
        'previous_balance_credits', preserved_balance_credits,
        'expired_trial_balance_credits', case when expired_trial_balance_credits > 0 then expired_trial_balance_credits else null end
      )),
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
      'credit_policy_version', 'trial_bonus_expires_v2',
      'credits_rollover_enabled', true,
      'previous_balance_credits', preserved_balance_credits,
      'converted_trial_balance_credits', case when converting_trial_to_paid and preserved_balance_credits > 0 then preserved_balance_credits else null end,
      'expired_trial_balance_credits', case when expired_trial_balance_credits > 0 then expired_trial_balance_credits else null end,
      'trial_bonus_was_valid', case when converting_trial_to_paid then conversion_during_trial else null end
    )),
    'grant'
  );

  return transaction_id;
end;
$fn$;

grant execute on function public.grant_billing_plan_credits(uuid, text, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.grant_billing_plan_credits(uuid, text, timestamptz, timestamptz, text) to service_role;

insert into public.platform_automation_flows (
  flow_key,
  name,
  description,
  event_type,
  audience_type,
  conditions,
  trigger_config,
  message_template,
  delay_minutes,
  cooldown_minutes,
  max_sends_per_contact,
  priority,
  labels,
  metadata
)
values
  (
    'trial_three_days_remaining',
    'Teste faltando 3 dias',
    'Avisa que o saldo restante do teste vira bonus somente se assinar antes do fim dos 7 dias.',
    'trial_three_days_remaining',
    'trial_users',
    '{"plan_codes":["trial"],"min_balance_credits":1}'::jsonb,
    '{"kind":"trial_deadline","days_remaining":3}'::jsonb,
    '{cliente}, faltam 3 dias para seu teste ConnectyHub acabar. Voce ainda tem {creditos_restantes} creditos de bonus. Assine ate {trial_expira_em} para somar esse saldo ao plano escolhido; depois disso o saldo expira.',
    0,
    1440,
    1,
    24,
    array['trial','conversion','deadline'],
    '{"seed":"0051_trial_bonus_expiration_policy","goal":"convert_before_bonus_expiration"}'::jsonb
  ),
  (
    'trial_one_day_remaining',
    'Ultimo dia do teste',
    'Ultima chamada para converter antes do saldo restante do teste expirar.',
    'trial_one_day_remaining',
    'trial_users',
    '{"plan_codes":["trial"],"min_balance_credits":1}'::jsonb,
    '{"kind":"trial_deadline","days_remaining":1}'::jsonb,
    '{cliente}, ultimo dia do seu teste ConnectyHub. Ele expira em {trial_expira_em}. Voce ainda tem {creditos_restantes} creditos; se assinar agora, esse saldo soma ao plano escolhido. Depois do prazo, ele zera.',
    0,
    1440,
    1,
    26,
    array['trial','conversion','deadline'],
    '{"seed":"0051_trial_bonus_expiration_policy","goal":"last_day_conversion"}'::jsonb
  ),
  (
    'trial_expired',
    'Teste expirado',
    'Explica que o bonus de saldo restante expirou e chama para assinatura sem saldo acumulado.',
    'trial_expired',
    'trial_users',
    '{"plan_codes":["trial"]}'::jsonb,
    '{"kind":"trial_expired"}'::jsonb,
    '{cliente}, seu teste gratis ConnectyHub acabou em {trial_expira_em}. O saldo restante do beneficio expirou. Para reativar atendimentos automaticos, escolha um plano no painel.',
    0,
    1440,
    1,
    35,
    array['trial','expired','conversion'],
    '{"seed":"0051_trial_bonus_expiration_policy","goal":"reactivate_after_expiration"}'::jsonb
  )
on conflict (flow_key) do update
set
  name = excluded.name,
  description = excluded.description,
  event_type = excluded.event_type,
  audience_type = excluded.audience_type,
  conditions = excluded.conditions,
  trigger_config = excluded.trigger_config,
  message_template = excluded.message_template,
  delay_minutes = excluded.delay_minutes,
  cooldown_minutes = excluded.cooldown_minutes,
  max_sends_per_contact = excluded.max_sends_per_contact,
  priority = excluded.priority,
  labels = excluded.labels,
  metadata = public.platform_automation_flows.metadata || excluded.metadata,
  updated_at = now();

update public.platform_automation_flows
set
  message_template = case flow_key
    when 'trial_started' then '{cliente}, parabens. Seu teste gratis ConnectyHub foi liberado com {creditos} creditos. Assine um plano ate {trial_expira_em} e o saldo restante soma aos creditos do plano escolhido.'
    when 'trial_credit_milestone' then '{cliente}, voce ja usou {marco_creditos} creditos do teste e ainda tem {creditos_restantes}. Assine ate {trial_expira_em} para somar esse saldo aos creditos do plano escolhido.'
    when 'trial_no_credits' then '{cliente}, seus creditos do teste acabaram. Para reativar atendimentos automaticos, IA e voz, escolha um plano no painel ConnectyHub.'
    when 'payment_approved' then '{cliente}, pagamento confirmado. Seu plano {plano} foi ativado na ConnectyHub com {creditos} creditos inclusos. Se havia saldo de teste ainda valido, ele foi somado na sua carteira. Valor: {valor}.'
    else message_template
  end,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'trial_bonus_policy_update', '0051_trial_bonus_expiration_policy',
    'trial_bonus_policy_updated_at', now()
  ),
  updated_at = now()
where flow_key in ('trial_started', 'trial_credit_milestone', 'trial_no_credits', 'payment_approved')
  and coalesce(metadata ->> 'seed', '') in ('0036_platform_automations', '0039_platform_automation_trigger_defaults');
