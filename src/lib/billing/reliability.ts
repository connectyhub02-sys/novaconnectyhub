import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingAttention } from "./attention";
export const billingReliabilityLabels = {
  blockedNotices: "Avisos aguardando remetente ou ativação",
  exhaustedNotices: "Avisos com tentativas esgotadas",
  uncertainNotices: "Avisos retidos: entrega não confirmada",
  overdueNotices: "Avisos atrasados na fila",
  unreconciledPayments: "Pagamentos aguardando conciliação há mais de 15 minutos",
  topupErrors: "Recargas que precisam de atenção",
  pixPending: "Autorizações Pix aguardando conferência",
  missedRenewals: "Renovações elegíveis sem tentativa hoje",
};
export type BillingReliability = { checkedAt: string } & Record<keyof typeof billingReliabilityLabels, number>;
export async function loadBillingReliability(client: SupabaseClient): Promise<BillingReliability> {
  const result = await client.rpc("billing_reliability_snapshot");
  if (result.error || !result.data) throw new Error("Não foi possível conferir a saúde das cobranças.");
  return result.data as BillingReliability;
}
export function billingReliabilityIssues(snapshot: BillingReliability) {
  return Object.entries(billingReliabilityLabels).flatMap(([key, label]) => {
    const count = Number(snapshot[key as keyof typeof billingReliabilityLabels]);
    return count > 0 ? [{ key, label, count }] : [];
  });
}
export async function loadBillingAttention(client: SupabaseClient): Promise<BillingAttention> {
  const result = await client.rpc("billing_attention_details");
  if (result.error || !result.data) throw new Error("Não foi possível carregar os detalhes financeiros.");
  return result.data as BillingAttention;
}
