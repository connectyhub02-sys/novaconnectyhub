-- Portal database only; production is never altered by this migration.
begin;
do $$ begin if current_database()<>'managed_portal' then raise exception 'Wrong database'; end if; end $$;
create table public.portal_source_connections (
 project_id uuid primary key references public.managed_projects(id),
 source_key text not null unique check(source_key='connectyhub-production'),
 source_organization_id uuid not null,
 source_name text not null,
 collected_at timestamptz,
 attempted_at timestamptz,
 collection_status text not null default 'pending' check(collection_status in ('pending','ok','failed')),
 snapshot jsonb,
 check(snapshot is null or octet_length(snapshot::text)<524288)
);
alter table public.portal_source_connections enable row level security;
revoke all on public.portal_source_connections from public,anon,authenticated,service_role;
grant select on public.portal_source_connections to authenticated;
create policy portal_sources_admin on public.portal_source_connections for select to authenticated using(public.is_infrastructure_admin());

-- SECURITY DEFINER lets the guard see the binding even when caller cannot read it.
create function public.portal_is_connected_project(p_project uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.portal_source_connections where project_id=p_project);
$$;
revoke all on function public.portal_is_connected_project(uuid) from public;
grant execute on function public.portal_is_connected_project(uuid) to authenticated,service_role;
create policy portal_connected_admin_only on public.managed_projects as restrictive for select to authenticated
 using(not public.portal_is_connected_project(id) or public.is_infrastructure_admin());
create or replace function public.can_access_managed_project(p_project uuid,p_write boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.managed_projects target where target.id=p_project
 and (not p_write or target.status='active')
 and (not public.portal_is_connected_project(p_project) or (not p_write and public.is_infrastructure_admin()))
 and (public.is_infrastructure_admin() or exists(
 select 1 from public.managed_project_members m join public.organization_members om on om.organization_id=m.organization_id and om.user_id=m.user_id
 where m.project_id=p_project and m.user_id=auth.uid() and (not p_write or m.role='operator'))));
$$;
commit;
