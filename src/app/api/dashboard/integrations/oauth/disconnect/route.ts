import { NextResponse, type NextRequest } from "next/server";
import { assertBillableAccess, BillingAccessError } from "@/lib/billing/trial";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import {
  resolveDashboardCompanyId,
  statusForDashboardCompanyScopeError,
} from "@/lib/client-os/dashboard-route-scope";
import {
  disconnectGuidedOAuth,
  type GuidedOAuthProviderId,
} from "@/lib/client-os/guided-oauth";
import { disableGrowthProviderAssets } from "@/lib/client-os/growth-integrations";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await readJson(request);
  const requestedCompanyId = readString(body?.companyId);
  const providerId = normalizeProviderId(readString(body?.providerId));

  if (!providerId) {
    return NextResponse.json({ error: "Informe empresa e provedor." }, { status: 400 });
  }

  const client = createServiceClient();

  try {
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId,
      missingMessage: "Informe empresa e provedor.",
    });
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    await assertBillableAccess({ organizationId: company.id, client });

    if (!["owner", "admin"].includes(company.role)) {
      return NextResponse.json({ error: "Somente dono ou admin da empresa pode desconectar integracoes." }, { status: 403 });
    }

    await disconnectGuidedOAuth({
      client,
      organizationId: company.id,
      providerId,
      actorId: workspace.user.id,
    });
    await disableGrowthProviderAssets({
      client,
      organizationId: company.id,
      providerId,
    }).catch(() => null);

    return NextResponse.json({
      connection: {
        providerId,
        companyId: company.id,
        companyName: company.name,
        status: "disabled",
        label: "Desconectado",
        detail: "Conexao guiada removida desta empresa.",
        accountLabel: null,
        lastSyncAt: new Date().toISOString(),
        lastError: null,
        managementHref: null,
        metadata: {},
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel desconectar a integracao.",
      ...(error instanceof BillingAccessError ? { billingAccess: error.status } : {}),
    }, { status: statusForDashboardCompanyScopeError(error, error instanceof BillingAccessError ? 402 : 400) });
  }
}

async function readJson(request: NextRequest): Promise<JsonRecord | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
  } catch {
    return null;
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeProviderId(value: string | null): GuidedOAuthProviderId | null {
  if (value === "meta-ads" || value === "google-growth") {
    return value;
  }

  return null;
}
