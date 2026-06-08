-- Internal ConnectyHub WhatsApp attendance sectors.
-- Client agents are bound to organizations. Platform/admin WhatsApp agents are bound to
-- ConnectyHub sectors so our own lead atendimento does not require fake companies.

create table if not exists public.platform_whatsapp_sectors (
  id uuid primary key default gen_random_uuid(),
  sector_code text not null unique,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_platform_whatsapp_sectors_status
  on public.platform_whatsapp_sectors (status, created_at desc);

drop trigger if exists trg_platform_whatsapp_sectors_updated_at on public.platform_whatsapp_sectors;
create trigger trg_platform_whatsapp_sectors_updated_at
before update on public.platform_whatsapp_sectors
for each row execute function public.touch_updated_at();

alter table public.platform_whatsapp_sectors enable row level security;

drop policy if exists "platform whatsapp sectors visible by admins" on public.platform_whatsapp_sectors;
create policy "platform whatsapp sectors visible by admins"
on public.platform_whatsapp_sectors for select
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_platform_admin = true
  )
);

drop policy if exists "platform whatsapp sectors managed by admins" on public.platform_whatsapp_sectors;
create policy "platform whatsapp sectors managed by admins"
on public.platform_whatsapp_sectors for all
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
