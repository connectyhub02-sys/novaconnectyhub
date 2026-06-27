import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateGatewayRequest,
  formatGatewayError,
  getGatewayChatDetails,
} from "@/lib/connectyhub-api/gateway";
import { asBoolean, asString, readJson } from "@/lib/connectyhub-api/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatDetailsBody = {
  instanceId?: unknown;
  number?: unknown;
  chatId?: unknown;
  preview?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateGatewayRequest(request, ["instances:read"]);
    const result = await getGatewayChatDetails(auth, {
      instanceId: request.nextUrl.searchParams.get("instanceId") ?? "",
      number: request.nextUrl.searchParams.get("number") ?? request.nextUrl.searchParams.get("chatId") ?? "",
      preview: asBoolean(request.nextUrl.searchParams.get("preview")),
    });

    return NextResponse.json(result);
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateGatewayRequest(request, ["instances:read"]);
    const body = await readJson<ChatDetailsBody>(request);
    const result = await getGatewayChatDetails(auth, {
      instanceId: asString(body?.instanceId) ?? request.nextUrl.searchParams.get("instanceId") ?? "",
      number: asString(body?.number) ?? asString(body?.chatId) ?? "",
      preview: asBoolean(body?.preview),
    });

    return NextResponse.json(result);
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}
