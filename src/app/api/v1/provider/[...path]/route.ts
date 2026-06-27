import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateGatewayRequest,
  formatGatewayError,
  proxyGatewayProviderRequest,
} from "@/lib/connectyhub-api/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProxyBody = {
  instanceId?: unknown;
  payload?: unknown;
};

type ProxyRouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(request: NextRequest, ctx: ProxyRouteContext) {
  return handleProxy(request, ctx, "GET");
}

export async function POST(request: NextRequest, ctx: ProxyRouteContext) {
  return handleProxy(request, ctx, "POST");
}

export async function PUT(request: NextRequest, ctx: ProxyRouteContext) {
  return handleProxy(request, ctx, "PUT");
}

export async function DELETE(request: NextRequest, ctx: ProxyRouteContext) {
  return handleProxy(request, ctx, "DELETE");
}

async function handleProxy(
  request: NextRequest,
  ctx: ProxyRouteContext,
  method: "GET" | "POST" | "PUT" | "DELETE",
) {
  try {
    const auth = await authenticateGatewayRequest(request, ["provider:proxy"]);
    const { path } = await ctx.params;
    const body = method === "GET" ? null : await readJson<ProxyBody>(request);
    const instanceId = request.nextUrl.searchParams.get("instanceId") || asString(body?.instanceId) || "";
    const result = await proxyGatewayProviderRequest(auth, {
      instanceId,
      path: `/${path.join("/")}`,
      method,
      query: request.nextUrl.searchParams,
      body: method === "GET" ? undefined : body?.payload,
      publicEndpointPrefix: "/api/v1/provider",
    });

    return NextResponse.json(result.body, { status: result.status });
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
