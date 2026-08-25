import { timingSafeEqual } from "node:crypto";
import { after, NextRequest } from "next/server";
import {
  dispatchGatewayWebhookDeliveries,
  gatewayWebhookDeliveryRequestedEventName,
} from "@/lib/connectyhub-api/gateway";
import { inngest } from "@/lib/inngest/client";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { ingestUazapiWebhook } from "@/lib/whatsapp/webhook-ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return Response.json({
    ok: true,
    service: "connectyhub-uazapi-webhook",
    accepts: ["connection", "history", "messages", "messages_update", "presence", "chats", "contacts", "groups", "labels", "chat_labels", "newsletter_messages", "call", "blocks", "sender"],
    authentication: "secret_or_instance_token_required",
  });
}

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  if (!(await isValidWebhookRequest(request, payload))) {
    return Response.json({ ok: false, error: "Webhook não autorizado" }, { status: 401 });
  }

  const event = extractWebhookEvent(payload, request);
  const ingest = await ingestUazapiWebhook({
    payload,
    eventType: event,
    requestUrl: request.url,
    headers: request.headers,
  });

  if (ingest.whatsappInstanceId && !ingest.duplicate) {
    const deliveryInput = {
      payload,
      eventType: event,
      webhookEventId: ingest.eventId,
      whatsappInstanceId: ingest.whatsappInstanceId,
      ingest,
    };
    const enqueued = await enqueueGatewayWebhookDelivery(deliveryInput);
    scheduleGatewayWebhookDeliveryFallback(deliveryInput, {
      reason: enqueued ? "post_response_guard" : "inngest_enqueue_failed",
      delayMs: enqueued ? 8_000 : 0,
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

async function isValidWebhookRequest(request: NextRequest, payload: unknown) {
  const expected = process.env.UAZAPI_WEBHOOK_SECRET;
  const provided =
    request.headers.get("x-uazapi-secret") ||
    request.headers.get("x-connectyhub-webhook-secret") ||
    request.nextUrl.searchParams.get("secret");

  if (expected && timingSafeTextEqual(provided, expected)) {
    return true;
  }

  if (!expected && shouldAllowUnsignedUazapiWebhook()) {
    return shouldAllowUnsignedUazapiWebhook();
  }

  return isValidInstanceTokenWebhook(request, payload);
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
  const text = JSON.stringify(redactSensitivePayload(payload));
  return text.length > 1200 ? `${text.slice(0, 1200)}...` : text;
}

async function isValidInstanceTokenWebhook(request: NextRequest, payload: unknown) {
  const providerInstanceId = extractProviderInstanceId(request, payload);
  const providedToken =
    request.headers.get("token") ||
    request.headers.get("x-uazapi-token") ||
    findString(payload, ["token", "instanceToken", "instance_token"]);

  if (!providerInstanceId || !providedToken) {
    return false;
  }

  const client = createServiceClient();
  const { data } = await client
    .from("whatsapp_instances")
    .select("instance_token_encrypted")
    .eq("provider", "uazapi")
    .eq("provider_instance_id", providerInstanceId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ instance_token_encrypted: string | null }>();

  if (!data?.instance_token_encrypted) {
    return false;
  }

  try {
    return timingSafeTextEqual(providedToken, decryptCredentialValue(data.instance_token_encrypted));
  } catch {
    return false;
  }
}

function extractProviderInstanceId(request: NextRequest, payload: unknown) {
  return request.nextUrl.searchParams.get("instanceId")
    ?? request.nextUrl.searchParams.get("instance_id")
    ?? request.nextUrl.searchParams.get("instance")
    ?? findString(payload, ["instanceId", "instance_id", "instanceid"]);
}

function findString(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function redactSensitivePayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitivePayload);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => {
      const normalizedKey = key.toLowerCase();

      if (
        normalizedKey.includes("token") ||
        normalizedKey.includes("secret") ||
        normalizedKey.includes("apikey") ||
        normalizedKey.includes("qrcode")
      ) {
        return [key, "__redacted__"];
      }

      return [key, redactSensitivePayload(nestedValue)];
    }),
  );
}

async function enqueueGatewayWebhookDelivery(input: {
  payload: unknown;
  eventType: string;
  webhookEventId: string | null;
  whatsappInstanceId: string;
  ingest: unknown;
}) {
  try {
    await inngest.send({
      name: gatewayWebhookDeliveryRequestedEventName,
      data: input,
    });
    return true;
  } catch (error) {
    console.error(
      "[uazapi:webhook:gateway-delivery-enqueue]",
      JSON.stringify({
        whatsappInstanceId: input.whatsappInstanceId,
        eventType: input.eventType,
        error: error instanceof Error ? error.message : "Falha ao enfileirar entrega de webhook ao cliente API.",
      }),
    );
    return false;
  }
}

function scheduleGatewayWebhookDeliveryFallback(
  input: {
    payload: unknown;
    eventType: string;
    webhookEventId: string | null;
    whatsappInstanceId: string;
    ingest: unknown;
  },
  options: {
    reason: "post_response_guard" | "inngest_enqueue_failed";
    delayMs: number;
  },
) {
  after(async () => {
    if (options.delayMs > 0) {
      await sleep(options.delayMs);
    }

    await dispatchGatewayWebhookDeliveries(input)
      .then((result) => {
        console.info(
          "[uazapi:webhook:gateway-delivery-fallback]",
          JSON.stringify({
            whatsappInstanceId: input.whatsappInstanceId,
            webhookEventId: input.webhookEventId,
            eventType: input.eventType,
            reason: options.reason,
            result,
          }),
        );
      })
      .catch((error: unknown) => {
        console.error(
          "[uazapi:webhook:gateway-delivery-fallback]",
          JSON.stringify({
            whatsappInstanceId: input.whatsappInstanceId,
            webhookEventId: input.webhookEventId,
            eventType: input.eventType,
            reason: options.reason,
            error: error instanceof Error ? error.message : "Falha ao entregar webhook ao cliente API.",
          }),
        );
      });
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
