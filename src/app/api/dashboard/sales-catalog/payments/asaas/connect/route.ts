import { NextResponse, type NextRequest } from "next/server";
import { assertBillableAccess } from "@/lib/billing/trial";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { resolveDashboardCompanyId } from "@/lib/client-os/dashboard-route-scope";
import {
  mapSalesCatalogPaymentIntegration,
  type SalesCatalogPaymentIntegrationRow,
} from "@/lib/client-os/sales-catalog";
import { saveAsaasPaymentIntegration } from "@/lib/sales-catalog/asaas";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente para conectar o Asaas." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as JsonRecord | null;
  const requestedCompanyId = readString(body?.companyId);
  const accessToken = readString(body?.accessToken ?? body?.apiKey);
  const mode = readString(body?.mode) === "sandbox" ? "sandbox" : "production";

  if (!accessToken) {
    return NextResponse.json({ error: "Informe a API Key do Asaas." }, { status: 422 });
  }

  try {
    const client = createServiceClient();
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId,
    });
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });

    await assertBillableAccess({ organizationId: company.id, client });

    const integration = await saveAsaasPaymentIntegration({
      client,
      organizationId: company.id,
      accessToken,
      mode,
      actorId: workspace.user.id,
      webhookEmail: workspace.profile.email ?? workspace.user.email ?? null,
    });

    return NextResponse.json({
      integration: mapSalesCatalogPaymentIntegration(integration as SalesCatalogPaymentIntegrationRow),
    });
  } catch (error) {
    console.error("[sales-catalog] asaas connect failed", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel conectar o Asaas.",
    }, { status: 500 });
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
