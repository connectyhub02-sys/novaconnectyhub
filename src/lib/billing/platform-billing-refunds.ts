import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reverseCreditsForRefund } from "@/lib/billing/cost-center";
import { cancelMercadoPagoBillingSubscription } from "@/lib/billing/mercado-pago-subscriptions";
import {
  createMercadoPagoPaymentRefund,
  getMercadoPagoPayment,
  loadMercadoPagoPlatformBillingConfig,
  normalizeCurrencyAmount,
} from "@/lib/sales-catalog/mercado-pago";

type JsonRecord = Record<string, unknown>;

type PaymentRow = {
  id: string;
  organization_id: string;
  invoice_id: string | null;
  subscription_id: string | null;
  provider: string;
  provider_payment_id: string | null;
  provider_status: string | null;
  status: string;
  amount_brl: number | string | null;
  paid_at: string | null;
  payload: JsonRecord | null;
};

type SubscriptionRow = {
  id: string;
  organization_id: string;
  plan_id: string | null;
  plan_code: string;
  status: string;
  provider_subscription_id: string | null;
  included_credits_granted: number | string | null;
  metadata: JsonRecord | null;
};

type InvoiceRow = {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  status: string;
  total_brl: number | string | null;
  paid_at: string | null;
  provider_payment_id: string | null;
  metadata: JsonRecord | null;
};

type PlanRow = {
  plan_code: string;
  name: string;
  included_credits: number | string | null;
};

type BillingRefundRow = {
  id: string;
  status: string;
  provider_refund_id: string | null;
};

type MercadoPagoPaymentLike = {
  id?: string | number;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  refunds?: unknown;
};

type MercadoPagoRefundLike = {
  id?: string | number;
  status?: string;
  amount?: number;
  payment_id?: string | number;
  date_created?: string;
};

export type PlatformBillingRefundResult = {
  refundId: string;
  providerRefundId: string | null;
  paymentId: string;
  subscriptionId: string | null;
  organizationId: string;
  amountBrl: number;
  status: string;
  providerPaymentStatus: string | null;
  reversedCredits: number;
  uncoveredCredits: number;
  creditTransactionId: string | null;
  providerSubscriptionCanceled: boolean;
  providerSubscriptionCancelError: string | null;
};

