-- Assisted access is a server-issued capability bound to both real Auth sessions.
-- No client role (including an organization's owner) can issue or inspect it.
-- The existing own-profile UPDATE policy must not permit self-promotion.
create function public.guard_platform_admin_assignment() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user in ('anon','authenticated') and
    ((tg_op='INSERT' and new.is_platform_admin is true) or
     (tg_op='UPDATE' and new.is_platform_admin is distinct from old.is_platform_admin)) then
    raise exception 'PLATFORM_ADMIN_ASSIGNMENT_SERVER_ONLY';
  end if;
  return new;
end $$;
revoke all on function public.guard_platform_admin_assignment() from public,anon,authenticated;
create trigger guard_platform_admin_assignment before insert or update on public.profiles
for each row execute function public.guard_platform_admin_assignment();

create table public.admin_assisted_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  admin_session_id uuid not null,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  target_session_id uuid not null unique,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  revoked_at timestamptz,
  check (admin_user_id <> target_user_id),
  check (expires_at > started_at and expires_at <= started_at + interval '30 minutes')
);
alter table public.admin_assisted_sessions enable row level security;
revoke all on public.admin_assisted_sessions from public, anon, authenticated;
grant select, insert, update on public.admin_assisted_sessions to service_role;

create function public.check_admin_assisted_session(p_token_hash text, p_target_session_id uuid, p_target_user_id uuid, p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare access public.admin_assisted_sessions;
begin
  -- Also serializes revocation with an authorized destructive transaction.
  select * into access from public.admin_assisted_sessions
  where token_hash=p_token_hash and target_session_id=p_target_session_id
    and target_user_id=p_target_user_id and organization_id=p_organization_id
  for share;
  if access.id is null or access.revoked_at is not null or access.expires_at <= clock_timestamp() then return null; end if;
  if not exists (
    select 1 from public.profiles p join auth.users u on u.id=p.id
    join auth.sessions s on s.user_id=p.id and s.id=access.admin_session_id
    where p.id=access.admin_user_id and p.is_platform_admin is true
      and (u.banned_until is null or u.banned_until <= clock_timestamp())
      and (s.not_after is null or s.not_after > clock_timestamp())
  ) then return null; end if;
  if not exists (
    select 1 from auth.sessions s join auth.users u on u.id=s.user_id
    join public.profiles p on p.id=u.id
    join public.organization_members m on m.user_id=u.id and m.organization_id=access.organization_id
    join public.organizations o on o.id=m.organization_id
    where s.id=access.target_session_id and s.user_id=access.target_user_id
      and p.is_platform_admin is not true and o.plan_code <> 'internal'
      and o.slug is distinct from 'connectyhub-platform-whatsapp'
      and (u.banned_until is null or u.banned_until <= clock_timestamp())
      and (s.not_after is null or s.not_after > clock_timestamp())
  ) then return null; end if;
  return jsonb_build_object('id',access.id,'adminUserId',access.admin_user_id,'expiresAt',access.expires_at);
end $$;
revoke all on function public.check_admin_assisted_session(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.check_admin_assisted_session(text,uuid,uuid,uuid) to service_role;

-- Keep the entire deletion, replay protection, busy guards and storage manifest.
-- Its old service entrypoint is closed; only the checked wrapper may invoke it.
revoke all on function public.reset_lead_data(uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;
create function public.reset_lead_data_assisted(p_token_hash text,p_target_session_id uuid,p_target_user_id uuid,p_organization_id uuid,p_lead_id uuid,p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare access jsonb; result jsonb;
begin
  access:=public.check_admin_assisted_session(p_token_hash,p_target_session_id,p_target_user_id,p_organization_id);
  if access is null then raise exception 'RESET_ASSISTED_ACCESS_REQUIRED'; end if;
  if p_confirm is distinct from true then raise exception 'RESET_CONFIRMATION_REQUIRED'; end if;
  result:=public.reset_lead_data(p_organization_id,p_lead_id,(access->>'adminUserId')::uuid,true);
  return result;
end $$;
revoke all on function public.reset_lead_data_assisted(text,uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reset_lead_data_assisted(text,uuid,uuid,uuid,uuid,boolean) to service_role;
