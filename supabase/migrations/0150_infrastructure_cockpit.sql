-- Cockpit is service-only. No tenant/client may read infrastructure or self-grant access.
create table public.infra_projects (
  id text primary key check (id ~ '^[a-z0-9-]{1,64}$'),
  name text not null, company text not null, environment text not null,
  topology text not null check (topology in ('vercel','vps','vercel_proxy_vps','github_push','unknown')),
  app text not null, supabase text not null, inngest text not null, worker text not null, storage text not null
);
insert into public.infra_projects values
 ('connectyhub','ConnectyHub','ConnectyHub','production','vercel','Next.js / Vercel','VPS / Docker','VPS','Handlers na Vercel','Cloudflare R2 + Supabase'),
 ('betel','Betel','Betel','production','vercel_proxy_vps','VPS / app-production','A confirmar','A confirmar','A confirmar','A confirmar'),
 ('vision','Vision','Vision Business Group','A confirmar','unknown','A confirmar','A confirmar','A confirmar','A confirmar','A confirmar');
-- Inventário informado; NÃO representa verificação de saúde ou configuração no host.
create table public.infra_telemetry (
  project_id text primary key references public.infra_projects(id),
  observed_at timestamptz not null, received_at timestamptz not null default now(),
  executor text not null, payload jsonb not null
);
create table public.infra_migrations (
  project_id text references public.infra_projects(id), version text not null,
  name text not null, sql text not null, checksum text not null,
  primary key(project_id,version)
);
create table public.infra_deployments (
  id uuid primary key, project_id text not null references public.infra_projects(id),
  app text not null, origin text not null check(origin in ('vercel','vps','vercel_proxy_vps','github_push')),
  stage text not null check(stage in ('queued','package','build','tests','backup','switch','healthcheck','completed','failed','rollback')),
  current_image text not null, new_image text not null, executor text not null,
  container text not null check(container in ('unknown','running','stopped','restarting','exited')), health text not null check(health in ('healthy','warning','error','unknown')),
  sequence integer not null check(sequence > 0), started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), finished_at timestamptz
);
create index infra_deployments_project_time on public.infra_deployments(project_id,started_at desc);
create table public.infra_deploy_events (
  deploy_id uuid not null references public.infra_deployments(id), sequence integer not null,
  stage text not null, code text not null check(code in ('started','progress','step_ok','step_failed','health_ok','health_failed','rollback_ok')), executor text not null, payload jsonb not null,
  created_at timestamptz not null default now(), primary key(deploy_id,sequence)
);
create table public.infra_audit (
  id uuid primary key default gen_random_uuid(), project_id text references public.infra_projects(id),
  actor text not null, action text not null, target text, result text not null, reason text not null,
  before_state jsonb, after_state jsonb, created_at timestamptz not null default now()
);
create index infra_audit_project_time on public.infra_audit(project_id,created_at desc);
alter table public.infra_projects enable row level security;
alter table public.infra_telemetry enable row level security;
alter table public.infra_migrations enable row level security;
alter table public.infra_deployments enable row level security;
alter table public.infra_deploy_events enable row level security;
alter table public.infra_audit enable row level security;
revoke all on public.infra_projects, public.infra_telemetry, public.infra_migrations,
  public.infra_deployments, public.infra_deploy_events, public.infra_audit from public, anon, authenticated, service_role;
grant select on public.infra_projects, public.infra_telemetry, public.infra_migrations,
  public.infra_deployments, public.infra_deploy_events, public.infra_audit to service_role;
grant insert on public.infra_audit to service_role;

