-- Customer automation executes through the same AI wallet gateway. No provider-side schedules.
create table public.ai_webhooks (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.ai_projects(id),
 url text not null, secret_encrypted text not null, enabled boolean not null default true,
 events text[] not null default array['request.completed','request.failed'], created_at timestamptz not null default now(),
 check(events <@ array['request.completed','request.failed']::text[] and cardinality(events)>0)
);
create table public.ai_webhook_deliveries (
 id uuid primary key default gen_random_uuid(), webhook_id uuid not null references public.ai_webhooks(id),
 project_id uuid not null references public.ai_projects(id), request_id uuid not null references public.ai_requests(id),
 event_type text not null, payload jsonb not null, status text not null default 'pending',
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 lease_id uuid, lease_until timestamptz, http_status integer, created_at timestamptz not null default now(),
 unique(webhook_id,request_id,event_type), check(status in ('pending','delivered','failed','skipped'))
);
create index ai_webhook_due on public.ai_webhook_deliveries(next_attempt_at) where status='pending';
create function public.queue_ai_request_webhooks() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status not in ('completed','failed') or new.status is not distinct from old.status then return new; end if;
 insert into public.ai_webhook_deliveries(webhook_id,project_id,request_id,event_type,payload)
 select w.id,new.project_id,new.id,'request.'||new.status,
 jsonb_build_object('type','request.'||new.status,'created_at',now(),'data',jsonb_build_object(
 'request_id',new.id,'project_id',new.project_id,'status',new.status,'credits',new.charged_credits,
 'request_url','/api/v1/ai/requests/'||new.id))
 from public.ai_webhooks w where w.project_id=new.project_id and w.enabled and ('request.'||new.status)=any(w.events)
 on conflict do nothing;
 return new;
end $$;
create trigger ai_request_webhook after update of status on public.ai_requests for each row execute function public.queue_ai_request_webhooks();
create function public.claim_ai_webhook_delivery(p_id uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare d public.ai_webhook_deliveries;
begin
 update public.ai_webhook_deliveries set status='failed',lease_until=null
 where id=p_id and status='pending' and attempts>=8 and (lease_until is null or lease_until<now());
 update public.ai_webhook_deliveries set lease_id=p_lease,lease_until=now()+interval '1 minute',attempts=attempts+1
 where id=p_id and status='pending' and attempts<8 and next_attempt_at<=now() and (lease_until is null or lease_until<now()) returning * into d;
 if not found then return null; end if;
 return to_jsonb(d);
end $$;

create table public.ai_triggers (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.ai_projects(id),
 key_id uuid not null references public.ai_api_keys(id), display_name text not null,
 schedule text not null, time_zone text not null, interaction jsonb not null,
 enabled boolean not null default true, next_run_at timestamptz not null, created_at timestamptz not null default now()
);
create index ai_triggers_due on public.ai_triggers(next_run_at) where enabled;
create table public.ai_trigger_runs (
 id uuid primary key default gen_random_uuid(), trigger_id uuid not null references public.ai_triggers(id),
 project_id uuid not null references public.ai_projects(id), key_id uuid not null references public.ai_api_keys(id),
 run_key text not null, interaction jsonb not null, request_id uuid references public.ai_requests(id),
 status text not null default 'pending' check(status in ('pending','submitted','failed','skipped')),
 error_code text, lease_id uuid, lease_until timestamptz, created_at timestamptz not null default now(),
 unique(trigger_id,run_key)
);
create function public.claim_ai_trigger(p_id uuid,p_due timestamptz,p_next timestamptz) returns uuid language plpgsql security definer set search_path=public as $$
declare t public.ai_triggers; run uuid;
begin
 select * into t from public.ai_triggers where id=p_id for update;
 if t.id is null or not t.enabled or t.next_run_at is distinct from p_due or t.next_run_at>now() then return null; end if;
 if p_next is null or p_next<=now() then raise exception 'INVALID_NEXT_RUN'; end if;
 update public.ai_triggers set next_run_at=p_next where id=t.id;
 -- Skip missed/overlapping schedules rather than accumulate surprise paid executions.
 if exists(select 1 from public.ai_trigger_runs r left join public.ai_requests q on q.id=r.request_id
   where r.trigger_id=t.id and (r.status='pending' or (r.status='submitted' and q.status not in ('completed','failed')))) then return null; end if;
 insert into public.ai_trigger_runs(trigger_id,project_id,key_id,run_key,interaction)
 values(t.id,t.project_id,t.key_id,'scheduled:'||p_due,t.interaction) on conflict do nothing returning id into run;
 return run;
end $$;
create function public.claim_ai_trigger_run(p_id uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.ai_trigger_runs;
begin
 update public.ai_trigger_runs set lease_id=p_lease,lease_until=now()+interval '3 minutes'
 where id=p_id and status='pending' and (lease_until is null or lease_until<now()) returning * into r;
 if not found then return null; end if;
 return to_jsonb(r);
end $$;
alter table public.ai_webhooks enable row level security;
alter table public.ai_webhook_deliveries enable row level security;
alter table public.ai_triggers enable row level security;
alter table public.ai_trigger_runs enable row level security;
revoke all on public.ai_webhooks,public.ai_webhook_deliveries,public.ai_triggers,public.ai_trigger_runs from public,anon,authenticated;
grant all on public.ai_webhooks,public.ai_webhook_deliveries,public.ai_triggers,public.ai_trigger_runs to service_role;
revoke all on function public.queue_ai_request_webhooks(),public.claim_ai_webhook_delivery(uuid,uuid),public.claim_ai_trigger(uuid,timestamptz,timestamptz),public.claim_ai_trigger_run(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_ai_webhook_delivery(uuid,uuid),public.claim_ai_trigger(uuid,timestamptz,timestamptz),public.claim_ai_trigger_run(uuid,uuid) to service_role;
