alter table public.customer_agenda_events add column notices_prepared_at timestamptz;
create index customer_agenda_events_unprepared on public.customer_agenda_events(created_at) where notices_prepared_at is null;
create table public.customer_agenda_notices (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 booking_id uuid not null references public.customer_agenda_bookings(id) on delete cascade,
 booking_version integer not null,
 audience text not null check(audience in ('lead','responsible')),
 recipient_phone text not null,
 kind text not null,
 due_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','processing','sending','sent','skipped','failed','uncertain')),
 attempts integer not null default 0,
 lease_until timestamptz,
 claim_token uuid,
 message_text text,
 reason text,
 updated_at timestamptz not null default now(),
 unique(booking_id,booking_version,kind,recipient_phone)
);
create index customer_agenda_notices_due on public.customer_agenda_notices(status,due_at);
create table public.customer_agenda_actions (
 token uuid primary key default gen_random_uuid(),
 notice_id uuid not null references public.customer_agenda_notices(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 booking_id uuid not null references public.customer_agenda_bookings(id) on delete cascade,
 booking_version integer not null,
 recipient_phone text not null,
 action text not null check(action in ('confirm','cancel','reschedule','complete','no_show','unknown')),
 expires_at timestamptz not null,
 consumed_at timestamptz,
 result jsonb,
 unique(notice_id,action)
);
alter table public.customer_agenda_notices enable row level security;
alter table public.customer_agenda_actions enable row level security;
revoke all on public.customer_agenda_notices,public.customer_agenda_actions from anon,authenticated;
grant all on public.customer_agenda_notices,public.customer_agenda_actions to service_role;
create function public.consume_customer_agenda_action(p_org uuid,p_token uuid,p_phone text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare action public.customer_agenda_actions; booking public.customer_agenda_bookings; v_result jsonb;
begin
 select * into action from public.customer_agenda_actions where token=p_token and organization_id=p_org and recipient_phone=p_phone for update;
 if action.token is null or action.expires_at<=now() then raise exception 'ACTION_UNAVAILABLE';end if;
 if action.consumed_at is not null then return action.result;end if;
 select * into booking from public.customer_agenda_bookings where id=action.booking_id and organization_id=p_org for update;
 if booking.id is null or booking.version<>action.booking_version or booking.status<>'booked' then raise exception 'STALE_BOOKING';end if;
 if action.action in ('reschedule','unknown') then v_result:=jsonb_build_object('action',action.action,'booking',to_jsonb(booking));
 else v_result:=jsonb_build_object('action',action.action,'booking',public.update_customer_appointment(p_org,booking.id,booking.version,action.action,p_phone));end if;
 update public.customer_agenda_actions set consumed_at=now(),result=v_result where token=p_token;
 return v_result;
end $$;
revoke all on function public.consume_customer_agenda_action(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.consume_customer_agenda_action(uuid,uuid,text) to service_role;
