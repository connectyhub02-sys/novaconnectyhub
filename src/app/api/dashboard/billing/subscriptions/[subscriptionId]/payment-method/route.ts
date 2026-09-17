import { NextResponse, type NextRequest } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { CardReplacementError, isReplacementId, readCardReplacement, replaceSubscriptionCard } from "@/lib/billing/card-replacement";
import { readClientIp, validatePublicWriteRequest } from "@/lib/security/public-request-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;
type Context = { params: Promise<{ subscriptionId: string }> };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function scope(context: Context) {
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  if (!workspace?.organization) throw new CardReplacementError("forbidden", 401);
  const { subscriptionId } = await context.params;
  if (!isReplacementId(subscriptionId)) throw new CardReplacementError("not_found");
  return { organizationId: workspace.organization.id, actorId: workspace.user.id, subscriptionId };
}
function errorResponse(error: unknown) {
  const safe = error instanceof CardReplacementError ? error : new CardReplacementError("internal_error");
  return json({ error: safe.message, code: safe.code }, safe.status);
}
export async function GET(request: NextRequest, context: Context) {
  try {
    const current = await scope(context);
    const requestId = request.nextUrl.searchParams.get("requestId") ?? undefined;
    if (requestId && !isReplacementId(requestId)) throw new CardReplacementError("invalid_input");
    return json(await readCardReplacement(createServiceClient(), current, requestId));
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const current = await scope(context);
    const guard = validatePublicWriteRequest({ headers: request.headers, requestUrl: request.url, routeKey: "billing-card-replacement", maxPayloadBytes: 12000, rateLimit: { limit: 10, windowMs: 60000 } });
    if (!guard.ok) return json({ error: guard.message }, guard.status);
    // Cookie-authenticated mutations require the same origin and JSON, regardless
    // of unrelated public tracking origins allowed by the shared guard.
    if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Origem ou formato não autorizado." }, 403);
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 12000) return json({ error: "Payload grande demais." }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { throw new CardReplacementError("invalid_input"); }
    return json(await replaceSubscriptionCard(createServiceClient(), current, body, readClientIp(request.headers)));
  } catch (error) { return errorResponse(error); }
}
