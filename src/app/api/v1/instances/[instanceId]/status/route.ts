import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateGatewayRequest,
  formatGatewayError,
  refreshGatewayInstanceStatus,
} from "@/lib/connectyhub-api/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InstanceRouteContext = {
  params: Promise<{ instanceId: string }>;
};

export async function GET(request: NextRequest, ctx: InstanceRouteContext) {
  try {
    const auth = await authenticateGatewayRequest(request, ["instances:read"]);
    const { instanceId } = await ctx.params;
    const instance = await refreshGatewayInstanceStatus(auth, instanceId);

    return NextResponse.json({ ok: true, instance });
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}
