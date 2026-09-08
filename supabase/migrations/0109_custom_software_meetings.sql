create table public.custom_software_visits(id uuid primary key default gen_random_uuid(),campaign jsonb not null default '{}',lead_id uuid references public.leads(id),created_at timestamptz not null default now());
create table public.custom_software_meeting_slots(id uuid primary key default gen_random_uuid(),starts_at timestamptz not null,ends_at timestamptz not null,status text not null default 'available' check(status in ('available','booked','cancelled')),meeting_url text,created_by uuid references auth.users(id),check(ends_at>starts_at));
create table public.custom_software_requests(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),lead_id uuid not null unique references public.leads(id),conversation_id uuid references public.conversations(id),visit_id uuid references public.custom_software_visits(id),status text not null default 'qualifying' check(status in ('qualifying','awaiting_schedule','booked','cancelled')),idea text,offered_slots uuid[] not null default '{}',slot_id uuid unique references public.custom_software_meeting_slots(id),confirmed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.custom_software_visits enable row level security;
alter table public.custom_software_meeting_slots enable row level security;
alter table public.custom_software_requests enable row level security;
revoke all on public.custom_software_visits,public.custom_software_meeting_slots,public.custom_software_requests from anon,authenticated;
grant all on public.custom_software_visits,public.custom_software_meeting_slots,public.custom_software_requests to service_role;
create function public.add_custom_software_slot(p_actor uuid,p_start timestamptz,p_end timestamptz,p_url text) returns uuid language plpgsql security definer set search_path=public as $$
declare slot_result uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and is_platform_admin) then raise exception 'ADMIN_REQUIRED';end if;
 perform pg_advisory_xact_lock(710923);
 if p_start<=now() or p_end<=p_start or p_end>p_start+interval '3 hours' then raise exception 'INVALID_SLOT';end if;
 if exists(select 1 from public.custom_software_meeting_slots where status<>'cancelled' and starts_at<p_end and ends_at>p_start) then raise exception 'SLOT_CONFLICT';end if;
 insert into public.custom_software_meeting_slots(starts_at,ends_at,meeting_url,created_by) values(p_start,p_end,p_url,p_actor) returning custom_software_meeting_slots.id into slot_result;
 return slot_result;
end $$;
create function public.book_custom_software_meeting(p_lead uuid,p_slot uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.custom_software_requests;s public.custom_software_meeting_slots;
begin
 select * into r from public.custom_software_requests where lead_id=p_lead for update;
 if r.id is null then raise exception 'REQUEST_MISSING';end if;
 if r.status='booked' then select * into s from public.custom_software_meeting_slots where id=r.slot_id; return to_jsonb(s)||jsonb_build_object('reused',true);end if;
 if not p_slot=any(r.offered_slots) then raise exception 'SLOT_NOT_OFFERED';end if;
 select * into s from public.custom_software_meeting_slots where id=p_slot for update;
 if s.status<>'available' or s.starts_at<=now()+interval '15 minutes' then raise exception 'SLOT_UNAVAILABLE';end if;
 update public.custom_software_meeting_slots set status='booked' where id=s.id;
 update public.custom_software_requests set status='booked',slot_id=s.id,confirmed_at=now(),updated_at=now() where id=r.id;
 insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
 values('organization',r.organization_id,'lead',p_lead,'lead.custom_software_meeting_booked','Reunião de software personalizado agendada','Horário reservado na agenda ConnectyHub.','organization',array['lead','meeting','custom_software'],jsonb_build_object('lead_id',p_lead,'conversation_id',r.conversation_id,'request_id',r.id,'slot_id',s.id,'starts_at',s.starts_at,'ends_at',s.ends_at,'idea',r.idea,'source','custom_software_landing'));
 return to_jsonb(s)||jsonb_build_object('reused',false);
end $$;
revoke all on function public.add_custom_software_slot(uuid,timestamptz,timestamptz,text),public.book_custom_software_meeting(uuid,uuid) from public,anon,authenticated;
grant execute on function public.add_custom_software_slot(uuid,timestamptz,timestamptz,text),public.book_custom_software_meeting(uuid,uuid) to service_role;

create function public.cancel_custom_software_slot(p_actor uuid,p_slot uuid) returns void language plpgsql security definer set search_path=public as $$
declare r public.custom_software_requests;
begin
 if not exists(select 1 from public.profiles where id=p_actor and is_platform_admin) then raise exception 'ADMIN_REQUIRED';end if;
 select * into r from public.custom_software_requests where slot_id=p_slot for update;
 perform 1 from public.custom_software_meeting_slots where id=p_slot for update;
 update public.custom_software_meeting_slots set status='cancelled' where id=p_slot;
 if r.id is not null then
  update public.custom_software_requests set status='cancelled',updated_at=now() where id=r.id;
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
  values('organization',r.organization_id,'lead',r.lead_id,'lead.custom_software_meeting_cancelled','Horário cancelado pela equipe','Contato pendente para combinar um novo horário.','organization',array['meeting','custom_software'],jsonb_build_object('lead_id',r.lead_id,'slot_id',p_slot,'actor_id',p_actor));
 end if;
end $$;
revoke all on function public.cancel_custom_software_slot(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cancel_custom_software_slot(uuid,uuid) to service_role;
