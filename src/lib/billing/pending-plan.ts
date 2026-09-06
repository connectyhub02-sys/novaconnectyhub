import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDashboardBillingCheckoutPath, isBillingCheckoutPayable, loadBillingCheckoutIntent } from "./plan-checkout";

export async function loadPendingPlan(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client.from("organization_subscriptions")
    .select("id").eq("organization_id", organizationId).eq("subscription_kind", "plan")
    .in("status", ["pending", "incomplete", "past_due", "active"])
    .order("created_at", { ascending: false });
  if (error) throw new Error("Não foi possível consultar o pagamento do plano. Atualize a página.");
  for (const subscription of data ?? []) {
    const intent = await loadBillingCheckoutIntent(client, { organizationId, subscriptionId: subscription.id });
    if (!intent || !isBillingCheckoutPayable(intent)) continue;
    return {
      subscriptionId: subscription.id,
      planCode: intent.targetPlanCode,
      planName: intent.plan.name,
      amountBrl: Number(intent.invoice.total_brl),
      renewal: intent.checkoutKind === "renewal",
      checkoutUrl: buildDashboardBillingCheckoutPath(subscription.id),
    };
  }
  return null;
}
