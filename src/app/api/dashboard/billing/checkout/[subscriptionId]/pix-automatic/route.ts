import { NextResponse, type NextRequest } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { beginPixCheckout, loadPixMandate, pixCheckoutSnapshot } from "@/lib/billing/pix-automatic";
import { requireBillingAddress } from "@/lib/billing/billing-address-store";
import { CheckoutError } from "@/lib/sales-catalog/transparent-checkout";
import { PixAutomaticError } from "@/lib/billing/asaas-pix-automatic-api";
import { assertAccountComplete, loadAccountDocument } from "@/lib/account/signup-completion";
import { validatePublicWriteRequest } from "@/lib/security/public-request-guard";
import { record } from "@/lib/sales-catalog/card-input";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
type Context = { params: Promise<{ subscriptionId: string }> };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function scope(context: Context) {
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  if (!workspace?.organization) throw new PixAutomaticError("forbidden", 401);
  if (!["owner", "admin"].includes(workspace.organization.role)) throw new PixAutomaticError("forbidden", 403);
  const { subscriptionId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subscriptionId)) throw new PixAutomaticError("not_found", 404);
  return { workspace: { ...workspace, organization: workspace.organization }, subscriptionId };
}
function failure(error: unknown) {
  if (error instanceof CheckoutError) return json({ error: error.message }, error.status);
  const safe = error instanceof PixAutomaticError ? error : new PixAutomaticError("unavailable", 503);
  return json({ error: safe.message, code: safe.code }, safe.status);
}
export async function GET(request: NextRequest, context: Context) {
  try {
    const { workspace, subscriptionId } = await scope(context);
    return json(await pixCheckoutSnapshot(createServiceClient(), workspace.organization.id, subscriptionId, new URL(request.url).searchParams.get("reconcile") === "1"));
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const { workspace, subscriptionId } = await scope(context);
    const guard = validatePublicWriteRequest({ headers: request.headers, requestUrl: request.url, routeKey: "billing-pix-automatic", maxPayloadBytes: 3000, rateLimit: { limit: 10, windowMs: 60000 } });
    if (!guard.ok) return json({ error: guard.message }, guard.status);
    if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Origem ou formato não autorizado." }, 403);
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 3000) return json({ error: "Payload grande demais." }, 413);
    let body: Record<string, unknown>;
    try { body = record(JSON.parse(raw)); } catch { throw new PixAutomaticError("invalid_input", 422); }
    const client = createServiceClient();
    await assertAccountComplete({ userId: workspace.user.id, client });
    const existing = await loadPixMandate(client, workspace.organization.id, subscriptionId);
    if (!existing || ["failed", "REFUSED"].includes(existing.state)) await requireBillingAddress(client, workspace.organization.id);
    const document = await loadAccountDocument({ userId: workspace.user.id, client });
    const authorization = await beginPixCheckout(client, { organizationId: workspace.organization.id, subscriptionId, actorId: workspace.user.id }, body, { name: workspace.profile.fullName ?? workspace.organization.name, email: workspace.profile.email ?? workspace.user.email ?? "", phone: workspace.profile.phone ?? "", cpfCnpj: document?.number ?? "" });
    return json({ ok: true, authorization });
  } catch (error) { return failure(error); }
}
