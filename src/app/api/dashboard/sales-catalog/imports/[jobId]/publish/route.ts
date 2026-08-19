import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { assertBillableAccess, BillingAccessError } from "@/lib/billing/trial";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import {
  resolveDashboardCompanyId,
  statusForDashboardCompanyScopeError,
} from "@/lib/client-os/dashboard-route-scope";
import {
  isSalesCatalogAiImportEnabled,
  publishSalesCatalogImportJob,
  salesCatalogAiImportDisabledMessage,
  type SalesCatalogImportDuplicateAction,
  type SalesCatalogImportDestination,
  type SalesCatalogImportItemPatch,
  type SalesCatalogImportItemStatus,
} from "@/lib/sales-catalog/importer";
import type { ClientSalesCatalogItem } from "@/lib/sales-catalog/shared";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type SalesCatalogMemoryRow = {
  id: string;
  organization_id: string | null;
  title: string;
  content: string;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function POST(request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  try {
    if (!isSalesCatalogAiImportEnabled()) {
      return NextResponse.json({ error: salesCatalogAiImportDisabledMessage }, { status: 410 });
    }

    const { jobId } = await context.params;
    const body = readRecord(await request.json().catch(() => null)) ?? {};
    const client = createServiceClient();
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId: readString(body.companyId),
      missingMessage: "Escolha uma empresa antes de publicar a importacao.",
    });
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    await assertBillableAccess({ organizationId: company.id, client });

    const importJob = await publishSalesCatalogImportJob({
      client,
      companyId: company.id,
      userId: workspace.user.id,
      jobId,
      itemIds: readStringList(body.itemIds),
      patches: readItemPatches(body.patches),
    });
    const publishedItems = await loadPublishedCatalogItems({
      client,
      companyId: company.id,
      itemIds: importJob.items
        .map((item) => item.publishedCatalogItemId)
        .filter((id): id is string => Boolean(id)),
    });

    revalidatePath("/dashboard/links");
    revalidatePath("/dashboard/whatsapp");

    return NextResponse.json({ importJob, items: publishedItems });
  } catch (error) {
    return NextResponse.json(formatRouteError(error, "Erro ao publicar importacao."), { status: statusForRouteError(error, 500) });
  }
}

async function loadPublishedCatalogItems(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  itemIds: string[];
}): Promise<ClientSalesCatalogItem[]> {
  const uniqueIds = Array.from(new Set(input.itemIds));
  if (uniqueIds.length === 0) return [];

  const { data, error } = await input.client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("organization_id", input.companyId)
    .eq("memory_type", "sales_catalog_item")
    .in("id", uniqueIds);

  if (error) {
    throw new Error(`Importacao publicada, mas nao foi possivel recarregar os produtos: ${error.message}`);
  }

  return ((data ?? []) as unknown as SalesCatalogMemoryRow[]).map(mapSalesCatalogItem);
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
      if (record && "duplicateAction" in record) {
        const duplicateAction = normalizeDuplicateAction(readString(record.duplicateAction));
        if (duplicateAction) patch.duplicateAction = duplicateAction;
      }
      if (record && "duplicateTargetItemId" in record) patch.duplicateTargetItemId = readNullableString(record.duplicateTargetItemId);

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

function normalizeDuplicateAction(value: unknown): SalesCatalogImportDuplicateAction | null {
  if (value === "create_new" || value === "update_existing" || value === "skip") return value;
  return null;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map(readString)
    .filter((item): item is string => Boolean(item))
    .slice(0, 160);
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
