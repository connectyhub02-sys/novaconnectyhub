import { billingBumpInterval } from "./plan-checkout-catalog";
import "server-only";
import { savePendingAsaasCard } from "./asaas-card-vault";
import { managedRenewalConsentVersion } from "./managed-renewal-policy";
import { payExistingAsaasBillingCard, findAsaasSubscriptionCycle } from "@/lib/sales-catalog/asaas-direct";
import { billingPeriodEnd, billingTermsLabel, readCommercialTerms } from "./commercial-terms";
import { readCheckoutCommercialTerms } from "./plan-checkout";
import { readCheckoutPlanAmounts } from "./plan-discounts";
import { paymentOutcomeCopy } from "@/lib/sales-catalog/payment-diagnostics";
import { isIP } from "node:net";
import { sanitizePaymentAuditPayload } from "@/lib/security/payment-audit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { record, parseCheckoutCard, parseCheckoutCardHolder, type CheckoutCardHolder } from "@/lib/sales-catalog/card-input";
import { AsaasDirectError, findAsaasBillingPix, applyAsaasPaymentEvent, createAsaasDirectCardPayment, findAsaasNativeSubscription, cancelAsaasNativeSubscription, findAsaasDirectPayment, getAsaasNativePayment, retireAsaasPayment } from "@/lib/sales-catalog/asaas-direct";
import { loadAsaasPlatformBillingConfig, getAsaasPixQrCode, extractAsaasPaymentData, verifyAsaasWebhookToken, type AsaasPaymentResponse } from "@/lib/sales-catalog/asaas";
import { CheckoutError, directPaymentState } from "@/lib/sales-catalog/transparent-checkout";
import { loadBillingCheckoutIntent, resolveBillingCheckoutProvider, isBillingCheckoutPayable, loadBillingCheckoutBumps, readSelectedBillingCheckoutBumpCodesForCatalog, type BillingCheckoutIntent } from "./plan-checkout";
import { processPlatformBillingAsaasWebhook, notifyNativeBillingOutcome } from "./platform-billing-webhook";

export type Attempt = { id: string; organization_id: string; subscription_id: string; invoice_id: string; payment_id: string; amount: number; recurring_amount: number; external_reference: string; state: string; stage: string; provider_subscription_id: string | null; provider_payment_id: string | null; previous_subscription_id: string | null; updated_at: string; created_at: string; managed_renewal?: boolean; effects_completed_state: string | null; effects_claimed_at: string | null };
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
    client.from("billing_payments").select("checkout_revision").eq("id", intent.payment.id).eq("organization_id", organizationId).single(), loadBillingCheckoutBumps(client, intent),
  ]);
  if (error || revision.error) throw new CheckoutError("Não foi possível conferir o pagamento.", 503);
  const selected = readSelectedBillingCheckoutBumpCodesForCatalog(intent, bumps);
  const pricing = readCheckoutPlanAmounts(intent);
  const planAmount = pricing.amount;
  const chosen = bumps.filter(b => selected.includes(b.code));
  const amount = Math.round((planAmount + chosen.reduce((sum, bump) => sum + bump.priceBrl, 0)) * 100) / 100;
  const terms = readCheckoutCommercialTerms(intent);
  if (chosen.some(b => b.recurrence !== "one_time" && (terms.billingCycle !== "recurring" || billingBumpInterval(b.recurrence) !== terms.billingInterval))) throw new CheckoutError("Escolha adicionais com o mesmo intervalo do plano.", 422);
  const recurringAmount = Math.round(((terms.billingCycle === "recurring" ? pricing.renewalAmount : 0) + chosen.filter(b => b.recurrence !== "one_time").reduce((sum, bump) => sum + bump.priceBrl, 0)) * 100) / 100;
  return { intent, terms, recurrenceLabel: billingTermsLabel(terms), selected, amount, recurringAmount, revision: Number(revision.data.checkout_revision), attempt: (attempts?.[0] ?? null) as Attempt | null };
}

