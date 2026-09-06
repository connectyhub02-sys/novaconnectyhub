import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reconcileTransparentAttempt, resolveTransparentConnection, directPaymentState } from "./transparent-checkout";
import { getAsaasNativePayment } from "./asaas-direct";
import { paymentOutcomeCopy, type PaymentDiagnostic } from "./payment-diagnostics";
import { handleSalesCatalogPaymentStatusChange } from "./post-payment";
import { processWhatsappHandoffNotification, type WhatsappHandoffNotificationEventData } from "@/lib/whatsapp/handoff-notifications";

export type PaymentReview = { id: string; organization_id: string; lead_id: string; order_id: string | null; conversation_id: string | null; status: string; notification_status: string; requested_at: string; notification_payload?: WhatsappHandoffNotificationEventData | null; notification_claimed_at?: string | null };

export async function getLeadPaymentReviews(client: SupabaseClient, organizationId: string, leadId: string) {
  const result = await client.from("sales_catalog_payment_reviews").select("*").eq("organization_id", organizationId).eq("lead_id", leadId).neq("status", "resolved").order("requested_at");
  if (result.error) throw new Error("PAYMENT_REVIEW_LOOKUP_FAILED");
  return (result.data ?? []) as PaymentReview[];
}

export async function assertOrderPaymentReviewClear(client: SupabaseClient, orderId: string) {
  const { error } = await client.rpc("assert_checkout_review_clear", { p_order_id: orderId });
  if (error) throw new Error("Este pagamento está em conferência pela equipe. Aguarde antes de tentar pagar novamente.");
}

/** Re-read by tenant and lead; never create a payment to discover a previous result. */
export async function refreshLeadOrderFinance(client: SupabaseClient, organizationId: string, leadId: string, orderId: string) {
  const { data: order, error } = await client.from("sales_catalog_orders").select("id, lead_id, total, payment_status, latest_payment_session_id, metadata")
    .eq("id", orderId).eq("organization_id", organizationId).eq("lead_id", leadId).maybeSingle();
  if (error || !order) throw new Error("FINANCIAL_ORDER_NOT_FOUND");
  const checkedAt = new Date().toISOString();
  const claim = await client.rpc("claim_lead_payment_check", { p_order_id: orderId, p_organization_id: organizationId, p_lead_id: leadId });
  if (claim.error) throw new Error("FINANCIAL_CHECK_UNAVAILABLE");
  let unavailable = false;
  if (claim.data) {
    const { data: attempts, error: attemptsError } = await client.from("sales_catalog_card_attempts").select("id").eq("organization_id", organizationId).eq("order_id", orderId).order("created_at", { ascending: false }).limit(12);
    if (attemptsError) throw new Error("FINANCIAL_ATTEMPTS_UNAVAILABLE");
    for (const attempt of attempts ?? []) {
      try { await reconcileTransparentAttempt(client, attempt.id, true); } catch { unavailable = true; }
    }
    const sessions = await client.from("sales_catalog_payment_sessions").select("id, provider, provider_payment_id, external_reference, amount, method, status, metadata")
      .eq("organization_id", organizationId).eq("order_id", orderId).order("created_at", { ascending: false }).limit(30);
    if (sessions.error) throw new Error("FINANCIAL_SESSIONS_UNAVAILABLE");
    for (const session of sessions.data ?? []) {
      if (session.metadata?.transparent_checkout || !session.provider_payment_id || session.status === "refunded") continue;
      if (session.provider !== "asaas" || session.metadata?.asaas_checkout_id) { unavailable = true; continue; }
      try {
        const connection = await resolveTransparentConnection(client, organizationId, orderId);
        const payment = await getAsaasNativePayment(connection, session.provider_payment_id);
        if (!payment || payment.id !== session.provider_payment_id || payment.externalReference !== session.external_reference || Math.abs(Number(payment.value) - Number(session.amount)) > 0.011) throw new Error("PAYMENT_REFERENCE_MISMATCH");
        const state = directPaymentState(payment);
        const result = await client.rpc("apply_verified_catalog_payment", { p_session_id: session.id, p_organization_id: organizationId, p_state: state, p_provider_status: payment.status ?? "", p_provider_id: payment.id });
        if (result.error) throw new Error("PAYMENT_RECONCILIATION_FAILED");
        if (result.data?.changed) await handleSalesCatalogPaymentStatusChange({ client, organizationId, orderId, paymentSessionId: session.id, providerPaymentId: payment.id ?? null, paymentMethod: session.method, paymentMethodLabel: session.method === "pix" ? "Pix" : "Cartão", status: state, source: "lead_financial_check" });
      } catch { unavailable = true; }
    }
    const saved = await client.from("intelligence_events").insert({ scope: "organization", organization_id: organizationId, source_type: "sales_catalog_order", source_id: orderId,
      event_type: "sales_catalog.payment_checked", title: "Pagamento consultado", summary: unavailable ? "Consulta parcial: há resultados que precisam de conferência." : "Situação financeira consultada pelo atendimento.", visibility: "organization", tags: ["payment", "lead_tracking"], payload: { lead_id: leadId, order_id: orderId, checked_at: checkedAt, origin: "backend", result: unavailable ? "partial" : "checked" } });
    if (saved.error) throw new Error("FINANCIAL_AUDIT_FAILED");
  }
  return { checkedAt, unavailable };
}

