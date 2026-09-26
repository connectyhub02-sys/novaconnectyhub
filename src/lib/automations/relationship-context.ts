import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WhatsappFollowUpEventData } from "@/lib/whatsapp/proactive-followup";
import { listOrganizationSalesCatalog } from "@/lib/client-os/sales-catalog";
import { buildLeadAwareSalesCatalogProductUrl } from "@/lib/sales-catalog/public-urls";
import {
  sellableRecommendation,
  type RelationshipProfile,
} from "./relationship-profile";
import { nextObservedWindow } from "./contact-window";

export async function relationshipContext(
  client: SupabaseClient,
  data: WhatsappFollowUpEventData,
  timezone: string,
) {
  const empty = {
    reason: null as string | null,
    context: "",
    link: "",
    deferUntil: null as string | null,
  };
  if (data.birthdayYear) {
    return { ...empty, context: "Hoje é aniversário do cliente. Mande parabéns curtos e calorosos, no seu estilo, como quem se lembrou dele. Não venda nada, não ofereça desconto nem presente e não mencione que o sistema guardou a data." };
  }
  if (!data.returnId && !data.recommendationProductId && !data.postSaleKind) return empty;
  const pending = await client
    .from("sales_catalog_orders")
    .select("id")
    .eq("organization_id", data.organizationId)
    .eq("lead_id", data.leadId)
    .in("status", ["draft", "pending_payment"])
    .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
    .limit(1);
  if (pending.error) throw new Error(pending.error.message);
  if (pending.data?.length)
    return { ...empty, reason: "active_purchase_has_priority" };
  if (data.returnId) {
    const visit = await client
      .from("customer_lead_visits")
      .select("id,description,occurred_at,return_at,return_status,return_note,source")
      .eq("organization_id", data.organizationId)
      .eq("lead_id", data.leadId)
      .eq("id", data.returnId)
      .maybeSingle();
    if (visit.error) throw new Error(visit.error.message);
    const v = visit.data;
    if (
      !v ||
      !["pending", "scheduled"].includes(v.return_status) ||
      !v.return_at ||
      Date.parse(v.return_at) > Date.now()
    )
      return { ...empty, reason: "return_not_due" };
    const booked = await client
      .from("customer_agenda_bookings")
      .select("id")
      .eq("organization_id", data.organizationId)
      .eq("lead_id", data.leadId)
      .eq("status", "booked")
      .gte("ends_at", new Date().toISOString())
      .limit(1);
    if (booked.error) throw new Error(booked.error.message);
    if (booked.data?.length) return { ...empty, reason: "lead_already_booked" };
    const note = typeof v.return_note === "string" && v.return_note.trim() ? v.return_note.trim() : null;
    if (v.source === "agent") {
      return { ...empty, context: `Retorno pedido pelo próprio cliente: ele pediu para ser chamado nesta data (${JSON.stringify(note ?? v.description)}). Retome o assunto com naturalidade, como combinado, e pergunte como pode ajudar agora. Nenhum horário foi reservado e nenhum pagamento foi criado.` };
    }
    return {
      ...empty,
      context: `Convite de retorno: houve um registro confirmado de ${JSON.stringify(v.description)} em ${new Date(v.occurred_at).toLocaleDateString("pt-BR", { timeZone: timezone })}. A data prevista de retorno chegou. ${note ? `Orientação do responsável sobre o que falar: ${JSON.stringify(note)}. ` : ""}Convide com naturalidade a voltar e pergunte se deseja combinar uma data. Nenhum horário foi reservado e nenhum pagamento foi criado. Não diga que o cliente está atrasado ou tem obrigação de voltar.`,
    };
  }
  if (data.postSaleKind) return postSaleContext(client, data, timezone);
  const profileResult = await client
    .from("automation_lead_profiles")
    .select("evidence,preferences,updated_at")
    .eq("organization_id", data.organizationId)
    .eq("lead_id", data.leadId)
    .maybeSingle();
  if (profileResult.error) throw new Error(profileResult.error.message);
  const profile = profileResult.data?.evidence as
    RelationshipProfile | undefined;
  if (
    !profile?.contactWindow ||
    Date.parse(profileResult.data!.updated_at) < Date.now() - 3 * 86400000
  )
    return { ...empty, reason: "insufficient_behavior_evidence" };
  const now = new Date(),
    observed = nextObservedWindow(now, profile.contactWindow, timezone);
  if (
    !profileResult.data?.preferences?.windowStart &&
    observed.getTime() > now.getTime()
  )
    return { ...empty, deferUntil: observed.toISOString() };
  const catalog = await listOrganizationSalesCatalog(
    client,
    data.organizationId,
    150,
  );
  const product = catalog.find(
    (item) => item.id === data.recommendationProductId,
  );
  if (
    !product ||
    !sellableRecommendation(product) ||
    (product.assignedAgentIds.length &&
      !product.assignedAgentIds.includes(data.agentId))
  )
    return { ...empty, reason: "product_unavailable" };
  const recent = await client
    .from("automation_dispatches")
    .select("id")
    .eq("organization_id", data.organizationId)
    .eq("lead_id", data.leadId)
    .in("journey", ["return", "recommendation"])
    .eq("status", "sent")
    .gte("sent_at", new Date(Date.now() - 7 * 86400000).toISOString())
    .limit(1);
  if (recent.error) throw new Error(recent.error.message);
  if (recent.data?.length)
    return { ...empty, reason: "relationship_contact_interval" };
  return {
    ...empty,
    context: `Recomendação baseada em compras ou interesses repetidos, sem expor rastreamento. Produto disponível: ${JSON.stringify({ title: product.title, price: product.offer.salePrice || product.price, category: product.category })}. Mensagens habituais do lead têm cerca de ${profile.typicalMessageLength} caracteres; adapte a extensão sem imitar erros. Apresente o produto com leveza, sem afirmar que o lead quer comprar. Um link real para ver o produto será anexado; não invente outro link nem afirme que já gerou pedido ou Pix.`,
    link: buildLeadAwareSalesCatalogProductUrl({
      productId: product.id,
      organizationId: data.organizationId,
      leadId: data.leadId,
      conversationId: data.conversationId,
      agentId: data.agentId,
    }),
  };
}

