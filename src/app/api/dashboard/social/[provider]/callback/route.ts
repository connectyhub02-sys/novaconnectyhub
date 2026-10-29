import type { NextRequest } from "next/server";
import { socialCallback } from "@/lib/social/oauth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  return socialCallback(request, (await params).provider);
}
