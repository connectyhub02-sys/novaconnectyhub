import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  isBillingCheckoutPayable,
  loadBillingCheckoutIntent,
  readBillingCheckoutPixData,
  type BillingCheckoutIntent,
} from "@/lib/billing/plan-checkout";
import { processPlatformBillingMercadoPagoWebhook } from "@/lib/billing/platform-billing-webhook";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ subscriptionId: string }> },
) {
  const { subscriptionId } = await context.params;
  const workspace = await getCurrentWorkspace();

  if (!workspace?.organization) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const client = createServiceClient();

  try {
    let intent = await loadBillingCheckoutIntent(client, {
      organizationId: workspace.organization.id,
      subscriptionId,
    });

    if (!intent) {
      return NextResponse.json({ error: "Checkout de plano nao encontrado." }, { status: 404 });
    }

    const providerPaymentId = readProviderPaymentId(intent);
    let reconciliation: {
      processingStatus: string;
      providerStatus: string | null;
      reason: string | null;
    } | null = null;

    if (providerPaymentId && shouldReconcileProviderPayment(intent)) {
      const result = await processPlatformBillingMercadoPagoWebhook(client, {
        dataId: providerPaymentId,
        eventType: "payment",
        action: "dashboard.status_poll",
        providerEventId: null,
        requestId: `dashboard-status-${Date.now()}`,
        payload: {
          source: "dashboard_billing_checkout_status",
          subscription_id: intent.subscription.id,
          invoice_id: intent.invoice.id,
          payment_id: intent.payment.id,
        },
      });

      reconciliation = {
        processingStatus: result.processingStatus,
        providerStatus: result.providerStatus,
        reason: result.reason,
      };

      intent = await loadBillingCheckoutIntent(client, {
        organizationId: workspace.organization.id,
        subscriptionId,
      });

      if (!intent) {
        return NextResponse.json({ error: "Checkout de plano nao encontrado apos conciliacao." }, { status: 404 });
      }
    }

    if (isCheckoutConfirmed(intent)) {
      revalidatePath(`/dashboard/planos/checkout/${subscriptionId}`);
      revalidatePath("/dashboard/planos");
    }

    return NextResponse.json({
      ok: true,
      subscriptionStatus: intent.subscription.status,
      invoiceStatus: intent.invoice.status,
      paymentStatus: intent.payment.status,
      providerStatus: intent.payment.provider_status,
      providerPaymentId: readProviderPaymentId(intent),
      payable: isBillingCheckoutPayable(intent),
      confirmed: isCheckoutConfirmed(intent),
      reconciliation,
      ...readBillingCheckoutPixData(intent),
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel consultar o status do checkout.",
    }, { status: 502 });
  }
}

function shouldReconcileProviderPayment(intent: BillingCheckoutIntent) {
  if (isCheckoutConfirmed(intent)) return false;

  return isBillingCheckoutPayable(intent)
    || ["pending", "in_process", "rejected"].includes(intent.payment.status)
    || ["pending", "in_process", "approved", "authorized"].includes(intent.payment.provider_status ?? "");
}

function isCheckoutConfirmed(intent: BillingCheckoutIntent) {
  return intent.subscription.status === "active"
    || intent.invoice.status === "paid"
    || intent.payment.status === "approved";
}

function readProviderPaymentId(intent: BillingCheckoutIntent) {
  return intent.payment.provider_payment_id
    ?? readString(intent.payment.payload?.provider_payment_id)
    ?? readString(intent.invoice.metadata?.provider_payment_id)
    ?? readString(intent.subscription.metadata?.provider_payment_id);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
