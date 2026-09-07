import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAsaasPlatformBillingConfig } from "@/lib/sales-catalog/asaas";
import { AsaasDirectError, createManagedAsaasInvoice, payManagedAsaasInvoice } from "@/lib/sales-catalog/asaas-direct";
import { directPaymentState } from "@/lib/sales-catalog/transparent-checkout";
import { loadActiveAsaasCard } from "./asaas-card-vault";
import { billingLocalDate } from "./commercial-terms";
import { managedRenewalDay } from "./managed-renewal-policy";
import { finishNativeBilling, type Attempt } from "./native-card-checkout";
import { loadBillingCheckoutIntent } from "./plan-checkout";

export async function attemptManagedAsaasRenewal(client: SupabaseClient, input: {organizationId: string; subscriptionId: string; periodEnd: Date | null; now: Date; prepare: () => Promise<unknown>}) {
  const skipped = {attempted: false, approved: false, failed: false};
  if (!managedRenewalDay(input.periodEnd, input.now)) return skipped;
  const card = await loadActiveAsaasCard(client, input.organizationId, input.subscriptionId);
  if (!card) return skipped;
  await input.prepare();
  const intent = await loadBillingCheckoutIntent(client,{organizationId:input.organizationId,subscriptionId:input.subscriptionId});
  if (!intent) return skipped;
  const claimed = await client.rpc("claim_managed_asaas_renewal",{p_subscription:input.subscriptionId,p_payment:intent.payment.id,p_attempt:randomUUID(),p_method:card.id,p_expected_end:input.periodEnd!.toISOString(),p_now:input.now.toISOString()});
  if (claimed.error) throw new Error("Não foi possível reservar a tentativa de renovação.");
  if (!claimed.data?.claimed) return skipped;
  let attempt = claimed.data.attempt as Attempt;
  const reference = `billing_managed:${intent.payment.id}`;
  try {
    const config = await loadAsaasPlatformBillingConfig({client});
    let paymentId = intent.payment.provider_payment_id;
    if (!paymentId) {
      const payment = await createManagedAsaasInvoice({...config,customerId:card.customerId,amount:Number(attempt.amount),dueDate:billingLocalDate(input.periodEnd!),reference});
      paymentId = payment.id!;
    }
    const saved = await client.from("billing_card_attempts").update({provider_payment_id:paymentId,stage:"charging",updated_at:new Date().toISOString()}).eq("id",attempt.id).select("*").single();
    if (saved.error) throw new AsaasDirectError(false,false);
    attempt = saved.data as Attempt;
    const bound = await client.from("billing_payments").update({provider_payment_id:paymentId}).eq("id",intent.payment.id);
    if(bound.error) throw new AsaasDirectError(false,false);
    const payment = await payManagedAsaasInvoice({...config,paymentId,reference,customerId:card.customerId,token:card.token,amount:Number(attempt.amount)});
    const result = await finishNativeBilling(client,attempt,directPaymentState(payment),payment);
    return {attempted:true,approved:result.state==="approved",failed:["rejected","error"].includes(result.state)};
  } catch (error) {
    const definitive = error instanceof AsaasDirectError && error.definitive;
    if (error instanceof AsaasDirectError && error.diagnostic) {
      const saved = await client.from("billing_card_attempts").update({diagnostic:error.diagnostic}).eq("id",attempt.id);
      if(saved.error) throw new Error("Tentativa em conferência. Nenhuma nova cobrança será enviada.");
    }
    const state = definitive ? error.declined ? "rejected" : "error" : "unknown";
    await finishNativeBilling(client,attempt,state);
    return {attempted:true,approved:false,failed:definitive};
  }
}
