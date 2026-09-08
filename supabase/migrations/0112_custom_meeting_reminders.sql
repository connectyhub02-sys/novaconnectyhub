create table public.custom_software_meeting_notices(
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.custom_software_requests(id),slot_id uuid not null references public.custom_software_meeting_slots(id),
 hours_before integer not null check(hours_before in (1,24)),due_at timestamptz not null,
 state text not null default 'pending' check(state in ('pending','claimed','dispatching','sent','uncertain','cancelled')),
 updated_at timestamptz not null default now(),provider_message_id text,error_code text,message_text text,
 unique(request_id,slot_id,hours_before)
);
create index custom_meeting_notices_due on public.custom_software_meeting_notices(due_at) where state='pending';
alter table public.custom_software_meeting_notices enable row level security;
revoke all on public.custom_software_meeting_notices from anon,authenticated;
grant all on public.custom_software_meeting_notices to service_role;
create function public.queue_custom_meeting_notices() returns trigger language plpgsql security definer set search_path=public as $$
declare starts timestamptz;
begin
 if new.status='booked' and (old.status is distinct from new.status or old.slot_id is distinct from new.slot_id) then
  select starts_at into starts from public.custom_software_meeting_slots where id=new.slot_id;
  insert into public.custom_software_meeting_notices(request_id,slot_id,hours_before,due_at)
   select new.id,new.slot_id,h,starts-make_interval(hours=>h) from unnest(array[24,1]) h where starts-make_interval(hours=>h)>now() on conflict do nothing;
 elsif new.status='cancelled' then
  update public.custom_software_meeting_notices set state='cancelled',updated_at=now() where request_id=new.id and state in ('pending','claimed');
 end if;
 return new;
end $$;
create trigger queue_custom_meeting_notices after update of status,slot_id on public.custom_software_requests for each row execute function public.queue_custom_meeting_notices();
create function public.claim_custom_meeting_notice() returns jsonb language plpgsql security definer set search_path=public as $$
declare notice_row public.custom_software_meeting_notices;
begin
 update public.custom_software_meeting_notices set state='uncertain',error_code='worker_interrupted',updated_at=now() where state='dispatching' and updated_at<now()-interval '10 minutes';
 update public.custom_software_meeting_notices set state='pending',updated_at=now() where state='claimed' and updated_at<now()-interval '10 minutes';
 update public.custom_software_meeting_notices n set state='cancelled',updated_at=now() where state in ('pending','claimed') and not exists(select 1 from public.custom_software_requests r join public.custom_software_meeting_slots s on s.id=r.slot_id where r.id=n.request_id and r.slot_id=n.slot_id and r.status='booked' and s.status='booked' and s.starts_at>now());
 select * into notice_row from public.custom_software_meeting_notices where state='pending' and due_at<=now() order by due_at for update skip locked limit 1;
 if not found then return null;end if;
 update public.custom_software_meeting_notices set state='claimed',updated_at=now() where id=notice_row.id;
 return to_jsonb(notice_row);
end $$;
revoke all on function public.queue_custom_meeting_notices(),public.claim_custom_meeting_notice() from public,anon,authenticated;
grant execute on function public.claim_custom_meeting_notice() to service_role;
