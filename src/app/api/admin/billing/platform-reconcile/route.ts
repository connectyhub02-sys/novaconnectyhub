import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processPlatformBillingMercadoPagoWebhook } from "@/lib/billing/platform-billing-webhook";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type ReconcileTarget = {
  subscriptionId: string;
  organizationId: string;
  providerSubscriptionId: string;
};

type SubscriptionTargetRow = {
  id: string;
  organization_id: string;
  provider_subscription_id: string | null;
};

type PaymentTargetRow = {
  id: string;
  subscription_id: string | null;
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

    const result = await processPlatformBillingMercadoPagoWebhook(client, {
      dataId: target.providerSubscriptionId,
      eventType: "subscription_preapproval",
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
        providerSubscriptionId: target.providerSubscriptionId,
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
      { error: error instanceof Error ? error.message : "Nao foi possivel sincronizar Mercado Pago." },
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
    return loadSubscriptionTarget(client, input.subscriptionId);
  }

  if (!input.paymentId) {
    return null;
  }

  const { data: payment, error } = await client
    .from("billing_payments")
    .select("id, subscription_id")
    .eq("id", input.paymentId)
    .maybeSingle<PaymentTargetRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar pagamento: ${error.message}`);
  }

  if (!payment) {
    return null;
  }

  if (payment.subscription_id) {
    return loadSubscriptionTarget(client, payment.subscription_id);
  }

  throw new Error("Pagamento sem assinatura vinculada para consultar no Mercado Pago.");
}

async function loadSubscriptionTarget(client: SupabaseClient, subscriptionId: string): Promise<ReconcileTarget | null> {
  const { data, error } = await client
    .from("organization_subscriptions")
    .select("id, organization_id, provider_subscription_id")
    .eq("id", subscriptionId)
    .maybeSingle<SubscriptionTargetRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar assinatura: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  if (!data.provider_subscription_id) {
    throw new Error("Assinatura sem provider_subscription_id do Mercado Pago.");
  }

  return {
    subscriptionId: data.id,
    organizationId: data.organization_id,
    providerSubscriptionId: data.provider_subscription_id,
  };
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readUuid(value: unknown) {
  const text = readString(value);

  return text && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}
