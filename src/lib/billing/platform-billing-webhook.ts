import { fetchWhatsappOutbound, type WhatsappOutboundScope } from "@/lib/whatsapp/outbound-delivery";
import "server-only";
import { expandPlatformBillingReference } from "./payment-reference";
import { planDiscountNotice } from "./plan-discounts";
import { loadPlatformNotificationSender, resolveNotificationSender, type NotificationSender } from "./notification-sender";
import { deliverWithPlatformFallback } from "./notification-sender-policy";
import { accountNoticeMetadata, buildAccountCreditNotice, canonicalPaymentNoticeKey, subscriptionNoticeType } from "./account-notice-copy";
import { processAccountBillingNoticeOutbox } from "./account-notice-outbox";
import { renderAccountNoticeVoice } from "./account-notice-voice";
import { AccountNoticesOptedOut, ensureNoticeRecipient, prepareNoticeActions } from "./account-notice-preferences";
import { noticeActionChoices, noticeActionsMessage, type AccountNoticeActions } from "./account-notice-actions";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDashboardBillingCheckoutPath,
  buildDashboardBillingCheckoutUrl,
} from "@/lib/billing/plan-checkout";
import {
  getMercadoPagoBillingSubscription,
  isMercadoPagoPreapprovalActive,
  mapMercadoPagoPreapprovalStatus,
} from "@/lib/billing/mercado-pago-subscriptions";
import {
  PLATFORM_BILLING_MESSAGE_TEMPLATE_DEFINITIONS,
  normalizePlatformBillingMessageTemplates,
  renderPlatformBillingMessageTemplate,
  type PlatformBillingMessageTemplates,
} from "@/lib/billing/platform-billing-messages";
import {
  normalizePlatformBillingRenewalPolicy,
  platformBillingRenewalPolicyMetadataKey,
} from "@/lib/billing/renewal-policy";
import {
  readAgentResponsibleHumans,
} from "@/lib/agents/responsible-human";
import { findPlatformAutomationForNotification } from "@/lib/automations/platform-automations";
import { billingPeriodEnd, billingTermsLabel, readCommercialTerms } from "@/lib/billing/commercial-terms";
import { getAppBaseUrl, getMercadoPagoPayment, loadMercadoPagoPlatformBillingConfig } from "@/lib/sales-catalog/mercado-pago";
import {
  getAsaasPayment,
  loadAsaasPlatformBillingConfig,
  type AsaasPaymentResponse,
  type AsaasSubscriptionResponse,
} from "@/lib/sales-catalog/asaas";
import {
  extractPagBankPixData,
  getPagBankOrder,
  loadPagBankPlatformBillingConfig,
  type PagBankOrderResponse,
} from "@/lib/sales-catalog/pagbank";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { loadUazapiCredentials, type UazapiCredentials } from "@/lib/whatsapp/uazapi-credentials";

type JsonRecord = Record<string, unknown>;

type BillingWebhookInput = {
  dataId: string;
  eventType: string | null;
  action: string | null;
  providerEventId: string | null;
  requestId: string | null;
  payload: JsonRecord;
};

type BillingPaymentProvider = "mercado_pago" | "pagbank" | "asaas";

type BillingProviderSubscriptionDetails = {
  id: string;
  status: string | null;
  payerEmail: string | null;
  nextPaymentDate: string | null;
  externalReference: string | null;
  raw: JsonRecord;
};

export type PlatformBillingWebhookProcessingResult = {
  processingStatus: "processed" | "ignored" | "deferred" | "failed";
  reason: string | null;
  organizationId: string | null;
  subscriptionId: string | null;
  invoiceId: string | null;
  paymentId: string | null;
  providerStatus: string | null;
  notificationId: string | null;
  creditTransactionId: string | null;
  metadata: JsonRecord;
};

export type PlatformBillingOperationalTestResult = {
  notificationId: string | null;
  status: string;
  selectedAgentId: string | null;
  recipientPhone: string | null;
  messagePreview: string | null;
  errorMessage: string | null;
};

export type PlatformTrialNotificationType =
  | "trial_started"
  | "trial_credit_milestone"
  | "trial_three_days_remaining"
  | "trial_one_day_remaining"
  | "trial_no_credits"
  | "trial_expired";

export type PlatformTrialNotificationInput = {
  organizationId: string;
  eventType: PlatformTrialNotificationType;
  dedupeKey: string;
  balanceCredits: number;
  usedCredits: number;
  includedCredits: number;
  milestoneCredits?: number | null;
  trialDaysRemaining?: number | null;
  metadata?: JsonRecord;
};

export type PlatformSubscriptionPendingNotificationInput = {
  organizationId: string;
  subscriptionId: string;
  invoiceId: string | null;
  paymentId: string | null;
  planCode: string;
  planName: string;
  amountBrl: number;
  includedCredits: number;
  dedupeKey?: string;
  providerStatus?: string | null;
  providerReference?: string | null;
  metadata?: JsonRecord;
};

export type PlatformPlanInteractionNotificationType =
  | "subscription_replaced"
  | "checkout_cart_updated"
  | "checkout_payment_started";

export type PlatformPlanInteractionNotificationInput = {
  organizationId: string;
  subscriptionId: string;
  invoiceId: string | null;
  paymentId: string | null;
  planCode: string;
  planName: string;
  amountBrl: number;
  includedCredits: number;
  eventType: PlatformPlanInteractionNotificationType;
  dedupeKey: string;
  providerStatus?: string | null;
  providerReference?: string | null;
  metadata?: JsonRecord;
};

export type PlatformBillingLifecycleNotificationType =
  | "paid_access_ending"
  | "paid_access_ended"
  | "manual_plan_activated"
  | "manual_plan_renewed"
  | "paid_plan_three_days_remaining"
  | "paid_plan_renewal_reminder"
  | "paid_plan_one_day_remaining"
  | "paid_plan_due_today"
  | "paid_plan_grace_period"
  | "paid_plan_expired"
  | "payment_card_retry_failed"
  | "paid_low_credits_20"
  | "paid_low_credits_10"
  | "paid_no_credits";

export type PlatformBillingLifecycleNotificationInput = {
  organizationId: string;
  subscriptionId: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
  planCode: string;
  planName: string;
  amountBrl: number;
  includedCredits: number;
  eventType: PlatformBillingLifecycleNotificationType;
  dedupeKey: string;
  balanceCredits?: number | null;
  usedCredits?: number | null;
  daysRemaining?: number | null;
  providerStatus?: string | null;
  providerReference?: string | null;
  metadata?: JsonRecord;
};

type ParsedExternalReference = {
  organizationId: string;
  subscriptionId: string;
  invoiceId: string;
  paymentId: string;
};

type SubscriptionRow = {
  id: string;
  organization_id: string;
  plan_id: string | null;
  plan_code: string;
  status: string;
  provider_subscription_id: string | null;
  provider_plan_id: string | null;
  payer_email: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_billing_at: string | null;
  included_credits_granted: number | string | null;
  metadata: JsonRecord | null;
};

type PaymentRow = {
  id: string;
  organization_id: string;
  invoice_id: string | null;
  subscription_id: string | null;
  provider_payment_id: string | null;
  provider_status: string | null;
  status: string;
  amount_brl: number | string | null;
  paid_at: string | null;
  payload: JsonRecord | null;
};

type InvoiceRow = {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  status: string;
  total_brl: number | string | null;
  paid_at: string | null;
  metadata: JsonRecord | null;
};

type PlanRow = {
  id: string;
  plan_code: string;
  name: string;
  monthly_price_brl: number | string | null;
  included_credits: number | string | null;
};

type BillingRecord = {
  subscription: SubscriptionRow | null;
  payment: PaymentRow | null;
  invoice: InvoiceRow | null;
  plan: PlanRow | null;
};

type MercadoPagoPaymentLike = {
  id?: string | number;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  date_approved?: string;
  date_created?: string;
  payment_method_id?: string;
};

type BillingSettingsRow = {
  billing_whatsapp_agent_id: string | null;
  notification_whatsapp_enabled: boolean | null;
  metadata: JsonRecord | null;
};

type OrganizationRecipientRow = {
  id: string;
  name: string | null;
  owner_id: string | null;
};

type ProfileRecipientRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
};

type PendingBillingNotificationRow = {
  id: string;
  selected_agent_id: string | null;
  recipient_phone: string | null;
  message_preview: string | null;
  attempts: number | string | null;
  metadata: JsonRecord | null;
};

type BillingResponsibleAgentRow = {
  id: string;
  name: string;
  persona_name: string | null;
  metadata: JsonRecord | null;
};

type BillingResponsibleRecipient = {
  agentId: string;
  agentName: string;
  name: string;
  phone: string;
};

const activePaymentStatuses = new Set(["approved", "authorized", "received", "confirmed", "received_in_cash", "checkout_paid"]);
const pendingPaymentStatuses = new Set(["pending", "in_process", "in_mediation", "overdue", "awaiting_risk_analysis", "checkout_created"]);
const rejectedPaymentStatuses = new Set([
  "rejected",
  "cancelled",
  "canceled",
  "expired",
  "charged_back",
  "refunded",
  "partially_refunded",
  "deleted",
  "payment_refused",
  "failed",
  "reproved_by_risk_analysis",
  "credit_card_capture_refused",
  "checkout_canceled",
  "checkout_expired",
]);
const knownBillingMessageTemplateKeys: ReadonlySet<string> = new Set(
  PLATFORM_BILLING_MESSAGE_TEMPLATE_DEFINITIONS.map((definition) => definition.eventType),
);
const checkoutButtonEventTypes = new Set([
  "trial_started",
  "trial_credit_milestone",
  "trial_three_days_remaining",
  "trial_one_day_remaining",
  "trial_no_credits",
  "trial_expired",
  "subscription_pending",
  "subscription_replaced",
  "checkout_cart_updated",
  "checkout_payment_started",
  "manual_plan_activated",
  "manual_plan_renewed",
  "paid_plan_three_days_remaining",
  "paid_plan_renewal_reminder",
  "paid_plan_one_day_remaining",
  "paid_plan_due_today",
  "paid_plan_grace_period",
  "paid_plan_expired",
  "payment_card_retry_failed",
  "paid_low_credits_20",
  "paid_low_credits_10",
  "paid_no_credits",
]);

export async function processPlatformBillingMercadoPagoWebhook(
  client: SupabaseClient,
  input: BillingWebhookInput,
): Promise<PlatformBillingWebhookProcessingResult> {
  if (isSubscriptionPreapprovalTopic(input.eventType, input.action)) {
    return processSubscriptionWebhook(client, input);
  }

  if (isPaymentTopic(input.eventType, input.action)) {
    return processPaymentWebhook(client, input);
  }

  return buildResult({
    processingStatus: "ignored",
    reason: "Topico Mercado Pago sem reconciliacao de billing.",
    providerStatus: null,
    metadata: {
      eventType: input.eventType,
      action: input.action,
      dataId: input.dataId,
    },
  });
}

export async function processPlatformBillingPagBankWebhook(
  client: SupabaseClient,
  input: BillingWebhookInput,
): Promise<PlatformBillingWebhookProcessingResult> {
  const config = await loadPagBankPlatformBillingConfig({ client });
  const order = await getPagBankOrder({
    accessToken: config.accessToken,
    mode: config.mode,
    apiBaseUrl: config.apiBaseUrl,
    orderId: input.dataId,
  });

  return processPagBankPaymentWebhook(client, input, order);
}

export async function processPlatformBillingAsaasWebhook(
  client: SupabaseClient,
  input: BillingWebhookInput,
  verifiedPayment?: AsaasPaymentResponse,
): Promise<PlatformBillingWebhookProcessingResult> {
  if (isAsaasCheckoutTopic(input)) {
    return processAsaasCheckoutWebhook(client, input);
  }

  if (isAsaasSubscriptionTopic(input)) {
    return processAsaasSubscriptionWebhook(client, input);
  }

  if (isAsaasPaymentTopic(input)) {
    return processAsaasPaymentWebhook(client, input, verifiedPayment);
  }

  return buildResult({
    processingStatus: "ignored",
    reason: "Topico Asaas sem reconciliacao de billing.",
    providerStatus: null,
    metadata: {
      eventType: input.eventType,
      action: input.action,
      dataId: input.dataId,
    },
  });
}

export async function sendPlatformBillingOperationalTest(
  client: SupabaseClient,
  input: {
    organizationId: string;
    actorId: string;
  },
): Promise<PlatformBillingOperationalTestResult> {
  const plan = await loadPlanByCode(client, "starter");
  const notification = await enqueuePlatformBillingNotification(client, {
    organizationId: input.organizationId,
    subscriptionId: null,
    invoiceId: null,
    paymentId: null,
    planCode: plan?.plan_code ?? "operational_test",
    planName: plan?.name ?? "Teste operacional",
    amountBrl: toNumber(plan?.monthly_price_brl),
    includedCredits: toNumber(plan?.included_credits),
    eventType: "billing_operational_test",
    dedupeKey: `billing:operational_test:${input.organizationId}:${Date.now()}`,
    providerStatus: "operational_test",
    providerReference: null,
    metadata: {
      source: "admin_billing_operational_test",
      actor_id: input.actorId,
      safe_test: true,
    },
  });
  const event = notification?.id ? await loadBillingNotificationEvent(client, notification.id) : null;

  return {
    notificationId: notification?.id ?? null,
    status: event?.status ?? notification?.status ?? "skipped",
    selectedAgentId: event?.selected_agent_id ?? null,
    recipientPhone: event?.recipient_phone ?? null,
    messagePreview: event?.message_preview ?? null,
    errorMessage: event?.error_message ?? null,
  };
}

