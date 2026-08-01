import { NextResponse, type NextRequest } from "next/server";
import { resolvePlanFeatureEntitlement } from "@/lib/billing/plan-entitlements";
import { assertBillableAccess, BillingAccessError } from "@/lib/billing/trial";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import {
  createTrafficAiActionItem,
  listTrafficAiOperations,
  updateTrafficAiActionStatus,
  type TrafficAiActionStatus,
} from "@/lib/traffic/traffic-ai-operations";
import type {
  TrafficManagerPlatform,
  TrafficManagerRecommendation,
} from "@/lib/traffic/traffic-ai-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TrafficActionsBody = {
  actionItemId?: unknown;
  companyId?: unknown;
  platform?: unknown;
  recommendation?: unknown;
  status?: unknown;
};

export async function GET(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const requestedCompanyId = readString(request.nextUrl.searchParams.get("companyId"));
  const platform = normalizePlatform(readString(request.nextUrl.searchParams.get("platform")));

  if (!workspace.organization?.id) {
    return NextResponse.json({ error: "Informe a empresa." }, { status: 422 });
  }

  if (requestedCompanyId && requestedCompanyId !== workspace.organization.id) {
    return NextResponse.json({ error: "Empresa fora do workspace atual." }, { status: 403 });
  }

  const companyId = requestedCompanyId || workspace.organization.id;

  try {
    const client = createServiceClient();
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    const operations = await listTrafficAiOperations({
      client,
      organizationId: company.id,
      platform,
    });

    return NextResponse.json(operations);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel carregar operacoes do Gestor IA.",
    }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await readJson(request);
  const requestedCompanyId = readString(body?.companyId);
  const platform = normalizePlatform(readString(body?.platform));
  const recommendation = readRecommendation(body?.recommendation);

  if (!workspace.organization?.id) {
    return NextResponse.json({ error: "Informe empresa, plataforma e recomendacao." }, { status: 400 });
  }

  if (requestedCompanyId && requestedCompanyId !== workspace.organization.id) {
    return NextResponse.json({ error: "Empresa fora do workspace atual." }, { status: 403 });
  }

  const companyId = requestedCompanyId || workspace.organization.id;

  if (!platform || !recommendation) {
    return NextResponse.json({ error: "Informe empresa, plataforma e recomendacao." }, { status: 400 });
  }

  try {
    const client = createServiceClient();
    const company = await requireWritableTrafficCompany({
      client,
      companyId,
      isPlatformAdmin: workspace.profile.isPlatformAdmin,
      userId: workspace.user.id,
    });
    const actionItem = await createTrafficAiActionItem({
      client,
      organizationId: company.id,
      platform,
      recommendation,
      userId: workspace.user.id,
    });
    const operations = await listTrafficAiOperations({
      client,
      organizationId: company.id,
      platform,
    });

    return NextResponse.json({
      actionItem,
      operations,
      notice: { tone: "green", message: "Acao enviada para a fila do Gestor IA." },
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
  const platform = normalizePlatform(readString(body?.platform));
  const actionItemId = readString(body?.actionItemId);
  const status = normalizeActionStatus(readString(body?.status));

  if (!workspace.organization?.id) {
    return NextResponse.json({ error: "Informe empresa, plataforma, acao e status." }, { status: 400 });
  }

  if (requestedCompanyId && requestedCompanyId !== workspace.organization.id) {
    return NextResponse.json({ error: "Empresa fora do workspace atual." }, { status: 403 });
  }

  const companyId = requestedCompanyId || workspace.organization.id;

  if (!platform || !actionItemId || !status) {
    return NextResponse.json({ error: "Informe empresa, plataforma, acao e status." }, { status: 400 });
  }

  try {
    const client = createServiceClient();
    const company = await requireWritableTrafficCompany({
      client,
      companyId,
      isPlatformAdmin: workspace.profile.isPlatformAdmin,
      userId: workspace.user.id,
    });
    const actionItem = await updateTrafficAiActionStatus({
      actionItemId,
      client,
      organizationId: company.id,
      status,
    });
    const operations = await listTrafficAiOperations({
      client,
      organizationId: company.id,
      platform,
    });

    return NextResponse.json({
      actionItem,
      operations,
      notice: { tone: "green", message: "Status da acao atualizado." },
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
    throw new Error("Somente dono ou admin pode operar a fila do Gestor IA.");
  }

  await assertBillableAccess({ organizationId: company.id, client: input.client });

  return company;
}

function readRecommendation(value: unknown): TrafficManagerRecommendation | null {
  const record = readRecord(value);
  const id = readString(record?.id);
  const priority = normalizePriority(readString(record?.priority));
  const category = normalizeCategory(readString(record?.category));
  const title = readString(record?.title);

  if (!id || !priority || !category || !title) {
    return null;
  }

  return {
    id,
    priority,
    category,
    title,
    detail: readString(record?.detail) ?? "",
    action: readString(record?.action) ?? "",
    impact: readString(record?.impact) ?? "",
    metricLabel: readString(record?.metricLabel) ?? "",
    metricValue: readString(record?.metricValue) ?? "",
  };
}

async function readJson(request: NextRequest): Promise<TrafficActionsBody | null> {
  try {
    const value = await request.json();
    return readRecord(value) as TrafficActionsBody | null;
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

function normalizeActionStatus(value: string | null): TrafficAiActionStatus | null {
  if (
    value === "suggested"
    || value === "queued"
    || value === "approved"
    || value === "in_progress"
    || value === "done"
    || value === "dismissed"
  ) {
    return value;
  }

  return null;
}

function normalizePriority(value: string | null): TrafficManagerRecommendation["priority"] | null {
  if (value === "critical" || value === "high" || value === "medium" || value === "low") {
    return value;
  }

  return null;
}

function normalizeCategory(value: string | null): TrafficManagerRecommendation["category"] | null {
  if (
    value === "tracking"
    || value === "creative"
    || value === "budget"
    || value === "conversion"
    || value === "organic"
    || value === "sync"
  ) {
    return value;
  }

  return null;
}

function formatError(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "Nao foi possivel operar a fila do Gestor IA.",
    ...(error instanceof BillingAccessError ? { billingAccess: error.status } : {}),
  };
}

function statusForError(error: unknown) {
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
