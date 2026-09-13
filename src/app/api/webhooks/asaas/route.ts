import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  ensureAsaasAccessToken,
  extractAsaasPaymentData,
  getAsaasPayment,
  getAsaasCheckoutPayments,
  mapAsaasPaymentStatus,
  verifyAsaasWebhookToken,
  type AsaasPaymentResponse,
} from "@/lib/sales-catalog/asaas";
import { markPlatformProductCommissionsForPaymentStatus } from "@/lib/platform-product-sales";
import { handleSalesCatalogPaymentStatusChange } from "@/lib/sales-catalog/post-payment";
import { createServiceClient } from "@/lib/supabase/service";
import { sanitizePaymentAuditPayload } from "@/lib/security/payment-audit";
import { CheckoutError, processTransparentWebhook } from "@/lib/sales-catalog/transparent-checkout";
import { normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type PaymentSessionRow = {
  id: string;
  organization_id: string;
  order_id: string;
  integration_id: string | null;
  method: string | null;
  status: string;
  provider_status: string | null;
  provider_payment_id: string | null;
  updated_at: string | null;
  amount: string | number | null;
  payment_owner_type: string | null;
  commercial_flow_type: string | null;
  revenue_owner_type: string | null;
  commission_context: JsonRecord | null;
  metadata: JsonRecord | null;
};

type OrderTrackingRow = {
  id: string;
  latest_payment_session_id: string | null;
  payment_status: string | null;
  lead_id: string | null;
  conversation_id: string | null;
  customer_phone: string | null;
  total: string | null;
  checkout_revision: number | null;
  metadata: JsonRecord | null;
};

type OrderItemTrackingRow = {
  id: string;
  catalog_item_id: string | null;
  title: string;
  quantity: number | null;
  unit_price: string | number | null;
  sale_price: string | number | null;
  total: string | number | null;
  sku_code: string | null;
};

export async function POST(request: NextRequest) {
  const client = createServiceClient();
  const rawPayload = await request.text();
  const payload = readRecord(parseJson(rawPayload));
  const payment = readRecord(payload.payment);
  const checkout = readRecord(payload.checkout);
  const eventType = readString(payload.event) ?? readString(payload.type) ?? "payment.updated";
  const paymentId = readString(payment.id) ?? readString(payload.payment_id) ?? readString(payload.paymentId);
  const checkoutId = readString(checkout.id) ?? readString(payload.checkout_id) ?? readString(payload.checkoutId);
  const externalReference = readString(payment.externalReference)
    ?? readString(checkout.externalReference)
    ?? readString(payload.externalReference);
  const dataId = paymentId ?? checkoutId ?? externalReference;
  const providerEventId = readString(payload.id) ?? readString(payload.eventId) ?? dataId;
  const signatureHeader = request.headers.get("asaas-access-token");
  const requestId = request.headers.get("x-request-id");

  try {
    const transparent = await processTransparentWebhook(client, payload, signatureHeader);
    if (transparent) return NextResponse.json(transparent);
  } catch (error) {
    return NextResponse.json({ error: error instanceof CheckoutError ? error.message : "payment_reconciliation_pending" }, { status: error instanceof CheckoutError ? error.status : 503 });
  }

  if (!dataId) {
    await recordWebhookEvent(client, {
      providerEventId,
      dataId,
      eventType,
      action: eventType,
      signatureHeader,
      requestId,
      payload,
      processingStatus: "ignored",
      errorMessage: "Evento Asaas sem identificador de pagamento, checkout ou referencia externa.",
    });

    return NextResponse.json({ ok: true, ignored: true });
  }

  const session = await findAsaasPaymentSession(client, { paymentId, checkoutId, externalReference });

  if (!session) {
    await recordWebhookEvent(client, {
      providerEventId,
      dataId,
      eventType,
      action: eventType,
      signatureHeader,
      requestId,
      payload,
      processingStatus: "ignored",
      errorMessage: "Sessao de pagamento Asaas nao encontrada.",
    });

    return NextResponse.json({ ok: true, ignored: true });
  }

  const integration = await ensureAsaasAccessToken({
    client,
    organizationId: session.organization_id,
  }).catch(() => null);
  const signature = verifyAsaasWebhookToken({
    header: signatureHeader,
    token: integration?.webhookSecret ?? null,
  });

  if (!signature.ok) {
    await recordWebhookEvent(client, {
      providerEventId,
      dataId,
      eventType,
      action: eventType,
      signatureHeader,
      requestId,
      payload,
      organizationId: session.organization_id,
      paymentSessionId: session.id,
      processingStatus: "failed",
      errorMessage: signature.skipped
        ? "Token de webhook Asaas nao configurado."
        : "Token de webhook Asaas invalido.",
    });

    return NextResponse.json({ error: "invalid_webhook_token" }, { status: 401 });
  }

  if (!integration?.accessToken) {
    await recordWebhookEvent(client, {
      providerEventId,
      dataId,
      eventType,
      action: eventType,
      signatureHeader,
      requestId,
      payload,
      organizationId: session.organization_id,
      paymentSessionId: session.id,
      processingStatus: "failed",
      errorMessage: "Integracao Asaas indisponivel.",
    });

    return NextResponse.json({ ok: true, deferred: true });
  }

  try {
    let paymentResponse = paymentId
      ? await getAsaasPayment({
          accessToken: integration.accessToken,
          mode: integration.mode,
          paymentId,
        })
      : null;
    if (paymentResponse && paymentResponse.id !== paymentId) throw new Error("O provedor retornou outro pagamento. A conciliação será repetida.");
    let hostedReview: string | null = null;
    let hostedEvidence: { count: number; has_more: boolean; payments: { id?: string; status?: string; amount?: number }[] } | null = null;
    if (!paymentId && checkoutId && eventType === "CHECKOUT_PAID") {
      const result = await getAsaasCheckoutPayments({ accessToken: integration.accessToken, mode: integration.mode, checkoutId });
      const payments = result.payments;
      hostedEvidence = { count: payments.length, has_more: result.hasMore,
        payments: payments.slice(0, 10).map(row => ({ id: row.id, status: row.status, amount: row.value })) };
      // Do not infer a full payment from a partial list, multiple installments or
      // a foreign checkout. Ambiguous money remains visible for review.
      if (result.hasMore || payments.length !== 1 || !payments[0].id
        || payments[0].checkoutSession && payments[0].checkoutSession !== checkoutId) {
        hostedReview = "hosted_checkout_payments_ambiguous";
      } else {
        paymentResponse = payments[0] as AsaasPaymentResponse;
        if (!["approved", "refunded"].includes(extractAsaasPaymentData(paymentResponse).status)) hostedReview = "hosted_checkout_payment_not_confirmed";
      }
    }
    const paymentData = paymentResponse
      ? extractAsaasPaymentData(paymentResponse, null, eventType)
      : hostedReview ? { ...buildCheckoutPaymentData("CHECKOUT_CREATED", checkoutId), providerStatus: "VERIFICATION_PENDING", providerStatusDetail: "verification_pending" }
        : buildCheckoutPaymentData(eventType, checkoutId);
    const preserveHostedSession = Boolean(hostedReview) && (!paymentResponse || ["cancelled", "expired", "rejected", "approved", "refunded"].includes(session.status));
    const providerPaymentId = (preserveHostedSession ? session.provider_payment_id : null)
      ?? paymentData.providerPaymentId ?? paymentId ?? checkoutId ?? dataId;
    const sessionMetadata = readRecord(session.metadata);
    // Retirement and financial completion are not reversible by a late pending
    // event. Fresh approvals/refunds remain eligible for reconciliation below.
    const nextFinancial = paymentData.status === "approved" || paymentData.status === "refunded";
    const terminalRegression = ["approved", "refunded"].includes(session.status) && !nextFinancial
      || ["cancelled", "expired", "rejected"].includes(session.status) && ["created", "pending", "error"].includes(paymentData.status);
    if (terminalRegression && !hostedReview) {
      await recordWebhookEvent(client, { providerEventId, dataId, eventType, action: eventType, signatureHeader, requestId,
        payload, organizationId: session.organization_id, paymentSessionId: session.id, processingStatus: "ignored",
        errorMessage: "Evento não financeiro não reabre uma sessão encerrada." });
      return NextResponse.json({ ok: true, ignored: true });
    }
    // "refunded" also represents disputes/refund requests in the legacy mapping.
    // A won dispute can legitimately return to CONFIRMED. A completed refund plus
    // a fresh approval is conflicting evidence: retain the refund and open review.
    const completedRefundConflict = session.status === "refunded" && session.provider_status === "REFUNDED"
      && paymentData.status === "approved";
    const commissionContext = readRecord(session.commission_context);
    const paymentOwnerType = normalizeRevenueOwnerType(
      session.payment_owner_type
        ?? readString(sessionMetadata.payment_owner_type)
        ?? readString(sessionMetadata.payment_owner),
    );
    const connectyHubOwned = paymentOwnerType === "connectyhub";
    const commercialFlowType = normalizeCommercialFlowType(
      session.commercial_flow_type
        ?? readString(sessionMetadata.commercial_flow_type),
    );
    const revenueOwnerType = normalizeRevenueOwnerType(
      session.revenue_owner_type
        ?? readString(sessionMetadata.revenue_owner_type),
    );
    const commissionEligible = readBoolean(commissionContext.eligible)
      ?? readBoolean(commissionContext.commission_eligible)
      ?? readBoolean(sessionMetadata.commission_eligible)
      ?? false;
    const paymentMethodLabel = session.method === "card" ? "Cartao Asaas" : "Pix Asaas";
    const { data: orderContextRow } = await client
      .from("sales_catalog_orders")
      .select("id, lead_id, conversation_id, customer_phone, total, checkout_revision, latest_payment_session_id, payment_status, metadata")
      .eq("id", session.order_id)
      .eq("organization_id", session.organization_id)
      .maybeSingle<OrderTrackingRow>();
    const { data: orderItemRows } = await client
      .from("sales_catalog_order_items")
      .select("id, catalog_item_id, title, quantity, unit_price, sale_price, total, sku_code")
      .eq("order_id", session.order_id)
      .eq("organization_id", session.organization_id)
      .order("created_at", { ascending: true });
    const orderItems = (orderItemRows ?? []) as OrderItemTrackingRow[];
    const orderPatch = buildOrderPatchFromPaymentStatus(
      paymentData.status,
      session.id,
      providerPaymentId,
      readRecord(orderContextRow?.metadata),
      {
        paymentMethodLabel,
        commercialFlowType,
        revenueOwnerType,
        containsPlatformProducts: connectyHubOwned,
        commissionEligible,
      },
    );
    const now = new Date().toISOString();

    let sessionUpdate = client
      .from("sales_catalog_payment_sessions")
      .update({
        status: preserveHostedSession ? session.status : completedRefundConflict ? "refunded" : paymentData.status,
        provider_payment_id: providerPaymentId,
        provider_status: preserveHostedSession || completedRefundConflict ? session.provider_status : paymentData.providerStatus,
        provider_status_detail: hostedReview ? "verification_pending" : paymentData.providerStatusDetail,
        // Status webhooks do not include /pixQrCode data. Never erase the code
        // already returned when the payment was created (including concurrent writes).
        ...(paymentData.pixQrCode ? { pix_qr_code: paymentData.pixQrCode } : {}),
        ...(paymentData.pixQrCodeBase64 ? { pix_qr_code_base64: paymentData.pixQrCodeBase64 } : {}),
        ...(paymentData.pixTicketUrl ? { pix_ticket_url: paymentData.pixTicketUrl } : {}),
        ...(paymentData.paidAt ? { paid_at: paymentData.paidAt } : {}),
        updated_at: now,
        metadata: {
          ...sessionMetadata,
          gateway_request_inflight: false,
          asaas_payment_id: paymentId ?? paymentResponse?.id ?? sessionMetadata.asaas_payment_id ?? null,
          asaas_checkout_id: checkoutId ?? sessionMetadata.asaas_checkout_id ?? null,
          asaas_status: paymentData.providerStatus,
          last_webhook_at: now,
          last_webhook_action: eventType,
          ...(completedRefundConflict ? { financial_conflict: { verified_provider_status: paymentData.providerStatus, observed_at: now } } : {}),
          ...(hostedEvidence ? { hosted_payment_evidence: hostedEvidence } : {}),
        },
      })
      .eq("id", session.id)
      .eq("organization_id", session.organization_id)
      .eq("order_id", session.order_id)
      .eq("status", session.status);
    sessionUpdate = session.updated_at ? sessionUpdate.eq("updated_at", session.updated_at) : sessionUpdate.is("updated_at", null);
    const { data: savedSession, error: sessionSaveError } = await sessionUpdate.select("id").maybeSingle();
    if (sessionSaveError || !savedSession) throw new Error("O pagamento mudou durante a conciliação. O evento será conferido novamente.");

    // An abandoned Pix may expire after the customer switches to card. Record
    // that session's status without replacing the current checkout or notifying
    // the customer that their new payment failed. Financial events still apply.
    const financialEvent = paymentData.status === "approved" || paymentData.status === "refunded";
    const currentSessionId = orderContextRow?.latest_payment_session_id;
    let financialReview = hostedReview ?? (completedRefundConflict ? "completed_refund_confirmation_conflict"
      : financialEvent ? financialReviewReason(session, orderContextRow, paymentResponse?.value, paymentData.status) : null);
    let orderUpdated = false;
    if (financialReview) {
      await requireFinancialReview(client, session, orderContextRow);
    } else if (financialEvent || ((!currentSessionId || currentSessionId === session.id)
      && !["confirmed", "refunded"].includes(orderContextRow?.payment_status ?? ""))) {
      let update = client.from("sales_catalog_orders").update(orderPatch)
        .eq("id", session.order_id).eq("organization_id", session.organization_id);
      update = currentSessionId ? update.eq("latest_payment_session_id", currentSessionId) : update.is("latest_payment_session_id", null);
      if (orderContextRow?.payment_status) update = update.eq("payment_status", orderContextRow.payment_status);
      if (financialEvent && orderContextRow) {
        update = update.eq("total", orderContextRow.total).eq("checkout_revision", orderContextRow.checkout_revision ?? 0);
      }
      const { data: updatedOrder, error: orderUpdateError } = await update.select("id").maybeSingle();
      if (orderUpdateError) throw new Error(orderUpdateError.message);
      orderUpdated = Boolean(updatedOrder);
      if (financialEvent && !orderUpdated) {
        financialReview = "order_changed_during_reconciliation";
        await requireFinancialReview(client, session, orderContextRow);
      }
    }

    const postPayment = orderUpdated ? await handleSalesCatalogPaymentStatusChange({
      client,
      organizationId: session.organization_id,
      orderId: session.order_id,
      paymentSessionId: session.id,
      providerPaymentId,
      paymentMethod: session.method,
      paymentMethodLabel,
      status: paymentData.status,
      source: "asaas_webhook",
    }) : { inventoryDeducted: false, whatsappNotified: false, responsibleNotified: false, commissions: null };
    const commissions = paymentData.status === "approved"
      ? null
      : await markPlatformProductCommissionsForPaymentStatus({
          client,
          organizationId: session.organization_id,
          paymentSessionId: session.id,
          providerPaymentId,
          status: paymentData.status,
        });

    await recordWebhookEvent(client, {
      providerEventId,
      dataId,
      eventType,
      action: eventType,
      signatureHeader,
      requestId,
      payload,
      organizationId: session.organization_id,
      paymentSessionId: session.id,
      processingStatus: "processed",
    });

    await client.from("intelligence_events").insert({
      scope: "organization",
      organization_id: session.organization_id,
      source_type: "sales_catalog_payment_session",
      source_id: session.id,
      event_type: "sales_catalog.payment_webhook_processed",
      title: "Pagamento Asaas atualizado",
      summary: `Pagamento ${providerPaymentId} atualizado para ${paymentData.providerStatus ?? paymentData.status}.`,
      confidence: 1,
      visibility: "organization",
      tags: ["sales_catalog", "payment", "asaas", "webhook", "lead_tracking"],
      payload: {
        payment_session_id: session.id,
        order_id: session.order_id,
        provider_payment_id: providerPaymentId,
        provider_status: paymentData.providerStatus,
        status: paymentData.status,
        payment_method: session.method ?? null,
        payment_method_label: paymentMethodLabel,
        order_updated: orderUpdated,
        financial_review_reason: financialReview,
        lead_id: orderContextRow?.lead_id ?? null,
        conversation_id: orderContextRow?.conversation_id ?? null,
        lead_phone: orderContextRow?.customer_phone ?? null,
        order_total: orderContextRow?.total ?? null,
        items: summarizeOrderItems(orderItems),
        payment_owner: connectyHubOwned ? "connectyhub" : "seller",
        commercial_flow_type: commercialFlowType,
        revenue_owner_type: revenueOwnerType,
        commission_eligible: commissionEligible,
        post_payment: {
          ...postPayment,
          commissions: postPayment.commissions ?? commissions,
        },
      },
    });

    revalidatePath(`/checkout/${session.id}`);
    revalidatePath("/dashboard/links");
    revalidatePath("/dashboard/whatsapp");

    return NextResponse.json({ ok: true });
  } catch (error) {
    await recordWebhookEvent(client, {
      providerEventId,
      dataId,
      eventType,
      action: eventType,
      signatureHeader,
      requestId,
      payload,
      organizationId: session.organization_id,
      paymentSessionId: session.id,
      processingStatus: "failed",
      errorMessage: error instanceof Error ? error.message : "Falha ao processar webhook Asaas.",
    });

    return NextResponse.json({ ok: false, deferred: true }, { status: 503 });
  }
}

async function findAsaasPaymentSession(
  client: ReturnType<typeof createServiceClient>,
  input: { paymentId: string | null; checkoutId: string | null; externalReference: string | null },
) {
  const ids = [input.paymentId, input.checkoutId].filter((item): item is string => Boolean(item));

  if (ids.length > 0) {
    const { data } = await client
      .from("sales_catalog_payment_sessions")
      .select("id, organization_id, order_id, integration_id, method, status, provider_status, provider_payment_id, updated_at, amount, payment_owner_type, commercial_flow_type, revenue_owner_type, commission_context, metadata")
      .eq("provider", "asaas")
      .in("provider_payment_id", ids)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<PaymentSessionRow>();

    if (data) {
      return data;
    }
  }

  if (input.checkoutId) {
    const { data } = await client
      .from("sales_catalog_payment_sessions")
      .select("id, organization_id, order_id, integration_id, method, status, provider_status, provider_payment_id, updated_at, amount, payment_owner_type, commercial_flow_type, revenue_owner_type, commission_context, metadata")
      .eq("provider", "asaas")
      .contains("metadata", { asaas_checkout_id: input.checkoutId })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<PaymentSessionRow>();

    if (data) {
      return data;
    }
  }

  if (input.externalReference) {
    const { data } = await client
      .from("sales_catalog_payment_sessions")
      .select("id, organization_id, order_id, integration_id, method, status, provider_status, provider_payment_id, updated_at, amount, payment_owner_type, commercial_flow_type, revenue_owner_type, commission_context, metadata")
      .eq("provider", "asaas")
      .eq("external_reference", input.externalReference)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<PaymentSessionRow>();

    if (data) {
      return data;
    }
  }

  return null;
}

function financialReviewReason(session: PaymentSessionRow, order: OrderTrackingRow | null, providerAmount: number | undefined, status: string) {
  if (!order) return "order_unavailable";
  const sessionAmount = normalizeCurrencyAmount(session.amount);
  const orderAmount = normalizeCurrencyAmount(order.total);
  const actualAmount = normalizeCurrencyAmount(providerAmount);
  if (actualAmount === null || sessionAmount === null || orderAmount === null || actualAmount !== sessionAmount || sessionAmount !== orderAmount) {
    return "payment_amount_differs_from_current_order";
  }
  const revision = readRecord(session.metadata).checkout_revision;
  if (revision != null && (!Number.isSafeInteger(Number(revision)) || Number(revision) !== Number(order.checkout_revision ?? 0))) return "payment_belongs_to_another_order_revision";
  if (status === "refunded" && order.latest_payment_session_id !== session.id) return "refund_belongs_to_another_session";
  if (status === "approved" && order.payment_status === "refunded") return "confirmation_after_refund_or_dispute";
  return null;
}

async function requireFinancialReview(client: ReturnType<typeof createServiceClient>, session: PaymentSessionRow, order: OrderTrackingRow | null) {
  if (!order?.lead_id) throw new Error("Pagamento registrado, mas o pedido precisa de conferência financeira.");
  const { data: existing, error } = await client.from("sales_catalog_payment_reviews").select("id")
    .eq("organization_id", session.organization_id).eq("lead_id", order.lead_id).eq("order_id", session.order_id)
    .neq("status", "resolved").maybeSingle();
  if (error) throw new Error("Não foi possível registrar a conferência financeira.");
  if (existing) return;
  const { error: saveError } = await client.from("sales_catalog_payment_reviews").insert({ organization_id: session.organization_id,
    lead_id: order.lead_id, order_id: session.order_id, conversation_id: order.conversation_id, status: "open" });
  // The existing partial unique index coalesces concurrent observations.
  if (saveError && saveError.code !== "23505") throw new Error("Não foi possível registrar a conferência financeira.");
}

async function recordWebhookEvent(
  client: ReturnType<typeof createServiceClient>,
  input: {
    providerEventId: string | null;
    dataId: string | null;
    eventType: string | null;
    action: string | null;
    signatureHeader: string | null;
    requestId: string | null;
    payload: JsonRecord;
    organizationId?: string | null;
    paymentSessionId?: string | null;
    processingStatus: "received" | "processed" | "ignored" | "failed";
    errorMessage?: string | null;
  },
) {
  const { error } = await client.from("sales_catalog_payment_webhook_events").insert({
    provider: "asaas",
    provider_event_id: input.providerEventId,
    provider_payment_id: input.dataId,
    organization_id: input.organizationId ?? null,
    payment_session_id: input.paymentSessionId ?? null,
    event_type: input.eventType,
    action: input.action,
    signature_header: null,
    request_id: input.requestId,
    data_id: input.dataId,
    payload: sanitizePaymentAuditPayload(input.payload),
    processing_status: input.processingStatus,
    error_message: input.errorMessage ?? null,
    processed_at: input.processingStatus === "processed" || input.processingStatus === "failed" ? new Date().toISOString() : null,
  });

  if (error && error.code !== "23505") {
    throw error;
  }
}

function buildCheckoutPaymentData(eventType: string, checkoutId: string | null) {
  const normalizedEvent = eventType.trim().toUpperCase();
  const providerStatus = normalizedEvent.includes("PAID")
    ? "RECEIVED"
    : normalizedEvent.includes("CANCEL")
      ? "CANCELLED"
      : normalizedEvent.includes("EXPIRED")
        ? "OVERDUE"
        : "PENDING";

  return {
    status: mapAsaasPaymentStatus(providerStatus),
    providerStatus,
    providerStatusDetail: normalizedEvent,
    providerPaymentId: checkoutId,
    providerCustomerId: null,
    paidAt: providerStatus === "RECEIVED" ? new Date().toISOString() : null,
    pixQrCode: null,
    pixQrCodeBase64: null,
    pixTicketUrl: null,
    pixExpirationDate: null,
  };
}

function buildOrderPatchFromPaymentStatus(
  status: "created" | "pending" | "approved" | "rejected" | "cancelled" | "expired" | "refunded" | "error",
  sessionId: string,
  providerPaymentId: string,
  currentMetadata: JsonRecord,
  ownerContext: {
    paymentMethodLabel: string;
    commercialFlowType: string;
    revenueOwnerType: string;
    containsPlatformProducts: boolean;
    commissionEligible: boolean;
  },
) {
  if (status === "approved") {
    return {
      latest_payment_session_id: sessionId,
      status: "paid",
      payment_status: "confirmed",
      payment_method: ownerContext.paymentMethodLabel,
      commercial_flow_type: ownerContext.commercialFlowType,
      revenue_owner_type: ownerContext.revenueOwnerType,
      contains_platform_products: ownerContext.containsPlatformProducts,
      commission_eligible: ownerContext.commissionEligible,
      metadata: {
        ...currentMetadata,
        payment_gateway_confirmed_at: new Date().toISOString(),
        latest_payment_session_id: sessionId,
        latest_provider_payment_id: providerPaymentId,
        latest_payment_provider: "asaas",
        latest_commercial_flow_type: ownerContext.commercialFlowType,
        latest_revenue_owner_type: ownerContext.revenueOwnerType,
        latest_commission_eligible: ownerContext.commissionEligible,
      },
    };
  }

  if (status === "rejected" || status === "cancelled" || status === "expired" || status === "error") {
    return {
      latest_payment_session_id: sessionId,
      payment_status: "failed",
      payment_method: ownerContext.paymentMethodLabel,
      commercial_flow_type: ownerContext.commercialFlowType,
      revenue_owner_type: ownerContext.revenueOwnerType,
      contains_platform_products: ownerContext.containsPlatformProducts,
      commission_eligible: ownerContext.commissionEligible,
      metadata: {
        ...currentMetadata,
        payment_gateway_failed_at: new Date().toISOString(),
        latest_payment_session_id: sessionId,
        latest_provider_payment_id: providerPaymentId,
        latest_payment_provider: "asaas",
        latest_commercial_flow_type: ownerContext.commercialFlowType,
        latest_revenue_owner_type: ownerContext.revenueOwnerType,
        latest_commission_eligible: ownerContext.commissionEligible,
      },
    };
  }

  if (status === "refunded") {
    return {
      latest_payment_session_id: sessionId,
      payment_status: "refunded",
      payment_method: ownerContext.paymentMethodLabel,
      commercial_flow_type: ownerContext.commercialFlowType,
      revenue_owner_type: ownerContext.revenueOwnerType,
      contains_platform_products: ownerContext.containsPlatformProducts,
      commission_eligible: ownerContext.commissionEligible,
      metadata: {
        ...currentMetadata,
        payment_gateway_refunded_at: new Date().toISOString(),
        latest_payment_session_id: sessionId,
        latest_provider_payment_id: providerPaymentId,
        latest_payment_provider: "asaas",
        latest_commercial_flow_type: ownerContext.commercialFlowType,
        latest_revenue_owner_type: ownerContext.revenueOwnerType,
        latest_commission_eligible: ownerContext.commissionEligible,
      },
    };
  }

  return {
    latest_payment_session_id: sessionId,
    status: "pending_payment",
    payment_status: "pending",
    payment_method: ownerContext.paymentMethodLabel,
    commercial_flow_type: ownerContext.commercialFlowType,
    revenue_owner_type: ownerContext.revenueOwnerType,
    contains_platform_products: ownerContext.containsPlatformProducts,
    commission_eligible: ownerContext.commissionEligible,
    metadata: {
      ...currentMetadata,
      latest_payment_session_id: sessionId,
      latest_provider_payment_id: providerPaymentId,
      latest_payment_provider: "asaas",
      latest_commercial_flow_type: ownerContext.commercialFlowType,
      latest_revenue_owner_type: ownerContext.revenueOwnerType,
      latest_commission_eligible: ownerContext.commissionEligible,
    },
  };
}

function summarizeOrderItems(items: OrderItemTrackingRow[]) {
  return items.map((item) => ({
    order_item_id: item.id,
    catalog_item_id: item.catalog_item_id,
    title: item.title,
    quantity: item.quantity ?? 1,
    sku_code: item.sku_code,
    unit_price: item.unit_price,
    sale_price: item.sale_price,
    total: item.total,
  }));
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function normalizeCommercialFlowType(value: string | null) {
  if (value === "connectyhub_resale" || value === "connectyhub_direct" || value === "external_marketplace") return value;
  return "client_direct";
}

function normalizeRevenueOwnerType(value: string | null) {
  if (value === "connectyhub" || value === "split" || value === "external_provider") return value;
  return "client";
}
