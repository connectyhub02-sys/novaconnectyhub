import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isIP } from "node:net";
import { getOrganizationSalesCatalogSettings, mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { resolveSalesCatalogOrderPaymentOwner } from "@/lib/platform-product-sales";
import { ensureAsaasAccessToken, loadAsaasPlatformBillingConfig, verifyAsaasWebhookToken, type AsaasPaymentResponse } from "./asaas";
import { AsaasDirectError, getAsaasNativePayment, applyAsaasPaymentEvent, createAsaasDirectCardPayment, findAsaasDirectPayment, retireAsaasPayment } from "./asaas-direct";
import { parseCheckoutCard, parseCheckoutCardHolder, record, type CheckoutCardHolder } from "./card-input";
import { loadCheckoutCustomer, parseCheckoutAddress } from "./checkout-customer";
import { requiresSalesCatalogShippingBeforePayment } from "./checkout-guards";
import { normalizeCurrencyAmount } from "./mercado-pago";
import { handleSalesCatalogPaymentStatusChange } from "./post-payment";
import { paymentOutcomeCopy, type PaymentDiagnostic } from "./payment-diagnostics";

type Json = Record<string, unknown>;
type Attempt = { id: string; organization_id: string; order_id: string; source_session_id: string; payment_session_id: string; amount: number; revision: number; installments: number; state: string; updated_at: string; diagnostic?: PaymentDiagnostic | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class CheckoutError extends Error { constructor(message: string, public status = 400) { super(message); } }

export async function loadTransparentCheckout(client: SupabaseClient, sessionId: string) {
  if (!uuid.test(sessionId)) throw new CheckoutError("Checkout não encontrado.", 404);
  const { data: session, error } = await client.from("sales_catalog_payment_sessions").select("*").eq("id", sessionId).eq("provider", "asaas").maybeSingle();
  if (error || !session) throw new CheckoutError("Checkout não encontrado.", 404);
  const { data: savedOrder, error: orderError } = await client.from("sales_catalog_orders").select("*").eq("id", session.order_id).eq("organization_id", session.organization_id).maybeSingle();
  if (orderError || !savedOrder) throw new CheckoutError("Pedido não encontrado.", 404);
  const order = await loadCheckoutCustomer(client, session.organization_id, savedOrder);
  const { data: items, error: itemsError } = await client.from("sales_catalog_order_items").select("*").eq("order_id", order.id).eq("organization_id", session.organization_id).order("created_at");
  if (itemsError || !items?.length) throw new CheckoutError("Não foi possível conferir os itens do pedido.", 409);
  const amount = normalizeCurrencyAmount(order.total);
  if (!amount) throw new CheckoutError("O total do pedido precisa ser confirmado.", 409);
  const settings = await getOrganizationSalesCatalogSettings(client, session.organization_id);
  const { data: capability, error: capabilityError } = await client.from("sales_catalog_checkout_capabilities").select("transparent_card_enabled").eq("organization_id", session.organization_id).maybeSingle();
  if (capabilityError) throw new CheckoutError("Não foi possível conferir a disponibilidade do cartão.", 503);
  const holder = {
    name: order.customer_name ?? "", email: order.customer_email ?? "", cpfCnpj: order.customer_document ?? "",
    phone: order.customer_phone ?? "", postalCode: order.destination_cep ?? "", addressNumber: parseCheckoutAddress(order.destination_address).addressNumber ?? "",
  } satisfies CheckoutCardHolder;
  const { data: attempts } = await client.from("sales_catalog_card_attempts").select("id, organization_id, order_id, source_session_id, payment_session_id, amount, revision, installments, state, updated_at")
    .eq("order_id", order.id).eq("organization_id", session.organization_id).order("created_at", { ascending: false }).limit(1);
  const attempt = (attempts?.[0] ?? null) as Attempt | null;
  const reviewResult = order.lead_id ? await client.from("sales_catalog_payment_reviews").select("id").eq("organization_id", session.organization_id).eq("lead_id", order.lead_id).neq("status", "resolved").or(`order_id.eq.${order.id},order_id.is.null`).limit(1) : { data: [], error: null };
  if (reviewResult.error) throw new CheckoutError("Não foi possível conferir o pagamento. Atualize a página.", 503);
  // The operator enabled ecosystem-wide testing. An explicit store override still wins.
  return { session, order, items, holder, amount, settings, attempt, review: Boolean(reviewResult.data?.length), enabled: capability?.transparent_card_enabled !== false };
}

export function publicCheckoutQuote(snapshot: Awaited<ReturnType<typeof loadTransparentCheckout>>) {
  const { order, holder, amount, settings, attempt } = snapshot;
  return {
    amount, revision: Number(order.checkout_revision ?? 0), holder,
    enabled: snapshot.enabled,
    review: snapshot.review,
    maxInstallments: Math.min(12, Math.max(1, settings?.asaas.maxInstallments ?? 1)),
    paid: order.payment_status === "confirmed", closed: order.payment_status === "refunded" || order.status === "cancelled",
    attempt: attempt ? { id: attempt.id, state: attempt.state } : null,
    shipping: normalizeCurrencyAmount(order.shipping_total) ?? 0,
  };
}

export async function resolveTransparentConnection(client: SupabaseClient, organizationId: string, orderId: string) {
  const owner = await resolveSalesCatalogOrderPaymentOwner({ client, organizationId, orderId });
  const connection = owner.owner === "connectyhub"
    ? await loadAsaasPlatformBillingConfig({ client })
    : await ensureAsaasAccessToken({ client, organizationId });
  if (!connection?.accessToken || !connection.webhookSecret) throw new CheckoutError("O pagamento por cartão está temporariamente indisponível.", 503);
  return { ...connection, owner };
}

export async function payTransparentCheckout(client: SupabaseClient, sessionId: string, body: Json, remoteIp: string) {
  const snapshot = await loadTransparentCheckout(client, sessionId);
  const { session, order, items, settings } = snapshot;
  if (snapshot.review) throw new CheckoutError("Seu pagamento está em conferência pela equipe. Aguarde antes de tentar pagar novamente.", 409);
  // Repeat submissions read the existing attempt; card data is never reused or persisted.
  if (snapshot.attempt && ["processing", "unknown", "pending", "approved"].includes(snapshot.attempt.state)) {
    return publicAttempt(await reconcileTransparentAttempt(client, snapshot.attempt.id));
  }
  if (!snapshot.enabled) throw new CheckoutError("O cartão está temporariamente indisponível nesta loja. Continue pelo WhatsApp.", 503);
  if (["confirmed", "refunded"].includes(order.payment_status) || ["paid", "in_preparation", "shipped", "delivered", "cancelled"].includes(order.status)) throw new CheckoutError("Este pedido já foi finalizado.", 409);
  if (requiresSalesCatalogShippingBeforePayment(order, items)) throw new CheckoutError("Confirme o endereço e o frete pelo WhatsApp antes de pagar.", 409);
  if (items.some(item => record(item.metadata).billing_cycle && record(item.metadata).billing_cycle !== "one_time")) throw new CheckoutError("Este pedido possui uma assinatura e precisa do checkout de recorrência.", 409);
  const sourceOwner = session.payment_owner_type ?? record(session.metadata).payment_owner;
  if (sourceOwner !== "connectyhub" && settings && !settings.asaas.enabledMethods.includes("credit_card")) throw new CheckoutError("O cartão não está habilitado nesta loja.", 409);
  if (!isIP(remoteIp)) throw new CheckoutError("Não foi possível identificar a conexão. Atualize a página.", 400);
  const attemptId = typeof body.attemptId === "string" ? body.attemptId : "";
  if (!uuid.test(attemptId)) throw new CheckoutError("Atualize a página antes de pagar.", 400);
  const card = parseCheckoutCard(body.card);
  const holder = parseCheckoutCardHolder(body.differentHolder === true ? body.holder : snapshot.holder);
  const installments = Number(body.installments ?? 1);
  if (!Number.isInteger(installments) || installments < 1 || installments > publicCheckoutQuote(snapshot).maxInstallments) throw new CheckoutError("Confira o parcelamento.", 400);
  if (!Number.isSafeInteger(body.revision) || body.revision !== Number(order.checkout_revision) || body.amount !== snapshot.amount) throw new CheckoutError("O pedido foi atualizado. Confira o total antes de pagar.", 409);
  const connection = await resolveTransparentConnection(client, session.organization_id, order.id);
  await validateTransparentInventory(client, session.organization_id, items, settings?.trackInventory ?? false);
  // This validation also prevents an old seller session from collecting a platform-owned cart.
  if (sourceOwner && (sourceOwner === "connectyhub") !== (connection.owner.owner === "connectyhub")) throw new CheckoutError("O recebimento deste pedido foi atualizado. Peça um novo checkout pelo WhatsApp.", 409);
  const { data, error } = await client.rpc("claim_checkout_card_attempt", { p_session_id: sessionId, p_attempt_id: attemptId, p_revision: body.revision, p_amount: snapshot.amount, p_installments: installments });
  if (error || !data?.attempt) throw new CheckoutError(error?.message.includes("CHECKOUT_CHANGED") ? "O pedido mudou. Confira o total antes de pagar." : "Não foi possível reservar este pagamento. Atualize a página.", 409);
  const attempt = data.attempt as Attempt;
  if (!data.claimed) return publicAttempt(await reconcileTransparentAttempt(client, attempt.id));
  let chargeStarted = false;
  try {
    await retirePreviousPayments(client, session.organization_id, order.id, attempt.id, connection);
    // Re-read after retiring old sessions: a concurrent Pix confirmation must stop this charge.
    const { data: current, error: currentError } = await client.from("sales_catalog_orders").select("payment_status, checkout_payment_lock").eq("id", order.id).eq("organization_id", session.organization_id).single();
    if (currentError || current.payment_status === "confirmed" || current.checkout_payment_lock !== attempt.id) throw new CheckoutError("Estamos conferindo um pagamento anterior deste pedido.", 409);
    chargeStarted = true;
    let payment = await createAsaasDirectCardPayment({ ...connection, card, holder, installments, amount: snapshot.amount, externalReference: `checkout_card:${attempt.id}`, remoteIp });
    if (installments > 1) {
      const complete = await findAsaasDirectPayment(connection, `checkout_card:${attempt.id}`, { amount: snapshot.amount, installments });
      if (!complete) throw new AsaasDirectError(false, false);
      payment = complete;
    }
    return publicAttempt(await finishTransparentAttempt(client, attempt.id, directPaymentState(payment), payment));
  } catch (error) {
    // An ambiguous gateway result keeps the durable lock. It is never retried automatically.
    const definitive = !chargeStarted || (error instanceof AsaasDirectError && error.definitive);
    const state = definitive ? error instanceof AsaasDirectError && error.declined ? "rejected" : "error" : "unknown";
    const result = await finishTransparentAttempt(client, attempt.id, state, undefined, error instanceof AsaasDirectError ? error.diagnostic : undefined).catch(() => ({ ...attempt, state: "unknown" }));
    return publicAttempt(result);
  }
}

export async function retireCheckoutPaymentsBeforeCartChange(client: SupabaseClient, organizationId: string, orderId: string) {
  const { data: order } = await client.from("sales_catalog_orders").select("checkout_payment_lock, payment_status").eq("id", orderId).eq("organization_id", organizationId).single();
  if (!order || order.checkout_payment_lock || ["confirmed", "refunded"].includes(order.payment_status)) throw new CheckoutError("Aguarde a confirmação do pagamento antes de alterar o pedido.", 409);
  const connection = await resolveTransparentConnection(client, organizationId, orderId);
  await retirePreviousPayments(client, organizationId, orderId, "", connection);
}

async function retirePreviousPayments(client: SupabaseClient, organizationId: string, orderId: string, attemptId: string, connection: Awaited<ReturnType<typeof resolveTransparentConnection>>) {
  const { data: sessions, error } = await client.from("sales_catalog_payment_sessions").select("id, provider, provider_payment_id, status, metadata")
    .eq("organization_id", organizationId).eq("order_id", orderId).in("status", ["created", "pending", "error"]);
  if (error) throw new CheckoutError("Não foi possível conferir os pagamentos anteriores.", 409);
  for (const old of sessions ?? []) {
    if (old.id === attemptId || !old.provider_payment_id) continue;
    if (record(old.metadata).transparent_checkout === true && old.status === "pending") throw new CheckoutError("Aguarde a confirmação do cartão antes de alterar o pedido.", 409);
    if (old.provider !== "asaas") throw new CheckoutError("Existe outro pagamento em aberto. Continue pelo WhatsApp.", 409);
    await retireAsaasPayment(connection, old.provider_payment_id, Boolean(record(old.metadata).asaas_checkout_id));
    const { error: saveError } = await client.from("sales_catalog_payment_sessions").update({ status: "cancelled", provider_status_detail: "replaced_by_transparent_checkout" })
      .eq("id", old.id).in("status", ["created", "pending", "error"]);
    if (saveError) throw new CheckoutError("Estamos conferindo o pagamento anterior.", 409);
  }
}

export function directPaymentState(payment: AsaasPaymentResponse) {
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(payment.status ?? "")) return "approved";
  if (["REFUNDED"].includes(payment.status ?? "")) return "refunded";
  if (payment.deleted || ["DELETED", "CANCELED", "CANCELLED"].includes(payment.status ?? "")) return "cancelled";
  if (["PAYMENT_REFUSED", "FAILED", "REPROVED_BY_RISK_ANALYSIS", "CREDIT_CARD_CAPTURE_REFUSED"].includes(payment.status ?? "")) return "rejected";
  return "pending";
}

export async function finishTransparentAttempt(client: SupabaseClient, attemptId: string, state: string, payment?: AsaasPaymentResponse, diagnostic?: PaymentDiagnostic | null) {
  const { data, error } = await client.rpc("finish_checkout_card_attempt_diagnostic", { p_attempt_id: attemptId, p_state: state, p_provider_id: payment?.id ?? null, p_provider_status: payment?.status ?? null, p_diagnostic: diagnostic ?? null });
  if (error || !data?.attempt) throw new CheckoutError("Estamos verificando o resultado do pagamento.", 503);
  const attempt = data.attempt as Attempt;
  await processTransparentPaymentEffects(client, attempt.id);
  return attempt;
}

export async function reconcileTransparentAttempt(client: SupabaseClient, attemptId: string, force = false, webhook?: { paymentId: string; event: unknown }) {
  const { data: attempt, error } = await client.from("sales_catalog_card_attempts").select("*").eq("id", attemptId).maybeSingle<Attempt>();
  if (error || !attempt) throw new CheckoutError("Pagamento não encontrado.", 404);
  if (!force && !["processing", "unknown", "pending"].includes(attempt.state)) {
    await processTransparentPaymentEffects(client, attempt.id);
    return attempt;
  }
  if (!force && Date.now() - Date.parse(attempt.updated_at) < 15000) return attempt;
  // Claim a short reconciliation interval across tabs and server instances.
  const { data: claimed } = await client.from("sales_catalog_card_attempts").update({ updated_at: new Date().toISOString() }).eq("id", attemptId).eq("updated_at", attempt.updated_at).select("id").maybeSingle();
  if (!claimed) return attempt;
  const connection = await resolveTransparentConnection(client, attempt.organization_id, attempt.order_id);
  let payment = webhook && attempt.installments === 1 ? await getAsaasNativePayment(connection, webhook.paymentId) : await findAsaasDirectPayment(connection, `checkout_card:${attempt.id}`, { amount: Number(attempt.amount), installments: attempt.installments });
  if (payment && webhook) payment = applyAsaasPaymentEvent(payment, webhook.event);
  if (!payment) return attempt; // Absence after a timeout is not proof of failure.
  if (payment.externalReference !== `checkout_card:${attempt.id}` || payment.billingType !== "CREDIT_CARD" || Math.abs(Number(payment.value) - Number(attempt.amount) / attempt.installments) > 0.011) throw new CheckoutError("Estamos conferindo a identificação do pagamento.", 409);
  return finishTransparentAttempt(client, attempt.id, directPaymentState(payment), payment);
}

function publicAttempt(attempt: Attempt) {
  return { sessionId: attempt.payment_session_id, attemptId: attempt.id, status: attempt.state, approved: attempt.state === "approved", rejected: ["rejected", "error", "cancelled"].includes(attempt.state), message: paymentOutcomeCopy(attempt.state, attempt.diagnostic) };
}

export async function processTransparentWebhook(client: SupabaseClient, payload: Json, header: string | null) {
  const payment = record(payload.payment);
  const reference = typeof payment.externalReference === "string" ? payment.externalReference : "";
  let attemptId = reference.startsWith("checkout_card:") ? reference.slice(14) : null;
  if (!attemptId && typeof payment.id === "string") {
    const { data: session } = await client.from("sales_catalog_payment_sessions").select("id, metadata").eq("provider", "asaas").eq("provider_payment_id", payment.id).maybeSingle();
    if (session && record(session.metadata).transparent_checkout === true) attemptId = session.id;
  }
  if (!attemptId || !uuid.test(attemptId)) return null;
  const { data: attempt } = await client.from("sales_catalog_card_attempts").select("organization_id, order_id").eq("id", attemptId).maybeSingle();
  if (!attempt) throw new CheckoutError("Pagamento ainda não disponível para conciliação.", 503);
  const connection = await resolveTransparentConnection(client, attempt.organization_id, attempt.order_id);
  if (!verifyAsaasWebhookToken({ header, token: connection.webhookSecret }).ok) throw new CheckoutError("invalid_webhook_token", 401);
  await reconcileTransparentAttempt(client, attemptId, true, typeof payment.id === "string" ? { paymentId: payment.id, event: payload.event } : undefined);
  return { ok: true, processed: true };
}

async function processTransparentPaymentEffects(client: SupabaseClient, attemptId: string) {
  const { data: attempt, error } = await client.rpc("claim_checkout_payment_effects", { p_attempt_id: attemptId });
  if (error) throw new CheckoutError("Pagamento registrado; confirmação em processamento.", 503);
  if (!attempt) return;
  if (attempt.state === "approved") {
    const { error: inventoryError } = await client.rpc("deduct_transparent_checkout_inventory", { p_attempt_id: attemptId });
    if (inventoryError) throw new CheckoutError("Pagamento registrado; conferindo o estoque do pedido.", 503);
  }
  const { data: session } = await client.from("sales_catalog_payment_sessions").select("provider_payment_id").eq("id", attempt.payment_session_id).single();
  await handleSalesCatalogPaymentStatusChange({ client, organizationId: attempt.organization_id, orderId: attempt.order_id, paymentSessionId: attempt.payment_session_id, providerPaymentId: session?.provider_payment_id ?? null, paymentMethod: "card", paymentMethodLabel: "Cartão de crédito", status: attempt.state === "unknown" ? "pending" : attempt.state, source: "checkout_card" });
  const { error: saveError } = await client.from("sales_catalog_card_attempts").update({ effects_completed_state: attempt.state, effects_claimed_at: null }).eq("id", attemptId).eq("state", attempt.state).eq("effects_claimed_at", attempt.effects_claimed_at);
  if (saveError) throw new CheckoutError("Confirmação em processamento.", 503);
}

export async function reconcilePendingTransparentCheckouts(client: SupabaseClient) {
  const { data: attempts, error } = await client.from("sales_catalog_card_attempts").select("id, state, effects_completed_state")
    .or("state.in.(processing,unknown,pending),effects_completed_state.is.null")
    .order("updated_at", { ascending: true }).limit(5);
  if (error) throw new Error("Não foi possível consultar as tentativas do checkout.");
  let checked = 0;
  let deferred = 0;
  for (const attempt of attempts ?? []) {
    try {
      if (!["processing", "unknown", "pending"].includes(attempt.state)) {
        if (attempt.effects_completed_state !== attempt.state) await processTransparentPaymentEffects(client, attempt.id);
      } else { await reconcileTransparentAttempt(client, attempt.id); await processTransparentPaymentEffects(client, attempt.id); }
      checked++;
    } catch { deferred++; }
  }
  const recoveredPix = await reconcileUncertainPixRequests(client);
  return { checked, deferred, recoveredPix };
}

async function reconcileUncertainPixRequests(client: SupabaseClient) {
  const { data: sessions } = await client.from("sales_catalog_payment_sessions").select("id, organization_id, order_id, external_reference, metadata, updated_at")
    .eq("provider", "asaas").eq("method", "pix").contains("metadata", { gateway_request_inflight: true }).order("updated_at", { ascending: true }).limit(5);
  let recovered = 0;
  for (const session of sessions ?? []) {
    if (Date.now() - Date.parse(session.updated_at) < 60000) continue;
    try {
      const checkedAt = new Date().toISOString();
      const { data: claimed } = await client.from("sales_catalog_payment_sessions").update({ updated_at: checkedAt }).eq("id", session.id).eq("updated_at", session.updated_at).select("id").maybeSingle();
      if (!claimed) continue;
      session.updated_at = checkedAt;
      const connection = await resolveTransparentConnection(client, session.organization_id, session.order_id);
      const payment = await findAsaasDirectPayment(connection, session.external_reference);
      if (!payment?.id || payment.externalReference !== session.external_reference) continue;
      const state = directPaymentState(payment);
      // Financial confirmations continue through the signed provider webhook. Until then keep the order protected.
      const resolved = ["pending", "cancelled", "rejected"].includes(state);
      const { error } = await client.from("sales_catalog_payment_sessions").update({ provider_payment_id: payment.id, provider_status: payment.status, ...(resolved ? { status: state } : {}),
        metadata: { ...record(session.metadata), gateway_request_inflight: !resolved, gateway_reconciliation_checked_at: new Date().toISOString() }, updated_at: new Date().toISOString(),
      }).eq("id", session.id).eq("updated_at", session.updated_at);
      if (!error && resolved) recovered++;
    } catch { /* Keep the durable marker until the provider result can be verified. */ }
  }
  return recovered;
}

async function validateTransparentInventory(client: SupabaseClient, organizationId: string, items: Array<{ catalog_item_id: string | null; sku_id?: string | null; quantity: number | null }>, trackInventory: boolean) {
  const ids = [...new Set(items.map(item => item.catalog_item_id).filter(Boolean))];
  const { data: products, error } = await client.from("intelligence_memory").select("id, organization_id, title, content, metadata, created_at, updated_at").eq("organization_id", organizationId).eq("memory_type", "sales_catalog_item").in("id", ids);
  if (error) throw new CheckoutError("Não foi possível conferir a disponibilidade dos produtos.", 409);
  const byId = new Map((products ?? []).map(row => [row.id, mapSalesCatalogItem(row)]));
  for (const item of items) {
    const product = byId.get(item.catalog_item_id);
    if (!product || product.status !== "active" || product.billingCycle !== "one_time") throw new CheckoutError("Um produto deste pedido precisa ser revisado pelo WhatsApp.", 409);
    let status = product.inventory.status;
    let quantity = product.inventory.quantity;
    if (item.sku_id) {
      const { data: sku, error: skuError } = await client.from("sales_catalog_skus").select("stock_status, stock_quantity, status").eq("id", item.sku_id).eq("organization_id", organizationId).eq("catalog_item_id", item.catalog_item_id).maybeSingle();
      if (skuError || !sku || sku.status !== "active") throw new CheckoutError("Confira a variação do produto pelo WhatsApp antes de pagar.", 409);
      status = sku.stock_status;
      quantity = sku.stock_quantity;
    }
    if (!product.inventory.allowBackorder && (status === "out_of_stock" || trackInventory && quantity !== null && quantity < (item.quantity ?? 1))) throw new CheckoutError("Um produto ficou indisponível. Continue pelo WhatsApp para ajustar seu pedido.", 409);
  }
}
