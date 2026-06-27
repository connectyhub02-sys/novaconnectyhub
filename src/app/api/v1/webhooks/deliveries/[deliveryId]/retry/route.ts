import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateGatewayRequest,
  formatGatewayError,
  retryGatewayWebhookDelivery,
} from "@/lib/connectyhub-api/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeliveryRouteContext = {
  params: Promise<{ deliveryId: string }>;
};

export async function POST(request: NextRequest, ctx: DeliveryRouteContext) {
  try {
    const auth = await authenticateGatewayRequest(request, ["webhooks:write"]);
    const { deliveryId } = await ctx.params;
    const result = await retryGatewayWebhookDelivery(auth, deliveryId);

    return NextResponse.json({ ok: result.ok, result }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}
