/** Persisted order facts used to choose a conversation's current checkout. */
export type CheckoutJourneyOrder = {
  id: string;
  companyId?: string;
  leadId?: string | null;
  conversationId?: string | null;
  instanceId?: string | null;
  status: string;
  paymentStatus: string;
  fulfillmentStatus?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  latestPaymentSessionId?: string | null;
  checkoutConfirmedAt?: string | null;
};

export type CheckoutJourneyKind = "new_purchase" | "revision" | "payment_resume" | "history" | "normal";

export type CheckoutJourney<T extends CheckoutJourneyOrder> = {
  kind: CheckoutJourneyKind;
  order: T | null;
  reason: "explicit_new_purchase" | "purchase_without_open_order" | "order_change" | "payment_request"
    | "order_history" | "no_checkout_action" | "order_not_found" | "order_not_editable"
    | "order_selection_required" | "active_order_unavailable";
  ambiguous: boolean;
};

function normalizedText(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\s+/g, " ").trim();
}

const changeVerb = /\b(?:adicion(?:a|ar|e)|inclu(?:i|ir|a)|acrescent(?:a|ar|e)|remov(?:e|er|a)|retir(?:a|ar|e)|tir(?:a|ar|e)|tro(?:ca|car|que)|substitu(?:i|ir|a)|mud(?:a|ar|e)|alter(?:a|ar|e)|reduz(?:ir|a)?|diminu(?:i|ir|a)|aument(?:a|ar|e)|cancel(?:a|ar|e)|corrig(?:e|ir|a))\b/;
const paymentWords = /\b(?:pagamento|pagar|pix|cartao|credito|debito|boleto|checkout)\b/;
const cartWords = /\b(?:produto|produtos|item|itens|quantidade|quantidades|carrinho|endereco|entrega|frete|retirada|unidade|unidades)\b/;

/** A new purchase is not an instruction to cancel or overwrite an earlier order. */
export function isNewPurchaseIntent(text: string) {
  const normalized = normalizedText(text);
  if (/\b(?:nao quero|nao vou|nao precisa|nao e para|sem)\b.{0,45}\b(?:novo|outro|novamente|de novo)\b/.test(normalized)) return false;
  if (/\b(?:novo|outro|mais um) pedido\b|\bpedido (?:novo|separado)\b/.test(normalized)) return true;
  if (/\b(?:quero|vou|vamos|posso|gostaria de)\b.{0,25}\b(?:pedir|comprar)\b.{0,20}\b(?:de novo|novamente)\b/.test(normalized)) return true;
  // "Outra pizza" starts a fresh purchase; "troque por outra pizza" revises one.
  return !changeVerb.test(normalized)
    && /\b(?:quero|vou querer|vou levar|vou pedir)\s+(?:mais\s+)?(?:um[ao]?\s+)?outr[oa]\s+/.test(normalized)
    && !paymentWords.test(normalized)
    && !cartWords.test(normalized)
    && !/\b(?:outro atendente|outra pessoa|outra opcao|outra informacao|outra duvida)\b/.test(normalized);
}

/** Eligibility only; callers must still validate payment locks and provider state atomically. */
export function isEditableCheckoutOrder(order: CheckoutJourneyOrder) {
  return (order.status === "draft" || order.status === "pending_payment")
    && order.paymentStatus === "pending"
    && order.fulfillmentStatus !== "fulfilled";
}

/** A failed payment can be resumed, but is not consent to edit the cart or retry a charge. */
export function isPaymentRecoverableCheckoutOrder(order: CheckoutJourneyOrder) {
  return (order.status === "draft" || order.status === "pending_payment")
    && (order.paymentStatus === "pending" || order.paymentStatus === "failed")
    && order.fulfillmentStatus !== "fulfilled";
}

function isPaymentResumeIntent(normalized: string) {
  if (/\b(?:juros|taxa|desconto|parcelas|parcelamento|amanha|depois|mais tarde)\b/.test(normalized)) return false;
  if (/\b(?:ja paguei|paguei|foi pago|pagamento confirmado|comprovante)\b/.test(normalized)) return false;
  if (/\b(?:nao quero pagar|nao vou pagar|nao pode gerar|nao gera|nao mande|nao envie)\b/.test(normalized)) return false;
  return /^(?:(?:no|pelo|por|com|o|a)\s+)*(?:pix|cartao(?: de credito)?|credito|boleto)[.!?]*$/.test(normalized)
    || /\b(?:manda|mande|envia|envie|reenvia|reenvie|gera|gere|retoma|retome|quero|preciso|posso|como)\b.{0,55}\b(?:link|checkout|pagamento|pagar|pix|cartao|boleto)\b/.test(normalized)
    || /\b(?:troca|troque|muda|mude|altera|altere)\b.{0,45}\b(?:pagamento|pix|cartao|credito|boleto)\b/.test(normalized)
    || /\b(?:cartao|credito|pix|boleto)\b.{0,20}\bem vez de\b/.test(normalized)
    || /\b(?:nao chegou|nao recebi|nao apareceu|cade)\b.{0,25}\b(?:link|botao|pix|checkout)\b/.test(normalized);
}