export async function refundPlatformBillingPayment(
  client: SupabaseClient,
  input: {
    paymentId: string;
    actorId: string;
    reason?: string | null;
    amountBrl?: number | null;
  },
): Promise<PlatformBillingRefundResult> {
  const payment = await loadPayment(client, input.paymentId);

  if (!payment) {
    throw new Error("Pagamento nao encontrado para estorno.");
  }

  if (payment.provider !== "mercado_pago") {
    throw new Error("Este pagamento nao foi processado pelo Mercado Pago.");
  }

  if (!payment.provider_payment_id) {
    throw new Error("Pagamento sem ID do Mercado Pago para estorno.");
  }

  if (payment.status === "refunded") {
    throw new Error("Este pagamento ja esta marcado como estornado.");
  }

  if (!isApprovedPayment(payment.status, payment.provider_status)) {
    throw new Error("Somente pagamentos aprovados podem ser estornados por aqui.");
  }

  const amountBrl = normalizeCurrencyAmount(input.amountBrl) ?? normalizeCurrencyAmount(payment.amount_brl) ?? 0;
  const paymentAmount = normalizeCurrencyAmount(payment.amount_brl) ?? 0;

  if (amountBrl <= 0 || paymentAmount <= 0) {
    throw new Error("Valor do pagamento invalido para estorno.");
  }

  if (Math.abs(amountBrl - paymentAmount) > 0.009) {
    throw new Error("Nesta etapa, o painel faz somente estorno total do pagamento.");
  }

  const existingRefund = await loadProcessedRefund(client, payment.id);

  if (existingRefund) {
    throw new Error(`Este pagamento ja tem estorno registrado (${existingRefund.status}).`);
  }

  const [subscription, invoice] = await Promise.all([
    payment.subscription_id ? loadSubscription(client, payment.subscription_id) : Promise.resolve(null),
    payment.invoice_id ? loadInvoice(client, payment.invoice_id) : Promise.resolve(null),
  ]);
  const plan = subscription ? await loadPlan(client, subscription.plan_code) : null;
  const refundId = await createPendingRefund(client, {
    payment,
    subscription,
    invoice,
    amountBrl,
    actorId: input.actorId,
    reason: input.reason ?? null,
  });

  try {
    const config = await loadMercadoPagoPlatformBillingConfig({ client });
    const refund = await createMercadoPagoPaymentRefund({
      accessToken: config.accessToken,
      paymentId: payment.provider_payment_id,
      idempotencyKey: refundId,
    }) as MercadoPagoRefundLike;
    const providerPayment = await getMercadoPagoPayment({
      accessToken: config.accessToken,
      paymentId: payment.provider_payment_id,
    }).catch(() => null) as MercadoPagoPaymentLike | null;
    const providerPaymentStatus = readString(providerPayment?.status) ?? "refunded";
    const creditsToReverse = calculateRefundedCredits({ subscription, invoice, payment, plan });
    const creditReversal = creditsToReverse > 0
      ? await reverseCreditsForRefund(client, {
          organizationId: payment.organization_id,
          amountCredits: creditsToReverse,
          description: "Estorno de pagamento do plano ConnectyHub",
          externalReference: `billing_refund:${refundId}`,
          metadata: {
            source: "platform_billing_refund",
            refund_id: refundId,
            payment_id: payment.id,
            subscription_id: subscription?.id ?? null,
            invoice_id: invoice?.id ?? null,
            provider_payment_id: payment.provider_payment_id,
            plan_code: subscription?.plan_code ?? null,
            amount_brl: amountBrl,
          },
        })
      : { transactionId: null, reversedCredits: 0, uncoveredCredits: 0, balanceAfterCredits: 0 };
    const subscriptionCancel = subscription?.provider_subscription_id
      ? await cancelProviderSubscription(client, subscription.provider_subscription_id)
      : { canceled: false, error: null, raw: null };
    const metadata = buildRefundMetadata({
      refundId,
      actorId: input.actorId,
      reason: input.reason ?? null,
      amountBrl,
      payment,
      subscription,
      invoice,
      plan,
      providerPayment,
      refund,
      creditsToReverse,
      creditReversal,
      subscriptionCancel,
    });
    const providerRefundId = refund.id ? String(refund.id) : null;
    const refundStatus = readString(refund.status) ?? "processed";

    await updateInternalBillingState(client, {
      refundId,
      payment,
      subscription,
      invoice,
      providerRefundId,
      refundStatus,
      providerPaymentStatus,
      amountBrl,
      metadata,
      creditTransactionId: creditReversal.transactionId,
      reversedCredits: creditReversal.reversedCredits,
      uncoveredCredits: creditReversal.uncoveredCredits,
    });

    await logRefundEvent(client, {
      actorId: input.actorId,
      refundId,
      payment,
      subscription,
      invoice,
      providerRefundId,
      providerPaymentStatus,
      amountBrl,
      metadata,
    });

    return {
      refundId,
      providerRefundId,
      paymentId: payment.id,
      subscriptionId: subscription?.id ?? null,
      organizationId: payment.organization_id,
      amountBrl,
      status: "refunded",
      providerPaymentStatus,
      reversedCredits: creditReversal.reversedCredits,
      uncoveredCredits: creditReversal.uncoveredCredits,
      creditTransactionId: creditReversal.transactionId,
      providerSubscriptionCanceled: subscriptionCancel.canceled,
      providerSubscriptionCancelError: subscriptionCancel.error,
    };
  } catch (error) {
    await client
      .from("billing_refunds")
      .update({
        status: "failed",
        metadata: {
          source: "platform_billing_refund",
          failed_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message : "Falha desconhecida no estorno.",
        },
      })
      .eq("id", refundId);

    throw error;
  }
}

async function loadPayment(client: SupabaseClient, paymentId: string) {
  const { data, error } = await client
    .from("billing_payments")
    .select("id, organization_id, invoice_id, subscription_id, provider, provider_payment_id, provider_status, status, amount_brl, paid_at, payload")
    .eq("id", paymentId)
    .maybeSingle<PaymentRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar pagamento: ${error.message}`);
  }

  return data ?? null;
}

async function loadSubscription(client: SupabaseClient, subscriptionId: string) {
  const { data, error } = await client
    .from("organization_subscriptions")
    .select("id, organization_id, plan_id, plan_code, status, provider_subscription_id, included_credits_granted, metadata")
    .eq("id", subscriptionId)
    .maybeSingle<SubscriptionRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar assinatura: ${error.message}`);
  }

  return data ?? null;
}

async function loadInvoice(client: SupabaseClient, invoiceId: string) {
  const { data, error } = await client
    .from("billing_invoices")
    .select("id, organization_id, subscription_id, status, total_brl, paid_at, provider_payment_id, metadata")
    .eq("id", invoiceId)
    .maybeSingle<InvoiceRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar fatura: ${error.message}`);
  }

  return data ?? null;
}

async function loadPlan(client: SupabaseClient, planCode: string) {
  const { data, error } = await client
    .from("billing_plans")
    .select("plan_code, name, included_credits")
    .eq("plan_code", planCode)
    .maybeSingle<PlanRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar plano: ${error.message}`);
  }

  return data ?? null;
}

