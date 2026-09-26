-- Tráfego no WhatsApp: uma rotina contínua por agente. O dono escolhe onde divulgar (status, grupos,
-- canais), o que divulgar e a intensidade; o sistema planeja e agenda o dia seguinte sozinho.
-- As opções de interação com o status dos leads ficam gravadas aqui e passam a agir quando os
-- status dos contatos chegarem pelo webhook.
create table if not exists public.whatsapp_traffic_routines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agent_registry(id) on delete cascade,
  enabled boolean not null default false,
  post_status boolean not null default true,
  target_ids uuid[] not null default '{}',
  product_mode text not null default 'featured' check (product_mode in ('featured','selected')),
  catalog_item_ids uuid[] not null default '{}',
  idea text check (idea is null or length(idea) <= 600),
  intensity text not null default 'normal' check (intensity in ('light','normal','intense')),
  start_hour smallint not null default 9 check (start_hour between 6 and 20),
  lead_status_view boolean not null default false,
  lead_status_react boolean not null default false,
  lead_status_comment boolean not null default false,
  planned_until timestamptz,
  last_run_at timestamptz,
  last_error text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, agent_id)
);
create index if not exists whatsapp_traffic_routines_due on public.whatsapp_traffic_routines(planned_until) where enabled;
alter table public.whatsapp_traffic_routines enable row level security;
revoke all on public.whatsapp_traffic_routines from public, anon, authenticated;
grant all on public.whatsapp_traffic_routines to service_role;

notify pgrst, 'reload schema';
