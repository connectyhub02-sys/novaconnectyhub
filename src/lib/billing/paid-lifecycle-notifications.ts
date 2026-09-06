import "server-only";
import { billingLocalDate, billingPeriodEnd, isBillingDeadlineReached, readCommercialTerms } from "./commercial-terms";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDashboardBillingCheckoutPath,
  buildDashboardBillingCheckoutUrl,
  buildPlatformBillingExternalReference,
  isBillingCheckoutPayable,
  loadBillingCheckoutIntent,
} from "@/lib/billing/plan-checkout";
import {
  sendPlatformBillingLifecycleNotification,
  processPlatformBillingPagBankWebhook,
  type PlatformBillingLifecycleNotificationType,
} from "@/lib/billing/platform-billing-webhook";
import {
  loadDefaultPagBankBillingCardMethod,
  markBillingPaymentMethodFailed,
} from "@/lib/billing/payment-methods";
import {
  normalizePlatformBillingRenewalPolicy,
  platformBillingRenewalPolicyMetadataKey,
  type PlatformBillingRenewalPolicy,
} from "@/lib/billing/renewal-policy";
import { getAppBaseUrl } from "@/lib/sales-catalog/mercado-pago";
import {
  buildPagBankPlatformBillingWebhookUrl,
  createPagBankCardOrder,
  extractPagBankCardData,
  loadPagBankPlatformBillingConfig,
} from "@/lib/sales-catalog/pagbank";

type JsonRecord = Record<string, unknown>;

type PlanRelation = {
  name: string | null;
  monthly_price_brl: number | string | null;
  included_credits: number | string | null;
} | null;

type SubscriptionRow = {
  id: string;
  subscription_kind: "plan" | "product";
  organization_id: string;
  plan_id: string | null;
  plan_code: string;
  status: string | null;
  billing_provider: string | null;
  provider_subscription_id: string | null;
  payer_email: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_billing_at: string | null;
  included_credits_granted: number | string | null;
  metadata: JsonRecord | null;
  billing_plans: PlanRelation | PlanRelation[] | null;
};

type WalletRow = {
  organization_id: string;
  balance_credits: number | string | null;
  lifetime_used_credits: number | string | null;
};

type CycleRow = {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  cycle_start: string;
  cycle_end: string;
  included_credits: number | string | null;
  used_credits: number | string | null;
  status: string | null;
};

type PaymentRow = {
  id: string;
  invoice_id: string | null;
  subscription_id: string | null;
  provider: string | null;
  provider_status: string | null;
  status: string | null;
  payload: JsonRecord | null;
  created_at: string | null;
  paid_at: string | null;
};

type RenewalCheckoutRef = {
  invoiceId: string;
  paymentId: string;
  checkoutPath: string;
  checkoutUrl: string;
  checkoutKind: string;
  targetPlanCode: string;
  reused: boolean;
};

type PlatformBillingSettingsRow = {
  metadata: JsonRecord | null;
};

type PaidLifecycleSummary = {
  checked: number;
  cardRenewalAttempts: number;
  cardRenewalApproved: number;
  deadlineNotifications: number;
  creditNotifications: number;
  expiredPlans: number;
  skipped: number;
  failed: number;
  warnings: string[];
};

const DAY_MS = 86_400_000;

