import "server-only";

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
import { grantCredits } from "@/lib/billing/cost-center";
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

type WhatsappInstanceRow = {
  id: string;
  status: string | null;
  phone_number: string | null;
  display_name: string | null;
  instance_token_encrypted: string | null;
  metadata: JsonRecord | null;
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
): Promise<PlatformBillingWebhookProcessingResult> {
  if (isAsaasCheckoutTopic(input)) {
    return processAsaasCheckoutWebhook(client, input);
  }

  if (isAsaasSubscriptionTopic(input)) {
    return processAsaasSubscriptionWebhook(client, input);
  }

  if (isAsaasPaymentTopic(input)) {
    return processAsaasPaymentWebhook(client, input);
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
  const notification = await enqueuePlatformBillingNotification(client, {
    organizationId: input.organizationId,
    subscriptionId: input.subscriptionId,
    invoiceId: input.invoiceId,
    paymentId: input.paymentId,
    planCode: input.planCode,
    planName: input.planName,
    amountBrl: input.amountBrl,
    includedCredits: input.includedCredits,
    eventType: "subscription_pending",
    dedupeKey: input.dedupeKey ?? `billing:${input.subscriptionId}:subscription:pending`,
    providerStatus: input.providerStatus ?? "pending",
    providerReference: input.providerReference ?? null,
    metadata: {
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

  if (isMercadoPagoPreapprovalActive(providerStatus)) {
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
    eventType: subscriptionStatus === "paused"
      ? "subscription_paused"
      : subscriptionStatus === "canceled"
        ? "subscription_canceled"
        : "subscription_pending",
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
        eventType: paymentStatus === "pending" ? "payment_pending" : "payment_rejected",
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
        eventType: paymentStatus === "pending" ? "payment_pending" : "payment_rejected",
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

async function processAsaasPaymentWebhook(client: SupabaseClient, input: BillingWebhookInput) {
  const payloadPayment = readAsaasPaymentPayload(input);
  let rawPayment: JsonRecord | null = payloadPayment;
  let providerPayment = normalizeAsaasPaymentLike(payloadPayment ?? {}, input.dataId);

  if (!providerPayment.id || !providerPayment.status || !providerPayment.external_reference) {
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
        eventType: paymentStatus === "pending" ? "payment_pending" : "payment_rejected",
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
        eventType: paymentStatus === "pending" ? "payment_pending" : "payment_rejected",
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
    eventType: subscriptionStatus === "canceled" ? "subscription_canceled" : "subscription_pending",
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
  const cycleStart = readDate(paymentPayload?.cycle_start_at)
    ?? readDate(invoiceMetadata?.cycle_start_at)
    ?? readDate(input.providerPayment?.date_approved)
    ?? readDate(input.providerSubscription?.raw.date_created)
    ?? readDate(input.providerSubscription?.raw.dateCreated)
    ?? now;
  const cycleEnd = readDate(paymentPayload?.cycle_end_at)
    ?? readDate(invoiceMetadata?.cycle_end_at)
    ?? readDate(input.providerSubscription?.nextPaymentDate)
    ?? addMonths(cycleStart, 1);
  const includedCredits = toNumber(plan?.included_credits);
  const previousCreditTransactionId = readString(paymentPayload?.credit_transaction_id)
    ?? readString(invoiceMetadata?.credit_transaction_id);
  const previousBumpCreditTransactionId = readString(paymentPayload?.bump_credit_transaction_id)
    ?? readString(invoiceMetadata?.bump_credit_transaction_id);
  const alreadyGranted = Boolean(previousCreditTransactionId);
  const additionalBumpCredits = readSelectedBumpCreditAmount(paymentPayload ?? invoiceMetadata);
  const bumpCreditsAlreadyGranted = Boolean(previousBumpCreditTransactionId);
  const externalReference = input.providerSubscription?.externalReference
    ?? readString(input.providerPayment?.external_reference)
    ?? readString(paymentPayload?.external_reference)
    ?? readString(invoiceMetadata?.external_reference)
    ?? readString(subscriptionMetadata.external_reference)
    ?? `connectyhub_subscription:${subscription.organization_id}:${subscription.id}`;
  let creditTransactionId: string | null = previousCreditTransactionId;
  let bumpCreditTransactionId: string | null = previousBumpCreditTransactionId;

  if (!alreadyGranted && includedCredits > 0) {
    const { data, error } = await client.rpc("grant_billing_plan_credits", {
      p_organization_id: subscription.organization_id,
      p_plan_code: activatedPlanCode,
      p_cycle_start: cycleStart.toISOString(),
      p_cycle_end: cycleEnd.toISOString(),
      p_external_reference: externalReference,
    });

    if (error) {
      throw new Error(`Pagamento aprovado, mas os creditos nao foram concedidos: ${error.message}`);
    }

    creditTransactionId = data ? String(data) : null;
  }

  if (!bumpCreditsAlreadyGranted && additionalBumpCredits > 0) {
    bumpCreditTransactionId = await grantCredits(client, {
      organizationId: subscription.organization_id,
      amountCredits: additionalBumpCredits,
      description: "Creditos extras comprados no checkout do plano",
      externalReference: `${externalReference}:order_bumps`,
      metadata: {
        source: "dashboard_plan_checkout_bump",
        subscription_id: subscription.id,
        plan_code: activatedPlanCode,
        selected_bumps: readSelectedBumps(paymentPayload ?? invoiceMetadata),
      },
      transactionType: "purchase",
    });
  }

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
    credit_transaction_id: creditTransactionId,
    bump_credit_transaction_id: bumpCreditTransactionId,
    mercado_pago_subscription: input.provider === "mercado_pago" ? input.providerSubscription?.raw ?? null : null,
    mercado_pago_payment: input.provider === "mercado_pago" ? providerPaymentSnapshot : null,
    pagbank_payment: input.provider === "pagbank" ? providerPaymentSnapshot : null,
    asaas_subscription: input.provider === "asaas" ? input.providerSubscription?.raw ?? null : null,
    asaas_payment: input.provider === "asaas" ? providerPaymentSnapshot : null,
  };

  const [subscriptionUpdate, invoiceUpdate, paymentUpdate] = await Promise.all([
    client
      .from("organization_subscriptions")
      .update({
        status: "active",
        plan_id: plan.id,
        plan_code: activatedPlanCode,
        billing_provider: input.provider,
        provider_subscription_id: input.providerSubscription?.id ?? subscription.provider_subscription_id,
        current_period_start: cycleStart.toISOString(),
        current_period_end: cycleEnd.toISOString(),
        next_billing_at: cycleEnd.toISOString(),
        included_credits_granted: includedCredits,
        metadata,
      })
      .eq("id", subscription.id)
      .eq("organization_id", subscription.organization_id),
    record.invoice
      ? client
          .from("billing_invoices")
          .update({
            status: "paid",
            provider: input.provider,
            paid_at: input.providerPayment?.date_approved ?? new Date().toISOString(),
            provider_payment_id: input.providerPayment?.id ? String(input.providerPayment.id) : record.invoice.id,
            metadata,
          })
          .eq("id", record.invoice.id)
          .eq("organization_id", subscription.organization_id)
      : Promise.resolve({ error: null }),
    record.payment
      ? client
          .from("billing_payments")
          .update({
            status: "approved",
            provider: input.provider,
            provider_payment_id: input.providerPayment?.id ? String(input.providerPayment.id) : record.payment.provider_payment_id,
            provider_status: input.providerStatus,
            paid_at: input.providerPayment?.date_approved ?? new Date().toISOString(),
            payload: metadata,
          })
          .eq("id", record.payment.id)
          .eq("organization_id", subscription.organization_id)
      : Promise.resolve({ error: null }),
  ]);

  if (subscriptionUpdate.error || invoiceUpdate.error || paymentUpdate.error) {
    throw new Error(
      subscriptionUpdate.error?.message
      ?? invoiceUpdate.error?.message
      ?? paymentUpdate.error?.message
      ?? "Nao foi possivel ativar o plano.",
    );
  }

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
      status: input.subscriptionStatus,
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
  const paymentStatus = mapPaymentStatus(input.providerStatus);
  const paidAt = isActivePaymentStatus(input.providerStatus)
    ? input.providerPayment.date_approved ?? new Date().toISOString()
    : null;
  const paymentId = input.providerPayment.id ? String(input.providerPayment.id) : null;
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

  await Promise.all([
    record.payment
      ? client
          .from("billing_payments")
          .update({
            status: paymentStatus,
            provider: input.provider,
            provider_payment_id: paymentId ?? record.payment.provider_payment_id,
            provider_status: input.providerStatus,
            paid_at: paidAt,
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
            paid_at: paidAt,
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
  const message = buildBillingMessage({
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
    : !selectedAgentId
      ? "Agente de cobrança nao configurado."
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
      automation_flow_id: automation?.id ?? null,
      automation_flow_key: automation?.flowKey ?? null,
      automation_flow_name: automation?.name ?? null,
      automation_delay_minutes: delayMinutes,
      message_body: message,
      provider_status: input.providerStatus,
      provider_reference: input.providerReference,
      plan_code: input.planCode,
      amount_brl: input.amountBrl,
      included_credits: input.includedCredits,
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

  if (!event || initialError || !selectedAgentId || !recipientPhone || delayMinutes > 0) {
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

    if (!insert.data?.id || responsibleInitialError || !input.selectedAgentId || input.delayMinutes > 0) {
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
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const enqueuedPendingCheckouts = await enqueueMissingPendingCheckoutNotifications(client, {
    limit: Math.min(limit, 25),
  });
  const { data, error } = await client
    .from("billing_notification_events")
    .select("id, selected_agent_id, recipient_phone, message_preview, attempts, metadata")
    .eq("status", "pending")
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

    if (!message || !agentId || !phone) {
      skipped += 1;
      await client
        .from("billing_notification_events")
        .update({
          status: "skipped",
          error_message: "Automacao pendente sem agente, telefone ou mensagem.",
        })
        .eq("id", row.id);
      continue;
    }

    await sendBillingNotificationNow(client, {
      eventId: row.id,
      agentId,
      phone,
      message,
      attempts: toNumber(row.attempts),
    });
    sent += 1;
  }

  return {
    checked: rows.length,
    enqueuedPendingCheckouts,
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
    agentId: string;
    phone: string;
    message: string;
    attempts?: number;
  },
) {
  const nextAttempts = Math.max(0, input.attempts ?? 0) + 1;

  try {
    const [credentials, instance, currentEvent] = await Promise.all([
      loadUazapiCredentials(client),
      loadBillingAgentWhatsappInstance(client, input.agentId),
      loadBillingNotificationDeliveryContext(client, input.eventId),
    ]);

    if (!instance?.instance_token_encrypted || instance.status !== "connected") {
      throw new Error("WhatsApp do agente de cobranca nao esta conectado.");
    }

    const token = decryptCredentialValue(instance.instance_token_encrypted);
    const button = buildCheckoutActionButton({
      eventType: currentEvent?.event_type ?? null,
      metadata: currentEvent?.metadata ?? null,
    });
    const sendResult = await sendBillingWhatsappNotice({
      credentials,
      token,
      phone: input.phone,
      message: input.message,
      button,
      trackId: `billing_notice_${input.eventId}_${Date.now()}`,
    });

    await Promise.all([
      client
        .from("billing_notification_events")
        .update({
          status: "sent",
          attempts: nextAttempts,
          sent_at: new Date().toISOString(),
          provider_message_id: readProviderMessageId(sendResult.providerResponse.data),
          metadata: {
            ...(currentEvent?.metadata ?? {}),
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
  } catch (error) {
    await client
      .from("billing_notification_events")
      .update({
        status: "failed",
        attempts: nextAttempts,
        error_message: error instanceof Error ? error.message : "Falha ao enviar WhatsApp de billing.",
      })
      .eq("id", input.eventId);
  }
}

type BillingCheckoutActionButton = {
  label: string;
  url: string;
};

type BillingWhatsappNoticeResult = {
  providerResponse: Awaited<ReturnType<typeof callUazapi>>;
  deliveryMode: "button" | "text" | "text_fallback";
  message: string;
  button: BillingCheckoutActionButton | null;
  fallbackError: string | null;
};

async function loadBillingNotificationDeliveryContext(client: SupabaseClient, eventId: string) {
  const { data, error } = await client
    .from("billing_notification_events")
    .select("event_type, subscription_id, metadata")
    .eq("id", eventId)
    .maybeSingle<{
      event_type: string | null;
      subscription_id: string | null;
      metadata: JsonRecord | null;
    }>();

  if (error) {
    throw new Error(`Nao foi possivel carregar contexto da notificacao: ${error.message}`);
  }

  return data ?? null;
}

async function sendBillingWhatsappNotice(input: {
  credentials: UazapiCredentials;
  token: string;
  phone: string;
  message: string;
  button: BillingCheckoutActionButton | null;
  trackId: string;
}): Promise<BillingWhatsappNoticeResult> {
  if (input.button) {
    const buttonMessage = buildCheckoutButtonMessage(input.message, input.button.url);

    try {
      const providerResponse = await callUazapi(input.credentials, "/send/menu", {
        method: "POST",
        token: input.token,
        body: {
          number: input.phone,
          type: "button",
          text: buttonMessage,
          choices: [`${input.button.label}|${input.button.url}`],
          footerText: "ConnectyHub",
          readchat: true,
          readmessages: true,
          track_source: "connectyhub",
          track_id: input.trackId,
        },
      });

      return {
        providerResponse,
        deliveryMode: "button",
        message: buttonMessage,
        button: input.button,
        fallbackError: null,
      };
    } catch (error) {
      const fallbackError = error instanceof Error ? error.message : "Falha ao enviar botao WhatsApp.";
      const providerResponse = await callUazapi(input.credentials, "/send/text", {
        method: "POST",
        token: input.token,
        body: {
          number: input.phone,
          text: input.message,
          linkPreview: false,
          track_source: "connectyhub",
          track_id: `${input.trackId}_fallback`,
        },
      });

      return {
        providerResponse,
        deliveryMode: "text_fallback",
        message: input.message,
        button: input.button,
        fallbackError,
      };
    }
  }

  const providerResponse = await callUazapi(input.credentials, "/send/text", {
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
    label: resolveCheckoutActionLabel(input.eventType),
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

async function loadBillingAgentWhatsappInstance(client: SupabaseClient, agentId: string) {
  const { data, error } = await client
    .from("whatsapp_instances")
    .select("id, status, phone_number, display_name, instance_token_encrypted, metadata")
    .contains("metadata", { agent_id: agentId, admin_whatsapp: true, platform_whatsapp: true })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<WhatsappInstanceRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar WhatsApp do agente de cobranca: ${error.message}`);
  }

  return data ?? null;
}

async function callUazapi(
  credentials: UazapiCredentials,
  path: string,
  options: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    token?: string;
  },
) {
  const response = await fetch(`${credentials.baseUrl}${path}`, {
    method: options.method,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { token: options.token } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const data = await readResponse(response);

  if (!response.ok) {
    throw new Error(readProviderError(data) ?? `Uazapi respondeu status ${response.status}.`);
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
  const status = readString(record.status) ?? fallback.fallbackStatus ?? "PENDING";
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
  const parts = value?.split(":") ?? [];

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
    if (normalizedStatus === "refunded" || normalizedStatus === "charged_back" || normalizedStatus === "partially_refunded") return "refunded";
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

  return renderPlatformBillingMessageTemplate(template, {
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
