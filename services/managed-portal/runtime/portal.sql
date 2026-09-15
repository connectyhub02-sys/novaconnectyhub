-- Applies only to the independent managed_portal database, after migrations 0150-0153.
begin;
do $$ begin if current_database()<>'managed_portal' then raise exception 'Wrong database'; end if; end $$;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.profiles enable row level security;
alter table public.ai_projects enable row level security;
alter table public.voice_projects enable row level security;
-- INSERT ... RETURNING must allow the new row for an explicit infrastructure admin.
-- The stable project lookup cannot see that row yet in the insertion snapshot.
alter policy managed_projects_read on public.managed_projects using(public.is_infrastructure_admin() or public.can_access_managed_project(id));
create policy portal_own_memberships on public.organization_members for select to authenticated using(user_id=auth.uid() or public.is_infrastructure_admin());
create function public.portal_create_company(p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid:=gen_random_uuid();begin
if not public.is_infrastructure_admin() then raise exception 'Forbidden';end if;
if p_name is null or length(trim(p_name))=0 or length(p_name)>100 then raise exception 'Invalid name';end if;
insert into public.organizations(id,name) values(v,trim(p_name));return v;end $$;
create function public.portal_add_company_member(p_company uuid,p_user uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin if not public.is_infrastructure_admin() then raise exception 'Forbidden';end if;
insert into public.organization_members(organization_id,user_id,role) values(p_company,p_user,'member') on conflict do nothing;return true;end $$;
revoke all on function public.portal_create_company(text),public.portal_add_company_member(uuid,uuid) from public,anon;
grant execute on function public.portal_create_company(text),public.portal_add_company_member(uuid,uuid) to authenticated;
commit;
