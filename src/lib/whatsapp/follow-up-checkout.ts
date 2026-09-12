import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSalesCatalogCheckoutUrl, normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";

// Read an existing checkout only. A follow-up never creates a payment session.
export async function loadFollowUpCheckout(client: SupabaseClient, organizationId: string, leadId: string, orderId: string) {
  const { data: order, error } = await client.from("sales_catalog_orders")
    .select("id,status,payment_status,total,latest_payment_session_id,checkout_payment_lock,conversation_id,metadata")
    .eq("organization_id", organizationId).eq("lead_id", leadId).eq("id", orderId).maybeSingle();
  if (error) throw new Error("Não foi possível conferir o pedido da retomada.");
  if (!order || !["draft", "pending_payment"].includes(order.status) || order.checkout_payment_lock
    || !["pending", "not_started", "unpaid"].includes(order.payment_status)
    || !order.latest_payment_session_id) return "";
  const lines = await client.from("sales_catalog_order_items").select("catalog_item_id")
    .eq("organization_id", organizationId).eq("order_id", order.id);
  if (lines.error) throw new Error("Não foi possível conferir os itens da retomada.");
  const ids = (lines.data ?? []).map(line => line.catalog_item_id).filter(Boolean);
  if (!ids.length || ids.length !== lines.data?.length) return "";
  const products = await client.from("intelligence_memory").select("id,metadata")
    .eq("organization_id", organizationId).eq("scope", "organization").eq("memory_type", "sales_catalog_item").in("id", ids);
  if (products.error) throw new Error("Não foi possível conferir a ação dos itens.");
  if (new Set(products.data?.map(item => item.id)).size !== new Set(ids).size
    || products.data?.some(item => (item.metadata?.sales_destination ?? "connectyhub_checkout") !== "connectyhub_checkout")) return "";
  const { data: session, error: sessionError } = await client.from("sales_catalog_payment_sessions")
    .select("id,status,amount,metadata,provider_status,expires_at")
    .eq("organization_id", organizationId).eq("order_id", order.id).eq("id", order.latest_payment_session_id).maybeSingle();
  if (sessionError) throw new Error("Não foi possível conferir o checkout da retomada.");
  if (!session || !["created", "pending"].includes(session.status)
    || session.metadata?.gateway_request_inflight === true
    || session.metadata?.gateway_available === false
    || ["gateway_error", "gateway_unavailable"].includes(String(session.provider_status).toLowerCase())
    || (session.expires_at && Date.parse(session.expires_at) <= Date.now())
    || !normalizeCurrencyAmount(order.total)
    || normalizeCurrencyAmount(session.amount) !== normalizeCurrencyAmount(order.total)) return "";
  const { data: lead, error: leadError } = await client.from("leads").select("metadata")
    .eq("organization_id", organizationId).eq("id", leadId).maybeSingle();
  if (leadError) throw new Error("Não foi possível conferir a forma de pagamento escolhida.");
  const state = lead?.metadata?.checkout_runtime_state;
  const url = new URL(buildSalesCatalogCheckoutUrl(session.id));
  // The Pix session may still exist while the customer chooses card in the
  // checkout. Preserve navigation preference without changing the real charge.
  if (state?.organization_id === organizationId && state.order_id === order.id
    && order.conversation_id && state.conversation_id === order.conversation_id
    && order.metadata?.whatsapp_instance_id && state.instance_id === order.metadata.whatsapp_instance_id
    && ["card", "pix"].includes(state.preferred_payment_method)) {
    url.searchParams.set("payment_method", state.preferred_payment_method);
  }
  return url.toString();
}

export function claimsMissingFollowUpCheckout(text: string, checkoutLink: string) {
  if (checkoutLink) return false;
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(?:botao|link|clique|clicar|acessar|visualizar)\b/.test(normalized)
    && /\b(?:checkout|pagamento|pagar|pix|compra)\b/.test(normalized);
}
