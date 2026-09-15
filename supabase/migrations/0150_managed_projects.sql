-- Prepared for isolated rehearsal only. No existing projects/users are enrolled.
create table public.infrastructure_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 granted_at timestamptz not null default now(), granted_by uuid references auth.users(id)
);
alter table public.infrastructure_admins enable row level security;
revoke all on public.infrastructure_admins from anon, authenticated;

create function public.is_infrastructure_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.infrastructure_admins where user_id=auth.uid());
$$;
revoke all on function public.is_infrastructure_admin() from public;
grant execute on function public.is_infrastructure_admin() to authenticated;

create table public.managed_projects (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null check(length(name) between 1 and 100), slug text not null check(slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
 status text not null default 'draft' check(status in ('draft','active','paused')),
 concurrency_limit integer not null default 1 check(concurrency_limit between 1 and 8),
 queue_limit integer not null default 100 check(queue_limit between 1 and 10000),
 storage_limit_bytes bigint not null default 10485760 check(storage_limit_bytes between 0 and 1073741824),
 created_at timestamptz not null default now(), unique(organization_id,slug), unique(id,organization_id)
);
create table public.managed_project_members (
 project_id uuid not null, organization_id uuid not null, user_id uuid not null references auth.users(id),
 role text not null check(role in ('viewer','operator')), primary key(project_id,user_id),
 foreign key(project_id,organization_id) references public.managed_projects(id,organization_id) on delete cascade
);
create function public.can_access_managed_project(p_project uuid, p_write boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.managed_projects target where target.id=p_project and (not p_write or target.status='active') and (public.is_infrastructure_admin() or exists(
 select 1 from public.managed_project_members m
 join public.organization_members om on om.organization_id=m.organization_id and om.user_id=m.user_id
 join public.managed_projects p on p.id=m.project_id
 where m.project_id=p_project and m.user_id=auth.uid() and (not p_write or (m.role='operator' and p.status='active')))));
$$;
revoke all on function public.can_access_managed_project(uuid,boolean) from public;
grant execute on function public.can_access_managed_project(uuid,boolean) to authenticated;

create function public.managed_companies() returns table(id uuid,name text)
language sql stable security definer set search_path='' as $$
 select o.id,o.name from public.organizations o where public.is_infrastructure_admin() or exists(
 select 1 from public.managed_projects p where p.organization_id=o.id and public.can_access_managed_project(p.id)) order by o.name;
$$;
revoke all on function public.managed_companies() from public;
grant execute on function public.managed_companies() to authenticated;

create table public.managed_records (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, organization_id uuid not null,
 collection text not null check(collection ~ '^[a-z][a-z0-9_]{0,47}$'),
 data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=16384),
 created_at timestamptz not null default now(),
 foreign key(project_id,organization_id) references public.managed_projects(id,organization_id) on delete cascade
);
create index managed_records_project on public.managed_records(project_id,collection,created_at desc);
create function public.managed_record_quota() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.managed_projects where id=new.project_id for update;
 if (select count(*) from public.managed_records where project_id=new.project_id and id<>new.id)>=10000 then raise exception 'record_limit'; end if;
 return new;
end $$;
revoke all on function public.managed_record_quota() from public;
create trigger managed_record_quota before insert or update of project_id on public.managed_records for each row execute function public.managed_record_quota();

