import { NextResponse } from "next/server";
import { ensureStarterOrganization, getCurrentWorkspace } from "@/lib/supabase/profile";

export async function POST() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const organization = workspace.organization ?? await ensureStarterOrganization();

  return NextResponse.json({
    organization,
    redirectPath: workspace?.profile.isPlatformAdmin ? "/admin" : "/dashboard",
  });
}
