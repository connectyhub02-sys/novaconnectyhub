import "server-only";
import { isIP } from "node:net";
import { sanitizePaymentAuditPayload } from "@/lib/security/payment-audit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { record, parseCheckoutCard, parseCheckoutCardHolder, type CheckoutCardHolder } from "@/lib/sales-catalog/card-input";
import { AsaasDirectError, findAsaasBillingPix, applyAsaasPaymentEvent, createAsaasDirectCardPayment, createAsaasNativeSubscription, findAsaasNativeSubscription, cancelAsaasNativeSubscription, findAsaasDirectPayment, getAsaasNativePayment, retireAsaasPayment } from "@/lib/sales-catalog/asaas-direct";
import { loadAsaasPlatformBillingConfig, getAsaasPixQrCode, extractAsaasPaymentData, verifyAsaasWebhookToken, type AsaasPaymentResponse } from "@/lib/sales-catalog/asaas";
import { CheckoutError, directPaymentState } from "@/lib/sales-catalog/transparent-checkout";
import { loadBillingCheckoutIntent, resolveBillingCheckoutProvider, isBillingCheckoutPayable, loadBillingCheckoutBumps, readSelectedBillingCheckoutBumpCodesForCatalog, type BillingCheckoutIntent } from "./plan-checkout";
import { processPlatformBillingAsaasWebhook, notifyNativeBillingOutcome } from "./platform-billing-webhook";