-- Existing API projects remain owned by their original organization and wallet.
create unique index managed_ai_project_org on public.ai_projects(id,organization_id);
create unique index managed_voice_project_org on public.voice_projects(id,organization_id);
create table public.managed_resource_links (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, organization_id uuid not null,
 ai_project_id uuid unique, voice_project_id uuid unique,
 check(num_nonnulls(ai_project_id,voice_project_id)=1),
 foreign key(project_id,organization_id) references public.managed_projects(id,organization_id),
 foreign key(ai_project_id,organization_id) references public.ai_projects(id,organization_id),
 foreign key(voice_project_id,organization_id) references public.voice_projects(id,organization_id)
);
alter table public.managed_resource_links enable row level security;
revoke all on public.managed_resource_links from anon,authenticated;
grant select,insert,delete on public.managed_resource_links to authenticated;
grant all on public.managed_resource_links to service_role;
create policy managed_links_read on public.managed_resource_links for select to authenticated using(public.can_access_managed_project(project_id));
create policy managed_links_insert on public.managed_resource_links for insert to authenticated with check(public.is_infrastructure_admin());
create policy managed_links_delete on public.managed_resource_links for delete to authenticated using(public.is_infrastructure_admin());
-- Small private files for the isolated pilot. Object-storage adapter is a later release.
create table public.managed_files (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, organization_id uuid not null,
 name text not null check(length(name) between 1 and 120), content bytea not null check(octet_length(content)<=1048576),
 bytes bigint generated always as (octet_length(content)) stored, created_at timestamptz not null default now(),
 foreign key(project_id,organization_id) references public.managed_projects(id,organization_id) on delete cascade
);
create table public.managed_jobs (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, organization_id uuid not null,
 kind text not null check(kind='diagnostic.ping'), idempotency_key text not null check(length(idempotency_key) between 1 and 100),
 status text not null default 'queued' check(status in ('queued','running','succeeded','failed','uncertain')),
 created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
 worker_id uuid, lease_token uuid, lease_until timestamptz, result_code text,
 unique(project_id,idempotency_key),
 foreign key(project_id,organization_id) references public.managed_projects(id,organization_id) on delete cascade
);
create index managed_jobs_queue on public.managed_jobs(project_id,status,created_at);
create table public.managed_logs (
 id bigint generated always as identity primary key, project_id uuid not null, organization_id uuid not null,
 job_id uuid references public.managed_jobs(id), code text not null check(code in ('job.queued','job.started','job.succeeded','job.failed','job.uncertain','file.created','file.deleted')),
 created_at timestamptz not null default now(),
 foreign key(project_id,organization_id) references public.managed_projects(id,organization_id) on delete cascade
);
create table public.managed_usage (
 id bigint generated always as identity primary key, project_id uuid not null, organization_id uuid not null,
 operation_id uuid not null, unit text not null check(unit in ('job','stored_bytes','released_bytes')), quantity bigint not null check(quantity>=0),
 created_at timestamptz not null default now(), unique(operation_id,unit),
 foreign key(project_id,organization_id) references public.managed_projects(id,organization_id) on delete cascade
);
-- Worker enrollments and host telemetry never belong to a product administrator by implication.
create table public.managed_workers (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.managed_projects(id),
 key_hash text not null unique check(key_hash ~ '^[a-f0-9]{64}$'), enabled boolean not null default true,
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
create table public.infrastructure_samples (
 id bigint generated always as identity primary key, measured_at timestamptz not null unique,
 cpu_percent numeric check(cpu_percent between 0 and 100), memory_total bigint not null check(memory_total>0),
 memory_available bigint not null check(memory_available>=0 and memory_available<=memory_total),
 disk_total bigint not null check(disk_total>0), disk_used bigint not null check(disk_used>=0 and disk_used<=disk_total),
 network_rx_bytes bigint check(network_rx_bytes>=0), network_tx_bytes bigint check(network_tx_bytes>=0),
 services jsonb not null default '[]' check(jsonb_typeof(services)='array' and octet_length(services::text)<16384)
);
create table public.infrastructure_alert_settings (
 id boolean primary key default true check(id), cpu_percent integer not null default 85 check(cpu_percent between 1 and 100),
 memory_percent integer not null default 85 check(memory_percent between 1 and 100),
 disk_percent integer not null default 80 check(disk_percent between 1 and 100),
 stale_seconds integer not null default 300 check(stale_seconds between 30 and 86400)
);
insert into public.infrastructure_alert_settings(id) values(true);

alter table public.managed_projects enable row level security;
alter table public.managed_project_members enable row level security;
alter table public.managed_records enable row level security;
alter table public.managed_files enable row level security;
alter table public.managed_jobs enable row level security;
alter table public.managed_logs enable row level security;
alter table public.managed_usage enable row level security;
alter table public.managed_workers enable row level security;
alter table public.infrastructure_samples enable row level security;
alter table public.infrastructure_alert_settings enable row level security;
revoke all on public.managed_projects, public.managed_project_members, public.managed_records, public.managed_files,
 public.managed_jobs,public.managed_logs,public.managed_usage,public.managed_workers,public.infrastructure_samples,public.infrastructure_alert_settings from anon,authenticated;
grant select,insert,update on public.managed_projects to authenticated;
grant select,insert,update,delete on public.managed_project_members to authenticated;
grant select,insert,update,delete on public.managed_records to authenticated;
grant select(id,project_id,organization_id,name,bytes,created_at) on public.managed_files to authenticated;
grant select(id,project_id,organization_id,kind,status,created_at,started_at,finished_at,result_code) on public.managed_jobs to authenticated;
grant select on public.managed_logs,public.managed_usage,public.infrastructure_samples to authenticated;
grant select,update on public.infrastructure_alert_settings to authenticated;
create policy managed_projects_read on public.managed_projects for select to authenticated using(public.can_access_managed_project(id));
create policy managed_projects_create on public.managed_projects for insert to authenticated with check(public.is_infrastructure_admin());
create policy managed_projects_update on public.managed_projects for update to authenticated using(public.is_infrastructure_admin()) with check(public.is_infrastructure_admin());
create policy managed_members_read on public.managed_project_members for select to authenticated using(public.can_access_managed_project(project_id));
create policy managed_members_manage on public.managed_project_members for all to authenticated using(public.is_infrastructure_admin()) with check(public.is_infrastructure_admin() and exists(select 1 from public.organization_members m where m.user_id=managed_project_members.user_id and m.organization_id=managed_project_members.organization_id));
create policy managed_records_read on public.managed_records for select to authenticated using(public.can_access_managed_project(project_id));
create policy managed_records_insert on public.managed_records for insert to authenticated with check(public.can_access_managed_project(project_id,true));
create policy managed_records_update on public.managed_records for update to authenticated using(public.can_access_managed_project(project_id,true)) with check(public.can_access_managed_project(project_id,true));
create policy managed_records_delete on public.managed_records for delete to authenticated using(public.can_access_managed_project(project_id,true));
create policy managed_files_read on public.managed_files for select to authenticated using(public.can_access_managed_project(project_id));
create policy managed_jobs_read on public.managed_jobs for select to authenticated using(public.can_access_managed_project(project_id));
create policy managed_logs_read on public.managed_logs for select to authenticated using(public.can_access_managed_project(project_id));
create policy managed_usage_read on public.managed_usage for select to authenticated using(public.can_access_managed_project(project_id));
create policy infrastructure_samples_read on public.infrastructure_samples for select to authenticated using(public.is_infrastructure_admin());
create policy infrastructure_alerts_manage on public.infrastructure_alert_settings for all to authenticated using(public.is_infrastructure_admin()) with check(public.is_infrastructure_admin());

create function public.managed_enqueue(p_project uuid,p_idempotency text) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.managed_projects; j uuid;
begin
 if not public.can_access_managed_project(p_project,true) then raise insufficient_privilege; end if;
 select * into strict p from public.managed_projects where id=p_project for update;
 if p.status<>'active' then raise exception 'project_not_active'; end if;
 select id into j from public.managed_jobs where project_id=p.id and idempotency_key=p_idempotency;
 if j is not null then return j; end if;
 if (select count(*) from public.managed_jobs where project_id=p.id and status in ('queued','running'))>=p.queue_limit then raise exception 'queue_limit'; end if;
 insert into public.managed_jobs(project_id,organization_id,kind,idempotency_key) values(p.id,p.organization_id,'diagnostic.ping',p_idempotency) returning id into j;
 insert into public.managed_logs(project_id,organization_id,job_id,code) values(p.id,p.organization_id,j,'job.queued');
 return j;
end $$;

create function public.managed_put_file(p_project uuid,p_name text,p_base64 text) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.managed_projects; b bytea; f uuid;
begin
 if not public.can_access_managed_project(p_project,true) then raise insufficient_privilege; end if;
 if length(p_base64)>1398104 then raise exception 'file_too_large'; end if;
 b:=decode(p_base64,'base64');
 if octet_length(b)>1048576 then raise exception 'file_too_large'; end if;
 select * into strict p from public.managed_projects where id=p_project for update;
 if p.status<>'active' then raise exception 'project_not_active'; end if;
 if (select coalesce(sum(bytes),0) from public.managed_files where project_id=p.id)+octet_length(b)>p.storage_limit_bytes then raise exception 'storage_limit'; end if;
 insert into public.managed_files(project_id,organization_id,name,content) values(p.id,p.organization_id,p_name,b) returning id into f;
 insert into public.managed_usage(project_id,organization_id,operation_id,unit,quantity) values(p.id,p.organization_id,f,'stored_bytes',octet_length(b));
 insert into public.managed_logs(project_id,organization_id,code) values(p.id,p.organization_id,'file.created');
 return f;
end $$;
create function public.managed_read_file(p_project uuid,p_file uuid) returns text
language plpgsql security definer set search_path='' as $$
begin
 if not public.can_access_managed_project(p_project) then raise insufficient_privilege; end if;
 return (select encode(content,'base64') from public.managed_files where id=p_file and project_id=p_project);
end $$;
create function public.managed_delete_file(p_project uuid,p_file uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare p public.managed_projects; n bigint;
begin
 if not public.can_access_managed_project(p_project,true) then raise insufficient_privilege; end if;
 select * into strict p from public.managed_projects where id=p_project for update;
 delete from public.managed_files where id=p_file and project_id=p_project returning bytes into n;
 if n is null then return false; end if;
 insert into public.managed_usage(project_id,organization_id,operation_id,unit,quantity) values(p.id,p.organization_id,p_file,'released_bytes',n);
 insert into public.managed_logs(project_id,organization_id,code) values(p.id,p.organization_id,'file.deleted');
 return true;
end $$;

-- Only the internal gateway may call these routines. Enrollment is explicit and project-bound.
create function public.managed_claim(p_worker_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.managed_workers; p public.managed_projects; j public.managed_jobs; t uuid;
begin
 select * into strict w from public.managed_workers where key_hash=p_worker_hash and enabled and expires_at>now();
 select * into strict p from public.managed_projects where id=w.project_id for update;
 if p.status<>'active' then return null; end if;
 with expired as (update public.managed_jobs set status='uncertain',finished_at=now(),result_code='lease.expired',lease_token=null
 where project_id=p.id and status='running' and lease_until<=now() returning id)
 insert into public.managed_logs(project_id,organization_id,job_id,code) select p.id,p.organization_id,id,'job.uncertain' from expired;
 if (select count(*) from public.managed_jobs where project_id=p.id and status='running')>=p.concurrency_limit then return null; end if;
 select * into j from public.managed_jobs where project_id=p.id and status='queued' order by created_at,id limit 1 for update skip locked;
 if j.id is null then return null; end if;
 t:=gen_random_uuid();
 update public.managed_jobs set status='running',worker_id=w.id,lease_token=t,lease_until=now()+interval '60 seconds',started_at=now() where id=j.id;
 insert into public.managed_logs(project_id,organization_id,job_id,code) values(p.id,p.organization_id,j.id,'job.started');
 return jsonb_build_object('id',j.id,'project_id',p.id,'kind',j.kind,'lease_token',t,'lease_seconds',60);
end $$;
create function public.managed_finish(p_worker_hash text,p_job uuid,p_token uuid,p_success boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare w public.managed_workers; j public.managed_jobs;
begin
 select * into strict w from public.managed_workers where key_hash=p_worker_hash and enabled and expires_at>now();
 update public.managed_jobs set status=case when p_success then 'succeeded' else 'failed' end,finished_at=now(),result_code=case when p_success then 'diagnostic.ok' else 'diagnostic.failed' end,lease_token=null
 where id=p_job and project_id=w.project_id and worker_id=w.id and lease_token=p_token and lease_until>now() and status='running' returning * into j;
 if j.id is null then return false; end if;
 insert into public.managed_logs(project_id,organization_id,job_id,code) values(j.project_id,j.organization_id,j.id,case when p_success then 'job.succeeded' else 'job.failed' end);
 insert into public.managed_usage(project_id,organization_id,operation_id,unit,quantity) values(j.project_id,j.organization_id,j.id,'job',1);
 return true;
end $$;
revoke all on function public.managed_enqueue(uuid,text), public.managed_put_file(uuid,text,text),public.managed_read_file(uuid,uuid),public.managed_delete_file(uuid,uuid),public.managed_claim(text),public.managed_finish(text,uuid,uuid,boolean) from public;
grant execute on function public.managed_enqueue(uuid,text),public.managed_put_file(uuid,text,text),public.managed_read_file(uuid,uuid),public.managed_delete_file(uuid,uuid) to authenticated;
grant execute on function public.managed_claim(text),public.managed_finish(text,uuid,uuid,boolean) to service_role;
grant all on public.infrastructure_admins,public.managed_projects,public.managed_project_members,public.managed_records,public.managed_files,public.managed_jobs,public.managed_logs,public.managed_usage,public.managed_workers,public.infrastructure_samples,public.infrastructure_alert_settings to service_role;
grant usage,select on sequence public.managed_logs_id_seq,public.managed_usage_id_seq,public.infrastructure_samples_id_seq to service_role;
