-- Browser push subscriptions captured by the global ConnectyHub tracker.
-- Permission requests happen in the client, but subscriptions are persisted by
-- the service-role API so public visitors never write directly to this table.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  visitor_cookie_id text not null,
  session_cookie_id text,
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  permission text not null default 'granted' check (permission in ('granted', 'denied', 'default', 'prompt', 'unknown')),
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_visitor
  on public.push_subscriptions (visitor_cookie_id, last_seen_at desc);

create index if not exists idx_push_subscriptions_user
  on public.push_subscriptions (user_id, last_seen_at desc)
  where user_id is not null;

create index if not exists idx_push_subscriptions_organization
  on public.push_subscriptions (organization_id, last_seen_at desc)
  where organization_id is not null;

drop trigger if exists trg_push_subscriptions_updated_at on public.push_subscriptions;
create trigger trg_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row execute function public.touch_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists "push subscriptions visible by platform admins" on public.push_subscriptions;
create policy "push subscriptions visible by platform admins"
on public.push_subscriptions for select
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_platform_admin = true
  )
);

drop policy if exists "push subscriptions managed by platform admins" on public.push_subscriptions;
create policy "push subscriptions managed by platform admins"
on public.push_subscriptions for all
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_platform_admin = true
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_platform_admin = true
  )
);