type Attempt = { id: string; organization_id: string; subscription_id: string; invoice_id: string; payment_id: string; amount: number; recurring_amount: number; external_reference: string; state: string; stage: string; provider_subscription_id: string | null; provider_payment_id: string | null; previous_subscription_id: string | null; updated_at: string; created_at: string; effects_completed_state: string | null; effects_claimed_at: string | null };
const activeStates = ["processing", "unknown", "pending"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function nextMonthlyBillingDate(now = new Date()) {
  const date = new Date(now); const day = date.getUTCDate(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + 1);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}

export async function loadNativeBillingSnapshot(client: SupabaseClient, organizationId: string, subscriptionId: string) {
  const intent = await loadBillingCheckoutIntent(client, { organizationId, subscriptionId });
  if (!intent || resolveBillingCheckoutProvider(intent) !== "asaas") throw new CheckoutError("Checkout não encontrado.", 404);
  const [{ data: attempts, error }, revision, bumps] = await Promise.all([
    client.from("billing_card_attempts").select("*").eq("organization_id", organizationId).eq("payment_id", intent.payment.id).order("created_at", { ascending: false }).limit(1),
    client.from("billing_payments").select("checkout_revision").eq("id", intent.payment.id).eq("organization_id", organizationId).single(), loadBillingCheckoutBumps(client),
  ]);
  if (error || revision.error) throw new CheckoutError("Não foi possível conferir o pagamento.", 503);
  const selected = readSelectedBillingCheckoutBumpCodesForCatalog(intent, bumps);
  const planAmount = Number(intent.plan.monthly_price_brl ?? 0);
  const chosen = bumps.filter(b => selected.includes(b.code));
  const amount = Math.round((planAmount + chosen.reduce((sum, bump) => sum + bump.priceBrl, 0)) * 100) / 100;
  const recurringAmount = Math.round((planAmount + chosen.filter(b => b.recurrence === "monthly").reduce((sum, bump) => sum + bump.priceBrl, 0)) * 100) / 100;
  return { intent, selected, amount, recurringAmount, revision: Number(revision.data.checkout_revision), attempt: (attempts?.[0] ?? null) as Attempt | null };
}

export async function payNativeBillingCard(client: SupabaseClient, organizationId: string, subscriptionId: string, body: Record<string, unknown>, remoteIp: string) {
  const snapshot = await loadNativeBillingSnapshot(client, organizationId, subscriptionId);
  if (snapshot.attempt && activeStates.includes(snapshot.attempt.state)) return billingAttemptResult(await reconcileNativeBillingAttempt(client, snapshot.attempt.id));
  if (!isBillingCheckoutPayable(snapshot.intent)) throw new CheckoutError("Este pagamento já foi finalizado.", 409);
  if (body.acceptRecurring !== true) throw new CheckoutError("Confirme a renovação mensal do plano.", 422);
  if (!isIP(remoteIp) || typeof body.attemptId !== "string" || !uuid.test(body.attemptId)) throw new CheckoutError("Atualize a página antes de pagar.", 400);
  if (body.amount !== snapshot.amount || body.revision !== snapshot.revision || Number(snapshot.intent.payment.amount_brl) !== snapshot.amount) throw new CheckoutError("O carrinho mudou. Confira o total antes de pagar.", 409);
  const card = parseCheckoutCard(body.card); const holder = parseCheckoutCardHolder(body.holder);
  const config = await loadAsaasPlatformBillingConfig({ client });
  if (!config.accessToken || !config.webhookSecret) throw new CheckoutError("O recebimento da ConnectyHub precisa ser configurado.", 503);
  // Never replace an already-running recurring agreement as a side effect of a retry.
  if (snapshot.intent.subscription.provider_subscription_id?.startsWith("sub_")) throw new CheckoutError("Este plano já possui renovação automática. Confira a cobrança existente no painel antes de criar outra assinatura.", 409);
  const reference = `billing_card:${body.attemptId}`;
  const { data, error } = await client.rpc("claim_native_billing_card", { p_org: organizationId, p_payment: snapshot.intent.payment.id, p_attempt: body.attemptId, p_revision: snapshot.revision, p_amount: snapshot.amount, p_recurring: snapshot.recurringAmount, p_reference: reference });
  if (error || !data?.attempt) throw new CheckoutError("O pagamento está sendo conferido ou o carrinho mudou. Atualize a página.", 409);
  let attempt = data.attempt as Attempt;
  if (!data.claimed) return billingAttemptResult(await reconcileNativeBillingAttempt(client, attempt.id));
  try {
    const oldPaymentId = snapshot.intent.payment.provider_payment_id;
    if (oldPaymentId) await retireAsaasPayment(config, oldPaymentId, !oldPaymentId.startsWith("pay_"));
    const { error: holderError } = await client.from("organization_subscriptions").update({ metadata: { ...record(snapshot.intent.subscription.metadata), billing_card_holder: holder } }).eq("id", subscriptionId).eq("organization_id", organizationId);
    if (holderError) throw new AsaasDirectError(true, false);
    // The recurring agreement starts next month. Today's single charge includes one-time extras.
    const recurring = await createAsaasNativeSubscription({ ...config, card, holder, amount: snapshot.recurringAmount, externalReference: `billing_recurring:${attempt.id}`, remoteIp, nextDueDate: nextMonthlyBillingDate() });
    const saved = await client.from("billing_card_attempts").update({ provider_subscription_id: recurring.id, stage: "charging", updated_at: new Date().toISOString() }).eq("id", attempt.id).eq("state", "processing").select("*").single();
    if (saved.error) throw new AsaasDirectError(false, false);
    attempt = saved.data as Attempt;
    const payment = await createAsaasDirectCardPayment({ ...config, card, holder, amount: snapshot.amount, installments: 1, externalReference: attempt.external_reference, remoteIp });
    return billingAttemptResult(await finishNativeBilling(client, attempt, directPaymentState(payment), payment));
  } catch (error) {
    const definitive = error instanceof AsaasDirectError && error.definitive;
    let state = definitive ? error.declined ? "rejected" : "error" : "unknown";
    if (definitive && attempt.provider_subscription_id) {
      try { await cancelAsaasNativeSubscription(config, attempt.provider_subscription_id, `billing_recurring:${attempt.id}`); } catch { state = "unknown"; }
    }
    return billingAttemptResult(await finishNativeBilling(client, attempt, state));
  }
}

export async function reconcileNativeBillingAttempt(client: SupabaseClient, id: string, webhookPayment?: AsaasPaymentResponse, force = false) {
  const { data, error } = await client.from("billing_card_attempts").select("*").eq("id", id).single();
  if (error || !data) throw new CheckoutError("Pagamento não encontrado.", 404);
  let attempt = data as Attempt;
  if (!force && !activeStates.includes(attempt.state)) { await applyNativeBillingEffects(client, attempt); return attempt; }
  if (!force && Date.now() - Date.parse(attempt.updated_at) < 30000) return attempt;
  const { data: claimed } = await client.from("billing_card_attempts").update({ updated_at: new Date().toISOString() }).eq("id", id).eq("updated_at", attempt.updated_at).select("id").maybeSingle();
  if (!claimed) return attempt;
  const config = await loadAsaasPlatformBillingConfig({ client });
  const payment = webhookPayment ?? (attempt.provider_payment_id ? await getAsaasNativePayment(config, attempt.provider_payment_id) : await findAsaasDirectPayment(config, attempt.external_reference, { amount: Number(attempt.amount), installments: 1 }));
  if (payment) {
    if (payment.externalReference !== attempt.external_reference || payment.billingType !== "CREDIT_CARD" || Math.round(Number(payment.value) * 100) !== Math.round(Number(attempt.amount) * 100)) throw new CheckoutError("Pagamento em conferência.", 409);
    return finishNativeBilling(client, attempt, directPaymentState(payment), payment);
  }
  if (attempt.stage === "preparing" && Date.now() - Date.parse(attempt.created_at as string) > 180000) {
    // No charge was ever dispatched. Retire a recovered future agreement before allowing a retry.
    const recurring = await findAsaasNativeSubscription(config, `billing_recurring:${id}`);
    if (recurring) { await cancelAsaasNativeSubscription(config, recurring.id, `billing_recurring:${id}`); return finishNativeBilling(client, attempt, "error"); }
  }
  attempt = await finishNativeBilling(client, attempt, "unknown");
  return attempt; // Absence after a charge timeout never authorizes a second debit.
}

async function finishNativeBilling(client: SupabaseClient, attempt: Attempt, state: string, payment?: AsaasPaymentResponse) {
  const { data, error } = await client.rpc("finish_native_billing_card", { p_attempt: attempt.id, p_state: state, p_provider_payment: payment?.id ?? null, p_provider_status: payment?.status ?? null });
  if (error || !data) throw new CheckoutError("Pagamento em conferência. Não repita a cobrança.", 503);
  const updated = data as Attempt;
  await applyNativeBillingEffects(client, updated, payment);
  return updated;
}

async function applyNativeBillingEffects(client: SupabaseClient, attempt: Attempt, knownPayment?: AsaasPaymentResponse) {
  if (attempt.state === "processing" || attempt.effects_completed_state === attempt.state) return;
  const { data: lease, error } = await client.from("billing_card_attempts").update({ effects_claimed_at: new Date().toISOString() }).eq("id", attempt.id).eq("state", attempt.state).or(`effects_claimed_at.is.null,effects_claimed_at.lt.${new Date(Date.now() - 300000).toISOString()}`).select("effects_claimed_at").maybeSingle();
  if (error) throw new CheckoutError("Aviso do pagamento em processamento.", 503);
  if (!lease) return;
  const config = await loadAsaasPlatformBillingConfig({ client });
  if (["approved", "refunded"].includes(attempt.state)) {
    const payment = knownPayment ?? await getAsaasNativePayment(config, attempt.provider_payment_id!);
    const recurring = attempt.provider_subscription_id ? await findAsaasNativeSubscription(config, `billing_recurring:${attempt.id}`) : null;
    if (attempt.state === "approved" && recurring && !recurring.deleted) {
      const { error: saveError } = await client.from("organization_subscriptions").update({ provider_subscription_id: recurring.id }).eq("id", attempt.subscription_id).eq("organization_id", attempt.organization_id);
      if (saveError) throw new CheckoutError("Ativação em processamento.", 503);
    }
    const canonical = `connectyhub_subscription:${attempt.organization_id}:${attempt.subscription_id}:${attempt.invoice_id}:${attempt.payment_id}`;
    await processPlatformBillingAsaasWebhook(client, { dataId: payment.id!, eventType: "payment", action: "native_card_reconciled", providerEventId: null, requestId: attempt.id, payload: { payment: { ...payment, externalReference: canonical } } });
  } else {
    if (["rejected", "error", "cancelled"].includes(attempt.state) && attempt.provider_subscription_id) await cancelAsaasNativeSubscription(config, attempt.provider_subscription_id, `billing_recurring:${attempt.id}`);
    const intent = await loadBillingCheckoutIntent(client, { organizationId: attempt.organization_id, subscriptionId: attempt.subscription_id });
    if (intent) await notifyNativeBillingOutcome(client, { intent, attemptId: attempt.id, status: attempt.state, amount: Number(attempt.amount) });
  }
  const { error: saveError } = await client.from("billing_card_attempts").update({ effects_completed_state: attempt.state, effects_claimed_at: null }).eq("id", attempt.id).eq("state", attempt.state).eq("effects_claimed_at", lease.effects_claimed_at);
  if (saveError) throw new CheckoutError("Aviso do pagamento em processamento.", 503);
}

export function billingAttemptResult(attempt: Attempt) {
  return { ok: true, status: attempt.state, approved: attempt.state === "approved", rejected: ["rejected", "error", "cancelled"].includes(attempt.state), providerPaymentId: attempt.provider_payment_id, message: attempt.state === "approved" ? "Pagamento confirmado. Seu plano está sendo atualizado no painel." : ["rejected", "error", "cancelled"].includes(attempt.state) ? "Não foi possível concluir o pagamento. Confira os dados e tente novamente." : "Estamos conferindo o resultado. Não repita a cobrança; você receberá a atualização pelo WhatsApp." };
}

export async function processNativeBillingWebhook(client: SupabaseClient, payload: Record<string, unknown>, header: string | null) {
  const payment = record(payload.payment); const recurring = record(payload.subscription);
  let reference = String(payment.externalReference ?? recurring.externalReference ?? "");
  if (!reference && (payment.id || recurring.id)) {
    const column = payment.id ? "provider_payment_id" : "provider_subscription_id";
    const { data } = await client.from("billing_card_attempts").select("id").eq(column, String(payment.id ?? recurring.id)).maybeSingle();
    if (data) reference = `${payment.id ? "billing_card" : "billing_recurring"}:${data.id}`;
  }
  if (reference.startsWith("connectyhub_subscription:") && payload.event === "PAYMENT_DELETED") {
    const parts = reference.split(":");
    if (uuid.test(parts[4] ?? "")) {
      const { data } = await client.from("billing_card_attempts").select("id").eq("organization_id", parts[1]).eq("payment_id", parts[4]).limit(1).maybeSingle();
      if (data) {
        const config = await loadAsaasPlatformBillingConfig({ client });
        if (!verifyAsaasWebhookToken({ header, token: config.webhookSecret }).ok) throw new CheckoutError("invalid_webhook_token", 401);
        // Retiring the previous instrument must not cancel its replacement card attempt.
        return { ok: true, processed: true, replaced: true };
      }
    }
  }
  if (!reference.startsWith("billing_card:") && !reference.startsWith("billing_recurring:")) return null;
  const id = reference.split(":")[1]; if (!uuid.test(id)) throw new CheckoutError("Referência inválida.", 400);
  const config = await loadAsaasPlatformBillingConfig({ client });
  if (!verifyAsaasWebhookToken({ header, token: config.webhookSecret }).ok) throw new CheckoutError("invalid_webhook_token", 401);
  if (reference.startsWith("billing_card:")) {
    const remote = applyAsaasPaymentEvent(await getAsaasNativePayment(config, String(payment.id)), payload.event);
    await reconcileNativeBillingAttempt(client, id, remote, true);
  } else if (payment.id) {
    await processNativeBillingRenewal(client, id, String(payment.id), payload.event);
  } else {
    const { data: attempt } = await client.from("billing_card_attempts").select("*").eq("id", id).single();
    if (!attempt) throw new CheckoutError("Assinatura ainda em processamento.", 503);
    // Creating an agreement for a future date is not a paid or active plan.
    if (attempt.state === "approved" && String(payload.event) !== "SUBSCRIPTION_CREATED") await processPlatformBillingAsaasWebhook(client, { dataId: String(recurring.id), eventType: String(payload.event), action: String(payload.event), providerEventId: null, requestId: id, payload: sanitizePaymentAuditPayload(payload) as Record<string, unknown> });
  }
  return { ok: true, processed: true };
}

async function processNativeBillingRenewal(client: SupabaseClient, attemptId: string, paymentId: string, event?: unknown) {
  const { data: attempt } = await client.from("billing_card_attempts").select("*").eq("id", attemptId).single();
  if (!attempt || attempt.state !== "approved") throw new CheckoutError("Recorrência ainda não ativada.", 503);
  const config = await loadAsaasPlatformBillingConfig({ client });
  const payment = applyAsaasPaymentEvent(await getAsaasNativePayment(config, paymentId), event);
  if (payment.billingType !== "CREDIT_CARD" || payment.externalReference !== `billing_recurring:${attemptId}` || Math.round(Number(payment.value) * 100) !== Math.round(Number(attempt.recurring_amount) * 100)) throw new CheckoutError("Recorrência em conferência.", 409);
  const { data: ref, error } = await client.rpc("bind_native_billing_renewal", { p_attempt: attemptId, p_provider_payment: paymentId, p_amount: payment.value });
  if (error || !ref) throw new CheckoutError("Renovação em processamento.", 503);
  await processPlatformBillingAsaasWebhook(client, { dataId: paymentId, eventType: "payment", action: "native_recurring_reconciled", providerEventId: null, requestId: paymentId, payload: { payment: { ...payment, externalReference: ref } } });
}

export async function reconcilePendingNativeBilling(client: SupabaseClient) {
  const { data, error } = await client.from("billing_card_attempts").select("id").or("state.in.(processing,unknown,pending),effects_completed_state.is.null").order("updated_at").limit(5);
  if (error) throw new Error("Não foi possível conferir os pagamentos do painel.");
  let checked = 0; let deferred = 0;
  for (const attempt of data ?? []) { try { await reconcileNativeBillingAttempt(client, attempt.id); checked++; } catch { deferred++; } }
  const recoveredPix = await recoverNativeBillingPix(client);
  return { checked, deferred, recoveredPix };
}

export function billingHolder(intent: BillingCheckoutIntent, defaults: Partial<CheckoutCardHolder>) {
  return { name: defaults.name ?? "", email: defaults.email ?? "", cpfCnpj: defaults.cpfCnpj ?? "", phone: defaults.phone ?? "", postalCode: "", addressNumber: "", ...record(intent.subscription.metadata?.billing_card_holder) };
}

async function recoverNativeBillingPix(client: SupabaseClient) {
  const { data, error } = await client.from("billing_payments").select("id,organization_id,subscription_id,amount_brl,payload").eq("provider", "asaas").eq("payload->>pix_creation_pending", "true").lt("updated_at", new Date(Date.now() - 180000).toISOString()).limit(5);
  if (error) throw new Error("Conferência Pix indisponível.");
  let recovered = 0;
  for (const row of data ?? []) {
    try {
      const config = await loadAsaasPlatformBillingConfig({ client });
      const reference = String(row.payload?.external_reference ?? "");
      if (!reference) continue;
      const payment = await findAsaasBillingPix(config, reference, Number(row.amount_brl));
      if (!payment?.id) continue; // A timeout without a matching payment never permits a new charge.
      const qr = await getAsaasPixQrCode({ ...config, paymentId: payment.id });
      const pix = extractAsaasPaymentData(payment, qr);
      const saved = await client.from("billing_payments").update({ provider_payment_id: payment.id, provider_status: payment.status, payload: { ...row.payload, pix_creation_pending: false, pix_qr_code: pix.pixQrCode, pix_qr_code_base64: pix.pixQrCodeBase64, asaas_payment_id: payment.id } }).eq("id", row.id).eq("payload->>pix_creation_pending", "true");
      if (saved.error) continue;
      await processPlatformBillingAsaasWebhook(client, { dataId: payment.id, eventType: "payment", action: "native_pix_reconciled", providerEventId: null, requestId: row.id, payload: { payment } });
      recovered++;
    } catch { /* Keep the durable hold for the next reconciliation. */ }
  }
  return recovered;
}
