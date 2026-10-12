import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AccountCompletionRequiredError } from "@/lib/account/signup-completion";
import { readMetaReviewAccess } from "@/lib/auth/meta-review-access";
import { assertOrganizationFeatureAccess, PlanFeatureAccessError } from "@/lib/billing/access-control";
import { getOrganizationBillingAccess } from "@/lib/billing/trial";
import { resolvePlanFeatureEntitlement } from "@/lib/billing/plan-entitlements";

/** The review owner has no customer identity documents. Only a live, server-provisioned
 * grant for this organization waives signup, including in the background worker.
 * Billing, entitlement, contract checks and Meta permissions still apply. */
export async function assertOrganicPublishingAccess(client: SupabaseClient, organizationId: string) {
  try {
    return await assertOrganizationFeatureAccess({ client, organizationId, featureCode: "meta_organic_insights" });
  } catch (error) {
    if (!(error instanceof AccountCompletionRequiredError)) throw error;
    const { data: organization, error: ownerError } = await client.from("organizations")
      .select("owner_id").eq("id", organizationId).maybeSingle<{ owner_id: string | null }>();
    if (ownerError || !organization?.owner_id) throw error;
    const { data, error: authError } = await client.auth.admin.getUserById(organization.owner_id);
    const grant = !authError && data.user ? readMetaReviewAccess(data.user) : null;
    if (!grant?.active || grant.organizationId !== organizationId) throw error;
    const billingAccess = await getOrganizationBillingAccess({ client, organizationId });
    const entitlement = resolvePlanFeatureEntitlement("meta_organic_insights", {
      planCode: billingAccess.planCode, organizationStatus: billingAccess.organizationStatus,
      billingState: billingAccess.state, featureOverrides: billingAccess.featureOverrides,
    });
    if (!entitlement.allowed) throw new PlanFeatureAccessError(entitlement, billingAccess);
    return { billingAccess, entitlement };
  }
}
