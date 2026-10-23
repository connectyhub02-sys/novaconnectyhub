-- Opt-in agent voices: durable dispatch claims and metering recovery.
-- No existing behavior, tariff or financial row is rewritten.
create table if not exists public.agent_voice_generations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  request_key text not null check (length(request_key) between 1 and 128),
  input_hash text not null,
  status text not null check (status in ('processing','metering','uncertain','completed')),
  quote jsonb not null,
  generated jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, request_key)
);
alter table public.agent_voice_generations enable row level security;
revoke all on public.agent_voice_generations from public, anon, authenticated;
grant all on public.agent_voice_generations to service_role;
create index if not exists agent_voice_generations_pending on public.agent_voice_generations(updated_at) where status <> 'completed';
