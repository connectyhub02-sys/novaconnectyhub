-- WhatsApp group/channel campaign targets.
-- Stores synchronized groups and newsletters so agents and campaigns can be scoped explicitly.

create table if not exists public.whatsapp_channel_targets (
  id uuid primary key default gen_random_uuid(),
  scope public.agent_scope not null default 'organization',
  organization_id uuid references public.organizations(id) on delete cascade,
  whatsapp_instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  agent_id uuid references public.agent_registry(id) on delete set null,
  provider text not null default 'uazapi',
  target_type text not null check (target_type in ('group', 'newsletter')),
  provider_jid text not null,
  display_name text,
  description text,
  participant_count integer,
  is_admin boolean,
  is_announcement boolean,
  enabled boolean not null default false,
  campaign_enabled boolean not null default true,
  reply_mode text not null default 'mentions'
    check (reply_mode in ('off', 'all', 'mentions', 'admins', 'observer')),
  mention_mode text not null default 'none'
    check (mention_mode in ('none', 'author', 'all')),
  require_approval boolean not null default false,
  max_replies_per_hour integer not null default 6 check (max_replies_per_hour >= 0 and max_replies_per_hour <= 120),
  mute_until timestamptz,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_whatsapp_channel_targets_unique
  on public.whatsapp_channel_targets (whatsapp_instance_id, target_type, provider_jid);

create index if not exists idx_whatsapp_channel_targets_org_type
  on public.whatsapp_channel_targets (organization_id, target_type, updated_at desc);

create index if not exists idx_whatsapp_channel_targets_instance
  on public.whatsapp_channel_targets (whatsapp_instance_id, target_type, display_name);

create index if not exists idx_whatsapp_channel_targets_enabled
  on public.whatsapp_channel_targets (whatsapp_instance_id, target_type, enabled)
  where enabled = true;

drop trigger if exists touch_whatsapp_channel_targets_updated_at on public.whatsapp_channel_targets;
create trigger touch_whatsapp_channel_targets_updated_at
before update on public.whatsapp_channel_targets
for each row execute function public.touch_updated_at();

alter table public.whatsapp_channel_targets enable row level security;

drop policy if exists "whatsapp channel targets visible by scope" on public.whatsapp_channel_targets;
create policy "whatsapp channel targets visible by scope"
on public.whatsapp_channel_targets for select
using (
  public.is_platform_admin()
  or (
    scope = 'organization'
    and organization_id is not null
    and public.is_organization_member(organization_id)
  )
);

drop policy if exists "whatsapp channel targets managed by owners" on public.whatsapp_channel_targets;
create policy "whatsapp channel targets managed by owners"
on public.whatsapp_channel_targets for all
using (
  public.is_platform_admin()
  or (
    scope = 'organization'
    and organization_id is not null
    and public.is_organization_admin(organization_id)
  )
)
with check (
  public.is_platform_admin()
  or (
    scope = 'organization'
    and organization_id is not null
    and public.is_organization_admin(organization_id)
  )
);
