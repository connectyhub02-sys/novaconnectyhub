import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  processPlatformBillingAsaasWebhook,
  processPlatformBillingMercadoPagoWebhook,
  processPlatformBillingPagBankWebhook,
} from "@/lib/billing/platform-billing-webhook";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type ReconcileTarget = {
  subscriptionId: string;
  organizationId: string;
  provider: "mercado_pago" | "pagbank" | "asaas";
  providerReferenceId: string;
  eventType: string;
};

type SubscriptionTargetRow = {
  id: string;
  organization_id: string;
  billing_provider: string | null;
  provider_subscription_id: string | null;
  metadata: JsonRecord | null;
};

type PaymentTargetRow = {
  id: string;
  subscription_id: string | null;
  provider: string | null;
  provider_payment_id: string | null;
  payload: JsonRecord | null;
};

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = readRecord(await request.json().catch(() => null));
  const subscriptionId = readUuid(body?.subscriptionId);
  const paymentId = readUuid(body?.paymentId);

  if (!subscriptionId && !paymentId) {
    return NextResponse.json({ error: "Informe uma assinatura ou pagamento para sincronizar." }, { status: 400 });
  }

  const client = createServiceClient();

  try {
    const target = await resolveReconcileTarget(client, { subscriptionId, paymentId });

    if (!target) {
      return NextResponse.json({ error: "Registro de billing nao encontrado para reconciliacao." }, { status: 404 });
    }

    const processor = target.provider === "asaas"
      ? processPlatformBillingAsaasWebhook
      : target.provider === "pagbank"
      ? processPlatformBillingPagBankWebhook
      : processPlatformBillingMercadoPagoWebhook;
    const result = await processor(client, {
      dataId: target.providerReferenceId,
      eventType: target.eventType,
      action: "admin.manual_reconcile",
      providerEventId: null,
      requestId: `admin-reconcile-${Date.now()}`,
      payload: {
        source: "admin_manual_reconcile",
        actor_id: auth.userId,
        subscription_id: target.subscriptionId,
        payment_id: paymentId,
      },
    });

    await client.from("maintenance_audit_logs").insert({
      actor_id: auth.userId,
      event_type: "billing.platform_reconcile.subscription",
      target_table: "organization_subscriptions",
      target_id: target.subscriptionId,
      metadata: {
        organizationId: target.organizationId,
        provider: target.provider,
        providerReferenceId: target.providerReferenceId,
        paymentId,
        processingStatus: result.processingStatus,
        providerStatus: result.providerStatus,
        reason: result.reason,
        notificationId: result.notificationId,
        creditTransactionId: result.creditTransactionId,
      },
    });

    revalidatePath("/admin/financeiro");
    revalidatePath("/dashboard/planos");

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel sincronizar provedor de billing." },
      { status: 502 },
    );
  }
}

async function resolveReconcileTarget(
  client: SupabaseClient,
  input: {
    subscriptionId: string | null;
    paymentId: string | null;
  },
): Promise<ReconcileTarget | null> {
  if (input.subscriptionId) {
    const payment = input.paymentId ? await loadPaymentTarget(client, input.paymentId) : null;

    return loadSubscriptionTarget(client, input.subscriptionId, payment);
  }

  if (!input.paymentId) {
    return null;
  }

  const payment = await loadPaymentTarget(client, input.paymentId);

  if (!payment) {
    return null;
  }

  if (payment.subscription_id) {
    return loadSubscriptionTarget(client, payment.subscription_id, payment);
  }

  throw new Error("Pagamento sem assinatura vinculada para consultar o provedor.");
}

async function loadPaymentTarget(client: SupabaseClient, paymentId: string) {
  const { data: payment, error } = await client
    .from("billing_payments")
    .select("id, subscription_id, provider, provider_payment_id, payload")
    .eq("id", paymentId)
    .maybeSingle<PaymentTargetRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar pagamento: ${error.message}`);
  }

  return payment ?? null;
}

async function loadSubscriptionTarget(
  client: SupabaseClient,
  subscriptionId: string,
  payment?: PaymentTargetRow | null,
): Promise<ReconcileTarget | null> {
  const { data, error } = await client
    .from("organization_subscriptions")
    .select("id, organization_id, billing_provider, provider_subscription_id, metadata")
    .eq("id", subscriptionId)
    .maybeSingle<SubscriptionTargetRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar assinatura: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const provider = normalizeBillingProvider(payment?.provider ?? data.billing_provider);
  const asaasCheckoutId = readString(payment?.payload?.asaas_checkout_id)
    ?? readString(data.metadata?.asaas_checkout_id);
  const asaasPaymentId = readString(payment?.payload?.asaas_payment_id)
    ?? (
      provider === "asaas" && payment?.provider_payment_id && payment.provider_payment_id !== asaasCheckoutId
        ? payment.provider_payment_id
        : null
    )
    ?? readString(data.metadata?.asaas_payment_id);
  const providerReferenceId = provider === "asaas"
    ? asaasPaymentId
      ?? asaasCheckoutId
      ?? data.provider_subscription_id
      ?? readString(data.metadata?.asaas_subscription_id)
    : provider === "pagbank"
      ? readString(payment?.payload?.pagbank_order_id)
        ?? readString(payment?.payload?.provider_order_id)
        ?? payment?.provider_payment_id
        ?? readString(data.metadata?.pagbank_order_id)
        ?? readString(data.metadata?.provider_order_id)
      : data.provider_subscription_id;

  if (!providerReferenceId) {
    throw new Error(provider === "asaas"
      ? "Pagamento sem payment_id, checkout_id ou subscription_id Asaas para reconciliar."
      : provider === "pagbank"
        ? "Pagamento sem order_id PagBank para reconciliar."
        : "Assinatura sem provider_subscription_id do Mercado Pago.");
  }

  return {
    subscriptionId: data.id,
    organizationId: data.organization_id,
    provider,
    providerReferenceId,
    eventType: provider === "asaas"
      ? asaasPaymentId
        ? "PAYMENT_UPDATED"
        : asaasCheckoutId
          ? "CHECKOUT_CREATED"
          : "SUBSCRIPTION_UPDATED"
      : provider === "pagbank"
        ? "payment"
        : "subscription_preapproval",
  };
}

function normalizeBillingProvider(value: string | null | undefined): ReconcileTarget["provider"] {
  if (value === "mercado_pago" || value === "pagbank" || value === "asaas") return value;
  return "asaas";
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readUuid(value: unknown) {
  const text = readString(value);

  return text && isUuid(text)
    ? text
    : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
