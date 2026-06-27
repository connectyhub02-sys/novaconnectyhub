import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateGatewayRequest,
  createGatewayInstance,
  formatGatewayError,
  listGatewayInstances,
} from "@/lib/connectyhub-api/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateInstanceBody = {
  name?: unknown;
  webhookUrl?: unknown;
  metadata?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateGatewayRequest(request, ["instances:read"]);
    const instances = await listGatewayInstances(auth);

    return NextResponse.json({ ok: true, instances });
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateGatewayRequest(request, ["instances:write"]);
    const body = await readJson<CreateInstanceBody>(request);
    const instance = await createGatewayInstance(auth, {
      name: asString(body?.name),
      webhookUrl: asString(body?.webhookUrl),
      metadata: body?.metadata,
    });

    return NextResponse.json({ ok: true, instance }, { status: 201 });
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
