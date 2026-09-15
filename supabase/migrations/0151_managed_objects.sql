-- Isolated pilot only. No file bytes or real customer records are migrated here.
create table public.managed_objects (
 id uuid primary key, project_id uuid not null, organization_id uuid not null,
 name text not null check(length(name) between 1 and 120), bytes bigint not null check(bytes between 0 and 20971520),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','ready','deleting','deleted')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(project_id,organization_id) references public.managed_projects(id,organization_id)
);
create index managed_objects_project on public.managed_objects(project_id,status,created_at);
alter table public.managed_objects enable row level security;
revoke all on public.managed_objects from anon,authenticated;
grant select on public.managed_objects to authenticated;
grant all on public.managed_objects to service_role;
create policy managed_objects_read on public.managed_objects for select to authenticated using(public.can_access_managed_project(project_id));

-- Legacy bytea files and private objects share the same serialized project budget.
create function public.managed_file_storage_quota() returns trigger language plpgsql security definer set search_path='' as $$
declare lim bigint; used bigint;
begin
 select storage_limit_bytes into strict lim from public.managed_projects where id=new.project_id for update;
 select coalesce(sum(bytes),0) into used from public.managed_objects where project_id=new.project_id and status<>'deleted';
 select used+coalesce(sum(bytes),0) into used from public.managed_files where project_id=new.project_id and id<>new.id;
 if used+octet_length(new.content)>lim then raise exception 'storage_limit'; end if;
 return new;
end $$;
revoke all on function public.managed_file_storage_quota() from public;
create trigger managed_file_storage_quota before insert or update of content,project_id on public.managed_files for each row execute function public.managed_file_storage_quota();

create function public.managed_object_reserve(p_project uuid,p_object uuid,p_name text,p_bytes bigint,p_sha256 text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.managed_projects; o public.managed_objects; used bigint;
begin
 if not public.can_access_managed_project(p_project,true) then raise insufficient_privilege; end if;
 select * into strict p from public.managed_projects where id=p_project for update;
 if p.status<>'active' then raise exception 'project_not_active'; end if;
 select * into o from public.managed_objects where id=p_object;
 if o.id is not null then
  if o.project_id<>p.id or o.name<>p_name or o.bytes<>p_bytes or o.sha256<>p_sha256 or o.status not in ('pending','ready') then raise exception 'object_conflict'; end if;
  return to_jsonb(o);
 end if;
 if exists(select 1 from public.managed_files where id=p_object) then raise exception 'object_conflict'; end if;
 if (select count(*) from public.managed_objects where project_id=p.id)>=10000 then raise exception 'object_count_limit'; end if;
 select coalesce(sum(bytes),0) into used from public.managed_objects where project_id=p.id and status<>'deleted';
 select used+coalesce(sum(bytes),0) into used from public.managed_files where project_id=p.id;
 if used+p_bytes>p.storage_limit_bytes then raise exception 'storage_limit'; end if;
 insert into public.managed_objects(id,project_id,organization_id,name,bytes,sha256) values(p_object,p.id,p.organization_id,p_name,p_bytes,p_sha256) returning * into o;
 return to_jsonb(o);
end $$;
create function public.managed_object_delete_begin(p_project uuid,p_object uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.managed_objects;
begin
 if not public.can_access_managed_project(p_project,true) then raise insufficient_privilege; end if;
 perform 1 from public.managed_projects where id=p_project for update;
 select * into strict o from public.managed_objects where id=p_object and project_id=p_project for update;
 if o.status<>'deleted' then update public.managed_objects set status='deleting',updated_at=now() where id=o.id returning * into o; end if;
 return to_jsonb(o);
end $$;
-- Completion is exclusively for the backend after successful private object transport.
create function public.managed_object_complete(p_project uuid,p_object uuid,p_deleted boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare o public.managed_objects;
begin
 perform 1 from public.managed_projects where id=p_project for update;
 select * into strict o from public.managed_objects where id=p_object and project_id=p_project for update;
 if p_deleted then
  if o.status='deleted' then return true; end if;
  if o.status<>'deleting' then return false; end if;
  update public.managed_objects set status='deleted',updated_at=now() where id=o.id;
  if exists(select 1 from public.managed_usage where operation_id=o.id and unit='stored_bytes') then
   insert into public.managed_usage(project_id,organization_id,operation_id,unit,quantity) values(o.project_id,o.organization_id,o.id,'released_bytes',o.bytes);
  end if;
  insert into public.managed_logs(project_id,organization_id,code) values(o.project_id,o.organization_id,'file.deleted');
 else
  if o.status='ready' then return true; end if;
  if o.status<>'pending' then return false; end if;
  update public.managed_objects set status='ready',updated_at=now() where id=o.id;
  insert into public.managed_usage(project_id,organization_id,operation_id,unit,quantity) values(o.project_id,o.organization_id,o.id,'stored_bytes',o.bytes);
  insert into public.managed_logs(project_id,organization_id,code) values(o.project_id,o.organization_id,'file.created');
 end if;
 return true;
end $$;
revoke all on function public.managed_object_reserve(uuid,uuid,text,bigint,text),public.managed_object_delete_begin(uuid,uuid),public.managed_object_complete(uuid,uuid,boolean) from public;
grant execute on function public.managed_object_reserve(uuid,uuid,text,bigint,text),public.managed_object_delete_begin(uuid,uuid) to authenticated;
grant execute on function public.managed_object_complete(uuid,uuid,boolean) to service_role;
