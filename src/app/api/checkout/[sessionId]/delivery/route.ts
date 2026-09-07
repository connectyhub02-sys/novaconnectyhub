import { PublicCommerceUnavailableError } from "@/lib/sales-catalog/public-commerce-access";
import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { validatePublicWriteRequest } from "@/lib/security/public-request-guard";
import { loadCheckoutDelivery, publicDeliveryQuote, saveCheckoutDelivery } from "@/lib/sales-catalog/checkout-delivery";
import { CheckoutError } from "@/lib/sales-catalog/transparent-checkout";
import { record } from "@/lib/sales-catalog/card-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ sessionId: string }> };
export async function GET(_request: NextRequest, context: Context) {
  try { return NextResponse.json(publicDeliveryQuote(await loadCheckoutDelivery(createServiceClient(), (await context.params).sessionId)), { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  const { sessionId } = await context.params;
  const guard = validatePublicWriteRequest({ headers: request.headers, requestUrl: request.url, routeKey: `checkout-delivery:${sessionId}`, maxPayloadBytes: 8192, rateLimit: { limit: 30, windowMs: 60000 } });
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status, headers });
  const body = record(await request.json().catch(() => null));
  try {
    const client = createServiceClient();
    if (body.action === "quote") return NextResponse.json(publicDeliveryQuote(await loadCheckoutDelivery(client, sessionId, record(body.customer))), { headers });
    if (body.action !== "save") return NextResponse.json({ error: "Escolha calcular ou confirmar a entrega." }, { status: 400, headers });
    const result = await saveCheckoutDelivery(client, sessionId, body);
    revalidatePath(`/checkout/${sessionId}`);
    return NextResponse.json(result, { headers });
  } catch (error) { return failure(error); }
}
function failure(error: unknown) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível conferir a entrega." }, { status: (error instanceof CheckoutError || error instanceof PublicCommerceUnavailableError) ? error.status : 503, headers }); }
