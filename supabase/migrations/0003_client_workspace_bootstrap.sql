drop policy if exists "organizations inserted by owner or platform admin" on public.organizations;
create policy "organizations inserted by owner or platform admin"
on public.organizations for insert
with check (public.is_platform_admin() or owner_id = auth.uid());

drop policy if exists "members inserted by self owner or platform admin" on public.organization_members;
create policy "members inserted by self owner or platform admin"
on public.organization_members for insert
with check (
  public.is_platform_admin()
  or (user_id = auth.uid() and role = 'owner')
);
