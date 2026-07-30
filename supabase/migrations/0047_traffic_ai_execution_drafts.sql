-- Traffic AI assisted execution drafts.
-- Stores provider-safe execution plans before any campaign or tracking change is applied.

create table if not exists public.traffic_ai_execution_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action_item_id uuid not null references public.traffic_ai_action_items(id) on delete cascade,
  platform text not null check (platform in ('meta', 'google')),
  execution_type text not null
    check (
      execution_type in (
        'sync_request',
        'tracking_checklist',
        'budget_adjustment',
        'creative_test',
        'conversion_audit',
        'organic_boost'
      )
    ),
  status text not null default 'drafted'
    check (status in ('drafted', 'approved', 'applied', 'cancelled', 'failed')),
  risk_level text not null default 'medium'
    check (risk_level in ('low', 'medium', 'high')),
  title text not null,
  objective text not null default '',
  steps jsonb not null default '[]'::jsonb,
  proposed_payload jsonb not null default '{}'::jsonb,
  rollback_plan text not null default '',
  provider_notes text not null default '',
  human_approval_required boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  applied_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_traffic_ai_execution_drafts_org_status
  on public.traffic_ai_execution_drafts (organization_id, platform, status, created_at desc);

create index if not exists idx_traffic_ai_execution_drafts_action
  on public.traffic_ai_execution_drafts (action_item_id, created_at desc);

create index if not exists idx_traffic_ai_execution_drafts_payload
  on public.traffic_ai_execution_drafts using gin (proposed_payload);

drop trigger if exists touch_traffic_ai_execution_drafts_updated_at on public.traffic_ai_execution_drafts;
create trigger touch_traffic_ai_execution_drafts_updated_at
before update on public.traffic_ai_execution_drafts
for each row execute function public.touch_updated_at();

alter table public.traffic_ai_execution_drafts enable row level security;

drop policy if exists "traffic ai execution drafts visible by members" on public.traffic_ai_execution_drafts;
create policy "traffic ai execution drafts visible by members"
on public.traffic_ai_execution_drafts for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "traffic ai execution drafts managed by org admins" on public.traffic_ai_execution_drafts;
create policy "traffic ai execution drafts managed by org admins"
on public.traffic_ai_execution_drafts for all
using (public.is_platform_admin() or public.is_organization_admin(organization_id))
with check (public.is_platform_admin() or public.is_organization_admin(organization_id));
