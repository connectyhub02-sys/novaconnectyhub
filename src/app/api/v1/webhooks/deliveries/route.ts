import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateGatewayRequest,
  formatGatewayError,
  listGatewayWebhookDeliveries,
} from "@/lib/connectyhub-api/gateway";
import { asNumber } from "@/lib/connectyhub-api/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateGatewayRequest(request, ["webhooks:read"]);
    const deliveries = await listGatewayWebhookDeliveries(auth, {
      endpointId: request.nextUrl.searchParams.get("endpointId"),
      limit: asNumber(request.nextUrl.searchParams.get("limit")),
    });

    return NextResponse.json({ ok: true, deliveries });
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}
