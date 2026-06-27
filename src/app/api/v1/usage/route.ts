import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateGatewayRequest,
  formatGatewayError,
  getGatewayUsageSummary,
} from "@/lib/connectyhub-api/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateGatewayRequest(request, ["instances:read"]);
    const usage = await getGatewayUsageSummary(auth);

    return NextResponse.json({ ok: true, usage });
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}
