import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateGatewayRequest,
  formatGatewayError,
  sendGatewayTextMessage,
} from "@/lib/connectyhub-api/gateway";
import { readIdempotencyKey } from "@/lib/connectyhub-api/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SendTextBody = {
  instanceId?: unknown;
  number?: unknown;
  text?: unknown;
  linkPreview?: unknown;
  trackId?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateGatewayRequest(request, ["messages:send"]);
    const body = await readJson<SendTextBody>(request);
    const result = await sendGatewayTextMessage(auth, {
      instanceId: asString(body?.instanceId) ?? "",
      number: asString(body?.number) ?? "",
      text: asString(body?.text) ?? "",
      linkPreview: typeof body?.linkPreview === "boolean" ? body.linkPreview : undefined,
      trackId: asString(body?.trackId),
      idempotencyKey: readIdempotencyKey(request),
    });

    return NextResponse.json(result);
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}

async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
