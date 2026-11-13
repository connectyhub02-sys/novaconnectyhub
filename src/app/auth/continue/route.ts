import { NextResponse } from "next/server";
import { resolveAuthenticatedEntryPath } from "@/lib/auth/route-destinations";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";

export async function GET() {
  // Authentication must work before the dashboard applies the contract restrictions.
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  const target = resolveAuthenticatedEntryPath({
    isPlatformAdmin: workspace?.profile.isPlatformAdmin,
  });

  // Keep the public browser origin; the reverse proxy may expose the container
  // address (0.0.0.0:3000) in request.url.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: target, "Cache-Control": "private, no-store" },
  });
}
