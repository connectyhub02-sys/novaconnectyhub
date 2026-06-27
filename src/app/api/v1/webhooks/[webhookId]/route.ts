import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateGatewayRequest,
  deleteGatewayWebhookEndpoint,
  formatGatewayError,
  getGatewayWebhookEndpoint,
  updateGatewayWebhookEndpoint,
} from "@/lib/connectyhub-api/gateway";
import { asString, asStringArray, readJson } from "@/lib/connectyhub-api/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WebhookRouteContext = {
  params: Promise<{ webhookId: string }>;
};

type UpdateWebhookBody = {
  url?: unknown;
  description?: unknown;
  events?: unknown;
  status?: unknown;
};

export async function GET(request: NextRequest, ctx: WebhookRouteContext) {
  try {
    const auth = await authenticateGatewayRequest(request, ["webhooks:read"]);
    const { webhookId } = await ctx.params;
    const webhook = await getGatewayWebhookEndpoint(auth, webhookId);

    return NextResponse.json({ ok: true, webhook });
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}

export async function PATCH(request: NextRequest, ctx: WebhookRouteContext) {
  try {
    const auth = await authenticateGatewayRequest(request, ["webhooks:write"]);
    const { webhookId } = await ctx.params;
    const body = await readJson<UpdateWebhookBody>(request);
    const webhook = await updateGatewayWebhookEndpoint(auth, webhookId, {
      url: body && "url" in body ? asString(body.url) : undefined,
      description: body && "description" in body ? asString(body.description) : undefined,
      events: body && "events" in body ? asStringArray(body.events) ?? [] : undefined,
      status: body && "status" in body ? asString(body.status) : undefined,
    });

    return NextResponse.json({ ok: true, webhook });
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}

export async function DELETE(request: NextRequest, ctx: WebhookRouteContext) {
  try {
    const auth = await authenticateGatewayRequest(request, ["webhooks:write"]);
    const { webhookId } = await ctx.params;
    const webhook = await deleteGatewayWebhookEndpoint(auth, webhookId);

    return NextResponse.json({ ok: true, webhook });
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}