async function loadProcessedRefund(client: SupabaseClient, paymentId: string) {
  const { data, error } = await client
    .from("billing_refunds")
    .select("id, status, provider_refund_id")
    .eq("payment_id", paymentId)
    .in("status", ["approved", "processed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<BillingRefundRow>();

  if (error) {
    throw new Error(`Nao foi possivel checar estornos existentes: ${error.message}`);
  }

  return data ?? null;
}

async function createPendingRefund(
  client: SupabaseClient,
  input: {
    payment: PaymentRow;
    subscription: SubscriptionRow | null;
    invoice: InvoiceRow | null;
    amountBrl: number;
    actorId: string;
    reason: string | null;
  },
) {
  const { data, error } = await client
    .from("billing_refunds")
    .insert({
      organization_id: input.payment.organization_id,
      subscription_id: input.subscription?.id ?? input.payment.subscription_id,
      invoice_id: input.invoice?.id ?? input.payment.invoice_id,
      payment_id: input.payment.id,
      provider: input.payment.provider,
      provider_payment_id: input.payment.provider_payment_id,
      status: "pending",
      refund_type: "full",
      amount_brl: input.amountBrl,
      requested_by: input.actorId,
      reason: input.reason,
      metadata: {
        source: "admin_financeiro",
        payment_status_before_refund: input.payment.status,
        provider_status_before_refund: input.payment.provider_status,
        subscription_status_before_refund: input.subscription?.status ?? null,
      },
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data?.id) {
    throw new Error(`Nao foi possivel registrar estorno antes de chamar o Mercado Pago: ${error?.message ?? "sem ID retornado"}`);
  }

  return data.id;
}

async function cancelProviderSubscription(client: SupabaseClient, providerSubscriptionId: string) {
  try {
    const canceled = await cancelMercadoPagoBillingSubscription({
      client,
      subscriptionId: providerSubscriptionId,
      idempotencyKey: randomUUID(),
    });

    return { canceled: true, error: null, raw: canceled.raw };
  } catch (error) {
    return {
      canceled: false,
      error: error instanceof Error ? error.message : "Nao foi possivel cancelar a recorrencia no Mercado Pago.",
      raw: null,
    };
  }
}

function calculateRefundedCredits(input: {
  subscription: SubscriptionRow | null;
  invoice: InvoiceRow | null;
  payment: PaymentRow;
  plan: PlanRow | null;
}) {
  const grantedPlanCredits = toNumber(input.subscription?.included_credits_granted);
  const fallbackPlanCredits = toNumber(input.plan?.included_credits);
  const includedCredits = grantedPlanCredits > 0 ? grantedPlanCredits : fallbackPlanCredits;
  const bumpCredits =
    readSelectedBumpCreditAmount(input.subscription?.metadata)
    || readSelectedBumpCreditAmount(input.payment.payload)
    || readSelectedBumpCreditAmount(input.invoice?.metadata);

  return Math.max(includedCredits + bumpCredits, 0);
}

function buildRefundMetadata(input: {
  refundId: string;
  actorId: string;
  reason: string | null;
  amountBrl: number;
  payment: PaymentRow;
  subscription: SubscriptionRow | null;
  invoice: InvoiceRow | null;
  plan: PlanRow | null;
  providerPayment: MercadoPagoPaymentLike | null;
  refund: MercadoPagoRefundLike;
  creditsToReverse: number;
  creditReversal: {
    transactionId: string | null;
    reversedCredits: number;
    uncoveredCredits: number;
    balanceAfterCredits: number;
  };
  subscriptionCancel: {
    canceled: boolean;
    error: string | null;
    raw: JsonRecord | null;
  };
}) {
  return {
    source: "platform_billing_refund",
    refund_id: input.refundId,
    refunded_at: new Date().toISOString(),
    refunded_by: input.actorId,
    refund_reason: input.reason,
    amount_brl: input.amountBrl,
    payment_id: input.payment.id,
    invoice_id: input.invoice?.id ?? input.payment.invoice_id,
    subscription_id: input.subscription?.id ?? input.payment.subscription_id,
    plan_code: input.subscription?.plan_code ?? null,
    plan_name: input.plan?.name ?? null,
    provider_payment_id: input.payment.provider_payment_id,
    provider_refund_id: input.refund.id ? String(input.refund.id) : null,
    provider_refund_status: input.refund.status ?? null,
    provider_payment_status: input.providerPayment?.status ?? null,
    credits_requested_to_reverse: input.creditsToReverse,
    reversed_credits: input.creditReversal.reversedCredits,
    uncovered_credits: input.creditReversal.uncoveredCredits,
    credit_reversal_transaction_id: input.creditReversal.transactionId,
    provider_subscription_canceled: input.subscriptionCancel.canceled,
    provider_subscription_cancel_error: input.subscriptionCancel.error,
    mercado_pago_payment: input.providerPayment ?? null,
    mercado_pago_refund: input.refund,
    mercado_pago_subscription_cancel: input.subscriptionCancel.raw,
  };
}

async function updateInternalBillingState(
  client: SupabaseClient,
  input: {
    refundId: string;
    payment: PaymentRow;
    subscription: SubscriptionRow | null;
    invoice: InvoiceRow | null;
    providerRefundId: string | null;
    refundStatus: string;
    providerPaymentStatus: string | null;
    amountBrl: number;
    metadata: JsonRecord;
    creditTransactionId: string | null;
    reversedCredits: number;
    uncoveredCredits: number;
  },
) {
  const now = new Date().toISOString();
  const [refundUpdate, paymentUpdate, invoiceUpdate, subscriptionUpdate, cyclesUpdate, organizationUpdate] = await Promise.all([
    client
      .from("billing_refunds")
      .update({
        provider_refund_id: input.providerRefundId,
        status: normalizeRefundStatus(input.refundStatus),
        credit_reversal_transaction_id: input.creditTransactionId,
        reversed_credits: input.reversedCredits,
        uncovered_credits: input.uncoveredCredits,
        provider_response: input.metadata.mercado_pago_refund ?? {},
        metadata: input.metadata,
      })
      .eq("id", input.refundId),
    client
      .from("billing_payments")
      .update({
        status: "refunded",
        provider_status: input.providerPaymentStatus ?? "refunded",
        payload: {
          ...(input.payment.payload ?? {}),
          ...input.metadata,
        },
      })
      .eq("id", input.payment.id)
      .eq("organization_id", input.payment.organization_id),
    input.invoice
      ? client
          .from("billing_invoices")
          .update({
            status: "refunded",
            metadata: {
              ...(input.invoice.metadata ?? {}),
              ...input.metadata,
            },
          })
          .eq("id", input.invoice.id)
          .eq("organization_id", input.invoice.organization_id)
      : Promise.resolve({ error: null }),
    input.subscription
      ? client
          .from("organization_subscriptions")
          .update({
            status: "canceled",
            canceled_at: now,
            included_credits_granted: 0,
            metadata: {
              ...(input.subscription.metadata ?? {}),
              ...input.metadata,
              previous_subscription_status: input.subscription.status,
              previous_included_credits_granted: input.subscription.included_credits_granted,
            },
          })
          .eq("id", input.subscription.id)
          .eq("organization_id", input.subscription.organization_id)
      : Promise.resolve({ error: null }),
    input.subscription
      ? client
          .from("billing_cycles")
          .update({
            status: "void",
            metadata: input.metadata,
          })
          .eq("subscription_id", input.subscription.id)
          .eq("organization_id", input.subscription.organization_id)
          .eq("status", "open")
      : Promise.resolve({ error: null }),
    client
      .from("organizations")
      .update({ status: "canceled" })
      .eq("id", input.payment.organization_id),
  ]);

  const error = refundUpdate.error
    ?? paymentUpdate.error
    ?? invoiceUpdate.error
    ?? subscriptionUpdate.error
    ?? cyclesUpdate.error
    ?? organizationUpdate.error;

  if (error) {
    throw new Error(`Mercado Pago estornou, mas falhou atualizar registros internos: ${error.message}`);
  }
}

async function logRefundEvent(
  client: SupabaseClient,
  input: {
    actorId: string;
    refundId: string;
    payment: PaymentRow;
    subscription: SubscriptionRow | null;
    invoice: InvoiceRow | null;
    providerRefundId: string | null;
    providerPaymentStatus: string | null;
    amountBrl: number;
    metadata: JsonRecord;
  },
) {
  await client.from("maintenance_audit_logs").insert({
    actor_id: input.actorId,
    event_type: "billing.platform_refund.payment",
    target_table: "billing_payments",
    target_id: input.payment.id,
    metadata: {
      refundId: input.refundId,
      providerRefundId: input.providerRefundId,
      providerPaymentStatus: input.providerPaymentStatus,
      organizationId: input.payment.organization_id,
      subscriptionId: input.subscription?.id ?? null,
      invoiceId: input.invoice?.id ?? null,
      amountBrl: input.amountBrl,
      ...input.metadata,
    },
  });
}

function isApprovedPayment(status: string | null | undefined, providerStatus: string | null | undefined) {
  return status === "approved" || providerStatus === "approved" || providerStatus === "authorized";
}

function normalizeRefundStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();

  if (normalized === "approved") return "approved";
  if (normalized === "cancelled" || normalized === "canceled") return "canceled";
  if (normalized === "failed" || normalized === "rejected") return "failed";

  return "processed";
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

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
