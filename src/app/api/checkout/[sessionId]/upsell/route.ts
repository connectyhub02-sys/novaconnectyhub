import { PublicCommerceUnavailableError } from "@/lib/sales-catalog/public-commerce-access";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createCheckoutUpsell } from "@/lib/sales-catalog/checkout-upsell";
import { validatePublicWriteRequest } from "@/lib/security/public-request-guard";
import { record, text } from "@/lib/sales-catalog/card-input";
import { CheckoutError } from "@/lib/sales-catalog/transparent-checkout";

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const guard = validatePublicWriteRequest({ headers: request.headers, requestUrl: request.url, routeKey: "checkout-upsell", maxPayloadBytes: 4096, rateLimit: { limit: 10, windowMs: 60000 } });
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status });
  const { sessionId } = await context.params;
  const body = record(await request.json().catch(() => null));
  try { return NextResponse.json(await createCheckoutUpsell(createServiceClient(), sessionId, text(body.productId)), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return NextResponse.json({ error: (error instanceof CheckoutError || error instanceof PublicCommerceUnavailableError) ? error.message : "Não foi possível preparar esta oferta." }, { status: (error instanceof CheckoutError || error instanceof PublicCommerceUnavailableError) ? error.status : 503 }); }
}
