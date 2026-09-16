import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { isSalesCatalogDisplayableProduct } from "@/lib/sales-catalog/shared";
import type { CommerceAgentResolvedContext } from "./server";
import { canRunWebActions, hasCartConfirmation, isWebActionRequest, planWebAction, readWebAction, type WebAction } from "./web-actions";

type Context = Extract<CommerceAgentResolvedContext, { ok: true }>;
type Row = {
  id: string; status: string; lead_id: string | null; conversation_id: string | null;
  created_by_agent_id: string | null; surface: string;
  request_payload: { web_action: WebAction };
  result_payload?: Record<string, unknown>;
  metadata: { visitor_id: string | null; session_id: string | null; page_path: string | null; expires_at: number };
};

async function catalog(context: Context, productId?: string) {
  let query = context.client.from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("organization_id", context.organization.id).eq("scope", "organization")
    .eq("memory_type", "sales_catalog_item").filter("metadata->>status", "eq", "active");
  if (productId) query = query.eq("id", productId);
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(200);
  if (error) throw new Error("Catálogo indisponível.");
  return (data ?? []).map(mapSalesCatalogItem).filter(isSalesCatalogDisplayableProduct).map(item => ({
    id: item.id, title: item.title,
    canAdd: item.salesDestination === "connectyhub_checkout" && !item.foodComposition?.enabled
      && (item.offer.salePrice ?? item.price) !== null
      && !(item.inventory.status === "out_of_stock" && !item.inventory.allowBackorder),
  }));
}

export async function prepareWebAction(context: Context, message: string) {
  if (!context.commerceSessionId || !canRunWebActions(context.settings.commerceAgent.mode, context.surface) || !isWebActionRequest(message)) return null;
  const planned = planWebAction({ message, mode: context.settings.commerceAgent.mode, surface: context.surface,
    currentProductId: context.productId, products: await catalog(context) });
  if (!planned) return null;
  const action = readWebAction({ ...planned, id: randomUUID() });
  if (!action) return null;
  return { action, reply: action.kind === "request_add_to_cart_confirmation"
    ? `Posso adicionar ${action.quantity} unidade(s) de ${action.productTitle} ao carrinho? Confirme no botão abaixo.`
    : action.productTitle ? `Encontrei ${action.productTitle}. Vou mostrar o item na página.`
      : action.kind === "open_checkout" ? "Vou abrir a revisão do carrinho. Você poderá conferir os itens e continuar por lá."
        : action.kind === "open_cart" ? "Vou abrir seu carrinho para você conferir." : "Vou mostrar essa seção da página." };
}

/** Persist before exposing the command. Existing SQL action types stay compatible. */
export async function issueWebAction(context: Context, action: WebAction) {
  const { error } = await context.client.from("commerce_agent_actions").insert({
    id: action.id, organization_id: context.organization.id, commerce_session_id: context.commerceSessionId,
    lead_id: context.leadId, conversation_id: context.conversationId, created_by_agent_id: context.agentId,
    action_type: action.kind === "request_add_to_cart_confirmation" ? "add_to_cart" : "suggest_product",
    status: "suggested", surface: context.surface, catalog_item_id: action.productId ?? null,
    reason: action.reason, request_payload: { web_action: action },
    metadata: { visitor_id: context.visitorId, session_id: context.sessionId, page_path: context.pagePath,
      expires_at: Date.now() + 5 * 60_000, agent_name: context.agentName },
  });
  if (error) throw new Error("Não foi possível registrar a ação.");
  await recordAssistedAction(context, action, "suggested");
}

