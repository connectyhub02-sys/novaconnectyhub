-- ConnectyHub WhatsApp operational core
-- Stores provider webhooks, CRM leads, conversations, and messages.

do $$
begin
  create type public.lead_status as enum ('new', 'active', 'qualified', 'won', 'lost', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.conversation_status as enum ('open', 'waiting_customer', 'waiting_agent', 'closed', 'archived');
exception
  when duplicate_object then null;
end $$;

alter table public.whatsapp_instances
  add column if not exists instance_token_encrypted text,
  add column if not exists webhook_configured_at timestamptz,
  add column if not exists last_synced_at timestamptz,
  add column if not exists provider_payload jsonb not null default '{}'::jsonb;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null default 'whatsapp',
  phone_number text,
  display_name text,
  status public.lead_status not null default 'new',
  score integer not null default 0 check (score >= 0 and score <= 100),
  source text,
  last_event_summary text,
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_leads_org_channel_phone
  on public.leads (organization_id, channel, phone_number)
  where phone_number is not null;

create index if not exists idx_leads_org_status_updated
  on public.leads (organization_id, status, updated_at desc);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  whatsapp_instance_id uuid references public.whatsapp_instances(id) on delete set null,
  channel text not null default 'whatsapp',
  provider text not null default 'uazapi',
  provider_chat_id text,
  status public.conversation_status not null default 'open',
  last_message_preview text,
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_conversations_org_provider_chat
  on public.conversations (organization_id, provider, provider_chat_id)
  where provider_chat_id is not null;

create index if not exists idx_conversations_org_status_updated
  on public.conversations (organization_id, status, updated_at desc);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  whatsapp_instance_id uuid references public.whatsapp_instances(id) on delete set null,
  provider text not null default 'uazapi',
  provider_message_id text,
  provider_chat_id text,
  direction text not null default 'unknown' check (direction in ('inbound', 'outbound', 'system', 'unknown')),
  message_type text,
  text_content text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_conversation_messages_provider_message
  on public.conversation_messages (provider, provider_message_id)
  where provider_message_id is not null;

create index if not exists idx_conversation_messages_conversation_time
  on public.conversation_messages (conversation_id, occurred_at desc);

create index if not exists idx_conversation_messages_org_time
  on public.conversation_messages (organization_id, occurred_at desc);

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'uazapi',
  event_type text not null default 'unknown',
  provider_instance_id text,
  whatsapp_instance_id uuid references public.whatsapp_instances(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  provider_message_id text,
  provider_chat_id text,
  payload_hash text not null,
  payload jsonb not null default '{}'::jsonb,
  headers jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'received',
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_whatsapp_webhook_events_payload_hash
  on public.whatsapp_webhook_events (provider, payload_hash);

create index if not exists idx_whatsapp_webhook_events_org_received
  on public.whatsapp_webhook_events (organization_id, received_at desc);

create index if not exists idx_whatsapp_webhook_events_instance_received
  on public.whatsapp_webhook_events (whatsapp_instance_id, received_at desc);

drop trigger if exists touch_leads_updated_at on public.leads;
create trigger touch_leads_updated_at
before update on public.leads
for each row execute function public.touch_updated_at();

drop trigger if exists touch_conversations_updated_at on public.conversations;
create trigger touch_conversations_updated_at
before update on public.conversations
for each row execute function public.touch_updated_at();

alter table public.leads enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.whatsapp_webhook_events enable row level security;

drop policy if exists "leads visible by organization" on public.leads;
create policy "leads visible by organization"
on public.leads for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "leads managed by organization admins" on public.leads;
create policy "leads managed by organization admins"
on public.leads for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "conversations visible by organization" on public.conversations;
create policy "conversations visible by organization"
on public.conversations for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "conversations managed by organization admins" on public.conversations;
create policy "conversations managed by organization admins"
on public.conversations for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "messages visible by organization" on public.conversation_messages;
create policy "messages visible by organization"
on public.conversation_messages for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "messages managed by organization admins" on public.conversation_messages;
create policy "messages managed by organization admins"
on public.conversation_messages for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "webhook events visible by organization" on public.whatsapp_webhook_events;
create policy "webhook events visible by organization"
on public.whatsapp_webhook_events for select
using (
  public.is_platform_admin()
  or (
    organization_id is not null
    and public.is_organization_member(organization_id)
  )
);

drop policy if exists "webhook events managed by platform admins" on public.whatsapp_webhook_events;
create policy "webhook events managed by platform admins"
on public.whatsapp_webhook_events for all
using (public.is_platform_admin())
with check (public.is_platform_admin());
