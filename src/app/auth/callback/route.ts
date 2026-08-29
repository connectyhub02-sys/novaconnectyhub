import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthenticatedEntryPath } from "@/lib/auth/route-destinations";
import { ensureStarterOrganization, getCurrentWorkspace } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNext(requestUrl.searchParams.get("next")) ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  const workspace = await getCurrentWorkspace();
  await ensureStarterOrganization().catch(() => null);
  const target = resolveAuthenticatedEntryPath({
    isPlatformAdmin: workspace?.profile.isPlatformAdmin,
    nextPath: next,
  });

  return NextResponse.redirect(new URL(target, request.url));
}

function safeNext(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return null;
  }

  return next;
}
