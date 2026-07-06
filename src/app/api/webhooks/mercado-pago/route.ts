import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  ensureMercadoPagoAccessToken,
  extractMercadoPagoPixData,
  getMercadoPagoPayment,
  verifyMercadoPagoWebhookSignature,
} from "@/lib/sales-catalog/mercado-pago";
import { handleSalesCatalogApprovedPayment } from "@/lib/sales-catalog/post-payment";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type PaymentSessionRow = {
  id: string;
  organization_id: string;
  order_id: string;
  integration_id: string | null;
  metadata: JsonRecord | null;
};

export async function POST(request: NextRequest) {
  const client = createServiceClient();
  const payload = readRecord(await request.json().catch(() => null));
  const dataRecord = readRecord(payload.data);
  const dataId = request.nextUrl.searchParams.get("data.id")
    ?? readString(dataRecord.id)
    ?? request.nextUrl.searchParams.get("id");
  const eventType = readString(payload.type) ?? request.nextUrl.searchParams.get("type");
  const action = readString(payload.action);
  const providerEventId = readString(payload.id);
  const signatureHeader = request.headers.get("x-signature");
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
      errorMessage: "Evento sem data.id.",
    });

    return NextResponse.json({ ok: true, ignored: true });
  }

  const { data: session } = await client
    .from("sales_catalog_payment_sessions")
    .select("id, organization_id, order_id, integration_id, metadata")
    .eq("provider", "mercado_pago")
    .eq("provider_payment_id", dataId)
    .maybeSingle<PaymentSessionRow>();

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
      errorMessage: "Sessao de pagamento nao encontrada.",
    });

    return NextResponse.json({ ok: true, ignored: true });
  }

  const integration = await ensureMercadoPagoAccessToken({
    client,
    organizationId: session.organization_id,
  }).catch(() => null);
  const signature = verifyMercadoPagoWebhookSignature({
    signatureHeader,
    requestId,
    dataId,
    secret: integration?.webhookSecret ?? null,
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
      errorMessage: "Assinatura Mercado Pago invalida.",
    });

    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  if (!integration) {
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
      errorMessage: "Integracao Mercado Pago indisponivel.",
    });

    return NextResponse.json({ ok: true, deferred: true });
  }

  try {
    const payment = await getMercadoPagoPayment({
      accessToken: integration.accessToken,
      paymentId: dataId,
    });
    const pixData = extractMercadoPagoPixData(payment);
    const { data: orderMetadataRow } = await client
      .from("sales_catalog_orders")
      .select("metadata")
      .eq("id", session.order_id)
      .eq("organization_id", session.organization_id)
      .maybeSingle<{ metadata: JsonRecord | null }>();
    const orderPatch = buildOrderPatchFromPaymentStatus(
      pixData.status,
      session.id,
      dataId,
      readRecord(orderMetadataRow?.metadata),
    );
    const now = new Date().toISOString();

    await client
      .from("sales_catalog_payment_sessions")
      .update({
        status: pixData.status,
        provider_status: pixData.providerStatus,
        provider_status_detail: pixData.providerStatusDetail,
        pix_qr_code: pixData.pixQrCode,
        pix_qr_code_base64: pixData.pixQrCodeBase64,
        pix_ticket_url: pixData.pixTicketUrl,
        paid_at: pixData.paidAt,
        metadata: {
          ...readRecord(session.metadata),
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

    const postPayment = pixData.status === "approved"
      ? await handleSalesCatalogApprovedPayment({
          client,
          organizationId: session.organization_id,
          orderId: session.order_id,
          paymentSessionId: session.id,
          providerPaymentId: dataId,
          paymentMethodLabel: "Pix Mercado Pago",
          source: "mercado_pago_webhook",
        })
      : null;

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
      title: "Pagamento Mercado Pago atualizado",
      summary: `Pagamento ${dataId} atualizado para ${pixData.providerStatus ?? pixData.status}.`,
      confidence: 1,
      visibility: "organization",
      tags: ["sales_catalog", "payment", "mercado_pago", "webhook"],
      payload: {
        payment_session_id: session.id,
        order_id: session.order_id,
        provider_payment_id: dataId,
        provider_status: pixData.providerStatus,
        status: pixData.status,
        post_payment: postPayment,
      },
    });

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
      errorMessage: error instanceof Error ? error.message : "Falha ao processar webhook Mercado Pago.",
    });

    return NextResponse.json({ ok: true, deferred: true });
  }
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
    provider: "mercado_pago",
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
) {
  if (status === "approved") {
    return {
      latest_payment_session_id: sessionId,
      status: "paid",
      payment_status: "confirmed",
      payment_method: "Pix Mercado Pago",
      metadata: {
        ...currentMetadata,
        payment_gateway_confirmed_at: new Date().toISOString(),
        latest_payment_session_id: sessionId,
        latest_provider_payment_id: providerPaymentId,
      },
    };
  }

  if (status === "rejected" || status === "cancelled" || status === "expired" || status === "error") {
    return {
      latest_payment_session_id: sessionId,
      payment_status: "failed",
      payment_method: "Pix Mercado Pago",
      metadata: {
        ...currentMetadata,
        payment_gateway_failed_at: new Date().toISOString(),
        latest_payment_session_id: sessionId,
        latest_provider_payment_id: providerPaymentId,
      },
    };
  }

  if (status === "refunded") {
    return {
      latest_payment_session_id: sessionId,
      payment_status: "refunded",
      payment_method: "Pix Mercado Pago",
      metadata: {
        ...currentMetadata,
        payment_gateway_refunded_at: new Date().toISOString(),
        latest_payment_session_id: sessionId,
        latest_provider_payment_id: providerPaymentId,
      },
    };
  }

  return {
    latest_payment_session_id: sessionId,
    status: "pending_payment",
    payment_status: "pending",
    payment_method: "Pix Mercado Pago",
  };
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
