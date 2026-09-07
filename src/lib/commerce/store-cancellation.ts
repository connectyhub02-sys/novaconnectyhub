import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { retireCheckoutPaymentsBeforeCartChange } from "@/lib/sales-catalog/transparent-checkout";

export async function cancelStoreAgreement(
  client: SupabaseClient,
  organizationId: string,
  agreementId: string,
) {
  const cancelled = await client.rpc("cancel_store_commercial_agreement", {
    p_agreement: agreementId,
    p_org: organizationId,
  });
  if (cancelled.error)
    throw new Error("Não foi possível cancelar a renovação.");
  const periods = await client
    .from("commercial_agreement_periods")
    .select("order_id")
    .eq("agreement_id", agreementId)
    .is("paid_at", null);
  if (periods.error)
    throw new Error(
      "A renovação foi cancelada. A equipe precisa conferir as cobranças abertas.",
    );
  let pending = false;
  for (const period of periods.data) {
    if (!period.order_id) continue;
    try {
      await retireCheckoutPaymentsBeforeCartChange(
        client,
        organizationId,
        period.order_id,
      );
    } catch {
      pending = true;
    }
  }
  return {
    ok: true,
    message: pending
      ? "Renovações futuras canceladas. Uma tentativa anterior ainda está em conferência; acompanhe o resultado pelo checkout."
      : "Próximas renovações canceladas. O período já pago permanece registrado.",
  };
}
