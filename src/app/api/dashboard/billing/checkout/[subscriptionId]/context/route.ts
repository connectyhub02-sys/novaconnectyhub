import { NextResponse, type NextRequest } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { validatePublicWriteRequest } from "@/lib/security/public-request-guard";
export async function POST(request: NextRequest, context: { params: Promise<{ subscriptionId: string }> }) {
  const guard = validatePublicWriteRequest({ headers: request.headers, requestUrl: request.url, routeKey: "billing-context", maxPayloadBytes: 300, rateLimit: { limit: 30, windowMs: 60000 } });
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status });
  if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  if (!workspace?.organization) return NextResponse.json({}, { status: 401 });
  if (!["owner", "admin"].includes(workspace.organization.role)) return NextResponse.json({}, { status: 403 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 300) return NextResponse.json({}, { status: 413 });
  const body = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  if (!body || !["card", "pix", "pix_automatic"].includes(body.method)) return NextResponse.json({}, { status: 422 });
  const { subscriptionId } = await context.params;
  const result = await createServiceClient().rpc("record_billing_lead_context", { p_org: workspace.organization.id, p_subscription: subscriptionId, p_kind: "method_selected", p_method: body.method, p_actor: workspace.user.id });
  return NextResponse.json({ ok: !result.error }, { status: result.error ? 422 : 200, headers: { "Cache-Control": "no-store" } });
}
