import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import {
  assertAccountComplete,
  formatAccountCompletionError,
  statusForAccountCompletionError,
} from "@/lib/account/signup-completion";
import {
  buildMercadoPagoAdditionalInfo,
  buildMercadoPagoPlatformBillingWebhookUrl,
  createMercadoPagoPixPayment,
  extractMercadoPagoPixData,
  loadMercadoPagoPlatformBillingConfig,
} from "@/lib/sales-catalog/mercado-pago";
import {
  formatBillingCheckoutDescription,
  isBillingCheckoutPayable,
  loadBillingCheckoutBumps,
  loadBillingCheckoutIntent,
  normalizeBillingCheckoutBumpCodesForCatalog,
  syncBillingCheckoutCart,
} from "@/lib/billing/plan-checkout";
import { processPlatformBillingMercadoPagoWebhook } from "@/lib/billing/platform-billing-webhook";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ subscriptionId: string }> },
) {
  const { subscriptionId } = await context.params;
  const workspace = await getCurrentWorkspace();

  if (!workspace?.organization) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const client = createServiceClient();

  try {
    await assertAccountComplete({ userId: workspace.user.id, client });
  } catch (error) {
    return NextResponse.json(formatAccountCompletionError(error), {
      status: statusForAccountCompletionError(error, 422),
    });
  }

  const body = readRecord(await request.json().catch(() => null));
  const payerEmail = normalizeEmail(workspace.profile.email ?? workspace.user.email ?? null);

  if (!payerEmail) {
    return NextResponse.json({ error: "Informe um e-mail valido no cadastro para pagar com Pix." }, { status: 422 });
  }

  const availableBumps = await loadBillingCheckoutBumps(client);
  const selectedBumpCodes = normalizeBillingCheckoutBumpCodesForCatalog(body.selectedBumpCodes, availableBumps);
  const intent = await loadBillingCheckoutIntent(client, {
    organizationId: workspace.organization.id,
    subscriptionId,
  });

  if (!intent) {
    return NextResponse.json({ error: "Checkout de plano nao encontrado." }, { status: 404 });
  }

  if (!isBillingCheckoutPayable(intent)) {
    return NextResponse.json({ error: "Este checkout nao esta aberto para pagamento." }, { status: 409 });
  }

  try {
    const cart = await syncBillingCheckoutCart(client, intent, selectedBumpCodes, availableBumps);
    const config = await loadMercadoPagoPlatformBillingConfig({ client });
    const additionalInfo = buildMercadoPagoAdditionalInfo({
      payerName: workspace.profile.fullName ?? workspace.organization.name,
      items: [
        {
          id: intent.plan.plan_code,
          title: `Plano ${intent.plan.name}`,
          quantity: 1,
          unitPrice: cart.planAmount,
          total: cart.planAmount,
        },
        ...cart.selectedBumps.map((bump) => ({
          id: bump.code,
          title: bump.title,
          quantity: 1,
          unitPrice: bump.priceBrl,
          total: bump.priceBrl,
        })),
      ],
    });
    const payment = await createMercadoPagoPixPayment({
      accessToken: config.accessToken,
      amount: cart.totalAmount,
      description: formatBillingCheckoutDescription(intent, cart.selectedBumps),
      externalReference: cart.externalReference,
      payerEmail,
      payerName: workspace.profile.fullName ?? workspace.organization.name,
      notificationUrl: buildMercadoPagoPlatformBillingWebhookUrl(),
      idempotencyKey: randomUUID(),
      additionalInfo,
    });
    const paymentData = extractMercadoPagoPixData(payment.payment);

    if (paymentData.providerPaymentId) {
      await processPlatformBillingMercadoPagoWebhook(client, {
        dataId: paymentData.providerPaymentId,
        eventType: "payment",
        action: "payment.created",
        providerEventId: null,
        requestId: null,
        payload: {
          source: "dashboard_billing_pix_checkout",
          subscription_id: intent.subscription.id,
          invoice_id: intent.invoice.id,
          payment_id: intent.payment.id,
        },
      });
    }

    await client
      .from("billing_payments")
      .update({
        provider_payment_id: paymentData.providerPaymentId,
        provider_status: paymentData.providerStatus,
        status: normalizeBillingPaymentStatus(paymentData.status),
        payload: {
          ...(intent.payment.payload ?? {}),
          ...cart.metadata,
          provider_payment_id: paymentData.providerPaymentId,
          provider_status: paymentData.providerStatus,
          pix_qr_code: paymentData.pixQrCode,
          pix_qr_code_base64: paymentData.pixQrCodeBase64,
          pix_ticket_url: paymentData.pixTicketUrl,
          mercado_pago_payment: {
            id: paymentData.providerPaymentId,
            status: paymentData.providerStatus,
            status_detail: paymentData.providerStatusDetail,
          },
        },
      })
      .eq("id", intent.payment.id)
      .eq("organization_id", intent.subscription.organization_id);

    return NextResponse.json({
      ok: true,
      status: paymentData.status,
      providerStatus: paymentData.providerStatus,
      providerStatusDetail: paymentData.providerStatusDetail,
      pixQrCode: paymentData.pixQrCode,
      pixQrCodeBase64: paymentData.pixQrCodeBase64,
      pixTicketUrl: paymentData.pixTicketUrl,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel gerar o Pix.",
    }, { status: 400 });
  }
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function normalizeEmail(value: string | null) {
  const email = value?.trim().toLowerCase();

  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizeBillingPaymentStatus(value: string) {
  if (value === "approved") return "approved";
  if (value === "rejected") return "rejected";
  if (value === "cancelled") return "canceled";
  if (value === "refunded") return "refunded";
  if (value === "pending") return "pending";
  return "in_process";
}
