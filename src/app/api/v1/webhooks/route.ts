import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateGatewayRequest,
  createGatewayWebhookEndpoint,
  formatGatewayError,
  listGatewayWebhookEndpoints,
} from "@/lib/connectyhub-api/gateway";
import { asString, asStringArray, readJson } from "@/lib/connectyhub-api/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateWebhookBody = {
  url?: unknown;
  description?: unknown;
  events?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateGatewayRequest(request, ["webhooks:read"]);
    const webhooks = await listGatewayWebhookEndpoints(auth);

    return NextResponse.json({ ok: true, webhooks });
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateGatewayRequest(request, ["webhooks:write"]);
    const body = await readJson<CreateWebhookBody>(request);
    const result = await createGatewayWebhookEndpoint(auth, {
      url: asString(body?.url) ?? "",
      description: asString(body?.description),
      events: asStringArray(body?.events),
    });

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}
