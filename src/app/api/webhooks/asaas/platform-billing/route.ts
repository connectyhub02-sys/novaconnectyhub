import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  processPlatformBillingAsaasWebhook,
  type PlatformBillingWebhookProcessingResult,
} from "@/lib/billing/platform-billing-webhook";
import {
  loadAsaasPlatformBillingWebhookToken,
  verifyAsaasWebhookToken,
} from "@/lib/sales-catalog/asaas";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

export async function POST(request: NextRequest) {
  const client = createServiceClient();
  const rawPayload = await request.text();
  const payload = readRecord(parseJson(rawPayload));
  const eventType = readString(payload.event)
    ?? readString(payload.type)
    ?? request.nextUrl.searchParams.get("event")
    ?? request.nextUrl.searchParams.get("type");
  const action = readString(payload.action)
    ?? readString(payload.status)
    ?? eventType;
  const dataId = readWebhookDataId(request, payload, eventType);
  const providerEventId = readProviderEventId(payload, dataId);
  const requestId = request.headers.get("x-request-id");
  const signatureHeader = request.headers.get("asaas-access-token");
  const webhookToken = await loadAsaasPlatformBillingWebhookToken({ client }).catch(() => null);
  const signature = verifyAsaasWebhookToken({
    header: signatureHeader,
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
      errorMessage: "Evento Asaas billing sem id de pagamento, checkout ou assinatura.",
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
        ? "Webhook token Asaas billing nao configurado."
        : "Token Asaas billing invalido.",
      payload,
      result: null,
    });

    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  try {
    const result = await processPlatformBillingAsaasWebhook(client, {
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
      errorMessage: result.reason,
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
    const message = error instanceof Error ? error.message : "Falha ao processar webhook Asaas billing.";

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
    event_type: "billing.asaas.webhook",
    target_table: "billing_payments",
    target_id: input.result?.paymentId ?? null,
    metadata: {
      provider: "asaas",
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

function readWebhookDataId(request: NextRequest, payload: JsonRecord, eventType: string | null) {
  const queryId = request.nextUrl.searchParams.get("paymentId")
    ?? request.nextUrl.searchParams.get("checkoutId")
    ?? request.nextUrl.searchParams.get("subscriptionId")
    ?? request.nextUrl.searchParams.get("id");

  if (queryId) return queryId;

  const data = readRecord(payload.data);
  const payment = readRecord(payload.payment ?? data.payment);
  const checkout = readRecord(payload.checkout ?? data.checkout);
  const subscription = readRecord(payload.subscription ?? data.subscription);
  const normalizedEvent = eventType?.trim().toUpperCase() ?? "";

  if (normalizedEvent.startsWith("CHECKOUT_")) {
    return readString(checkout.id) ?? readString(data.id) ?? readString(payload.id);
  }

  if (normalizedEvent.startsWith("SUBSCRIPTION_")) {
    return readString(subscription.id) ?? readString(data.id) ?? readString(payload.id);
  }

  return readString(payment.id)
    ?? readString(data.id)
    ?? readString(checkout.id)
    ?? readString(subscription.id)
    ?? readString(payload.id);
}

function readProviderEventId(payload: JsonRecord, dataId: string | null) {
  const id = readString(payload.id)
    ?? readString(payload.eventId)
    ?? readString(payload.event_id)
    ?? readString(payload.notificationId)
    ?? readString(payload.notification_id);

  return id && id !== dataId ? id : null;
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
