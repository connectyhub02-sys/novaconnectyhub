import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { loadAsaasPlatformBillingConfig } from "@/lib/sales-catalog/asaas";
import { AsaasDirectError, createManagedAsaasInvoice, payManagedAsaasInvoice } from "@/lib/sales-catalog/asaas-direct";
import { directPaymentState } from "@/lib/sales-catalog/transparent-checkout";
import { billingLocalDate } from "./commercial-terms";
import { finishNativeBilling, type Attempt } from "./native-card-checkout";

export async function processAutomaticTopups(client: SupabaseClient, organizationId?: string) {
  let query = client.from("credit_topup_policies").select("organization_id,authorized_at").eq("enabled", true).order("last_checked_at", { nullsFirst: true }).limit(5);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const policies = await query;
  if (policies.error) throw new Error("Não foi possível consultar as recargas autorizadas.");
  const summary = { checked: 0, attempted: 0, approved: 0, declined: 0, pending: 0, failed: 0 };
  for (const policy of policies.data ?? []) {
    summary.checked++;
    const recordResult = async (code: string | null) => {
      const saved = await client.from("credit_topup_policies").update({ last_checked_at: new Date().toISOString(), last_error_code: code, last_error_at: code ? new Date().toISOString() : null }).eq("organization_id", policy.organization_id).eq("authorized_at", policy.authorized_at);
      if (saved.error) throw new Error("Não foi possível registrar a conferência da recarga.");
    };
    const claim = await client.rpc("claim_credit_topup", { p_org: policy.organization_id });
    if (claim.error) { summary.failed++; await recordResult("claim_failed"); continue; }
    if (!claim.data?.claimed) { await recordResult(null); continue; }
    let attempt = claim.data.attempt as Attempt;
    summary.attempted++;
    let dispatched = false;
    let errorCode: string | null = null;
    let pausePolicy = false;
    try {
      const card = await client.from("billing_asaas_card_vault").select("customer_id,token_encrypted").eq("id", claim.data.method_id).eq("organization_id", policy.organization_id).eq("status", "active").single();
      if (card.error || !card.data) throw new Error("Autorização de cartão indisponível.");
      const config = await loadAsaasPlatformBillingConfig({ client });
      // Persist dispatch intent BEFORE any provider mutation. Unknown outcomes
      // remain reserved for reconciliation and must never initiate another debit.
      const started = await client.from("billing_card_attempts").update({ stage: "charging", updated_at: new Date().toISOString() }).eq("id", attempt.id).eq("state", "processing").select("*").single();
      if (started.error) throw new Error("Não foi possível iniciar a recarga.");
      attempt = started.data as Attempt; dispatched = true;
      const invoice = await createManagedAsaasInvoice({ ...config, customerId: card.data.customer_id, amount: Number(attempt.amount), dueDate: billingLocalDate(new Date()), reference: attempt.external_reference, description: "Recarga de créditos ConnectyHub autorizada pelo titular" });
      if (!invoice.id) throw new Error("Cobrança em conferência.");
      const bound = await client.from("billing_card_attempts").update({ provider_payment_id: invoice.id }).eq("id", attempt.id).select("*").single();
      if (bound.error) throw new Error("Cobrança em conferência.");
      attempt = bound.data as Attempt;
      const saved = await client.from("billing_payments").update({ provider_payment_id: invoice.id }).eq("id", attempt.payment_id);
      if (saved.error) throw new Error("Cobrança em conferência.");
      const payment = await payManagedAsaasInvoice({ ...config, paymentId: invoice.id, reference: attempt.external_reference, customerId: card.data.customer_id, token: decryptCredentialValue(card.data.token_encrypted), amount: Number(attempt.amount) });
      const result = await finishNativeBilling(client, attempt, directPaymentState(payment), payment);
      if (result.state === "approved") summary.approved++;
      else if (["rejected", "error", "cancelled"].includes(result.state)) {
        if (result.state === "rejected") summary.declined++; else summary.failed++;
        errorCode = result.state;
        pausePolicy = true;
      } else { summary.pending++; errorCode = "payment_pending"; }
    } catch (error) {
      const definitive = !dispatched || (error instanceof AsaasDirectError && error.definitive);
      const declined = error instanceof AsaasDirectError && error.declined;
      if (declined) summary.declined++; else summary.failed++;
      errorCode = definitive ? declined ? "rejected" : "charge_failed" : "payment_unknown";
      try { await finishNativeBilling(client, attempt, definitive ? declined ? "rejected" : "error" : "unknown"); }
      catch { errorCode = "reconciliation_required"; }
      pausePolicy = definitive;
    }
    // A persistence failure after a known provider result must not reclassify it.
    if (pausePolicy) await disablePolicy(client, policy.organization_id, policy.authorized_at);
    await recordResult(errorCode);
  }
  return summary;
}
async function disablePolicy(client: SupabaseClient, organizationId: string, authorizedAt: string) {
  const result = await client.from("credit_topup_policies").update({ enabled: false, updated_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("authorized_at", authorizedAt);
  if (result.error) throw new Error("Não foi possível pausar a autorização de recarga recusada.");
}