/** Post-sale: how the purchase went, or one complementary product. Never both in the same message. */
async function postSaleContext(client: SupabaseClient, data: WhatsappFollowUpEventData, timezone: string) {
  const empty = { reason: null as string | null, context: "", link: "", deferUntil: null as string | null };
  const order = await client.from("sales_catalog_orders").select("id,created_at,payment_status,status")
    .eq("organization_id", data.organizationId).eq("lead_id", data.leadId).eq("id", data.postSaleOrderId ?? "").maybeSingle();
  if (order.error) throw new Error(order.error.message);
  if (!order.data || order.data.payment_status !== "confirmed" || ["cancelled", "needs_human"].includes(order.data.status)) return { ...empty, reason: "order_not_paid" };
  const items = await client.from("sales_catalog_order_items").select("title,quantity").eq("organization_id", data.organizationId).eq("order_id", order.data.id);
  if (items.error) throw new Error(items.error.message);
  const bought = (items.data ?? []).map(item => `${item.quantity && item.quantity > 1 ? `${item.quantity}x ` : ""}${item.title}`).join(", ") || "o pedido";
  const when = new Date(order.data.created_at).toLocaleDateString("pt-BR", { timeZone: timezone });
  if (data.postSaleKind === "checkin") {
    return { ...empty, context: `Pós-venda: o cliente comprou ${JSON.stringify(bought)} em ${when}. Pergunte, curto e com naturalidade, se deu tudo certo com a compra ou o atendimento. Não ofereça produtos nesta mensagem e não afirme que o pedido já foi entregue. Se ele relatar algum problema, acolha e diga que vai verificar.` };
  }
  const catalog = await listOrganizationSalesCatalog(client, data.organizationId, 150);
  const product = catalog.find(item => item.id === data.crossSellProductId);
  if (!product || !sellableRecommendation(product) || (product.assignedAgentIds.length && !product.assignedAgentIds.includes(data.agentId))) {
    return { ...empty, reason: "product_unavailable" };
  }
  return {
    ...empty,
    context: `Pós-venda: o cliente comprou ${JSON.stringify(bought)} em ${when}. Sugira com leveza um complemento que combina com essa compra: ${JSON.stringify({ title: product.title, price: product.offer.salePrice || product.price, category: product.category })}. Diga por que combina em uma frase, sem pressão e sem afirmar que ele precisa. Um link real para ver o produto será anexado; não invente outro link nem afirme que já gerou pedido ou Pix.`,
    link: buildLeadAwareSalesCatalogProductUrl({ productId: product.id, organizationId: data.organizationId, leadId: data.leadId, conversationId: data.conversationId, agentId: data.agentId }),
  };
}
