-- One sender preference per shared billing account. No credit or contract gate.
create table public.notification_sender_preferences (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  mode text not null default 'automatic' check (mode in ('automatic','agent','platform')),
  agent_id uuid references public.agent_registry(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.notification_sender_preferences enable row level security;
revoke all on public.notification_sender_preferences from public,anon,authenticated;
grant all on public.notification_sender_preferences to service_role;

create function public.validate_notification_sender_scope() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.agent_id is not null and not exists (
    select 1 from public.agent_registry a
    join public.organizations company on company.id=a.organization_id
    join public.organizations account on account.id=new.organization_id
    where a.id=new.agent_id and a.scope='organization'
      and coalesce(company.billing_organization_id,company.id)=account.id
      and company.owner_id=account.owner_id
      and a.metadata->>'agent_kind'='whatsapp'
  ) then raise exception 'NOTIFICATION_SENDER_ACCOUNT_MISMATCH'; end if;
  return new;
end $$;
create trigger validate_notification_sender_scope before insert or update on public.notification_sender_preferences
for each row execute function public.validate_notification_sender_scope();
revoke all on function public.validate_notification_sender_scope() from public,anon,authenticated;
