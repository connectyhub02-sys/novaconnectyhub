-- One dedicated Inngest app per managed project. Never bind a shared multi-client app.
create table public.managed_inngest_bindings (
 project_id uuid primary key references public.managed_projects(id) on delete cascade,
 app_id uuid not null unique,
 created_at timestamptz not null default now()
);
alter table public.managed_inngest_bindings enable row level security;
create policy managed_engine_read on public.managed_inngest_bindings for select to authenticated
 using(public.can_access_managed_project(project_id,false));
create policy managed_engine_admin on public.managed_inngest_bindings for all to authenticated
 using(public.is_infrastructure_admin()) with check(public.is_infrastructure_admin());
grant select,insert,update,delete on public.managed_inngest_bindings to authenticated,service_role;
