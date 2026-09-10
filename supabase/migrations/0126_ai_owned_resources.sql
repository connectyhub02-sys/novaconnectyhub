create table public.ai_resources (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.ai_projects(id),
 key_id uuid not null references public.ai_api_keys(id),
 kind text not null check(kind in ('file','cache','batch','operation','store','interaction','live')),
 status text not null default 'preparing', provider_name text,
 model_id text references public.ai_public_models(id), request_id uuid references public.ai_requests(id),
 metadata jsonb not null default '{}', created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), expires_at timestamptz
);
create index ai_resources_project_kind on public.ai_resources(project_id,kind,created_at desc);
alter table public.ai_resources enable row level security;
revoke all on public.ai_resources from public,anon,authenticated;
grant all on public.ai_resources to service_role;
