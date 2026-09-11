import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveDashboardCompanyId, statusForDashboardCompanyScopeError } from "@/lib/client-os/dashboard-route-scope";
import { loadCatalogActivityDefaults } from "@/lib/sales-catalog/activity-defaults";

export async function GET(request: NextRequest) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  try {
    const companyId = resolveDashboardCompanyId({ workspace, requestedCompanyId: request.nextUrl.searchParams.get("companyId") });
    return NextResponse.json(await loadCatalogActivityDefaults(createServiceClient(), companyId, request.nextUrl.searchParams.get("agentId")));
  } catch (error) { return NextResponse.json({ error: "Não foi possível carregar a atividade." }, { status: statusForDashboardCompanyScopeError(error, 400) }); }
}
