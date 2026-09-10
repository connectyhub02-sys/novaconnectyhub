-- Shared automation policy and durable dispatch. Existing agents keep their
-- individual settings until a company explicitly chooses a central policy.
create table public.automation_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  follow_up_enabled boolean not null default false,
  timezone text not null default 'America/Sao_Paulo',
  window_start text not null default '09:00' check (window_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  window_end text not null default '20:00' check (window_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.automation_dispatches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  opportunity_key text not null,
  journey text not null check (journey in ('conversation','recovery','return','recommendation')),
  status text not null default 'pending' check (status in ('pending','processing','sending','sent','skipped','failed','uncertain')),
  scheduled_for timestamptz not null,
  lease_until timestamptz,
  claim_token uuid,
  send_started_at timestamptz,
  sent_at timestamptz,
  reason text,
  event_data jsonb not null,
  provider_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, opportunity_key)
);
create index automation_dispatches_due on public.automation_dispatches(status, scheduled_for);
create index automation_dispatches_lead on public.automation_dispatches(organization_id,lead_id,created_at desc);
create unique index automation_dispatches_one_active_lead on public.automation_dispatches(organization_id,lead_id)
  where status in ('processing','sending');

alter table public.automation_policies enable row level security;
alter table public.automation_dispatches enable row level security;
revoke all on public.automation_policies,public.automation_dispatches from anon,authenticated;
grant all on public.automation_policies,public.automation_dispatches to service_role;

create function public.claim_automation_dispatch(p_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare task public.automation_dispatches;
begin
  select * into task from public.automation_dispatches where id=p_id;
  if task.id is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(task.organization_id::text || ':' || task.lead_id::text, 114));
  -- A crash after beginning a send is ambiguous, never a safe automatic retry.
  update public.automation_dispatches set status='uncertain',reason='delivery_confirmation_missing',updated_at=now()
    where organization_id=task.organization_id and lead_id=task.lead_id and status='sending' and lease_until<now();
  update public.automation_dispatches set status='pending',lease_until=null,updated_at=now()
    where organization_id=task.organization_id and lead_id=task.lead_id and status='processing' and lease_until<now();
  select * into task from public.automation_dispatches where id=p_id for update;
  if task.status<>'pending' or task.scheduled_for>now() then return null; end if;
  if exists(select 1 from public.automation_dispatches where organization_id=task.organization_id and lead_id=task.lead_id and id<>task.id and status in ('processing','sending')) then return null; end if;
  if exists(select 1 from public.automation_dispatches where organization_id=task.organization_id and lead_id=task.lead_id and status='uncertain') then
    update public.automation_dispatches set status='skipped',reason='unresolved_delivery',updated_at=now() where id=p_id;
    return null;
  end if;
  if exists(select 1 from public.automation_dispatches where organization_id=task.organization_id and lead_id=task.lead_id and status='sent' and sent_at>now()-interval '2 hours') then
    update public.automation_dispatches set scheduled_for=now()+interval '2 hours',reason='contact_interval',updated_at=now() where id=p_id;
    return null;
  end if;
  update public.automation_dispatches set status='processing',claim_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',updated_at=now() where id=p_id returning * into task;
  return to_jsonb(task);
end $$;
revoke all on function public.claim_automation_dispatch(uuid) from public,anon,authenticated;
grant execute on function public.claim_automation_dispatch(uuid) to service_role;
