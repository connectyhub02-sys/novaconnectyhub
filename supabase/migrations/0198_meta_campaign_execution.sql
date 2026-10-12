create table public.meta_campaign_executions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 proposal_id uuid not null references public.meta_creative_jobs(id), user_id uuid not null references auth.users(id),
 status text not null default 'draft' check(status in ('draft','creating','awaiting_media','paused','activating','active','pausing','uncertain')),
 snapshot jsonb not null, snapshot_hash text not null, remote_ids jsonb not null default '{}',
 pending_step text, start_at timestamptz, end_at timestamptz, remote_fingerprint text,
 activation_approval jsonb, error_message text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,proposal_id)
);
alter table public.meta_campaign_executions enable row level security;
revoke all on public.meta_campaign_executions from public,anon,authenticated;
grant all on public.meta_campaign_executions to service_role;
create index meta_campaign_executions_org_time on public.meta_campaign_executions(organization_id,created_at desc);
create function public.protect_meta_campaign_snapshot() returns trigger language plpgsql as $$
begin
 if new.organization_id<>old.organization_id or new.proposal_id<>old.proposal_id or new.snapshot<>old.snapshot or new.snapshot_hash<>old.snapshot_hash then raise exception 'Campaign snapshot is immutable'; end if;
 return new;
end $$;
create trigger protect_meta_campaign_snapshot before update on public.meta_campaign_executions for each row execute function public.protect_meta_campaign_snapshot();
