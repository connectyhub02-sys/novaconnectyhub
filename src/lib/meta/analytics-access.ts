import "server-only";
import { getMetaWorkspace, requireMetaCompanyAccess } from "./company-access";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveDashboardCompanyId } from "@/lib/client-os/dashboard-route-scope";
import { assertBillableAccess } from "@/lib/billing/trial";
import { resolvePlanFeatureEntitlement } from "@/lib/billing/plan-entitlements";
import { metaFeatureLaunchPaused } from "./launch-status";
import { readMetaReviewAccess } from "@/lib/auth/meta-review-access";

export class AnalyticsAccessError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function metaAnalyticsAccess(request: Request) {
  const requested = new URL(request.url).searchParams.get("companyId");
  const workspace = requested ? await getCurrentWorkspace() : await getMetaWorkspace();
  if (!workspace) throw new AnalyticsAccessError("Sessão obrigatória.", 401);
  const organizationId = requested ? resolveDashboardCompanyId({ workspace, requestedCompanyId: requested }) : workspace.organization?.id;
  if (!organizationId) throw new AnalyticsAccessError("Selecione a empresa.", 422);
  const client = createServiceClient();
  const company = await requireMetaCompanyAccess({ client, userId: workspace.user.id, companyId: organizationId });
  if (metaFeatureLaunchPaused) throw new AnalyticsAccessError("Meta Ads temporariamente indisponível.", 403);
  const entitlement = resolvePlanFeatureEntitlement("meta_ads_analytics", { isPlatformAdmin: workspace.profile.isPlatformAdmin,
    organizationStatus: company.status, planCode: company.planCode, featureOverrides: company.featureOverrides });
  if (!entitlement.allowed) throw new AnalyticsAccessError(entitlement.description, 403);
  await assertBillableAccess({ client, organizationId });
  return { client, organizationId, company, workspace, selectedAccountOnly: Boolean(readMetaReviewAccess(workspace.user)) };
}
