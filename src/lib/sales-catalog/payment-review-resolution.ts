import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { loadUazapiCredentials } from "@/lib/whatsapp/uazapi-credentials";

export async function sendResolvedPaymentReviewNotices(client: SupabaseClient) {
  const result = await client.from("sales_catalog_payment_reviews").select("*").eq("status", "resolved").eq("resolution_notice_state", "pending").limit(5);
  if (result.error) throw new Error("REVIEW_RESOLUTION_QUEUE_FAILED");
  let sent = 0;
  for (const review of result.data ?? []) {
    const claim = await client.from("sales_catalog_payment_reviews").update({ resolution_notice_state: "sending" }).eq("id", review.id).eq("resolution_notice_state", "pending").select("id").maybeSingle();
    if (!claim.data) continue;
    let requested = false;
    try {
      const { data: conversation } = await client.from("conversations").select("id, whatsapp_instance_id, provider_chat_id").eq("id", review.conversation_id).eq("organization_id", review.organization_id).eq("lead_id", review.lead_id).maybeSingle();
      const { data: lead } = await client.from("leads").select("phone_number").eq("id", review.lead_id).eq("organization_id", review.organization_id).maybeSingle();
      if (!conversation?.whatsapp_instance_id || !lead?.phone_number) throw new Error("RECIPIENT_UNAVAILABLE");
      const { data: instance } = await client.from("whatsapp_instances").select("instance_token_encrypted").eq("id", conversation.whatsapp_instance_id).eq("organization_id", review.organization_id).maybeSingle();
      if (!instance?.instance_token_encrypted) throw new Error("INSTANCE_UNAVAILABLE");
      const token = decryptCredentialValue(instance.instance_token_encrypted);
      const credentials = await loadUazapiCredentials(client);
      const orderResult = review.order_id ? await client.from("sales_catalog_orders").select("payment_status, metadata").eq("id", review.order_id).eq("organization_id", review.organization_id).maybeSingle() : { data: null, error: null };
      if (orderResult.error || (review.order_id && !orderResult.data)) throw new Error("ORDER_LOOKUP_UNAVAILABLE");
      const order = orderResult.data;
      const manualConfirmation = review.resolution === "confirmed" && order?.payment_status === "confirmed" && order.metadata?.financial_confirmation?.origin === "operator" && !order.metadata?.payment_whatsapp_notified_at;
      // Provider confirmations have their own notification pipeline; do not send twice.
      if (!manualConfirmation && (review.resolution === "confirmed" || order?.payment_status === "confirmed")) {
        await client.from("sales_catalog_payment_reviews").update({ resolution_notice_state: "superseded" }).eq("id", review.id);
        continue;
      }
      const text = manualConfirmation
        ? "Nossa equipe concluiu a conferência e confirmou o recebimento do seu pagamento. Seu pedido pode seguir. Obrigado por aguardar!"
        : "Nossa equipe concluiu a conferência e ainda não identificou o recebimento desse pagamento. Se seu banco mostra um débito, avise por aqui para continuarmos verificando. Se não houve débito, posso ajudar você a tentar outra forma de pagamento.";
      const message = await client.from("conversation_messages").upsert({ id: review.id, organization_id: review.organization_id, lead_id: review.lead_id, conversation_id: conversation.id, whatsapp_instance_id: conversation.whatsapp_instance_id,
        provider: "uazapi", provider_chat_id: conversation.provider_chat_id, direction: "outbound", message_type: "text", text_content: text, occurred_at: new Date().toISOString(),
        payload: { author_type: "system", delivery_source: "financial_review_resolution", review_id: review.id, delivery_status: "sending" } }, { onConflict: "id" });
      if (message.error) throw new Error("RESOLUTION_MESSAGE_SAVE_FAILED");
      requested = true;
      const response = await fetch(`${credentials.baseUrl.replace(/\/$/, "")}/send/text`, { method: "POST", headers: { "Content-Type": "application/json", token },
        body: JSON.stringify({ number: lead.phone_number, text, track_source: "connectyhub", track_id: `review_resolution_${review.id}`, linkPreview: false }), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error("RESOLUTION_DELIVERY_UNCONFIRMED");
      const body = await response.json().catch(() => null);
      if (!body || body.error || body.status === "error") throw new Error("RESOLUTION_DELIVERY_UNCONFIRMED");
      const providerId = typeof body.messageid === "string" ? body.messageid : typeof body.id === "string" ? body.id : null;
      const saved = await client.from("conversation_messages").update({ provider_message_id: providerId, payload: { author_type: "system", delivery_source: "financial_review_resolution", review_id: review.id, delivery_status: "sent" } }).eq("id", review.id).eq("organization_id", review.organization_id);
      if (saved.error) throw new Error("RESOLUTION_RECEIPT_SAVE_FAILED");
      const done = await client.from("sales_catalog_payment_reviews").update({ resolution_notice_state: "sent" }).eq("id", review.id);
      if (done.error) throw new Error("RESOLUTION_COMMIT_FAILED");
      sent++;
    } catch {
      // A network timeout may have delivered the message. Do not blindly resend it.
      await client.from("sales_catalog_payment_reviews").update({ resolution_notice_state: requested ? "unknown" : "pending" }).eq("id", review.id);
    }
  }
  return { sent };
}
