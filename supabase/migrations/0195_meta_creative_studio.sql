-- Results, provider usage and uncertain calls are durable and isolated by tenant.
create table public.meta_creative_jobs (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 input_hash text not null,
 mode text not null check(mode in ('analysis','campaign','script')),
 status text not null default 'running' check(status in ('running','generated','completed','failed','uncertain')),
 brief jsonb not null,
 result jsonb,
 provider_response jsonb,
 model text,
 usage_event_id uuid,
 charge_credits numeric,
 error_message text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index meta_creative_jobs_org_time on public.meta_creative_jobs(organization_id,created_at desc);
create unique index meta_creative_jobs_one_running on public.meta_creative_jobs(organization_id) where status in ('running','generated');
alter table public.meta_creative_jobs enable row level security;
revoke all on public.meta_creative_jobs from anon,authenticated;
grant all on public.meta_creative_jobs to service_role;
