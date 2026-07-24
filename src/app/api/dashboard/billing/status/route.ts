import { NextResponse } from "next/server";
import { getOrganizationBillingAccess } from "@/lib/billing/trial";
import { ensureStarterOrganization, getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const organization = workspace.organization ?? await ensureStarterOrganization();

  if (!organization) {
    return NextResponse.json({ error: "Empresa obrigatoria." }, { status: 422 });
  }

  try {
    const billingAccess = await getOrganizationBillingAccess({
      organizationId: organization.id,
    });

    return NextResponse.json({ billingAccess });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel carregar creditos." },
      { status: 500 },
    );
  }
}