export async function loadOrderFinancialSummary(client: SupabaseClient, organizationId: string, orderIds: string[]) {
  if (!orderIds.length) return new Map<string, string>();
  const [attempts, reviews] = await Promise.all([
    client.from("sales_catalog_card_attempts").select("order_id, state, diagnostic, created_at").eq("organization_id", organizationId).in("order_id", orderIds).order("created_at", { ascending: false }),
    client.from("sales_catalog_payment_reviews").select("order_id, status").eq("organization_id", organizationId).in("order_id", orderIds).neq("status", "resolved"),
  ]);
  if (attempts.error || reviews.error) throw new Error("FINANCIAL_CONTEXT_UNAVAILABLE");
  const summary = new Map<string, string>();
  for (const attempt of attempts.data ?? []) if (!summary.has(attempt.order_id)) summary.set(attempt.order_id, `Última tentativa de cartão em ${attempt.created_at}: ${paymentOutcomeCopy(attempt.state, attempt.diagnostic as PaymentDiagnostic)} O estado consolidado do pedido prevalece sobre tentativas antigas.`);
  for (const review of reviews.data ?? []) summary.set(review.order_id, "Conferência financeira humana aberta. Não cobrar, oferecer produtos ou liberar entrega até resolução verificada.");
  return summary;
}

export async function deliverPaymentReviewNotification(client: SupabaseClient, reviewId: string) {
  const pending = await client.from("sales_catalog_payment_reviews").select("*").eq("id", reviewId).neq("status", "resolved").maybeSingle();
  if (pending.error) throw new Error("REVIEW_NOTIFICATION_LOOKUP_FAILED");
  if (pending.data && !pending.data.notification_payload) {
    const row = pending.data;
    const [conversation, lead] = await Promise.all([
      client.from("conversations").select("whatsapp_instance_id, metadata").eq("id", row.conversation_id).eq("organization_id", row.organization_id).eq("lead_id", row.lead_id).maybeSingle(),
      client.from("leads").select("display_name, phone_number").eq("id", row.lead_id).eq("organization_id", row.organization_id).maybeSingle(),
    ]);
    if (conversation.error || lead.error || !conversation.data?.whatsapp_instance_id) throw new Error("REVIEW_NOTIFICATION_CONTEXT_UNAVAILABLE");
    const notification: WhatsappHandoffNotificationEventData = { organizationId: row.organization_id, leadId: row.lead_id, conversationId: row.conversation_id,
      whatsappInstanceId: conversation.data.whatsapp_instance_id, agentId: conversation.data.metadata?.agent_id ?? null,
      leadName: lead.data?.display_name, leadPhone: lead.data?.phone_number, requestedAt: row.requested_at, source: "financial_review",
      requestText: `Conferência financeira pendente. Pedido: ${row.order_id ?? "identificar com o cliente"}. Revisão: ${row.id}. Consulte a conversa e os anexos no arquivo do lead. Não solicite novo pagamento antes da conferência.` };
    const saved = await client.from("sales_catalog_payment_reviews").update({ notification_payload: notification }).eq("id", row.id).is("notification_payload", null);
    if (saved.error) throw new Error("REVIEW_NOTIFICATION_CONTEXT_SAVE_FAILED");
  }
  const { data: review, error } = await client.rpc("claim_payment_review_notification", { p_review_id: reviewId });
  if (error) throw new Error("REVIEW_NOTIFICATION_CLAIM_FAILED");
  if (!review?.notification_payload) return;
  const outcome = await processWhatsappHandoffNotification({ client, data: review.notification_payload }).catch(() => ({ status: "failed" as const }));
  const saved = await client.from("sales_catalog_payment_reviews").update({ notification_status: outcome.status === "sent" ? "sent" : "pending", notification_claimed_at: null,
    notification_next_at: new Date(Date.now() + 300000).toISOString() }).eq("id", reviewId).eq("notification_claimed_at", review.notification_claimed_at);
  if (saved.error) throw new Error("REVIEW_NOTIFICATION_SAVE_FAILED");
}

export async function recoverPaymentReviewNotifications(client: SupabaseClient) {
  const result = await client.from("sales_catalog_payment_reviews").select("id").neq("notification_status", "sent").neq("status", "resolved").lte("notification_next_at", new Date().toISOString()).limit(10);
  if (result.error) throw new Error("REVIEW_NOTIFICATION_QUEUE_FAILED");
  for (const review of result.data ?? []) await deliverPaymentReviewNotification(client, review.id);
  return { checked: result.data?.length ?? 0 };
}
