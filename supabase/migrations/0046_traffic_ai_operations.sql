-- Traffic AI operational history and action queue.
-- Turns dashboard recommendations into auditable analyses and actionable tasks.

create table if not exists public.traffic_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform text not null check (platform in ('meta', 'google')),
  score integer not null default 0 check (score >= 0 and score <= 100),
  status text not null default 'stable'
    check (status in ('critical', 'attention', 'stable', 'growth')),
  summary text not null default '',
  next_action text not null default '',
  analysis_text text,
  plan_snapshot jsonb not null default '{}'::jsonb,
  usage_event_id uuid references public.usage_events(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_traffic_ai_analyses_org_created
  on public.traffic_ai_analyses (organization_id, platform, created_at desc);

create index if not exists idx_traffic_ai_analyses_snapshot
  on public.traffic_ai_analyses using gin (plan_snapshot);

create table if not exists public.traffic_ai_action_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  analysis_id uuid references public.traffic_ai_analyses(id) on delete set null,
  platform text not null check (platform in ('meta', 'google')),
  recommendation_id text not null default '',
  category text not null default 'budget'
    check (category in ('tracking', 'creative', 'budget', 'conversion', 'organic', 'sync')),
  priority text not null default 'medium'
    check (priority in ('critical', 'high', 'medium', 'low')),
  status text not null default 'queued'
    check (status in ('suggested', 'queued', 'approved', 'in_progress', 'done', 'dismissed')),
  title text not null,
  detail text not null default '',
  action text not null default '',
  impact text not null default '',
  metric_label text not null default '',
  metric_value text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_traffic_ai_action_items_org_status
  on public.traffic_ai_action_items (organization_id, platform, status, created_at desc);

create index if not exists idx_traffic_ai_action_items_analysis
  on public.traffic_ai_action_items (analysis_id, created_at desc);

create index if not exists idx_traffic_ai_action_items_metadata
  on public.traffic_ai_action_items using gin (metadata);

drop trigger if exists touch_traffic_ai_action_items_updated_at on public.traffic_ai_action_items;
create trigger touch_traffic_ai_action_items_updated_at
before update on public.traffic_ai_action_items
for each row execute function public.touch_updated_at();

alter table public.traffic_ai_analyses enable row level security;
alter table public.traffic_ai_action_items enable row level security;

drop policy if exists "traffic ai analyses visible by members" on public.traffic_ai_analyses;
create policy "traffic ai analyses visible by members"
on public.traffic_ai_analyses for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "traffic ai analyses managed by org admins" on public.traffic_ai_analyses;
create policy "traffic ai analyses managed by org admins"
on public.traffic_ai_analyses for all
using (public.is_platform_admin() or public.is_organization_admin(organization_id))
with check (public.is_platform_admin() or public.is_organization_admin(organization_id));

drop policy if exists "traffic ai actions visible by members" on public.traffic_ai_action_items;
create policy "traffic ai actions visible by members"
on public.traffic_ai_action_items for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "traffic ai actions managed by org admins" on public.traffic_ai_action_items;
create policy "traffic ai actions managed by org admins"
on public.traffic_ai_action_items for all
using (public.is_platform_admin() or public.is_organization_admin(organization_id))
with check (public.is_platform_admin() or public.is_organization_admin(organization_id));
