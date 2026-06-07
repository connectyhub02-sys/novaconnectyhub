import { NextResponse } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export async function POST() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  return NextResponse.json({
    organization: workspace.organization,
    redirectPath: workspace?.profile.isPlatformAdmin ? "/admin" : "/dashboard",
  });
}