-- Atomic, ordered, idempotent ingestion. Lock by deploy UUID even before the first INSERT.
create function public.infra_record_deploy(p_project text, p_actor text, p_event jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.infra_deployments; old_event public.infra_deploy_events;
  deploy uuid := (p_event->>'deployId')::uuid;
  seq integer := (p_event->>'sequence')::integer;
  stage_name text := p_event->>'stage';
  stage_order text[] := array['queued','package','build','tests','backup','switch','healthcheck','completed'];
begin
  perform pg_advisory_xact_lock(hashtextextended(deploy::text,0));
  if seq is null or seq < 1 or stage_name is null or stage_name not in ('queued','package','build','tests','backup','switch','healthcheck','completed','failed','rollback') then
    insert into public.infra_audit(project_id,actor,action,result,reason) values(p_project,p_actor,'deploy_event','denied','invalid_event');
    return jsonb_build_object('error','invalid_event');
  end if;
  select * into d from public.infra_deployments where id=deploy for update;
  if found and (d.project_id <> p_project or d.executor <> p_actor) then
    insert into public.infra_audit(project_id,actor,action,result,reason) values(p_project,p_actor,'deploy_event','denied','scope_mismatch');
    return jsonb_build_object('error','scope_mismatch');
  end if;
  select * into old_event from public.infra_deploy_events where deploy_id=deploy and sequence=seq;
  if found then
    if old_event.payload = p_event and old_event.executor=p_actor then
      insert into public.infra_audit(project_id,actor,action,result,reason) values(p_project,p_actor,'deploy_event','replay','idempotent');
      return jsonb_build_object('replay',true,'id',deploy);
    end if;
    insert into public.infra_audit(project_id,actor,action,result,reason) values(p_project,p_actor,'deploy_event','denied','sequence_conflict');
    return jsonb_build_object('error','sequence_conflict');
  end if;
  if (d.id is null and (seq<>1 or stage_name<>'queued')) or
     (d.id is not null and (seq<>d.sequence+1 or d.stage='completed' or (d.stage='rollback' and d.finished_at is not null) or
       (d.stage='failed' and stage_name<>'rollback') or
       (stage_name='rollback' and d.stage not in ('failed','rollback')) or
       (d.stage='rollback' and stage_name not in ('rollback','failed')) or
       coalesce(array_position(stage_order,stage_name)<array_position(stage_order,d.stage),false) or
       d.app<>p_event->>'app' or d.origin<>p_event->>'origin' or
       d.current_image<>p_event->>'currentImage' or d.new_image<>p_event->>'newImage')) or
     (stage_name='completed' and p_event->>'origin'<>'github_push' and (p_event->>'health'<>'healthy' or d.stage<>'healthcheck')) or
     (stage_name='rollback' and (p_event->>'code' not in ('started','progress','rollback_ok') or (p_event->>'code'='rollback_ok' and p_event->>'health'<>'healthy'))) then
    insert into public.infra_audit(project_id,actor,action,result,reason,before_state) values(p_project,p_actor,'deploy_event','denied','invalid_transition',to_jsonb(d));
    return jsonb_build_object('error','invalid_transition');
  end if;
  insert into public.infra_deployments(id,project_id,app,origin,stage,current_image,new_image,executor,container,health,sequence,finished_at)
  values(deploy,p_project,p_event->>'app',p_event->>'origin',stage_name,p_event->>'currentImage',p_event->>'newImage',p_actor,p_event->>'container',p_event->>'health',seq,
    case when stage_name in ('completed','failed') or (stage_name='rollback' and p_event->>'code'='rollback_ok') then now() end)
  on conflict(id) do update set stage=excluded.stage, container=excluded.container,health=excluded.health,sequence=excluded.sequence,updated_at=now(),finished_at=excluded.finished_at;
  insert into public.infra_deploy_events(deploy_id,sequence,stage,code,executor,payload) values(deploy,seq,stage_name,p_event->>'code',p_actor,p_event);
  insert into public.infra_audit(project_id,actor,action,result,reason,before_state,after_state)
    values(p_project,p_actor,'deploy_event','recorded','progress_only',case when d.id is not null then to_jsonb(d) end,p_event);
  return jsonb_build_object('id',deploy,'sequence',seq,'replay',false);
end $$;
revoke all on function public.infra_record_deploy(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.infra_record_deploy(text,text,jsonb) to service_role;

create function public.infra_record_telemetry(p_project text,p_actor text,p_observed timestamptz,p_payload jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;
begin
  insert into public.infra_telemetry(project_id,observed_at,executor,payload) values(p_project,p_observed,p_actor,p_payload)
  on conflict(project_id) do update set observed_at=excluded.observed_at,received_at=now(),executor=excluded.executor,payload=excluded.payload
  where infra_telemetry.observed_at < excluded.observed_at;
  get diagnostics changed = row_count;
  insert into public.infra_audit(project_id,actor,action,result,reason) values(p_project,p_actor,'telemetry',case when changed=1 then 'recorded' else 'ignored' end,'snapshot');
  return changed=1;
end $$;
revoke all on function public.infra_record_telemetry(text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.infra_record_telemetry(text,text,timestamptz,jsonb) to service_role;
