import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function preparePlanPurchaseDiscount(client: SupabaseClient, paymentId: string) {
  const { data, error } = await client.rpc("prepare_plan_purchase_discount", { p_payment: paymentId });
  if (error || !data || !Number.isFinite(Number(data.amount_brl))) {
    throw new Error("Não foi possível conferir o desconto da primeira compra. Atualize o checkout antes de pagar.");
  }
  return Number(data.amount_brl);
}