export async function sendPlatformTrialNotification(
  client: SupabaseClient,
  input: PlatformTrialNotificationInput,
): Promise<PlatformBillingOperationalTestResult> {
  const notification = await enqueuePlatformBillingNotification(client, {
    organizationId: input.organizationId,
    subscriptionId: null,
    invoiceId: null,
    paymentId: null,
    planCode: "trial",
    planName: "Teste gratis",
    amountBrl: 0,
    includedCredits: input.includedCredits,
    balanceCredits: input.balanceCredits,
    usedCredits: input.usedCredits,
    milestoneCredits: input.milestoneCredits ?? null,
    trialDaysRemaining: input.trialDaysRemaining ?? null,
    eventType: input.eventType,
    dedupeKey: input.dedupeKey,
    providerStatus: "trial",
    providerReference: null,
    metadata: {
      source: "trial_conversion_notification",
      balance_credits: input.balanceCredits,
      used_credits: input.usedCredits,
      included_credits: input.includedCredits,
      milestone_credits: input.milestoneCredits ?? null,
      trial_days_remaining: input.trialDaysRemaining ?? null,
      ...(input.metadata ?? {}),
    },
  });
  const event = notification?.id ? await loadBillingNotificationEvent(client, notification.id) : null;

  return {
    notificationId: notification?.id ?? null,
    status: event?.status ?? notification?.status ?? "skipped",
    selectedAgentId: event?.selected_agent_id ?? null,
    recipientPhone: event?.recipient_phone ?? null,
    messagePreview: event?.message_preview ?? null,
    errorMessage: event?.error_message ?? null,
  };
}

export async function sendPlatformSubscriptionPendingNotification(
  client: SupabaseClient,
  input: PlatformSubscriptionPendingNotificationInput,
): Promise<PlatformBillingOperationalTestResult> {
  const paymentQuery = client.from("billing_payments").select("payload,amount_brl").eq("organization_id", input.organizationId).eq("subscription_id", input.subscriptionId);
  const pricingPayment = input.paymentId ? await paymentQuery.eq("id", input.paymentId).maybeSingle() : await paymentQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (pricingPayment.error) throw new Error("Não foi possível conferir os valores da notificação de cobrança.");
  const paymentMetadata = (pricingPayment.data?.payload ?? {}) as JsonRecord;
  const notification = await enqueuePlatformBillingNotification(client, {
    organizationId: input.organizationId,
    subscriptionId: input.subscriptionId,
    invoiceId: input.invoiceId,
    paymentId: input.paymentId,
    planCode: input.planCode,
    planName: input.planName,
    amountBrl: pricingPayment.data ? Number(pricingPayment.data.amount_brl) : input.amountBrl,
    includedCredits: input.includedCredits,
    eventType: "subscription_pending",
    dedupeKey: input.dedupeKey ?? `billing:${input.subscriptionId}:subscription:pending`,
    providerStatus: input.providerStatus ?? "pending",
    providerReference: input.providerReference ?? null,
    metadata: {
      commercial_terms: paymentMetadata.commercial_terms,
      plan_pricing: paymentMetadata.plan_pricing,
      campaign_pricing: paymentMetadata.campaign_pricing,
      checkout_kind: paymentMetadata.checkout_kind,
      source: "dashboard_plan_checkout_created",
      ...(input.metadata ?? {}),
    },
  });
  const event = notification?.id ? await loadBillingNotificationEvent(client, notification.id) : null;

  return {
    notificationId: notification?.id ?? null,
    status: event?.status ?? notification?.status ?? "skipped",
    selectedAgentId: event?.selected_agent_id ?? null,
    recipientPhone: event?.recipient_phone ?? null,
    messagePreview: event?.message_preview ?? null,
    errorMessage: event?.error_message ?? null,
  };
}

export async function sendPlatformPlanInteractionNotification(
  client: SupabaseClient,
  input: PlatformPlanInteractionNotificationInput,
): Promise<PlatformBillingOperationalTestResult> {
  const notification = await enqueuePlatformBillingNotification(client, {
    organizationId: input.organizationId,
    subscriptionId: input.subscriptionId,
    invoiceId: input.invoiceId,
    paymentId: input.paymentId,
    planCode: input.planCode,
    planName: input.planName,
    amountBrl: input.amountBrl,
    includedCredits: input.includedCredits,
    eventType: input.eventType,
    dedupeKey: input.dedupeKey,
    providerStatus: input.providerStatus ?? input.eventType,
    providerReference: input.providerReference ?? null,
    metadata: {
      source: "dashboard_plan_interaction",
      ...(input.metadata ?? {}),
    },
  });
  const event = notification?.id ? await loadBillingNotificationEvent(client, notification.id) : null;

  return {
    notificationId: notification?.id ?? null,
    status: event?.status ?? notification?.status ?? "skipped",
    selectedAgentId: event?.selected_agent_id ?? null,
    recipientPhone: event?.recipient_phone ?? null,
    messagePreview: event?.message_preview ?? null,
    errorMessage: event?.error_message ?? null,
  };
}

export async function sendPlatformBillingLifecycleNotification(
  client: SupabaseClient,
  input: PlatformBillingLifecycleNotificationInput,
): Promise<PlatformBillingOperationalTestResult> {
  const notification = await enqueuePlatformBillingNotification(client, {
    organizationId: input.organizationId,
    subscriptionId: input.subscriptionId,
    invoiceId: input.invoiceId ?? null,
    paymentId: input.paymentId ?? null,
    planCode: input.planCode,
    planName: input.planName,
    amountBrl: input.amountBrl,
    includedCredits: input.includedCredits,
    balanceCredits: input.balanceCredits ?? undefined,
    usedCredits: input.usedCredits ?? undefined,
    trialDaysRemaining: input.daysRemaining ?? null,
    eventType: input.eventType,
    dedupeKey: input.dedupeKey,
    providerStatus: input.providerStatus ?? input.eventType,
    providerReference: input.providerReference ?? null,
    metadata: {
      source: "platform_billing_lifecycle",
      ...(input.metadata ?? {}),
    },
  });
  const event = notification?.id ? await loadBillingNotificationEvent(client, notification.id) : null;

  return {
    notificationId: notification?.id ?? null,
    status: event?.status ?? notification?.status ?? "skipped",
    selectedAgentId: event?.selected_agent_id ?? null,
    recipientPhone: event?.recipient_phone ?? null,
    messagePreview: event?.message_preview ?? null,
    errorMessage: event?.error_message ?? null,
  };
}

async function processSubscriptionWebhook(client: SupabaseClient, input: BillingWebhookInput) {
  const providerSubscription = await getMercadoPagoBillingSubscription({
    client,
    subscriptionId: input.dataId,
  });
  const parsedReference = parsePlatformBillingExternalReference(providerSubscription.externalReference);
  const record = await loadBillingRecord(client, {
    providerSubscriptionId: providerSubscription.id,
    externalReference: providerSubscription.externalReference,
    parsedReference,
  });

  if (!record.subscription) {
    return buildResult({
      processingStatus: "ignored",
      reason: "Assinatura ConnectyHub nao encontrada para este preapproval.",
      providerStatus: providerSubscription.status,
      metadata: {
        mercadoPagoSubscription: providerSubscription.raw,
        externalReference: providerSubscription.externalReference,
      },
    });
  }

  const providerStatus = providerSubscription.status ?? "pending";
  const subscriptionStatus = mapMercadoPagoPreapprovalStatus(providerStatus);

  await updateSubscriptionProviderState(client, record, {
    provider: "mercado_pago",
    providerSubscription,
    subscriptionStatus,
    source: "mercado_pago_subscription_webhook",
  });

  if (isMercadoPagoPreapprovalActive(providerStatus) && record.payment?.status === "approved") {
    return activateBillingPlan(client, record, {
      provider: "mercado_pago",
      providerStatus,
      providerSubscription,
      providerPayment: null,
      source: "mercado_pago_subscription_webhook",
      webhook: input,
    });
  }

  const notification = await enqueuePlatformBillingNotification(client, {
    organizationId: record.subscription.organization_id,
    subscriptionId: record.subscription.id,
    invoiceId: record.invoice?.id ?? null,
    paymentId: record.payment?.id ?? null,
    planCode: record.subscription.plan_code,
    planName: record.plan?.name ?? record.subscription.plan_code,
    amountBrl: toNumber(record.invoice?.total_brl ?? record.payment?.amount_brl ?? record.plan?.monthly_price_brl),
    includedCredits: toNumber(record.plan?.included_credits),
    eventType: subscriptionNoticeType(subscriptionStatus),
    dedupeKey: `billing:${record.subscription.id}:subscription:${subscriptionStatus}`,
    providerStatus,
    providerReference: providerSubscription.id,
    metadata: {
      source: "mercado_pago_subscription_webhook",
      mercadoPagoSubscription: providerSubscription.raw,
    },
  });

  return buildResult({
    processingStatus: "processed",
    reason: subscriptionStatus === "pending" ? "Assinatura ainda pendente." : null,
    organizationId: record.subscription.organization_id,
    subscriptionId: record.subscription.id,
    invoiceId: record.invoice?.id ?? null,
    paymentId: record.payment?.id ?? null,
    providerStatus,
    notificationId: notification?.id ?? null,
    metadata: {
      subscriptionStatus,
      mercadoPagoSubscription: providerSubscription.raw,
    },
  });
}

async function processPaymentWebhook(client: SupabaseClient, input: BillingWebhookInput) {
  const config = await loadMercadoPagoPlatformBillingConfig({ client });
  const providerPayment = await getMercadoPagoPayment({
    accessToken: config.accessToken,
    paymentId: input.dataId,
  }) as MercadoPagoPaymentLike;
  const providerStatus = readString(providerPayment.status) ?? "pending";
  const externalReference = readString(providerPayment.external_reference);
  const parsedReference = parsePlatformBillingExternalReference(externalReference);
  const record = await loadBillingRecord(client, {
    paymentId: parsedReference?.paymentId ?? null,
    invoiceId: parsedReference?.invoiceId ?? null,
    subscriptionId: parsedReference?.subscriptionId ?? null,
    externalReference,
    parsedReference,
  });

  if (!record.payment && !record.subscription) {
    return buildResult({
      processingStatus: "ignored",
      reason: "Pagamento ConnectyHub nao encontrado para este evento.",
      providerStatus,
      metadata: {
        mercadoPagoPaymentId: String(providerPayment.id ?? input.dataId),
        externalReference,
      },
    });
  }

  await updatePaymentProviderState(client, record, {
    provider: "mercado_pago",
    providerPayment,
    providerStatus,
    source: "mercado_pago_payment_webhook",
  });

  if (isActivePaymentStatus(providerStatus)) {
    return activateBillingPlan(client, record, {
      provider: "mercado_pago",
      providerStatus,
      providerSubscription: null,
      providerPayment,
      source: "mercado_pago_payment_webhook",
      webhook: input,
    });
  }

  const paymentStatus = mapPaymentStatus(providerStatus);
  const subscription = record.subscription;
  const notification = subscription
    ? await enqueuePlatformBillingNotification(client, {
        organizationId: subscription.organization_id,
        subscriptionId: subscription.id,
        invoiceId: record.invoice?.id ?? null,
        paymentId: record.payment?.id ?? null,
        planCode: subscription.plan_code,
        planName: record.plan?.name ?? subscription.plan_code,
        amountBrl: toNumber(record.payment?.amount_brl ?? record.invoice?.total_brl ?? providerPayment.transaction_amount),
        includedCredits: toNumber(record.plan?.included_credits),
        eventType: paymentNotificationType(paymentStatus),
        dedupeKey: `billing:${subscription.id}:payment:${providerStatus}:${String(providerPayment.id ?? input.dataId)}`,
        providerStatus,
        providerReference: String(providerPayment.id ?? input.dataId),
        metadata: {
          source: "mercado_pago_payment_webhook",
          mercadoPagoPayment: sanitizePayment(providerPayment),
        },
      })
    : null;

  return buildResult({
    processingStatus: "processed",
    reason: paymentStatus === "pending" ? "Pagamento ainda pendente." : "Pagamento nao aprovado.",
    organizationId: subscription?.organization_id ?? record.payment?.organization_id ?? null,
    subscriptionId: subscription?.id ?? null,
    invoiceId: record.invoice?.id ?? null,
    paymentId: record.payment?.id ?? null,
    providerStatus,
    notificationId: notification?.id ?? null,
    metadata: {
      paymentStatus,
      mercadoPagoPayment: sanitizePayment(providerPayment),
    },
  });
}

async function processPagBankPaymentWebhook(
  client: SupabaseClient,
  input: BillingWebhookInput,
  order: PagBankOrderResponse,
) {
  const paymentData = extractPagBankPixData(order);
  const providerStatus = paymentData.status;
  const externalReference = readString(order.reference_id)
    ?? readString(order.charges?.[0]?.reference_id);
  const parsedReference = parsePlatformBillingExternalReference(externalReference);
  const providerPayment: MercadoPagoPaymentLike = {
    id: paymentData.providerOrderId ?? paymentData.providerPaymentId ?? input.dataId,
    status: providerStatus,
    status_detail: paymentData.providerStatusDetail ?? paymentData.providerStatus ?? undefined,
    external_reference: externalReference ?? undefined,
    transaction_amount: readPagBankOrderAmount(order) ?? undefined,
    date_approved: paymentData.paidAt ?? (isActivePaymentStatus(providerStatus) ? new Date().toISOString() : undefined),
    date_created: order.created_at ?? undefined,
    payment_method_id: "pix",
  };
  const record = await loadBillingRecord(client, {
    paymentId: parsedReference?.paymentId ?? null,
    invoiceId: parsedReference?.invoiceId ?? null,
    subscriptionId: parsedReference?.subscriptionId ?? null,
    externalReference,
    parsedReference,
  });

  if (!record.payment && !record.subscription) {
    return buildResult({
      processingStatus: "ignored",
      reason: "Pagamento ConnectyHub nao encontrado para este evento PagBank.",
      providerStatus,
      metadata: {
        pagbankOrderId: paymentData.providerOrderId ?? input.dataId,
        pagbankChargeId: paymentData.providerPaymentId,
        pagbankStatus: paymentData.providerStatus,
        externalReference,
      },
    });
  }

  await updatePaymentProviderState(client, record, {
    provider: "pagbank",
    providerPayment,
    providerStatus,
    source: "pagbank_payment_webhook",
  });

  if (isActivePaymentStatus(providerStatus)) {
    return activateBillingPlan(client, record, {
      provider: "pagbank",
      providerStatus,
      providerSubscription: null,
      providerPayment,
      source: "pagbank_payment_webhook",
      webhook: input,
    });
  }

  const paymentStatus = mapPaymentStatus(providerStatus);
  const subscription = record.subscription;
  const notification = subscription
    ? await enqueuePlatformBillingNotification(client, {
        organizationId: subscription.organization_id,
        subscriptionId: subscription.id,
        invoiceId: record.invoice?.id ?? null,
        paymentId: record.payment?.id ?? null,
        planCode: subscription.plan_code,
        planName: record.plan?.name ?? subscription.plan_code,
        amountBrl: toNumber(record.payment?.amount_brl ?? record.invoice?.total_brl ?? providerPayment.transaction_amount),
        includedCredits: toNumber(record.plan?.included_credits),
        eventType: paymentNotificationType(paymentStatus),
        dedupeKey: `billing:${subscription.id}:payment:${providerStatus}:${String(providerPayment.id ?? input.dataId)}`,
        providerStatus,
        providerReference: String(providerPayment.id ?? input.dataId),
        metadata: {
          source: "pagbank_payment_webhook",
          pagbankOrderId: paymentData.providerOrderId,
          pagbankChargeId: paymentData.providerPaymentId,
          pagbankStatus: paymentData.providerStatus,
          pagbankPayment: sanitizePayment(providerPayment),
        },
      })
    : null;

  return buildResult({
    processingStatus: "processed",
    reason: paymentStatus === "pending" ? "Pagamento PagBank ainda pendente." : "Pagamento PagBank nao aprovado.",
    organizationId: subscription?.organization_id ?? record.payment?.organization_id ?? null,
    subscriptionId: subscription?.id ?? null,
    invoiceId: record.invoice?.id ?? null,
    paymentId: record.payment?.id ?? null,
    providerStatus,
    notificationId: notification?.id ?? null,
    metadata: {
      paymentStatus,
      pagbankOrderId: paymentData.providerOrderId,
      pagbankChargeId: paymentData.providerPaymentId,
      pagbankStatus: paymentData.providerStatus,
      pagbankPayment: sanitizePayment(providerPayment),
    },
  });
}

