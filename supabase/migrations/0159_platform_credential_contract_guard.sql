-- Global credentials belong to the platform, not to a customer contract.
-- Keep tenant credentials subject to the original membership/contract guard.
alter policy operational_contract_required on public.integration_credentials
using (
  (scope = 'platform' and organization_id is null and public.is_platform_admin())
  or (scope = 'organization' and public.can_operate_organization(organization_id))
)
with check (
  (scope = 'platform' and organization_id is null and public.is_platform_admin())
  or (scope = 'organization' and public.can_operate_organization(organization_id))
);
