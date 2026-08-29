import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthenticatedEntryPath } from "@/lib/auth/route-destinations";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const workspace = await getCurrentWorkspace();
  const target = resolveAuthenticatedEntryPath({
    isPlatformAdmin: workspace?.profile.isPlatformAdmin,
  });

  return NextResponse.redirect(new URL(target, request.url));
}
