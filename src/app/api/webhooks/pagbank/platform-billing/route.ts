import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  processPlatformBillingPagBankWebhook,
  type PlatformBillingWebhookProcessingResult,
} from "@/lib/billing/platform-billing-webhook";
import {
  loadPagBankPlatformBillingWebhookToken,
  verifyPagBankWebhookSignature,
} from "@/lib/sales-catalog/pagbank";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

export async function POST(request: NextRequest) {
  const client = createServiceClient();
  const rawPayload = await request.text();
  const payload = readRecord(parseJson(rawPayload));
  const dataId = request.nextUrl.searchParams.get("order_id")
    ?? request.nextUrl.searchParams.get("id")
    ?? readString(payload.id)
    ?? readString(payload.order_id)
    ?? readString(payload.orderId)
    ?? readString(readRecord(payload.order)?.id)
    ?? readString(readRecord(payload.data)?.id);
  const eventType = readString(payload.event)
    ?? readString(payload.type)
    ?? request.nextUrl.searchParams.get("event")
    ?? request.nextUrl.searchParams.get("type");
  const action = readString(payload.action)
    ?? readString(payload.status);
  const providerEventId = readString(payload.notification_id)
    ?? readString(payload.notificationId)
    ?? readString(payload.event_id)
    ?? readString(payload.eventId);
  const requestId = request.headers.get("x-request-id");
  const signatureHeader = request.headers.get("x-signature")
    ?? request.headers.get("x-pagbank-signature");
  const webhookToken = await loadPagBankPlatformBillingWebhookToken({ client }).catch(() => null);
  const signature = verifyPagBankWebhookSignature({
    rawPayload,
    signatureHeader,
    token: webhookToken,
  });

  if (!dataId) {
    await recordBillingWebhookAudit(client, {
      providerEventId,
      dataId,
      eventType,
      action,
      requestId,
      processingStatus: "ignored",
      errorMessage: "Evento PagBank billing sem id do pedido.",
      payload,
      result: null,
    });

    return NextResponse.json({ ok: true, ignored: true });
  }

  if (!signature.ok) {
    await recordBillingWebhookAudit(client, {
      providerEventId,
      dataId,
      eventType,
      action,
      requestId,
      processingStatus: "failed",
      errorMessage: signature.skipped
        ? "Webhook token PagBank billing nao configurado."
        : "Assinatura PagBank billing invalida.",
      payload,
      result: null,
    });

    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  try {
    const result = await processPlatformBillingPagBankWebhook(client, {
      dataId,
      eventType,
      action,
      providerEventId,
      requestId,
      payload,
    });

    await recordBillingWebhookAudit(client, {
      providerEventId,
      dataId,
      eventType,
      action,
      requestId,
      processingStatus: result.processingStatus,
      errorMessage: result.reason ?? (signature.skipped ? "Assinatura nao configurada; evento aceito por ambiente nao produtivo." : null),
      payload,
      result,
    });

    if (result.subscriptionId) {
      revalidatePath(`/dashboard/planos/checkout/${result.subscriptionId}`);
    }
    revalidatePath("/dashboard/planos");
    revalidatePath("/admin/financeiro");

    return NextResponse.json({
      ok: true,
      received: true,
      processing: result.processingStatus,
      reason: result.reason,
      organizationId: result.organizationId,
      subscriptionId: result.subscriptionId,
      paymentId: result.paymentId,
      notificationId: result.notificationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar webhook PagBank billing.";

    await recordBillingWebhookAudit(client, {
      providerEventId,
      dataId,
      eventType,
      action,
      requestId,
      processingStatus: "failed",
      errorMessage: message,
      payload,
      result: null,
    });

    return NextResponse.json({
      ok: true,
      received: true,
      processing: "deferred",
      error: message,
    });
  }
}

async function recordBillingWebhookAudit(
  client: SupabaseClient,
  input: {
    providerEventId: string | null;
    dataId: string | null;
    eventType: string | null;
    action: string | null;
    requestId: string | null;
    processingStatus: string;
    errorMessage: string | null;
    payload: JsonRecord;
    result: PlatformBillingWebhookProcessingResult | null;
  },
) {
  await client.from("maintenance_audit_logs").insert({
    event_type: "billing.pagbank.webhook",
    target_table: "billing_payments",
    target_id: input.result?.paymentId ?? null,
    metadata: {
      provider: "pagbank",
      providerEventId: input.providerEventId,
      dataId: input.dataId,
      eventType: input.eventType,
      action: input.action,
      requestId: input.requestId,
      processingStatus: input.processingStatus,
      errorMessage: input.errorMessage,
      result: input.result,
      payload: input.payload,
    },
  });
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
