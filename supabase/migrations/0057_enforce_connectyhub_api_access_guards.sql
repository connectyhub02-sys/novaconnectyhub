-- Enforce ConnectyHub API access by signup completion and commercial plan.
-- API WhatsApp is available during the active 7-day trial and on Scale only.

drop trigger if exists trg_ensure_connectyhub_api_client_for_organization on public.organizations;
drop function if exists public.ensure_connectyhub_api_client_for_organization();

create or replace function public.connectyhub_api_eligible_organizations()
returns table (organization_id uuid)
language sql
security definer
set search_path = public
as $$
  with owner_completion as (
    select
      profiles.id,
      coalesce(profiles.is_platform_admin, false) as is_platform_admin,
      nullif(trim(coalesce(profiles.full_name, '')), '') is not null as has_full_name,
      coalesce(nullif(trim(coalesce(profiles.phone_normalized, '')), ''), nullif(trim(coalesce(profiles.phone, '')), '')) is not null as has_phone,
      profiles.phone_verified_at is not null as has_phone_verification,
      profiles.cpf_hash is not null as has_cpf
    from public.profiles
  ),
  organizations_with_trial_window as (
    select
      organizations.id,
      organizations.owner_id,
      organizations.plan_code,
      organizations.status,
      organizations.created_at,
      coalesce(credit_wallets.balance_credits, 0) as balance_credits,
      coalesce(
        (
          select billing_cycles.cycle_end
          from public.billing_cycles
          left join public.billing_plans
            on billing_plans.id = billing_cycles.plan_id
          where billing_cycles.organization_id = organizations.id
            and billing_cycles.status = 'open'
            and (
              billing_plans.plan_code = 'trial'
              or organizations.plan_code = 'trial'
            )
          order by billing_cycles.cycle_end desc
          limit 1
        ),
        organizations.created_at + interval '7 days'
      ) as trial_ends_at
    from public.organizations
    left join public.credit_wallets
      on credit_wallets.organization_id = organizations.id
  )
  select organizations_with_trial_window.id
  from organizations_with_trial_window
  join owner_completion
    on owner_completion.id = organizations_with_trial_window.owner_id
  where owner_completion.is_platform_admin = false
    and owner_completion.has_full_name
    and owner_completion.has_phone
    and owner_completion.has_phone_verification
    and owner_completion.has_cpf
    and (
      (
        organizations_with_trial_window.plan_code = 'trial'
        and organizations_with_trial_window.status in ('trial', 'trial_active')
        and organizations_with_trial_window.trial_ends_at > now()
      )
      or (
        organizations_with_trial_window.plan_code = 'scale'
        and organizations_with_trial_window.balance_credits > 0
        and coalesce(organizations_with_trial_window.status, 'active') not in (
          'expired',
          'past_due',
          'cancelled',
          'canceled',
          'inactive',
          'suspended',
          'paused',
          'pending',
          'payment_pending',
          'incomplete'
        )
      )
    );
$$;

with eligible_organizations as (
  select organization_id from public.connectyhub_api_eligible_organizations()
),
ineligible_clients as (
  select clients.id
  from public.connectyhub_api_clients clients
  where clients.status <> 'archived'
    and not exists (
      select 1
      from eligible_organizations
      where eligible_organizations.organization_id = clients.organization_id
    )
),
paused_clients as (
  update public.connectyhub_api_clients clients
  set
    status = 'paused',
    updated_at = now(),
    metadata = coalesce(clients.metadata, '{}'::jsonb) || jsonb_build_object(
      'connectyhub_api_access_guard',
      jsonb_build_object(
        'allowed', false,
        'reason', 'Cadastro incompleto, teste expirado ou plano sem API WhatsApp.',
        'status', 403,
        'checked_at', now(),
        'paused_at', now(),
        'restored_at', null,
        'paused_by', 'connectyhub_api_access_guard',
        'previous_status', clients.status
      )
    )
  from ineligible_clients
  where clients.id = ineligible_clients.id
    and clients.status = 'active'
  returning clients.id
),
paused_keys as (
  update public.connectyhub_api_keys keys
  set
    status = 'paused',
    updated_at = now(),
    metadata = coalesce(keys.metadata, '{}'::jsonb) || jsonb_build_object(
      'connectyhub_api_access_guard',
      jsonb_build_object(
        'allowed', false,
        'reason', 'Cadastro incompleto, teste expirado ou plano sem API WhatsApp.',
        'status', 403,
        'checked_at', now(),
        'paused_at', now(),
        'restored_at', null,
        'paused_by', 'connectyhub_api_access_guard',
        'previous_status', keys.status
      )
    )
  from ineligible_clients
  where keys.client_id = ineligible_clients.id
    and keys.status = 'active'
  returning keys.id
)
update public.connectyhub_webhook_endpoints endpoints
set
  status = 'paused',
  updated_at = now(),
  metadata = coalesce(endpoints.metadata, '{}'::jsonb) || jsonb_build_object(
    'connectyhub_api_access_guard',
    jsonb_build_object(
      'allowed', false,
      'reason', 'Cadastro incompleto, teste expirado ou plano sem API WhatsApp.',
      'status', 403,
      'checked_at', now(),
      'paused_at', now(),
      'restored_at', null,
      'paused_by', 'connectyhub_api_access_guard',
      'previous_status', endpoints.status
    )
  )
