-- Status postados pelos leads e o que o agente já fez em cada um (ver, reagir, comentar). Um status dura
-- 24 h; o sistema busca os que ainda estão no ar e age com ritmo humano e limite diário por número.
create table if not exists public.whatsapp_lead_statuses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  whatsapp_instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  agent_id uuid references public.agent_registry(id) on delete set null,
  lead_id uuid references public.leads(id) on delete cascade,
  sender_phone text not null check (length(sender_phone) between 8 and 20),
  provider_message_id text not null check (length(provider_message_id) between 1 and 200),
  message_type text,
  caption text check (caption is null or length(caption) <= 1000),
  posted_at timestamptz not null,
  expires_at timestamptz not null,
  viewed_at timestamptz,
  reacted_at timestamptz,
  reaction text,
  commented_at timestamptz,
  comment_text text,
  attempts smallint not null default 0,
  last_error text,
  source text not null default 'poll' check (source in ('poll','webhook')),
  created_at timestamptz not null default now(),
  unique (whatsapp_instance_id, provider_message_id)
);
create index if not exists whatsapp_lead_statuses_pending on public.whatsapp_lead_statuses(whatsapp_instance_id, expires_at) where lead_id is not null;
create index if not exists whatsapp_lead_statuses_daily on public.whatsapp_lead_statuses(whatsapp_instance_id, created_at desc);
alter table public.whatsapp_lead_statuses enable row level security;
revoke all on public.whatsapp_lead_statuses from public, anon, authenticated;
grant all on public.whatsapp_lead_statuses to service_role;

notify pgrst, 'reload schema';
