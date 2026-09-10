create table public.customer_agenda_settings (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 enabled boolean not null default false,
 timezone text not null default 'America/Sao_Paulo',
 updated_at timestamptz not null default now()
);
create table public.customer_agenda_resources (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check(length(name) between 1 and 120),
 service_name text not null check(length(service_name) between 1 and 120),
 kind text not null default 'service' check(kind in ('service','table')),
 duration_minutes integer not null check(duration_minutes between 5 and 720),
 capacity integer not null default 1 check(capacity between 1 and 100),
 weekly_hours jsonb not null default '[]' check(jsonb_typeof(weekly_hours)='array'),
 blocked_dates date[] not null default '{}',
 return_days integer check(return_days between 1 and 730),
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 unique(organization_id,id)
);
create table public.customer_agenda_bookings (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 resource_id uuid not null,
 lead_id uuid not null references public.leads(id),
 conversation_id uuid references public.conversations(id),
 agent_id uuid references public.agent_registry(id),
 starts_at timestamptz not null,
 ends_at timestamptz not null check(ends_at>starts_at),
 party_size integer not null default 1 check(party_size between 1 and 100),
 status text not null default 'booked' check(status in ('booked','cancelled','completed','no_show')),
 confirmed_at timestamptz,
 version integer not null default 1,
 request_key text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(organization_id,resource_id) references public.customer_agenda_resources(organization_id,id),
 unique(organization_id,request_key)
);
create index customer_agenda_booking_calendar on public.customer_agenda_bookings(organization_id,resource_id,starts_at,ends_at) where status='booked';
create index customer_agenda_booking_lead on public.customer_agenda_bookings(organization_id,lead_id,starts_at desc);

create table public.customer_agenda_offers (
 conversation_id uuid primary key references public.conversations(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 lead_id uuid not null references public.leads(id),
 resource_id uuid not null references public.customer_agenda_resources(id),
 slots jsonb not null,
 party_size integer not null default 1,
 replace_booking_id uuid references public.customer_agenda_bookings(id),
 replace_version integer,
 expires_at timestamptz not null
);
create table public.customer_agenda_turns (
 run_id uuid primary key references public.agent_runs(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 result jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.customer_agenda_offers enable row level security;
alter table public.customer_agenda_turns enable row level security;
revoke all on public.customer_agenda_offers,public.customer_agenda_turns from anon,authenticated;
grant all on public.customer_agenda_offers,public.customer_agenda_turns to service_role;

create table public.customer_lead_visits (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 lead_id uuid not null references public.leads(id),
 description text not null check(length(description) between 1 and 300),
 kind text not null check(kind in ('visit','purchase','service')),
 occurred_at timestamptz not null,
 return_at timestamptz,
 return_status text not null default 'pending' check(return_status in ('pending','scheduled','cancelled','completed')),
 booking_id uuid references public.customer_agenda_bookings(id),
 order_id uuid references public.sales_catalog_orders(id),
 request_key text not null,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 check(return_at is null or return_at>occurred_at),
 unique(organization_id,request_key)
);
create index customer_lead_visits_due on public.customer_lead_visits(return_status,return_at) where return_at is not null;

create table public.customer_agenda_events (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 booking_id uuid not null references public.customer_agenda_bookings(id),
 version integer not null,
 event_type text not null,
 actor text not null,
 created_at timestamptz not null default now()
);

alter table public.customer_agenda_settings enable row level security;
alter table public.customer_agenda_resources enable row level security;
alter table public.customer_agenda_bookings enable row level security;
alter table public.customer_lead_visits enable row level security;
alter table public.customer_agenda_events enable row level security;
revoke all on public.customer_agenda_settings,public.customer_agenda_resources,public.customer_agenda_bookings,public.customer_lead_visits,public.customer_agenda_events from anon,authenticated;
grant all on public.customer_agenda_settings,public.customer_agenda_resources,public.customer_agenda_bookings,public.customer_lead_visits,public.customer_agenda_events to service_role;

create function public.reserve_customer_appointment(p_org uuid,p_resource uuid,p_lead uuid,p_start timestamptz,p_party integer,p_key text,p_conversation uuid default null,p_agent uuid default null,p_replace uuid default null,p_version integer default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare resource public.customer_agenda_resources; settings public.customer_agenda_settings; booking public.customer_agenda_bookings; previous public.customer_agenda_bookings;
 finish timestamptz; local_start timestamp; local_end timestamp; occupied integer; slot jsonb;
begin
 select * into resource from public.customer_agenda_resources where id=p_resource and organization_id=p_org for update;
 select * into settings from public.customer_agenda_settings where organization_id=p_org;
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

create function public.update_customer_appointment(p_org uuid,p_booking uuid,p_version integer,p_action text,p_actor text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare booking public.customer_agenda_bookings; resource public.customer_agenda_resources;
begin
 select * into booking from public.customer_agenda_bookings where id=p_booking and organization_id=p_org for update;
 if booking.id is null or p_version is null or booking.version<>p_version or booking.status<>'booked' then raise exception 'STALE_BOOKING';end if;
 if p_action not in ('confirm','cancel','complete','no_show') then raise exception 'INVALID_ACTION';end if;
 if p_action in ('complete','no_show') and booking.starts_at>now() then raise exception 'APPOINTMENT_NOT_STARTED';end if;
 if p_action='confirm' and booking.confirmed_at is not null then return to_jsonb(booking);end if;
 update public.customer_agenda_bookings set confirmed_at=case when p_action='confirm' then now() else confirmed_at end,status=case p_action when 'cancel' then 'cancelled' when 'complete' then 'completed' when 'no_show' then 'no_show' else status end,version=version+1,updated_at=now() where id=booking.id returning * into booking;
 insert into public.customer_agenda_events(organization_id,booking_id,version,event_type,actor) values(p_org,booking.id,booking.version,p_action,p_actor);
 if p_action='complete' then
   select * into resource from public.customer_agenda_resources where id=booking.resource_id;
   update public.customer_lead_visits set return_status='cancelled' where organization_id=p_org and lead_id=booking.lead_id and description=resource.service_name and return_status in ('pending','scheduled');
   insert into public.customer_lead_visits(organization_id,lead_id,description,kind,occurred_at,return_at,booking_id,request_key)
    values(p_org,booking.lead_id,resource.service_name,'service',now(),case when resource.return_days is not null then now()+make_interval(days=>resource.return_days) else null end,booking.id,'booking:'||booking.id::text) on conflict(organization_id,request_key) do nothing;
 end if;
 return to_jsonb(booking);
end $$;
revoke all on function public.reserve_customer_appointment(uuid,uuid,uuid,timestamptz,integer,text,uuid,uuid,uuid,integer),public.update_customer_appointment(uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.reserve_customer_appointment(uuid,uuid,uuid,timestamptz,integer,text,uuid,uuid,uuid,integer),public.update_customer_appointment(uuid,uuid,integer,text,text) to service_role;
