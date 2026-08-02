import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getBillingPlanCatalog } from "@/lib/billing/plans";
import { buildPublicPricingPlans, type PublicPricingPlan } from "@/lib/billing/public-pricing";
import { createServiceClient } from "@/lib/supabase/service";

export async function loadPublicPricingPlans(
  supabase: SupabaseClient = createServiceClient(),
): Promise<PublicPricingPlan[]> {
  const catalog = await getBillingPlanCatalog(supabase);

  if (!catalog.schemaReady) {
    return [];
  }

  return buildPublicPricingPlans(catalog.plans.map((plan) => ({
    planCode: plan.planCode,
    name: plan.name,
    shortDescription: plan.shortDescription,
    status: plan.status,
    sortOrder: plan.sortOrder,
    highlighted: plan.highlighted,
    monthlyPriceBrl: plan.monthlyPriceBrl,
    includedCredits: plan.includedCredits,
    overageCreditPriceBrl: plan.overageCreditPriceBrl,
    autoRechargeMinCredits: plan.autoRechargeMinCredits,
    overageLimitCredits: plan.overageLimitCredits,
    trialDays: plan.trialDays,
    agentLimit: plan.agentLimit,
    whatsappInstanceLimit: plan.whatsappInstanceLimit,
    userLimit: plan.userLimit,
    moduleCodes: plan.moduleCodes,
  })));
}
