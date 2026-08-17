import { NextResponse, type NextRequest } from "next/server";
import { assertBillableAccess, BillingAccessError } from "@/lib/billing/trial";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import {
  resolveDashboardCompanyId,
  statusForDashboardCompanyScopeError,
} from "@/lib/client-os/dashboard-route-scope";
import {
  getSalesCatalogImportJob,
  updateSalesCatalogImportItems,
  type SalesCatalogImportDestination,
  type SalesCatalogImportItemPatch,
  type SalesCatalogImportItemStatus,
} from "@/lib/sales-catalog/importer";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

export async function GET(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  try {
    const { jobId } = await context.params;
    const client = createServiceClient();
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId: readString(request.nextUrl.searchParams.get("companyId")),
      missingMessage: "Escolha uma empresa antes de abrir a importacao.",
    });
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    const importJob = await getSalesCatalogImportJob({
      client,
      companyId: company.id,
      jobId,
    });

    return NextResponse.json({ importJob });
  } catch (error) {
    return NextResponse.json(formatRouteError(error, "Erro ao carregar importacao."), { status: statusForRouteError(error, 500) });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  try {
    const { jobId } = await context.params;
    const body = readRecord(await request.json().catch(() => null)) ?? {};
    const patches = readItemPatches(body.patches);

    if (patches.length === 0) {
      return NextResponse.json({ error: "Envie ao menos um item para atualizar." }, { status: 422 });
    }

    const client = createServiceClient();
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId: readString(body.companyId),
      missingMessage: "Escolha uma empresa antes de editar a importacao.",
    });
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    await assertBillableAccess({ organizationId: company.id, client });

    await updateSalesCatalogImportItems({
      client,
      companyId: company.id,
      jobId,
      patches,
    });

    const importJob = await getSalesCatalogImportJob({
      client,
      companyId: company.id,
      jobId,
    });

    return NextResponse.json({ importJob });
  } catch (error) {
    return NextResponse.json(formatRouteError(error, "Erro ao editar itens importados."), { status: statusForRouteError(error, 500) });
  }
}

function readItemPatches(value: unknown): SalesCatalogImportItemPatch[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): SalesCatalogImportItemPatch | null => {
      const record = readRecord(item);
      const id = readString(record?.id);
      if (!id) return null;

      const patch: SalesCatalogImportItemPatch = { id };
      const status = normalizeItemStatus(readString(record?.status));
      const salesDestination = normalizeSalesDestination(readString(record?.salesDestination));
      const title = readString(record?.title);

      if (status) patch.status = status;
      if (salesDestination) patch.salesDestination = salesDestination;
      if (title) patch.title = title;
      if (record && "description" in record) patch.description = readNullableString(record.description);
      if (record && "category" in record) patch.category = readNullableString(record.category);
      if (record && "price" in record) patch.price = readNullableString(record.price);
      if (record && "productUrl" in record) patch.productUrl = readNullableString(record.productUrl);
      if (record && "imageUrl" in record) patch.imageUrl = readNullableString(record.imageUrl);
      if (record && "importExternalImage" in record) patch.importExternalImage = readBoolean(record.importExternalImage) ?? false;

      return patch;
    })
    .filter((item): item is SalesCatalogImportItemPatch => Boolean(item))
    .slice(0, 160);
}

function normalizeItemStatus(value: unknown): SalesCatalogImportItemStatus | null {
  if (value === "draft" || value === "ready" || value === "published" || value === "discarded" || value === "error") return value;
  return null;
}

function normalizeSalesDestination(value: unknown): SalesCatalogImportDestination | null {
  if (value === "external_site" || value === "connectyhub_checkout") return value;
  return null;
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function formatRouteError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;

  return {
    error: message || fallback,
    ...(error instanceof BillingAccessError ? { billingAccess: error.status } : {}),
  };
}

function statusForRouteError(error: unknown, fallback: number) {
  const scopeStatus = statusForDashboardCompanyScopeError(error, 0);
  if (scopeStatus) return scopeStatus;

  return error instanceof BillingAccessError ? 402 : fallback;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}
