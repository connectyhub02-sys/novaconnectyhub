-- Support sessions may target an account that has not created a workspace yet.
-- NULL is account-only scope, never a wildcard tenant grant.
alter table public.admin_assisted_sessions alter column organization_id drop not null;

create or replace function public.check_admin_assisted_session(p_token_hash text, p_target_session_id uuid, p_target_user_id uuid, p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare access public.admin_assisted_sessions;
begin
  -- Also serializes revocation with an authorized destructive transaction.
  select * into access from public.admin_assisted_sessions
  where token_hash=p_token_hash and target_session_id=p_target_session_id
    and target_user_id=p_target_user_id and organization_id is not distinct from p_organization_id
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
    left join public.organization_members m on m.user_id=u.id and m.organization_id=access.organization_id
    left join public.organizations o on o.id=m.organization_id
    where s.id=access.target_session_id and s.user_id=access.target_user_id
      and p.is_platform_admin is not true
      and ((access.organization_id is null and not exists (
        select 1 from public.organization_members existing where existing.user_id=access.target_user_id
      )) or (access.organization_id is not null and o.id is not null and o.plan_code <> 'internal'))
      and o.slug is distinct from 'connectyhub-platform-whatsapp'
      and (u.banned_until is null or u.banned_until <= clock_timestamp())
      and (s.not_after is null or s.not_after > clock_timestamp())
  ) then return null; end if;
  return jsonb_build_object('id',access.id,'adminUserId',access.admin_user_id,'expiresAt',access.expires_at);
end $$;
revoke all on function public.check_admin_assisted_session(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.check_admin_assisted_session(text,uuid,uuid,uuid) to service_role;

create or replace function public.reset_lead_data_assisted(p_token_hash text,p_target_session_id uuid,p_target_user_id uuid,p_organization_id uuid,p_lead_id uuid,p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare access jsonb; result jsonb;
begin
  if p_organization_id is null then raise exception 'RESET_ASSISTED_ACCESS_REQUIRED'; end if;
  access:=public.check_admin_assisted_session(p_token_hash,p_target_session_id,p_target_user_id,p_organization_id);
  if access is null then raise exception 'RESET_ASSISTED_ACCESS_REQUIRED'; end if;
  if p_confirm is distinct from true then raise exception 'RESET_CONFIRMATION_REQUIRED'; end if;
  result:=public.reset_lead_data(p_organization_id,p_lead_id,(access->>'adminUserId')::uuid,true);
  return result;
end $$;
revoke all on function public.reset_lead_data_assisted(text,uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reset_lead_data_assisted(text,uuid,uuid,uuid,uuid,boolean) to service_role;
