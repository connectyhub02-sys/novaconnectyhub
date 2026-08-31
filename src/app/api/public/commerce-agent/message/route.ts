import { NextResponse, type NextRequest } from "next/server";
import {
  validatePublicWriteRequest,
  type PublicWriteGuardResult,
} from "@/lib/security/public-request-guard";
import {
  buildCommerceAgentReply,
  isCommerceAgentBillingError,
  persistCommerceAgentMessage,
  readCommerceAgentBody,
  readCommerceAgentMessage,
  recordCommerceAgentAction,
  resolveCommerceAgentContext,
} from "@/lib/commerce-agent/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = validatePublicWriteRequest({
    headers: request.headers,
    requestUrl: request.url,
    routeKey: "commerce-agent-message",
    maxPayloadBytes: 24 * 1024,
    rateLimit: {
      limit: 50,
      windowMs: 60_000,
    },
  });

  if (!guard.ok) {
    return publicGuardResponse(guard);
  }

  const body = readCommerceAgentBody(await request.json().catch(() => null));
  const message = readCommerceAgentMessage(body);

  if (!message) {
    return NextResponse.json({ error: "Envie uma mensagem." }, { status: 422 });
  }

  const context = await resolveCommerceAgentContext(body);

  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status === 200 ? 403 : context.status });
  }

  await persistCommerceAgentMessage({
    context,
    role: "lead",
    content: message,
  }).catch(() => null);

  let reply: string;

  try {
    reply = await buildCommerceAgentReply({ context, message });
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : "Nao foi possivel contabilizar os creditos do atendimento na loja.";

    return NextResponse.json(
      { error: errorMessage },
      { status: isCommerceAgentBillingError(error) ? 402 : 500 },
    );
  }

  const savedReply = await persistCommerceAgentMessage({
    context,
    role: "assistant",
    content: reply,
  }).catch(() => null);

  await recordCommerceAgentAction({
    context,
    actionType: "message",
    status: "applied",
    requestPayload: { message },
    resultPayload: { reply },
  }).catch(() => undefined);

  return NextResponse.json({
    commerceSessionId: context.commerceSessionId,
    message: {
      id: savedReply?.id ?? `assistant_${Date.now().toString(36)}`,
      role: "assistant",
      content: reply,
    },
  });
}

function publicGuardResponse(guard: Extract<PublicWriteGuardResult, { ok: false }>) {
  const headers = guard.retryAfterSeconds
    ? { "Retry-After": String(guard.retryAfterSeconds) }
    : undefined;

  return NextResponse.json({ error: guard.message }, { status: guard.status, headers });
}
