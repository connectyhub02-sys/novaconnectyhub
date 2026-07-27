create index if not exists idx_customer_voices_org_owner_status
  on public.customer_voices (organization_id, owner_user_id, status);

drop policy if exists "voices visible to org members or platform admins" on public.customer_voices;
drop policy if exists "voices managed by org admins or platform admins" on public.customer_voices;
drop policy if exists "customer voices visible to owner org members or platform admins" on public.customer_voices;
drop policy if exists "customer voices managed by owner org members or platform admins" on public.customer_voices;

create policy "customer voices visible to owner org members or platform admins"
on public.customer_voices for select
using (
  public.is_platform_admin()
  or (
    owner_user_id = auth.uid()
    and public.is_organization_member(organization_id)
  )
  or (
    owner_user_id is null
    and public.is_organization_member(organization_id)
  )
);

create policy "customer voices managed by owner org members or platform admins"
on public.customer_voices for all
using (
  public.is_platform_admin()
  or (
    owner_user_id = auth.uid()
    and public.is_organization_member(organization_id)
  )
  or (
    owner_user_id is null
    and public.is_organization_admin(organization_id)
  )
)
with check (
  public.is_platform_admin()
  or (
    owner_user_id = auth.uid()
    and public.is_organization_member(organization_id)
  )
  or (
    owner_user_id is null
    and public.is_organization_admin(organization_id)
  )
);