function isRevisionIntent(normalized: string) {
  if (changeVerb.test(normalized)) {
    const paymentOnly = paymentWords.test(normalized) && !cartWords.test(normalized)
      && !/\b(?:adicion|inclu|acrescent|remov|retir|tira|substitu|reduz|diminu|aument|cancel)\w*\b/.test(normalized);
    if (paymentOnly) {
      // Multiple changes cannot be reduced to a payment-method request.
      return normalized.split(/\b(?:mas|e|tambem|antes)\b|[,;]/).some(part => changeVerb.test(part) && !paymentWords.test(part));
    }
    return true;
  }
  return /\b(?:mais|menos)\s+(?:um|uma|dois|duas|tres|\d+)\b/.test(normalized)
    || /\b(?:so|apenas)\s+(?:um|uma|\d+)\s+(?:unidade|item)\b/.test(normalized);
}

function isHistoryIntent(normalized: string) {
  return /\b(?:ja paguei|paguei|comprovante|reembolso|estorno|rastreamento|rastrear)\b/.test(normalized)
    || /\b(?:status|situacao|andamento|onde esta|ja saiu|foi entregue)\b.{0,45}\b(?:pedido|entrega)\b/.test(normalized)
    || /\bpedido\b.{0,35}\b(?:pago|anterior|entregue|de ontem)\b/.test(normalized);
}

function isPurchaseRequest(normalized: string) {
  if (paymentWords.test(normalized)) return false;
  return /\b(?:quero|gostaria de|vou)\s+(?:comprar|pedir|fazer (?:um )?pedido)\b/.test(normalized)
    || /\b(?:quero|vou querer|vou levar)\s+(?:uma?|dois|duas|tres|\d+)\s+/.test(normalized)
      && !/\b(?:atendente|pessoa|informacao|duvida|ajuda|orcamento|explicacao)\b/.test(normalized);
}

export function classifyCheckoutJourney<T extends CheckoutJourneyOrder>(input: {
  text: string;
  conversationId: string;
  leadId?: string | null;
  organizationId?: string;
  instanceId?: string;
  orders: readonly T[];
  activeOrderId?: string | null;
  activeStartedAt?: string | null;
  now?: string | number | Date;
}): CheckoutJourney<T> {
  const result = (kind: CheckoutJourneyKind, order: T | null, reason: CheckoutJourney<T>["reason"], ambiguous = false): CheckoutJourney<T> => ({ kind, order, reason, ambiguous });
  const text = normalizedText(input.text);
  if (isNewPurchaseIntent(text)) return result("new_purchase", null, "explicit_new_purchase");
  const now = input.now === undefined ? Date.now() : new Date(input.now).getTime();
  const startedAt = Date.parse(input.activeStartedAt ?? "");
  const scoped = input.orders.filter(order => order.conversationId === input.conversationId
    && (!input.organizationId || order.companyId === input.organizationId)
    && (!input.leadId || order.leadId === input.leadId)
    && (!input.instanceId || !order.instanceId || order.instanceId === input.instanceId)
    && (!Number.isFinite(now) || !order.createdAt || Date.parse(order.createdAt) <= now + 60_000));
  const active = input.activeOrderId ? scoped.find(order => order.id === input.activeOrderId) ?? null : null;
  const editable = scoped.filter(order => isEditableCheckoutOrder(order)
    && (!Number.isFinite(startedAt) || Date.parse(order.createdAt ?? "") >= startedAt || order.id === input.activeOrderId));
  const kind = isRevisionIntent(text) ? "revision" : isHistoryIntent(text) ? "history"
    : isPaymentResumeIntent(text) ? "payment_resume" : "normal";
  if (kind === "normal") {
    return isPurchaseRequest(text) && editable.length === 0
      ? result("new_purchase", null, "purchase_without_open_order")
      : result("normal", null, "no_checkout_action");
  }
  if (input.activeOrderId) {
    if (!active) return result(kind, null, "active_order_unavailable");
    if (kind !== "history" && !(kind === "payment_resume" ? isPaymentRecoverableCheckoutOrder(active) : isEditableCheckoutOrder(active))) return result(kind, null, "order_not_editable");
    return result(kind, active, kind === "history" ? "order_history" : kind === "revision" ? "order_change" : "payment_request");
  }
  const candidates = kind === "history" ? scoped : kind === "payment_resume"
    ? scoped.filter(order => isPaymentRecoverableCheckoutOrder(order)
      && (!Number.isFinite(startedAt) || Date.parse(order.createdAt ?? "") >= startedAt || order.id === input.activeOrderId)) : editable;
  if (candidates.length !== 1) return result(kind, null,
    candidates.length > 1 ? "order_selection_required" : scoped.length ? "order_not_editable" : "order_not_found", candidates.length > 1);
  const order = candidates[0];
  // A fresh modification without a selected journey must not mutate yesterday's order.
  // Explicit payment recovery can still use a single old pending checkout.
  const createdAt = Date.parse(order.createdAt ?? "");
  if (kind === "revision" && (!Number.isFinite(createdAt) || (Number.isFinite(now) && now - createdAt > 2 * 60 * 60 * 1000))) {
    return result(kind, null, "order_selection_required", true);
  }
  return result(kind, order, kind === "history" ? "order_history" : kind === "revision" ? "order_change" : "payment_request");
}
