import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAsaasPlatformBillingConfig } from "@/lib/sales-catalog/asaas";
import { retireAsaasPayment } from "@/lib/sales-catalog/asaas-direct";

/** Financial reconciliation remains enabled while a checkout is held for replacement. */
export async function retirePlatformCheckout(
  client: SupabaseClient,
  organizationId: string,
  subscriptionId: string,
  actorId: string,
  nextPlanCode: string,
) {
  const payments = await client
    .from("billing_payments")
    .select("id,provider,provider_payment_id,status")
    .eq("organization_id", organizationId)
    .eq("subscription_id", subscriptionId)
    .in("status", ["pending", "rejected", "in_process"]);
  if (payments.error)
    throw new Error("Não foi possível conferir as cobranças anteriores.");
  if (payments.data.some((p) => p.status === "in_process"))
    throw new Error(
      "Há um pagamento em processamento. Aguarde a confirmação antes de trocar o plano.",
    );
  for (const payment of payments.data) {
    const hold = await client.rpc("hold_commercial_invoice_revision", {
      p_payment: payment.id,
    });
    if (hold.error)
      throw new Error(
        "A cobrança anterior está em processamento ou conferência. Aguarde antes de trocar o plano.",
      );
    try {
      if (payment.provider_payment_id) {
        if (payment.provider !== "asaas")
          throw new Error(
            "A cobrança anterior precisa ser encerrada pelo financeiro.",
          );
        await retireAsaasPayment(
          await loadAsaasPlatformBillingConfig({ client }),
          payment.provider_payment_id,
          !payment.provider_payment_id.startsWith("pay_"),
        );
      }
      const closed = await client.rpc("void_commercial_invoice_revision", {
        p_payment: payment.id,
        p_actor: actorId,
        p_next_plan: nextPlanCode,
      });
      if (closed.error)
        throw new Error(
          "A cobrança mudou durante a conferência. Aguarde a atualização financeira.",
        );
    } catch (error) {
      await client.from("commercial_events").upsert(
        {
          organization_id: organizationId,
          buyer_user_id: actorId,
          event_key: `invoice-retirement-review:${payment.id}`,
          event_type: "payment_review_required",
          payload: {
            payment_id: payment.id,
            notice:
              "A substituição da cobrança aguarda conferência financeira. Não iniciar outro pagamento até a conciliação.",
          },
        },
        { onConflict: "event_key", ignoreDuplicates: true },
      );
      throw error;
    }
  }
}
