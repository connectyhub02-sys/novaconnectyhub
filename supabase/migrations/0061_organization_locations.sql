-- Company locations used by WhatsApp agents when leads ask where the business is.

create table if not exists public.organization_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null default 'Unidade principal',
  address text,
  cep text,
  city text,
  region text,
  maps_url text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  is_primary boolean not null default false,
  status text not null default 'active',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_locations_status_check
    check (status in ('active', 'inactive', 'archived')),
  constraint organization_locations_latitude_check
    check (latitude is null or (latitude >= -90 and latitude <= 90)),
  constraint organization_locations_longitude_check
    check (longitude is null or (longitude >= -180 and longitude <= 180))
);

create index if not exists idx_organization_locations_org_status
  on public.organization_locations (organization_id, status, is_primary desc, created_at asc);

create unique index if not exists idx_organization_locations_one_primary
  on public.organization_locations (organization_id)
  where is_primary = true and status = 'active';

drop trigger if exists trg_organization_locations_updated_at on public.organization_locations;
create trigger trg_organization_locations_updated_at
before update on public.organization_locations
for each row execute function public.touch_updated_at();

alter table public.organization_locations enable row level security;

drop policy if exists "organization locations visible by organization" on public.organization_locations;
create policy "organization locations visible by organization"
on public.organization_locations for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "organization locations managed by organization admins" on public.organization_locations;
create policy "organization locations managed by organization admins"
on public.organization_locations for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);
