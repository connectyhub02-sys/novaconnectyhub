import { convertAsaasBillingPaymentToPix } from "@/lib/sales-catalog/asaas-direct";
import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import {
  assertAccountComplete,
  formatAccountCompletionError,
  loadAccountDocument,
  statusForAccountCompletionError,
} from "@/lib/account/signup-completion";
import {
  createAsaasPixPayment,
  getAsaasPixQrCode,
  extractAsaasPaymentData,
  loadAsaasPlatformBillingConfig,
} from "@/lib/sales-catalog/asaas";
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
  processPlatformBillingAsaasWebhook,
  processPlatformBillingMercadoPagoWebhook,
  processPlatformBillingPagBankWebhook,
  sendPlatformPlanInteractionNotification,
} from "@/lib/billing/platform-billing-webhook";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;
type BillingPixProvider = "mercado_pago" | "pagbank" | "asaas";
type BillingCheckoutItem = {
  id: string;
  title: string;
  quantity: number;
  unitPrice: number;
  total: number;
};
type BillingPixData =
  | ReturnType<typeof extractAsaasPaymentData>
  | ReturnType<typeof extractMercadoPagoPixData>
  | ReturnType<typeof extractPagBankPixData>;
type AsaasBillingPixData = ReturnType<typeof extractAsaasPaymentData>;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ subscriptionId: string }> },
) {
  const { subscriptionId } = await context.params;
  const workspace = await getCurrentWorkspace({ allowRestricted: true });

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

  const intent = await loadBillingCheckoutIntent(client, {
    organizationId: workspace.organization.id,
    subscriptionId,
  });

  const availableBumps = await loadBillingCheckoutBumps(client, intent ?? undefined);
  const selectedBumpCodes = normalizeBillingCheckoutBumpCodesForCatalog(body.selectedBumpCodes, availableBumps);
  if (!intent) {
    return NextResponse.json({ error: "Checkout de plano nao encontrado." }, { status: 404 });
  }

  if (!isBillingCheckoutPayable(intent)) {
    return NextResponse.json({ error: "Este checkout nao esta aberto para pagamento." }, { status: 409 });
  }

  try {
    const billingProvider = resolveBillingCheckoutProvider(intent);
    const existingPix = intent.payment.payload?.pix_qr_code;
    if (billingProvider === "asaas" && existingPix && intent.payment.provider_payment_id && ["pending", "in_process"].includes(intent.payment.status) && !intent.payment.payload?.native_card_attempt_id) {
      return NextResponse.json({ ok: true, status: "pending", providerPaymentId: intent.payment.provider_payment_id, pixQrCode: existingPix, pixQrCodeBase64: intent.payment.payload?.pix_qr_code_base64 ?? null });
    }
    const cart = await syncBillingCheckoutCart(client, intent, selectedBumpCodes, availableBumps);
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
    const fallbackDocument = billingProvider === "asaas"
      ? await loadAccountDocument({ userId: workspace.user.id, client })
      : null;
    if (billingProvider === "asaas") {
      if (!fallbackDocument?.number) throw new Error("Informe CPF/CNPJ no cadastro antes de gerar o Pix.");
      const { error } = await client.rpc("claim_native_billing_pix", { p_org: workspace.organization.id, p_payment: intent.payment.id });
      if (error) return NextResponse.json({ error: "Existe um pagamento em conferência. Aguarde o resultado antes de trocar a forma de pagamento." }, { status: 409 });
    }
    const paymentData = billingProvider === "asaas"
      ? await createAsaasBillingPix({
          client,
          existingPaymentId: intent.payment.payload?.native_recurring_attempt_id ? intent.payment.provider_payment_id : null,
          expectedReference: intent.payment.payload?.native_recurring_attempt_id ? "billing_recurring:"+intent.payment.payload.native_recurring_attempt_id : null,
          amount: cart.totalAmount,
          description: formatBillingCheckoutDescription(intent, cart.selectedBumps),
          externalReference: cart.externalReference,
          payerEmail,
          payerName: workspace.profile.fullName ?? workspace.organization.name,
          payerDocument: fallbackDocument?.number ?? null,
          payerPhone: workspace.profile.phone,
          items: checkoutItems,
        })
      : billingProvider === "pagbank"
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
      const processor = billingProvider === "asaas"
        ? processPlatformBillingAsaasWebhook
        : billingProvider === "pagbank"
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

    const persisted = await client
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
          pix_creation_pending: false,
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

    if (persisted.error) throw new Error("Pix gerado e em conferência. Não tente gerar outra cobrança agora.");
    if (paymentData.status !== "approved") await notifyPaymentStartedSafely(client, {
      organizationId: intent.subscription.organization_id, actorId: workspace.user.id,
      subscriptionId: intent.subscription.id, invoiceId: intent.invoice.id, paymentId: intent.payment.id,
      planCode: intent.plan.plan_code, planName: intent.plan.name, amountBrl: cart.totalAmount,
      includedCredits: toNumber(intent.plan.included_credits), checkoutPath: cart.checkoutPath, checkoutUrl: cart.checkoutUrl,
      paymentMethod: "pix", paymentMethodLabel: "Pix", pixCode: paymentData.pixQrCode ?? null,
      selectedBumpCodes: cart.selectedBumps.map(b => b.code), selectedBumpTitles: cart.selectedBumps.map(b => b.title),
    });

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
  const lower = value.trim().toLowerCase();
  const upper = value.trim().toUpperCase();

  if (lower === "approved" || upper === "RECEIVED" || upper === "CONFIRMED" || upper === "RECEIVED_IN_CASH") return "approved";
  if (lower === "rejected" || upper === "PAYMENT_REFUSED" || upper === "FAILED" || upper === "REPROVED_BY_RISK_ANALYSIS") return "rejected";
  if (lower === "cancelled" || lower === "canceled" || lower === "expired" || upper === "DELETED" || upper === "CANCELLED" || upper === "CANCELED") return "canceled";
  if (lower === "refunded" || upper === "REFUNDED" || upper === "PARTIALLY_REFUNDED" || upper.includes("CHARGEBACK")) return "refunded";
  if (lower === "pending" || upper === "PENDING" || upper === "OVERDUE" || upper === "AWAITING_RISK_ANALYSIS") return "pending";
  return "in_process";
}

async function createAsaasBillingPix(input: {
  existingPaymentId?:string|null; expectedReference?:string|null;
  client: ReturnType<typeof createServiceClient>;
  amount: number;
  description: string;
  externalReference: string;
  payerEmail: string;
  payerName: string | null;
  payerDocument: string | null;
  payerPhone: string | null;
  items: BillingCheckoutItem[];
}) {
  if (!input.payerDocument) {
    throw new Error("Informe CPF ou CNPJ no cadastro da conta para gerar Pix pelo Asaas.");
  }

  const config = await loadAsaasPlatformBillingConfig({ client: input.client });
  if (input.existingPaymentId && input.expectedReference) {
    const existing=await convertAsaasBillingPaymentToPix({...config,paymentId:input.existingPaymentId,expectedReference:input.expectedReference,amount:input.amount});
    const qr=await getAsaasPixQrCode({...config,paymentId:input.existingPaymentId});
    return extractAsaasPaymentData(existing,qr);
  }
  const payment = await createAsaasPixPayment({
    accessToken: config.accessToken,
    mode: config.mode,
    apiBaseUrl: config.apiBaseUrl,
    amount: input.amount,
    description: input.description,
    externalReference: input.externalReference,
    payerEmail: input.payerEmail,
    payerName: input.payerName,
    payerDocument: input.payerDocument,
    payerPhone: input.payerPhone,
    dueDate: formatAsaasDueDate(addDays(new Date(), 1)),
    idempotencyKey: randomUUID(),
    items: input.items,
  });

  return extractAsaasPaymentData(payment.payment, payment.pixQrCode);
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
  if (provider === "asaas") {
    const asaasPaymentData = paymentData as AsaasBillingPixData;

    return {
      asaas_payment_id: asaasPaymentData.providerPaymentId,
      asaas_customer_id: asaasPaymentData.providerCustomerId,
      asaas_payment: {
        id: asaasPaymentData.providerPaymentId,
        customer_id: asaasPaymentData.providerCustomerId,
        status: asaasPaymentData.providerStatus,
        status_detail: asaasPaymentData.providerStatusDetail,
      },
    };
  }

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
    pixCode?: string | null;
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
      dedupeKey: `billing:${input.subscriptionId}:payment_started:${input.paymentId}:${hash}`,
      providerStatus: "payment_started",
      metadata: {
        source: "dashboard_billing_pix_payment_started",
        actor_id: input.actorId,
        checkout_url: input.checkoutPath,
        checkout_public_url: input.checkoutUrl,
        payment_method: input.paymentMethod,
        pix_copy_code: input.pixCode ?? null,
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

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatAsaasDueDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
