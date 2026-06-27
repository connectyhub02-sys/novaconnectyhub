import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateGatewayRequest,
  formatGatewayError,
  listGatewayMessages,
} from "@/lib/connectyhub-api/gateway";
import { asNumber, asString, readJson } from "@/lib/connectyhub-api/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchBody = Record<string, unknown> & {
  instanceId?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateGatewayRequest(request, ["instances:read"]);
    const filters = {
      limit: asNumber(request.nextUrl.searchParams.get("limit")) ?? 50,
      offset: asNumber(request.nextUrl.searchParams.get("offset")) ?? 0,
      sort: request.nextUrl.searchParams.get("sort") ?? "-created",
      ...(request.nextUrl.searchParams.get("chatId") ? { chatid: request.nextUrl.searchParams.get("chatId") } : {}),
      ...(request.nextUrl.searchParams.get("number") ? { number: request.nextUrl.searchParams.get("number") } : {}),
    };
    const result = await listGatewayMessages(auth, {
      instanceId: request.nextUrl.searchParams.get("instanceId") ?? "",
      filters,
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
    const body = await readJson<SearchBody>(request);
    const filters = sanitizeFilters(body);
    const result = await listGatewayMessages(auth, {
      instanceId: asString(body?.instanceId) ?? request.nextUrl.searchParams.get("instanceId") ?? "",
      filters,
    });

    return NextResponse.json(result);
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}

function sanitizeFilters(body: SearchBody | null) {
  const filters = { ...(body ?? {}) };
  delete filters.instanceId;
  return filters;
}