export class WebActionError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export async function handleWebAction(context: Context, body: Record<string, unknown>) {
  if (!canRunWebActions(context.settings.commerceAgent.mode, context.surface)) throw new WebActionError("Ações indisponíveis nesta superfície.", 403);
  if (typeof body.web_action_id !== "string" || !/^[\da-f-]{36}$/i.test(body.web_action_id)) throw new WebActionError("Ação inválida.", 422);
  const { data, error } = await context.client.from("commerce_agent_actions").select("*")
    .eq("organization_id", context.organization.id).eq("commerce_session_id", context.commerceSessionId)
    .eq("id", body.web_action_id).maybeSingle<Row>();
  if (error) throw new Error("Registro indisponível.");
  if (!data || data.lead_id !== context.leadId || data.conversation_id !== context.conversationId
    || data.created_by_agent_id !== context.agentId || data.surface !== context.surface
    || data.metadata?.visitor_id !== context.visitorId || data.metadata?.session_id !== context.sessionId
    || data.metadata?.page_path !== context.pagePath) throw new WebActionError("Ação não pertence a este atendimento.", 403);
  const action = readWebAction(data.request_payload?.web_action);
  if (!action || action.id !== data.id) throw new WebActionError("Ação inválida.", 422);
  const phase = body.phase;
  if (!["execute", "reject", "complete"].includes(String(phase))) throw new WebActionError("Etapa inválida.", 422);
  const status = phase === "execute" ? "accepted" : phase === "reject" ? "rejected" : body.outcome === "failed" ? "failed" : body.outcome === "applied" ? "applied" : null;
  if (!status) throw new WebActionError("Resultado inválido.", 422);
  if (phase !== "complete" && (!Number.isFinite(data.metadata.expires_at) || data.metadata.expires_at < Date.now())) throw new WebActionError("Ação expirada. Peça novamente ao agente.");
  if (phase === "execute") {
    if (action.kind === "add_to_cart_after_confirmation") throw new WebActionError("Confirmação ausente.", 403);
    if (action.kind === "request_add_to_cart_confirmation" && !hasCartConfirmation(action, body.confirmation)) throw new WebActionError("Confirme o item e a quantidade no botão.", 403);
    if (action.productId) {
      const product = (await catalog(context, action.productId))[0];
      if (!product || (action.kind === "request_add_to_cart_confirmation" && !product.canAdd)) throw new WebActionError("Item indisponível para esta ação.");
    }
  }
  const expected = phase === "complete" ? "accepted" : "suggested";
  // Completion may be retried after a lost response. Execution may not be replayed.
  if (phase === "complete" && data.status === status) {
    await recordAssistedAction(context, action, status);
    return { ok: true };
  }
  if (data.status !== expected) throw new WebActionError("Esta ação já foi tratada. Peça novamente se necessário.");
  const { data: changed, error: updateError } = await context.client.from("commerce_agent_actions")
    .update({ status, applied_at: status === "applied" ? new Date().toISOString() : null,
      result_payload: { ...data.result_payload, phase, status, reported_by: phase === "complete" ? "lead_browser" : "lead_ui",
        ...(phase === "execute" && action.kind === "request_add_to_cart_confirmation" ? {
          confirmed_product_id: action.productId, confirmed_quantity: action.quantity, confirmation_method: "lead_confirmation_button",
        } : {}) } })
    .eq("organization_id", context.organization.id).eq("commerce_session_id", context.commerceSessionId)
    .eq("id", action.id).eq("status", expected).select("id").maybeSingle();
  if (updateError) throw new Error("Não foi possível registrar o resultado.");
  if (!changed) throw new WebActionError("Ação já tratada.");
  await recordAssistedAction(context, action, status);
  return phase === "execute" ? { ok: true, action: action.kind === "request_add_to_cart_confirmation"
    ? { ...action, kind: "add_to_cart_after_confirmation" as const } : action } : { ok: true };
}

async function recordAssistedAction(context: Context, action: WebAction, status: string) {
  const labels: Record<WebAction["kind"], string> = {
    open_product: "Mostrar produto", highlight_product: "Destacar produto", scroll_to_section: "Localizar seção",
    open_cart: "Abrir carrinho", open_checkout: "Revisar carrinho", suggest_cart_item: "Sugerir produto",
    request_add_to_cart_confirmation: "Adicionar item ao carrinho", add_to_cart_after_confirmation: "Adicionar item ao carrinho",
  };
  const statuses: Record<string, string> = { suggested: "sugerida", accepted: "autorizada", rejected: "recusada",
    applied: "execução informada pelo navegador", failed: "falha informada pelo navegador" };
  // Stable event ID makes receipt retries idempotent in the existing lead archive.
  const hash = createHash("sha256").update(`commerce-web:${action.id}:${status}`).digest("hex");
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const { error } = await context.client.from("intelligence_events").upsert({
    id, scope: "organization", visibility: "organization", organization_id: context.organization.id,
    source_type: "commerce_agent", source_id: context.leadId ?? context.commerceSessionId,
    producer_agent_id: context.agentId, event_type: "commerce_agent.assisted_action",
    title: `Ação assistida: ${labels[action.kind]}`,
    summary: `${action.productTitle ?? action.section ?? "Carrinho"}${action.quantity ? ` (${action.quantity} unidade(s))` : ""}: ${statuses[status] ?? status}. ${action.reason}`,
    occurred_at: new Date().toISOString(), tags: ["commerce_agent", "assisted_action", status],
    payload: { action_id: action.id, action_kind: action.kind, status, product_id: action.productId ?? null,
      product_title: action.productTitle ?? null, quantity: action.quantity ?? null, reason: action.reason,
      surface: context.surface, lead_id: context.leadId, conversation_id: context.conversationId,
      commerce_session_id: context.commerceSessionId, agent_id: context.agentId,
      consent: action.kind === "request_add_to_cart_confirmation" && status === "accepted"
        ? { accepted: true, product_id: action.productId, quantity: action.quantity, method: "lead_confirmation_button" } : null,
      result_source: ["applied", "failed"].includes(status) ? "lead_browser_report" : "server",
      navigation_only: action.kind === "open_product", page_path: context.pagePath },
  }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error("Não foi possível registrar a ação no Arquivo do Lead.");
}
