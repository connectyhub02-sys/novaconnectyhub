import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** New requests only; existing financial confirmations must always be reconciled. */
export async function assertStoreAgreementPayable(
  client: SupabaseClient,
  organizationId: string,
  orderId: string,
) {
  const period = await client
    .from("commercial_agreement_periods")
    .select("agreement_id,paid_at")
    .eq("order_id", orderId)
    .maybeSingle();
  if (period.error) throw new Error("Não foi possível conferir a assinatura.");
  if (!period.data) return;
  if (period.data.paid_at)
    throw new Error(
      "Este período já está pago. Atualize o checkout para acompanhar seu pedido.",
    );
  const agreement = await client
    .from("commercial_agreements")
    .select("id,state,cancel_at_period_end,reservation_expires_at")
    .eq("id", period.data.agreement_id)
    .eq("organization_id", organizationId)
    .single();
  if (agreement.error)
    throw new Error("Não foi possível conferir a assinatura.");
  const a = agreement.data;
  if (a.cancel_at_period_end || ["cancelled", "ended"].includes(a.state))
    throw new Error(
      "As próximas cobranças desta contratação foram canceladas. Faça um novo pedido para contratar novamente.",
    );
  if (
    a.state === "reserved" &&
    Date.parse(a.reservation_expires_at) <= Date.now()
  )
    throw new Error(
      "A reserva desta oferta expirou. Faça um novo pedido para conferir as condições atuais.",
    );
  const pending = await client.rpc("store_agreement_change_pending", {
    p_agreement: a.id,
  });
  if (pending.error)
    throw new Error("Não foi possível conferir a alteração da assinatura.");
  if (pending.data)
    throw new Error(
      "Você está alterando esta assinatura. Conclua pelo checkout da nova contratação.",
    );
}
