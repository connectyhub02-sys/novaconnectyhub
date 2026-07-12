import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type EndpointRow = {
  id: string;
  organization_id: string;
  organization_integration_id: string | null;
  provider_id: string;
  status: string | null;
  secret_hash: string;
  events: string[] | null;
  received_count: number | null;
};

type JsonRecord = Record<string, unknown>;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ endpointId: string }> },
) {
  const { endpointId } = await context.params;
  const client = createServiceClient();
  const { data: endpoint, error } = await client
    .from("integration_webhook_endpoints")
    .select("id, organization_id, organization_integration_id, provider_id, status, secret_hash, events, received_count")
    .eq("id", endpointId)
    .maybeSingle<EndpointRow>();

  if (error) {
    return NextResponse.json({
      error: "Webhook Universal indisponivel. Verifique se a migration 0028 foi aplicada.",
      details: error.message,
    }, { status: 503 });
  }

  if (!endpoint || endpoint.status !== "active") {
    return NextResponse.json({ error: "Endpoint nao encontrado ou inativo." }, { status: 404 });
  }

  const providedSecret = request.headers.get("x-connectyhub-webhook-secret");

  if (!providedSecret || !safeEqual(hashSecret(providedSecret), endpoint.secret_hash)) {
    await markEndpointError(client, endpoint, "Segredo invalido ou ausente.");
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const rawBody = await request.text();
  const payload = parseJson(rawBody);
  const eventType = resolveEventType(request, payload);
  const sourceEventId = request.headers.get("x-connectyhub-source-event-id")
    ?? readString(payload?.id)
    ?? readString(payload?.event_id)
    ?? null;
  const headerSnapshot = pickHeaders(request);

  const { error: insertError } = await client.from("integration_events").insert({
    organization_id: endpoint.organization_id,
    organization_integration_id: endpoint.organization_integration_id,
    endpoint_id: endpoint.id,
    provider_id: endpoint.provider_id,
    direction: "inbound",
    event_type: eventType,
    status: "received",
    source_event_id: sourceEventId,
    payload: payload ?? { raw_body: rawBody.slice(0, 12000) },
    headers: headerSnapshot,
  });

  if (insertError) {
    await markEndpointError(client, endpoint, insertError.message);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await client
    .from("integration_webhook_endpoints")
    .update({
      received_count: (endpoint.received_count ?? 0) + 1,
      last_received_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", endpoint.id);

  await client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: endpoint.organization_id,
    source_type: "integration_webhook",
    source_id: endpoint.id,
    event_type: "integration.webhook.received",
    title: "Webhook Universal recebido",
    summary: eventType,
    confidence: 1,
    visibility: "organization",
    tags: ["integration", "universal_webhook", "lead_tracking"],
    payload: {
      provider_id: endpoint.provider_id,
      endpoint_id: endpoint.id,
      event_type: eventType,
      source_event_id: sourceEventId,
      payload,
    },
  });

  return NextResponse.json({ ok: true, event_type: eventType });
}

function resolveEventType(request: NextRequest, payload: JsonRecord | null) {
  return request.headers.get("x-connectyhub-event")
    ?? readString(payload?.event_type)
    ?? readString(payload?.type)
    ?? "custom.event";
}

function pickHeaders(request: NextRequest) {
  const allowed = [
    "content-type",
    "user-agent",
    "x-connectyhub-event",
    "x-connectyhub-source-event-id",
  ];
  const snapshot: Record<string, string> = {};

  for (const header of allowed) {
    const value = request.headers.get(header);
    if (value) {
      snapshot[header] = value.slice(0, 500);
    }
  }

  return snapshot;
}

function parseJson(value: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonRecord : { value: parsed };
  } catch {
    return null;
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hashSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function markEndpointError(client: ReturnType<typeof createServiceClient>, endpoint: EndpointRow, message: string) {
  await client
    .from("integration_webhook_endpoints")
    .update({ last_error: message })
    .eq("id", endpoint.id);
}
