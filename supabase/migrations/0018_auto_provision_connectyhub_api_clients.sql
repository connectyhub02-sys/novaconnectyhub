-- Auto provision ConnectyHub API access for every customer workspace.
-- Every organization gets an API client record; WhatsApp instances only become API-controlled when explicitly created/adopted for API use.

create or replace function public.ensure_connectyhub_api_client_for_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_slug text;
  owner_email text;
begin
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

  select profiles.email
    into owner_email
  from public.profiles
  where profiles.id = new.owner_id
  limit 1;

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

drop trigger if exists trg_ensure_connectyhub_api_client_for_organization on public.organizations;
create trigger trg_ensure_connectyhub_api_client_for_organization
after insert on public.organizations
for each row execute function public.ensure_connectyhub_api_client_for_organization();

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
  organizations.id,
  concat(coalesce(nullif(organizations.name, ''), 'Workspace'), ' API WhatsApp') as name,
  left(
    concat(
      coalesce(
        nullif(trim(both '-' from regexp_replace(lower(coalesce(nullif(organizations.slug, ''), nullif(organizations.name, ''), 'workspace')), '[^a-z0-9]+', '-', 'g')), ''),
        'workspace'
      ),
      '-api-',
      replace(organizations.id::text, '-', '')
    ),
    96
  ) as slug,
  profiles.email as contact_email,
  'api_starter' as plan_code,
  organizations.owner_id as created_by,
  jsonb_build_object(
    'created_from', 'organization_backfill',
    'auto_provisioned_at', now()
  ) as metadata
from public.organizations
left join public.profiles
  on profiles.id = organizations.owner_id
where not exists (
  select 1
  from public.connectyhub_api_clients clients
  where clients.organization_id = organizations.id
    and clients.status <> 'archived'
);
