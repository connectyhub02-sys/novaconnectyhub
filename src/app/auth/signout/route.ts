import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { revokeAdminAssistedAccess } from "@/lib/admin-assisted-access";

export async function GET(request: NextRequest) {
  if (isSupabaseAuthConfigured()) {
    await revokeAdminAssistedAccess();
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  return NextResponse.redirect(new URL("/login", request.url));
}