export async function payNativeBillingCard(client: SupabaseClient, organizationId: string, subscriptionId: string, body: Record<string, unknown>, remoteIp: string) {
  const snapshot = await loadNativeBillingSnapshot(client, organizationId, subscriptionId);
  if (snapshot.attempt && activeStates.includes(snapshot.attempt.state)) return billingAttemptResult(await reconcileNativeBillingAttempt(client, snapshot.attempt.id));
  if (!isBillingCheckoutPayable(snapshot.intent)) throw new CheckoutError("Este pagamento já foi finalizado.", 409);
  if (snapshot.recurringAmount > 0 && (body.acceptRecurring !== true || body.recurringConsentVersion !== managedRenewalConsentVersion)) throw new CheckoutError("Confirme as condições de renovação.", 422);
  if (!isIP(remoteIp) || typeof body.attemptId !== "string" || !uuid.test(body.attemptId)) throw new CheckoutError("Atualize a página antes de pagar.", 400);
  if (body.amount !== snapshot.amount || body.revision !== snapshot.revision || Number(snapshot.intent.payment.amount_brl) !== snapshot.amount) throw new CheckoutError("O carrinho mudou. Confira o total antes de pagar.", 409);
  const card = parseCheckoutCard(body.card); const holder = parseCheckoutCardHolder(body.holder);
  const config = await loadAsaasPlatformBillingConfig({ client });
  if (!config.accessToken || !config.webhookSecret) throw new CheckoutError("O recebimento da ConnectyHub precisa ser configurado.", 503);
  // Never replace an already-running recurring agreement as a side effect of a retry.
  const recurringAttemptId = record(snapshot.intent.payment.payload).native_recurring_attempt_id;
  const managedReference = record(snapshot.intent.payment.payload).managed_external_reference;
  const recurringInvoice = (typeof recurringAttemptId === "string" || typeof managedReference === "string") && Boolean(snapshot.intent.payment.provider_payment_id);
  if (snapshot.intent.subscription.provider_subscription_id?.startsWith("sub_") && !recurringInvoice) throw new CheckoutError("Este plano já possui renovação automática. Confira a cobrança existente no painel antes de criar outra assinatura.", 409);
  const reference = `billing_card:${body.attemptId}`;
  const { data, error } = await client.rpc("claim_native_billing_card", { p_org: organizationId, p_payment: snapshot.intent.payment.id, p_attempt: body.attemptId, p_revision: snapshot.revision, p_amount: snapshot.amount, p_recurring: snapshot.recurringAmount, p_reference: reference });
  if (error || !data?.attempt) throw new CheckoutError("O pagamento está sendo conferido ou o carrinho mudou. Atualize a página.", 409);
  let attempt = data.attempt as Attempt;
  if (!data.claimed) return billingAttemptResult(await reconcileNativeBillingAttempt(client, attempt.id));
  try {
    const customerId = snapshot.recurringAmount > 0 && !snapshot.intent.subscription.provider_subscription_id ? await savePendingAsaasCard(client, {...config, organizationId, subscriptionId, attemptId: attempt.id, card, holder, remoteIp}) : undefined;
    if (recurringInvoice) {
      const saved = await client.from("billing_card_attempts").update({provider_payment_id:snapshot.intent.payment.provider_payment_id,stage:"charging"}).eq("id",attempt.id).select("*").single();
      if(saved.error) throw new AsaasDirectError(true,false);
      attempt=saved.data as Attempt;
      const payment = await payExistingAsaasBillingCard({...config, paymentId:snapshot.intent.payment.provider_payment_id!, expectedReference:typeof managedReference === "string" ? managedReference : "billing_recurring:"+recurringAttemptId, amount:snapshot.amount,card,holder,remoteIp});
      return billingAttemptResult(await finishNativeBilling(client,attempt,directPaymentState(payment),payment));
    }
    const oldPaymentId = snapshot.intent.payment.provider_payment_id;
    if (oldPaymentId) await retireAsaasPayment(config, oldPaymentId, !oldPaymentId.startsWith("pay_"));
    const { error: holderError } = await client.from("organization_subscriptions").update({ metadata: { ...record(snapshot.intent.subscription.metadata), billing_card_holder: holder } }).eq("id", subscriptionId).eq("organization_id", organizationId);
    if (holderError) throw new AsaasDirectError(true, false);
    // Recurring card authorization is saved in our vault. No provider-managed agreement.
    const saved = await client.from("billing_card_attempts").update({ stage: "charging", updated_at: new Date().toISOString() }).eq("id", attempt.id).eq("state", "processing").select("*").single();
    if (saved.error) throw new AsaasDirectError(false, false);
    attempt = saved.data as Attempt;
    const payment = await createAsaasDirectCardPayment({ ...config, card, holder, customerId, amount: snapshot.amount, installments: 1, externalReference: attempt.external_reference, remoteIp });
    return billingAttemptResult(await finishNativeBilling(client, attempt, directPaymentState(payment), payment));
  } catch (error) {
    const definitive = error instanceof AsaasDirectError && error.definitive;
    if (error instanceof AsaasDirectError && error.diagnostic) {
      const diagnostic = await client.from("billing_card_attempts").update({ diagnostic: error.diagnostic }).eq("id", attempt.id).eq("organization_id", organizationId);
      if (diagnostic.error) throw new CheckoutError("Pagamento em conferência. Não repita a cobrança.", 503);
    }
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
  const managed = attempt.managed_renewal ? await client.from("billing_payments").select("payload").eq("id",attempt.payment_id).single() : null;
  if (managed?.error) throw new CheckoutError("Pagamento em conferência.",503);
  const lookupReference = String(managed?.data?.payload?.managed_external_reference ?? attempt.external_reference);
  const payment = webhookPayment ?? (attempt.provider_payment_id ? await getAsaasNativePayment(config, attempt.provider_payment_id) : await findAsaasDirectPayment(config, lookupReference, { amount: Number(attempt.amount), installments: 1 }));
  if (payment) {
    const invoice = await client.from("billing_payments").select("payload").eq("id",attempt.payment_id).single();
    if (invoice.error) throw new CheckoutError("Pagamento em conferência.",503);
    const recurringOrigin = record(invoice.data?.payload).native_recurring_attempt_id;
    const expectedReference = record(invoice.data?.payload).managed_external_reference ?? (recurringOrigin ? "billing_recurring:"+recurringOrigin : attempt.external_reference);
    if (payment.externalReference !== expectedReference || payment.billingType !== "CREDIT_CARD" || Math.round(Number(payment.value) * 100) !== Math.round(Number(attempt.amount) * 100)) throw new CheckoutError("Pagamento em conferência.", 409);
    return finishNativeBilling(client, attempt, directPaymentState(payment), payment);
  }
  if (!attempt.managed_renewal && attempt.stage === "preparing" && Date.now() - Date.parse(attempt.created_at as string) > 180000) {
    // No charge was ever dispatched. Retire a recovered future agreement before allowing a retry.
    const recurring = await findAsaasNativeSubscription(config, `billing_recurring:${id}`);
    if (recurring) await cancelAsaasNativeSubscription(config, recurring.id, `billing_recurring:${id}`);
    return finishNativeBilling(client, attempt, "error");
  }
  attempt = await finishNativeBilling(client, attempt, "unknown");
  return attempt; // Absence after a charge timeout never authorizes a second debit.
}

export async function finishNativeBilling(client: SupabaseClient, attempt: Attempt, state: string, payment?: AsaasPaymentResponse) {
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
    if (attempt.state === "refunded" && recurring && !recurring.deleted) {
      await cancelAsaasNativeSubscription(config, recurring.id, `billing_recurring:${attempt.id}`);
    }
    if (attempt.state === "approved" && recurring && !recurring.deleted) {
      const { error: saveError } = await client.from("organization_subscriptions").update({ provider_subscription_id: recurring.id }).eq("id", attempt.subscription_id).eq("organization_id", attempt.organization_id);
      if (saveError) throw new CheckoutError("Ativação em processamento.", 503);
    }
    const canonical = `connectyhub_subscription:${attempt.organization_id}:${attempt.subscription_id}:${attempt.invoice_id}:${attempt.payment_id}`;
    await processPlatformBillingAsaasWebhook(client, { dataId: payment.id!, eventType: "payment", action: "native_card_reconciled", providerEventId: null, requestId: attempt.id, payload: { payment: { ...payment, externalReference: canonical } } }, { ...payment, externalReference: canonical });
  } else {
    if (["rejected", "error", "cancelled"].includes(attempt.state) && attempt.provider_subscription_id) await cancelAsaasNativeSubscription(config, attempt.provider_subscription_id, `billing_recurring:${attempt.id}`);
    const intent = await loadBillingCheckoutIntent(client, { organizationId: attempt.organization_id, subscriptionId: attempt.subscription_id });
    if (intent) await notifyNativeBillingOutcome(client, { intent, attemptId: attempt.id, status: attempt.state, amount: Number(attempt.amount) });
  }
  const { error: saveError } = await client.from("billing_card_attempts").update({ effects_completed_state: attempt.state, effects_claimed_at: null }).eq("id", attempt.id).eq("state", attempt.state).eq("effects_claimed_at", lease.effects_claimed_at);
  if (saveError) throw new CheckoutError("Aviso do pagamento em processamento.", 503);
}

