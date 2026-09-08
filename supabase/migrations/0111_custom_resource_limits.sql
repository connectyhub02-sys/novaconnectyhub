create function public.accepted_custom_contract_terms(p_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a jsonb;t jsonb;
begin
 a:=public.resolve_organization_contract_access(p_org);
 if not coalesce((a->>'allowed')::boolean,false) then return null;end if;
 select metadata->'commercial_terms' into t from public.organization_subscriptions where id=(a->>'subscription_id')::uuid;
 return case when t->>'custom_contract_id' is not null then t else null end;
end $$;
revoke all on function public.accepted_custom_contract_terms(uuid) from public,anon,authenticated;
grant execute on function public.accepted_custom_contract_terms(uuid) to service_role;

create function public.enforce_custom_resource_limit() returns trigger language plpgsql security definer set search_path=public as $$
declare org uuid;root uuid;terms jsonb;lim integer;used integer;row jsonb:=to_jsonb(new);oldrow jsonb;
begin
 if tg_op='UPDATE' then oldrow:=to_jsonb(old);end if;
 org:=case when tg_table_name='organizations' then (row->>'billing_organization_id')::uuid else (row->>'organization_id')::uuid end;
 if org is null then return new;end if;
 select coalesce(billing_organization_id,id) into root from public.organizations where id=org;
 perform 1 from public.organizations where id=root for update;
 terms:=public.accepted_custom_contract_terms(root);
 if terms is null then return new;end if;
 if tg_table_name='organizations' then
  if row->>'status'='archived' then return new;end if;
  lim:=(terms#>>'{resource_limits,organization_limit}')::integer;
  select count(*) into used from public.organizations where (id=root or billing_organization_id=root) and status<>'archived' and id<>new.id;
 elsif tg_table_name='organization_members' then
  lim:=(terms#>>'{resource_limits,user_limit}')::integer;
  if exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where (o.id=root or o.billing_organization_id=root) and m.user_id=new.user_id and m.id<>new.id) then return new;end if;
  select count(distinct m.user_id) into used from public.organization_members m join public.organizations o on o.id=m.organization_id where (o.id=root or o.billing_organization_id=root) and m.id<>new.id;
 elsif tg_table_name='agent_registry' then
  if row->>'status'='archived' or row->>'scope'<>'organization' or row#>>'{metadata,client_created}'<>'true' then return new;end if;
  lim:=(terms#>>'{resource_limits,agent_limit}')::integer;
  select count(*) into used from public.agent_registry a join public.organizations o on o.id=a.organization_id where (o.id=root or o.billing_organization_id=root) and a.scope='organization' and a.status<>'archived' and a.metadata->>'client_created'='true' and a.id<>new.id;
 else
  if row->>'status'='archived' then return new;end if;
  lim:=(terms#>>'{resource_limits,whatsapp_instance_limit}')::integer;
  select count(*) into used from public.whatsapp_instances a join public.organizations o on o.id=a.organization_id where (o.id=root or o.billing_organization_id=root) and a.status<>'archived' and a.id<>new.id;
 end if;
 -- Existing resources keep their configuration on a downgrade. Only a new
 -- resource, a move, or a reactivation is constrained by the new capacity.
 if tg_op='UPDATE' and oldrow->>'organization_id' is not distinct from row->>'organization_id' and oldrow->>'user_id' is not distinct from row->>'user_id' and oldrow->>'billing_organization_id' is not distinct from row->>'billing_organization_id' and oldrow->>'status' is distinct from 'archived' then return new;end if;
 if lim is not null and used>=lim then raise exception 'Limite do contrato personalizado atingido: % de %.',used,lim;end if;
 return new;
end $$;
create trigger enforce_custom_resource_limit before insert or update of status,billing_organization_id on public.organizations for each row execute function public.enforce_custom_resource_limit();
create trigger enforce_custom_resource_limit before insert or update of organization_id,user_id on public.organization_members for each row execute function public.enforce_custom_resource_limit();
create trigger enforce_custom_resource_limit before insert or update of organization_id,status on public.agent_registry for each row execute function public.enforce_custom_resource_limit();
create trigger enforce_custom_resource_limit before insert or update of organization_id,status on public.whatsapp_instances for each row execute function public.enforce_custom_resource_limit();
revoke all on function public.enforce_custom_resource_limit() from public,anon,authenticated;

alter function public.get_organization_storage_entitlement(uuid) rename to get_organization_storage_entitlement_before_custom;
revoke all on function public.get_organization_storage_entitlement_before_custom(uuid) from public,anon,authenticated;
-- The outer function verifies access to the requested company. Allow its member
-- to read the billing account's capacity, without exposing the old RPC directly.
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('public.get_organization_storage_entitlement_before_custom(uuid)'::regprocedure);
 if position('or public.is_organization_member(o.id)' in definition)=0 then raise exception 'STORAGE_ENTITLEMENT_BASE_CHANGED';end if;
 execute replace(definition,'or public.is_organization_member(o.id)','or public.is_organization_member(o.id) or exists(select 1 from public.organizations child where child.billing_organization_id=o.id and public.is_organization_member(child.id))');
end $migration$;
create function public.get_organization_storage_entitlement(p_organization_id uuid)
returns table(organization_id uuid,plan_code text,plan_name text,plan_storage_limit_bytes bigint,plan_storage_file_limit integer,storage_image_max_bytes bigint,storage_video_max_bytes bigint,storage_file_max_bytes bigint,addon_storage_bytes bigint,addon_file_limit integer,total_storage_limit_bytes bigint,total_storage_file_limit integer)
language plpgsql stable security definer set search_path=public as $$
declare root uuid;t jsonb;e record;bytes bigint;files integer;
begin
 if auth.uid() is not null and not public.is_platform_admin() and not public.is_organization_member(p_organization_id) then return;end if;
 select coalesce(o.billing_organization_id,o.id) into root from public.organizations o where o.id=p_organization_id;
 t:=public.accepted_custom_contract_terms(root);
 select * into e from public.get_organization_storage_entitlement_before_custom(root);
 bytes:=coalesce((t#>>'{resource_limits,storage_limit_bytes}')::bigint,e.plan_storage_limit_bytes);
 files:=coalesce((t#>>'{resource_limits,storage_file_limit}')::integer,e.plan_storage_file_limit);
 return query select root,e.plan_code::text,coalesce(t->>'name',e.plan_name)::text,bytes,files,e.storage_image_max_bytes::bigint,e.storage_video_max_bytes::bigint,e.storage_file_max_bytes::bigint,e.addon_storage_bytes::bigint,e.addon_file_limit::integer,(bytes+e.addon_storage_bytes)::bigint,(files+e.addon_file_limit)::integer;
end $$;
revoke all on function public.get_organization_storage_entitlement(uuid) from public,anon;
grant execute on function public.get_organization_storage_entitlement(uuid) to authenticated,service_role;
