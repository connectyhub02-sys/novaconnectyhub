import { NextResponse, type NextRequest } from "next/server";
import { resolvePlanFeatureEntitlement } from "@/lib/billing/plan-entitlements";
import { assertBillableAccess, BillingAccessError } from "@/lib/billing/trial";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import {
  resolveDashboardCompanyId,
  statusForDashboardCompanyScopeError,
} from "@/lib/client-os/dashboard-route-scope";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import {
  listTrafficAiOperations,
  prepareTrafficAiExecutionDraft,
  updateTrafficAiExecutionDraftStatus,
  type TrafficAiExecutionDraftStatus,
} from "@/lib/traffic/traffic-ai-operations";
import type { TrafficManagerPlatform } from "@/lib/traffic/traffic-ai-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TrafficExecutionBody = {
  actionItemId?: unknown;
  companyId?: unknown;
  draftId?: unknown;
  platform?: unknown;
  status?: unknown;
};

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await readJson(request);
  const actionItemId = readString(body?.actionItemId);
  const requestedCompanyId = readString(body?.companyId);
  const platform = normalizePlatform(readString(body?.platform));

  if (!actionItemId || !platform) {
    return NextResponse.json({ error: "Informe empresa, plataforma e acao." }, { status: 400 });
  }

  try {
    const client = createServiceClient();
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId,
      missingMessage: "Informe empresa, plataforma e acao.",
    });
    const company = await requireWritableTrafficCompany({
      client,
      companyId,
      isPlatformAdmin: workspace.profile.isPlatformAdmin,
      userId: workspace.user.id,
    });
    const executionDraft = await prepareTrafficAiExecutionDraft({
      actionItemId,
      client,
      organizationId: company.id,
      userId: workspace.user.id,
    });
    const operations = await listTrafficAiOperations({
      client,
      organizationId: company.id,
      platform,
    });

    return NextResponse.json({
      executionDraft,
      operations,
      notice: { tone: "green", message: "Rascunho de execucao preparado para aprovacao." },
    });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: statusForError(error) });
  }
}

export async function PATCH(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await readJson(request);
  const requestedCompanyId = readString(body?.companyId);
  const draftId = readString(body?.draftId);
  const platform = normalizePlatform(readString(body?.platform));
  const status = normalizeExecutionStatus(readString(body?.status));

  if (!draftId || !platform || !status) {
    return NextResponse.json({ error: "Informe empresa, plataforma, rascunho e status." }, { status: 400 });
  }

  try {
    const client = createServiceClient();
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId,
      missingMessage: "Informe empresa, plataforma, rascunho e status.",
    });
    const company = await requireWritableTrafficCompany({
      client,
      companyId,
      isPlatformAdmin: workspace.profile.isPlatformAdmin,
      userId: workspace.user.id,
    });
    const executionDraft = await updateTrafficAiExecutionDraftStatus({
      client,
      draftId,
      organizationId: company.id,
      status,
      userId: workspace.user.id,
    });
    const operations = await listTrafficAiOperations({
      client,
      organizationId: company.id,
      platform,
    });

    return NextResponse.json({
      executionDraft,
      operations,
      notice: { tone: "green", message: "Rascunho de execucao atualizado." },
    });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: statusForError(error) });
  }
}

async function requireWritableTrafficCompany(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  isPlatformAdmin: boolean;
  userId: string;
}) {
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId,
    client: input.client,
  });
  const entitlement = resolvePlanFeatureEntitlement("ai_traffic_manager", {
    isPlatformAdmin: input.isPlatformAdmin,
    organizationStatus: company.status,
    planCode: company.planCode,
  });

  if (!entitlement.allowed) {
    throw new Error(entitlement.description);
  }

  if (!["owner", "admin"].includes(company.role)) {
    throw new Error("Somente dono ou admin pode preparar execucoes do Gestor IA.");
  }

  await assertBillableAccess({ organizationId: company.id, client: input.client });

  return company;
}

async function readJson(request: NextRequest): Promise<TrafficExecutionBody | null> {
  try {
    const value = await request.json();
    return readRecord(value) as TrafficExecutionBody | null;
  } catch {
    return null;
  }
}

function normalizePlatform(value: string | null): TrafficManagerPlatform | null {
  if (value === "meta" || value === "google") {
    return value;
  }

  return null;
}

function normalizeExecutionStatus(value: string | null): TrafficAiExecutionDraftStatus | null {
  if (value === "drafted" || value === "approved" || value === "applied" || value === "cancelled" || value === "failed") {
    return value;
  }

  return null;
}

function formatError(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "Nao foi possivel preparar execucao assistida.",
    ...(error instanceof BillingAccessError ? { billingAccess: error.status } : {}),
  };
}

function statusForError(error: unknown) {
  const scopeStatus = statusForDashboardCompanyScopeError(error, 0);

  if (scopeStatus) {
    return scopeStatus;
  }

  if (error instanceof BillingAccessError) {
    return 402;
  }

  const message = error instanceof Error ? error.message : "";
  if (message.includes("Somente dono") || message.includes("plano") || message.includes("Scale")) {
    return 403;
  }

  return 400;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