from ineligible_clients
where endpoints.client_id = ineligible_clients.id
  and endpoints.status = 'active';

with eligible_organizations as (
  select organization_id from public.connectyhub_api_eligible_organizations()
),
eligible_guarded_clients as (
  select clients.id
  from public.connectyhub_api_clients clients
  join eligible_organizations
    on eligible_organizations.organization_id = clients.organization_id
  where clients.status = 'paused'
    and clients.metadata -> 'connectyhub_api_access_guard' ->> 'paused_by' = 'connectyhub_api_access_guard'
    and clients.metadata -> 'connectyhub_api_access_guard' ->> 'allowed' = 'false'
),
restored_clients as (
  update public.connectyhub_api_clients clients
  set
    status = 'active',
    updated_at = now(),
    metadata = coalesce(clients.metadata, '{}'::jsonb) || jsonb_build_object(
      'connectyhub_api_access_guard',
      jsonb_build_object(
        'allowed', true,
        'reason', 'allowed',
        'status', null,
        'checked_at', now(),
        'paused_at', clients.metadata -> 'connectyhub_api_access_guard' ->> 'paused_at',
        'restored_at', now(),
        'paused_by', 'connectyhub_api_access_guard',
        'previous_status', clients.metadata -> 'connectyhub_api_access_guard' ->> 'previous_status'
      )
    )
  from eligible_guarded_clients
  where clients.id = eligible_guarded_clients.id
  returning clients.id
),
restored_keys as (
  update public.connectyhub_api_keys keys
  set
    status = 'active',
    updated_at = now(),
    metadata = coalesce(keys.metadata, '{}'::jsonb) || jsonb_build_object(
      'connectyhub_api_access_guard',
      jsonb_build_object(
        'allowed', true,
        'reason', 'allowed',
        'status', null,
        'checked_at', now(),
        'paused_at', keys.metadata -> 'connectyhub_api_access_guard' ->> 'paused_at',
        'restored_at', now(),
        'paused_by', 'connectyhub_api_access_guard',
        'previous_status', keys.metadata -> 'connectyhub_api_access_guard' ->> 'previous_status'
      )
    )
  from eligible_guarded_clients
  where keys.client_id = eligible_guarded_clients.id
    and keys.status = 'paused'
    and keys.metadata -> 'connectyhub_api_access_guard' ->> 'paused_by' = 'connectyhub_api_access_guard'
    and keys.metadata -> 'connectyhub_api_access_guard' ->> 'allowed' = 'false'
  returning keys.id
)
update public.connectyhub_webhook_endpoints endpoints
set
  status = 'active',
  updated_at = now(),
  metadata = coalesce(endpoints.metadata, '{}'::jsonb) || jsonb_build_object(
    'connectyhub_api_access_guard',
    jsonb_build_object(
      'allowed', true,
      'reason', 'allowed',
      'status', null,
      'checked_at', now(),
      'paused_at', endpoints.metadata -> 'connectyhub_api_access_guard' ->> 'paused_at',
      'restored_at', now(),
      'paused_by', 'connectyhub_api_access_guard',
      'previous_status', endpoints.metadata -> 'connectyhub_api_access_guard' ->> 'previous_status'
    )
  )
from eligible_guarded_clients
where endpoints.client_id = eligible_guarded_clients.id
  and endpoints.status = 'paused'
  and endpoints.metadata -> 'connectyhub_api_access_guard' ->> 'paused_by' = 'connectyhub_api_access_guard'
  and endpoints.metadata -> 'connectyhub_api_access_guard' ->> 'allowed' = 'false';
