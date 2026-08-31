import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomUUID } from "node:crypto";
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
  buildPagBankPlatformBillingWebhookUrl,
  createPagBankPixOrder,
  extractPagBankPixData,
  loadPagBankPlatformBillingConfig,
} from "@/lib/sales-catalog/pagbank";
import {
  formatBillingCheckoutDescription,
  isBillingCheckoutPayable,
  loadBillingCheckoutBumps,
  loadBillingCheckoutIntent,
  normalizeBillingCheckoutBumpCodesForCatalog,
  resolveBillingCheckoutProvider,
  syncBillingCheckoutCart,
} from "@/lib/billing/plan-checkout";
import {
  processPlatformBillingMercadoPagoWebhook,
  processPlatformBillingPagBankWebhook,
  sendPlatformPlanInteractionNotification,
} from "@/lib/billing/platform-billing-webhook";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;
type BillingPixProvider = "mercado_pago" | "pagbank";
type BillingCheckoutItem = {
  id: string;
  title: string;
  quantity: number;
  unitPrice: number;
  total: number;
};
type BillingPixData =
  | ReturnType<typeof extractMercadoPagoPixData>
  | ReturnType<typeof extractPagBankPixData>;

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
    const billingProvider = resolveBillingCheckoutProvider(intent);
    const cart = await syncBillingCheckoutCart(client, intent, selectedBumpCodes, availableBumps);
    await notifyPaymentStartedSafely(client, {
      organizationId: workspace.organization.id,
      actorId: workspace.user.id,
      subscriptionId: intent.subscription.id,
      invoiceId: intent.invoice.id,
      paymentId: intent.payment.id,
      planCode: intent.plan.plan_code,
      planName: intent.plan.name,
      amountBrl: cart.totalAmount,
      includedCredits: toNumber(intent.plan.included_credits),
      checkoutPath: cart.checkoutPath,
      checkoutUrl: cart.checkoutUrl,
      paymentMethod: "pix",
      paymentMethodLabel: "Pix",
      selectedBumpCodes: cart.selectedBumps.map((bump) => bump.code),
      selectedBumpTitles: cart.selectedBumps.map((bump) => bump.title),
    });
    const checkoutItems = [
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
    ];
    const paymentData = billingProvider === "pagbank"
      ? await createPagBankBillingPix({
          client,
          amount: cart.totalAmount,
          description: formatBillingCheckoutDescription(intent, cart.selectedBumps),
          externalReference: cart.externalReference,
          payerEmail,
          payerName: workspace.profile.fullName ?? workspace.organization.name,
          items: checkoutItems,
        })
      : await createMercadoPagoBillingPix({
          client,
          amount: cart.totalAmount,
          description: formatBillingCheckoutDescription(intent, cart.selectedBumps),
          externalReference: cart.externalReference,
          payerEmail,
          payerName: workspace.profile.fullName ?? workspace.organization.name,
          items: checkoutItems,
        });
    const providerPaymentId = readProviderPaymentId(paymentData);

    if (paymentData.status === "approved" && providerPaymentId) {
      const processor = billingProvider === "pagbank"
        ? processPlatformBillingPagBankWebhook
        : processPlatformBillingMercadoPagoWebhook;

      await processor(client, {
        dataId: providerPaymentId,
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
        provider: billingProvider,
        provider_payment_id: providerPaymentId,
        provider_status: paymentData.providerStatus ?? paymentData.status,
        status: normalizeBillingPaymentStatus(paymentData.status),
        payload: {
          ...(intent.payment.payload ?? {}),
          ...cart.metadata,
          billing_provider: billingProvider,
          provider_payment_id: providerPaymentId,
          provider_status: paymentData.providerStatus,
          pix_qr_code: paymentData.pixQrCode,
          pix_qr_code_base64: paymentData.pixQrCodeBase64,
          pix_ticket_url: paymentData.pixTicketUrl,
          ...buildBillingPixProviderPayload(billingProvider, paymentData),
        },
      })
      .eq("id", intent.payment.id)
      .eq("organization_id", intent.subscription.organization_id);

    return NextResponse.json({
      ok: true,
      status: paymentData.status,
      providerStatus: paymentData.providerStatus,
      providerStatusDetail: paymentData.providerStatusDetail,
      providerPaymentId,
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
  if (value === "cancelled" || value === "canceled" || value === "expired") return "canceled";
  if (value === "refunded") return "refunded";
  if (value === "pending") return "pending";
  return "in_process";
}

async function createPagBankBillingPix(input: {
  client: ReturnType<typeof createServiceClient>;
  amount: number;
  description: string;
  externalReference: string;
  payerEmail: string;
  payerName: string | null;
  items: BillingCheckoutItem[];
}) {
  const config = await loadPagBankPlatformBillingConfig({ client: input.client });
  const order = await createPagBankPixOrder({
    accessToken: config.accessToken,
    mode: config.mode,
    apiBaseUrl: config.apiBaseUrl,
    amount: input.amount,
    description: input.description,
    externalReference: input.externalReference,
    payerEmail: input.payerEmail,
    payerName: input.payerName,
    notificationUrl: config.webhookUrl || buildPagBankPlatformBillingWebhookUrl(),
    idempotencyKey: randomUUID(),
    pixExpirationMinutes: 1440,
    items: input.items,
  });

  return extractPagBankPixData(order.order);
}

async function createMercadoPagoBillingPix(input: {
  client: ReturnType<typeof createServiceClient>;
  amount: number;
  description: string;
  externalReference: string;
  payerEmail: string;
  payerName: string | null;
  items: BillingCheckoutItem[];
}) {
  const config = await loadMercadoPagoPlatformBillingConfig({ client: input.client });
  const additionalInfo = buildMercadoPagoAdditionalInfo({
    payerName: input.payerName,
    items: input.items,
  });
  const payment = await createMercadoPagoPixPayment({
    accessToken: config.accessToken,
    amount: input.amount,
    description: input.description,
    externalReference: input.externalReference,
    payerEmail: input.payerEmail,
    payerName: input.payerName,
    notificationUrl: buildMercadoPagoPlatformBillingWebhookUrl(),
    idempotencyKey: randomUUID(),
    additionalInfo,
  });

  return extractMercadoPagoPixData(payment.payment);
}

function readProviderPaymentId(paymentData: BillingPixData) {
  const providerOrderId = "providerOrderId" in paymentData ? paymentData.providerOrderId : null;

  return providerOrderId ?? paymentData.providerPaymentId;
}

function buildBillingPixProviderPayload(provider: BillingPixProvider, paymentData: BillingPixData): JsonRecord {
  if (provider === "pagbank") {
    const providerOrderId = "providerOrderId" in paymentData ? paymentData.providerOrderId : null;

    return {
      pagbank_order_id: providerOrderId,
      pagbank_charge_id: paymentData.providerPaymentId,
      pagbank_payment: {
        id: providerOrderId ?? paymentData.providerPaymentId,
        charge_id: paymentData.providerPaymentId,
        status: paymentData.providerStatus,
        status_detail: paymentData.providerStatusDetail,
      },
    };
  }

  return {
    mercado_pago_payment: {
      id: paymentData.providerPaymentId,
      status: paymentData.providerStatus,
      status_detail: paymentData.providerStatusDetail,
    },
  };
}

async function notifyPaymentStartedSafely(
  client: ReturnType<typeof createServiceClient>,
  input: {
    organizationId: string;
    actorId: string;
    subscriptionId: string;
    invoiceId: string;
    paymentId: string;
    planCode: string;
    planName: string;
    amountBrl: number;
    includedCredits: number;
    checkoutPath: string;
    checkoutUrl: string;
    paymentMethod: string;
    paymentMethodLabel: string;
    selectedBumpCodes: string[];
    selectedBumpTitles: string[];
  },
) {
  try {
    const hash = createHash("sha1")
      .update(`${input.paymentMethod}:${input.selectedBumpCodes.join("|") || "empty"}`)
      .digest("hex")
      .slice(0, 16);

    return await sendPlatformPlanInteractionNotification(client, {
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      invoiceId: input.invoiceId,
      paymentId: input.paymentId,
      planCode: input.planCode,
      planName: input.planName,
      amountBrl: input.amountBrl,
      includedCredits: input.includedCredits,
      eventType: "checkout_payment_started",
      dedupeKey: `billing:${input.subscriptionId}:payment_started:${hash}`,
      providerStatus: "payment_started",
      metadata: {
        source: "dashboard_billing_pix_payment_started",
        actor_id: input.actorId,
        checkout_url: input.checkoutPath,
        checkout_public_url: input.checkoutUrl,
        payment_method: input.paymentMethod,
        payment_method_label: input.paymentMethodLabel,
        selected_bump_codes: input.selectedBumpCodes,
        selected_bump_titles: input.selectedBumpTitles,
      },
    });
  } catch (error) {
    await client.from("maintenance_audit_logs").insert({
      event_type: "billing.plan_checkout.payment_started_notification_failed",
      target_table: "billing_payments",
      target_id: input.paymentId,
      metadata: {
        source: "dashboard_billing_pix_payment_started",
        actor_id: input.actorId,
        organization_id: input.organizationId,
        subscription_id: input.subscriptionId,
        plan_code: input.planCode,
        error: error instanceof Error ? error.message : "Falha ao disparar automacao de pagamento iniciado.",
      },
    });

    return null;
  }
}

function toNumber(value: number | string | null | undefined) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}
