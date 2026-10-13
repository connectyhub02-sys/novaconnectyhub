-- Hosting is assigned manually by platform administrators. No tenant table grants.
alter table public.infra_projects add column binding_revision integer not null default 0;

create function public.infra_save_customer_binding(p_project text, p_organization uuid,
  p_visible boolean, p_revision integer, p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.infra_projects; fresh public.infra_projects;
begin
  if not exists(select 1 from public.profiles where id=p_actor and is_platform_admin) then
    raise exception 'platform_admin_required';
  end if;
  select * into old from public.infra_projects where id=p_project for update;
  if not found then raise exception 'project_missing'; end if;
  if old.binding_revision <> p_revision then raise exception 'binding_conflict'; end if;
  if p_visible is null or (p_visible and p_organization is null) then raise exception 'binding_invalid'; end if;
  if p_project='connectyhub' and p_organization is not null then raise exception 'shared_platform'; end if;
  if p_organization is not null and not exists(select 1 from public.organizations
    where id=p_organization and status <> 'archived' and plan_code <> 'internal') then
    raise exception 'customer_missing';
  end if;
  update public.infra_projects set organization_id=p_organization,client_access_enabled=p_visible,
    binding_revision=binding_revision+1 where id=p_project returning * into fresh;
  insert into public.infra_audit(project_id,actor,action,result,reason,before_state,after_state)
    values(p_project,p_actor::text,'customer_binding','completed','manual_admin_assignment',
      jsonb_build_object('organizationId',old.organization_id,'visible',old.client_access_enabled),
      jsonb_build_object('organizationId',fresh.organization_id,'visible',fresh.client_access_enabled));
  return to_jsonb(fresh);
end $$;

create function public.infra_register_project(p_project text,p_name text,p_actor uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.profiles where id=p_actor and is_platform_admin) then
    raise exception 'platform_admin_required';
  end if;
  if p_project is null or p_project !~ '^[a-z0-9][a-z0-9-]{1,63}$' or p_name is null or length(trim(p_name)) not between 2 and 100 then
    raise exception 'project_invalid';
  end if;
  insert into public.infra_projects(id,name,company,environment,topology,app,supabase,inngest,worker,storage)
    values(p_project,trim(p_name),trim(p_name),'A configurar','unknown','A configurar','A configurar','A configurar','A configurar','A configurar');
  insert into public.infra_audit(project_id,actor,action,result,reason)
    values(p_project,p_actor::text,'project_register','completed','inventory_only_no_provisioning');
end $$;
revoke all on function public.infra_save_customer_binding(text,uuid,boolean,integer,uuid) from public,anon,authenticated;
revoke all on function public.infra_register_project(text,text,uuid) from public,anon,authenticated;
grant execute on function public.infra_save_customer_binding(text,uuid,boolean,integer,uuid) to service_role;
grant execute on function public.infra_register_project(text,text,uuid) to service_role;
notify pgrst,'reload schema';
