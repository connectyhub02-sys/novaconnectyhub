import { NextResponse } from "next/server";
import { ensureStarterOrganization, getCurrentWorkspace } from "@/lib/supabase/profile";

export async function POST() {
  const organization = await ensureStarterOrganization();

  if (!organization) {
    return NextResponse.json({ error: "Sessao obrigatoria ou organizacao nao criada." }, { status: 401 });
  }

  const workspace = await getCurrentWorkspace();

  return NextResponse.json({
    organization,
    redirectPath: workspace?.profile.isPlatformAdmin ? "/admin" : "/dashboard",
  });
}
