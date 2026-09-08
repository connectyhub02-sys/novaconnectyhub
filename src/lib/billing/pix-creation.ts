import type { SupabaseClient } from "@supabase/supabase-js";
import { AsaasPixCreationError } from "@/lib/sales-catalog/asaas";

export function billingUsesPix(payload: Record<string, unknown> | null | undefined) {
  return payload?.payment_method === "pix" || payload?.billing_payment_method === "pix";
}

/** Release only this request's hold, and only when no payment could have been created. */
export async function releaseFailedBillingPixClaim(client: SupabaseClient, claim: {
  paymentId: string; organizationId: string; updatedAt: string; payload: Record<string, unknown>;
}, error: unknown) {
  if (!(error instanceof AsaasPixCreationError) || !error.safeToRetry) return false;
  const result = await client.from("billing_payments").update({
    payload: { ...claim.payload, pix_creation_pending: false, pix_creation_failure: { retryable: true, occurred_at: new Date().toISOString() } },
    updated_at: new Date().toISOString(),
  }).eq("id", claim.paymentId).eq("organization_id", claim.organizationId)
    .eq("updated_at", claim.updatedAt).eq("payload->>pix_creation_pending", "true")
    .select("id").maybeSingle();
  if (result.error) throw new Error("Não foi possível concluir a conferência do Pix. Aguarde antes de tentar novamente.");
  return Boolean(result.data);
}
