create extension if not exists pgcrypto;

do $do$
begin
  create type public.organization_role as enum ('owner', 'admin', 'manager', 'member');
exception when duplicate_object then null;
end $do$;

do $do$
begin
  create type public.credential_scope as enum ('platform', 'organization');
exception when duplicate_object then null;
end $do$;

do $do$
begin
  create type public.credential_kind as enum ('secret', 'public', 'endpoint', 'identifier');
exception when duplicate_object then null;
end $do$;

do $do$
begin
  create type public.credential_requirement as enum ('required', 'recommended', 'optional');
exception when duplicate_object then null;
end $do$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  company_name text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  owner_id uuid references auth.users(id) on delete set null,
  plan_code text not null default 'starter',
  status text not null default 'trial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null default 'owner',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  scope public.credential_scope not null default 'platform',
  organization_id uuid references public.organizations(id) on delete cascade,
  integration_id text not null,
  env_name text not null,
  label text not null,
  kind public.credential_kind not null default 'secret',
  requirement public.credential_requirement not null default 'optional',
  encrypted_value text not null,
  value_preview text not null,
  value_hash text not null,
  configured_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  target_table text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_integration_credentials_platform
  on public.integration_credentials (scope, integration_id, env_name, created_at desc);

create index if not exists idx_integration_credentials_org
  on public.integration_credentials (organization_id, integration_id, env_name, created_at desc);

create index if not exists idx_maintenance_audit_logs_created
  on public.maintenance_audit_logs (created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_organizations_updated_at on public.organizations;
create trigger touch_organizations_updated_at
before update on public.organizations
for each row execute function public.touch_updated_at();

drop trigger if exists touch_integration_credentials_updated_at on public.integration_credentials;
create trigger touch_integration_credentials_updated_at
before update on public.integration_credentials
for each row execute function public.touch_updated_at();

alter table public.profiles
add column if not exists phone text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, email, full_name, phone, company_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'company_name'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    phone = coalesce(public.profiles.phone, excluded.phone),
    company_name = coalesce(public.profiles.company_name, excluded.company_name),
    updated_at = now();

  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_platform_admin(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.profiles
    where id = check_user
      and is_platform_admin = true
  );
$fn$;

create or replace function public.is_organization_admin(check_org uuid, check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.organization_members
    where organization_id = check_org
      and user_id = check_user
      and role in ('owner', 'admin')
  );
$fn$;

create or replace function public.is_organization_member(check_org uuid, check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.organization_members
    where organization_id = check_org
      and user_id = check_user
  );
$fn$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.integration_credentials enable row level security;
alter table public.maintenance_audit_logs enable row level security;

drop policy if exists "profiles read own or platform admin" on public.profiles;
create policy "profiles read own or platform admin"
on public.profiles for select
using (id = auth.uid() or public.is_platform_admin());

drop policy if exists "profiles update own or platform admin" on public.profiles;
create policy "profiles update own or platform admin"
on public.profiles for update
using (id = auth.uid() or public.is_platform_admin())
with check (id = auth.uid() or public.is_platform_admin());

drop policy if exists "organizations visible to members or platform admin" on public.organizations;
create policy "organizations visible to members or platform admin"
on public.organizations for select
using (public.is_platform_admin() or public.is_organization_member(id));

drop policy if exists "organizations managed by owners or platform admin" on public.organizations;
create policy "organizations managed by owners or platform admin"
on public.organizations for all
using (public.is_platform_admin() or public.is_organization_admin(id))
with check (public.is_platform_admin() or owner_id = auth.uid());

drop policy if exists "organizations inserted by owner or platform admin" on public.organizations;
create policy "organizations inserted by owner or platform admin"
on public.organizations for insert
with check (public.is_platform_admin() or owner_id = auth.uid());

drop policy if exists "members visible to org members or platform admin" on public.organization_members;
create policy "members visible to org members or platform admin"
on public.organization_members for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "members managed by org admins or platform admin" on public.organization_members;
create policy "members managed by org admins or platform admin"
on public.organization_members for all
using (public.is_platform_admin() or public.is_organization_admin(organization_id))
with check (public.is_platform_admin() or public.is_organization_admin(organization_id));

drop policy if exists "members inserted by self owner or platform admin" on public.organization_members;
create policy "members inserted by self owner or platform admin"
on public.organization_members for insert
with check (
  public.is_platform_admin()
  or (user_id = auth.uid() and role = 'owner')
);

drop policy if exists "platform credentials for platform admins" on public.integration_credentials;
create policy "platform credentials for platform admins"
on public.integration_credentials for all
using (scope = 'platform' and public.is_platform_admin())
with check (scope = 'platform' and public.is_platform_admin());

drop policy if exists "organization credentials for org admins" on public.integration_credentials;
create policy "organization credentials for org admins"
on public.integration_credentials for all
using (scope = 'organization' and public.is_organization_admin(organization_id))
with check (scope = 'organization' and public.is_organization_admin(organization_id));

drop policy if exists "audit logs visible to platform admins" on public.maintenance_audit_logs;
create policy "audit logs visible to platform admins"
on public.maintenance_audit_logs for select
using (public.is_platform_admin());

drop policy if exists "audit logs insert by authenticated users" on public.maintenance_audit_logs;
create policy "audit logs insert by authenticated users"
on public.maintenance_audit_logs for insert
with check (auth.uid() is not null);

insert into public.profiles (id, email, is_platform_admin)
select id, email, true
from auth.users
where lower(email) = lower('connectyhub01@gmail.com')
on conflict (id) do update
set
  email = excluded.email,
  is_platform_admin = true,
  updated_at = now();