export async function processPaidBillingLifecycleNotifications(
  client: SupabaseClient,
  input: { limit?: number; now?: Date } = {},
): Promise<PaidLifecycleSummary> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 250);
  const now = input.now ?? new Date();
  const subscriptions = await loadPaidSubscriptions(client, limit);
  const summary: PaidLifecycleSummary = {
    checked: subscriptions.length,
    cardRenewalAttempts: 0,
    cardRenewalApproved: 0,
    deadlineNotifications: 0,
    creditNotifications: 0,
    expiredPlans: 0,
    skipped: 0,
    failed: 0,
    warnings: [],
  };

  if (subscriptions.length === 0) {
    return summary;
  }

  const organizationIds = Array.from(new Set(subscriptions.map((subscription) => subscription.organization_id)));
  const subscriptionIds = subscriptions.map((subscription) => subscription.id);
  const [wallets, cycles, payments, renewalPolicy] = await Promise.all([
    loadWallets(client, organizationIds),
    loadOpenCycles(client, subscriptionIds),
    loadLatestPayments(client, subscriptionIds),
    loadRenewalPolicy(client),
  ]);
  const walletByOrganizationId = new Map(wallets.map((wallet) => [wallet.organization_id, wallet]));
  const paymentBySubscriptionId = buildLatestPaymentMap(payments);

  for (const subscription of subscriptions) {
    try {
      const context = buildNotificationContext({
        subscription,
        wallet: walletByOrganizationId.get(subscription.organization_id) ?? null,
        cycle: findCurrentCycle(cycles, subscription, now),
        latestPayment: paymentBySubscriptionId.get(subscription.id) ?? null,
        renewalPolicy,
        now,
      });
      const terms = readCommercialTerms(subscription.metadata?.commercial_terms);
      if (subscription.subscription_kind === "product" && (terms.billingCycle === "one_time" || subscription.status === "canceled")) continue;
      if (terms.billingCycle === "one_time" || subscription.status === "canceled") {
        if (isBillingDeadlineReached(context.periodEnd, 0, now)) {
          if (await markSubscriptionPastDue(client, { subscription, now, periodEnd: context.periodEnd })) summary.expiredPlans++;
        }
        continue; // End a paid access period without generating an uncontracted renewal/debt notice.
      }
      const cardAttempt = await maybeAttemptPagBankCardRenewal(client, context, renewalPolicy, now).catch((error) => {
        summary.warnings.push(error instanceof Error ? error.message : "Falha na tentativa automatica de cartao.");
        return { attempted: false, approved: false, failed: true };
      });

      if (cardAttempt.attempted) {
        summary.cardRenewalAttempts += 1;
      }

      if (cardAttempt.approved) {
        summary.cardRenewalApproved += 1;
        continue;
      }

      const deadlineEvent = pickDeadlineEvent(context, renewalPolicy, now);

        if (deadlineEvent) {
          if (deadlineEvent.eventType === "paid_plan_expired") {
            const expired = await markSubscriptionPastDue(client, {
            subscription,
            now,
            periodEnd: context.periodEnd,
          });

          if (!expired) continue;
          if (expired) {
            summary.expiredPlans += 1;
            }
          }

          const renewalCheckout = await ensureLifecycleRenewalCheckout(client, context, deadlineEvent.eventType).catch((error) => {
            summary.warnings.push(error instanceof Error ? error.message : "Nao foi possivel criar checkout de renovacao.");
            return null;
          });
          const result = await sendLifecycleNotification(client, {
            context,
            eventType: deadlineEvent.eventType,
            dedupeSuffix: deadlineEvent.dedupeSuffix,
            source: "paid_plan_deadline_sweep",
            renewalCheckout,
          });

        if (result.status === "failed") {
          summary.failed += 1;
        } else if (result.status === "skipped") {
          summary.skipped += 1;
        } else {
          summary.deadlineNotifications += 1;
        }
      }

      if (!deadlineEvent || deadlineEvent.eventType !== "paid_plan_expired") {
        const creditEvent = pickCreditThresholdEvent(context);

        if (creditEvent) {
          const result = await sendLifecycleNotification(client, {
            context,
            eventType: creditEvent,
            dedupeSuffix: context.cycle?.id ?? dateOnly(context.periodEnd) ?? "wallet",
            source: "paid_credit_threshold_sweep",
          });

          if (result.status === "failed") {
            summary.failed += 1;
          } else if (result.status === "skipped") {
            summary.skipped += 1;
          } else {
            summary.creditNotifications += 1;
          }
        }
      }
    } catch (error) {
      summary.failed += 1;
      summary.warnings.push(error instanceof Error ? error.message : "Falha ao processar ciclo pago.");
    }
  }

  return summary;
}