async function processAsaasPaymentWebhook(client: SupabaseClient, input: BillingWebhookInput, verifiedPayment?: AsaasPaymentResponse) {
  const payloadPayment = readAsaasPaymentPayload(input);
  let rawPayment: JsonRecord | null = payloadPayment;
  let providerPayment = normalizeAsaasPaymentLike(payloadPayment ?? {}, input.dataId);

  // Only internal callers can supply a payment they have just verified remotely.
  // Webhook JSON is never sufficient evidence to grant access.
  if (verifiedPayment) {
    rawPayment = verifiedPayment as JsonRecord;
    providerPayment = normalizeAsaasPaymentLike(verifiedPayment, input.dataId);
  } else {
    const config = await loadAsaasPlatformBillingConfig({ client });
    const remotePayment = await getAsaasPayment({
      accessToken: config.accessToken,
      mode: config.mode,
      apiBaseUrl: config.apiBaseUrl,
      paymentId: providerPayment.id ? String(providerPayment.id) : input.dataId,
    });

    rawPayment = remotePayment as JsonRecord;
    providerPayment = normalizeAsaasPaymentLike(remotePayment, input.dataId);
  }

  const providerStatus = readString(providerPayment.status) ?? readAsaasEventName(input) ?? "PENDING";
  const externalReference = readString(providerPayment.external_reference)
    ?? readString(rawPayment?.externalReference)
    ?? readString(rawPayment?.external_reference);
  const parsedReference = parsePlatformBillingExternalReference(externalReference);
  const providerSubscription = buildAsaasSubscriptionDetails(rawPayment?.subscription, rawPayment ?? {}, externalReference);
  const record = await loadBillingRecord(client, {
    paymentId: parsedReference?.paymentId ?? null,
    invoiceId: parsedReference?.invoiceId ?? null,
    subscriptionId: parsedReference?.subscriptionId ?? null,
    providerPaymentId: providerPayment.id ? String(providerPayment.id) : input.dataId,
    providerSubscriptionId: providerSubscription?.id ?? null,
    externalReference,
    parsedReference,
  });

  if (!record.payment && !record.subscription) {
    return buildResult({
      processingStatus: "ignored",
      reason: "Pagamento ConnectyHub nao encontrado para este evento Asaas.",
      providerStatus,
      metadata: {
        asaasPaymentId: String(providerPayment.id ?? input.dataId),
        asaasSubscriptionId: providerSubscription?.id ?? null,
        externalReference,
      },
    });
  }

  await updatePaymentProviderState(client, record, {
    provider: "asaas",
    providerPayment,
    providerStatus,
    source: "asaas_payment_webhook",
  });

  if (providerSubscription && record.subscription) {
    await updateSubscriptionProviderState(client, record, {
      provider: "asaas",
      providerSubscription,
      subscriptionStatus: mapAsaasSubscriptionStatus(providerSubscription.status, record.subscription.status),
      source: "asaas_payment_webhook",
    });
  }

  if (isActivePaymentStatus(providerStatus)) {
    return activateBillingPlan(client, record, {
      provider: "asaas",
      providerStatus,
      providerSubscription,
      providerPayment,
      source: "asaas_payment_webhook",
      webhook: input,
    });
  }

  const paymentStatus = mapPaymentStatus(providerStatus);
  const subscription = record.subscription;
  const notification = subscription
    ? await enqueuePlatformBillingNotification(client, {
        organizationId: subscription.organization_id,
        subscriptionId: subscription.id,
        invoiceId: record.invoice?.id ?? null,
        paymentId: record.payment?.id ?? null,
        planCode: subscription.plan_code,
        planName: record.plan?.name ?? subscription.plan_code,
        amountBrl: toNumber(record.payment?.amount_brl ?? record.invoice?.total_brl ?? providerPayment.transaction_amount),
        includedCredits: toNumber(record.plan?.included_credits),
        eventType: paymentNotificationType(paymentStatus),
        dedupeKey: `billing:${subscription.id}:payment:${providerStatus}:${String(providerPayment.id ?? input.dataId)}`,
        providerStatus,
        providerReference: String(providerPayment.id ?? input.dataId),
        metadata: {
          source: "asaas_payment_webhook",
          asaasPayment: sanitizePayment(providerPayment),
          asaasSubscriptionId: providerSubscription?.id ?? null,
        },
      })
    : null;

  return buildResult({
    processingStatus: "processed",
    reason: paymentStatus === "pending" ? "Pagamento Asaas ainda pendente." : "Pagamento Asaas nao aprovado.",
    organizationId: subscription?.organization_id ?? record.payment?.organization_id ?? null,
    subscriptionId: subscription?.id ?? null,
    invoiceId: record.invoice?.id ?? null,
    paymentId: record.payment?.id ?? null,
    providerStatus,
    notificationId: notification?.id ?? null,
    metadata: {
      paymentStatus,
      asaasPayment: sanitizePayment(providerPayment),
      asaasSubscriptionId: providerSubscription?.id ?? null,
    },
  });
}

async function processAsaasCheckoutWebhook(client: SupabaseClient, input: BillingWebhookInput) {
  const checkout = readAsaasCheckoutPayload(input) ?? {};
  const eventName = readAsaasEventName(input);
  const checkoutId = readString(checkout.id) ?? input.dataId;
  const providerStatus = eventName?.startsWith("CHECKOUT_")
    ? eventName
    : readString(checkout.status) ?? "CHECKOUT_CREATED";
  const externalReference = readString(checkout.externalReference)
    ?? readString(checkout.external_reference)
    ?? readString(input.payload.externalReference)
    ?? readString(input.payload.external_reference);
  const parsedReference = parsePlatformBillingExternalReference(externalReference);
  const paymentPayload = readAsaasPaymentPayload(input);
  const providerPayment = normalizeAsaasPaymentLike(paymentPayload ?? checkout, checkoutId, {
    fallbackStatus: providerStatus,
    externalReference,
    paymentMethodId: "credit_card",
  });
  const providerSubscription = buildAsaasSubscriptionDetails(
    checkout.subscription ?? input.payload.subscription,
    checkout,
    externalReference,
  );
  const record = await loadBillingRecord(client, {
    paymentId: parsedReference?.paymentId ?? null,
    invoiceId: parsedReference?.invoiceId ?? null,
    subscriptionId: parsedReference?.subscriptionId ?? null,
    providerPaymentId: checkoutId,
    providerSubscriptionId: providerSubscription?.id ?? null,
    externalReference,
    parsedReference,
  });

  if (!record.payment && !record.subscription) {
    return buildResult({
      processingStatus: "ignored",
      reason: "Checkout ConnectyHub nao encontrado para este evento Asaas.",
      providerStatus,
      metadata: {
        asaasCheckoutId: checkoutId,
        asaasSubscriptionId: providerSubscription?.id ?? null,
        externalReference,
      },
    });
  }

  await updatePaymentProviderState(client, record, {
    provider: "asaas",
    providerPayment,
    providerStatus,
    source: "asaas_checkout_webhook",
  });

  if (providerSubscription && record.subscription) {
    await updateSubscriptionProviderState(client, record, {
      provider: "asaas",
      providerSubscription,
      subscriptionStatus: mapAsaasSubscriptionStatus(providerSubscription.status, record.subscription.status),
      source: "asaas_checkout_webhook",
    });
  }

  if (isActivePaymentStatus(providerStatus)) {
    return activateBillingPlan(client, record, {
      provider: "asaas",
      providerStatus,
      providerSubscription,
      providerPayment,
      source: "asaas_checkout_webhook",
      webhook: input,
    });
  }

  const paymentStatus = mapPaymentStatus(providerStatus);
  const subscription = record.subscription;
  const notification = subscription
    ? await enqueuePlatformBillingNotification(client, {
        organizationId: subscription.organization_id,
        subscriptionId: subscription.id,
        invoiceId: record.invoice?.id ?? null,
        paymentId: record.payment?.id ?? null,
        planCode: subscription.plan_code,
        planName: record.plan?.name ?? subscription.plan_code,
        amountBrl: toNumber(record.payment?.amount_brl ?? record.invoice?.total_brl ?? providerPayment.transaction_amount),
        includedCredits: toNumber(record.plan?.included_credits),
        eventType: paymentNotificationType(paymentStatus),
        dedupeKey: `billing:${subscription.id}:checkout:${providerStatus}:${checkoutId}`,
        providerStatus,
        providerReference: checkoutId,
        metadata: {
          source: "asaas_checkout_webhook",
          asaasCheckoutId: checkoutId,
          asaasPayment: sanitizePayment(providerPayment),
          asaasSubscriptionId: providerSubscription?.id ?? null,
        },
      })
    : null;

  return buildResult({
    processingStatus: "processed",
    reason: paymentStatus === "pending" ? "Checkout Asaas ainda pendente." : "Checkout Asaas nao aprovado.",
    organizationId: subscription?.organization_id ?? record.payment?.organization_id ?? null,
    subscriptionId: subscription?.id ?? null,
    invoiceId: record.invoice?.id ?? null,
    paymentId: record.payment?.id ?? null,
    providerStatus,
    notificationId: notification?.id ?? null,
    metadata: {
      paymentStatus,
      asaasCheckoutId: checkoutId,
      asaasPayment: sanitizePayment(providerPayment),
      asaasSubscriptionId: providerSubscription?.id ?? null,
    },
  });
}

async function processAsaasSubscriptionWebhook(client: SupabaseClient, input: BillingWebhookInput) {
  const subscriptionPayload = readAsaasSubscriptionPayload(input) ?? {};
  const externalReference = readString(subscriptionPayload.externalReference)
    ?? readString(subscriptionPayload.external_reference)
    ?? readString(input.payload.externalReference)
    ?? readString(input.payload.external_reference);
  const providerSubscription = buildAsaasSubscriptionDetails(subscriptionPayload, subscriptionPayload, externalReference)
    ?? {
      id: input.dataId,
      status: readAsaasEventName(input) ?? readString(subscriptionPayload.status),
      payerEmail: null,
      nextPaymentDate: readString(subscriptionPayload.nextDueDate),
      externalReference,
      raw: subscriptionPayload,
    };
  const parsedReference = parsePlatformBillingExternalReference(providerSubscription.externalReference);
  const record = await loadBillingRecord(client, {
    paymentId: parsedReference?.paymentId ?? null,
    invoiceId: parsedReference?.invoiceId ?? null,
    subscriptionId: parsedReference?.subscriptionId ?? null,
    providerSubscriptionId: providerSubscription.id,
    externalReference: providerSubscription.externalReference,
    parsedReference,
  });

  if (!record.subscription) {
    return buildResult({
      processingStatus: "ignored",
      reason: "Assinatura ConnectyHub nao encontrada para este evento Asaas.",
      providerStatus: providerSubscription.status,
      metadata: {
        asaasSubscriptionId: providerSubscription.id,
        externalReference: providerSubscription.externalReference,
      },
    });
  }

  const subscriptionStatus = mapAsaasSubscriptionStatus(providerSubscription.status, record.subscription.status);
  await updateSubscriptionProviderState(client, record, {
    provider: "asaas",
    providerSubscription,
    subscriptionStatus,
    source: "asaas_subscription_webhook",
  });

  const notification = await enqueuePlatformBillingNotification(client, {
    organizationId: record.subscription.organization_id,
    subscriptionId: record.subscription.id,
    invoiceId: record.invoice?.id ?? null,
    paymentId: record.payment?.id ?? null,
    planCode: record.subscription.plan_code,
    planName: record.plan?.name ?? record.subscription.plan_code,
    amountBrl: toNumber(record.invoice?.total_brl ?? record.payment?.amount_brl ?? record.plan?.monthly_price_brl),
    includedCredits: toNumber(record.plan?.included_credits),
    eventType: subscriptionNoticeType(subscriptionStatus),
    dedupeKey: `billing:${record.subscription.id}:asaas_subscription:${subscriptionStatus}:${providerSubscription.id}`,
    providerStatus: providerSubscription.status,
    providerReference: providerSubscription.id,
    metadata: {
      source: "asaas_subscription_webhook",
      asaasSubscription: providerSubscription.raw,
    },
  });

  return buildResult({
    processingStatus: "processed",
    reason: subscriptionStatus === "active" ? null : "Assinatura Asaas sincronizada sem novo pagamento confirmado.",
    organizationId: record.subscription.organization_id,
    subscriptionId: record.subscription.id,
    invoiceId: record.invoice?.id ?? null,
    paymentId: record.payment?.id ?? null,
    providerStatus: providerSubscription.status,
    notificationId: notification?.id ?? null,
    metadata: {
      subscriptionStatus,
      asaasSubscription: providerSubscription.raw,
    },
  });
}

