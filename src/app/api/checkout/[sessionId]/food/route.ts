import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { validatePublicWriteRequest } from "@/lib/security/public-request-guard";
import { loadTransparentCheckout } from "@/lib/sales-catalog/transparent-checkout";
import { prepareFoodCheckoutRevision, saveFoodCheckoutRevision } from "@/lib/sales-catalog/food-checkout";
import { record } from "@/lib/sales-catalog/card-input";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const guard = validatePublicWriteRequest({ headers: request.headers, requestUrl: request.url, routeKey: `checkout-food:${sessionId}`, maxPayloadBytes: 128 * 1024, rateLimit: { limit: 30, windowMs: 60000 } });
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status, headers });
  try {
    const body = record(await request.json()), client = createServiceClient(), snapshot = await loadTransparentCheckout(client, sessionId);
    if (snapshot.review || snapshot.order.payment_status === "confirmed" || snapshot.order.status === "cancelled") throw new Error("Este pedido precisa de conferência da loja antes de ser alterado.");
    if (body.action === "save") { await saveFoodCheckoutRevision(client, snapshot, body); return NextResponse.json({ saved: true }, { headers }); }
    if (body.action !== "load" && body.action !== "quote") return NextResponse.json({ error: "Escolha uma ação válida." }, { status: 400, headers });
    if (body.action === "quote" && !Array.isArray(body.units)) throw new Error("Confira as unidades do pedido.");
    const quote = await prepareFoodCheckoutRevision(client, snapshot, body.action === "quote" ? body.units : undefined);
    return NextResponse.json({ units: quote.units, revision: quote.revision, shipping: quote.shipping?.total ?? null, total: quote.total }, { headers });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível alterar a montagem." }, { status: 409, headers }); }
}
