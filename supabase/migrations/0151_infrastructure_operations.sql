-- Internal administration only. Tenant visibility is deliberately disabled.
alter table public.infra_projects add column organization_id uuid references public.organizations(id);
alter table public.infra_projects add column client_access_enabled boolean not null default false;
insert into public.infra_projects(id,name,company,environment,topology,app,supabase,inngest,worker,storage)
values ('hora-space','Hora Space','Hora Space','A confirmar','unknown','A confirmar','A confirmar','A confirmar','A confirmar','A confirmar') on conflict(id) do nothing;

-- Immutable versioned SQL. Only the authenticated admin API may call this RPC
-- with service_role after its platform-admin + infra-admin + origin checks.
create function public.infra_prepare_migration(p_project text,p_version text,p_name text,p_sql text,p_checksum text,p_actor text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_version !~ '^[0-9]{4,20}$' or p_name !~ '^[a-zA-Z0-9_-]{1,100}$' or octet_length(p_sql) > 60000 or p_checksum !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_migration';
  end if;
  insert into public.infra_migrations(project_id,version,name,sql,checksum) values(p_project,p_version,p_name,p_sql,p_checksum);
  insert into public.infra_audit(project_id,actor,action,target,result,reason,after_state)
  values(p_project,p_actor,'migration_prepare',p_version,'prepared','review_required',jsonb_build_object('version',p_version,'checksum',p_checksum));
end $$;
revoke all on function public.infra_prepare_migration(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.infra_prepare_migration(text,text,text,text,text,text) to service_role;

-- Read-only operational evidence; never expose customer rows or database secrets.
create function public.infra_database_status()
returns jsonb language sql security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object(
  'applied', (select coalesce(jsonb_agg(version order by version),'[]'::jsonb) from supabase_migrations.schema_migrations),
  'tables', (select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'health','healthy','rls',case when c.relrowsecurity then 'enabled' else 'disabled' end,'permissions','unknown')),'[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('profiles','organizations','infra_projects','infra_audit'))
 );
$$;
revoke all on function public.infra_database_status() from public,anon,authenticated;
grant execute on function public.infra_database_status() to service_role;
notify pgrst, 'reload schema';
