import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateGatewayRequest,
  formatGatewayError,
  listGatewayContacts,
} from "@/lib/connectyhub-api/gateway";
import { asNumber, asString, readJson } from "@/lib/connectyhub-api/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContactsBody = {
  instanceId?: unknown;
  limit?: unknown;
  offset?: unknown;
  contactScope?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateGatewayRequest(request, ["instances:read"]);
    const result = await listGatewayContacts(auth, {
      instanceId: request.nextUrl.searchParams.get("instanceId") ?? "",
      limit: asNumber(request.nextUrl.searchParams.get("limit")),
      offset: asNumber(request.nextUrl.searchParams.get("offset")),
      contactScope: request.nextUrl.searchParams.get("contactScope"),
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
    const body = await readJson<ContactsBody>(request);
    const result = await listGatewayContacts(auth, {
      instanceId: asString(body?.instanceId) ?? request.nextUrl.searchParams.get("instanceId") ?? "",
      limit: asNumber(body?.limit),
      offset: asNumber(body?.offset),
      contactScope: asString(body?.contactScope),
    });

    return NextResponse.json(result);
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}
