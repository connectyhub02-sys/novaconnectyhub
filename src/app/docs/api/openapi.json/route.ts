import { NextResponse } from "next/server";
import { connectyhubOpenApiSpec } from "@/lib/connectyhub-api/openapi";

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(connectyhubOpenApiSpec, {
    headers: {
      "cache-control": "public, max-age=300",
    },
  });
}
