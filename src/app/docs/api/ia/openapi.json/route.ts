import { NextResponse } from "next/server";
import { aiOpenApiSpec } from "@/lib/ai-api/openapi";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(aiOpenApiSpec, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": 'attachment; filename="connectyhub-ia-openapi.json"',
    },
  });
}
