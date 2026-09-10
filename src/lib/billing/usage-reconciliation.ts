import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { debitCredits, type BillingProvider } from "./cost-center";

/** Retry only newly marked, priced usage; never reprice historical free usage. */
export async function reconcileUsageDebits(client: SupabaseClient) {
  const { data, error } = await client.from("usage_events")
    .select("id,organization_id,provider,connecty_charge_credits")
    .eq("status", "pending").in("billing_mode", ["customer_billable", "trial_billable"])
    .gt("connecty_charge_credits", 0).not("debit_retry_at", "is", null)
    .lte("debit_retry_at", new Date().toISOString()).order("debit_retry_at").limit(100);
  if (error) throw new Error("Não foi possível consultar os débitos pendentes.");
  let completed = 0, pending = 0;
  for (const row of data ?? []) {
    try {
      await debitCredits(client, {
        organizationId: row.organization_id, usageEventId: row.id,
        provider: row.provider as BillingProvider, amountCredits: Number(row.connecty_charge_credits),
        description: "Conclusão de consumo em conferência",
        metadata: { reconciliation: true },
      });
      completed++;
    } catch {
      const updated = await client.from("usage_events")
        .update({ debit_retry_at: new Date(Date.now() + 60 * 60000).toISOString() })
        .eq("id", row.id).eq("status", "pending");
      if (updated.error) throw new Error("Não foi possível reagendar a conferência do consumo.");
      pending++;
    }
  }
  return { completed, pending };
}
