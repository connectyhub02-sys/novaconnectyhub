import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateGatewayRequest,
  formatGatewayError,
  listGatewayChats,
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
    const instanceId = request.nextUrl.searchParams.get("instanceId") ?? "";
    const filters = {
      limit: asNumber(request.nextUrl.searchParams.get("limit")) ?? 20,
      offset: asNumber(request.nextUrl.searchParams.get("offset")) ?? 0,
      sort: request.nextUrl.searchParams.get("sort") ?? "-wa_lastMsgTimestamp",
      ...(request.nextUrl.searchParams.get("query") ? { name: `~${request.nextUrl.searchParams.get("query")}` } : {}),
      ...(request.nextUrl.searchParams.get("wa_isGroup") ? { wa_isGroup: request.nextUrl.searchParams.get("wa_isGroup") === "true" } : {}),
    };
    const result = await listGatewayChats(auth, { instanceId, filters });

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
    const result = await listGatewayChats(auth, {
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