async function activateBillingPlan(
  client: SupabaseClient,
  record: BillingRecord,
  input: {
    provider: BillingPaymentProvider;
    providerStatus: string;
    providerSubscription: BillingProviderSubscriptionDetails | null;
    providerPayment: MercadoPagoPaymentLike | null;
    source: string;
    webhook: BillingWebhookInput;
  },
) {
  if (!record.payment || !input.providerPayment || Math.round(Number(input.providerPayment.transaction_amount) * 100) !== Math.round(Number(record.payment.amount_brl) * 100)) throw new Error("Pagamento com valor divergente: conferência necessária antes de liberar a compra.");
  const subscription = record.subscription;

  if (!subscription) {
    return buildResult({
      processingStatus: "ignored",
      reason: "Assinatura interna ausente para ativacao.",
      providerStatus: input.providerStatus,
      metadata: {
        source: input.source,
      },
    });
  }

  const paymentPayload = record.payment?.payload ?? null;
  const invoiceMetadata = record.invoice?.metadata ?? null;
  const subscriptionMetadata = subscription.metadata ?? {};
  const checkoutMetadata = {
    ...subscriptionMetadata,
    ...(invoiceMetadata ?? {}),
    ...(paymentPayload ?? {}),
  };
  const targetPlanCode = normalizePlanCode(checkoutMetadata.target_plan_code)
    ?? normalizePlanCode(checkoutMetadata.requested_plan_code)
    ?? subscription.plan_code;
  const plan = record.plan?.plan_code === targetPlanCode ? record.plan : await loadPlanByCode(client, targetPlanCode);

  if (!plan) {
    throw new Error(`Pagamento aprovado, mas o plano ${targetPlanCode} nao foi encontrado.`);
  }

  const activatedPlanCode = plan.plan_code;
  const checkoutKind = readString(checkoutMetadata.checkout_kind) ?? "initial";
  const now = new Date();
  let cycleStart = readDate(paymentPayload?.cycle_start_at)
    ?? readDate(invoiceMetadata?.cycle_start_at)
    ?? readDate(input.providerPayment?.date_approved)
    ?? readDate(input.providerSubscription?.raw.date_created)
    ?? readDate(input.providerSubscription?.raw.dateCreated)
    ?? now;
  let cycleEnd = readDate(paymentPayload?.cycle_end_at)
    ?? readDate(invoiceMetadata?.cycle_end_at)
    ?? readDate(input.providerSubscription?.nextPaymentDate)
    ?? billingPeriodEnd(cycleStart, readCommercialTerms(checkoutMetadata.commercial_terms));
  if (checkoutMetadata.campaign_pricing) {
    const confirmedAt = readDate(input.providerPayment?.date_approved) ?? readDate(record.payment?.paid_at) ?? now;
    cycleStart = new Date(Math.max(cycleStart.getTime(), confirmedAt.getTime()));
    cycleEnd = billingPeriodEnd(cycleStart, readCommercialTerms(checkoutMetadata.commercial_terms));
    if (checkoutKind === "plan_change") {
      const priorEnd = readDate(checkoutMetadata.previous_current_period_end);
      if (priorEnd) cycleEnd = new Date(cycleEnd.getTime() + Math.max(0, priorEnd.getTime() - confirmedAt.getTime()));
    }
  }
  const termsSnapshot = checkoutMetadata.commercial_terms as Record<string, unknown> | undefined;
  const includedCredits = toNumber(Number(termsSnapshot?.included_credits ?? plan.included_credits));
  const additionalBumpCredits = readSelectedBumpCreditAmount(paymentPayload ?? invoiceMetadata);
  if (!record.payment) throw new Error("Confirmação financeira sem pagamento vinculado. Conferência necessária.");
  const providerPaymentSnapshot = input.providerPayment ? sanitizePayment(input.providerPayment) : null;
  const providerLabel = formatBillingPaymentProviderLabel(input.provider);
  const providerTag = formatBillingPaymentProviderTag(input.provider);
  const metadata = {
    ...checkoutMetadata,
    billing_provider: input.provider,
    last_billing_activation_source: input.source,
    checkout_kind: checkoutKind,
    activated_plan_code: activatedPlanCode,
    previous_plan_code: readString(checkoutMetadata.previous_plan_code) ?? subscription.plan_code,
    provider_status: input.providerStatus,
    provider_payment_id: input.providerPayment?.id ? String(input.providerPayment.id) : null,
    provider_subscription_id: input.providerSubscription?.id ?? subscription.provider_subscription_id,
    payment_confirmed_at: input.providerPayment?.date_approved ?? new Date().toISOString(),
    included_credits: includedCredits,
    additional_bump_credits: additionalBumpCredits,
    mercado_pago_subscription: input.provider === "mercado_pago" ? input.providerSubscription?.raw ?? null : null,
    mercado_pago_payment: input.provider === "mercado_pago" ? providerPaymentSnapshot : null,
    pagbank_payment: input.provider === "pagbank" ? providerPaymentSnapshot : null,
    asaas_subscription: input.provider === "asaas" ? input.providerSubscription?.raw ?? null : null,
    asaas_payment: input.provider === "asaas" ? providerPaymentSnapshot : null,
  };

  const { data: fulfillment, error: fulfillmentError } = await client.rpc("fulfill_confirmed_billing_payment", {
    p_payment: record.payment.id, p_plan_code: activatedPlanCode,
    p_cycle_start: cycleStart.toISOString(), p_cycle_end: cycleEnd.toISOString(), p_metadata: metadata,
  });
  if (fulfillmentError) throw new Error("Pagamento confirmado; a liberação será retomada: " + fulfillmentError.message);
  const alreadyGranted = Boolean(fulfillment?.already_applied);
  const creditTransactionId = fulfillment?.credit_transaction_id ?? null;
  const bumpCreditsAlreadyGranted = alreadyGranted && Boolean(fulfillment?.bump_credit_transaction_id);

  const notification = await enqueuePlatformBillingNotification(client, {
    organizationId: subscription.organization_id,
    subscriptionId: subscription.id,
    invoiceId: record.invoice?.id ?? null,
    paymentId: record.payment?.id ?? null,
    planCode: activatedPlanCode,
    planName: plan.name ?? activatedPlanCode,
    amountBrl: toNumber(record.payment?.amount_brl ?? record.invoice?.total_brl ?? plan?.monthly_price_brl),
    includedCredits,
    eventType: "payment_approved",
    dedupeKey: `billing:${subscription.id}:payment_approved:${record.payment?.id ?? input.providerPayment?.id ?? input.webhook.dataId}`,
    providerStatus: input.providerStatus,
    providerReference: String(input.providerPayment?.id ?? input.providerSubscription?.id ?? input.webhook.dataId),
    metadata,
  });

  await client.from("intelligence_events").insert({
    scope: "platform",
    organization_id: subscription.organization_id,
    source_type: "organization_subscription",
    source_id: subscription.id,
    event_type: "billing.subscription_activated",
    title: "Plano ConnectyHub ativado",
    summary: `Plano ${activatedPlanCode} ativado por webhook ${providerLabel}.`,
    confidence: 1,
    visibility: "platform",
    tags: ["billing", providerTag, "subscription"],
    payload: {
      ...metadata,
      notification_id: notification?.id ?? null,
    },
  });

  return buildResult({
    processingStatus: "processed",
    reason: alreadyGranted ? "Plano ja estava creditado; registros sincronizados." : null,
    organizationId: subscription.organization_id,
    subscriptionId: subscription.id,
    invoiceId: record.invoice?.id ?? null,
    paymentId: record.payment?.id ?? null,
    providerStatus: input.providerStatus,
    notificationId: notification?.id ?? null,
    creditTransactionId,
    metadata: {
      activated: true,
      alreadyGranted,
      bumpCreditsAlreadyGranted,
      checkoutKind,
      activatedPlanCode,
      includedCredits,
      additionalBumpCredits,
      cycleStart: cycleStart.toISOString(),
      cycleEnd: cycleEnd.toISOString(),
    },
  });
}

async function updateSubscriptionProviderState(
  client: SupabaseClient,
  record: BillingRecord,
  input: {
    provider: BillingPaymentProvider;
    providerSubscription: BillingProviderSubscriptionDetails;
    subscriptionStatus: string;
    source: string;
  },
) {
  if (!record.subscription) return;

  await client
    .from("organization_subscriptions")
    .update({
      status: input.subscriptionStatus === "active" ? record.subscription.status : input.subscriptionStatus,
      provider_subscription_id: input.providerSubscription.id,
      payer_email: input.providerSubscription.payerEmail ?? record.subscription.payer_email,
      next_billing_at: input.providerSubscription.nextPaymentDate ?? record.subscription.next_billing_at,
      metadata: {
        ...(record.subscription.metadata ?? {}),
        last_provider_sync_source: input.source,
        provider_status: input.providerSubscription.status,
        provider_subscription_id: input.providerSubscription.id,
        mercado_pago_subscription: input.provider === "mercado_pago" ? input.providerSubscription.raw : null,
        asaas_subscription: input.provider === "asaas" ? input.providerSubscription.raw : null,
      },
    })
    .eq("id", record.subscription.id)
    .eq("organization_id", record.subscription.organization_id);
}

async function updatePaymentProviderState(
  client: SupabaseClient,
  record: BillingRecord,
  input: {
    provider: BillingPaymentProvider;
    providerPayment: MercadoPagoPaymentLike;
    providerStatus: string;
    source: string;
  },
) {
  const mappedStatus = mapPaymentStatus(input.providerStatus);
  const paymentStatus = record.payment?.status === "approved" && !["approved", "refunded"].includes(mappedStatus) ? "approved" : mappedStatus;
  const paidAt = isActivePaymentStatus(input.providerStatus)
    ? input.providerPayment.date_approved ?? new Date().toISOString()
    : null;
  const paymentId = input.providerPayment.id ? String(input.providerPayment.id) : null;
  if (record.payment?.provider_payment_id && paymentId && record.payment.provider_payment_id !== paymentId) {
    throw new Error("Evento de outra tentativa de pagamento: conciliação necessária antes de alterar a fatura.");
  }
  const metadata = {
    billing_provider: input.provider,
    last_provider_sync_source: input.source,
    provider_status: input.providerStatus,
    provider_payment_id: paymentId,
    mercado_pago_payment: input.provider === "mercado_pago" ? sanitizePayment(input.providerPayment) : null,
    pagbank_payment: input.provider === "pagbank" ? sanitizePayment(input.providerPayment) : null,
    asaas_payment: input.provider === "asaas" ? sanitizePayment(input.providerPayment) : null,
    asaas_payment_id: input.provider === "asaas" ? paymentId : null,
  };

  const updates = await Promise.all([
    record.payment
      ? client
          .from("billing_payments")
          .update({
            status: paymentStatus,
            provider: input.provider,
            provider_payment_id: paymentId ?? record.payment.provider_payment_id,
            provider_status: input.providerStatus,
            paid_at: paidAt ?? record.payment.paid_at,
            payload: {
              ...(record.payment.payload ?? {}),
              ...metadata,
            },
          })
          .eq("id", record.payment.id)
          .eq("organization_id", record.payment.organization_id)
      : Promise.resolve({ error: null }),
    record.invoice
      ? client
          .from("billing_invoices")
          .update({
            status: mapInvoiceStatusFromPaymentStatus(paymentStatus),
            provider: input.provider,
            paid_at: paidAt ?? record.invoice.paid_at,
            provider_payment_id: paymentId ?? undefined,
            metadata: {
              ...(record.invoice.metadata ?? {}),
              ...metadata,
            },
          })
          .eq("id", record.invoice.id)
          .eq("organization_id", record.invoice.organization_id)
      : Promise.resolve({ error: null }),
  ]);
  const failed = updates.find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);
}

async function loadBillingRecord(
  client: SupabaseClient,
  input: {
    subscriptionId?: string | null;
    invoiceId?: string | null;
    paymentId?: string | null;
    providerPaymentId?: string | null;
    providerSubscriptionId?: string | null;
    externalReference?: string | null;
    parsedReference?: ParsedExternalReference | null;
  },
): Promise<BillingRecord> {
  let subscription = input.subscriptionId || input.parsedReference?.subscriptionId
    ? await loadSubscriptionById(client, input.subscriptionId ?? input.parsedReference?.subscriptionId ?? "")
    : null;

  if (!subscription && input.providerSubscriptionId) {
    subscription = await loadSubscriptionByProviderId(client, input.providerSubscriptionId);
  }

  if (!subscription && input.externalReference) {
    subscription = await loadSubscriptionByExternalReference(client, input.externalReference);
  }

  let payment = input.paymentId || input.parsedReference?.paymentId
    ? await loadPaymentById(client, input.paymentId ?? input.parsedReference?.paymentId ?? "")
    : null;

  if (!payment && subscription) {
    payment = await loadLatestPaymentBySubscription(client, subscription.id);
  }

  if (!payment && input.externalReference) {
    payment = await loadPaymentByExternalReference(client, input.externalReference);
  }

  if (!payment && input.providerPaymentId) {
    payment = await loadPaymentByProviderPaymentId(client, input.providerPaymentId);
  }

  if (!subscription && payment?.subscription_id) {
    subscription = await loadSubscriptionById(client, payment.subscription_id);
  }

  let invoice = input.invoiceId || input.parsedReference?.invoiceId
    ? await loadInvoiceById(client, input.invoiceId ?? input.parsedReference?.invoiceId ?? "")
    : null;

  if (!invoice && payment?.invoice_id) {
    invoice = await loadInvoiceById(client, payment.invoice_id);
  }

  if (!invoice && subscription) {
    invoice = await loadLatestInvoiceBySubscription(client, subscription.id);
  }

  if (!subscription && invoice?.subscription_id) {
    subscription = await loadSubscriptionById(client, invoice.subscription_id);
  }

  if (payment && subscription && (payment.subscription_id!==subscription.id || payment.organization_id!==subscription.organization_id)) throw new Error("Referências financeiras divergentes.");
  if (payment && invoice && (payment.invoice_id!==invoice.id || payment.organization_id!==invoice.organization_id)) throw new Error("Fatura não corresponde ao pagamento.");
  if (input.parsedReference && payment && input.parsedReference.organizationId!==payment.organization_id) throw new Error("Titular financeiro divergente.");
  const plan = subscription ? await loadPlanByCode(client, subscription.plan_code) : null;

  return { subscription, payment, invoice, plan };
}

