import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getMercadoPagoBillingSubscription,
  isMercadoPagoPreapprovalActive,
  mapMercadoPagoPreapprovalStatus,
  type MercadoPagoBillingSubscriptionDetails,
} from "@/lib/billing/mercado-pago-subscriptions";
import {
  normalizePlatformBillingMessageTemplates,
  renderPlatformBillingMessageTemplate,
  type PlatformBillingMessageTemplates,
} from "@/lib/billing/platform-billing-messages";
import { findPlatformAutomationForNotification } from "@/lib/automations/platform-automations";
import { grantCredits } from "@/lib/billing/cost-center";
import { getMercadoPagoPayment, loadMercadoPagoPlatformBillingConfig } from "@/lib/sales-catalog/mercado-pago";
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
  | "trial_no_credits";

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

const activePaymentStatuses = new Set(["approved", "authorized"]);
const pendingPaymentStatuses = new Set(["pending", "in_process", "in_mediation"]);
const rejectedPaymentStatuses = new Set(["rejected", "cancelled", "canceled", "charged_back", "refunded"]);

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
    providerSubscription,
    subscriptionStatus,
    source: "mercado_pago_subscription_webhook",
  });

  if (isMercadoPagoPreapprovalActive(providerStatus)) {
    return activateBillingPlan(client, record, {
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
    providerPayment,
    providerStatus,
    source: "mercado_pago_payment_webhook",
  });

  if (activePaymentStatuses.has(providerStatus)) {
    return activateBillingPlan(client, record, {
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

async function activateBillingPlan(
  client: SupabaseClient,
  record: BillingRecord,
  input: {
    providerStatus: string;
    providerSubscription: MercadoPagoBillingSubscriptionDetails | null;
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

  const plan = record.plan;
  const now = new Date();
  const cycleStart = readDate(input.providerPayment?.date_approved)
    ?? readDate(input.providerSubscription?.raw.date_created)
    ?? now;
  const cycleEnd = readDate(input.providerSubscription?.nextPaymentDate) ?? addMonths(cycleStart, 1);
  const includedCredits = toNumber(plan?.included_credits);
  const alreadyGranted = toNumber(subscription.included_credits_granted) > 0;
  const additionalBumpCredits = readSelectedBumpCreditAmount(subscription.metadata ?? record.payment?.payload ?? record.invoice?.metadata);
  const bumpCreditsAlreadyGranted = Boolean(readString(subscription.metadata?.bump_credit_transaction_id));
  const externalReference = input.providerSubscription?.externalReference
    ?? readString(input.providerPayment?.external_reference)
    ?? readString(subscription.metadata?.external_reference)
    ?? `connectyhub_subscription:${subscription.organization_id}:${subscription.id}`;
  let creditTransactionId: string | null = null;
  let bumpCreditTransactionId: string | null = null;

  if (!alreadyGranted && includedCredits > 0) {
    const { data, error } = await client.rpc("grant_billing_plan_credits", {
      p_organization_id: subscription.organization_id,
      p_plan_code: subscription.plan_code,
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
        plan_code: subscription.plan_code,
        selected_bumps: readSelectedBumps(subscription.metadata ?? record.payment?.payload ?? record.invoice?.metadata),
      },
      transactionType: "purchase",
    });
  }

  const metadata = {
    ...(subscription.metadata ?? {}),
    last_billing_activation_source: input.source,
    provider_status: input.providerStatus,
    provider_payment_id: input.providerPayment?.id ? String(input.providerPayment.id) : null,
    provider_subscription_id: input.providerSubscription?.id ?? subscription.provider_subscription_id,
    payment_confirmed_at: input.providerPayment?.date_approved ?? new Date().toISOString(),
    included_credits: includedCredits,
    additional_bump_credits: additionalBumpCredits,
    credit_transaction_id: creditTransactionId,
    bump_credit_transaction_id: bumpCreditTransactionId ?? readString(subscription.metadata?.bump_credit_transaction_id),
    mercado_pago_subscription: input.providerSubscription?.raw ?? null,
    mercado_pago_payment: input.providerPayment ? sanitizePayment(input.providerPayment) : null,
  };

  const [subscriptionUpdate, invoiceUpdate, paymentUpdate] = await Promise.all([
    client
      .from("organization_subscriptions")
      .update({
        status: "active",
        provider_subscription_id: input.providerSubscription?.id ?? subscription.provider_subscription_id,
        current_period_start: cycleStart.toISOString(),
        current_period_end: cycleEnd.toISOString(),
        next_billing_at: cycleEnd.toISOString(),
        included_credits_granted: alreadyGranted ? subscription.included_credits_granted : includedCredits,
        metadata,
      })
      .eq("id", subscription.id)
      .eq("organization_id", subscription.organization_id),
    record.invoice
      ? client
          .from("billing_invoices")
          .update({
            status: "paid",
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
    planCode: subscription.plan_code,
    planName: plan?.name ?? subscription.plan_code,
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
    summary: `Plano ${subscription.plan_code} ativado por webhook Mercado Pago.`,
    confidence: 1,
    visibility: "platform",
    tags: ["billing", "mercado_pago", "subscription"],
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
    providerSubscription: MercadoPagoBillingSubscriptionDetails;
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
        mercado_pago_subscription: input.providerSubscription.raw,
      },
    })
    .eq("id", record.subscription.id)
    .eq("organization_id", record.subscription.organization_id);
}

async function updatePaymentProviderState(
  client: SupabaseClient,
  record: BillingRecord,
  input: {
    providerPayment: MercadoPagoPaymentLike;
    providerStatus: string;
    source: string;
  },
) {
  const paymentStatus = mapPaymentStatus(input.providerStatus);
  const paidAt = activePaymentStatuses.has(input.providerStatus)
    ? input.providerPayment.date_approved ?? new Date().toISOString()
    : null;
  const paymentId = input.providerPayment.id ? String(input.providerPayment.id) : null;
  const metadata = {
    last_provider_sync_source: input.source,
    provider_status: input.providerStatus,
    provider_payment_id: paymentId,
    mercado_pago_payment: sanitizePayment(input.providerPayment),
  };

  await Promise.all([
    record.payment
      ? client
          .from("billing_payments")
          .update({
            status: paymentStatus,
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
            status: paymentStatus === "approved" ? "paid" : paymentStatus === "pending" ? "open" : "failed",
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

  if (error) throw new Error(`Nao foi possivel carregar assinatura Mercado Pago: ${error.message}`);
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

export async function processPendingPlatformBillingNotifications(
  client: SupabaseClient,
  input: { limit?: number } = {},
) {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
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
    sent,
    skipped,
  };
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
    const [credentials, instance] = await Promise.all([
      loadUazapiCredentials(client),
      loadBillingAgentWhatsappInstance(client, input.agentId),
    ]);

    if (!instance?.instance_token_encrypted || instance.status !== "connected") {
      throw new Error("WhatsApp do agente de cobranca nao esta conectado.");
    }

    const token = decryptCredentialValue(instance.instance_token_encrypted);
    const providerResponse = await callUazapi(credentials, "/send/text", {
      method: "POST",
      token,
      body: {
        number: input.phone,
        text: input.message,
        linkPreview: false,
        track_source: "connectyhub",
        track_id: `billing_notice_${input.eventId}_${Date.now()}`,
      },
    });
    const { data: currentEvent } = await client
      .from("billing_notification_events")
      .select("metadata")
      .eq("id", input.eventId)
      .maybeSingle<{ metadata: JsonRecord | null }>();

    await Promise.all([
      client
        .from("billing_notification_events")
        .update({
          status: "sent",
          attempts: nextAttempts,
          sent_at: new Date().toISOString(),
          provider_message_id: readProviderMessageId(providerResponse.data),
          metadata: {
            ...(currentEvent?.metadata ?? {}),
            provider_response: sanitizeProviderData(providerResponse.data),
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
  if (activePaymentStatuses.has(providerStatus)) return "approved";
  if (pendingPaymentStatuses.has(providerStatus)) return "pending";
  if (rejectedPaymentStatuses.has(providerStatus)) {
    if (providerStatus === "refunded" || providerStatus === "charged_back") return "refunded";
    if (providerStatus === "cancelled" || providerStatus === "canceled") return "canceled";
    return "rejected";
  }

  return "in_process";
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
    evento: input.eventType,
    status: input.providerStatus ?? "sem_status",
    data: formatDate(new Date()),
  });
}

function getBillingMessageTemplateKey(eventType: string): keyof PlatformBillingMessageTemplates {
  if (
    eventType === "billing_operational_test"
    || eventType === "subscription_pending"
    || eventType === "trial_started"
    || eventType === "trial_credit_milestone"
    || eventType === "trial_no_credits"
    || eventType === "payment_pending"
    || eventType === "payment_approved"
    || eventType === "payment_rejected"
    || eventType === "subscription_paused"
    || eventType === "subscription_canceled"
  ) {
    return eventType;
  }

  return "billing_update";
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

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function preview(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
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
