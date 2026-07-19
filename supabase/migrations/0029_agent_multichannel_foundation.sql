-- Agent multichannel foundation.
-- Keeps WhatsApp as the primary channel and prepares Meta social channels per agent.

create table if not exists public.lead_channel_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  provider text not null,
  channel text not null
    check (channel in ('whatsapp', 'instagram_direct', 'instagram_comments', 'facebook_messenger', 'facebook_comments')),
  external_account_id text,
  external_user_id text not null,
  external_username text,
  display_name text,
  profile_url text,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_lead_channel_identities_unique_external
  on public.lead_channel_identities (organization_id, provider, channel, coalesce(external_account_id, ''), external_user_id);

create index if not exists idx_lead_channel_identities_lead
  on public.lead_channel_identities (lead_id, updated_at desc);

create index if not exists idx_lead_channel_identities_org_channel
  on public.lead_channel_identities (organization_id, channel, updated_at desc);

drop trigger if exists touch_lead_channel_identities_updated_at on public.lead_channel_identities;
create trigger touch_lead_channel_identities_updated_at
before update on public.lead_channel_identities
for each row execute function public.touch_updated_at();

alter table public.lead_channel_identities enable row level security;

drop policy if exists "lead channel identities visible by organization" on public.lead_channel_identities;
create policy "lead channel identities visible by organization"
on public.lead_channel_identities for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "lead channel identities managed by organization admins" on public.lead_channel_identities;
create policy "lead channel identities managed by organization admins"
on public.lead_channel_identities for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);

update public.agent_registry
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'agent_kind', coalesce(metadata->>'agent_kind', 'whatsapp'),
  'multichannel_config', jsonb_build_object(
    'version', 1,
    'primaryChannel', 'whatsapp',
    'channels', jsonb_build_object(
      'whatsapp', jsonb_build_object(
        'enabled', true,
        'mode', 'primary',
        'autoReply', true,
        'allowPublicReplies', false,
        'allowPrivateReplies', true,
        'requiresHumanApproval', false
      ),
      'instagram_direct', jsonb_build_object(
        'enabled', false,
        'mode', 'private',
        'autoReply', true,
        'allowPublicReplies', false,
        'allowPrivateReplies', true,
        'requiresHumanApproval', false
      ),
      'instagram_comments', jsonb_build_object(
        'enabled', false,
        'mode', 'public',
        'autoReply', false,
        'allowPublicReplies', true,
        'allowPrivateReplies', true,
        'requiresHumanApproval', true
      ),
      'facebook_messenger', jsonb_build_object(
        'enabled', false,
        'mode', 'private',
        'autoReply', true,
        'allowPublicReplies', false,
        'allowPrivateReplies', true,
        'requiresHumanApproval', false
      ),
      'facebook_comments', jsonb_build_object(
        'enabled', false,
        'mode', 'public',
        'autoReply', false,
        'allowPublicReplies', true,
        'allowPrivateReplies', true,
        'requiresHumanApproval', true
      )
    )
  )
)
where scope = 'organization'
  and (
    metadata @> '{"agent_kind":"whatsapp"}'::jsonb
    or metadata @> '{"client_created":true}'::jsonb
    or agent_code = 'agente-whatsapp-sistema'
  )
  and not (coalesce(metadata, '{}'::jsonb) ? 'multichannel_config');
