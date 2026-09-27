-- Quem conversou com o agente num grupo e deve ser chamado no privado depois que a sala fechar
-- (ou 45 min após a última mensagem, quando não há sala). Uma linha pendente por pessoa e grupo.
create table if not exists public.whatsapp_group_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  whatsapp_instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  agent_id uuid not null references public.agent_registry(id) on delete cascade,
  group_jid text not null check (group_jid like '%@g.us'),
  sender_jid text not null check (sender_jid like '%@s.whatsapp.net'),
  sender_name text,
  question text check (question is null or length(question) <= 500),
  purchase_intent boolean not null default false,
  last_message_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','sent','skipped')),
  result text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists whatsapp_group_invites_one_pending on public.whatsapp_group_invites(whatsapp_instance_id, group_jid, sender_jid) where status = 'pending';
create index if not exists whatsapp_group_invites_due on public.whatsapp_group_invites(last_message_at) where status = 'pending';
alter table public.whatsapp_group_invites enable row level security;
revoke all on public.whatsapp_group_invites from public, anon, authenticated;
grant all on public.whatsapp_group_invites to service_role;

notify pgrst, 'reload schema';
