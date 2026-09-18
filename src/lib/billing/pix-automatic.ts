import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { record, text } from "@/lib/sales-catalog/card-input";
import { loadAsaasPlatformBillingConfig, verifyAsaasWebhookToken } from "@/lib/sales-catalog/asaas";
import { loadNativeBillingSnapshot } from "./native-card-checkout";
import { billingLocalDate, billingPeriodEnd, readCommercialTerms } from "./commercial-terms";
import { processPlatformBillingAsaasWebhook } from "./platform-billing-webhook";
import { createPixAuthorization, cancelPixAuthorization, findPixAuthorization, getPixAuthorization, getPixPayment, listPixPayments, pixCustomer, pixRequest, PixAutomaticError, type PixAuthorization, type PixPayment } from "./asaas-pix-automatic-api";
import { validateReplacementCardField } from "./replacement-card-input";
import { pixAutomaticCheckoutRestriction } from "./pix-automatic-availability";

export const pixAutomaticConsentVersion = "connectyhub-pix-automatic-v1";
type Config = Awaited<ReturnType<typeof loadAsaasPlatformBillingConfig>>;
export type PixMandate = { id: string; organization_id: string; subscription_id: string; invoice_id: string; payment_id: string; actor_id: string; mode: string; contract_id: string; state: string; amount: number; recurring_amount: number; frequency: string; start_date: string; customer_id: string | null; provider_id: string | null; provider_subscription_id: string | null; conciliation_id: string | null; qr_payload: string | null; qr_image: string | null; qr_expires_at: string | null; initial_provider_payment_id: string | null; error_code: string | null; initial_effects_completed: boolean };
const columns = "*"; // Service-only tables; responses are explicitly projected below.
const frequency = { week: "WEEKLY", month: "MONTHLY", quarter: "QUARTERLY", semester: "SEMIANNUALLY", year: "ANNUALLY" };
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function enabled(config: Config) { return Boolean(config.accessToken && config.webhookSecret && (config.mode === "sandbox" || process.env.ASAAS_PIX_AUTOMATIC_ENABLED === "true")); }
async function rpc<T>(client: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await client.rpc(name, args);
  if (result.error || !result.data) throw new PixAutomaticError("busy", 503);
  return result.data as T;
}
export async function loadPixMandate(client: SupabaseClient, organizationId: string, subscriptionId: string) {
  const result = await client.from("billing_pix_authorizations").select(columns).eq("organization_id", organizationId).eq("subscription_id", subscriptionId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new PixAutomaticError("unavailable", 503);
  return result.data as PixMandate | null;
}
function publicMandate(a: PixMandate | null) {
  return a ? { id: a.id, state: a.state, active: a.state === "ACTIVE" && Boolean(a.initial_effects_completed), qrCode: a.state === "CREATED" ? a.qr_payload : null, qrImage: a.state === "CREATED" ? a.qr_image : null, expiresAt: a.qr_expires_at, error: a.error_code ? new PixAutomaticError(a.error_code).message : null, canRetry: a.state === "failed" || a.state === "REFUSED" } : null;
}
export async function pixCheckoutSnapshot(client: SupabaseClient, organizationId: string, subscriptionId: string, reconcile = false) {
  const snapshot = await loadNativeBillingSnapshot(client, organizationId, subscriptionId);
  const config = await loadAsaasPlatformBillingConfig({ client });
  let mandate = await loadPixMandate(client, organizationId, subscriptionId);
  if (reconcile && mandate && !["failed", "REFUSED"].includes(mandate.state)) mandate = await reconcilePixMandate(client, mandate, config);
  const restriction = pixAutomaticCheckoutRestriction({ checkoutKind: snapshot.intent.checkoutKind, subscriptionStatus: snapshot.intent.subscription.status, billingCycle: snapshot.terms.billingCycle, recurringAmount: snapshot.recurringAmount, providerSubscription: Boolean(snapshot.intent.subscription.provider_subscription_id), campaignPricing: Boolean(snapshot.intent.payment.payload?.campaign_pricing) });
  return { enabled: enabled(config) && !restriction, reason: !enabled(config) ? new PixAutomaticError("unavailable").message : restriction, amount: snapshot.amount, recurringAmount: snapshot.recurringAmount, recurrenceLabel: snapshot.recurrenceLabel, revision: snapshot.revision, consentVersion: pixAutomaticConsentVersion, authorization: publicMandate(mandate) };
}
export async function beginPixCheckout(client: SupabaseClient, scope: { organizationId: string; subscriptionId: string; actorId: string }, body: Record<string, unknown>, holder: { name: string; email: string; cpfCnpj: string; phone: string }) {
  if (!idPattern.test(text(body.requestId)) || body.acceptRecurring !== true || body.consentVersion !== pixAutomaticConsentVersion) throw new PixAutomaticError("invalid_input", 422);
  for (const field of ["name", "email", "cpfCnpj", "phone"] as const) if (validateReplacementCardField(field, holder[field])) throw new PixAutomaticError("invalid_input", 422);
  const snapshot = await loadNativeBillingSnapshot(client, scope.organizationId, scope.subscriptionId);
  const config = await loadAsaasPlatformBillingConfig({ client });
  if (!enabled(config)) throw new PixAutomaticError("unavailable", 503);
  if (snapshot.intent.checkoutKind !== "initial" || snapshot.terms.billingCycle !== "recurring" || snapshot.intent.payment.payload?.campaign_pricing || snapshot.recurringAmount <= 0) throw new PixAutomaticError("invalid_input", 422);
  if (body.amount !== snapshot.amount || body.recurringAmount !== snapshot.recurringAmount || body.revision !== snapshot.revision) throw new PixAutomaticError("busy");
  const claim = await rpc<{ claimed: boolean; authorization: PixMandate }>(client, "begin_billing_pix_authorization", { p_org: scope.organizationId, p_actor: scope.actorId, p_subscription: scope.subscriptionId, p_payment: snapshot.intent.payment.id, p_request: body.requestId, p_mode: config.mode, p_revision: snapshot.revision, p_amount: snapshot.amount, p_recurring: snapshot.recurringAmount, p_frequency: frequency[snapshot.terms.billingInterval], p_start: billingLocalDate(billingPeriodEnd(new Date(), snapshot.terms)) });
  let mandate = claim.authorization;
  if (!claim.claimed) return publicMandate(await reconcilePixMandate(client, mandate, config));
  let dispatched = false;
  try {
    const customerId = await pixCustomer(config, holder);
    // Persist identity and dispatch intent BEFORE the non-idempotent provider POST.
    const saved = await client.from("billing_pix_authorizations").update({ customer_id: customerId, state: "dispatching", updated_at: new Date().toISOString() }).eq("id", mandate.id).eq("state", "preparing").select(columns).single();
    if (saved.error) throw new PixAutomaticError("unknown", 503);
    mandate = saved.data as PixMandate;
    dispatched = true;
    const remote = await createPixAuthorization(config, { customerId, contractId: mandate.contract_id, frequency: mandate.frequency, startDate: mandate.start_date, amount: Number(mandate.amount), recurringAmount: Number(mandate.recurring_amount) });
    mandate = await sync(client, mandate, remote);
    return publicMandate(mandate);
  } catch (error) {
    // Never release the checkout after an ambiguous POST or a failed response save.
    const failure = !dispatched || error instanceof PixAutomaticError && error.definitive ? "provider_rejected" : "unknown";
    await rpc(client, "sync_billing_pix_authorization", { p_id: mandate.id, p_remote: {}, p_failure: failure });
    throw new PixAutomaticError(failure, 503);
  }
}
function sync(client: SupabaseClient, mandate: PixMandate, remote: PixAuthorization) { return rpc<PixMandate>(client, "sync_billing_pix_authorization", { p_id: mandate.id, p_remote: remote, p_failure: null }); }

export async function reconcilePixMandate(client: SupabaseClient, mandate: PixMandate, suppliedConfig?: Config): Promise<PixMandate> {
  if (["failed", "REFUSED"].includes(mandate.state)) return mandate;
  const config = suppliedConfig ?? await loadAsaasPlatformBillingConfig({ client });
  if (config.mode !== mandate.mode) throw new PixAutomaticError("unavailable", 503);
  if (!mandate.customer_id) return mandate; // No safe provider lookup yet; never dispatch from a read/retry.
  const remote = mandate.provider_id ? await getPixAuthorization(config, mandate.provider_id) : await findPixAuthorization(config, mandate.customer_id, mandate.contract_id);
  if (!remote) {
    const checked = await client.from("billing_pix_authorizations").update({ checked_at: new Date().toISOString() }).eq("id", mandate.id);
    if (checked.error) throw new PixAutomaticError("unknown", 503);
    return mandate; // Absence following timeout is not permission to POST again.
  }
  mandate = await sync(client, mandate, remote);
  const candidates = await listPixPayments(config, mandate.customer_id!);
  // Initial payment is matched by the documented conciliation identifier, never just value/customer.
  const initial = candidates.filter(p => p.conciliationIdentifier && p.conciliationIdentifier === mandate.conciliation_id);
  if (initial.length > 1) throw new PixAutomaticError("mismatch");
  if (initial[0]?.id) await settlePixPayment(client, mandate, await getPixPayment(config, initial[0].id));
  const renewed = await client.from("billing_pix_authorizations").select(columns).eq("id", mandate.id).single();
  if (renewed.error) throw new PixAutomaticError("unknown", 503);
  mandate = renewed.data as PixMandate;
  if (mandate.initial_provider_payment_id && mandate.provider_subscription_id) {
    const recurring = candidates.filter(p => p.subscription === mandate.provider_subscription_id && p.id !== mandate.initial_provider_payment_id).sort((a,b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
    for (const payment of recurring) if (payment.id) await settlePixPayment(client, mandate, await getPixPayment(config, payment.id));
  }
  return mandate;
}
export async function settlePixPayment(client: SupabaseClient, mandate: PixMandate, payment: PixPayment) {
  const initial = payment.conciliationIdentifier === mandate.conciliation_id && Boolean(mandate.conciliation_id);
  if (!payment.id || payment.customer !== mandate.customer_id || payment.billingType !== "PIX" || (!initial && (!mandate.provider_subscription_id || payment.subscription !== mandate.provider_subscription_id)) || Math.round(Number(payment.value)*100) !== Math.round(Number(initial ? mandate.amount : mandate.recurring_amount)*100)) throw new PixAutomaticError("mismatch");
  const approved = ["RECEIVED", "CONFIRMED"].includes(payment.status ?? "");
  if (payment.status === "REFUNDED" && mandate.provider_id) {
    const config = await loadAsaasPlatformBillingConfig({ client });
    if (config.mode !== mandate.mode) throw new PixAutomaticError("mismatch");
    const current = await getPixAuthorization(config, mandate.provider_id);
    if (current.id !== mandate.provider_id || current.customerId !== mandate.customer_id || current.contractId !== mandate.contract_id) throw new PixAutomaticError("mismatch");
    if (current.status === "ACTIVE") {
      const cancelled = await cancelPixAuthorization(config, current.id);
      if (cancelled.status !== "CANCELLED") throw new PixAutomaticError("unknown", 503);
      await sync(client, mandate, cancelled);
    }
  }
  if (initial && !mandate.initial_provider_payment_id && (mandate.state !== "ACTIVE" || !approved)) return;
  if (!initial && !mandate.initial_provider_payment_id) return;
  let start: Date | null = null, end: Date | null = null;
  if (!initial) {
    const current = await client.from("organization_subscriptions").select("current_period_end,metadata").eq("id", mandate.subscription_id).single();
    if (current.error || !payment.dueDate) throw new PixAutomaticError("unknown", 503);
    start = new Date(current.data.current_period_end);
    if (billingLocalDate(start) !== payment.dueDate) {
      const bound = await client.from("billing_pix_payments").select("payment_id").eq("provider_payment_id", payment.id).maybeSingle();
      if (bound.error) throw new PixAutomaticError("unknown", 503);
      if (!bound.data) return; // Future cycles wait for the preceding period; old known cycles can reconcile refunds.
      start = new Date(payment.dueDate + "T12:00:00Z");
    }
    end = billingPeriodEnd(start, readCommercialTerms(record(current.data.metadata).commercial_terms));
  }
  const reference = await rpc<string>(client, "bind_billing_pix_payment", { p_authorization: mandate.id, p_provider_payment: payment.id, p_amount: payment.value, p_initial: initial, p_start: start?.toISOString() ?? null, p_end: end?.toISOString() ?? null });
  const verified = { ...payment, externalReference: reference };
  const result = await processPlatformBillingAsaasWebhook(client, { dataId: payment.id, eventType: "payment", action: "pix_automatic_reconciled", providerEventId: null, requestId: mandate.id, payload: { payment: verified } }, verified);
  if (["failed", "deferred"].includes(result.processingStatus)) throw new PixAutomaticError("unknown", 503);
  if (initial && approved && result.processingStatus === "processed") {
    const saved = await client.from("billing_pix_authorizations").update({ initial_effects_completed: true }).eq("id", mandate.id);
    if (saved.error) throw new PixAutomaticError("unknown", 503);
  }
}

export async function processPixAutomaticWebhook(client: SupabaseClient, payload: Record<string, unknown>, header: string | null) {
  const event = text(payload.event), authorization = record(payload.authorization), instruction = record(payload.paymentInstruction), payment = record(payload.payment), subscription = record(payload.subscription);
  const automaticEvent = event.startsWith("PIX_AUTOMATIC_");
  const resource = text(authorization.id) || text(record(instruction.authorization).id);
  let lookup = client.from("billing_pix_authorizations").select(columns);
  if (resource) lookup = lookup.eq("provider_id", resource);
  else if (text(payment.conciliationIdentifier)) lookup = lookup.eq("conciliation_id", payment.conciliationIdentifier);
  else if (text(payment.subscription)) lookup = lookup.eq("provider_subscription_id", payment.subscription);
  else if (event.startsWith("SUBSCRIPTION_") && text(subscription.id)) lookup = lookup.eq("provider_subscription_id", subscription.id);
  else if (!automaticEvent) return null;
  const config = await loadAsaasPlatformBillingConfig({ client });
  if (!verifyAsaasWebhookToken({ header, token: config.webhookSecret }).ok) throw new PixAutomaticError("forbidden", 401);
  if (!resource && !text(payment.conciliationIdentifier) && !text(payment.subscription) && !text(subscription.id)) return { ok: true, ignored: true };
  const found = await lookup.maybeSingle();
  if (found.error) throw new PixAutomaticError("unknown", 503);
  if (!found.data) return automaticEvent ? { ok: true, ignored: true } : null;
  let mandate = found.data as PixMandate;
  const eventId = text(payload.id);
  if (!eventId || eventId.length > 200) throw new PixAutomaticError("invalid_input", 422);
  const key = `${config.mode}:${eventId}`;
  const saved = await client.from("billing_pix_events").upsert({ event_id: key, authorization_id: mandate.id, event_type: event.slice(0,150), resource_id: text(instruction.id) || text(payment.id) || resource, resource_status: null }, { onConflict: "event_id", ignoreDuplicates: true });
  if (saved.error) throw new PixAutomaticError("unknown", 503);
  const prior = await client.from("billing_pix_events").select("completed_at,authorization_id").eq("event_id", key).single();
  if (prior.error || prior.data.authorization_id !== mandate.id) throw new PixAutomaticError("mismatch");
  if (prior.data.completed_at) return { ok: true, duplicate: true };
  // Fresh GET is authoritative even when webhook events arrive out of order.
  mandate = await reconcilePixMandate(client, mandate, config);
  let instructionStatus: string | null = null;
  if (text(instruction.id)) {
    const current = await pixRequest(config, `/pix/automatic/paymentInstructions/${encodeURIComponent(text(instruction.id))}`);
    if (text(record(current.authorization).id) !== mandate.provider_id) throw new PixAutomaticError("mismatch");
    instructionStatus = text(current.status);
  }
  if (text(payment.id)) await settlePixPayment(client, mandate, await getPixPayment(config, text(payment.id)));
  const finished = await client.from("billing_pix_events").update({ completed_at: new Date().toISOString(), resource_status: instructionStatus ?? mandate.state }).eq("event_id", key);
  if (finished.error) throw new PixAutomaticError("unknown", 503);
  return { ok: true, received: true };
}
export async function reconcilePendingPixAutomatic(client: SupabaseClient) {
  const rows = await client.from("billing_pix_authorizations").select(columns).not("state", "in", "(failed,REFUSED)").order("checked_at", { ascending: true, nullsFirst: true }).limit(10);
  if (rows.error) throw new PixAutomaticError("unavailable", 503);
  let checked = 0, pending = 0;
  for (const row of rows.data ?? []) {
    try { await reconcilePixMandate(client, row as PixMandate); checked++; } catch { pending++; }
    finally {
      // Rotate unresolved operations too, so a stale timeout cannot starve active subscriptions.
      await client.from("billing_pix_authorizations").update({ checked_at: new Date().toISOString() }).eq("id", row.id);
    }
  }
  return { checked, pending };
}
