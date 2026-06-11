create table if not exists public.lead_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.conversation_messages(id) on delete set null,
  file_type text not null default 'unknown',
  mime_type text,
  original_name text,
  object_key text not null,
  public_url text not null,
  byte_size integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_files_lead
  on public.lead_files (lead_id, created_at desc);

create index if not exists idx_lead_files_org
  on public.lead_files (organization_id, created_at desc);

alter table public.lead_files enable row level security;

create policy "Org members can view lead files"
  on public.lead_files for select
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );
