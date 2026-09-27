-- Tráfego com IA em campanhas: cada número pode ter várias (ex.: "Semana do Whey" no status por 7 dias e
-- "IA livre" contínua nos canais). A sala de dúvidas e a interação com status continuam por número em
-- whatsapp_traffic_routines. A rotina de posts que já existia vira a primeira campanha do número.
create table if not exists public.whatsapp_traffic_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agent_registry(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  status text not null default 'active' check (status in ('active','paused','ended')),
  post_status boolean not null default false,
  target_ids uuid[] not null default '{}',
  product_mode text not null default 'featured' check (product_mode in ('featured','selected','single')),
  catalog_item_ids uuid[] not null default '{}',
  idea text check (idea is null or length(idea) <= 600),
  manual_text text check (manual_text is null or length(manual_text) <= 1500),
  post_format text not null default 'auto' check (post_format in ('auto','product_audio','product_button','text','poll')),
  intensity text not null default 'normal' check (intensity in ('light','normal','intense')),
  start_hour smallint not null default 9 check (start_hour between 6 and 20),
  schedule_mode text not null default 'continuous' check (schedule_mode in ('once','week','month','continuous')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  planned_until timestamptz,
  last_run_at timestamptz,
  last_error text,
  legacy_routine_id uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (post_status or cardinality(target_ids) > 0)
);
create index if not exists whatsapp_traffic_campaigns_agent on public.whatsapp_traffic_campaigns(organization_id, agent_id, created_at desc);
create index if not exists whatsapp_traffic_campaigns_due on public.whatsapp_traffic_campaigns(planned_until) where status = 'active';
alter table public.whatsapp_traffic_campaigns enable row level security;
revoke all on public.whatsapp_traffic_campaigns from public, anon, authenticated;
grant all on public.whatsapp_traffic_campaigns to service_role;

-- The existing routine of each number becomes its first campaign; what it had scheduled stays
-- attached to the new campaign (skip and pause keep working), and the routine stops planning posts.
insert into public.whatsapp_traffic_campaigns (organization_id, agent_id, name, status, post_status, target_ids, product_mode,
  catalog_item_ids, idea, post_format, intensity, start_hour, schedule_mode, planned_until, legacy_routine_id, updated_by)
select organization_id, agent_id, 'Tráfego contínuo', case when enabled then 'active' else 'paused' end, post_status, target_ids, product_mode,
  catalog_item_ids, idea, post_format, intensity, start_hour, 'continuous', planned_until, id, updated_by
from public.whatsapp_traffic_routines r
where (r.post_status or cardinality(r.target_ids) > 0)
  and not exists (select 1 from public.whatsapp_traffic_campaigns c where c.legacy_routine_id = r.id);

update public.content_pipeline_items i
set tags = i.tags || array['traffic_campaign', 'traffic_campaign:' || c.id::text]
from public.whatsapp_traffic_campaigns c
where c.legacy_routine_id is not null
  and i.tags @> array['traffic_routine:' || c.legacy_routine_id::text]
  and not i.tags @> array['traffic_campaign:' || c.id::text];

update public.whatsapp_traffic_routines set enabled = false, planned_until = null where enabled;

notify pgrst, 'reload schema';
