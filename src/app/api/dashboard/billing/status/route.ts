import { NextResponse } from "next/server";
import { getOrganizationBillingAccess } from "@/lib/billing/trial";
import { ensureStarterOrganization, getCurrentWorkspace } from "@/lib/supabase/profile";
import { estimateReplies } from "@/lib/billing/reply-estimate";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const workspace = await getCurrentWorkspace({ allowRestricted: true });

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

    const { estimatedReplies } = await estimateReplies(createServiceClient(), organization.id, billingAccess.balanceCredits);

    return NextResponse.json({ billingAccess: { ...billingAccess, estimatedReplies } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel carregar creditos." },
      { status: 500 },
    );
  }
}
