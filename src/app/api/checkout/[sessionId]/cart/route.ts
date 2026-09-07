import { PublicCommerceUnavailableError } from "@/lib/sales-catalog/public-commerce-access";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { validatePublicWriteRequest } from "@/lib/security/public-request-guard";
import { loadTransparentCheckout, publicCheckoutQuote } from "@/lib/sales-catalog/transparent-checkout";
import { setSalesCatalogCheckoutOrderBumps } from "@/lib/sales-catalog/checkout-cart";
import { record } from "@/lib/sales-catalog/card-input";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const guard = validatePublicWriteRequest({ headers: request.headers, requestUrl: request.url, routeKey: `checkout-cart:${sessionId}`, maxPayloadBytes: 8192, rateLimit: { limit: 30, windowMs: 60000 } });
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status });
  const body = record(await request.json().catch(() => null));
  if (!Array.isArray(body.selectedOrderBumpIds) || body.selectedOrderBumpIds.some(id => typeof id !== "string") || !Number.isSafeInteger(body.revision)) return NextResponse.json({ error: "Confira as ofertas do pedido." }, { status: 400 });
  try {
    const client = createServiceClient();
    const snapshot = await loadTransparentCheckout(client, sessionId);
    await setSalesCatalogCheckoutOrderBumps({ client, organizationId: snapshot.session.organization_id, orderId: snapshot.order.id, selectedProductIds: body.selectedOrderBumpIds, revision: Number(body.revision) });
    return NextResponse.json(publicCheckoutQuote(await loadTransparentCheckout(client, sessionId)), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o carrinho." }, { status: error instanceof PublicCommerceUnavailableError ? error.status : 409, headers: { "Cache-Control": "private, no-store" } });
  }
}
