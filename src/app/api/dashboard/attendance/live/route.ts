import { NextResponse, type NextRequest } from "next/server";
import { currentOrganizationToClientCompany } from "@/lib/client-os/current-company";
import { getClientLeadCrmWorkspace } from "@/lib/client-os/leads-crm";
import {
  listClientSalesCatalogOrders,
  listClientSalesCatalogPaymentSessions,
} from "@/lib/client-os/sales-catalog";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const workspace = await getCurrentWorkspace();

    if (!workspace) {
      return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
    }

    if (!workspace.organization) {
      return NextResponse.json({ error: "Empresa obrigatoria." }, { status: 400 });
    }

    const includeCommerce = request.nextUrl.searchParams.get("commerce") !== "0";
    const organization = workspace.organization;
    const company = currentOrganizationToClientCompany(organization);
    const leadWorkspacePromise = getClientLeadCrmWorkspace({
      userId: workspace.user.id,
      organizationId: organization.id,
      company,
      includeEvents: false,
      leadLimit: 70,
      messageLimit: 40,
      syncAvatars: false,
    });
    const commercePromise = includeCommerce
      ? Promise.all([
          listClientSalesCatalogOrders({
            userId: workspace.user.id,
            companyId: organization.id,
          }).catch(() => []),
          listClientSalesCatalogPaymentSessions({
            userId: workspace.user.id,
            companyId: organization.id,
          }).catch(() => []),
        ])
      : Promise.resolve([[], []] as const);
    const [leadWorkspace, [salesCatalogOrders, salesCatalogPaymentSessions]] = await Promise.all([
      leadWorkspacePromise,
      commercePromise,
    ]);

    return NextResponse.json(
      {
        ok: true,
        refreshedAt: new Date().toISOString(),
        salesCatalogOrders,
        salesCatalogPaymentSessions,
        workspace: leadWorkspace,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("[AttendanceLive] Falha ao atualizar atendimento", error);

    return NextResponse.json(
      { error: "Nao foi possivel atualizar o atendimento agora." },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 503,
      },
    );
  }
}
