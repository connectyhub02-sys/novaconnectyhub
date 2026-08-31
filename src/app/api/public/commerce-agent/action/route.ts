import { NextResponse, type NextRequest } from "next/server";
import {
  validatePublicWriteRequest,
  type PublicWriteGuardResult,
} from "@/lib/security/public-request-guard";
import {
  readCommerceAgentBody,
  recordCommerceAgentAction,
  resolveCommerceAgentContext,
} from "@/lib/commerce-agent/server";

type JsonRecord = Record<string, unknown>;

const allowedActionTypes = new Set([
  "suggest_product",
  "add_to_cart",
  "remove_from_cart",
  "apply_order_bump",
  "create_checkout",
  "update_checkout",
  "return_to_whatsapp",
  "idle_nudge",
  "contextual_opener",
  "message",
]);

const allowedStatuses = new Set([
  "suggested",
  "accepted",
  "rejected",
  "applied",
  "failed",
  "cancelled",
]);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = validatePublicWriteRequest({
    headers: request.headers,
    requestUrl: request.url,
    routeKey: "commerce-agent-action",
    maxPayloadBytes: 24 * 1024,
    rateLimit: {
      limit: 80,
      windowMs: 60_000,
    },
  });

  if (!guard.ok) {
    return publicGuardResponse(guard);
  }

  const body = readCommerceAgentBody(await request.json().catch(() => null));
  const actionType = normalizeAllowed(readString(body.action_type) ?? readString(body.actionType), allowedActionTypes);
  const status = normalizeAllowed(readString(body.status), allowedStatuses) ?? "suggested";

  if (!actionType) {
    return NextResponse.json({ error: "Acao invalida." }, { status: 422 });
  }

  const context = await resolveCommerceAgentContext(body);

  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status === 200 ? 403 : context.status });
  }

  await recordCommerceAgentAction({
    context,
    actionType,
    status,
    requestPayload: readRecord(body.request_payload ?? body.requestPayload) ?? {},
    resultPayload: readRecord(body.result_payload ?? body.resultPayload) ?? {},
    reason: readString(body.reason),
  });

  return NextResponse.json({
    ok: true,
    commerceSessionId: context.commerceSessionId,
  });
}

function publicGuardResponse(guard: Extract<PublicWriteGuardResult, { ok: false }>) {
  const headers = guard.retryAfterSeconds
    ? { "Retry-After": String(guard.retryAfterSeconds) }
    : undefined;

  return NextResponse.json({ error: guard.message }, { status: guard.status, headers });
}

function normalizeAllowed(value: string | null, allowed: Set<string>) {
  const normalized = value?.trim().toLowerCase();
  return normalized && allowed.has(normalized) ? normalized : null;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
