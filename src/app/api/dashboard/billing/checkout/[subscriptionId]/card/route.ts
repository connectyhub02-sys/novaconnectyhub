import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import {
  assertAccountComplete,
  formatAccountCompletionError,
  loadAccountCpfNumber,
  statusForAccountCompletionError,
} from "@/lib/account/signup-completion";
import {
  buildMercadoPagoAdditionalInfo,
  buildMercadoPagoPlatformBillingWebhookUrl,
  createMercadoPagoCardPayment,
  extractMercadoPagoPixData,
  loadMercadoPagoPlatformBillingConfig,
  normalizeCurrencyAmount,
} from "@/lib/sales-catalog/mercado-pago";
import {
  formatBillingCheckoutDescription,
  isBillingCheckoutPayable,
  loadBillingCheckoutBumps,
  loadBillingCheckoutIntent,
  normalizeBillingCheckoutBumpCodesForCatalog,
  syncBillingCheckoutCart,
} from "@/lib/billing/plan-checkout";
import {
  processPlatformBillingMercadoPagoWebhook,
  sendPlatformPlanInteractionNotification,
} from "@/lib/billing/platform-billing-webhook";
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
  const formData = readRecord(body.formData) ?? body;
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

  const token = readString(formData.token);
  const paymentMethodId = readString(formData.payment_method_id);
  const installments = normalizeInstallments(formData.installments);
  const payer = readRecord(formData.payer);
  const payerIdentification = readRecord(payer?.identification);
  const payerEmail = normalizeEmail(readString(payer?.email) ?? intent.subscription.payer_email ?? workspace.profile.email);
  const fallbackCpfNumber = await loadAccountCpfNumber({ userId: workspace.user.id, client });
  const deviceSessionId = readString(body.deviceSessionId)
    ?? readString(request.headers.get("x-meli-session-id"));
  const frontendAmount = normalizeCurrencyAmount(readString(formData.transaction_amount) ?? readNumber(formData.transaction_amount));

  if (!token || !paymentMethodId || !payerEmail) {
    return NextResponse.json({ error: "Dados de cartao incompletos." }, { status: 400 });
  }

  try {
    const cart = await syncBillingCheckoutCart(client, intent, selectedBumpCodes, availableBumps);

    if (frontendAmount && Math.abs(frontendAmount - cart.totalAmount) > 0.009) {
      return NextResponse.json({ error: "Valor recebido nao confere com o carrinho." }, { status: 400 });
    }

    const payerName = workspace.profile.fullName ?? workspace.organization.name;
    const payerPhone = workspace.profile.phone;
    const payerIdentificationType = readString(payerIdentification?.type) ?? (fallbackCpfNumber ? "CPF" : null);
    const payerIdentificationNumber = readString(payerIdentification?.number) ?? fallbackCpfNumber;

    await recordPaymentAttemptContextSafely(client, {
      paymentId: intent.payment.id,
      organizationId: workspace.organization.id,
      currentPayload: intent.payment.payload,
      cartMetadata: cart.metadata,
      deviceSessionSent: Boolean(deviceSessionId),
      payerPhoneSent: Boolean(payerPhone),
      payerIdentificationSent: Boolean(payerIdentificationNumber),
      selectedBumpCodes: cart.selectedBumps.map((bump) => bump.code),
    });

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
      paymentMethod: "card",
      paymentMethodLabel: "cartao",
      selectedBumpCodes: cart.selectedBumps.map((bump) => bump.code),
      selectedBumpTitles: cart.selectedBumps.map((bump) => bump.title),
    });

    const config = await loadMercadoPagoPlatformBillingConfig({ client });
    const additionalInfo = buildMercadoPagoAdditionalInfo({
      payerName,
      payerPhone,
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
    const payment = await createMercadoPagoCardPayment({
      accessToken: config.accessToken,
      amount: cart.totalAmount,
      description: formatBillingCheckoutDescription(intent, cart.selectedBumps),
      externalReference: cart.externalReference,
      payerEmail,
      token,
      paymentMethodId,
      installments,
      issuerId: readString(formData.issuer_id) ?? readNumber(formData.issuer_id),
      payerName,
      payerPhone,
      payerDocument: payerIdentificationNumber,
      payerIdentification: {
        type: payerIdentificationType,
        number: payerIdentificationNumber,
      },
      notificationUrl: buildMercadoPagoPlatformBillingWebhookUrl(),
      idempotencyKey: randomUUID(),
      deviceSessionId,
      additionalInfo,
    });
    const paymentData = extractMercadoPagoPixData(payment.payment);

    if (paymentData.providerPaymentId) {
      await processPlatformBillingMercadoPagoWebhook(client, {
        dataId: paymentData.providerPaymentId,
        eventType: "payment",
        action: "payment.updated",
        providerEventId: null,
        requestId: null,
        payload: {
          source: "dashboard_billing_card_checkout",
          subscription_id: intent.subscription.id,
          invoice_id: intent.invoice.id,
          payment_id: intent.payment.id,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      status: paymentData.status,
      providerStatus: paymentData.providerStatus,
      providerStatusDetail: paymentData.providerStatusDetail,
      providerPaymentId: paymentData.providerPaymentId,
      threeDSChallenge: paymentData.threeDSChallenge,
      deviceSessionSent: Boolean(deviceSessionId),
      checkoutUrl: cart.checkoutPath,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel processar o cartao.",
    }, { status: 400 });
  }
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeInstallments(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? "1"), 10);

  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 36) : 1;
}

function normalizeEmail(value: string | null) {
  const email = value?.trim().toLowerCase();

  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
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
        source: "dashboard_billing_card_payment_started",
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
        source: "dashboard_billing_card_payment_started",
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

async function recordPaymentAttemptContextSafely(
  client: ReturnType<typeof createServiceClient>,
  input: {
    paymentId: string;
    organizationId: string;
    currentPayload: JsonRecord | null;
    cartMetadata: JsonRecord;
    deviceSessionSent: boolean;
    payerPhoneSent: boolean;
    payerIdentificationSent: boolean;
    selectedBumpCodes: string[];
  },
) {
  const updateResult = await client
    .from("billing_payments")
    .update({
      payload: {
        ...(input.currentPayload ?? {}),
        ...input.cartMetadata,
        mercado_pago_device_session_sent: input.deviceSessionSent,
        mercado_pago_device_session_missing: !input.deviceSessionSent,
        mercado_pago_three_d_secure_mode: "optional",
        mercado_pago_antifraud_context: {
          payer_phone_sent: input.payerPhoneSent,
          payer_identification_sent: input.payerIdentificationSent,
          additional_info_items_sent: true,
          selected_bump_count: input.selectedBumpCodes.length,
        },
      },
    })
    .eq("id", input.paymentId)
    .eq("organization_id", input.organizationId);

  if (updateResult.error) {
    await client.from("maintenance_audit_logs").insert({
      event_type: "billing.plan_checkout.payment_attempt_context_failed",
      target_table: "billing_payments",
      target_id: input.paymentId,
      metadata: {
        source: "dashboard_billing_card_checkout",
        organization_id: input.organizationId,
        error: updateResult.error.message,
      },
    });
  }
}

function toNumber(value: number | string | null | undefined) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}
