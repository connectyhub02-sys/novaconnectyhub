begin;

alter table public.voice_generations add column studio_script jsonb;
alter table public.voice_generations add constraint voice_studio_script_object
  check (studio_script is null or (jsonb_typeof(studio_script) = 'object' and octet_length(studio_script::text) <= 1500000));

-- The long-operation insert and its recoverable script commit together.
create function public.capture_voice_studio_script() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.operation = 'long_tts' and jsonb_typeof(new.input->'script') = 'object' then
    update public.voice_generations set studio_script = new.input->'script' where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.capture_voice_studio_script() from public, anon, authenticated;
create trigger capture_voice_studio_script after insert on public.studio_operations
for each row execute function public.capture_voice_studio_script();

create table public.voice_studio_drafts (
  project_id uuid not null references public.voice_projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  script jsonb not null check (jsonb_typeof(script) = 'object' and octet_length(script::text) <= 1500000),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  primary key(project_id, user_id)
);
alter table public.voice_studio_drafts enable row level security;
revoke all on public.voice_studio_drafts from public, anon, authenticated;
grant all on public.voice_studio_drafts to service_role;
comment on table public.voice_studio_drafts is 'Private per-user/project editor draft. Access only through authenticated project-scoped server routes.';
create index voice_studio_history_page on public.voice_generations(project_id, organization_id, created_at desc, id desc);
create view public.voice_studio_history with (security_invoker = true) as
select g.* from public.voice_generations g
left join public.studio_operations s on s.id = g.id
where g.operation = 'text_to_speech' or s.operation = 'long_tts';
revoke all on public.voice_studio_history from public, anon, authenticated;
grant select on public.voice_studio_history to service_role;
notify pgrst, 'reload schema';
commit;