async function loadSubscriptionById(client: SupabaseClient, id: string) {
  if (!id) return null;
  const { data, error } = await client
    .from("organization_subscriptions")
    .select("id, organization_id, plan_id, plan_code, status, provider_subscription_id, provider_plan_id, payer_email, current_period_start, current_period_end, next_billing_at, included_credits_granted, metadata")
    .eq("id", id)
    .maybeSingle<SubscriptionRow>();

  if (error) throw new Error(`Nao foi possivel carregar assinatura: ${error.message}`);
  return data ?? null;
}

async function loadSubscriptionByProviderId(client: SupabaseClient, providerSubscriptionId: string) {
  const { data, error } = await client
    .from("organization_subscriptions")
    .select("id, organization_id, plan_id, plan_code, status, provider_subscription_id, provider_plan_id, payer_email, current_period_start, current_period_end, next_billing_at, included_credits_granted, metadata")
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle<SubscriptionRow>();

  if (error) throw new Error(`Nao foi possivel carregar assinatura do provedor: ${error.message}`);
  return data ?? null;
}

async function loadSubscriptionByExternalReference(client: SupabaseClient, externalReference: string) {
  const { data, error } = await client
    .from("organization_subscriptions")
    .select("id, organization_id, plan_id, plan_code, status, provider_subscription_id, provider_plan_id, payer_email, current_period_start, current_period_end, next_billing_at, included_credits_granted, metadata")
    .contains("metadata", { external_reference: externalReference })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<SubscriptionRow>();

  if (error) throw new Error(`Nao foi possivel localizar assinatura por referencia: ${error.message}`);
  return data ?? null;
}

async function loadPaymentById(client: SupabaseClient, id: string) {
  if (!id) return null;
  const { data, error } = await client
    .from("billing_payments")
    .select("id, organization_id, invoice_id, subscription_id, provider_payment_id, provider_status, status, amount_brl, paid_at, payload")
    .eq("id", id)
    .maybeSingle<PaymentRow>();

  if (error) throw new Error(`Nao foi possivel carregar pagamento: ${error.message}`);
  return data ?? null;
}

