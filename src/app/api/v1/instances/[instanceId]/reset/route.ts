import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateGatewayRequest,
  formatGatewayError,
  resetGatewayInstance,
} from "@/lib/connectyhub-api/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InstanceRouteContext = {
  params: Promise<{ instanceId: string }>;
};

export async function POST(request: NextRequest, ctx: InstanceRouteContext) {
  try {
    const auth = await authenticateGatewayRequest(request, ["instances:write"]);
    const { instanceId } = await ctx.params;
    const result = await resetGatewayInstance(auth, instanceId);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}