async function loadPaidSubscriptions(client: SupabaseClient, pageSize: number) {
  const rows: SubscriptionRow[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from("organization_subscriptions")
      .select("id, subscription_kind, organization_id, plan_id, plan_code, status, billing_provider, provider_subscription_id, payer_email, current_period_start, current_period_end, next_billing_at, included_credits_granted, metadata, billing_plans(name, monthly_price_brl, included_credits)")
      .not("plan_code", "in", "(trial,internal)").in("status", ["active", "past_due", "canceled"])
      .order("id", { ascending: true }).range(offset, offset + pageSize - 1).returns<SubscriptionRow[]>();
    if (error) throw new Error("Não foi possível carregar todos os contratos: " + error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}

async function readFinancialRows<T>(client:SupabaseClient,table:string,columns:string,key:string,ids:string[]) {
  const rows:T[]=[];
  for(let start=0;start<ids.length;start+=100) for(let offset=0;;offset+=500) {
    const result=await client.from(table).select(columns).in(key,ids.slice(start,start+100)).order("id").range(offset,offset+499);
    if(result.error) throw new Error("Não foi possível consultar "+table+": "+result.error.message);
    rows.push(...(result.data??[]) as T[]); if((result.data?.length??0)<500) break;
  }
  return rows;
}
async function loadWallets(client:SupabaseClient,ids:string[]) {
  return readFinancialRows<WalletRow>(client,"credit_wallets","organization_id,balance_credits,lifetime_used_credits","organization_id",ids);
}
async function loadOpenCycles(client:SupabaseClient,ids:string[]) {
  return (await readFinancialRows<CycleRow>(client,"billing_cycles","id,organization_id,subscription_id,cycle_start,cycle_end,included_credits,used_credits,status","subscription_id",ids)).filter(c=>c.status==="open").sort((a,b)=>b.cycle_end.localeCompare(a.cycle_end));
}
async function loadLatestPayments(client:SupabaseClient,ids:string[]) {
  return (await readFinancialRows<PaymentRow>(client,"billing_payments","id,invoice_id,subscription_id,provider,provider_status,status,payload,created_at,paid_at","subscription_id",ids)).sort((a,b)=>(b.created_at??"").localeCompare(a.created_at??""));
}

async function loadRenewalPolicy(client: SupabaseClient) {
  const { data, error } = await client
    .from("platform_billing_settings")
    .select("metadata")
    .eq("setting_key", "default")
    .maybeSingle<PlatformBillingSettingsRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar a regua de renovacao: ${error.message}`);
  }

  return normalizePlatformBillingRenewalPolicy(data?.metadata?.[platformBillingRenewalPolicyMetadataKey]);
}

function buildNotificationContext(input: {
  subscription: SubscriptionRow;
  wallet: WalletRow | null;
  cycle: CycleRow | null;
  latestPayment: PaymentRow | null;
  renewalPolicy: PlatformBillingRenewalPolicy;
  now: Date;
}) {
  const plan = readPlanRelation(input.subscription.billing_plans);
  const periodEnd = readDate(input.subscription.current_period_end)
    ?? readDate(input.subscription.next_billing_at);
  const includedCredits = toNumber(input.cycle?.included_credits)
    || toNumber(plan?.included_credits)
    || toNumber(input.subscription.included_credits_granted);
  const balanceCredits = toNumber(input.wallet?.balance_credits);
  const usedCredits = toNumber(input.cycle?.used_credits)
    || Math.max(includedCredits - balanceCredits, 0)
    || toNumber(input.wallet?.lifetime_used_credits);
  const creditBalancePercent = includedCredits > 0
    ? Math.max(0, Math.min(100, (balanceCredits / includedCredits) * 100))
    : null;
  const daysRemaining = periodEnd
    ? Math.max(Math.ceil((periodEnd.getTime() - input.now.getTime()) / DAY_MS), 0)
    : null;

  return {
    subscription: input.subscription,
    cycle: input.cycle,
    plan,
    periodEnd,
    includedCredits,
    balanceCredits,
    usedCredits,
    creditBalancePercent,
    daysRemaining,
    daysPastDue: periodEnd ? Math.max(Math.floor((input.now.getTime() - periodEnd.getTime()) / DAY_MS), 0) : null,
    paymentMethod: resolveSubscriptionPaymentMethod(input.subscription, input.latestPayment),
    latestPayment: input.latestPayment,
    renewalPolicy: input.renewalPolicy,
    planName: plan?.name?.trim() || input.subscription.plan_code,
    amountBrl: toNumber(Number((input.subscription.metadata?.commercial_terms as JsonRecord | undefined)?.price_brl ?? plan?.monthly_price_brl)) + (Array.isArray(input.subscription.metadata?.selected_bumps) ? (input.subscription.metadata.selected_bumps as JsonRecord[]).filter(b=>b.recurrence!=="one_time").reduce((n,b)=>n+Number(b.price_brl??0),0):0),
  };
}

function pickDeadlineEvent(
  context: ReturnType<typeof buildNotificationContext>,
  policy: PlatformBillingRenewalPolicy,
  now: Date,
):
  | { eventType: PlatformBillingLifecycleNotificationType; dedupeSuffix: string }
  | null {
  const periodEnd = context.periodEnd;
  if (!periodEnd) {
    return null;
  }

  const diff = periodEnd.getTime() - now.getTime();
  const periodDate = dateOnly(periodEnd) ?? "sem-data";
  const today = dateOnly(now) ?? "hoje";

  if (diff <= 0) {
    if (isBillingDeadlineReached(periodEnd, context.subscription.subscription_kind === "product" ? 0 : Math.max(policy.suspendAfterDays, policy.gracePeriodDays), now)) {
      return { eventType: "paid_plan_expired", dedupeSuffix: periodDate + ":expired" };
    }
    return { eventType: today === periodDate ? "paid_plan_due_today" : "paid_plan_grace_period", dedupeSuffix: periodDate + ":" + today };
  }

  const daysRemaining = Math.ceil(diff / DAY_MS);
  const cardRetryFailed = readString(context.subscription.metadata?.card_retry_status) === "failed"
    || readString(context.latestPayment?.payload?.card_retry_status) === "failed";

  if (cardRetryFailed && daysRemaining <= policy.cardChargeAttemptDays) {
    return { eventType: "payment_card_retry_failed", dedupeSuffix: `${periodDate}:card_failed:${today}` };
  }

  const shouldRemindPix =
    context.paymentMethod !== "card"
    || !policy.cardChargeAttemptEnabled
    || (cardRetryFailed && policy.cardFailureUsesPixFallback);

  if (shouldRemindPix && daysRemaining <= policy.pixReminderStartDays) {
    return {
      eventType: policy.dailyWhatsAppReminders
        ? "paid_plan_renewal_reminder"
        : daysRemaining <= 1
          ? "paid_plan_one_day_remaining"
          : "paid_plan_three_days_remaining",
      dedupeSuffix: policy.dailyWhatsAppReminders
        ? `${periodDate}:${today}`
        : periodDate,
    };
  }

  return null;
}

function pickCreditThresholdEvent(context: ReturnType<typeof buildNotificationContext>) {
  if (context.subscription.subscription_kind === "product" || context.includedCredits <= 0 || context.subscription.status !== "active") {
    return null;
  }

  if (context.balanceCredits <= 0) {
    return "paid_no_credits" satisfies PlatformBillingLifecycleNotificationType;
  }

  const percent = context.creditBalancePercent ?? 100;

  if (percent <= 10) {
    return "paid_low_credits_10" satisfies PlatformBillingLifecycleNotificationType;
  }

  if (percent <= 20) {
    return "paid_low_credits_20" satisfies PlatformBillingLifecycleNotificationType;
  }

  return null;
}

async function ensureLifecycleRenewalCheckout(
  client: SupabaseClient,
  context: ReturnType<typeof buildNotificationContext>,
  eventType: PlatformBillingLifecycleNotificationType,
  paymentMethod: "pix" | "card" = "pix",
): Promise<RenewalCheckoutRef | null> {
  if (!shouldAttachRenewalCheckout(eventType) || context.amountBrl <= 0) {
    return null;
  }

  if (context.subscription.billing_provider === "asaas" && context.subscription.provider_subscription_id?.startsWith("sub_")) {
    const { ensureAsaasRecurringInvoice } = await import("./native-card-checkout");
    if (!context.periodEnd || !await ensureAsaasRecurringInvoice(client,context.subscription.id,context.subscription.provider_subscription_id,context.periodEnd.toISOString())) return null;
    const linked=await loadBillingCheckoutIntent(client,{organizationId:context.subscription.organization_id,subscriptionId:context.subscription.id});
    if(!linked||!isBillingCheckoutPayable(linked)) return null;
    return {invoiceId:linked.invoice.id,paymentId:linked.payment.id,checkoutPath:buildDashboardBillingCheckoutPath(context.subscription.id),checkoutUrl:buildDashboardBillingCheckoutUrl(context.subscription.id),checkoutKind:"renewal",targetPlanCode:linked.targetPlanCode,reused:true};
  }
  const existingIntent = await loadBillingCheckoutIntent(client, {
    organizationId: context.subscription.organization_id,
    subscriptionId: context.subscription.id,
  });
  const checkoutPath = buildDashboardBillingCheckoutPath(context.subscription.id);
  const checkoutUrl = buildDashboardBillingCheckoutUrl(context.subscription.id);

  if (existingIntent && isBillingCheckoutPayable(existingIntent)
    && existingIntent.checkoutKind === "renewal"
    && existingIntent.payment.payload?.previous_current_period_end === context.periodEnd?.toISOString()
    && Number(existingIntent.payment.amount_brl) === context.amountBrl) {
    return {
      invoiceId: existingIntent.invoice.id,
      paymentId: existingIntent.payment.id,
      checkoutPath,
      checkoutUrl,
      checkoutKind: existingIntent.checkoutKind,
      targetPlanCode: existingIntent.targetPlanCode,
      reused: true,
    };
  }

  const now = new Date();
  const invoiceId = randomUUID();
  const paymentId = randomUUID();
  const externalReference = buildPlatformBillingExternalReference({
    organizationId: context.subscription.organization_id,
    subscriptionId: context.subscription.id,
    invoiceId,
    paymentId,
  });
  const provider = normalizeLifecycleBillingProvider(context.subscription.billing_provider ?? context.latestPayment?.provider);
  const periodEnd = context.periodEnd;
  const cycleStart = periodEnd && periodEnd.getTime() > now.getTime() ? periodEnd : now;
  const cycleEnd = billingPeriodEnd(cycleStart, readCommercialTerms(context.subscription.metadata?.commercial_terms));
  const dueAt = periodEnd && periodEnd.getTime() > now.getTime()
    ? periodEnd
    : new Date(now.getTime() + DAY_MS);
  const metadata = {
    ...(context.subscription.metadata ?? {}),
    source: "paid_lifecycle_renewal_checkout",
    purchase_kind: context.subscription.subscription_kind,
    platform_product_id: context.subscription.metadata?.purchase_product_id ?? null,
    recurrence: "recurring",
    checkout_model: "connectyhub_plan_checkout",
    checkout_kind: "renewal",
    requested_plan_code: context.subscription.plan_code,
    target_plan_code: context.subscription.plan_code,
    current_subscription_plan_code: context.subscription.plan_code,
    previous_plan_code: context.subscription.plan_code,
    previous_current_period_start: context.subscription.current_period_start,
    previous_current_period_end: periodEnd?.toISOString() ?? context.subscription.current_period_end,
    cycle_start_at: cycleStart.toISOString(),
    cycle_end_at: cycleEnd.toISOString(),
    renewal_event_type: eventType,
    subscription_id: context.subscription.id,
    invoice_id: invoiceId,
    payment_id: paymentId,
    external_reference: externalReference,
    checkout_status: "internal_checkout_created",
    checkout_url: checkoutPath,
    checkout_public_url: checkoutUrl,
    billing_provider: provider,
    payment_method: paymentMethod,
    latest_payment_method: paymentMethod,
    billing_payment_method: paymentMethod,
  };

  const prepared = await client.rpc("prepare_contract_renewal", {p_subscription:context.subscription.id,p_expected_end:periodEnd?.toISOString(),p_start:cycleStart.toISOString(),p_end:cycleEnd.toISOString(),p_provider:provider,p_metadata:metadata});
  if (prepared.error) throw new Error("Não foi possível preparar a renovação: "+prepared.error.message);
  return {invoiceId:prepared.data.invoice_id,paymentId:prepared.data.payment_id,checkoutPath,checkoutUrl,checkoutKind:"renewal",targetPlanCode:context.subscription.plan_code,reused:prepared.data.reused};
}

async function maybeAttemptPagBankCardRenewal(
  client: SupabaseClient,
  context: ReturnType<typeof buildNotificationContext>,
  policy: PlatformBillingRenewalPolicy,
  now: Date,
) {
  if (!shouldAttemptPagBankCardRenewal(context, policy, now)) {
    return { attempted: false, approved: false, failed: false };
  }

  const today = dateOnly(now) ?? now.toISOString().slice(0, 10);
  const periodDate = dateOnly(context.periodEnd) ?? "sem-data";
  const lastAttemptKey = readString(context.subscription.metadata?.card_retry_attempt_key)
    ?? readString(context.latestPayment?.payload?.card_retry_attempt_key);
  const attemptKey = `${context.subscription.id}:${periodDate}:${today}`;

  if (lastAttemptKey === attemptKey) {
    return { attempted: false, approved: false, failed: false };
  }

  const renewalCheckout = await ensureLifecycleRenewalCheckout(client, context, "payment_card_retry_failed", "card");

  if (!renewalCheckout) {
    return { attempted: false, approved: false, failed: false };
  }

  const intent = await loadBillingCheckoutIntent(client, {
    organizationId: context.subscription.organization_id,
    subscriptionId: context.subscription.id,
  });

  if (!intent || !isBillingCheckoutPayable(intent)) {
    return { attempted: false, approved: false, failed: false };
  }

  await markCardRetryInProgress(client, context, {
    attemptKey,
    invoiceId: intent.invoice.id,
    paymentId: intent.payment.id,
    now,
  });

  try {
    const card = await loadDefaultPagBankBillingCardMethod(client, {
      organizationId: context.subscription.organization_id,
      subscriptionId: context.subscription.id,
    });

    if (!card) {
      await markCardRetryFailed(client, context, {
        attemptKey,
        invoiceId: intent.invoice.id,
        paymentId: intent.payment.id,
        reason: "Nenhum cartao PagBank salvo para recorrencia.",
        now,
      });

      return { attempted: true, approved: false, failed: true };
    }

    const config = await loadPagBankPlatformBillingConfig({ client });
    const externalReference = readString(intent.payment.payload?.external_reference)
      ?? readString(intent.invoice.metadata?.external_reference)
      ?? buildPlatformBillingExternalReference({
        organizationId: context.subscription.organization_id,
        subscriptionId: context.subscription.id,
        invoiceId: intent.invoice.id,
        paymentId: intent.payment.id,
      });
    const order = await createPagBankCardOrder({
      accessToken: config.accessToken,
      mode: config.mode,
      apiBaseUrl: config.apiBaseUrl,
      amount: context.amountBrl,
      description: `Renovacao Plano ${context.planName}`,
      externalReference,
      payerEmail: context.subscription.payer_email ?? "financeiro@connectyhub.com.br",
      payerName: card.holderName ?? "Cliente ConnectyHub",
      payerDocument: card.holderTaxId,
      notificationUrl: config.webhookUrl || buildPagBankPlatformBillingWebhookUrl(),
      idempotencyKey: attemptKey,
      items: [{
        id: context.subscription.plan_code,
        title: `Renovacao Plano ${context.planName}`,
        quantity: 1,
        unitPrice: context.amountBrl,
        total: context.amountBrl,
      }],
      cardToken: card.token,
      holderName: card.holderName,
      holderTaxId: card.holderTaxId,
      installments: 1,
      paymentMethodType: "CREDIT_CARD",
      storeCard: true,
      recurringType: "SUBSEQUENT",
      softDescriptor: config.softDescriptor,
    });
    const paymentData = extractPagBankCardData(order.order);
    const providerPaymentId = paymentData.providerOrderId ?? paymentData.providerPaymentId;
    const paymentStatus = normalizeLifecyclePaymentStatus(paymentData.status);
    const update = await client
      .from("billing_payments")
      .update({
        provider: "pagbank",
        provider_payment_id: providerPaymentId,
        provider_status: paymentData.providerStatus ?? paymentData.status,
        status: paymentStatus,
        payload: {
          ...(intent.payment.payload ?? {}),
          card_retry_status: paymentStatus === "approved" ? "approved" : paymentStatus === "pending" ? "pending" : "failed",
          card_retry_attempt_key: attemptKey,
          card_retry_attempted_at: now.toISOString(),
          card_retry_payment_method_id: card.id,
          payment_method: "card",
          latest_payment_method: "card",
          billing_payment_method: "card",
          pagbank_order_id: paymentData.providerOrderId,
          pagbank_charge_id: paymentData.providerPaymentId,
          pagbank_payment: {
            id: providerPaymentId,
            status: paymentData.providerStatus,
            status_detail: paymentData.providerStatusDetail,
            recurring_type: paymentData.recurringType,
            payment_response_reference: paymentData.paymentResponseReference,
          },
        },
      })
      .eq("id", intent.payment.id)
      .eq("organization_id", context.subscription.organization_id);

    if (update.error) {
      throw new Error(`Nao foi possivel registrar tentativa automatica PagBank: ${update.error.message}`);
    }

    if (providerPaymentId) {
      await processPlatformBillingPagBankWebhook(client, {
        dataId: providerPaymentId,
        eventType: "payment",
        action: "payment.updated",
        providerEventId: null,
        requestId: null,
        payload: {
          source: "paid_lifecycle_pagbank_card_retry",
          subscription_id: context.subscription.id,
          invoice_id: intent.invoice.id,
          payment_id: intent.payment.id,
          attempt_key: attemptKey,
        },
      });
    }

    if (paymentStatus === "approved") {
      await markCardRetryApproved(client, context, {
        attemptKey,
        invoiceId: intent.invoice.id,
        paymentId: intent.payment.id,
        providerPaymentId,
        now,
      });

      return { attempted: true, approved: true, failed: false };
    }

    if (paymentStatus !== "pending") {
      await markBillingPaymentMethodFailed(client, {
        id: card.id,
        organizationId: context.subscription.organization_id,
        reason: paymentData.providerStatusDetail ?? paymentData.providerStatus ?? "Pagamento recorrente recusado.",
        metadata: {
          source: "paid_lifecycle_pagbank_card_retry",
          attempt_key: attemptKey,
          payment_id: intent.payment.id,
          pagbank_order_id: paymentData.providerOrderId,
          pagbank_charge_id: paymentData.providerPaymentId,
        },
      }).catch(() => null);
      await markCardRetryFailed(client, context, {
        attemptKey,
        invoiceId: intent.invoice.id,
        paymentId: intent.payment.id,
        providerPaymentId,
        reason: paymentData.providerStatusDetail ?? paymentData.providerStatus ?? "Pagamento recorrente recusado.",
        now,
      });

      return { attempted: true, approved: false, failed: true };
    }

    return { attempted: true, approved: false, failed: false };
  } catch (error) {
    await markCardRetryFailed(client, context, {
      attemptKey,
      invoiceId: intent.invoice.id,
      paymentId: intent.payment.id,
      reason: error instanceof Error ? error.message : "Falha na tentativa automatica de cartao.",
      now,
    });

    return { attempted: true, approved: false, failed: true };
  }
}

function shouldAttemptPagBankCardRenewal(
  context: ReturnType<typeof buildNotificationContext>,
  policy: PlatformBillingRenewalPolicy,
  now: Date,
) {
  if (!policy.cardChargeAttemptEnabled) return false;
  if (context.paymentMethod !== "card") return false;
  if (context.subscription.billing_provider !== "pagbank") return false;
  if (context.subscription.status !== "active") return false;
  if (!context.periodEnd || context.periodEnd.getTime() <= now.getTime()) return false;
  if (context.daysRemaining === null || context.daysRemaining > policy.cardChargeAttemptDays) return false;
  if (context.amountBrl <= 0) return false;

  const retryStatus = readString(context.subscription.metadata?.card_retry_status)
    ?? readString(context.latestPayment?.payload?.card_retry_status);
  const lastAttemptKey = readString(context.subscription.metadata?.card_retry_attempt_key)
    ?? readString(context.latestPayment?.payload?.card_retry_attempt_key);
  const periodDate = dateOnly(context.periodEnd) ?? "sem-data";
  const samePeriodAttempt = Boolean(lastAttemptKey?.startsWith(`${context.subscription.id}:${periodDate}:`));

  return !(samePeriodAttempt && (retryStatus === "approved" || retryStatus === "pending"));
}

function shouldAttachRenewalCheckout(eventType: PlatformBillingLifecycleNotificationType) {
  return eventType === "paid_plan_three_days_remaining"
    || eventType === "paid_plan_renewal_reminder"
    || eventType === "paid_plan_one_day_remaining"
    || eventType === "paid_plan_due_today"
    || eventType === "paid_plan_grace_period"
    || eventType === "paid_plan_expired"
    || eventType === "payment_card_retry_failed";
}

async function sendLifecycleNotification(
  client: SupabaseClient,
  input: {
    context: ReturnType<typeof buildNotificationContext>;
    eventType: PlatformBillingLifecycleNotificationType;
    dedupeSuffix: string;
    source: string;
    renewalCheckout?: RenewalCheckoutRef | null;
  },
) {
  const context = input.context;
  const periodEnd = context.periodEnd?.toISOString() ?? null;
  const checkoutPath = input.renewalCheckout?.checkoutPath ?? "/dashboard/planos";
  const checkoutUrl = input.renewalCheckout?.checkoutUrl ?? `${getAppBaseUrl()}/dashboard/planos`;

  return sendPlatformBillingLifecycleNotification(client, {
    organizationId: context.subscription.organization_id,
    subscriptionId: context.subscription.id,
    planCode: context.subscription.plan_code,
    planName: context.planName,
    amountBrl: context.amountBrl,
    includedCredits: context.includedCredits,
    balanceCredits: context.balanceCredits,
    usedCredits: context.usedCredits,
    daysRemaining: context.daysRemaining,
    eventType: input.eventType,
    dedupeKey: `billing:${context.subscription.id}:${input.eventType}:${input.dedupeSuffix}`,
    providerStatus: context.subscription.status,
    providerReference: context.subscription.provider_subscription_id,
    metadata: {
      source: input.source,
      purchase_kind: context.subscription.subscription_kind,
      commercial_terms: context.subscription.metadata?.commercial_terms,
      billing_provider: context.subscription.billing_provider,
      current_period_start: context.subscription.current_period_start,
      current_period_end: periodEnd,
      period_ends_at: periodEnd,
      next_billing_at: context.subscription.next_billing_at,
      cycle_id: context.cycle?.id ?? null,
      credit_balance_percent: context.creditBalancePercent,
      payment_method: context.paymentMethod,
      payment_method_label: formatPaymentMethod(context.paymentMethod),
      days_past_due: context.daysPastDue,
      grace_period_days: context.renewalPolicy.gracePeriodDays,
      renewal_invoice_id: input.renewalCheckout?.invoiceId ?? null,
      renewal_payment_id: input.renewalCheckout?.paymentId ?? null,
      renewal_checkout_kind: input.renewalCheckout?.checkoutKind ?? null,
      renewal_target_plan_code: input.renewalCheckout?.targetPlanCode ?? context.subscription.plan_code,
      renewal_checkout_reused: input.renewalCheckout?.reused ?? false,
      checkout_url: checkoutPath,
      checkout_public_url: checkoutUrl,
    },
  });
}

async function markCardRetryInProgress(
  client: SupabaseClient,
  context: ReturnType<typeof buildNotificationContext>,
  input: {
    attemptKey: string;
    invoiceId: string;
    paymentId: string;
    now: Date;
  },
) {
  const metadata = {
    ...(context.subscription.metadata ?? {}),
    card_retry_status: "pending",
    card_retry_attempt_key: input.attemptKey,
    card_retry_attempted_at: input.now.toISOString(),
    card_retry_invoice_id: input.invoiceId,
    card_retry_payment_id: input.paymentId,
    payment_method: "card",
    latest_payment_method: "card",
    billing_payment_method: "card",
  };

  context.subscription.metadata = metadata;

  await client
    .from("organization_subscriptions")
    .update({ metadata })
    .eq("id", context.subscription.id)
    .eq("organization_id", context.subscription.organization_id);
}

async function markCardRetryApproved(
  client: SupabaseClient,
  context: ReturnType<typeof buildNotificationContext>,
  input: {
    attemptKey: string;
    invoiceId: string;
    paymentId: string;
    providerPaymentId: string | null;
    now: Date;
  },
) {
  const metadata = {
    ...(context.subscription.metadata ?? {}),
    card_retry_status: "approved",
    card_retry_attempt_key: input.attemptKey,
    card_retry_approved_at: input.now.toISOString(),
    card_retry_invoice_id: input.invoiceId,
    card_retry_payment_id: input.paymentId,
    card_retry_provider_payment_id: input.providerPaymentId,
    payment_method: "card",
    latest_payment_method: "card",
    billing_payment_method: "card",
  };

  context.subscription.metadata = metadata;

  await client
    .from("organization_subscriptions")
    .update({ metadata })
    .eq("id", context.subscription.id)
    .eq("organization_id", context.subscription.organization_id);
}

async function markCardRetryFailed(
  client: SupabaseClient,
  context: ReturnType<typeof buildNotificationContext>,
  input: {
    attemptKey: string;
    invoiceId: string;
    paymentId: string;
    providerPaymentId?: string | null;
    reason: string;
    now: Date;
  },
) {
  const metadata = {
    ...(context.subscription.metadata ?? {}),
    card_retry_status: "failed",
    card_retry_attempt_key: input.attemptKey,
    card_retry_failed_at: input.now.toISOString(),
    card_retry_failure_reason: input.reason,
    card_retry_invoice_id: input.invoiceId,
    card_retry_payment_id: input.paymentId,
    card_retry_provider_payment_id: input.providerPaymentId ?? null,
    payment_method: "card",
    latest_payment_method: "card",
    billing_payment_method: "card",
  };

  context.subscription.metadata = metadata;

  await Promise.all([
    client
      .from("organization_subscriptions")
      .update({ metadata })
      .eq("id", context.subscription.id)
      .eq("organization_id", context.subscription.organization_id),
    client
      .from("billing_payments")
      .update({
        status: "rejected",
        payload: {
          ...(context.latestPayment?.payload ?? {}),
          card_retry_status: "failed",
          card_retry_attempt_key: input.attemptKey,
          card_retry_failed_at: input.now.toISOString(),
          card_retry_failure_reason: input.reason,
          payment_method: "card",
          latest_payment_method: "card",
          billing_payment_method: "card",
        },
      })
      .eq("id", input.paymentId)
      .eq("organization_id", context.subscription.organization_id),
  ]);
}

function buildLatestPaymentMap(payments: PaymentRow[]) {
  const map = new Map<string, PaymentRow>();

  for (const payment of payments) {
    if (payment.subscription_id && !map.has(payment.subscription_id)) {
      map.set(payment.subscription_id, payment);
    }
  }

  return map;
}

function resolveSubscriptionPaymentMethod(subscription: SubscriptionRow, payment: PaymentRow | null) {
  const subscriptionMetadata = subscription.metadata ?? {};
  const paymentPayload = payment?.payload ?? {};
  const value = [
    readString(paymentPayload.payment_method),
    readString(paymentPayload.latest_payment_method),
    readString(paymentPayload.paymentMethod),
    readString(paymentPayload.method),
    readString(subscriptionMetadata.payment_method),
    readString(subscriptionMetadata.latest_payment_method),
    readString(subscriptionMetadata.billing_payment_method),
  ].filter(Boolean).join(" ").toLowerCase();

  if (value.includes("pix")) return "pix";
  if (value.includes("card") || value.includes("cartao") || value.includes("cartão") || value.includes("credit") || value.includes("debit")) {
    return "card";
  }

  if (subscription.provider_subscription_id) {
    return "card";
  }

  return subscription.billing_provider === "pagbank" ? "pix" : "unknown";
}

function formatPaymentMethod(value: string) {
  if (value === "pix") return "Pix";
  if (value === "card") return "Cartao";
  return "Pagamento";
}

async function markSubscriptionPastDue(client: SupabaseClient, input: { subscription: SubscriptionRow; now: Date; periodEnd: Date | null }) {
  if (input.subscription.subscription_kind === "product") {
    if (!input.periodEnd || input.now < input.periodEnd) return false;
    const changed = await client.from("organization_subscriptions").update({status:"past_due",updated_at:input.now.toISOString()}).eq("id",input.subscription.id).eq("current_period_end",input.subscription.current_period_end).select("id");
    if (changed.error) throw new Error("Não foi possível atualizar o período do produto.");
    return Boolean(changed.data?.length);
  }
  const { data, error } = await client.rpc("suspend_expired_platform_contract", {
    p_subscription: input.subscription.id, p_expected_end: input.periodEnd?.toISOString() ?? null, p_now: input.now.toISOString(),
  });
  if (error) throw new Error("Não foi possível reconciliar a suspensão: " + error.message);
  return data === true;
}

function findCurrentCycle(cycles: CycleRow[], subscription: SubscriptionRow, now: Date) {
  const nowTime = now.getTime();
  const matching = cycles.filter((cycle) => cycle.subscription_id === subscription.id);

  return matching.find((cycle) => {
    const start = Date.parse(cycle.cycle_start);
    const end = Date.parse(cycle.cycle_end);

    return Number.isFinite(start) && Number.isFinite(end) && start <= nowTime && end > nowTime;
  }) ?? matching[0] ?? null;
}

function readPlanRelation(relation: PlanRelation | PlanRelation[] | null) {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function readDate(value: unknown) {
  const string = typeof value === "string" && value.trim() ? value.trim() : null;

  if (!string) {
    return null;
  }

  const date = new Date(string);
  return Number.isFinite(date.getTime()) ? date : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function normalizeLifecycleBillingProvider(value: unknown) {
  const provider = readString(value);
  if (provider === "mercado_pago" || provider === "pagbank" || provider === "asaas") {
    return provider;
  }

  return "asaas";
}

function normalizeLifecyclePaymentStatus(value: string) {
  if (value === "approved") return "approved";
  if (value === "pending") return "pending";
  if (value === "refunded") return "refunded";
  if (value === "cancelled" || value === "canceled" || value === "expired") return "canceled";
  if (value === "rejected") return "rejected";

  return "in_process";
}

function dateOnly(value: Date | null) {
  return value ? billingLocalDate(value) : null;
}

function toNumber(value: number | string | null | undefined) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}
