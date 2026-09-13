-- Explicit company calendar; no existing availability or customer appointments are changed.
alter table public.customer_agenda_settings add column default_resource_id uuid;
alter table public.customer_agenda_settings add constraint agenda_default_resource_scope foreign key(organization_id,default_resource_id) references public.customer_agenda_resources(organization_id,id);
alter table public.customer_agenda_resources add column location_address text, add column location_url text;
alter table public.customer_agenda_offers add column accepted boolean not null default false;
create table public.customer_agenda_blocks (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 resource_id uuid not null, title text not null check(length(title) between 1 and 160),
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
 request_key text not null, created_at timestamptz not null default now(),
 foreign key(organization_id,resource_id) references public.customer_agenda_resources(organization_id,id), unique(organization_id,request_key)
);
create index agenda_blocks_calendar on public.customer_agenda_blocks(organization_id,resource_id,starts_at,ends_at);
alter table public.customer_agenda_blocks enable row level security;
revoke all on public.customer_agenda_blocks from anon,authenticated;
grant all on public.customer_agenda_blocks to service_role;
-- A block and a reservation take the same resource lock, preventing check-then-write races.
create function public.block_customer_agenda(p_org uuid,p_resource uuid,p_start timestamptz,p_end timestamptz,p_title text,p_key text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare existing public.customer_agenda_blocks;
begin
 perform 1 from public.customer_agenda_resources where organization_id=p_org and id=p_resource for update;
 if not found then raise exception 'AGENDA_UNAVAILABLE';end if;
 if p_start is null or p_end is null or p_end<=p_start or p_end>p_start+interval '366 days' or nullif(trim(p_title),'') is null or length(p_title)>160 or nullif(p_key,'') is null or length(p_key)>180 then raise exception 'INVALID_APPOINTMENT';end if;
 select * into existing from public.customer_agenda_blocks where organization_id=p_org and request_key=p_key;
 if existing.id is not null then
  if existing.resource_id<>p_resource or existing.starts_at<>p_start or existing.ends_at<>p_end or existing.title<>p_title then raise exception 'REQUEST_KEY_CONFLICT';end if;
  return to_jsonb(existing);
 end if;
 if exists(select 1 from public.customer_agenda_bookings where organization_id=p_org and resource_id=p_resource and status='booked' and starts_at<p_end and ends_at>p_start) then raise exception 'SLOT_UNAVAILABLE';end if;
 insert into public.customer_agenda_blocks(organization_id,resource_id,starts_at,ends_at,title,request_key) values(p_org,p_resource,p_start,p_end,p_title,p_key) returning * into existing;
 return to_jsonb(existing);
end $$;
revoke all on function public.block_customer_agenda(uuid,uuid,timestamptz,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.block_customer_agenda(uuid,uuid,timestamptz,timestamptz,text,text) to service_role;

create or replace function public.reserve_customer_appointment(p_org uuid,p_resource uuid,p_lead uuid,p_start timestamptz,p_party integer,p_key text,p_conversation uuid default null,p_agent uuid default null,p_replace uuid default null,p_version integer default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare resource public.customer_agenda_resources; settings public.customer_agenda_settings; booking public.customer_agenda_bookings; previous public.customer_agenda_bookings;
 finish timestamptz; local_start timestamp; local_end timestamp; occupied integer; slot jsonb;
begin
 perform 1 from public.leads where id=p_lead and organization_id=p_org for update;
 if not found then raise exception 'LEAD_SCOPE';end if;
 select * into resource from public.customer_agenda_resources where id=p_resource and organization_id=p_org for update;
 select * into settings from public.customer_agenda_settings where organization_id=p_org for share;
 if resource.id is null or not resource.enabled or settings.organization_id is null or not settings.enabled then raise exception 'AGENDA_UNAVAILABLE'; end if;
 if not exists(select 1 from public.leads where id=p_lead and organization_id=p_org) then raise exception 'LEAD_SCOPE'; end if;
 if p_conversation is not null and not exists(select 1 from public.conversations where id=p_conversation and organization_id=p_org and lead_id=p_lead) then raise exception 'CONVERSATION_SCOPE';end if;
 if p_agent is not null and not exists(select 1 from public.agent_registry where id=p_agent and organization_id=p_org) then raise exception 'AGENT_SCOPE';end if;
 if p_key is null or length(p_key) not between 1 and 180 then raise exception 'INVALID_REQUEST_KEY';end if;
 select * into booking from public.customer_agenda_bookings where organization_id=p_org and request_key=p_key;
 if booking.id is not null then
   if booking.lead_id<>p_lead or booking.resource_id<>p_resource or booking.starts_at<>p_start or booking.party_size<>p_party then raise exception 'REQUEST_KEY_CONFLICT';end if;
   return to_jsonb(booking);
 end if;
 if p_start is null or p_start<=now() or p_start>now()+interval '1 year' or p_party is null or p_party<1 or p_party>resource.capacity or (resource.kind='service' and p_party<>1) then raise exception 'INVALID_APPOINTMENT';end if;
 finish:=p_start+make_interval(mins=>resource.duration_minutes);
 local_start:=p_start at time zone settings.timezone; local_end:=finish at time zone settings.timezone;
 if local_start::date=any(resource.blocked_dates) or local_end::date<>local_start::date then raise exception 'OUTSIDE_HOURS';end if;
 if not exists(select 1 from jsonb_array_elements(resource.weekly_hours) h where (h->'days') @> to_jsonb(array[extract(isodow from local_start)::integer]) and local_start::time >= (h->>'start')::time and local_end::time <= (h->>'end')::time) then raise exception 'OUTSIDE_HOURS';end if;
 if p_replace is not null then
   select * into previous from public.customer_agenda_bookings where id=p_replace and organization_id=p_org and lead_id=p_lead for update;
   if previous.id is null or p_version is null or previous.status<>'booked' or previous.version<>p_version or previous.resource_id<>p_resource then raise exception 'STALE_BOOKING';end if;
 end if;
 if p_replace is null and p_conversation is not null then
   select * into booking from public.customer_agenda_bookings where organization_id=p_org and resource_id=p_resource and lead_id=p_lead and conversation_id=p_conversation and starts_at=p_start and party_size=p_party and status='booked';
   if booking.id is not null then return to_jsonb(booking); end if;
 end if;
 if exists(select 1 from public.customer_agenda_blocks where organization_id=p_org and resource_id=p_resource and starts_at<finish and ends_at>p_start) then raise exception 'SLOT_UNAVAILABLE'; end if;
 select coalesce(max((select count(*) from public.customer_agenda_bookings b where b.organization_id=p_org and b.resource_id=p_resource and b.status='booked' and b.starts_at<=points.at and b.ends_at>points.at and (p_replace is null or b.id<>p_replace))),0) into occupied
 from (select p_start as at union select starts_at from public.customer_agenda_bookings where organization_id=p_org and resource_id=p_resource and status='booked' and starts_at>=p_start and starts_at<finish and (p_replace is null or id<>p_replace)) points;
 if occupied >= (case when resource.kind='table' then 1 else resource.capacity end) then raise exception 'SLOT_UNAVAILABLE';end if;
 if p_replace is null then
   insert into public.customer_agenda_bookings(organization_id,resource_id,lead_id,conversation_id,agent_id,starts_at,ends_at,party_size,request_key) values(p_org,p_resource,p_lead,p_conversation,p_agent,p_start,finish,p_party,p_key) returning * into booking;
 else
   update public.customer_agenda_bookings set starts_at=p_start,ends_at=finish,party_size=p_party,confirmed_at=null,version=version+1,updated_at=now(),request_key=p_key where id=p_replace returning * into booking;
 end if;
 insert into public.customer_agenda_events(organization_id,booking_id,version,event_type,actor) values(p_org,booking.id,booking.version,case when p_replace is null then 'booked' else 'rescheduled' end,'booking_service');
 return to_jsonb(booking);
end $$;

-- Explicit lead/conversation links allow the existing reset traversal to remove
-- requests, while keeping organization calendars and internal blocks.
create table public.customer_agenda_requests (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 lead_id uuid not null references public.leads(id), conversation_id uuid not null references public.conversations(id),
 agent_id uuid not null references public.agent_registry(id), run_id uuid not null unique references public.agent_runs(id),
 whatsapp_instance_id uuid not null references public.whatsapp_instances(id), reason text not null, request_text text not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','uncertain')),
 attempts integer not null default 0, due_at timestamptz not null default now(), lease_until timestamptz,
 created_at timestamptz not null default now()
);
alter table public.customer_agenda_requests enable row level security;
revoke all on public.customer_agenda_requests from anon,authenticated;
grant all on public.customer_agenda_requests to service_role;
create function public.claim_customer_agenda_request(p_org uuid,p_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare r public.customer_agenda_requests;
begin
 select * into r from public.customer_agenda_requests where organization_id=p_org and id=p_id;
 if r.id is null then return false;end if;
 perform 1 from public.leads where id=r.lead_id and organization_id=p_org for update;
 if not found then return false;end if;
 update public.customer_agenda_requests set status='sending',attempts=attempts+1,lease_until=now()+interval '2 minutes' where id=p_id and status='pending' and due_at<=now();
 return found;
end $$;
revoke all on function public.claim_customer_agenda_request(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_customer_agenda_request(uuid,uuid) to service_role;

-- Reassert the service boundary even if the target has drifted from prior ACLs.
revoke all on function public.reserve_customer_appointment(uuid,uuid,uuid,timestamptz,integer,text,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.reserve_customer_appointment(uuid,uuid,uuid,timestamptz,integer,text,uuid,uuid,uuid,integer) to service_role;
