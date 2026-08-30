import { NextResponse, type NextRequest } from "next/server";
import {
  validatePublicWriteRequest,
  type PublicWriteGuardResult,
} from "@/lib/security/public-request-guard";
import {
  buildCommerceAgentSessionPayload,
  readCommerceAgentBody,
  resolveCommerceAgentContext,
} from "@/lib/commerce-agent/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = validatePublicWriteRequest({
    headers: request.headers,
    requestUrl: request.url,
    routeKey: "commerce-agent-session",
    maxPayloadBytes: 32 * 1024,
    rateLimit: {
      limit: 80,
      windowMs: 60_000,
    },
  });

  if (!guard.ok) {
    return publicGuardResponse(guard);
  }

  const body = readCommerceAgentBody(await request.json().catch(() => null));
  const context = await resolveCommerceAgentContext(body);

  if (!context.ok) {
    return context.status === 200
      ? NextResponse.json({ enabled: false })
      : NextResponse.json({ enabled: false, error: context.error }, { status: context.status });
  }

  const payload = await buildCommerceAgentSessionPayload(context);

  return NextResponse.json(payload);
}

function publicGuardResponse(guard: Extract<PublicWriteGuardResult, { ok: false }>) {
  const headers = guard.retryAfterSeconds
    ? { "Retry-After": String(guard.retryAfterSeconds) }
    : undefined;

  return NextResponse.json({ enabled: false, error: guard.message }, { status: guard.status, headers });
}
