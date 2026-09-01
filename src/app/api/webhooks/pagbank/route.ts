import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  ensurePagBankAccessToken,
  extractPagBankPixData,
  getPagBankOrder,
  loadPagBankWebhookToken,
  verifyPagBankWebhookSignature,
} from "@/lib/sales-catalog/pagbank";
import { markPlatformProductCommissionsForPaymentStatus } from "@/lib/platform-product-sales";
import { handleSalesCatalogPaymentStatusChange } from "@/lib/sales-catalog/post-payment";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type PaymentSessionRow = {
  id: string;
  organization_id: string;
  order_id: string;
  integration_id: string | null;
  method: string | null;
  payment_owner_type: string | null;
  commercial_flow_type: string | null;
  revenue_owner_type: string | null;
  commission_context: JsonRecord | null;
  metadata: JsonRecord | null;
};

type OrderTrackingRow = {
  id: string;
  lead_id: string | null;
  conversation_id: string | null;
  customer_phone: string | null;
  total: string | null;
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
  const charges = Array.isArray(payload.charges) ? payload.charges.map(readRecord) : [];
  const charge = charges[0] ?? null;
  const orderId = readString(payload.id) ?? readString(payload.order_id) ?? readString(payload.orderId);
  const chargeId = readString(charge?.id) ?? readString(payload.charge_id) ?? readString(payload.chargeId);
  const dataId = chargeId ?? orderId;
  const eventType = readString(payload.type) ?? readString(payload.event_type) ?? "payment.updated";
  const action = readString(payload.action) ?? readString(payload.status) ?? readString(charge?.status);
  const providerEventId = readString(payload.event_id) ?? readString(payload.notification_id) ?? orderId ?? chargeId;
  const signatureHeader = request.headers.get("x-authenticity-token")
    ?? request.headers.get("x-payload-signature");
  const requestId = request.headers.get("x-request-id");

  if (!dataId) {
    await recordWebhookEvent(client, {
      providerEventId,
      dataId,
      eventType,
      action,
      signatureHeader,
      requestId,
      payload,
      processingStatus: "ignored",
      errorMessage: "Evento PagBank sem identificador de pedido ou cobranca.",
    });

    return NextResponse.json({ ok: true, ignored: true });
  }

  const session = await findPagBankPaymentSession(client, { chargeId, orderId });

  if (!session) {
    await recordWebhookEvent(client, {
      providerEventId,
      dataId,
      eventType,
      action,
      signatureHeader,
      requestId,
      payload,
      processingStatus: "ignored",
      errorMessage: "Sessao de pagamento PagBank nao encontrada.",
    });

    return NextResponse.json({ ok: true, ignored: true });
  }

  const sessionMetadata = readRecord(session.metadata);
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
  const paymentMethodLabel = session.method === "card" ? "Cartao PagBank" : "Pix PagBank";
  const integration = connectyHubOwned
    ? null
    : await ensurePagBankAccessToken({
        client,
        organizationId: session.organization_id,
      }).catch(() => null);
  const webhookToken = await loadPagBankWebhookToken({
    client,
    organizationId: session.organization_id,
  });
  const signature = verifyPagBankWebhookSignature({
    rawPayload,
    signatureHeader,
    token: webhookToken,
  });

  if (!signature.ok) {
    await recordWebhookEvent(client, {
      providerEventId,
      dataId,
      eventType,
      action,
      signatureHeader,
      requestId,
      payload,
      organizationId: session.organization_id,
      paymentSessionId: session.id,
      processingStatus: "failed",
      errorMessage: signature.skipped
        ? "Token de webhook PagBank nao configurado."
        : "Assinatura PagBank invalida.",
    });

    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  if (!integration?.accessToken) {
    await recordWebhookEvent(client, {
      providerEventId,
      dataId,
      eventType,
      action,
      signatureHeader,
      requestId,
      payload,
      organizationId: session.organization_id,
      paymentSessionId: session.id,
      processingStatus: "failed",
      errorMessage: connectyHubOwned
        ? "PagBank ainda nao esta habilitado para produtos ConnectyHub."
        : "Integracao PagBank indisponivel.",
    });

    return NextResponse.json({ ok: true, deferred: true });
  }

  const resolvedOrderId = orderId ?? readString(sessionMetadata.pagbank_order_id);

  if (!resolvedOrderId) {
    await recordWebhookEvent(client, {
      providerEventId,
      dataId,
      eventType,
      action,
      signatureHeader,
      requestId,
      payload,
      organizationId: session.organization_id,
      paymentSessionId: session.id,
      processingStatus: "failed",
      errorMessage: "Webhook PagBank sem order_id para reconciliar.",
    });

    return NextResponse.json({ ok: true, deferred: true });
  }

  try {
    const order = await getPagBankOrder({
      accessToken: integration.accessToken,
      mode: integration.mode,
      orderId: resolvedOrderId,
    });
    const pixData = extractPagBankPixData(order);
    const providerPaymentId = pixData.providerPaymentId ?? chargeId ?? resolvedOrderId;
    const { data: orderContextRow } = await client
      .from("sales_catalog_orders")
      .select("id, lead_id, conversation_id, customer_phone, total, metadata")
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
      pixData.status,
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

    await client
      .from("sales_catalog_payment_sessions")
      .update({
        status: pixData.status,
        provider_payment_id: providerPaymentId,
        provider_status: pixData.providerStatus,
        provider_status_detail: pixData.providerStatusDetail,
        pix_qr_code: pixData.pixQrCode,
        pix_qr_code_base64: pixData.pixQrCodeBase64,
        pix_ticket_url: pixData.pixTicketUrl,
        paid_at: pixData.paidAt,
        metadata: {
          ...readRecord(session.metadata),
          pagbank_order_id: pixData.providerOrderId ?? resolvedOrderId,
          pagbank_qrcode_png_url: pixData.pixQrCodePngUrl,
          pagbank_qrcode_base64_url: pixData.pixQrCodeBase64Url,
          last_webhook_at: now,
          last_webhook_action: action,
        },
      })
      .eq("id", session.id)
      .eq("organization_id", session.organization_id);

    await client
      .from("sales_catalog_orders")
      .update(orderPatch)
      .eq("id", session.order_id)
      .eq("organization_id", session.organization_id);

    const postPayment = await handleSalesCatalogPaymentStatusChange({
      client,
      organizationId: session.organization_id,
      orderId: session.order_id,
      paymentSessionId: session.id,
      providerPaymentId,
      paymentMethodLabel,
      status: pixData.status,
      source: "pagbank_webhook",
    });
    const commissions = pixData.status === "approved"
      ? null
      : await markPlatformProductCommissionsForPaymentStatus({
          client,
          organizationId: session.organization_id,
          paymentSessionId: session.id,
          providerPaymentId,
          status: pixData.status,
        });

    await recordWebhookEvent(client, {
      providerEventId,
      dataId,
      eventType,
      action,
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
      title: "Pagamento PagBank atualizado",
      summary: `Pagamento ${providerPaymentId} atualizado para ${pixData.providerStatus ?? pixData.status}.`,
      confidence: 1,
      visibility: "organization",
      tags: ["sales_catalog", "payment", "pagbank", "webhook", "lead_tracking"],
      payload: {
        payment_session_id: session.id,
        order_id: session.order_id,
        provider_payment_id: providerPaymentId,
        provider_order_id: pixData.providerOrderId,
        provider_status: pixData.providerStatus,
        status: pixData.status,
        payment_method: session.method ?? null,
        payment_method_label: paymentMethodLabel,
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
      action,
      signatureHeader,
      requestId,
      payload,
      organizationId: session.organization_id,
      paymentSessionId: session.id,
      processingStatus: "failed",
      errorMessage: error instanceof Error ? error.message : "Falha ao processar webhook PagBank.",
    });

    return NextResponse.json({ ok: true, deferred: true });
  }
}

async function findPagBankPaymentSession(
  client: ReturnType<typeof createServiceClient>,
  input: { chargeId: string | null; orderId: string | null },
) {
  const ids = [input.chargeId, input.orderId].filter((item): item is string => Boolean(item));

  if (ids.length > 0) {
    const { data } = await client
      .from("sales_catalog_payment_sessions")
      .select("id, organization_id, order_id, integration_id, method, payment_owner_type, commercial_flow_type, revenue_owner_type, commission_context, metadata")
      .eq("provider", "pagbank")
      .in("provider_payment_id", ids)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<PaymentSessionRow>();

    if (data) {
      return data;
    }
  }

  if (input.orderId) {
    const { data } = await client
      .from("sales_catalog_payment_sessions")
      .select("id, organization_id, order_id, integration_id, method, payment_owner_type, commercial_flow_type, revenue_owner_type, commission_context, metadata")
      .eq("provider", "pagbank")
      .contains("metadata", { pagbank_order_id: input.orderId })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<PaymentSessionRow>();

    if (data) {
      return data;
    }
  }

  return null;
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
    provider: "pagbank",
    provider_event_id: input.providerEventId,
    provider_payment_id: input.dataId,
    organization_id: input.organizationId ?? null,
    payment_session_id: input.paymentSessionId ?? null,
    event_type: input.eventType,
    action: input.action,
    signature_header: input.signatureHeader,
    request_id: input.requestId,
    data_id: input.dataId,
    payload: input.payload,
    processing_status: input.processingStatus,
    error_message: input.errorMessage ?? null,
    processed_at: input.processingStatus === "processed" || input.processingStatus === "failed" ? new Date().toISOString() : null,
  });

  if (error && error.code !== "23505") {
    throw error;
  }
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
        latest_payment_provider: "pagbank",
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
        latest_payment_provider: "pagbank",
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
        latest_payment_provider: "pagbank",
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
      latest_payment_provider: "pagbank",
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
