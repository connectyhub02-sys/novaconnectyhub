-- Agent visual identity references for clone/self-photo handling.

create table if not exists public.agent_visual_identity_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agent_registry(id) on delete cascade,
  whatsapp_instance_id uuid references public.whatsapp_instances(id) on delete set null,
  source text not null default 'manual_upload',
  status text not null default 'queued',
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null default 0,
  storage_provider text not null default 'cloudflare-r2',
  storage_key text not null,
  storage_url text not null,
  descriptor jsonb not null default '{}'::jsonb,
  processing_error text,
  processed_at timestamptz,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_visual_identity_references_status_check
    check (status in ('queued', 'processing', 'ready', 'failed', 'archived')),
  constraint agent_visual_identity_references_source_check
    check (source in ('manual_upload', 'whatsapp_profile', 'admin_upload', 'imported')),
  constraint agent_visual_identity_references_size_check
    check (size_bytes >= 0)
);

create index if not exists idx_agent_visual_identity_refs_agent_status
  on public.agent_visual_identity_references (agent_id, status, created_at desc);

create index if not exists idx_agent_visual_identity_refs_org_status
  on public.agent_visual_identity_references (organization_id, status, created_at desc);

create index if not exists idx_agent_visual_identity_refs_instance
  on public.agent_visual_identity_references (whatsapp_instance_id, status, created_at desc);

drop trigger if exists touch_agent_visual_identity_references_updated_at on public.agent_visual_identity_references;
create trigger touch_agent_visual_identity_references_updated_at
before update on public.agent_visual_identity_references
for each row execute function public.touch_updated_at();

create table if not exists public.agent_visual_identity_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agent_registry(id) on delete cascade,
  whatsapp_instance_id uuid references public.whatsapp_instances(id) on delete set null,
  conversation_id uuid,
  inbound_message_id uuid references public.conversation_messages(id) on delete set null,
  matched_reference_id uuid references public.agent_visual_identity_references(id) on delete set null,
  status text not null default 'pending',
  confidence numeric(5,2),
  provider text not null default 'gemini',
  model_id text,
  prompt_version text not null default 'visual_identity_v1',
  summary text,
  evidence jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  constraint agent_visual_identity_matches_status_check
    check (status in ('pending', 'high_confidence', 'possible', 'no_match', 'failed', 'disabled', 'no_reference')),
  constraint agent_visual_identity_matches_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 100))
);

create index if not exists idx_agent_visual_identity_matches_message
  on public.agent_visual_identity_matches (inbound_message_id);

create index if not exists idx_agent_visual_identity_matches_agent_created
  on public.agent_visual_identity_matches (agent_id, created_at desc);

create index if not exists idx_agent_visual_identity_matches_conversation
  on public.agent_visual_identity_matches (conversation_id, created_at desc);

alter table public.agent_visual_identity_references enable row level security;
alter table public.agent_visual_identity_matches enable row level security;

drop policy if exists "visual identity references visible by agent scope" on public.agent_visual_identity_references;
create policy "visual identity references visible by agent scope"
on public.agent_visual_identity_references for select
using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.agent_registry agents
    where agents.id = agent_visual_identity_references.agent_id
      and agents.scope = 'organization'
      and agents.organization_id is not null
      and public.is_organization_member(agents.organization_id)
  )
);

drop policy if exists "visual identity references managed by owners" on public.agent_visual_identity_references;
create policy "visual identity references managed by owners"
on public.agent_visual_identity_references for all
using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.agent_registry agents
    where agents.id = agent_visual_identity_references.agent_id
      and agents.scope = 'organization'
      and agents.organization_id is not null
      and public.is_organization_admin(agents.organization_id)
  )
)
with check (
  public.is_platform_admin()
  or exists (
    select 1
    from public.agent_registry agents
    where agents.id = agent_visual_identity_references.agent_id
      and agents.scope = 'organization'
      and agents.organization_id is not null
      and public.is_organization_admin(agents.organization_id)
  )
);

drop policy if exists "visual identity matches visible by agent scope" on public.agent_visual_identity_matches;
create policy "visual identity matches visible by agent scope"
on public.agent_visual_identity_matches for select
using (
  public.is_platform_admin()
  or (
    organization_id is not null
    and public.is_organization_member(organization_id)
  )
  or exists (
    select 1
    from public.agent_registry agents
    where agents.id = agent_visual_identity_matches.agent_id
      and agents.scope = 'organization'
      and agents.organization_id is not null
      and public.is_organization_member(agents.organization_id)
  )
);

drop policy if exists "visual identity matches managed by owners" on public.agent_visual_identity_matches;
create policy "visual identity matches managed by owners"
on public.agent_visual_identity_matches for all
using (
  public.is_platform_admin()
  or (
    organization_id is not null
    and public.is_organization_admin(organization_id)
  )
  or exists (
    select 1
    from public.agent_registry agents
    where agents.id = agent_visual_identity_matches.agent_id
      and agents.scope = 'organization'
      and agents.organization_id is not null
      and public.is_organization_admin(agents.organization_id)
  )
)
with check (
  public.is_platform_admin()
  or (
    organization_id is not null
    and public.is_organization_admin(organization_id)
  )
  or exists (
    select 1
    from public.agent_registry agents
    where agents.id = agent_visual_identity_matches.agent_id
      and agents.scope = 'organization'
      and agents.organization_id is not null
      and public.is_organization_admin(agents.organization_id)
  )
);

grant select, insert, update, delete on public.agent_visual_identity_references to authenticated;
grant select, insert, update, delete on public.agent_visual_identity_matches to authenticated;
grant all on public.agent_visual_identity_references to service_role;
grant all on public.agent_visual_identity_matches to service_role;
