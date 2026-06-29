-- Keep ConnectyHub as API provider, not as a customer of its own API.
-- Every non-platform customer workspace receives an API client automatically.

create or replace function public.ensure_connectyhub_api_client_for_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_slug text;
  owner_email text;
  owner_is_platform_admin boolean := false;
begin
  select profiles.email, coalesce(profiles.is_platform_admin, false)
    into owner_email, owner_is_platform_admin
  from public.profiles
  where profiles.id = new.owner_id
  limit 1;

  if owner_is_platform_admin then
    return new;
  end if;

  if exists (
    select 1
    from public.connectyhub_api_clients clients
    where clients.organization_id = new.id
      and clients.status <> 'archived'
  ) then
    return new;
  end if;

  normalized_slug := regexp_replace(
    lower(coalesce(nullif(new.slug, ''), nullif(new.name, ''), 'workspace')),
    '[^a-z0-9]+',
    '-',
    'g'
  );
  normalized_slug := trim(both '-' from normalized_slug);

  insert into public.connectyhub_api_clients (
    organization_id,
    name,
    slug,
    contact_email,
    plan_code,
    created_by,
    metadata
  )
  values (
    new.id,
    concat(coalesce(nullif(new.name, ''), 'Workspace'), ' API WhatsApp'),
    left(concat(coalesce(nullif(normalized_slug, ''), 'workspace'), '-api-', replace(new.id::text, '-', '')), 96),
    owner_email,
    'api_starter',
    new.owner_id,
    jsonb_build_object(
      'created_from', 'organization_auto_provision',
      'auto_provisioned_at', now()
    )
  );

  return new;
end;
$$;

with customer_organizations as (
  select distinct on (organizations.owner_id)
    organizations.id
  from public.organizations
  join auth.users users
    on users.id = organizations.owner_id
  left join public.profiles profiles
    on profiles.id = organizations.owner_id
  where coalesce(profiles.is_platform_admin, false) = false
  order by organizations.owner_id, organizations.created_at asc, organizations.id
),
ranked_clients as (
  select
    clients.id,
    clients.organization_id,
    row_number() over (
      partition by clients.organization_id
      order by clients.created_at asc, clients.id
    ) as client_rank
  from public.connectyhub_api_clients clients
  where clients.status <> 'archived'
)
update public.connectyhub_api_clients clients
set
  status = 'archived',
  updated_at = now(),
  metadata = coalesce(clients.metadata, '{}'::jsonb) || jsonb_build_object(
    'archived_from', 'customer_api_scope_cleanup',
    'archived_at', now()
  )
from ranked_clients
left join customer_organizations
  on customer_organizations.id = ranked_clients.organization_id
where clients.id = ranked_clients.id
  and (
    customer_organizations.id is null
    or ranked_clients.client_rank > 1
  );

insert into public.connectyhub_api_clients (
  organization_id,
  name,
  slug,
  contact_email,
  plan_code,
  created_by,
  metadata
)
select
  customer_organizations.id,
  concat(coalesce(nullif(customer_organizations.name, ''), 'Workspace'), ' API WhatsApp') as name,
  left(
    concat(
      coalesce(
        nullif(trim(both '-' from regexp_replace(lower(coalesce(nullif(customer_organizations.slug, ''), nullif(customer_organizations.name, ''), 'workspace')), '[^a-z0-9]+', '-', 'g')), ''),
        'workspace'
      ),
      '-api-',
      replace(customer_organizations.id::text, '-', '')
    ),
    96
  ) as slug,
  customer_organizations.email as contact_email,
  'api_starter' as plan_code,
  customer_organizations.owner_id as created_by,
  jsonb_build_object(
    'created_from', 'organization_backfill',
    'auto_provisioned_at', now()
  ) as metadata
from (
  select distinct on (organizations.owner_id)
    organizations.id,
    organizations.name,
    organizations.slug,
    organizations.owner_id,
    profiles.email
  from public.organizations
  join auth.users users
    on users.id = organizations.owner_id
  left join public.profiles profiles
    on profiles.id = organizations.owner_id
  where coalesce(profiles.is_platform_admin, false) = false
  order by organizations.owner_id, organizations.created_at asc, organizations.id
) customer_organizations
where customer_organizations.id is not null
  and not exists (
    select 1
    from public.connectyhub_api_clients clients
    where clients.organization_id = customer_organizations.id
      and clients.status <> 'archived'
  );
