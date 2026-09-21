-- Unassigned legacy clones are not shared organization assets. The creator and
-- organization must both match, including writes through an authenticated JWT.
alter policy "customer voices visible to owner org members or platform admins"
on public.customer_voices using (
  public.is_platform_admin()
  or (owner_user_id = auth.uid() and public.is_organization_member(organization_id))
);

alter policy "customer voices managed by owner org members or platform admins"
on public.customer_voices using (
  public.is_platform_admin()
  or (owner_user_id = auth.uid() and public.is_organization_member(organization_id))
)
with check (
  public.is_platform_admin()
  or (owner_user_id = auth.uid() and public.is_organization_member(organization_id))
);
