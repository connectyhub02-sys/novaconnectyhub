import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateGatewayRequest,
  formatGatewayError,
  testGatewayWebhookEndpoint,
} from "@/lib/connectyhub-api/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WebhookRouteContext = {
  params: Promise<{ webhookId: string }>;
};

export async function POST(request: NextRequest, ctx: WebhookRouteContext) {
  try {
    const auth = await authenticateGatewayRequest(request, ["webhooks:write"]);
    const { webhookId } = await ctx.params;
    const result = await testGatewayWebhookEndpoint(auth, webhookId);

    return NextResponse.json({ ok: result.ok, result }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}