export function billingAttemptResult(attempt: Attempt) {
  return { ok: true, status: attempt.state, approved: attempt.state === "approved", rejected: ["rejected", "error", "cancelled"].includes(attempt.state), providerPaymentId: attempt.provider_payment_id, message: attempt.state === "approved" ? "Pagamento confirmado. Sua compra está sendo liberada no painel." : paymentOutcomeCopy(attempt.state) };
}

export async function processNativeBillingWebhook(client: SupabaseClient, payload: Record<string, unknown>, header: string | null) {
  const payment = record(payload.payment); const recurring = record(payload.subscription);
  let reference = String(payment.externalReference ?? recurring.externalReference ?? "");
  if (!reference && (payment.id || recurring.id)) {
    const column = payment.id ? "provider_payment_id" : "provider_subscription_id";
    const { data, error } = await client.from("billing_card_attempts").select("id,payment_id").eq(column, String(payment.id ?? recurring.id)).order("created_at", {ascending: false}).limit(1).maybeSingle();
    if (error) throw new CheckoutError("Pagamento em conferência.",503);
    if (data) {
      const invoice = payment.id ? await client.from("billing_payments").select("payload").eq("id",data.payment_id).single() : null;
      if (invoice?.error) throw new CheckoutError("Pagamento em conferência.",503);
      reference = String(record(invoice?.data?.payload).managed_external_reference ?? `${payment.id ? "billing_card" : "billing_recurring"}:${data.id}`);
    }
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
  if (reference.startsWith("billing_managed:")) {
    const paymentId = reference.split(":")[1];
    if (!uuid.test(paymentId ?? "")) throw new CheckoutError("Referência inválida.",400);
    const config = await loadAsaasPlatformBillingConfig({client});
    if (!verifyAsaasWebhookToken({header,token:config.webhookSecret}).ok) throw new CheckoutError("invalid_webhook_token",401);
    const remote = await getAsaasNativePayment(config,String(payment.id));
    if (remote.billingType === "PIX") {
      await reconcileManagedBillingPix(client,paymentId,remote);
      return {ok:true,processed:true};
    }
    const latest = await client.from("billing_card_attempts").select("id").eq("payment_id",paymentId).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if (latest.error || !latest.data) throw new CheckoutError("Pagamento em conferência.",503);
    // A late refusal event cannot be attributed to a newer attempt on the same invoice.
    await reconcileNativeBillingAttempt(client,latest.data.id,remote,true);
    return {ok:true,processed:true};
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
  if (!["CREDIT_CARD", "PIX"].includes(String(payment.billingType)) || payment.externalReference !== `billing_recurring:${attemptId}` || Math.round(Number(payment.value) * 100) !== Math.round(Number(attempt.recurring_amount) * 100)) throw new CheckoutError("Recorrência em conferência.", 409);
  const current = await client.from("organization_subscriptions").select("current_period_end,metadata").eq("id", attempt.subscription_id).single();
  if (current.error) throw new CheckoutError("Renovação em conferência.", 503);
  const terms = readCommercialTerms(record(current.data.metadata).commercial_terms);
  const due = payment.dueDate ? new Date(payment.dueDate + "T12:00:00Z") : new Date(current.data.current_period_end);
  if (Number.isNaN(due.getTime())) throw new CheckoutError("Período da renovação em conferência.", 409);
  const end = billingPeriodEnd(due, terms);
  const { data: ref, error } = await client.rpc("bind_native_billing_renewal", { p_attempt: attemptId, p_provider_payment: paymentId, p_amount: payment.value, p_start: due.toISOString(), p_end: end.toISOString() });
  if (error || !ref) throw new CheckoutError("Renovação em processamento.", 503);
  await processPlatformBillingAsaasWebhook(client, { dataId: paymentId, eventType: "payment", action: "native_recurring_reconciled", providerEventId: null, requestId: paymentId, payload: { payment: { ...payment, externalReference: ref } } }, { ...payment, externalReference: ref });
}

export async function reconcilePendingNativeBilling(client: SupabaseClient) {
  const { data, error } = await client.from("billing_card_attempts").select("id").or("state.in.(processing,unknown,pending),effects_completed_state.is.null").order("updated_at").limit(5);
  if (error) throw new Error("Não foi possível conferir os pagamentos do painel.");
  let checked = 0; let deferred = 0;
  for (const attempt of data ?? []) { try { await reconcileNativeBillingAttempt(client, attempt.id); checked++; } catch { deferred++; } }
  const recoveredPix = await recoverNativeBillingPix(client);
  return { checked, deferred, recoveredPix };
}

async function reconcileManagedBillingPix(client: SupabaseClient, paymentId: string, payment: AsaasPaymentResponse) {
  const local = await client.from("billing_payments").select("organization_id,subscription_id,invoice_id,amount_brl,provider_payment_id").eq("id",paymentId).single();
  if (local.error || !local.data || payment.externalReference !== `billing_managed:${paymentId}` || payment.id !== local.data.provider_payment_id || payment.billingType !== "PIX" || Math.round(Number(payment.value)*100) !== Math.round(Number(local.data.amount_brl)*100)) throw new CheckoutError("Pagamento em conferência.",409);
  const canonical = `connectyhub_subscription:${local.data.organization_id}:${local.data.subscription_id}:${local.data.invoice_id}:${paymentId}`;
  // Paying by Pix must not activate a card token from a rejected card attempt.
  await processPlatformBillingAsaasWebhook(client,{dataId:payment.id!,eventType:"payment",action:"managed_pix_reconciled",providerEventId:null,requestId:paymentId,payload:{payment:{...payment,externalReference:canonical}}},{...payment,externalReference:canonical});
}

export function billingHolder(intent: BillingCheckoutIntent, defaults: Partial<CheckoutCardHolder>) {
  return { name: defaults.name ?? "", email: defaults.email ?? "", cpfCnpj: defaults.cpfCnpj ?? "", phone: defaults.phone ?? "", postalCode: "", addressNumber: "", ...record(intent.subscription.metadata?.billing_card_holder) };
}

async function recoverNativeBillingPix(client: SupabaseClient) {
  const { data, error } = await client.from("billing_payments").select("id,organization_id,subscription_id,provider_payment_id,amount_brl,payload").eq("provider", "asaas").eq("payload->>pix_creation_pending", "true").lt("updated_at", new Date(Date.now() - 180000).toISOString()).limit(5);
  if (error) throw new Error("Conferência Pix indisponível.");
  let recovered = 0;
  for (const row of data ?? []) {
    try {
      const config = await loadAsaasPlatformBillingConfig({ client });
      const recurringOrigin = row.payload?.native_recurring_attempt_id;
      const managedReference = row.payload?.managed_external_reference;
      const reference = managedReference ? String(managedReference) : recurringOrigin ? "billing_recurring:"+recurringOrigin : String(row.payload?.external_reference ?? "");
      if (!reference) continue;
      const payment = (managedReference || recurringOrigin) && row.provider_payment_id ? await getAsaasNativePayment(config,row.provider_payment_id) : await findAsaasBillingPix(config, reference, Number(row.amount_brl));
      if (payment && (payment.externalReference !== reference || payment.billingType !== "PIX" || Math.round(Number(payment.value)*100) !== Math.round(Number(row.amount_brl)*100))) continue;
      if (!payment?.id) continue; // A timeout without a matching payment never permits a new charge.
      const qr = await getAsaasPixQrCode({ ...config, paymentId: payment.id });
      const pix = extractAsaasPaymentData(payment, qr);
      const saved = await client.from("billing_payments").update({ provider_payment_id: payment.id, provider_status: payment.status, payload: { ...row.payload, pix_creation_pending: false, pix_qr_code: pix.pixQrCode, pix_qr_code_base64: pix.pixQrCodeBase64, asaas_payment_id: payment.id } }).eq("id", row.id).eq("payload->>pix_creation_pending", "true");
      if (saved.error) continue;
      if (managedReference) await reconcileManagedBillingPix(client,row.id,payment);
      else if (recurringOrigin) await processNativeBillingRenewal(client,String(recurringOrigin),payment.id);
      else await processPlatformBillingAsaasWebhook(client, { dataId: payment.id, eventType: "payment", action: "native_pix_reconciled", providerEventId: null, requestId: row.id, payload: { payment } });
      recovered++;
    } catch { /* Keep the durable hold for the next reconciliation. */ }
  }
  return recovered;
}

export async function ensureAsaasRecurringInvoice(client:SupabaseClient, subscriptionId:string, providerSubscriptionId:string, periodEnd:string) {
  const origin=await client.from("billing_card_attempts").select("id").eq("subscription_id",subscriptionId).eq("provider_subscription_id",providerSubscriptionId).eq("state","approved").limit(1).maybeSingle();
  if(origin.error||!origin.data) throw new CheckoutError("Recorrência em conferência.",503);
  const config=await loadAsaasPlatformBillingConfig({client});
  const payment=await findAsaasSubscriptionCycle(config,providerSubscriptionId,periodEnd.slice(0,10));
  if(!payment?.id) return false;
  await processNativeBillingRenewal(client,origin.data.id,payment.id);
  return true;
}
