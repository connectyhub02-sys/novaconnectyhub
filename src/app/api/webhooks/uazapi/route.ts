import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { gatewayWebhookDeliveryRequestedEventName } from "@/lib/connectyhub-api/gateway";
import { inngest } from "@/lib/inngest/client";
import { ingestUazapiWebhook } from "@/lib/whatsapp/webhook-ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return Response.json({
    ok: true,
    service: "connectyhub-uazapi-webhook",
    accepts: ["connection", "history", "messages", "messages_update", "presence", "chats", "contacts", "groups", "labels", "chat_labels", "newsletter_messages", "call", "blocks", "sender"],
    authentication: "secret_required",
  });
}

export async function POST(request: NextRequest) {
  if (!isValidWebhookRequest(request)) {
    return Response.json({ ok: false, error: "Webhook não autorizado" }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const event = extractWebhookEvent(payload, request);
  const ingest = await ingestUazapiWebhook({
    payload,
    eventType: event,
    requestUrl: request.url,
    headers: request.headers,
  });

  if (ingest.whatsappInstanceId && !ingest.duplicate) {
    await enqueueGatewayWebhookDelivery({
      payload,
      eventType: event,
      webhookEventId: ingest.eventId,
      whatsappInstanceId: ingest.whatsappInstanceId,
      ingest,
    });
  }

  console.info(
    "[uazapi:webhook]",
    JSON.stringify({
      event,
      ingestStatus: ingest.status,
      organizationId: ingest.organizationId,
      conversationId: ingest.conversationId,
      receivedAt: new Date().toISOString(),
      payloadPreview: previewPayload(payload),
    }),
  );

  return Response.json({
    ok: true,
    event,
    ingest,
    receivedAt: new Date().toISOString(),
  });
}

function isValidWebhookRequest(request: NextRequest) {
  const expected = process.env.UAZAPI_WEBHOOK_SECRET;

  if (!expected) {
    return shouldAllowUnsignedUazapiWebhook();
  }

  const provided =
    request.headers.get("x-uazapi-secret") ||
    request.headers.get("x-connectyhub-webhook-secret") ||
    request.nextUrl.searchParams.get("secret");

  return timingSafeTextEqual(provided, expected);
}

function shouldAllowUnsignedUazapiWebhook() {
  if (process.env.UAZAPI_ALLOW_UNSIGNED_WEBHOOKS === "true") {
    return true;
  }

  return process.env.NODE_ENV !== "production" && process.env.UAZAPI_ALLOW_UNSIGNED_WEBHOOKS !== "false";
}

function timingSafeTextEqual(left: string | null, right: string) {
  if (!left) {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function extractWebhookEvent(payload: unknown, request: NextRequest) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const candidates = [record.event, record.type, record.eventType, record.EventType];
    const found = candidates.find((item) => typeof item === "string" && item.length > 0);

    if (typeof found === "string") {
      return found;
    }
  }

  return request.nextUrl.searchParams.get("event") ?? "unknown";
}

function previewPayload(payload: unknown) {
  const text = JSON.stringify(payload);
  return text.length > 1200 ? `${text.slice(0, 1200)}...` : text;
}

async function enqueueGatewayWebhookDelivery(input: {
  payload: unknown;
  eventType: string;
  webhookEventId: string | null;
  whatsappInstanceId: string;
  ingest: unknown;
}) {
  await inngest
    .send({
      name: gatewayWebhookDeliveryRequestedEventName,
      data: input,
    })
    .catch((error: unknown) => {
      console.error(
        "[uazapi:webhook:gateway-delivery-enqueue]",
        JSON.stringify({
          whatsappInstanceId: input.whatsappInstanceId,
          eventType: input.eventType,
          error: error instanceof Error ? error.message : "Falha ao enfileirar entrega de webhook ao cliente API.",
        }),
      );
    });
}
