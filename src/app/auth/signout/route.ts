import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { revokeAdminAssistedAccess } from "@/lib/admin-assisted-access";

export async function GET() {
  if (isSupabaseAuthConfigured()) {
    await revokeAdminAssistedAccess();
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  // A relative Location keeps the browser on its public origin behind the proxy.
  // request.url can contain the container's internal host (0.0.0.0:3000).
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/", "Cache-Control": "private, no-store" },
  });
}
