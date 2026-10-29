import type { NextRequest } from "next/server";
import { socialAction } from "@/lib/social/oauth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  return socialAction(request, (await params).provider);
}
