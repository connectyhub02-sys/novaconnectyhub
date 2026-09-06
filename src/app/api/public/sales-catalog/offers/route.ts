import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { loadCommerceOffers, type CommerceOfferSurface } from "@/lib/sales-catalog/commerce-offers";
import { verifyOrganizationTrackingToken } from "@/lib/tracking/organization-attribution";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const organizationId = query.get("organization_id");
  const surface = query.get("surface") as CommerceOfferSurface;
  if (!organizationId || !["store", "product", "cart", "checkout", "confirmation"].includes(surface)) return NextResponse.json({ error: "Página não encontrada." }, { status: 404 });
  const client = createServiceClient();
  let leadId = verifyOrganizationTrackingToken(organizationId, query.get("tracking_token")) ? query.get("lead_id") : null;
  const paymentSessionId = query.get("payment_session_id");
  if (paymentSessionId) {
    const { data: session } = await client.from("sales_catalog_payment_sessions").select("order_id").eq("organization_id", organizationId).eq("id", paymentSessionId).maybeSingle();
    if (session) {
      const { data: order } = await client.from("sales_catalog_orders").select("lead_id").eq("organization_id", organizationId).eq("id", session.order_id).maybeSingle();
      leadId = order?.lead_id ?? null;
    }
  }
  try {
    const offers = await loadCommerceOffers({ client, organizationId, surface, leadId, currentProductIds: (query.get("products") ?? "").split(",").filter(Boolean).slice(0, 100) });
    return NextResponse.json({ offers }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ offers: [] }, { headers: { "Cache-Control": "private, no-store" } }); }
}
