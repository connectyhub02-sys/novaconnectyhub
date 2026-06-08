import { NextRequest } from "next/server";
import { after } from "next/server";
import { ingestUazapiWebhook } from "@/lib/whatsapp/webhook-ingest";
import { processWhatsappAgentRun } from "@/lib/whatsapp/agent-runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return Response.json({
    ok: true,
    service: "connectyhub-uazapi-webhook",
    accepts: ["connection", "history", "messages", "messages_update", "presence", "chats", "contacts"],
    secretConfigured: Boolean(process.env.UAZAPI_WEBHOOK_SECRET),
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

  if (ingest.agentRunId) {
    scheduleWhatsappAgentFallback(ingest.agentRunId);
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
    return true;
  }

  const provided =
    request.headers.get("x-uazapi-secret") ||
    request.headers.get("x-connectyhub-webhook-secret") ||
    request.nextUrl.searchParams.get("secret");

  return provided === expected;
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

function scheduleWhatsappAgentFallback(runId: string) {
  after(async () => {
    await sleep(8_000);
    await processWhatsappAgentRun({ runId }).catch((error: unknown) => {
      console.error(
        "[uazapi:webhook:fallback]",
        JSON.stringify({
          runId,
          error: error instanceof Error ? error.message : "Falha desconhecida no fallback do agente WhatsApp.",
        }),
      );
    });
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
