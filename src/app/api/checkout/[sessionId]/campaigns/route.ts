import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assertPublicCommerceAccess } from "@/lib/sales-catalog/public-commerce-access";
import {
  applyStoreCampaign,
  listStoreCampaignOffers,
} from "@/lib/commerce/store-campaigns";
import { createSalesCatalogPixPaymentSession } from "@/lib/sales-catalog/payment-sessions";
export const runtime = "nodejs";
type Context = { params: Promise<{ sessionId: string }> };
async function access(context: Context) {
  const { sessionId } = await context.params;
  const client = createServiceClient();
  const session = await client
    .from("sales_catalog_payment_sessions")
    .select("organization_id,order_id")
    .eq("id", sessionId)
    .single();
  if (session.error) throw new Error("Checkout não encontrado.");
  await assertPublicCommerceAccess(session.data.organization_id, client);
  return { client, ...session.data };
}
export async function GET(_request: NextRequest, context: Context) {
  try {
    const s = await access(context);
    return NextResponse.json({
      offers: await listStoreCampaignOffers(
        s.client,
        s.organization_id,
        s.order_id,
      ),
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Não foi possível consultar as ofertas.",
      },
      { status: 422 },
    );
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const s = await access(context),
      body = await request.json();
    const applied = await applyStoreCampaign(
      s.client,
      s.organization_id,
      s.order_id,
      String(body.campaignId),
      String(body.optionId),
    );
    const next = await createSalesCatalogPixPaymentSession({
      client: s.client,
      organizationId: s.organization_id,
      orderId: applied.orderId,
      preferredMethod: "card",
      source: "checkout",
    });
    return NextResponse.json({
      pricing: applied.pricing,
      checkoutUrl: next.checkoutUrl,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Não foi possível aplicar a oferta.",
      },
      { status: 409 },
    );
  }
}