async function loadLatestPaymentBySubscription(client: SupabaseClient, subscriptionId: string) {
  const { data, error } = await client
    .from("billing_payments")
    .select("id, organization_id, invoice_id, subscription_id, provider_payment_id, provider_status, status, amount_brl, paid_at, payload")
    .eq("subscription_id", subscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<PaymentRow>();

  if (error) throw new Error(`Nao foi possivel carregar pagamento da assinatura: ${error.message}`);
  return data ?? null;
}

async function loadPaymentByExternalReference(client: SupabaseClient, externalReference: string) {
  const { data, error } = await client
    .from("billing_payments")
    .select("id, organization_id, invoice_id, subscription_id, provider_payment_id, provider_status, status, amount_brl, paid_at, payload")
    .contains("payload", { external_reference: externalReference })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<PaymentRow>();

  if (error) throw new Error(`Nao foi possivel localizar pagamento por referencia: ${error.message}`);
  return data ?? null;
}

async function loadPaymentByProviderPaymentId(client: SupabaseClient, providerPaymentId: string) {
  const { data, error } = await client
    .from("billing_payments")
    .select("id, organization_id, invoice_id, subscription_id, provider_payment_id, provider_status, status, amount_brl, paid_at, payload")
    .eq("provider_payment_id", providerPaymentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<PaymentRow>();

  if (error) throw new Error(`Nao foi possivel localizar pagamento por id do provedor: ${error.message}`);
  return data ?? null;
}

async function loadInvoiceById(client: SupabaseClient, id: string) {
  if (!id) return null;
  const { data, error } = await client
    .from("billing_invoices")
    .select("id, organization_id, subscription_id, status, total_brl, paid_at, metadata")
    .eq("id", id)
    .maybeSingle<InvoiceRow>();

  if (error) throw new Error(`Nao foi possivel carregar fatura: ${error.message}`);
  return data ?? null;
}

async function loadLatestInvoiceBySubscription(client: SupabaseClient, subscriptionId: string) {
  const { data, error } = await client
    .from("billing_invoices")
    .select("id, organization_id, subscription_id, status, total_brl, paid_at, metadata")
    .eq("subscription_id", subscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<InvoiceRow>();

  if (error) throw new Error(`Nao foi possivel carregar fatura da assinatura: ${error.message}`);
  return data ?? null;
}

async function loadPlanByCode(client: SupabaseClient, planCode: string) {
  const { data, error } = await client
    .from("billing_plans")
    .select("id, plan_code, name, monthly_price_brl, included_credits")
    .eq("plan_code", planCode)
    .maybeSingle<PlanRow>();

  if (error) throw new Error(`Nao foi possivel carregar plano: ${error.message}`);
  return data ?? null;
}

async function enqueuePlatformBillingNotification(
  client: SupabaseClient,
  input: {
    organizationId: string;
    subscriptionId: string | null;
    invoiceId: string | null;
    paymentId: string | null;
    planCode: string;
    planName: string;
    amountBrl: number;
    includedCredits: number;
    balanceCredits?: number;
    usedCredits?: number;
    milestoneCredits?: number | null;
    trialDaysRemaining?: number | null;
    eventType: string;
    dedupeKey: string;
    providerStatus: string | null;
    providerReference: string | null;
    metadata: JsonRecord;
  },
) {
  const [settings, recipient, automation] = await Promise.all([
    loadBillingSettings(client),
    loadBillingRecipient(client, input.organizationId),
    findPlatformAutomationForNotification(client, {
      organizationId: input.organizationId,
      eventType: input.eventType,
      channel: "whatsapp",
      planCode: input.planCode,
      balanceCredits: input.balanceCredits ?? null,
      usedCredits: input.usedCredits ?? null,
      milestoneCredits: input.milestoneCredits ?? null,
      metadata: input.metadata,
    }),
  ]);
  if (input.paymentId) {
    const payment = await client.from("billing_payments").select("payload").eq("id", input.paymentId).eq("organization_id", input.organizationId).maybeSingle();
    if (payment.error) throw new Error("Não foi possível conferir o contexto do aviso de pagamento.");
    input.metadata = accountNoticeMetadata(payment.data?.payload, input.metadata, getAppBaseUrl());
  }
  const canonicalKey = canonicalPaymentNoticeKey(input.paymentId, input.eventType, input.dedupeKey);
  // Keep already emitted legacy notices from being sent again under the canonical key.
  if (input.paymentId && canonicalKey === `billing:payment:${input.paymentId}:${input.eventType}`) {
    const existing = await client.from("billing_notification_events").select("id,status").eq("organization_id", input.organizationId).eq("payment_id", input.paymentId).eq("event_type", input.eventType).is("metadata->>recipient_kind", null).order("created_at").limit(1).maybeSingle();
    if (existing.error) throw new Error("Não foi possível conferir avisos anteriores deste pagamento.");
    if (existing.data) return existing.data as { id: string; status: string };
    input.dedupeKey = canonicalKey;
  }
  const message = input.metadata.credit_topup === true || input.eventType.startsWith("credit_topup_")
    ? buildAccountCreditNotice(input, recipient.profile?.full_name ?? "Olá")
    : input.metadata.purchase_kind === "product"
    ? buildProductBillingMessage(input, recipient.profile?.full_name ?? "Olá")
    : buildBillingMessage({
    eventType: input.eventType,
    customerName: recipient.profile?.full_name ?? recipient.organization?.name ?? null,
    planName: input.planName,
    amountBrl: input.amountBrl,
    includedCredits: input.includedCredits,
    balanceCredits: input.balanceCredits ?? null,
    usedCredits: input.usedCredits ?? null,
    milestoneCredits: input.milestoneCredits ?? null,
    trialDaysRemaining: input.trialDaysRemaining ?? null,
    providerStatus: input.providerStatus,
    checkoutUrl: readString(input.metadata.checkout_public_url) ?? readString(input.metadata.checkout_url),
    metadata: input.metadata,
    templates: settings?.metadata?.billing_message_templates,
    templateOverride: automation?.messageTemplate ?? null,
  });
  const selectedAgentId = automation?.selectedAgentId
    ?? (automation?.fallbackToBillingAgent !== false ? settings?.billing_whatsapp_agent_id ?? null : null);
  const enabled = settings?.notification_whatsapp_enabled !== false;
  const recipientPhone = normalizePhone(recipient.profile?.phone);
  const delayMinutes = Math.max(0, automation?.delayMinutes ?? 0);
  const nextAttemptAt = delayMinutes > 0
    ? new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
    : new Date().toISOString();
  const initialError = !enabled
    ? "Notificacoes WhatsApp de billing desativadas."
    : !recipientPhone
        ? "Cliente sem telefone no perfil."
        : null;
  const insertPayload: JsonRecord = {
    organization_id: input.organizationId,
    invoice_id: input.invoiceId,
    payment_id: input.paymentId,
    subscription_id: input.subscriptionId,
    event_type: input.eventType,
    dedupe_key: input.dedupeKey,
    channel: "whatsapp",
    status: initialError ? "skipped" : "pending",
    selected_agent_id: selectedAgentId,
    recipient_phone: recipientPhone,
    message_preview: preview(message, 480),
    next_attempt_at: initialError ? null : nextAttemptAt,
    error_message: initialError,
    metadata: {
      ...input.metadata,
      platform_sender_agent_id: selectedAgentId,
      automation_flow_id: automation?.id ?? null,
      automation_flow_key: automation?.flowKey ?? null,
      automation_flow_name: automation?.name ?? null,
      automation_delay_minutes: delayMinutes,
      message_body: message,
      provider_status: input.providerStatus,
      provider_reference: input.providerReference,
      plan_code: input.planCode,
      plan_name: input.planName,
      amount_brl: input.amountBrl,
      included_credits: input.includedCredits,
      ...(input.balanceCredits != null ? { balance_credits: input.balanceCredits } : {}),
    },
  };

  if (automation?.id) {
    insertPayload.automation_flow_id = automation.id;
  }

  const insert = await client
    .from("billing_notification_events")
    .insert(insertPayload)
    .select("id, status")
    .maybeSingle<{ id: string; status: string }>();

  if (insert.error) {
    if (insert.error.code === "23505") {
      const { data } = await client
        .from("billing_notification_events")
        .select("id, status")
        .eq("dedupe_key", input.dedupeKey)
        .maybeSingle<{ id: string; status: string }>();

      return data ?? null;
    }

    throw new Error(`Nao foi possivel registrar notificacao de billing: ${insert.error.message}`);
  }

  const event = insert.data;
  await enqueueResponsibleBillingNotifications(client, {
    organizationId: input.organizationId,
    basePayload: insertPayload,
    selectedAgentId,
    ownerPhone: recipientPhone,
    message,
    delayMinutes,
    initialError,
    settingsMetadata: settings?.metadata ?? null,
    originalDedupeKey: input.dedupeKey,
  }).catch(async (error) => {
    if (!event?.id) return;

    await client
      .from("billing_notification_events")
      .update({
        metadata: {
          ...readRecord(insertPayload.metadata),
          responsible_notification_error: error instanceof Error ? error.message : "Falha ao criar aviso para responsaveis.",
        },
      })
      .eq("id", event.id);
  });

  if (!event || initialError || !recipientPhone || delayMinutes > 0) {
    return event ?? null;
  }

  await sendBillingNotificationNow(client, {
    eventId: event.id,
    agentId: selectedAgentId,
    phone: recipientPhone,
    message,
    attempts: 0,
  });

  return event;
}

async function enqueueResponsibleBillingNotifications(
  client: SupabaseClient,
  input: {
    organizationId: string;
    basePayload: JsonRecord;
    selectedAgentId: string | null;
    ownerPhone: string | null;
    message: string;
    delayMinutes: number;
    initialError: string | null;
    settingsMetadata: JsonRecord | null;
    originalDedupeKey: string;
  },
) {
  const policy = normalizePlatformBillingRenewalPolicy(
    readRecord(input.settingsMetadata)?.[platformBillingRenewalPolicyMetadataKey],
  );

  if (!policy.notifyResponsibleHumans) {
    return;
  }

  const recipients = await loadBillingResponsibleRecipients(client, input.organizationId, input.ownerPhone);
  if (recipients.length === 0) {
    return;
  }

  const responsibleInitialError = input.initialError === "Cliente sem telefone no perfil." ? null : input.initialError;

  for (const recipient of recipients) {
    const insertPayload: JsonRecord = {
      ...input.basePayload,
      dedupe_key: `${input.originalDedupeKey}:responsible:${recipient.phone}`,
      status: responsibleInitialError ? "skipped" : "pending",
      recipient_phone: recipient.phone,
      selected_agent_id: input.selectedAgentId,
      error_message: responsibleInitialError,
      metadata: {
        ...readRecord(input.basePayload.metadata),
        recipient_kind: "agent_responsible",
        responsible_agent_id: recipient.agentId,
        responsible_agent_name: recipient.agentName,
        responsible_name: recipient.name,
        original_dedupe_key: input.originalDedupeKey,
      },
    };

    const insert = await client
      .from("billing_notification_events")
      .insert(insertPayload)
      .select("id, status")
      .maybeSingle<{ id: string; status: string }>();

    if (insert.error) {
      if (insert.error.code === "23505") {
        continue;
      }

      throw new Error(`Nao foi possivel registrar aviso financeiro para responsavel: ${insert.error.message}`);
    }

    if (!insert.data?.id || responsibleInitialError || input.delayMinutes > 0) {
      continue;
    }

    await sendBillingNotificationNow(client, {
      eventId: insert.data.id,
      agentId: input.selectedAgentId,
      phone: recipient.phone,
      message: input.message,
      attempts: 0,
    });
  }
}

async function loadBillingResponsibleRecipients(
  client: SupabaseClient,
  organizationId: string,
  ownerPhone: string | null,
) {
  const { data, error } = await client
    .from("agent_registry")
    .select("id, name, persona_name, metadata")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .contains("metadata", { agent_kind: "whatsapp" })
    .returns<BillingResponsibleAgentRow[]>();

  if (error) {
    throw new Error(`Nao foi possivel carregar responsaveis dos agentes: ${error.message}`);
  }

  const recipients = new Map<string, BillingResponsibleRecipient>();
  const normalizedOwnerPhone = normalizePhone(ownerPhone);

  for (const agent of data ?? []) {
    const agentName = agent.persona_name?.trim() || agent.name;

    for (const responsible of readAgentResponsibleHumans(agent.metadata)) {
      const phone = normalizePhone(responsible.phone);

      if (!phone || phone === normalizedOwnerPhone) {
        continue;
      }

      if (!responsible.notifyPayments && !responsible.notifyOperational) {
        continue;
      }

      if (!recipients.has(phone)) {
        recipients.set(phone, {
          agentId: agent.id,
          agentName,
          name: responsible.name || agentName,
          phone,
        });
      }
    }
  }

  return Array.from(recipients.values());
}

export async function processPendingPlatformBillingNotifications(
  client: SupabaseClient,
  input: { limit?: number } = {},
) {
  const recovered = await client.rpc("recover_abandoned_billing_notices");
  if (recovered.error) throw new Error("Não foi possível conferir os avisos interrompidos.");
  if (Number(recovered.data)>0) await client.from("maintenance_audit_logs").insert({event_type:"billing.notice.delivery_uncertain",metadata:{count:recovered.data,action:"Verificar entrega no provedor antes de reenviar."}});
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const accountNotices = await processAccountBillingNoticeOutbox(client, notice => enqueuePlatformBillingNotification(client, notice), getAppBaseUrl());
  const enqueuedPendingCheckouts = await enqueueMissingPendingCheckoutNotifications(client, {
    limit: Math.min(limit, 25),
  });
  const { data, error } = await client
    .from("billing_notification_events")
    .select("id, selected_agent_id, recipient_phone, message_preview, attempts, metadata")
    .in("status", ["pending", "failed"])
    .eq("delivery_uncertain", false)
    .is("delivery_claimed_at", null)
    .lte("next_attempt_at", new Date().toISOString())
    .lt("attempts", 5)
    .order("next_attempt_at", { ascending: true })
    .limit(limit)
    .returns<PendingBillingNotificationRow[]>();

  if (error) {
    throw new Error(`Nao foi possivel carregar automacoes pendentes: ${error.message}`);
  }

  const rows = data ?? [];
  let sent = 0;
  let skipped = 0;

  for (const row of rows) {
    const message = readString(row.metadata?.message_body) ?? row.message_preview;
    const agentId = row.selected_agent_id;
    const phone = row.recipient_phone;

    if (!message || !phone) {
      skipped += 1;
      await client
        .from("billing_notification_events")
        .update({
          status: "skipped",
          error_message: "Automacao pendente sem telefone ou mensagem.",
        })
        .eq("id", row.id);
      continue;
    }

    const delivered = await sendBillingNotificationNow(client, {
      eventId: row.id,
      agentId,
      phone,
      message,
      attempts: toNumber(row.attempts),
    });
    if (delivered) sent += 1;
  }

  return {
    checked: rows.length,
    enqueuedPendingCheckouts,
    accountNotices,
    sent,
    skipped,
  };
}

async function enqueueMissingPendingCheckoutNotifications(
  client: SupabaseClient,
  input: { limit: number },
) {
  const { data: subscriptions, error } = await client
    .from("organization_subscriptions")
    .select("id, organization_id")
    .in("status", ["pending", "incomplete"])
    .order("created_at", { ascending: false })
    .limit(input.limit)
    .returns<Array<{ id: string; organization_id: string }>>();

  if (error) {
    throw new Error(`Nao foi possivel carregar checkouts pendentes: ${error.message}`);
  }

  const subscriptionIds = (subscriptions ?? []).map((subscription) => subscription.id);

  if (subscriptionIds.length === 0) {
    return 0;
  }

  const { data: existingNotifications, error: existingError } = await client
    .from("billing_notification_events")
    .select("subscription_id")
    .eq("event_type", "subscription_pending")
    .in("subscription_id", subscriptionIds)
    .returns<Array<{ subscription_id: string | null }>>();

  if (existingError) {
    throw new Error(`Nao foi possivel validar notificacoes pendentes: ${existingError.message}`);
  }

  const notifiedSubscriptionIds = new Set(
    (existingNotifications ?? [])
      .map((item) => item.subscription_id)
      .filter((subscriptionId): subscriptionId is string => Boolean(subscriptionId)),
  );
  let enqueued = 0;

  for (const subscription of subscriptions ?? []) {
    if (notifiedSubscriptionIds.has(subscription.id)) {
      continue;
    }

    const record = await loadBillingRecord(client, { subscriptionId: subscription.id });

    if (!record.subscription) {
      continue;
    }

    const checkoutPath = readString(record.subscription.metadata?.checkout_url)
      ?? buildDashboardBillingCheckoutPath(record.subscription.id);
    const checkoutUrl = readString(record.subscription.metadata?.checkout_public_url)
      ?? buildDashboardBillingCheckoutUrl(record.subscription.id);

    await enqueuePlatformBillingNotification(client, {
      organizationId: record.subscription.organization_id,
      subscriptionId: record.subscription.id,
      invoiceId: record.invoice?.id ?? null,
      paymentId: record.payment?.id ?? null,
      planCode: record.subscription.plan_code,
      planName: record.plan?.name ?? record.subscription.plan_code,
      amountBrl: toNumber(record.invoice?.total_brl ?? record.payment?.amount_brl ?? record.plan?.monthly_price_brl),
      includedCredits: toNumber(record.plan?.included_credits),
      eventType: "subscription_pending",
      dedupeKey: `billing:${record.subscription.id}:subscription:pending`,
      providerStatus: "pending",
      providerReference: record.subscription.provider_subscription_id,
      metadata: {
        source: "billing_pending_checkout_backfill",
        checkout_url: checkoutPath,
        checkout_public_url: checkoutUrl,
        checkout_model: "connectyhub_plan_checkout",
        subscription_status: record.subscription.status,
      },
    });
    enqueued += 1;
  }

  return enqueued;
}

async function sendBillingNotificationNow(
  client: SupabaseClient,
  input: {
    eventId: string;
    agentId: string | null;
    phone: string;
    message: string;
    attempts?: number;
  },
) {
  const nextAttempts = Math.max(0, input.attempts ?? 0) + 1;
  const { data: claimed, error: claimError } = await client.rpc("claim_billing_notice", { p_event: input.eventId });
  if (claimError) throw new Error("Não foi possível reservar o aviso financeiro.");
  if (!claimed) return false;
  let dispatched = false;


  try {
    const [credentials, settings, currentEvent] = await Promise.all([
      loadUazapiCredentials(client),
      loadBillingSettings(client),
      loadBillingNotificationDeliveryContext(client, input.eventId),
    ]);
    if (!currentEvent?.organization_id) throw new Error("Conta do aviso não encontrada.");
    const recipient = await ensureNoticeRecipient(client, currentEvent.organization_id, input.phone);
    if (!recipient.enabled) throw new AccountNoticesOptedOut();
    if (settings?.notification_whatsapp_enabled === false) throw new Error("Avisos WhatsApp desativados na plataforma.");
    const platformAgentId = readString(currentEvent.metadata?.platform_sender_agent_id) ?? input.agentId;
    const sender = await resolveNotificationSender(client, currentEvent.organization_id, platformAgentId, input.phone);
    if (!sender) throw new Error("Nenhum WhatsApp disponível para enviar o aviso. O envio será tentado novamente.");
    const button = buildCheckoutActionButton({
      eventType: currentEvent?.event_type ?? null,
      metadata: currentEvent?.metadata ?? null,
    });
    const delivery = await deliverWithPlatformFallback({
      sender,
      fallback: () => loadPlatformNotificationSender(client, platformAgentId, input.phone),
      isDefinitiveFailure: error => error instanceof BillingNoticeProviderError && error.definitive,
      send: async (selected: NotificationSender) => {
        const actions = await prepareNoticeActions(client, recipient, { appUrl: getAppBaseUrl(), senderKind: selected.kind, senderPhone: selected.instance.phone_number, eventType: currentEvent.event_type });
        const message = renderAccountNoticeVoice({
          senderKind: selected.kind, agentName: selected.agentName,
          eventType: currentEvent.event_type, platformMessage: input.message,
          metadata: currentEvent.metadata ?? {},
        });
        let token: string;
        try { token = decryptCredentialValue(selected.instance.instance_token_encrypted!); }
        catch { throw new BillingNoticeProviderError("Conexão do remetente indisponível.", true); }
        const recorded = await client.from("billing_notification_events").update({
          selected_agent_id: selected.agentId,
          metadata: { ...(currentEvent.metadata ?? {}), platform_sender_agent_id: platformAgentId,
            sender_kind: selected.kind, sender_instance_id: selected.instance.id,
            attempted_message_body: message,
            sender_fallback: sender.kind === "customer" && selected.kind === "platform" },
        }).eq("id", input.eventId);
        if (recorded.error) throw new Error("Não foi possível registrar o remetente do aviso.");
        dispatched = true;
        try {
          return await sendBillingWhatsappNotice({
            outbound: { instanceId: selected.instance.id, client },
            credentials,
            token,
            phone: input.phone,
            message,
            actions,
            button,
            pixCode: readString(currentEvent.metadata?.pix_copy_code),
            paymentSummary: {
              amount: Number(currentEvent.metadata?.amount_brl),
              itemName: readString(currentEvent.metadata?.plan_name) ?? readString(currentEvent.metadata?.plan_code) ?? "Compra ConnectyHub",
              invoiceNumber: (currentEvent.invoice_id ?? currentEvent.subscription_id ?? input.eventId).slice(0, 8).toUpperCase(),
            },
            trackId: `billing_notice_${input.eventId}`,
          });
        } catch (error) {
          if (error instanceof BillingNoticeProviderError && error.definitive) dispatched = false;
          throw error;
        }
      },
    });
    const sendResult = delivery.result;
    const instance = delivery.sender.instance;

    const saved = await Promise.all([
      client
        .from("billing_notification_events")
        .update({
          status: "sent",
          message_preview: preview(sendResult.message, 480),
          selected_agent_id: delivery.sender.agentId,
          error_message: null,
          next_attempt_at: null,
          delivery_claimed_at: null,
          attempts: nextAttempts,
          sent_at: new Date().toISOString(),
          provider_message_id: readProviderMessageId(sendResult.providerResponse.data),
          metadata: {
            ...(currentEvent?.metadata ?? {}),
            platform_sender_agent_id: platformAgentId,
            sender_kind: delivery.sender.kind,
            sender_instance_id: instance.id,
            sender_fallback: delivery.fallbackUsed,
            delivery_mode: sendResult.deliveryMode,
            sent_message_body: sendResult.message,
            checkout_button: sendResult.button,
            fallback_error: sendResult.fallbackError,
            provider_response: sanitizeProviderData({
              mode: sendResult.deliveryMode,
              response: sendResult.providerResponse.data,
            }),
          },
        })
        .eq("id", input.eventId),
      client
        .from("whatsapp_instances")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", instance.id),
    ]);
    if (saved.some(result => result.error)) throw new Error("Aviso enviado; confirmação de registro em conferência.");
    return true;
  } catch (error) {
    if (error instanceof AccountNoticesOptedOut) {
      await client.from("billing_notification_events").update({ status: "skipped", delivery_claimed_at: null, next_attempt_at: null, error_message: error.message }).eq("id", input.eventId);
      return false;
    }
    await client
      .from("billing_notification_events")
      .update({
        status: "failed",
        delivery_claimed_at: null,
        delivery_uncertain: dispatched && !(error instanceof BillingNoticeProviderError && error.definitive),
        next_attempt_at: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** nextAttempts)).toISOString(),
        attempts: nextAttempts,
        error_message: error instanceof Error ? error.message : "Falha ao enviar WhatsApp de billing.",
      })
      .eq("id", input.eventId);
    return false;
  }
}

type BillingCheckoutActionButton = {
  label: string;
  url: string;
};

type BillingWhatsappNoticeResult = {
  providerResponse: Awaited<ReturnType<typeof callUazapi>>;
  deliveryMode: "payment_request" | "button" | "text" | "text_fallback";
  message: string;
  button: BillingCheckoutActionButton | null;
  fallbackError: string | null;
};

async function loadBillingNotificationDeliveryContext(client: SupabaseClient, eventId: string) {
  const { data, error } = await client
    .from("billing_notification_events")
    .select("organization_id, event_type, subscription_id, invoice_id, metadata")
    .eq("id", eventId)
    .maybeSingle<{
      organization_id: string;
      event_type: string | null;
      subscription_id: string | null;
      invoice_id: string | null;
      metadata: JsonRecord | null;
    }>();

  if (error) {
    throw new Error(`Nao foi possivel carregar contexto da notificacao: ${error.message}`);
  }

  return data ?? null;
}

async function sendBillingWhatsappNotice(input: {
  outbound: WhatsappOutboundScope;
  credentials: UazapiCredentials;
  token: string;
  phone: string;
  message: string;
  button: BillingCheckoutActionButton | null;
  pixCode?: string | null;
  paymentSummary?: { amount: number; itemName: string; invoiceNumber: string };
  trackId: string;
  actions?: AccountNoticeActions;
}): Promise<BillingWhatsappNoticeResult> {
  if (input.actions) {
    // Include unsubscribe in the same message as checkout/Pix; every fallback keeps the link.
    const baseMessage = input.pixCode && input.button && !input.message.includes(input.button.url)
      ? `${input.message}\n\nAbrir no painel: ${input.button.url}` : input.message;
    const text = noticeActionsMessage(baseMessage, input.actions);
    try {
      const providerResponse = await callUazapi(input.credentials, "/send/menu", { outbound: input.outbound,
        method: "POST", token: input.token, body: {
          number: input.phone, type: "button", text,
          choices: noticeActionChoices(input.actions, input.button, input.pixCode),
          footerText: "ConnectyHub", track_source: "connectyhub", track_id: input.trackId,
        },
      });
      return { providerResponse, deliveryMode: "button", message: text, button: input.button, fallbackError: null };
    } catch (error) {
      if (!(error instanceof BillingNoticeProviderError && error.definitive && [400, 404, 405, 422].includes(error.status ?? 0))) throw error;
      const message = `${text}${input.button && !text.includes(input.button.url) ? `\n\nAbrir no painel: ${input.button.url}` : ""}${input.pixCode ? `\n\nPix copia e cola:\n${input.pixCode}` : ""}`;
      const providerResponse = await callUazapi(input.credentials, "/send/text", { outbound: input.outbound, method: "POST", token: input.token, body: { number: input.phone, text: message, linkPreview: false, track_source: "connectyhub", track_id: `${input.trackId}_fallback` } });
      return { providerResponse, deliveryMode: "text_fallback", message, button: input.button, fallbackError: error.message };
    }
  }
  let paymentRequestError: string | null = null;
  if (input.button && input.pixCode && input.paymentSummary && Number.isFinite(input.paymentSummary.amount) && input.paymentSummary.amount > 0) {
    // The total is the invoice amount after discounts/add-ons, never the plan's list price.
    const message = `${input.message}\n\nCopie o Pix pelo botão ou abra os dados da cobrança para acessar o checkout ConnectyHub.`;
    try {
      const providerResponse = await callUazapi(input.credentials, "/send/request-payment", { outbound: input.outbound,
        method: "POST",
        token: input.token,
        body: {
          number: input.phone,
          title: "Pagamento ConnectyHub",
          text: message,
          footer: "ConnectyHub",
          itemName: input.paymentSummary.itemName,
          invoiceNumber: input.paymentSummary.invoiceNumber,
          amount: Number(input.paymentSummary.amount.toFixed(2)),
          pixCode: input.pixCode,
          paymentLink: input.button.url,
          readchat: true,
          readmessages: true,
          track_source: "connectyhub",
          track_id: input.trackId,
        },
      });
      return { providerResponse, deliveryMode: "payment_request", message, button: input.button, fallbackError: null };
    } catch (error) {
      if (!(error instanceof BillingNoticeProviderError && error.definitive)) throw error;
      paymentRequestError = error.message;
    }
  }

  if (input.button) {
    const buttonMessage = input.pixCode
      ? `${input.message}${input.message.includes(input.button.url) ? "" : `\n\nFinalizar no checkout: ${input.button.url}`}\n\nCopie o Pix pelo botão abaixo para pagar no seu banco.`
      : buildCheckoutButtonMessage(input.message, input.button.url);

    try {
      const providerResponse = await callUazapi(input.credentials, "/send/menu", { outbound: input.outbound,
        method: "POST",
        token: input.token,
        body: {
          number: input.phone,
          type: "button",
          text: buttonMessage,
          choices: input.pixCode ? [`Copiar código Pix|copy:${input.pixCode}`] : [`${input.button.label}|${input.button.url}`],
          footerText: "ConnectyHub",
          readchat: true,
          readmessages: true,
          track_source: "connectyhub",
          track_id: paymentRequestError ? `${input.trackId}_copy` : input.trackId,
        },
      });

      return {
        providerResponse,
        deliveryMode: "button",
        message: buttonMessage,
        button: input.button,
        fallbackError: paymentRequestError,
      };
    } catch (error) {
      if (!(error instanceof BillingNoticeProviderError && error.definitive)) throw error;
      const fallbackError = [paymentRequestError, error.message].filter(Boolean).join("; ");
      const fallbackMessage = input.pixCode ? `${input.message}${input.message.includes(input.button.url) ? "" : `\n\nFinalizar no checkout: ${input.button.url}`}\n\nPix copia e cola:\n${input.pixCode}` : input.message;
      const providerResponse = await callUazapi(input.credentials, "/send/text", { outbound: input.outbound,
        method: "POST",
        token: input.token,
        body: {
          number: input.phone,
          text: fallbackMessage,
          linkPreview: false,
          track_source: "connectyhub",
          track_id: `${input.trackId}_fallback`,
        },
      });

      return {
        providerResponse,
        deliveryMode: "text_fallback",
        message: fallbackMessage,
        button: input.button,
        fallbackError,
      };
    }
  }

  const providerResponse = await callUazapi(input.credentials, "/send/text", { outbound: input.outbound,
    method: "POST",
    token: input.token,
    body: {
      number: input.phone,
      text: input.message,
      linkPreview: false,
      track_source: "connectyhub",
      track_id: input.trackId,
    },
  });

  return {
    providerResponse,
    deliveryMode: "text",
    message: input.message,
    button: null,
    fallbackError: null,
  };
}

function buildCheckoutActionButton(input: {
  eventType: string | null;
  metadata: JsonRecord | null;
}): BillingCheckoutActionButton | null {
  if (!input.eventType || !checkoutButtonEventTypes.has(input.eventType)) {
    return null;
  }

  const url = resolveCheckoutActionUrl(input.metadata);

  if (!url) {
    return null;
  }

  return {
    label: input.metadata?.credit_topup === true ? "Ver recarga" : resolveCheckoutActionLabel(input.eventType),
    url,
  };
}

function resolveCheckoutActionLabel(eventType: string) {
  if (eventType.startsWith("trial_")) return "Escolher plano";
  if (eventType.includes("low_credits") || eventType.includes("no_credits")) return "Comprar creditos";
  if (eventType.includes("expired") || eventType.includes("remaining")) return "Renovar plano";
  return "Finalizar pagamento";
}

function resolveCheckoutActionUrl(metadata: JsonRecord | null | undefined) {
  const rawUrl = readString(metadata?.checkout_public_url) ?? readString(metadata?.checkout_url);

  if (!rawUrl) {
    return null;
  }

  if (/^https?:\/\//i.test(rawUrl)) {
    return rawUrl;
  }

  if (rawUrl.startsWith("/")) {
    return `${getAppBaseUrl()}${rawUrl}`;
  }

  return null;
}

function buildCheckoutButtonMessage(message: string, checkoutUrl: string) {
  const escapedUrl = escapeRegExp(checkoutUrl);
  const withoutUrl = message
    .replace(new RegExp(escapedUrl, "g"), "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\b(?:Finalize|Conclua|Acesse|Abra)\s+(?:por aqui|no painel|pelo painel)?\s*:?\s*\.?/gi, "Toque no botao abaixo para continuar.")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!withoutUrl) {
    return "Tudo certo. Toque no botao abaixo para continuar.";
  }

  if (/\bbotao abaixo\b/i.test(withoutUrl) || /\bcheckout\b/i.test(withoutUrl)) {
    return withoutUrl;
  }

  return `${withoutUrl}\n\nToque no botao abaixo para continuar.`;
}

async function loadBillingNotificationEvent(client: SupabaseClient, eventId: string) {
  const { data, error } = await client
    .from("billing_notification_events")
    .select("id, status, selected_agent_id, recipient_phone, message_preview, error_message")
    .eq("id", eventId)
    .maybeSingle<{
      id: string;
      status: string;
      selected_agent_id: string | null;
      recipient_phone: string | null;
      message_preview: string | null;
      error_message: string | null;
    }>();

  if (error) {
    throw new Error(`Nao foi possivel carregar notificacao de teste: ${error.message}`);
  }

  return data ?? null;
}

async function loadBillingSettings(client: SupabaseClient) {
  const { data, error } = await client
    .from("platform_billing_settings")
    .select("billing_whatsapp_agent_id, notification_whatsapp_enabled, metadata")
    .eq("setting_key", "default")
    .maybeSingle<BillingSettingsRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar configuracao de billing: ${error.message}`);
  }

  return data ?? null;
}

async function loadBillingRecipient(client: SupabaseClient, organizationId: string) {
  const { data: organization, error: organizationError } = await client
    .from("organizations")
    .select("id, name, owner_id")
    .eq("id", organizationId)
    .maybeSingle<OrganizationRecipientRow>();

  if (organizationError) {
    throw new Error(`Nao foi possivel carregar cliente para notificacao: ${organizationError.message}`);
  }

  if (!organization?.owner_id) {
    return { organization: organization ?? null, profile: null };
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, full_name, phone, email")
    .eq("id", organization.owner_id)
    .maybeSingle<ProfileRecipientRow>();

  if (profileError) {
    throw new Error(`Nao foi possivel carregar telefone do cliente: ${profileError.message}`);
  }

  return { organization, profile: profile ?? null };
}

class BillingNoticeProviderError extends Error {
  constructor(message: string, readonly definitive: boolean, readonly status?: number) { super(message); }
}

async function callUazapi(
  credentials: UazapiCredentials,
  path: string,
  options: { outbound?: WhatsappOutboundScope;
    method: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    token?: string;
  },
) {
  const response = await fetchWhatsappOutbound(`${credentials.baseUrl}${path}`, {
    method: options.method,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { token: options.token } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  }, options.outbound);
  const data = await readResponse(response);

  if (!response.ok) {
    throw new BillingNoticeProviderError(readProviderError(data) ?? `Uazapi respondeu status ${response.status}.`, response.status >= 400 && response.status < 500 && response.status !== 408, response.status);
  }

  return { ok: response.ok, status: response.status, data };
}

function isSubscriptionPreapprovalTopic(eventType: string | null, action: string | null) {
  const text = `${eventType ?? ""} ${action ?? ""}`.toLowerCase();
  return text.includes("subscription_preapproval")
    || text.includes("preapproval.updated")
    || text.includes("preapproval.created")
    || text.trim() === "subscription";
}

function isPaymentTopic(eventType: string | null, action: string | null) {
  const text = `${eventType ?? ""} ${action ?? ""}`.toLowerCase();
  return text.includes("payment");
}

function isAsaasPaymentTopic(input: BillingWebhookInput) {
  const eventName = readAsaasEventName(input);
  return Boolean(eventName?.startsWith("PAYMENT_"))
    || isPaymentTopic(input.eventType, input.action)
    || Boolean(readAsaasPaymentPayload(input));
}

function isAsaasCheckoutTopic(input: BillingWebhookInput) {
  const eventName = readAsaasEventName(input);
  return Boolean(eventName?.startsWith("CHECKOUT_"))
    || Boolean(readAsaasCheckoutPayload(input));
}

function isAsaasSubscriptionTopic(input: BillingWebhookInput) {
  const eventName = readAsaasEventName(input);
  return Boolean(eventName?.startsWith("SUBSCRIPTION_"))
    || Boolean(readAsaasSubscriptionPayload(input));
}

function readAsaasEventName(input: BillingWebhookInput) {
  return readString(input.payload.event)
    ?? readString(input.payload.type)
    ?? readString(input.eventType)
    ?? readString(input.action);
}

function readAsaasPaymentPayload(input: BillingWebhookInput): JsonRecord | null {
  const directPayment = readOptionalRecord(input.payload.payment);
  if (directPayment) return directPayment;

  const data = readOptionalRecord(input.payload.data);
  const dataPayment = readOptionalRecord(data?.payment);
  if (dataPayment) return dataPayment;

  if (looksLikeAsaasPayment(data)) return data;
  if (looksLikeAsaasPayment(input.payload)) return input.payload;

  return null;
}

function readAsaasCheckoutPayload(input: BillingWebhookInput): JsonRecord | null {
  const directCheckout = readOptionalRecord(input.payload.checkout);
  if (directCheckout) return directCheckout;

  const data = readOptionalRecord(input.payload.data);
  const dataCheckout = readOptionalRecord(data?.checkout);
  if (dataCheckout) return dataCheckout;

  if (looksLikeAsaasCheckout(data)) return data;
  if (looksLikeAsaasCheckout(input.payload)) return input.payload;

  return null;
}

function readAsaasSubscriptionPayload(input: BillingWebhookInput): JsonRecord | null {
  const directSubscription = readOptionalRecord(input.payload.subscription);
  if (directSubscription) return directSubscription;

  const data = readOptionalRecord(input.payload.data);
  const dataSubscription = readOptionalRecord(data?.subscription);
  if (dataSubscription) return dataSubscription;

  if (looksLikeAsaasSubscription(data)) return data;
  if (looksLikeAsaasSubscription(input.payload)) return input.payload;

  return null;
}

function looksLikeAsaasPayment(value: JsonRecord | null | undefined) {
  if (!value) return false;
  return Boolean(readString(value.id) && (
    readString(value.billingType)
    || readString(value.status)
    || typeof value.value === "number"
    || typeof value.value === "string"
  ));
}

function looksLikeAsaasCheckout(value: JsonRecord | null | undefined) {
  if (!value) return false;
  return Boolean(readString(value.id) && (
    readString(value.url)
    || readString(value.checkoutUrl)
    || readString(value.status)?.startsWith("CHECKOUT_")
    || Array.isArray(value.chargeTypes)
  ));
}

function looksLikeAsaasSubscription(value: JsonRecord | null | undefined) {
  if (!value) return false;
  return Boolean(readString(value.id) && (
    readString(value.cycle)
    || readString(value.nextDueDate)
    || readString(value.billingType)
    || readString(value.status)?.toUpperCase().startsWith("SUBSCRIPTION_")
  ));
}

function normalizeAsaasPaymentLike(
  payment: JsonRecord | AsaasPaymentResponse,
  fallbackId: string,
  fallback: {
    fallbackStatus?: string | null;
    externalReference?: string | null;
    paymentMethodId?: string | null;
  } = {},
): MercadoPagoPaymentLike {
  const record = payment as JsonRecord;
  const status = record.deleted === true ? "DELETED" : readString(record.status) ?? fallback.fallbackStatus ?? "PENDING";
  const externalReference = readString(record.externalReference)
    ?? readString(record.external_reference)
    ?? fallback.externalReference
    ?? undefined;
  const paymentDate = readString(record.confirmedDate)
    ?? readString(record.paymentDate)
    ?? readString(record.clientPaymentDate)
    ?? readString(record.creditDate);
  const dateCreated = readString(record.dateCreated) ?? readString(record.date_created);

  return {
    id: readString(record.id) ?? fallbackId,
    status,
    status_detail: readString(record.status_detail) ?? status,
    external_reference: externalReference,
    transaction_amount: toNumberLike(record.value) ?? toNumberLike(record.netValue) ?? undefined,
    date_approved: paymentDate ?? (isActivePaymentStatus(status) ? new Date().toISOString() : undefined),
    date_created: dateCreated ?? undefined,
    payment_method_id: fallback.paymentMethodId ?? normalizeAsaasPaymentMethod(readString(record.billingType)),
  };
}

function buildAsaasSubscriptionDetails(
  value: unknown,
  fallbackRaw: JsonRecord,
  externalReference: string | null | undefined,
): BillingProviderSubscriptionDetails | null {
  if (typeof value === "string" && value.trim()) {
    return {
      id: value.trim(),
      status: null,
      payerEmail: null,
      nextPaymentDate: null,
      externalReference: externalReference ?? null,
      raw: { id: value.trim() },
    };
  }

  const record = readOptionalRecord(value) as (AsaasSubscriptionResponse & JsonRecord) | null;

  if (!record?.id) {
    return null;
  }

  return {
    id: record.id,
    status: readString(record.status),
    payerEmail: readString(record.email) ?? readString(record.payerEmail),
    nextPaymentDate: readString(record.nextDueDate) ?? readString(record.next_due_date),
    externalReference: readString(record.externalReference)
      ?? readString(record.external_reference)
      ?? externalReference
      ?? null,
    raw: {
      ...fallbackRaw,
      ...record,
    },
  };
}

function mapAsaasSubscriptionStatus(providerStatus: string | null | undefined, fallbackStatus?: string | null) {
  const normalized = providerStatus?.trim().toUpperCase() ?? "";

  if (normalized === "ACTIVE" || normalized === "SUBSCRIPTION_CREATED" || normalized === "SUBSCRIPTION_UPDATED") {
    return fallbackStatus === "active" ? "active" : "pending";
  }

  if (normalized === "INACTIVE" || normalized === "DELETED" || normalized === "CANCELLED" || normalized === "CANCELED" || normalized === "SUBSCRIPTION_INACTIVATED" || normalized === "SUBSCRIPTION_DELETED") {
    return "canceled";
  }

  return fallbackStatus && fallbackStatus !== "pending" ? fallbackStatus : "pending";
}

function normalizeAsaasPaymentMethod(billingType: string | null) {
  const normalized = billingType?.trim().toUpperCase();
  if (normalized === "PIX") return "pix";
  if (normalized === "BOLETO") return "boleto";
  if (normalized === "CREDIT_CARD") return "credit_card";
  return "asaas";
}

function parsePlatformBillingExternalReference(value: string | null | undefined): ParsedExternalReference | null {
  const parts = expandPlatformBillingReference(value ?? "").split(":");

  if (parts.length !== 5 || parts[0] !== "connectyhub_subscription") {
    return null;
  }

  const [, organizationId, subscriptionId, invoiceId, paymentId] = parts;

  if (![organizationId, subscriptionId, invoiceId, paymentId].every(isUuid)) {
    return null;
  }

  return { organizationId, subscriptionId, invoiceId, paymentId };
}

function mapPaymentStatus(providerStatus: string) {
  const normalizedStatus = normalizeProviderStatus(providerStatus);

  if (activePaymentStatuses.has(normalizedStatus)) return "approved";
  if (pendingPaymentStatuses.has(normalizedStatus)) return "pending";
  if (rejectedPaymentStatuses.has(normalizedStatus)) {
    if (normalizedStatus === "refunded" || normalizedStatus === "charged_back") return "refunded";
    if (normalizedStatus === "cancelled" || normalizedStatus === "canceled" || normalizedStatus === "expired" || normalizedStatus === "deleted" || normalizedStatus === "checkout_canceled" || normalizedStatus === "checkout_expired") return "canceled";
    return "rejected";
  }

  return "in_process";
}

function isActivePaymentStatus(providerStatus: string | null | undefined) {
  return activePaymentStatuses.has(normalizeProviderStatus(providerStatus));
}

function normalizeProviderStatus(providerStatus: string | null | undefined) {
  return providerStatus?.trim().toLowerCase() ?? "";
}

function readPagBankOrderAmount(order: PagBankOrderResponse) {
  const cents = order.charges?.[0]?.amount?.value
    ?? order.qr_codes?.[0]?.amount?.value
    ?? order.qr_code?.[0]?.amount?.value
    ?? null;

  return typeof cents === "number" && Number.isFinite(cents) ? Math.round(cents) / 100 : null;
}

function formatBillingPaymentProviderLabel(provider: BillingPaymentProvider) {
  if (provider === "asaas") return "Asaas";
  return provider === "pagbank" ? "PagBank" : "Mercado Pago";
}

function formatBillingPaymentProviderTag(provider: BillingPaymentProvider) {
  if (provider === "asaas") return "asaas";
  return provider === "pagbank" ? "pagbank" : "mercado_pago";
}

function mapInvoiceStatusFromPaymentStatus(paymentStatus: string) {
  if (paymentStatus === "approved") return "paid";
  if (paymentStatus === "pending") return "open";
  if (paymentStatus === "refunded") return "refunded";
  if (paymentStatus === "canceled") return "void";

  return "failed";
}

function buildBillingMessage(input: {
  eventType: string;
  customerName: string | null;
  planName: string;
  amountBrl: number;
  includedCredits: number;
  balanceCredits: number | null;
  usedCredits: number | null;
  milestoneCredits: number | null;
  trialDaysRemaining: number | null;
  providerStatus: string | null;
  checkoutUrl: string | null;
  metadata: JsonRecord;
  templates: unknown;
  templateOverride?: string | null;
}) {
  const templates = normalizePlatformBillingMessageTemplates(input.templates);
  const templateKey = getBillingMessageTemplateKey(input.eventType);
  const template = input.templateOverride?.trim() || templates[templateKey];
  const customerName = input.customerName?.trim() || "Cliente";
  const firstCustomerName = firstName(customerName) ?? "Tudo certo";

  const message = renderPlatformBillingMessageTemplate(template, {
    cliente: firstCustomerName,
    cliente_nome: customerName,
    plano: input.planName,
    valor: formatMoney(input.amountBrl),
    creditos: formatCredits(input.includedCredits),
    creditos_restantes: formatCredits(input.balanceCredits ?? 0),
    creditos_usados: formatCredits(input.usedCredits ?? 0),
    marco_creditos: formatCredits(input.milestoneCredits ?? input.usedCredits ?? 0),
    dias_restantes: input.trialDaysRemaining ?? "--",
    dias_atraso: toNumberLike(input.metadata.days_past_due ?? input.metadata.daysPastDue) ?? "--",
    dias_carencia: toNumberLike(input.metadata.grace_period_days ?? input.metadata.gracePeriodDays) ?? "--",
    data_vencimento: formatMetadataDate(input.metadata.period_ends_at)
      ?? formatMetadataDate(input.metadata.current_period_end)
      ?? formatMetadataDate(input.metadata.next_billing_at)
      ?? "data de vencimento",
    trial_expira_em: formatMetadataDate(input.metadata.trial_ends_at) ?? "fim do teste",
    data_expiracao_trial: formatMetadataDate(input.metadata.trial_ends_at) ?? "fim do teste",
    percentual_creditos: formatPercent(input.metadata.credit_balance_percent),
    evento: input.eventType,
    status: input.providerStatus ?? "sem_status",
    data: formatDate(new Date()),
    checkout_url: input.checkoutUrl ?? "acesse o painel",
    metodo_pagamento: readString(input.metadata.payment_method_label)
      ?? readString(input.metadata.payment_method)
      ?? "pagamento",
    adicionais: formatSelectedBumpTitles(input.metadata),
    plano_anterior: readString(input.metadata.previous_plan_name)
      ?? readString(input.metadata.previous_plan_code)
      ?? "anterior",
  });
  const discountNotice = ["subscription_pending", "checkout_cart_updated", "checkout_payment_started"].includes(input.eventType) ? planDiscountNotice(input.metadata) : "";
  return discountNotice ? `${message}\n\n${discountNotice}` : message;
}

function getBillingMessageTemplateKey(eventType: string): keyof PlatformBillingMessageTemplates {
  if (knownBillingMessageTemplateKeys.has(eventType)) {
    return eventType as keyof PlatformBillingMessageTemplates;
  }

  return "billing_update";
}

function formatSelectedBumpTitles(metadata: JsonRecord) {
  const explicitTitles = readStringList(metadata.selected_bump_titles);

  if (explicitTitles.length > 0) {
    return explicitTitles.join(", ");
  }

  const selectedBumps = readSelectedBumps(metadata)
    .map((bump) => readString(bump.title) ?? readString(bump.name))
    .filter((title): title is string => Boolean(title));

  return selectedBumps.length > 0 ? selectedBumps.join(", ") : "nenhum adicional";
}

function readSelectedBumpCreditAmount(metadata: JsonRecord | null | undefined) {
  return readSelectedBumps(metadata).reduce((total, bump) => {
    const rawCreditAmount = bump.credit_amount ?? bump.creditAmount;
    const creditAmount = typeof rawCreditAmount === "number" || typeof rawCreditAmount === "string"
      ? toNumber(rawCreditAmount)
      : 0;
    return total + (creditAmount > 0 ? creditAmount : 0);
  }, 0);
}

function readSelectedBumps(metadata: JsonRecord | null | undefined) {
  const value = metadata?.selected_bumps;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is JsonRecord => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}

function buildResult(input: Partial<PlatformBillingWebhookProcessingResult> & {
  processingStatus: PlatformBillingWebhookProcessingResult["processingStatus"];
}) {
  return {
    processingStatus: input.processingStatus,
    reason: input.reason ?? null,
    organizationId: input.organizationId ?? null,
    subscriptionId: input.subscriptionId ?? null,
    invoiceId: input.invoiceId ?? null,
    paymentId: input.paymentId ?? null,
    providerStatus: input.providerStatus ?? null,
    notificationId: input.notificationId ?? null,
    creditTransactionId: input.creditTransactionId ?? null,
    metadata: input.metadata ?? {},
  } satisfies PlatformBillingWebhookProcessingResult;
}

function sanitizePayment(payment: MercadoPagoPaymentLike): JsonRecord {
  return {
    id: payment.id ? String(payment.id) : null,
    status: payment.status ?? null,
    status_detail: payment.status_detail ?? null,
    external_reference: payment.external_reference ?? null,
    transaction_amount: payment.transaction_amount ?? null,
    date_approved: payment.date_approved ?? null,
    date_created: payment.date_created ?? null,
    payment_method_id: payment.payment_method_id ?? null,
  };
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePlanCode(value: unknown) {
  const text = readString(value)?.toLowerCase();
  return text && /^[a-z0-9_-]{2,60}$/.test(text) ? text : null;
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readOptionalRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readDate(value: unknown) {
  const string = readString(value);

  if (!string) return null;

  const date = new Date(string);
  return Number.isFinite(date.getTime()) ? date : null;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function toNumber(value: number | string | null | undefined) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function toNumberLike(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isUuid(value: string | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function normalizePhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";

  if (!digits) return null;
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits.length >= 10 ? digits : null;
}

function firstName(value: string | null) {
  const clean = value?.trim().replace(/\s+/g, " ");
  return clean ? clean.split(" ")[0] : null;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Math.max(value, 0));
}

function formatCredits(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: value < 10 ? 2 : 0,
  }).format(Math.max(value, 0));
}

function formatPercent(value: unknown) {
  const number = typeof value === "number" ? value : Number(value ?? 0);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: number < 10 ? 1 : 0,
  }).format(Math.max(number, 0));
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

function formatMetadataDate(value: unknown) {
  const text = readString(value);

  if (!text) {
    return null;
  }

  const date = new Date(text);

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return formatDate(date);
}

function preview(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readResponse(response: Response) {
  const text = await response.text().catch(() => "");

  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readProviderError(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return readString(record.message)
      ?? readString(record.error)
      ?? readString(record.error_description);
  }

  return null;
}

function readProviderMessageId(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return readString(record.id)
    ?? readString(record.messageId)
    ?? readString(record.message_id)
    ?? readString(record.key);
}

function sanitizeProviderData(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const text = JSON.stringify(value);
  if (text.length > 4000) {
    return { truncated: true, preview: text.slice(0, 4000) };
  }

  return value as JsonRecord;
}

export function paymentNotificationType(status: string) {
  if (["pending", "in_process", "processing", "unknown"].includes(status)) return "payment_pending";
  if (["canceled", "cancelled", "expired"].includes(status)) return "payment_canceled";
  if (status === "refunded") return "payment_refunded";
  return "payment_rejected";
}

export async function notifyNativeBillingOutcome(client: SupabaseClient, input: { intent: import("./plan-checkout").BillingCheckoutIntent; attemptId: string; status: string; amount: number }) {
  const { intent } = input;
  const eventType = paymentNotificationType(input.status);
  return enqueuePlatformBillingNotification(client, {
    organizationId: intent.subscription.organization_id, subscriptionId: intent.subscription.id, invoiceId: intent.invoice.id, paymentId: intent.payment.id,
    planCode: intent.targetPlanCode, planName: intent.plan.name, amountBrl: input.amount, includedCredits: Number(intent.plan.included_credits ?? 0),
    eventType, dedupeKey: `billing:native:${input.attemptId}:${eventType}`, providerStatus: input.status, providerReference: input.attemptId,
    metadata: { source: "dashboard_native_card", checkout_url: `${getAppBaseUrl()}/dashboard/planos/checkout/${intent.subscription.id}` },
  });
}

function buildProductBillingMessage(input: {eventType:string;planName:string;amountBrl:number;metadata:JsonRecord}, name:string) {
  const url = readString(input.metadata.checkout_public_url) ?? getAppBaseUrl()+"/dashboard/meus-produtos";
  if (input.eventType === "payment_approved") return name+", o pagamento de "+input.planName+" foi confirmado. Sua compra está em "+getAppBaseUrl()+"/dashboard/meus-produtos. Esta compra não altera a mensalidade do plano.";
  if (input.eventType === "payment_refunded") return "Registramos o reembolso de "+input.planName+". A equipe pode conferir os itens envolvidos com você.";
  if (["payment_rejected","payment_cancelled","payment_canceled"].includes(input.eventType)) return "O pagamento de "+input.planName+" não foi confirmado. Confira no seu banco; podemos orientar outra forma de pagamento após verificar a tentativa. "+url;
  if (input.eventType === "paid_plan_expired") return "O período de acesso de "+input.planName+" terminou. Para renovar este produto, acesse "+url+". Suas outras compras avulsas pagas continuam disponíveis.";
  const terms = readCommercialTerms(input.metadata.commercial_terms);
  return "Sua compra de "+input.planName+" ("+formatMoney(input.amountBrl)+") está aguardando pagamento. "+(terms.billingCycle === "one_time" ? "Pagamento único, sem renovação automática. " : "Renovação "+billingTermsLabel(terms).toLowerCase()+"; o Pix paga apenas este período. ")+url;
}
