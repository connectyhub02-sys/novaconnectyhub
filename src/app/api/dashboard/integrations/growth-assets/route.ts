import { NextResponse, type NextRequest } from "next/server";
import { assertBillableAccess, BillingAccessError } from "@/lib/billing/trial";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import {
  getGrowthIntegrationAssets,
  isGrowthProviderId,
  summarizeGrowthAssets,
} from "@/lib/client-os/growth-integrations";
import { executeGrowthIntegrationSync } from "@/lib/client-os/growth-sync";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

export async function GET(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const companyId = request.nextUrl.searchParams.get("companyId")?.trim();
  const providerId = normalizeProviderId(request.nextUrl.searchParams.get("providerId"));

  if (!companyId) {
    return NextResponse.json({ error: "Informe a empresa." }, { status: 400 });
  }

  const client = createServiceClient();

  try {
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    const result = await getGrowthIntegrationAssets({
      client,
      organizationIds: [company.id],
      providerId,
    });

    return NextResponse.json({
      schemaReady: result.ready,
      schemaMessage: result.ready ? null : result.message ?? "Migration 0045 pendente.",
      assets: result.rows,
      summary: summarizeGrowthAssets(result.rows),
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel carregar assets.",
    }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await readJson(request);
  const companyId = readString(body?.companyId);
  const providerId = normalizeProviderId(readString(body?.providerId));

  if (!companyId || !providerId) {
    return NextResponse.json({ error: "Informe empresa e provedor." }, { status: 400 });
  }

  const client = createServiceClient();

  try {
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    await assertBillableAccess({ organizationId: company.id, client });

    if (!["owner", "admin"].includes(company.role)) {
      return NextResponse.json({ error: "Somente dono ou admin pode solicitar sincronizacao." }, { status: 403 });
    }

    const sync = await executeGrowthIntegrationSync({
      actorId: workspace.user.id,
      client,
      organizationId: company.id,
      providerId,
    });

    return NextResponse.json({ sync });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel criar sincronizacao.",
      ...(error instanceof BillingAccessError ? { billingAccess: error.status } : {}),
    }, { status: error instanceof BillingAccessError ? 402 : 400 });
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

function normalizeProviderId(value: string | null): "meta-ads" | "google-growth" | null {
  return isGrowthProviderId(value) ? value : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
