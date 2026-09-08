import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthenticatedEntryPath } from "@/lib/auth/route-destinations";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Authentication must work before the dashboard applies the contract restrictions.
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  const target = resolveAuthenticatedEntryPath({
    isPlatformAdmin: workspace?.profile.isPlatformAdmin,
  });

  return NextResponse.redirect(new URL(target, request.url));
}
