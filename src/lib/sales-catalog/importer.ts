import "server-only";

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOrganizationOperationalAccess } from "@/lib/billing/access-control";
import { meterGeminiGenerationUsage } from "@/lib/billing/gemini-metering";
import { loadGeminiCredentials, type GeminiCredentials } from "@/lib/gemini/credentials";
import {
  buildSalesCatalogContent,
  createSalesCatalogTag,
  emptySalesCatalogProductFulfillment,
  emptySalesCatalogProductInventory,
  emptySalesCatalogProductOffer,
  emptySalesCatalogProductShipping,
  getSalesCatalogReadiness,
  resolveSalesCatalogMediaKind,
  type SalesCatalogFulfillmentMode,
  type SalesCatalogItemAttribute,
  type SalesCatalogMedia,
  type SalesCatalogProductFulfillment,
  type SalesCatalogProductInventory,
  type SalesCatalogProductOffer,
  type SalesCatalogProductShipping,
  type SalesCatalogSku,
  type SalesCatalogSkuStatus,
  type SalesCatalogStockStatus,
} from "@/lib/sales-catalog/shared";
import {
  buildTrackedLinkUrl,
  createTrackedLinkSlug,
  createTrackedLinkTag,
  normalizeHttpUrl,
} from "@/lib/tracking/tracked-links";
import { loadR2Config, putR2Object } from "@/lib/storage/r2";
import { assertStorageUploadAllowed, recordOrganizationStorageUsage } from "@/lib/storage/quotas";

export type SalesCatalogImportSourceKind = "text" | "csv" | "excel" | "site" | "pdf" | "image" | "mixed";
export type SalesCatalogImportPlatform =
  | "auto"
  | "woocommerce"
  | "shopify"
  | "wix"
  | "nuvemshop"
  | "loja_integrada"
  | "tray"
  | "anota_ai"
  | "ifood"
  | "generic_menu"
  | "generic_sheet";
export type SalesCatalogImportTargetMode = "connectyhub_checkout" | "external_site" | "review";
export type SalesCatalogImportDestination = "connectyhub_checkout" | "external_site" | "manual_handoff";
export type SalesCatalogImportJobStatus = "uploaded" | "extracting" | "review_required" | "ready_to_publish" | "publishing" | "published" | "failed";
export type SalesCatalogImportItemStatus = "draft" | "ready" | "published" | "discarded" | "error";
export type SalesCatalogImportImageImportStatus = "pending" | "imported" | "skipped" | "failed";
export type SalesCatalogImportDuplicateAction = "create_new" | "update_existing" | "skip";
export type SalesCatalogImportAssignmentScope = {
  assignedAgentIds: string[];
  assignedWhatsappInstanceIds: string[];
};

export type SalesCatalogImportDuplicateCandidate = {
  itemId: string;
  title: string;
  category: string | null;
  price: string | null;
  productUrl: string | null;
  source: string | null;
  score: number;
  reasons: string[];
};

type JsonRecord = Record<string, unknown>;

type PublishedTrackedLinkButton = {
  id: string;
  label: string;
  url: string;
  tag: string;
  trackingUrl: string;
};

type ImportJobRow = {
  id: string;
  organization_id: string;
  created_by: string | null;
  source_kind: SalesCatalogImportSourceKind;
  target_mode: SalesCatalogImportTargetMode;
  default_sales_destination: SalesCatalogImportDestination;
  status: SalesCatalogImportJobStatus;
  title: string | null;
  input_url: string | null;
  source_summary: string | null;
  settings: JsonRecord | null;
  stats: JsonRecord | null;
  error_message: string | null;
  processed_at: string | null;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ImportItemRow = {
  id: string;
  import_job_id: string;
  organization_id: string;
  status: SalesCatalogImportItemStatus;
  sales_destination: SalesCatalogImportDestination;
  title: string;
  description: string | null;
  category: string | null;
  price: string | null;
  currency: string | null;
  product_url: string | null;
  image_url: string | null;
  attributes: unknown;
  skus: unknown;
  add_ons: unknown;
  inventory: JsonRecord | null;
  shipping: JsonRecord | null;
  fulfillment: JsonRecord | null;
  offer: JsonRecord | null;
  confidence: number | string | null;
  warnings: string[] | null;
  source_evidence: JsonRecord | null;
  published_catalog_item_id: string | null;
  published_link_button_id: string | null;
  metadata: JsonRecord | null;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ImportEventRow = {
  id: string;
  import_job_id: string | null;
  organization_id: string;
  level: "info" | "warning" | "error";
  event_type: string;
  title: string;
  summary: string | null;
  payload: JsonRecord | null;
  created_at: string | null;
};

type ImportSourceRow = {
  id: string;
  import_job_id: string;
  organization_id: string;
  kind: "text" | "csv" | "excel" | "site" | "pdf" | "image" | "html" | "file";
  file_name: string | null;
  content_type: string | null;
  file_size: number | string | null;
  storage_url: string | null;
  source_url: string | null;
  text_excerpt: string | null;
  metadata: JsonRecord | null;
  created_at: string | null;
};

type ExistingSalesCatalogDuplicateRow = {
  id: string;
  title: string;
  content: string | null;
  tags: string[] | null;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ClientSalesCatalogImportItem = {
  id: string;
  jobId: string;
  companyId: string;
  status: SalesCatalogImportItemStatus;
  salesDestination: SalesCatalogImportDestination;
  title: string;
  description: string | null;
  category: string | null;
  price: string | null;
  currency: string;
  productUrl: string | null;
  imageUrl: string | null;
  importExternalImage: boolean;
  imageImportStatus: SalesCatalogImportImageImportStatus | null;
  imageImportError: string | null;
  duplicateCandidates: SalesCatalogImportDuplicateCandidate[];
  duplicateAction: SalesCatalogImportDuplicateAction;
  duplicateTargetItemId: string | null;
  attributes: SalesCatalogItemAttribute[];
  skus: SalesCatalogSku[];
  inventory: SalesCatalogProductInventory;
  shipping: SalesCatalogProductShipping;
  fulfillment: SalesCatalogProductFulfillment;
  offer: SalesCatalogProductOffer;
  confidence: number;
  warnings: string[];
  sourceEvidence: JsonRecord;
  publishedCatalogItemId: string | null;
  publishedLinkButtonId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ClientSalesCatalogImportEvent = {
  id: string;
  jobId: string | null;
  companyId: string;
  level: "info" | "warning" | "error";
  eventType: string;
  title: string;
  summary: string | null;
  createdAt: string | null;
};

export type ClientSalesCatalogImportJob = {
  id: string;
  companyId: string;
  createdBy: string | null;
  sourceKind: SalesCatalogImportSourceKind;
  sourcePlatform: SalesCatalogImportPlatform;
  targetMode: SalesCatalogImportTargetMode;
  defaultSalesDestination: SalesCatalogImportDestination;
  assignedAgentIds: string[];
  assignedWhatsappInstanceIds: string[];
  status: SalesCatalogImportJobStatus;
  title: string | null;
  inputUrl: string | null;
  sourceSummary: string | null;
  stats: JsonRecord;
  errorMessage: string | null;
  processedAt: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  items: ClientSalesCatalogImportItem[];
  events: ClientSalesCatalogImportEvent[];
};

export type SalesCatalogImportDraft = {
  title: string;
  description: string | null;
  category: string | null;
  price: string | null;
  currency: string;
  productUrl: string | null;
  imageUrl: string | null;
  importExternalImage: boolean;
  attributes: SalesCatalogItemAttribute[];
  skus: SalesCatalogSku[];
  inventory: SalesCatalogProductInventory;
  shipping: SalesCatalogProductShipping;
  fulfillment: SalesCatalogProductFulfillment;
  offer: SalesCatalogProductOffer;
  salesDestination: SalesCatalogImportDestination;
  confidence: number;
  warnings: string[];
  sourceEvidence: JsonRecord;
};

export type SalesCatalogImportItemPatch = {
  id: string;
  status?: SalesCatalogImportItemStatus;
  salesDestination?: SalesCatalogImportDestination;
  title?: string;
  description?: string | null;
  category?: string | null;
  price?: string | null;
  productUrl?: string | null;
  imageUrl?: string | null;
  importExternalImage?: boolean;
  duplicateAction?: SalesCatalogImportDuplicateAction;
  duplicateTargetItemId?: string | null;
};

export type SalesCatalogImportFileInput = {
  fileName: string;
  contentType: string;
  size: number;
  base64: string;
  text?: string | null;
};

const maxImportTextChars = 60000;
const maxLocalImportTextChars = 2_000_000;
const maxPageChars = 45000;
const maxDraftItems = 120;
const maxGeminiOutputTokens = 7000;
const maxImportedImageBytes = 20 * 1024 * 1024;

export const salesCatalogImportProcessRequestedEventName = "connectyhub/sales-catalog.import.process_requested";

export async function createSalesCatalogImportJob(input: {
  client: SupabaseClient;
  companyId: string;
  userId: string;
  sourceKind: SalesCatalogImportSourceKind;
  sourcePlatform: SalesCatalogImportPlatform;
  targetMode: SalesCatalogImportTargetMode;
  defaultSalesDestination: SalesCatalogImportDestination;
  text?: string | null;
  sourceUrl?: string | null;
  files?: SalesCatalogImportFileInput[] | null;
  title?: string | null;
  assignedAgentIds?: string[] | null;
  assignedWhatsappInstanceIds?: string[] | null;
}) {
  const now = new Date().toISOString();
  const sourceKind = normalizeSourceKind(input.sourceKind);
  const sourcePlatform = normalizeImportPlatform(input.sourcePlatform);
  const targetMode = normalizeTargetMode(input.targetMode);
  const defaultSalesDestination = normalizeSalesDestination(input.defaultSalesDestination, targetMode);
  const title = normalizeOptionalText(input.title, 140) ?? createImportTitle(sourceKind);
  const sourceUrl = normalizeOptionalText(input.sourceUrl, 1000);
  const sourceText = normalizeOptionalText(input.text, maxImportTextChars) ?? "";
  const files = input.files ?? [];
  const assignmentScope = normalizeImportAssignmentScope({
    assignedAgentIds: input.assignedAgentIds,
    assignedWhatsappInstanceIds: input.assignedWhatsappInstanceIds,
  });

  const { data: job, error: jobError } = await input.client
    .from("sales_catalog_import_jobs")
    .insert({
      organization_id: input.companyId,
      created_by: input.userId,
      source_kind: sourceKind,
      target_mode: targetMode,
      default_sales_destination: defaultSalesDestination,
      status: "uploaded",
      title,
      input_url: sourceUrl,
      settings: {
        import_version: 1,
        queued_processing: true,
        source_platform: sourcePlatform,
        assigned_agent_ids: assignmentScope.assignedAgentIds,
        assigned_whatsapp_instance_ids: assignmentScope.assignedWhatsappInstanceIds,
      },
      created_at: now,
      updated_at: now,
    })
    .select(importJobSelect)
    .single<ImportJobRow>();

  if (jobError || !job) {
    throw new Error(jobError?.message ?? "Nao foi possivel iniciar a importacao.");
  }

  const sourceRows = buildQueuedImportSourceRows({
    jobId: job.id,
    companyId: input.companyId,
    sourceKind,
    sourceUrl,
    sourceText,
    files,
  });

  if (sourceRows.length > 0) {
    const { error: sourceError } = await input.client
      .from("sales_catalog_import_sources")
      .insert(sourceRows);

    if (sourceError) {
      await markImportFailed(input.client, job.id, input.companyId, sourceError.message);
      throw new Error(`Importacao criada, mas nao foi possivel salvar as fontes: ${sourceError.message}`);
    }
  }

  const storedFileBytes = files.reduce((total, file) => total + file.size, 0);
  if (storedFileBytes > 0) {
    await recordOrganizationStorageUsage({
      client: input.client,
      organizationId: input.companyId,
      category: "import_source",
      bytes: storedFileBytes,
      fileCount: files.length,
      metadata: {
        source: "sales_catalog_ai_import",
        import_job_id: job.id,
        source_kind: sourceKind,
      },
    });
  }

  await input.client.from("sales_catalog_import_events").insert({
    import_job_id: job.id,
    organization_id: input.companyId,
    level: "info",
    event_type: "sales_catalog_import.created",
    title: "Importacao enfileirada",
    summary: sourceUrl ? `Fonte: ${sourceUrl}` : "Fonte enviada pelo usuario.",
    payload: {
      sourceKind,
      sourcePlatform,
      targetMode,
      defaultSalesDestination,
      files: files.length,
      assignedAgentIds: assignmentScope.assignedAgentIds,
      assignedWhatsappInstanceIds: assignmentScope.assignedWhatsappInstanceIds,
    },
  });

  return getSalesCatalogImportJob({
    client: input.client,
    companyId: input.companyId,
    jobId: job.id,
  });
}

export async function createAndProcessSalesCatalogImport(input: {
  client: SupabaseClient;
  companyId: string;
  userId: string;
  sourceKind: SalesCatalogImportSourceKind;
  sourcePlatform: SalesCatalogImportPlatform;
  targetMode: SalesCatalogImportTargetMode;
  defaultSalesDestination: SalesCatalogImportDestination;
  text?: string | null;
  sourceUrl?: string | null;
  files?: SalesCatalogImportFileInput[] | null;
  title?: string | null;
  assignedAgentIds?: string[] | null;
  assignedWhatsappInstanceIds?: string[] | null;
}) {
  const job = await createSalesCatalogImportJob(input);

  await processSalesCatalogImportJobById({
    client: input.client,
    jobId: job.id,
    userId: input.userId,
  });

  return getSalesCatalogImportJob({
    client: input.client,
    companyId: job.companyId,
    jobId: job.id,
  });
}

export async function processQueuedSalesCatalogImportJobs(input: {
  client: SupabaseClient;
  limit?: number;
  jobId?: string | null;
  companyId?: string | null;
}) {
  let query = input.client
    .from("sales_catalog_import_jobs")
    .select(importJobSelect)
    .eq("status", "uploaded")
    .order("created_at", { ascending: true })
    .limit(input.limit ?? 3);

  if (input.jobId) {
    query = query.eq("id", input.jobId);
  }

  if (input.companyId) {
    query = query.eq("organization_id", input.companyId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Nao foi possivel carregar fila de importacoes: ${error.message}`);
  }

  const jobs = (data ?? []) as unknown as ImportJobRow[];
  const results: Array<{ jobId: string; status: SalesCatalogImportJobStatus | "skipped"; error?: string }> = [];

  for (const queuedJob of jobs) {
    const { data: claimed, error: claimError } = await input.client
      .from("sales_catalog_import_jobs")
      .update({
        status: "extracting",
        updated_at: new Date().toISOString(),
      })
      .eq("id", queuedJob.id)
      .eq("organization_id", queuedJob.organization_id)
      .eq("status", "uploaded")
      .select(importJobSelect)
      .maybeSingle<ImportJobRow>();

    if (claimError) {
      results.push({ jobId: queuedJob.id, status: "skipped", error: claimError.message });
      continue;
    }

    if (!claimed) {
      results.push({ jobId: queuedJob.id, status: "skipped" });
      continue;
    }

    try {
      await assertOrganizationOperationalAccess({
        organizationId: claimed.organization_id,
        client: input.client,
      });

      await processSalesCatalogImportJobByRow({
        client: input.client,
        job: claimed,
        userId: claimed.created_by,
      });
      const refreshed = await getSalesCatalogImportJob({
        client: input.client,
        companyId: claimed.organization_id,
        jobId: claimed.id,
      });
      results.push({ jobId: refreshed.id, status: refreshed.status });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao processar importacao.";
      await markImportFailed(input.client, claimed.id, claimed.organization_id, message);
      results.push({ jobId: claimed.id, status: "failed", error: message });
    }
  }

  return {
    processed: results.filter((result) => result.status !== "skipped").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    results,
  };
}

export async function processSalesCatalogImportJobById(input: {
  client: SupabaseClient;
  jobId: string;
  userId?: string | null;
}) {
  const { data: job, error } = await input.client
    .from("sales_catalog_import_jobs")
    .select(importJobSelect)
    .eq("id", input.jobId)
    .maybeSingle<ImportJobRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar importacao: ${error.message}`);
  }

  if (!job) {
    throw new Error("Importacao nao encontrada para processamento.");
  }

  await assertOrganizationOperationalAccess({
    organizationId: job.organization_id,
    client: input.client,
  });

  await processSalesCatalogImportJobByRow({
    client: input.client,
    job,
    userId: input.userId ?? job.created_by,
  });

  return getSalesCatalogImportJob({
    client: input.client,
    companyId: job.organization_id,
    jobId: job.id,
  });
}

export async function listSalesCatalogImportJobs(input: {
  client: SupabaseClient;
  companyId: string;
  limit?: number;
}) {
  const { data, error } = await input.client
    .from("sales_catalog_import_jobs")
    .select(importJobSelect)
    .eq("organization_id", input.companyId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 12);

  if (error) {
    throw new Error(`Nao foi possivel carregar importacoes: ${error.message}`);
  }

  const jobs = (data ?? []) as unknown as ImportJobRow[];
  const jobIds = jobs.map((job) => job.id);

  if (jobIds.length === 0) {
    return [];
  }

  const [itemsResult, eventsResult] = await Promise.all([
    input.client
      .from("sales_catalog_import_items")
      .select(importItemSelect)
      .in("import_job_id", jobIds)
      .order("created_at", { ascending: true }),
    input.client
      .from("sales_catalog_import_events")
      .select(importEventSelect)
      .in("import_job_id", jobIds)
      .order("created_at", { ascending: false }),
  ]);

  if (itemsResult.error) {
    throw new Error(`Nao foi possivel carregar itens importados: ${itemsResult.error.message}`);
  }

  const itemsByJob = groupBy((itemsResult.data ?? []) as unknown as ImportItemRow[], (item) => item.import_job_id);
  const eventsByJob = groupBy((eventsResult.data ?? []) as unknown as ImportEventRow[], (event) => event.import_job_id ?? "");

  return jobs.map((job) => mapImportJob(job, itemsByJob.get(job.id) ?? [], eventsByJob.get(job.id) ?? []));
}

export async function getSalesCatalogImportJob(input: {
  client: SupabaseClient;
  companyId: string;
  jobId: string;
}) {
  const { data: job, error } = await input.client
    .from("sales_catalog_import_jobs")
    .select(importJobSelect)
    .eq("id", input.jobId)
    .eq("organization_id", input.companyId)
    .maybeSingle<ImportJobRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar importacao: ${error.message}`);
  }

  if (!job) {
    throw new Error("Importacao nao encontrada para esta empresa.");
  }

  const [itemsResult, eventsResult] = await Promise.all([
    input.client
      .from("sales_catalog_import_items")
      .select(importItemSelect)
      .eq("import_job_id", job.id)
      .eq("organization_id", input.companyId)
      .order("created_at", { ascending: true }),
    input.client
      .from("sales_catalog_import_events")
      .select(importEventSelect)
      .eq("import_job_id", job.id)
      .eq("organization_id", input.companyId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (itemsResult.error) {
    throw new Error(`Nao foi possivel carregar itens importados: ${itemsResult.error.message}`);
  }

  return mapImportJob(
    job,
    (itemsResult.data ?? []) as unknown as ImportItemRow[],
    (eventsResult.data ?? []) as unknown as ImportEventRow[],
  );
}

export async function updateSalesCatalogImportItems(input: {
  client: SupabaseClient;
  companyId: string;
  jobId: string;
  patches: SalesCatalogImportItemPatch[];
}) {
  const validPatches = input.patches
    .map(normalizeItemPatch)
    .filter((patch): patch is NormalizedItemPatch => Boolean(patch));

  for (const patch of validPatches) {
    const payload: JsonRecord = {
      updated_at: new Date().toISOString(),
    };

    if (patch.status) payload.status = patch.status;
    if (patch.salesDestination) payload.sales_destination = patch.salesDestination;
    if (patch.title) payload.title = patch.title;
    if ("description" in patch) payload.description = patch.description;
    if ("category" in patch) payload.category = patch.category;
    if ("price" in patch) payload.price = patch.price;
    if ("productUrl" in patch) payload.product_url = patch.productUrl;
    if ("imageUrl" in patch) payload.image_url = patch.imageUrl;

    const metadataPatch = buildImportItemPatchMetadata(patch);
    if (metadataPatch) {
      const { data: currentItem, error: metadataError } = await input.client
        .from("sales_catalog_import_items")
        .select("metadata")
        .eq("id", patch.id)
        .eq("import_job_id", input.jobId)
        .eq("organization_id", input.companyId)
        .maybeSingle<{ metadata: JsonRecord | null }>();

      if (metadataError) {
        throw new Error(`Nao foi possivel preparar imagem importada: ${metadataError.message}`);
      }

      payload.metadata = {
        ...(readRecord(currentItem?.metadata) ?? {}),
        ...metadataPatch,
      };
    }

    const { error } = await input.client
      .from("sales_catalog_import_items")
      .update(payload)
      .eq("id", patch.id)
      .eq("import_job_id", input.jobId)
      .eq("organization_id", input.companyId);

    if (error) {
      throw new Error(`Nao foi possivel atualizar item importado: ${error.message}`);
    }
  }
}

export async function publishSalesCatalogImportJob(input: {
  client: SupabaseClient;
  companyId: string;
  userId: string;
  jobId: string;
  itemIds?: string[] | null;
  patches?: SalesCatalogImportItemPatch[] | null;
}) {
  if (input.patches?.length) {
    await updateSalesCatalogImportItems({
      client: input.client,
      companyId: input.companyId,
      jobId: input.jobId,
      patches: input.patches,
    });
  }

  const job = await getSalesCatalogImportJob({
    client: input.client,
    companyId: input.companyId,
    jobId: input.jobId,
  });
  const assignmentScope = normalizeImportAssignmentScope(job);
  const selectedIds = new Set((input.itemIds ?? []).filter(Boolean));
  const candidates = job.items.filter((item) => (
    item.status !== "published"
    && item.status !== "discarded"
    && (selectedIds.size === 0 || selectedIds.has(item.id))
  ));

  if (candidates.length === 0) {
    throw new Error("Nenhum item disponivel para publicar.");
  }

  const now = new Date().toISOString();
  await input.client
    .from("sales_catalog_import_jobs")
    .update({ status: "publishing", updated_at: now })
    .eq("id", input.jobId)
    .eq("organization_id", input.companyId);

  let catalogItems = 0;
  let linkButtons = 0;
  let legacyReviewItems = 0;
  let duplicateSkips = 0;
  let duplicateUpdates = 0;
  let errors = 0;

  for (const item of candidates) {
    try {
      const duplicateAction = resolveImportDuplicateAction(item);
      const duplicateTargetItemId = duplicateAction === "update_existing"
        ? resolveImportDuplicateTargetItemId(item)
        : null;

      if (duplicateAction === "update_existing" && !duplicateTargetItemId) {
        throw new Error("Escolha qual produto existente deve ser atualizado.");
      }

      if (duplicateAction === "skip") {
        await markImportItemDuplicateSkipped({
          client: input.client,
          companyId: input.companyId,
          item,
        });
        duplicateSkips += 1;
        continue;
      }

      const publishItem = item.salesDestination === "manual_handoff"
        ? {
          ...item,
          salesDestination: "connectyhub_checkout" as SalesCatalogImportDestination,
          warnings: Array.from(new Set([...item.warnings, "Destino legado de atendimento convertido para checkout ConnectyHub."])),
        }
        : item;

      if (publishItem.salesDestination === "external_site") {
        const linkButton = await publishImportItemAsTrackedLink({
          client: input.client,
          companyId: input.companyId,
          userId: input.userId,
          jobId: input.jobId,
          item: publishItem,
        });
        await publishImportItemAsCatalogItem({
          client: input.client,
          companyId: input.companyId,
          userId: input.userId,
          jobId: input.jobId,
          item: publishItem,
          linkButton,
          assignmentScope,
          targetCatalogItemId: duplicateTargetItemId,
        });
        linkButtons += 1;
        catalogItems += 1;
        if (duplicateAction === "update_existing") duplicateUpdates += 1;
      } else {
        await publishImportItemAsCatalogItem({
          client: input.client,
          companyId: input.companyId,
          userId: input.userId,
          jobId: input.jobId,
          item: publishItem,
          linkButton: null,
          assignmentScope,
          targetCatalogItemId: duplicateTargetItemId,
        });
        if (item.salesDestination === "manual_handoff") {
          legacyReviewItems += 1;
        }
        catalogItems += 1;
        if (duplicateAction === "update_existing") duplicateUpdates += 1;
      }
    } catch (error) {
      errors += 1;
      await input.client
        .from("sales_catalog_import_items")
        .update({
          status: "error",
          warnings: [...item.warnings, error instanceof Error ? error.message : "Erro ao publicar item."],
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("organization_id", input.companyId);

      await input.client.from("sales_catalog_import_events").insert({
        import_job_id: input.jobId,
        organization_id: input.companyId,
        level: "error",
        event_type: "sales_catalog_import.item_publish_failed",
        title: `Falha ao publicar: ${item.title}`,
        summary: error instanceof Error ? error.message : "Erro ao publicar item importado.",
        payload: { item_id: item.id, destination: item.salesDestination },
      });
    }
  }

  const status: SalesCatalogImportJobStatus = errors === candidates.length ? "failed" : "published";
  await input.client
    .from("sales_catalog_import_jobs")
    .update({
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
      error_message: errors === 0 ? null : `${errors} item(ns) falharam ao publicar.`,
      stats: {
        ...job.stats,
        published_catalog_items: catalogItems,
        published_link_buttons: linkButtons,
        published_legacy_review_items: legacyReviewItems,
        duplicate_skips: duplicateSkips,
        duplicate_updates: duplicateUpdates,
        publish_errors: errors,
      },
    })
    .eq("id", input.jobId)
    .eq("organization_id", input.companyId);

  await input.client.from("sales_catalog_import_events").insert({
    import_job_id: input.jobId,
    organization_id: input.companyId,
    level: errors > 0 ? "warning" : "info",
    event_type: "sales_catalog_import.published",
    title: "Importacao publicada",
    summary: [
      `${catalogItems} produto(s)`,
      `${linkButtons} botao(oes) externo(s)`,
      legacyReviewItems > 0 ? `${legacyReviewItems} item(ns) legado(s) convertido(s) para checkout` : null,
      duplicateUpdates > 0 ? `${duplicateUpdates} duplicado(s) atualizado(s)` : null,
      duplicateSkips > 0 ? `${duplicateSkips} duplicado(s) ignorado(s)` : null,
    ].filter(Boolean).join(", ") + ".",
    payload: { catalogItems, linkButtons, legacyReviewItems, duplicateUpdates, duplicateSkips, errors },
  });

  return getSalesCatalogImportJob({
    client: input.client,
    companyId: input.companyId,
    jobId: input.jobId,
  });
}

async function processSalesCatalogImportJob(input: {
  client: SupabaseClient;
  companyId: string;
  userId?: string | null;
  job: ImportJobRow;
  text?: string | null;
  sourceUrl?: string | null;
  files?: SalesCatalogImportFileInput[] | null;
}) {
  await input.client
    .from("sales_catalog_import_jobs")
    .update({ status: "extracting", updated_at: new Date().toISOString() })
    .eq("id", input.job.id);

  try {
    const extraction = await extractDrafts({
      client: input.client,
      companyId: input.companyId,
      userId: input.userId,
      job: input.job,
      text: input.text,
      sourceUrl: input.sourceUrl,
      files: input.files,
    });

    if (extraction.drafts.length === 0) {
      await markImportFailed(input.client, input.job.id, input.companyId, "Nao encontramos produtos nesta fonte.");
      return;
    }

    await input.client
      .from("sales_catalog_import_items")
      .delete()
      .eq("import_job_id", input.job.id)
      .eq("organization_id", input.companyId)
      .in("status", ["draft", "ready", "error"]);

    const draftReviews = await buildImportDraftReviews({
      client: input.client,
      companyId: input.companyId,
      drafts: extraction.drafts.slice(0, maxDraftItems),
    });

    const itemPayload = draftReviews.map((review) => ({
      import_job_id: input.job.id,
      organization_id: input.companyId,
      status: review.warnings.length > 0 ? "draft" : "ready",
      sales_destination: review.draft.salesDestination,
      title: review.draft.title,
      description: review.draft.description,
      category: review.draft.category,
      price: review.draft.price,
      currency: review.draft.currency,
      product_url: review.draft.productUrl,
      image_url: review.draft.imageUrl,
      attributes: serializeItemAttributes(review.draft.attributes),
      skus: serializeSalesCatalogSkus(review.draft.skus),
      inventory: serializeProductInventory(review.draft.inventory),
      shipping: serializeProductShipping(review.draft.shipping),
      fulfillment: serializeProductFulfillment(review.draft.fulfillment),
      offer: serializeProductOffer(review.draft.offer),
      confidence: review.draft.confidence,
      warnings: review.warnings,
      source_evidence: review.draft.sourceEvidence,
      metadata: {
        created_from: "sales_catalog_ai_import",
        import_version: 1,
        import_external_image: review.draft.importExternalImage,
        image_import_status: review.draft.imageUrl
          ? review.draft.importExternalImage ? "pending" : "skipped"
          : null,
        image_import_error: null,
        duplicate_candidates: serializeDuplicateCandidates(review.duplicateCandidates),
        duplicate_action: review.duplicateCandidates.length > 0 ? "skip" : "create_new",
        duplicate_target_item_id: review.duplicateCandidates[0]?.itemId ?? null,
      },
    }));

    const { error: itemError } = await input.client
      .from("sales_catalog_import_items")
      .insert(itemPayload);

    if (itemError) {
      await markImportFailed(input.client, input.job.id, input.companyId, itemError.message);
      return;
    }

    const warningCount = draftReviews.reduce((total, review) => total + review.warnings.length, 0);
    const readyCount = draftReviews.filter((review) => review.warnings.length === 0).length;
    const duplicateCount = draftReviews.filter((review) => review.duplicateCandidates.length > 0).length;
    const reviewRequired = warningCount > 0;
    const status: SalesCatalogImportJobStatus = reviewRequired ? "review_required" : "ready_to_publish";
    const sourcePlatform = readImportJobSourcePlatform(input.job);

    await input.client
      .from("sales_catalog_import_jobs")
      .update({
        status,
        source_summary: extraction.summary,
        processed_at: new Date().toISOString(),
        stats: {
          total_items: extraction.drafts.length,
          ready_items: readyCount,
          warning_count: warningCount,
          duplicate_count: duplicateCount,
          ai_used: extraction.aiUsed,
          source_platform: sourcePlatform,
          destinations: countDraftDestinations(extraction.drafts),
        },
      })
      .eq("id", input.job.id)
      .eq("organization_id", input.companyId);

    await input.client.from("sales_catalog_import_events").insert({
      import_job_id: input.job.id,
      organization_id: input.companyId,
      level: reviewRequired ? "warning" : "info",
      event_type: "sales_catalog_import.extracted",
      title: "Produtos extraidos",
      summary: `${extraction.drafts.length} item(ns) encontrados; ${readyCount} pronto(s) para publicar.`,
      payload: {
        warnings: extraction.warnings,
        warning_count: warningCount,
        duplicate_count: duplicateCount,
        ai_used: extraction.aiUsed,
        source_platform: sourcePlatform,
      },
    });
  } catch (error) {
    await markImportFailed(
      input.client,
      input.job.id,
      input.companyId,
      error instanceof Error ? error.message : "Erro ao processar importacao.",
    );
  }
}

async function buildImportDraftReviews(input: {
  client: SupabaseClient;
  companyId: string;
  drafts: SalesCatalogImportDraft[];
}) {
  const existingItems = await loadDuplicateCatalogItems(input);

  return input.drafts.map((draft) => {
    const duplicateCandidates = findDuplicateCandidatesForDraft(draft, existingItems);
    const duplicateWarnings = duplicateCandidates.length > 0
      ? [`Possivel duplicidade: ${duplicateCandidates[0]?.title ?? "produto ja cadastrado"}. Escolha criar novo, atualizar existente ou ignorar.`]
      : [];

    return {
      draft,
      duplicateCandidates,
      warnings: Array.from(new Set([...draft.warnings, ...duplicateWarnings])),
    };
  });
}

async function loadDuplicateCatalogItems(input: {
  client: SupabaseClient;
  companyId: string;
}) {
  const { data, error } = await input.client
    .from("intelligence_memory")
    .select("id, title, content, tags, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("organization_id", input.companyId)
    .eq("memory_type", "sales_catalog_item")
    .order("updated_at", { ascending: false })
    .limit(600);

  if (error) {
    throw new Error(`Nao foi possivel verificar duplicidades do catalogo: ${error.message}`);
  }

  return ((data ?? []) as unknown as ExistingSalesCatalogDuplicateRow[])
    .map(mapDuplicateCatalogItem)
    .filter((item): item is DuplicateCatalogItem => Boolean(item));
}

type DuplicateCatalogItem = SalesCatalogImportDuplicateCandidate & {
  normalizedTitle: string;
  normalizedUrl: string | null;
  normalizedPrice: string | null;
  normalizedCategory: string | null;
  skuCodes: string[];
};

function mapDuplicateCatalogItem(row: ExistingSalesCatalogDuplicateRow): DuplicateCatalogItem | null {
  const metadata = readRecord(row.metadata) ?? {};
  if (readString(metadata.status) === "archived") return null;

  const title = normalizeTitle(readString(metadata.title) ?? row.title);
  if (!title) return null;

  const category = normalizeOptionalText(readString(metadata.category), 80);
  const price = normalizePrice(readString(metadata.price));
  const productUrl = normalizeDraftUrl(
    readString(metadata.source_product_url)
      ?? readString(metadata.product_url)
      ?? readString(metadata.url),
  );
  const source = normalizeOptionalText(readString(metadata.source), 80);
  const skuCodes = readCatalogDuplicateSkuCodes(metadata);

  return {
    itemId: row.id,
    title,
    category,
    price,
    productUrl,
    source,
    score: 0,
    reasons: [],
    normalizedTitle: normalizeDuplicateText(title),
    normalizedUrl: normalizeDuplicateUrl(productUrl),
    normalizedPrice: price ? normalizeDuplicatePrice(price) : null,
    normalizedCategory: category ? normalizeDuplicateText(category) : null,
    skuCodes,
  };
}

function findDuplicateCandidatesForDraft(
  draft: SalesCatalogImportDraft,
  existingItems: DuplicateCatalogItem[],
): SalesCatalogImportDuplicateCandidate[] {
  const normalizedTitle = normalizeDuplicateText(draft.title);
  const normalizedUrl = normalizeDuplicateUrl(draft.productUrl);
  const normalizedPrice = draft.price ? normalizeDuplicatePrice(draft.price) : null;
  const normalizedCategory = draft.category ? normalizeDuplicateText(draft.category) : null;
  const skuCodes = draft.skus
    .map((sku) => normalizeSkuCode(sku.skuCode))
    .filter((sku): sku is string => Boolean(sku));

  return existingItems
    .map((item) => {
      const reasons: string[] = [];
      let score = 0;

      if (normalizedUrl && item.normalizedUrl && normalizedUrl === item.normalizedUrl) {
        score += 0.9;
        reasons.push("URL igual");
      }

      const hasSkuMatch = skuCodes.length > 0 && item.skuCodes.some((skuCode) => skuCodes.includes(skuCode));
      if (hasSkuMatch) {
        score += 0.9;
        reasons.push("SKU igual");
      }

      if (normalizedTitle && item.normalizedTitle) {
        if (normalizedTitle === item.normalizedTitle) {
          score += 0.62;
          reasons.push("Nome igual");
        } else {
          const similarity = duplicateTitleSimilarity(normalizedTitle, item.normalizedTitle);
          if (similarity >= 0.85) {
            score += 0.45;
            reasons.push("Nome muito parecido");
          } else if (similarity >= 0.72) {
            score += 0.32;
            reasons.push("Nome parecido");
          }
        }
      }

      if (normalizedPrice && item.normalizedPrice && normalizedPrice === item.normalizedPrice) {
        score += 0.12;
        reasons.push("Preco igual");
      }

      if (normalizedCategory && item.normalizedCategory && normalizedCategory === item.normalizedCategory) {
        score += 0.08;
        reasons.push("Categoria igual");
      }

      return {
        itemId: item.itemId,
        title: item.title,
        category: item.category,
        price: item.price,
        productUrl: item.productUrl,
        source: item.source,
        score: Math.min(1, Number(score.toFixed(2))),
        reasons: Array.from(new Set(reasons)),
      };
    })
    .filter((candidate) => candidate.score >= 0.56 && candidate.reasons.length > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
}

async function processSalesCatalogImportJobByRow(input: {
  client: SupabaseClient;
  job: ImportJobRow;
  userId?: string | null;
}) {
  const sources = await listSalesCatalogImportSources({
    client: input.client,
    jobId: input.job.id,
    companyId: input.job.organization_id,
  });
  const queuedSource = buildQueuedSourceInput(input.job, sources);

  await processSalesCatalogImportJob({
    client: input.client,
    companyId: input.job.organization_id,
    userId: input.userId ?? input.job.created_by,
    job: input.job,
    text: queuedSource.text,
    sourceUrl: queuedSource.sourceUrl,
    files: queuedSource.files,
  });
}

async function listSalesCatalogImportSources(input: {
  client: SupabaseClient;
  jobId: string;
  companyId: string;
}) {
  const { data, error } = await input.client
    .from("sales_catalog_import_sources")
    .select(importSourceSelect)
    .eq("import_job_id", input.jobId)
    .eq("organization_id", input.companyId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Nao foi possivel carregar fontes da importacao: ${error.message}`);
  }

  return (data ?? []) as unknown as ImportSourceRow[];
}

function buildQueuedSourceInput(job: ImportJobRow, sources: ImportSourceRow[]) {
  const sourceUrl = job.input_url ?? sources.map((source) => source.source_url).find(Boolean) ?? null;
  const text = sources
    .map((source) => source.text_excerpt)
    .filter((text): text is string => Boolean(text?.trim()))
    .join("\n\n")
    .slice(0, maxImportTextChars);
  const files = sources
    .map(readQueuedFileInput)
    .filter((file): file is SalesCatalogImportFileInput => Boolean(file));

  return { sourceUrl, text, files };
}

function readQueuedFileInput(source: ImportSourceRow): SalesCatalogImportFileInput | null {
  const metadata = readRecord(source.metadata) ?? {};
  const base64 = readString(metadata.inline_base64);
  const contentType = readString(source.content_type);
  const fileName = readString(source.file_name);

  if (!base64 || !contentType || !fileName) {
    return null;
  }

  return {
    fileName,
    contentType,
    size: normalizeNumber(source.file_size) ?? 0,
    base64,
    text: source.text_excerpt,
  };
}

async function extractDrafts(input: {
  client: SupabaseClient;
  companyId: string;
  userId?: string | null;
  job: ImportJobRow;
  text?: string | null;
  sourceUrl?: string | null;
  files?: SalesCatalogImportFileInput[] | null;
}) {
  const fetched = input.job.source_kind === "site" && input.sourceUrl
    ? await fetchPageSourceText(input.sourceUrl).catch((error) => ({
        text: "",
        summary: error instanceof Error ? error.message : "Nao foi possivel ler a pagina.",
      }))
    : { text: "", summary: "" };
  const sourceText = [
    normalizeOptionalText(input.text, maxImportTextChars),
    ...(input.files ?? []).map((file) => normalizeOptionalText(file.text, maxImportTextChars)),
    fetched.text,
  ].filter(Boolean).join("\n\n").slice(0, maxImportTextChars);

  const files = input.files ?? [];
  const localSourceText = buildLocalImportSourceText({
    text: input.text,
    fetchedText: fetched.text,
    files,
  });

  if (!sourceText.trim() && !input.sourceUrl && files.length === 0) {
    return {
      drafts: [] as SalesCatalogImportDraft[],
      sourceText: "",
      summary: "Nenhuma fonte textual foi enviada.",
      warnings: ["Envie texto, CSV ou URL para importar."],
      aiUsed: false,
    };
  }

  const tableDrafts = parseDelimitedDrafts({
    sourceText: localSourceText || sourceText,
    sourceUrl: input.sourceUrl,
    sourceKind: input.job.source_kind,
    sourcePlatform: readImportJobSourcePlatform(input.job),
    targetMode: input.job.target_mode,
    defaultSalesDestination: input.job.default_sales_destination,
  });

  if (tableDrafts.length > 0) {
    return {
      drafts: tableDrafts,
      sourceText: (localSourceText || sourceText).slice(0, maxImportTextChars),
      summary: fetched.summary || `CSV estruturado encontrou ${tableDrafts.length} item(ns).`,
      warnings: [],
      aiUsed: false,
    };
  }

  const ai = await extractDraftsWithGemini({
    client: input.client,
    companyId: input.companyId,
    userId: input.userId,
    sourceText,
    sourceUrl: input.sourceUrl,
    files,
    sourceKind: input.job.source_kind,
    sourcePlatform: readImportJobSourcePlatform(input.job),
    targetMode: input.job.target_mode,
    defaultSalesDestination: input.job.default_sales_destination,
  }).catch((error) => ({
    drafts: [] as SalesCatalogImportDraft[],
    warning: error instanceof Error ? error.message : "Extracao com IA indisponivel.",
  }));

  if (ai.drafts.length > 0) {
    return {
      drafts: ai.drafts,
      sourceText,
      summary: fetched.summary || `IA encontrou ${ai.drafts.length} item(ns).`,
      warnings: "warning" in ai ? [ai.warning] : [],
      aiUsed: true,
    };
  }

  const fallbackDrafts = parseFallbackDrafts({
    sourceText: localSourceText || sourceText,
    sourceUrl: input.sourceUrl,
    sourceKind: input.job.source_kind,
    sourcePlatform: readImportJobSourcePlatform(input.job),
    targetMode: input.job.target_mode,
    defaultSalesDestination: input.job.default_sales_destination,
  });

  return {
    drafts: fallbackDrafts,
    sourceText: (localSourceText || sourceText).slice(0, maxImportTextChars),
    summary: fetched.summary || `Extracao local encontrou ${fallbackDrafts.length} item(ns).`,
    warnings: "warning" in ai ? [ai.warning] : ["IA nao retornou itens; usamos extracao local."],
    aiUsed: false,
  };
}

async function extractDraftsWithGemini(input: {
  client: SupabaseClient;
  companyId: string;
  userId?: string | null;
  sourceText: string;
  sourceUrl?: string | null;
  files?: SalesCatalogImportFileInput[] | null;
  sourceKind: SalesCatalogImportSourceKind;
  sourcePlatform: SalesCatalogImportPlatform;
  targetMode: SalesCatalogImportTargetMode;
  defaultSalesDestination: SalesCatalogImportDestination;
}): Promise<{ drafts: SalesCatalogImportDraft[] }> {
  const files = (input.files ?? []).filter((file) => file.base64 && file.contentType);

  if (!input.sourceText.trim() && files.length === 0) {
    return { drafts: [] };
  }

  const credentials = await loadGeminiCredentials(input.client) as GeminiCredentials;
  const modelId = credentials.model;
  const systemInstruction = [
    "Voce extrai catalogos comerciais para a ConnectyHub.",
    "Responda somente JSON valido.",
    "Nao invente produtos, precos, links, frete, estoque ou condicoes que nao aparecam na fonte.",
    "Quando houver incerteza, use warnings e reduza confidence.",
    "Diferencie produto vendavel de regra comercial. Frete, retirada, taxa e prazo entram em shipping/fulfillment, nao como produto.",
    isDeliveryImportPlatform(input.sourcePlatform)
      ? "Para cardapios de delivery, preserve categorias, sabores, tamanhos, adicionais, complementos e combos. Nao transforme texto institucional em produto."
      : "",
    "Use salesDestination conforme o objetivo do usuario: connectyhub_checkout ou external_site.",
  ].filter(Boolean).join("\n");
  const prompt = [
    `Fonte: ${input.sourceKind}`,
    `Plataforma/origem declarada: ${formatImportPlatformForPrompt(input.sourcePlatform)}`,
    getImportPlatformExtractionHint(input.sourcePlatform),
    input.sourceUrl ? `URL analisada: ${input.sourceUrl}` : "",
    `Modo escolhido: ${input.targetMode}`,
    `Destino padrao: ${input.defaultSalesDestination}`,
    "",
    "Retorne neste formato:",
    '{"items":[{"title":"string","description":"string|null","category":"string|null","price":"string|null","currency":"BRL","productUrl":"string|null","imageUrl":"string|null","salesDestination":"connectyhub_checkout|external_site","attributes":[{"name":"Tamanho","values":["P","M"]}],"skus":[{"skuCode":"PIZZA-G","title":"Grande","price":"45,00","salePrice":null,"attributes":[{"name":"Tamanho","values":["Grande"]}],"stockStatus":"in_stock","stockQuantity":null,"weightGrams":null}],"inventory":{"status":"in_stock","quantity":null,"allowBackorder":false,"notes":null},"shipping":{"profile":"default","notes":null},"fulfillment":{"mode":"physical","schedulingRequired":false,"serviceDuration":null,"deliveryInstructions":null,"accessInstructions":null},"offer":{"salePrice":null,"couponCode":null,"notes":null},"confidence":0.86,"warnings":["string"],"sourceEvidence":{"line":"trecho que justifica"}}]}',
    "",
    "Fonte textual:",
    input.sourceText.trim() ? input.sourceText.slice(0, maxImportTextChars) : "Sem texto extraido; use os arquivos anexados como fonte principal.",
  ].filter(Boolean).join("\n");
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`);
  url.searchParams.set("key", credentials.apiKey);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          ...files.slice(0, 6).map((file) => ({
            inlineData: {
              mimeType: file.contentType,
              data: file.base64,
            },
          })),
        ],
      }],
      generationConfig: {
        temperature: 0.18,
        topP: 0.8,
        maxOutputTokens: maxGeminiOutputTokens,
        responseMimeType: "application/json",
      },
    }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(readGeminiError(data) ?? `Gemini respondeu status ${response.status}.`);
  }

  const text = extractGeminiText(data);
  const parsed = parseJsonObject(text);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const drafts = items
    .map((item) => normalizeDraft(item, {
      defaultSalesDestination: input.defaultSalesDestination,
      targetMode: input.targetMode,
      sourceUrl: input.sourceUrl,
    }))
    .filter((item): item is SalesCatalogImportDraft => Boolean(item))
    .slice(0, maxDraftItems);

  await meterGeminiGenerationUsage({
    client: input.client,
    organizationId: input.companyId,
    userId: input.userId,
    featureCode: "sales_catalog_import",
    modelId,
    agentScope: "customer",
    promptText: [systemInstruction, prompt],
    outputText: text,
    responseData: data,
    debitDescription: "Importador inteligente de catalogo",
    metadata: {
      sourceKind: input.sourceKind,
      sourcePlatform: input.sourcePlatform,
      targetMode: input.targetMode,
      defaultSalesDestination: input.defaultSalesDestination,
      fileCount: files.length,
      fileTypes: files.map((file) => file.contentType),
      extractedItems: drafts.length,
    },
  });

  return { drafts };
}

function buildLocalImportSourceText(input: {
  text?: string | null;
  fetchedText?: string | null;
  files?: SalesCatalogImportFileInput[] | null;
}) {
  const chunks = [
    normalizeOptionalText(input.text, maxLocalImportTextChars),
    ...(input.files ?? []).map((file) => decodeTextImportFile(file) ?? normalizeOptionalText(file.text, maxLocalImportTextChars)),
    normalizeOptionalText(input.fetchedText, maxLocalImportTextChars),
  ].filter((chunk): chunk is string => Boolean(chunk));

  return chunks.join("\n\n").slice(0, maxLocalImportTextChars);
}

function decodeTextImportFile(file: SalesCatalogImportFileInput) {
  if (!isTextLikeImportFile(file)) return null;

  try {
    return Buffer.from(file.base64, "base64")
      .toString("utf8")
      .replace(/^\uFEFF/, "")
      .trim()
      .slice(0, maxLocalImportTextChars) || null;
  } catch {
    return null;
  }
}

function isTextLikeImportFile(file: SalesCatalogImportFileInput) {
  const contentType = file.contentType.toLowerCase();
  const fileName = file.fileName.toLowerCase();

  return contentType.startsWith("text/")
    || contentType === "application/json"
    || /\.(csv|tsv|txt|md|json)$/i.test(fileName);
}

function readImportJobSourcePlatform(job: ImportJobRow) {
  const settings = readRecord(job.settings);
  return normalizeImportPlatform(settings?.source_platform);
}

function readImportJobAssignmentScope(job: Pick<ImportJobRow, "settings">): SalesCatalogImportAssignmentScope {
  const settings = readRecord(job.settings);

  return normalizeImportAssignmentScope({
    assignedAgentIds: readStringList(settings?.assigned_agent_ids),
    assignedWhatsappInstanceIds: readStringList(settings?.assigned_whatsapp_instance_ids),
  });
}

function formatImportPlatformForPrompt(value: SalesCatalogImportPlatform) {
  if (value === "woocommerce") return "WooCommerce";
  if (value === "shopify") return "Shopify";
  if (value === "wix") return "Wix Stores";
  if (value === "nuvemshop") return "Nuvemshop";
  if (value === "loja_integrada") return "Loja Integrada";
  if (value === "tray") return "Tray";
  if (value === "anota_ai") return "Anota Ai";
  if (value === "ifood") return "iFood";
  if (value === "generic_menu") return "Cardapio em PDF/foto";
  if (value === "generic_sheet") return "Planilha generica";
  return "Detectar automaticamente";
}

function isDeliveryImportPlatform(value: SalesCatalogImportPlatform) {
  return value === "anota_ai" || value === "ifood" || value === "generic_menu";
}

function getImportPlatformExtractionHint(value: SalesCatalogImportPlatform) {
  if (value === "anota_ai") {
    return "Dica Anota Ai: priorize estrutura de cardapio, categorias, sabores, tamanhos, adicionais, complementos, combos e observacoes de retirada/entrega.";
  }

  if (value === "ifood" || value === "generic_menu") {
    return "Dica cardapio: separe produtos reais de adicionais e opcoes. Fotos de cardapio servem como fonte visual; nao invente imagens comerciais.";
  }

  if (value === "woocommerce") {
    return "Dica WooCommerce: reconheca regular_price, sale_price, short_description, categories, sku, stock e images quando existirem.";
  }

  if (value === "shopify") {
    return "Dica Shopify: interprete produtos e variantes, mantendo opcoes, SKUs, precos e URLs de imagem publicas.";
  }

  return "";
}

function parseFallbackDrafts(input: {
  sourceText: string;
  sourceUrl?: string | null;
  sourceKind: SalesCatalogImportSourceKind;
  sourcePlatform: SalesCatalogImportPlatform;
  targetMode: SalesCatalogImportTargetMode;
  defaultSalesDestination: SalesCatalogImportDestination;
}) {
  const tableDrafts = parseDelimitedDrafts(input);
  if (tableDrafts.length > 0) return tableDrafts;

  return parseLineDrafts(input);
}

function parseDelimitedDrafts(input: {
  sourceText: string;
  sourceUrl?: string | null;
  sourceKind: SalesCatalogImportSourceKind;
  sourcePlatform: SalesCatalogImportPlatform;
  targetMode: SalesCatalogImportTargetMode;
  defaultSalesDestination: SalesCatalogImportDestination;
}) {
  const delimiter = guessDelimiter(input.sourceText);
  if (!delimiter) return [];

  const rows = parseDelimitedRows(input.sourceText, delimiter);
  if (rows.length < 2) return [];

  const headers = rows[0].map((value) => normalizeHeader(value));
  const dataRows = rows.slice(1).filter((row) => row.some((value) => value.trim()));
  const titleIndex = findHeaderIndex(headers, [
    "produto",
    "nome",
    "name",
    "title",
    "item",
    "servico",
    "servico_servico",
    "nome_do_produto",
    "nome_produto",
    "produto_nome",
    "nome_item",
    "item_nome",
    "nome_do_item",
    "cardapio_item",
  ]);

  if (titleIndex < 0) return [];

  const priceIndex = findHeaderIndexExactFirst(headers, ["preco", "price", "valor", "amount", "regular_price"], ["preco_regular", "valor_unitario", "unit_price", "valor_produto", "preco_produto", "price_br"]);
  const salePriceIndex = findHeaderIndexExactFirst(headers, ["preco_promocional", "sale_price", "preco_oferta", "preco_de_oferta", "promotional_price"], ["promocional", "preco_desconto", "valor_promocional"]);
  const shortDescriptionIndex = findHeaderIndexExactFirst(headers, ["descricao_curta", "short_description", "resumo"], ["short_desc", "descricao_resumida"]);
  const descriptionIndex = findHeaderIndexExactFirst(headers, ["descricao", "description", "detalhes", "observacoes"], ["descricao_comercial", "long_description", "ingredientes", "composicao"]);
  const categoryIndex = findHeaderIndex(headers, ["categorias", "categoria", "category", "grupo", "secao", "departamento", "cardapio_categoria"]);
  const urlIndex = findHeaderIndexExactFirst(headers, ["url", "link", "product_url", "site", "url_externa"], ["produto_url", "external_url", "link_produto", "url_produto"]);
  const imageIndex = findHeaderIndex(headers, ["imagens", "imagem", "image", "foto", "photo", "image_url", "url_imagem", "imagem_url", "foto_url"]);
  const skuIndex = findHeaderIndexExactFirst(headers, ["sku", "codigo", "code"], ["codigo_sku"]);
  const publishedIndex = findHeaderIndexExactFirst(headers, ["publicado", "published", "ativo", "active"], []);
  const stockStatusIndex = findHeaderIndexExactFirst(headers, ["em_estoque", "stock_status", "in_stock"], ["status_estoque"]);
  const stockQuantityIndex = findHeaderIndexExactFirst(headers, ["estoque", "stock", "quantidade", "stock_quantity"], ["quantidade_estoque"]);
  const lowStockIndex = findHeaderIndexExactFirst(headers, ["quantidade_baixa_de_estoque", "low_stock_amount", "low_stock_threshold"], []);
  const backorderIndex = findHeaderIndexExactFirst(headers, ["sao_permitidas_encomendas", "backorders_allowed", "allow_backorder"], ["encomendas"]);
  const weightIndex = findHeaderIndexExactFirst(headers, ["peso_kg", "weight_kg", "peso", "weight"], []);
  const lengthIndex = findHeaderIndexExactFirst(headers, ["comprimento_cm", "length_cm", "comprimento", "length"], []);
  const widthIndex = findHeaderIndexExactFirst(headers, ["largura_cm", "width_cm", "largura", "width"], []);
  const heightIndex = findHeaderIndexExactFirst(headers, ["altura_cm", "height_cm", "altura", "height"], []);
  const saleStartsIndex = findHeaderIndexExactFirst(headers, ["data_de_preco_promocional_comeca_em", "sale_price_dates_from", "sale_starts_at"], []);
  const saleEndsIndex = findHeaderIndexExactFirst(headers, ["data_de_preco_promocional_termina_em", "sale_price_dates_to", "sale_ends_at"], []);

  return dataRows
    .map((row, index) => {
      const title = normalizeTitle(row[titleIndex]);
      if (!title) return null;
      if (publishedIndex >= 0 && isFalseLike(row[publishedIndex])) return null;

      const links = classifyImportLinks({
        productValues: urlIndex >= 0 ? [row[urlIndex]] : [],
        imageValues: imageIndex >= 0 ? [row[imageIndex]] : [],
        searchableValues: row,
        fallbackProductUrl: input.targetMode === "external_site" ? input.sourceUrl ?? null : null,
      });
      const productUrl = links.productUrl;
      const regularPrice = normalizePrice(row[priceIndex]);
      const salePrice = normalizePrice(row[salePriceIndex]);
      const price = regularPrice ?? salePrice;
      const destination = resolveDraftDestination({
        explicit: null,
        targetMode: input.targetMode,
        defaultSalesDestination: input.defaultSalesDestination,
        productUrl,
      });
      const warnings = buildDraftWarnings({
        destination,
        price,
        productUrl,
      });
      const description = combineImportedDescription([
        row[shortDescriptionIndex],
        row[descriptionIndex],
      ], 1400);
      const stockStatus = resolveDelimitedStockStatus(row[stockStatusIndex], row[backorderIndex]);
      const stockQuantity = normalizeNumber(row[stockQuantityIndex]);
      const lowStockThreshold = normalizeNumber(row[lowStockIndex]);
      const allowBackorder = isTruthyLike(row[backorderIndex]);
      const weightGrams = normalizeWeightGrams(row[weightIndex], headers[weightIndex]);
      const dimensions = {
        lengthCm: normalizeNumber(row[lengthIndex]),
        widthCm: normalizeNumber(row[widthIndex]),
        heightCm: normalizeNumber(row[heightIndex]),
      };
      const attributes = readDelimitedAttributes(row, headers);
      const skuCode = normalizeSkuCode(row[skuIndex]) ?? createSkuCode(title, String(index + 1));

      return buildDraft({
        title,
        description,
        category: normalizeOptionalText(row[categoryIndex], 80),
        price,
        productUrl,
        imageUrl: links.imageUrl,
        salesDestination: destination,
        confidence: warnings.length ? 0.68 : 0.84,
        warnings,
        sourceEvidence: {
          row: index + 2,
          ...(links.imageUrl ? { image_url_detected: true } : {}),
          ...(links.productUrl ? { product_url_detected: true } : {}),
        },
        skus: [{
          ...createDraftSku({ title, skuCode, price, salePrice, stockQuantity }),
          attributes,
          stockStatus,
          lowStockThreshold,
          weightGrams,
          dimensions,
        }],
        inventory: {
          ...emptySalesCatalogProductInventory(),
          status: stockStatus,
          quantity: stockQuantity,
          lowStockThreshold,
          allowBackorder,
        },
        shipping: {
          ...emptySalesCatalogProductShipping(),
          weightGrams,
          dimensions,
        },
        offer: {
          ...emptySalesCatalogProductOffer(),
          salePrice,
          saleStartsAt: normalizeOptionalText(row[saleStartsIndex], 40),
          saleEndsAt: normalizeOptionalText(row[saleEndsIndex], 40),
        },
      });
    })
    .filter((item): item is SalesCatalogImportDraft => Boolean(item))
    .slice(0, maxDraftItems);
}

function parseLineDrafts(input: {
  sourceText: string;
  sourceUrl?: string | null;
  targetMode: SalesCatalogImportTargetMode;
  defaultSalesDestination: SalesCatalogImportDestination;
}) {
  const lines = input.sourceText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
  const drafts: SalesCatalogImportDraft[] = [];
  let category: string | null = null;

  for (const line of lines) {
    if (drafts.length >= maxDraftItems) break;

    if (isCategoryLine(line)) {
      category = cleanCategoryLine(line);
      continue;
    }

    const priceMatch = findPriceInText(line);
    const links = classifyImportLinks({
      productValues: [line],
      imageValues: [],
      searchableValues: [line],
      fallbackProductUrl: input.targetMode === "external_site" ? input.sourceUrl ?? null : null,
    });
    const maybeUrl = links.productUrl;
    const title = normalizeTitle(priceMatch ? line.slice(0, priceMatch.index) : line.replace(/https?:\/\/\S+/gi, ""));

    if (!title || title.length < 2) continue;

    const price = priceMatch?.value ?? null;
    const destination = resolveDraftDestination({
      explicit: null,
      targetMode: input.targetMode,
      defaultSalesDestination: input.defaultSalesDestination,
      productUrl: maybeUrl,
    });
    const warnings = buildDraftWarnings({ destination, price, productUrl: maybeUrl });

    drafts.push(buildDraft({
      title,
      description: null,
      category,
      price,
      productUrl: maybeUrl,
      imageUrl: links.imageUrl,
      salesDestination: destination,
      confidence: price ? 0.7 : 0.55,
      warnings: price ? warnings : Array.from(new Set([...warnings, "Preco nao identificado na linha."])),
      sourceEvidence: {
        line,
        ...(links.imageUrl ? { image_url_detected: true } : {}),
        ...(links.productUrl ? { product_url_detected: true } : {}),
      },
      skus: [createDraftSku({ title, skuCode: createSkuCode(title, drafts.length + 1), price })],
    }));
  }

  if (drafts.length === 0 && input.sourceUrl) {
    const destination = resolveDraftDestination({
      explicit: "external_site",
      targetMode: input.targetMode,
      defaultSalesDestination: input.defaultSalesDestination,
      productUrl: input.sourceUrl,
    });

    drafts.push(buildDraft({
      title: "Catalogo do site",
      description: preview(input.sourceText, 900) || null,
      category: null,
      price: null,
      productUrl: input.sourceUrl,
      imageUrl: null,
      salesDestination: destination,
      confidence: 0.42,
      warnings: ["Nao identificamos produtos individuais; revise este item antes de publicar."],
      sourceEvidence: { sourceUrl: input.sourceUrl },
      skus: [],
    }));
  }

  return drafts;
}

async function publishImportItemAsCatalogItem(input: {
  client: SupabaseClient;
  companyId: string;
  userId: string;
  jobId: string;
  item: ClientSalesCatalogImportItem;
  linkButton: PublishedTrackedLinkButton | null;
  assignmentScope: SalesCatalogImportAssignmentScope;
  targetCatalogItemId?: string | null;
}) {
  const now = new Date().toISOString();
  const existingCatalogItem = input.targetCatalogItemId
    ? await loadImportTargetCatalogItem({
      client: input.client,
      companyId: input.companyId,
      itemId: input.targetCatalogItemId,
    })
    : null;
  const existingMetadata = readRecord(existingCatalogItem?.metadata) ?? {};
  const itemId = existingCatalogItem?.id ?? randomUUID();
  const tag = readString(existingMetadata.tag) ?? createSalesCatalogTag(input.item.title, itemId);
  const mediaResult = await buildImportedMedia({
    client: input.client,
    companyId: input.companyId,
    itemId,
    item: input.item,
    now,
  });
  const existingMedia = readSalesCatalogMediaList(existingMetadata.media);
  const media = mediaResult.media.length > 0 ? mediaResult.media : existingMedia;
  const inventory = input.item.inventory;
  const offer = input.item.offer;
  const itemFulfillment = input.item.fulfillment;
  const fulfillment = {
    ...itemFulfillment,
    mode: itemFulfillment.mode,
  };
  const shipping = input.item.shipping;
  const content = buildSalesCatalogContent({
    title: input.item.title,
    description: input.item.description ?? buildFallbackDescription(input.item),
    category: input.item.category,
    price: input.item.price,
    currency: input.item.currency,
    media,
    attributes: input.item.attributes,
    inventory,
    offer,
    fulfillment,
    shipping,
    salesDestination: input.item.salesDestination,
    productUrl: input.item.productUrl,
    externalLinkButtonTag: input.linkButton?.tag ?? null,
  });
  const metadata = {
    ...existingMetadata,
    title: input.item.title,
    description: input.item.description ?? buildFallbackDescription(input.item),
    category: input.item.category,
    price: input.item.price,
    currency: input.item.currency,
    status: "active",
    tag,
    highlight_label: "Importado por IA",
    attributes: serializeItemAttributes(input.item.attributes),
    inventory: serializeProductInventory(inventory),
    offer: serializeProductOffer(offer),
    fulfillment: serializeProductFulfillment(fulfillment),
    shipping: serializeProductShipping(shipping),
    media: serializeSalesCatalogMedia(media),
    skus: serializeSalesCatalogSkus(input.item.skus),
    source: "ai_import",
    sales_destination: input.item.salesDestination,
    source_product_url: input.item.productUrl,
    source_image_url: input.item.imageUrl,
    import_external_image: input.item.importExternalImage,
    image_import_status: mediaResult.imageImportStatus,
    image_import_error: mediaResult.imageImportError,
    link_button_id: input.linkButton?.id ?? null,
    link_button_label: input.linkButton?.label ?? null,
    link_button_tag: input.linkButton?.tag ?? null,
    link_button_tracking_url: input.linkButton?.trackingUrl ?? null,
    assigned_agent_ids: input.assignmentScope.assignedAgentIds,
    assigned_whatsapp_instance_ids: input.assignmentScope.assignedWhatsappInstanceIds,
    import_job_id: input.jobId,
    import_item_id: input.item.id,
    readiness: getSalesCatalogReadiness({
      description: input.item.description ?? buildFallbackDescription(input.item),
      media,
    }),
    duplicate_resolution: existingCatalogItem ? "updated_existing" : "created_new",
    duplicate_source_import_item_id: input.item.id,
    duplicate_target_item_id: input.targetCatalogItemId ?? null,
    created_by: readString(existingMetadata.created_by) ?? input.userId,
    updated_by: input.userId,
    updated_from: existingCatalogItem ? "sales_catalog_ai_import_duplicate_update" : "sales_catalog_ai_import",
  };

  const tags = mergeSalesCatalogItemTags(
    existingCatalogItem?.tags,
    input.item.salesDestination === "external_site",
  );

  const mutation = existingCatalogItem
    ? input.client
      .from("intelligence_memory")
      .update({
        title: input.item.title,
        content,
        importance: 0.82,
        tags,
        metadata,
        updated_at: now,
      })
      .eq("id", itemId)
      .eq("organization_id", input.companyId)
      .select("id")
      .single<{ id: string }>()
    : input.client
      .from("intelligence_memory")
      .insert({
        id: itemId,
        scope: "organization",
        organization_id: input.companyId,
        memory_type: "sales_catalog_item",
        title: input.item.title,
        content,
        importance: 0.82,
        tags,
        metadata,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single<{ id: string }>();

  const { data, error } = await mutation;

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel publicar produto no catalogo.");
  }

  if (existingCatalogItem) {
    await input.client
      .from("sales_catalog_skus")
      .delete()
      .eq("organization_id", input.companyId)
      .eq("catalog_item_id", data.id);
  }

  await persistImportedSkus({
    client: input.client,
    companyId: input.companyId,
    itemId: data.id,
    title: input.item.title,
    skus: input.item.skus,
    fallback: {
      price: input.item.price,
      salePrice: offer.salePrice,
      currency: input.item.currency,
      inventory,
      shipping,
      attributes: input.item.attributes,
    },
  });

  await input.client
    .from("sales_catalog_import_items")
    .update({
      status: "published",
      published_catalog_item_id: data.id,
      warnings: mediaResult.imageImportStatus === "failed"
        ? Array.from(new Set([...input.item.warnings, `Imagem nao importada: ${mediaResult.imageImportError ?? "falha no download."}`]))
        : input.item.warnings,
      metadata: buildPublishedImportItemMetadata(input.item, mediaResult),
      published_at: now,
      updated_at: now,
    })
    .eq("id", input.item.id)
    .eq("organization_id", input.companyId);

  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: input.companyId,
    source_type: "sales_catalog_import",
    source_id: input.jobId,
    event_type: "sales_catalog.import_item_published",
    title: `Produto importado: ${input.item.title}`,
    summary: "Publicado no catalogo ConnectyHub.",
    confidence: input.item.confidence,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_item", "ai_import", "whatsapp_agent", "lead_tracking"],
    payload: {
      import_job_id: input.jobId,
      import_item_id: input.item.id,
      catalog_item_id: data.id,
      link_button_id: input.linkButton?.id ?? null,
      link_button_tag: input.linkButton?.tag ?? null,
      sales_destination: input.item.salesDestination,
      assigned_agent_ids: input.assignmentScope.assignedAgentIds,
      assigned_whatsapp_instance_ids: input.assignmentScope.assignedWhatsappInstanceIds,
    },
  });
}

async function loadImportTargetCatalogItem(input: {
  client: SupabaseClient;
  companyId: string;
  itemId: string;
}) {
  const { data, error } = await input.client
    .from("intelligence_memory")
    .select("id, title, content, tags, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("organization_id", input.companyId)
    .eq("memory_type", "sales_catalog_item")
    .eq("id", input.itemId)
    .maybeSingle<ExistingSalesCatalogDuplicateRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar produto duplicado para atualizar: ${error.message}`);
  }

  if (!data) {
    throw new Error("Produto duplicado escolhido para atualizacao nao foi encontrado.");
  }

  return data;
}

function resolveImportDuplicateAction(item: ClientSalesCatalogImportItem): SalesCatalogImportDuplicateAction {
  if (item.duplicateCandidates.length === 0) return "create_new";
  return item.duplicateAction;
}

function resolveImportDuplicateTargetItemId(item: ClientSalesCatalogImportItem) {
  return item.duplicateTargetItemId ?? item.duplicateCandidates[0]?.itemId ?? null;
}

async function markImportItemDuplicateSkipped(input: {
  client: SupabaseClient;
  companyId: string;
  item: ClientSalesCatalogImportItem;
}) {
  await input.client
    .from("sales_catalog_import_items")
    .update({
      status: "discarded",
      warnings: Array.from(new Set([...input.item.warnings, "Item ignorado por duplicidade."])),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.item.id)
    .eq("organization_id", input.companyId);
}

function mergeSalesCatalogItemTags(existingTags: string[] | null | undefined, externalSite: boolean) {
  return Array.from(new Set([
    ...(Array.isArray(existingTags) ? existingTags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())) : []),
    "sales_catalog_item",
    "sales_catalog",
    "ai_import",
    "whatsapp_agent",
    "lead_tracking",
    ...(externalSite ? ["external_site_product"] : []),
  ]));
}

function readSalesCatalogMediaList(value: unknown): SalesCatalogMedia[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): SalesCatalogMedia | null => {
      const record = readRecord(item);
      if (!record) return null;

      const id = readString(record.id) ?? randomUUID();
      const fileName = normalizeOptionalText(readString(record.fileName) ?? readString(record.file_name), 180);
      const contentType = normalizeOptionalText(readString(record.contentType) ?? readString(record.content_type), 120);
      const storageUrl = normalizeDraftUrl(readString(record.storageUrl) ?? readString(record.storage_url));
      const size = normalizeNumber(record.size);
      const createdAt = normalizeOptionalText(readString(record.createdAt) ?? readString(record.created_at), 40);

      if (!fileName || !contentType || !storageUrl) return null;

      return {
        id,
        fileName,
        contentType,
        size: size ?? 0,
        storageUrl,
        kind: resolveSalesCatalogMediaKind(contentType, fileName),
        createdAt,
      };
    })
    .filter((item): item is SalesCatalogMedia => Boolean(item))
    .slice(0, 20);
}

async function publishImportItemAsTrackedLink(input: {
  client: SupabaseClient;
  companyId: string;
  userId: string;
  jobId: string;
  item: ClientSalesCatalogImportItem;
}): Promise<PublishedTrackedLinkButton> {
  if (!input.item.productUrl) {
    throw new Error("Produto externo precisa ter URL de destino.");
  }

  const url = normalizeHttpUrl(input.item.productUrl);
  const slug = createTrackedLinkSlug(input.item.title);
  const now = new Date().toISOString();
  const { data, error } = await input.client
    .from("intelligence_memory")
    .insert({
      scope: "organization",
      organization_id: input.companyId,
      memory_type: "tracked_link_button",
      title: input.item.title,
      content: url,
      importance: 0.7,
      tags: ["tracked_link_button", "ai_import", "whatsapp_agent", "lead_tracking", "external_site_product"],
      metadata: {
        label: input.item.title,
        url,
        slug,
        click_count: 0,
        sales_destination: "external_site",
        import_job_id: input.jobId,
        import_item_id: input.item.id,
        product_title: input.item.title,
        product_description: input.item.description,
        product_category: input.item.category,
        product_price: input.item.price,
        product_currency: input.item.currency,
        image_url: input.item.imageUrl,
        confidence: input.item.confidence,
        created_by: input.userId,
      },
      created_at: now,
      updated_at: now,
    })
    .select("id, metadata")
    .single<{ id: string; metadata: JsonRecord | null }>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel criar botao rastreado.");
  }

  const tag = createTrackedLinkTag(input.item.title, data.id);
  const trackingUrl = buildTrackedLinkUrl(data.id);
  const metadata = {
    ...(data.metadata ?? {}),
    tag,
    tracking_url: trackingUrl,
  };

  const { error: updateError } = await input.client
    .from("intelligence_memory")
    .update({ metadata, updated_at: now })
    .eq("id", data.id)
    .eq("organization_id", input.companyId);

  if (updateError) {
    throw new Error(`Botao criado, mas tag nao foi salva: ${updateError.message}`);
  }

  await input.client
    .from("sales_catalog_import_items")
    .update({
      status: "published",
      published_link_button_id: data.id,
      published_at: now,
      updated_at: now,
    })
    .eq("id", input.item.id)
    .eq("organization_id", input.companyId);

  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: input.companyId,
    source_type: "tracked_link_button",
    source_id: data.id,
    event_type: "tracked_link.created_from_import",
    title: `Botao externo importado: ${input.item.title}`,
    summary: `Tag ${tag} criada para envio por botao no WhatsApp.`,
    confidence: input.item.confidence,
    visibility: "organization",
    tags: ["tracked_link_button", "ai_import", "whatsapp_agent", "lead_tracking"],
    payload: {
      import_job_id: input.jobId,
      import_item_id: input.item.id,
      url,
      tag,
      tracking_url: trackingUrl,
      sales_destination: "external_site",
    },
  });

  return {
    id: data.id,
    label: input.item.title,
    url,
    tag,
    trackingUrl,
  };
}

async function persistImportedSkus(input: {
  client: SupabaseClient;
  companyId: string;
  itemId: string;
  title: string;
  skus: SalesCatalogSku[];
  fallback: {
    price: string | null;
    salePrice: string | null;
    currency: string;
    inventory: SalesCatalogProductInventory;
    shipping: SalesCatalogProductShipping;
    attributes: SalesCatalogItemAttribute[];
  };
}) {
  const now = new Date().toISOString();
  const sourceSkus = input.skus.length > 0
    ? input.skus
    : [createDraftSku({
        title: input.title,
        skuCode: createSkuCode(input.title, input.itemId),
        price: input.fallback.price,
        salePrice: input.fallback.salePrice,
        stockQuantity: input.fallback.inventory.quantity,
      })];
  const payload = sourceSkus.map((sku) => ({
    id: randomUUID(),
    organization_id: input.companyId,
    catalog_item_id: input.itemId,
    sku_code: normalizeSkuCode(sku.skuCode) ?? createSkuCode(sku.title ?? input.title, randomUUID()),
    title: sku.title ?? input.title,
    attributes: serializeItemAttributes(sku.attributes.length ? sku.attributes : input.fallback.attributes),
    price: sku.price ?? input.fallback.price,
    sale_price: sku.salePrice ?? input.fallback.salePrice,
    currency: sku.currency || input.fallback.currency,
    stock_status: sku.stockStatus,
    stock_quantity: sku.stockQuantity ?? input.fallback.inventory.quantity,
    low_stock_threshold: sku.lowStockThreshold,
    weight_grams: sku.weightGrams ?? input.fallback.shipping.weightGrams,
    dimensions: {
      length_cm: sku.dimensions.lengthCm ?? input.fallback.shipping.dimensions.lengthCm,
      width_cm: sku.dimensions.widthCm ?? input.fallback.shipping.dimensions.widthCm,
      height_cm: sku.dimensions.heightCm ?? input.fallback.shipping.dimensions.heightCm,
    },
    media_ids: sku.mediaIds,
    status: sku.status,
    metadata: {
      source: "sales_catalog_ai_import",
    },
    updated_at: now,
  }));

  if (payload.length > 0) {
    const { error } = await input.client
      .from("sales_catalog_skus")
      .insert(payload);

    if (error) {
      throw new Error(`Produto publicado, mas SKUs nao foram salvos: ${error.message}`);
    }
  }
}

async function fetchPageSourceText(sourceUrl: string) {
  const url = normalizeHttpUrl(sourceUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "ConnectyHub Catalog Importer/1.0",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`A pagina respondeu status ${response.status}.`);
    }

    const html = await response.text();
    const structured = extractJsonLdProductText(html);
    const visible = extractVisibleText(html);
    const text = [structured, visible].filter(Boolean).join("\n\n").slice(0, maxPageChars);

    return {
      text,
      summary: `Pagina lida com ${text.length.toLocaleString("pt-BR")} caracteres uteis.`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractJsonLdProductText(html: string) {
  const scripts = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))
    .map((match) => decodeHtml(match[1] ?? ""));
  const lines: string[] = [];

  for (const script of scripts) {
    const parsed = parseJsonObject(script);
    const records = flattenJsonLd(parsed);

    for (const record of records) {
      const type = readString(record["@type"]);
      if (!type || !type.toLowerCase().includes("product")) continue;

      const name = readString(record.name);
      const description = readString(record.description);
      const image = Array.isArray(record.image) ? readString(record.image[0]) : readString(record.image);
      const offers = Array.isArray(record.offers) ? readRecord(record.offers[0]) : readRecord(record.offers);
      const price = readString(offers?.price) ?? readString(offers?.lowPrice);
      const currency = readString(offers?.priceCurrency);
      const url = readString(record.url) ?? readString(offers?.url);

      if (!name) continue;

      lines.push([
        `Produto: ${name}`,
        description ? `Descricao: ${description}` : "",
        price ? `Preco: ${price}${currency ? ` ${currency}` : ""}` : "",
        url ? `URL: ${url}` : "",
        image ? `Imagem: ${image}` : "",
      ].filter(Boolean).join("\n"));
    }
  }

  return lines.join("\n\n");
}

function extractVisibleText(html: string) {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDraft(input: {
  title: string;
  description: string | null;
  category: string | null;
  price: string | null;
  productUrl: string | null;
  imageUrl: string | null;
  salesDestination: SalesCatalogImportDestination;
  importExternalImage?: boolean;
  confidence: number;
  warnings: string[];
  sourceEvidence: JsonRecord;
  skus: SalesCatalogSku[];
  inventory?: SalesCatalogProductInventory;
  shipping?: SalesCatalogProductShipping;
  fulfillment?: SalesCatalogProductFulfillment;
  offer?: SalesCatalogProductOffer;
}): SalesCatalogImportDraft {
  return {
    title: input.title,
    description: input.description,
    category: input.category,
    price: input.price,
    currency: "BRL",
    productUrl: input.productUrl,
    imageUrl: input.imageUrl,
    importExternalImage: input.importExternalImage ?? shouldImportExternalImage({
      destination: input.salesDestination,
      imageUrl: input.imageUrl,
    }),
    attributes: mergeAttributesFromSkus(input.skus),
    skus: input.skus,
    inventory: input.inventory ?? emptySalesCatalogProductInventory(),
    shipping: input.shipping ?? emptySalesCatalogProductShipping(),
    fulfillment: input.fulfillment ?? emptySalesCatalogProductFulfillment(),
    offer: input.offer ?? emptySalesCatalogProductOffer(),
    salesDestination: input.salesDestination,
    confidence: clampConfidence(input.confidence),
    warnings: Array.from(new Set(input.warnings.filter(Boolean))).slice(0, 8),
    sourceEvidence: input.sourceEvidence,
  };
}

function normalizeDraft(value: unknown, input: {
  defaultSalesDestination: SalesCatalogImportDestination;
  targetMode: SalesCatalogImportTargetMode;
  sourceUrl?: string | null;
}): SalesCatalogImportDraft | null {
  const record = readRecord(value);
  if (!record) return null;

  const title = normalizeTitle(readString(record.title));
  if (!title) return null;

  const links = classifyImportLinks({
    productValues: [
      record.productUrl,
      record.product_url,
      record.url,
      record.link,
      record.productLink,
      record.product_link,
    ],
    imageValues: [
      record.imageUrl,
      record.image_url,
      record.image,
      record.imagem,
      record.foto,
      record.photo,
    ],
    searchableValues: Object.values(record).filter((item) => typeof item === "string"),
    fallbackProductUrl: input.targetMode === "external_site" ? input.sourceUrl ?? null : null,
  });
  const productUrl = links.productUrl;
  const price = normalizePrice(readString(record.price));
  const explicitDestination = readOptionalSalesDestination(readString(record.salesDestination) ?? readString(record.sales_destination));
  const salesDestination = resolveDraftDestination({
    explicit: explicitDestination,
    targetMode: input.targetMode,
    defaultSalesDestination: input.defaultSalesDestination,
    productUrl,
  });
  const attributes = readAttributes(record.attributes);
  const skus = readSkus(record.skus, { title, price, attributes });
  const warnings = [
    ...readStringList(record.warnings),
    ...buildDraftWarnings({ destination: salesDestination, price, productUrl }),
  ];

  return {
    title,
    description: normalizeOptionalText(readString(record.description), 1400),
    category: normalizeOptionalText(readString(record.category), 80),
    price,
    currency: normalizeCurrency(readString(record.currency)),
    productUrl,
    imageUrl: links.imageUrl,
    importExternalImage: shouldImportExternalImage({
      destination: salesDestination,
      imageUrl: links.imageUrl,
    }),
    attributes,
    skus,
    inventory: readInventory(record.inventory),
    shipping: readShipping(record.shipping),
    fulfillment: readFulfillment(record.fulfillment),
    offer: readOffer(record.offer),
    salesDestination,
    confidence: clampConfidence(readNumber(record.confidence) ?? 0.68),
    warnings: Array.from(new Set(warnings.filter(Boolean))).slice(0, 8),
    sourceEvidence: readRecord(record.sourceEvidence) ?? readRecord(record.source_evidence) ?? {},
  };
}

function buildDraftWarnings(input: {
  destination: SalesCatalogImportDestination;
  price: string | null;
  productUrl: string | null;
}) {
  const warnings: string[] = [];

  if (input.destination === "external_site" && !input.productUrl) {
    warnings.push("Destino externo sem URL do produto.");
  }

  if (input.destination === "connectyhub_checkout" && !input.price) {
    warnings.push("Preco nao identificado; revise antes de liberar checkout automatico.");
  }

  return warnings;
}

function createDraftSku(input: {
  title: string;
  skuCode: string;
  price: string | null;
  salePrice?: string | null;
  stockQuantity?: number | null;
}): SalesCatalogSku {
  return {
    id: null,
    companyId: "",
    catalogItemId: null,
    skuCode: normalizeSkuCode(input.skuCode) ?? createSkuCode(input.title, randomUUID()),
    title: input.title,
    attributes: [],
    price: input.price,
    salePrice: input.salePrice ?? null,
    currency: "BRL",
    stockStatus: "in_stock",
    stockQuantity: input.stockQuantity ?? null,
    lowStockThreshold: null,
    weightGrams: null,
    dimensions: { lengthCm: null, widthCm: null, heightCm: null },
    mediaIds: [],
    status: "active",
    createdAt: null,
    updatedAt: null,
  };
}

type ImportedMediaBuildResult = {
  media: SalesCatalogMedia[];
  imageImportStatus: SalesCatalogImportImageImportStatus | null;
  imageImportError: string | null;
};

async function buildImportedMedia(input: {
  client: SupabaseClient;
  companyId: string;
  itemId: string;
  item: ClientSalesCatalogImportItem;
  now: string;
}): Promise<ImportedMediaBuildResult> {
  if (!input.item.imageUrl) {
    return { media: [], imageImportStatus: null, imageImportError: null };
  }

  if (!shouldImportExternalImage({
    destination: input.item.salesDestination,
    imageUrl: input.item.imageUrl,
    enabled: input.item.importExternalImage,
  })) {
    return { media: [], imageImportStatus: "skipped", imageImportError: null };
  }

  try {
    const media = await importExternalImageToR2({
      client: input.client,
      companyId: input.companyId,
      itemId: input.itemId,
      itemTitle: input.item.title,
      imageUrl: input.item.imageUrl,
      now: input.now,
    });

    return { media: [media], imageImportStatus: "imported", imageImportError: null };
  } catch (error) {
    return {
      media: [],
      imageImportStatus: "failed",
      imageImportError: error instanceof Error ? error.message : "Falha ao importar imagem externa.",
    };
  }
}

async function importExternalImageToR2(input: {
  client: SupabaseClient;
  companyId: string;
  itemId: string;
  itemTitle: string;
  imageUrl: string;
  now: string;
}): Promise<SalesCatalogMedia> {
  const imageUrl = normalizeDraftUrl(input.imageUrl);
  if (!imageUrl) {
    throw new Error("URL de imagem invalida.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "ConnectyHub Catalog Image Importer/1.0",
        accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5",
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(error instanceof Error && error.name === "AbortError"
      ? "Tempo esgotado ao baixar imagem."
      : "Nao foi possivel baixar imagem externa.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Imagem respondeu status ${response.status}.`);
  }

  const declaredBytes = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > maxImportedImageBytes) {
    throw new Error("Imagem maior que 20 MB.");
  }

  const contentType = normalizeImportedImageContentType(response.headers.get("content-type"), imageUrl);
  if (!contentType) {
    throw new Error("URL nao retornou uma imagem valida.");
  }

  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength > maxImportedImageBytes) {
    throw new Error("Imagem maior que 20 MB.");
  }

  await assertStorageUploadAllowed({
    client: input.client,
    organizationId: input.companyId,
    category: "product_media",
    files: [{
      fileName: fileNameFromUrl(imageUrl) ?? input.itemTitle,
      contentType,
      sizeBytes: body.byteLength,
    }],
  });

  const configResult = await loadR2Config(input.client);
  if (!configResult.ok) {
    throw new Error(configResult.error);
  }

  const extension = extensionForImageContentType(contentType) ?? extensionFromImageUrl(imageUrl) ?? "jpg";
  const sourceFileName = fileNameFromUrl(imageUrl) ?? `${input.itemTitle}.${extension}`;
  const fileName = ensureFileExtension(sanitizeFileName(sourceFileName), extension);
  const objectKey = [
    "sales-catalog",
    input.companyId,
    "imports",
    input.itemId,
    `${randomUUID()}-${fileName}`,
  ].join("/");
  const upload = await putR2Object(configResult.config, objectKey, body, contentType);

  if (!upload.ok) {
    throw new Error(upload.error);
  }

  await recordOrganizationStorageUsage({
    client: input.client,
    organizationId: input.companyId,
    category: "product_media",
    bytes: upload.bytesSize,
    fileCount: 1,
    metadata: {
      source: "sales_catalog_external_image_import",
      product_id: input.itemId,
      object_key: upload.objectKey,
      content_type: contentType,
    },
  });

  return {
    id: randomUUID(),
    fileName,
    contentType,
    size: upload.bytesSize,
    storageUrl: upload.publicUrl,
    kind: resolveSalesCatalogMediaKind(contentType, fileName),
    createdAt: input.now,
  };
}

function buildImportItemPatchMetadata(patch: NormalizedItemPatch): JsonRecord | null {
  const metadata: JsonRecord = {};
  let changed = false;

  if ("imageUrl" in patch) {
    changed = true;
    metadata.image_import_error = null;

    if (!patch.imageUrl) {
      metadata.import_external_image = false;
      metadata.image_import_status = null;
    }
  }

  if ("importExternalImage" in patch) {
    changed = true;
    metadata.import_external_image = patch.importExternalImage === true;
    metadata.image_import_status = patch.importExternalImage ? "pending" : "skipped";
    metadata.image_import_error = null;
  }

  if (patch.salesDestination === "external_site" || patch.salesDestination === "manual_handoff") {
    changed = true;
    metadata.import_external_image = false;
    metadata.image_import_status = "skipped";
    metadata.image_import_error = null;
  }

  if ("duplicateAction" in patch) {
    changed = true;
    metadata.duplicate_action = patch.duplicateAction;
  }

  if ("duplicateTargetItemId" in patch) {
    changed = true;
    metadata.duplicate_target_item_id = patch.duplicateTargetItemId;
  }

  return changed ? metadata : null;
}

function buildPublishedImportItemMetadata(
  item: ClientSalesCatalogImportItem,
  mediaResult: ImportedMediaBuildResult,
): JsonRecord {
  return {
    created_from: "sales_catalog_ai_import",
    import_version: 1,
    import_external_image: item.importExternalImage,
    image_import_status: mediaResult.imageImportStatus,
    image_import_error: mediaResult.imageImportError,
    source_image_url: item.imageUrl,
    imported_media_count: mediaResult.media.length,
    duplicate_candidates: serializeDuplicateCandidates(item.duplicateCandidates),
    duplicate_action: item.duplicateAction,
    duplicate_target_item_id: item.duplicateTargetItemId,
  };
}

function shouldImportExternalImage(input: {
  destination: SalesCatalogImportDestination;
  imageUrl: string | null;
  enabled?: boolean | null;
}) {
  if (!input.imageUrl || input.destination !== "connectyhub_checkout") return false;
  if (typeof input.enabled === "boolean") return input.enabled;
  return true;
}

function normalizeImportExternalImage(input: {
  value: boolean | null;
  destination: SalesCatalogImportDestination;
  imageUrl: string | null;
}) {
  return shouldImportExternalImage({
    destination: input.destination,
    imageUrl: input.imageUrl,
    enabled: input.value,
  });
}

function normalizeImageImportStatus(value: unknown): SalesCatalogImportImageImportStatus | null {
  if (value === "pending" || value === "imported" || value === "skipped" || value === "failed") return value;
  return null;
}

function buildFallbackDescription(item: ClientSalesCatalogImportItem) {
  const parts = [
    item.description,
    item.productUrl ? `Produto importado do site: ${item.productUrl}` : "",
    item.salesDestination === "manual_handoff" ? "Destino de venda precisa de revisao." : "",
  ].filter(Boolean);

  return parts.join("\n") || "Produto importado por IA para atendimento no WhatsApp.";
}

function countDraftDestinations(drafts: SalesCatalogImportDraft[]) {
  return drafts.reduce((acc, draft) => {
    acc[draft.salesDestination] = (acc[draft.salesDestination] ?? 0) + 1;
    return acc;
  }, {} as Record<SalesCatalogImportDestination, number>);
}

async function markImportFailed(client: SupabaseClient, jobId: string, companyId: string, message: string) {
  await Promise.all([
    client
      .from("sales_catalog_import_jobs")
      .update({
        status: "failed",
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("organization_id", companyId),
    client.from("sales_catalog_import_events").insert({
      import_job_id: jobId,
      organization_id: companyId,
      level: "error",
      event_type: "sales_catalog_import.failed",
      title: "Importacao falhou",
      summary: message,
      payload: {},
    }),
  ]);
}

function buildQueuedImportSourceRows(input: {
  jobId: string;
  companyId: string;
  sourceKind: SalesCatalogImportSourceKind;
  sourceUrl?: string | null;
  sourceText: string;
  files?: SalesCatalogImportFileInput[] | null;
}) {
  const baseMetadata = {
    queued_processing: true,
    source_chars: input.sourceText.length,
  };
  const rows: JsonRecord[] = [];

  if (input.sourceUrl || input.sourceText.trim()) {
    rows.push({
      import_job_id: input.jobId,
      organization_id: input.companyId,
      kind: input.sourceKind === "site" ? "site" : input.sourceKind === "csv" ? "csv" : "text",
      source_url: input.sourceUrl ?? null,
      text_excerpt: input.sourceText.slice(0, maxImportTextChars),
      metadata: baseMetadata,
    });
  }

  for (const file of input.files ?? []) {
    rows.push({
      import_job_id: input.jobId,
      organization_id: input.companyId,
      kind: sourceKindFromFile(file, input.sourceKind),
      file_name: file.fileName,
      content_type: file.contentType,
      file_size: file.size,
      text_excerpt: file.text?.slice(0, maxImportTextChars) ?? null,
      metadata: {
        ...baseMetadata,
        file_name: file.fileName,
        inline_base64: file.base64,
      },
    });
  }

  return rows;
}

function sourceKindFromFile(file: SalesCatalogImportFileInput, fallback: SalesCatalogImportSourceKind) {
  if (file.contentType.includes("pdf")) return "pdf";
  if (file.contentType.startsWith("image/")) return "image";
  if (file.contentType.includes("spreadsheet") || /\.(xlsx?|ods)$/i.test(file.fileName)) return "excel";
  if (file.contentType.includes("csv") || /\.csv$/i.test(file.fileName)) return "csv";
  if (fallback === "pdf" || fallback === "image" || fallback === "excel" || fallback === "csv") return fallback;
  return "file";
}

const importJobSelect = [
  "id",
  "organization_id",
  "created_by",
  "source_kind",
  "target_mode",
  "default_sales_destination",
  "status",
  "title",
  "input_url",
  "source_summary",
  "settings",
  "stats",
  "error_message",
  "processed_at",
  "published_at",
  "created_at",
  "updated_at",
].join(", ");

const importSourceSelect = [
  "id",
  "import_job_id",
  "organization_id",
  "kind",
  "file_name",
  "content_type",
  "file_size",
  "storage_url",
  "source_url",
  "text_excerpt",
  "metadata",
  "created_at",
].join(", ");

const importItemSelect = [
  "id",
  "import_job_id",
  "organization_id",
  "status",
  "sales_destination",
  "title",
  "description",
  "category",
  "price",
  "currency",
  "product_url",
  "image_url",
  "attributes",
  "skus",
  "add_ons",
  "inventory",
  "shipping",
  "fulfillment",
  "offer",
  "confidence",
  "warnings",
  "source_evidence",
  "published_catalog_item_id",
  "published_link_button_id",
  "metadata",
  "published_at",
  "created_at",
  "updated_at",
].join(", ");

const importEventSelect = [
  "id",
  "import_job_id",
  "organization_id",
  "level",
  "event_type",
  "title",
  "summary",
  "payload",
  "created_at",
].join(", ");

function mapImportJob(job: ImportJobRow, items: ImportItemRow[], events: ImportEventRow[]): ClientSalesCatalogImportJob {
  const assignmentScope = readImportJobAssignmentScope(job);

  return {
    id: job.id,
    companyId: job.organization_id,
    createdBy: job.created_by,
    sourceKind: job.source_kind,
    sourcePlatform: readImportJobSourcePlatform(job),
    targetMode: job.target_mode,
    defaultSalesDestination: job.default_sales_destination,
    assignedAgentIds: assignmentScope.assignedAgentIds,
    assignedWhatsappInstanceIds: assignmentScope.assignedWhatsappInstanceIds,
    status: job.status,
    title: job.title,
    inputUrl: job.input_url,
    sourceSummary: job.source_summary,
    stats: job.stats ?? {},
    errorMessage: job.error_message,
    processedAt: job.processed_at,
    publishedAt: job.published_at,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    items: items.map(mapImportItem),
    events: events.map(mapImportEvent),
  };
}

function mapImportItem(row: ImportItemRow): ClientSalesCatalogImportItem {
  const metadata = readRecord(row.metadata) ?? {};
  const importExternalImage = normalizeImportExternalImage({
    value: readBoolean(metadata.import_external_image),
    destination: row.sales_destination,
    imageUrl: row.image_url,
  });
  const duplicateCandidates = readDuplicateCandidates(metadata.duplicate_candidates);

  return {
    id: row.id,
    jobId: row.import_job_id,
    companyId: row.organization_id,
    status: row.status,
    salesDestination: row.sales_destination,
    title: row.title,
    description: row.description,
    category: row.category,
    price: row.price,
    currency: normalizeCurrency(row.currency),
    productUrl: row.product_url,
    imageUrl: row.image_url,
    importExternalImage,
    imageImportStatus: normalizeImageImportStatus(readString(metadata.image_import_status)),
    imageImportError: readString(metadata.image_import_error),
    duplicateCandidates,
    duplicateAction: normalizeDuplicateAction(readString(metadata.duplicate_action)) ?? defaultDuplicateAction(duplicateCandidates),
    duplicateTargetItemId: normalizeUuid(readString(metadata.duplicate_target_item_id)) ?? duplicateCandidates[0]?.itemId ?? null,
    attributes: readAttributes(row.attributes),
    skus: readSkus(row.skus, { title: row.title, price: row.price, attributes: readAttributes(row.attributes) }),
    inventory: readInventory(row.inventory),
    shipping: readShipping(row.shipping),
    fulfillment: readFulfillment(row.fulfillment),
    offer: readOffer(row.offer),
    confidence: clampConfidence(readNumber(row.confidence) ?? 0.5),
    warnings: row.warnings ?? [],
    sourceEvidence: row.source_evidence ?? {},
    publishedCatalogItemId: row.published_catalog_item_id,
    publishedLinkButtonId: row.published_link_button_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapImportEvent(row: ImportEventRow): ClientSalesCatalogImportEvent {
  return {
    id: row.id,
    jobId: row.import_job_id,
    companyId: row.organization_id,
    level: row.level,
    eventType: row.event_type,
    title: row.title,
    summary: row.summary,
    createdAt: row.created_at,
  };
}

type NormalizedItemPatch = {
  id: string;
  status?: SalesCatalogImportItemStatus;
  salesDestination?: SalesCatalogImportDestination;
  title?: string;
  description?: string | null;
  category?: string | null;
  price?: string | null;
  productUrl?: string | null;
  imageUrl?: string | null;
  importExternalImage?: boolean;
  duplicateAction?: SalesCatalogImportDuplicateAction;
  duplicateTargetItemId?: string | null;
};

function normalizeItemPatch(patch: SalesCatalogImportItemPatch): NormalizedItemPatch | null {
  const id = normalizeUuid(patch.id);
  if (!id) return null;

  const normalized: NormalizedItemPatch = { id };
  const status = normalizeItemStatus(patch.status);
  const destination = readOptionalSalesDestination(patch.salesDestination);
  const title = normalizeTitle(patch.title);

  if (status) normalized.status = status;
  if (destination) normalized.salesDestination = destination;
  if (title) normalized.title = title;
  if ("description" in patch) normalized.description = normalizeOptionalText(patch.description, 1400);
  if ("category" in patch) normalized.category = normalizeOptionalText(patch.category, 80);
  if ("price" in patch) normalized.price = normalizePrice(patch.price);
  if ("productUrl" in patch) normalized.productUrl = normalizeDraftUrl(patch.productUrl);
  if ("imageUrl" in patch) normalized.imageUrl = normalizeDraftUrl(patch.imageUrl);
  if ("importExternalImage" in patch) normalized.importExternalImage = readBoolean(patch.importExternalImage) ?? false;
  if ("duplicateAction" in patch) {
    const duplicateAction = normalizeDuplicateAction(patch.duplicateAction);
    if (duplicateAction) normalized.duplicateAction = duplicateAction;
  }
  if ("duplicateTargetItemId" in patch) {
    normalized.duplicateTargetItemId = normalizeUuid(patch.duplicateTargetItemId) ?? null;
  }

  return normalized;
}

function readAttributes(value: unknown): SalesCatalogItemAttribute[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): SalesCatalogItemAttribute | null => {
      const record = readRecord(item);
      const name = normalizeOptionalText(readString(record?.name), 80);
      const values = readStringList(record?.values).slice(0, 30);

      if (!name || values.length === 0) return null;

      return {
        id: readString(record?.id) ?? createAttributeId(name),
        name,
        values,
      };
    })
    .filter((item): item is SalesCatalogItemAttribute => Boolean(item))
    .slice(0, 20);
}

function readSkus(value: unknown, fallback: {
  title: string;
  price: string | null;
  attributes: SalesCatalogItemAttribute[];
}): SalesCatalogSku[] {
  if (!Array.isArray(value)) {
    return fallback.price ? [createDraftSku({ title: fallback.title, skuCode: createSkuCode(fallback.title, "1"), price: fallback.price })] : [];
  }

  return value
    .map((item, index): SalesCatalogSku | null => {
      const record = readRecord(item);
      if (!record) return null;

      const title = normalizeOptionalText(readString(record.title), 120) ?? fallback.title;
      const skuCode = normalizeSkuCode(readString(record.skuCode) ?? readString(record.sku_code)) ?? createSkuCode(title, String(index + 1));

      return {
        id: normalizeUuid(readString(record.id)),
        companyId: "",
        catalogItemId: null,
        skuCode,
        title,
        attributes: readAttributes(record.attributes),
        price: normalizePrice(readString(record.price)) ?? fallback.price,
        salePrice: normalizePrice(readString(record.salePrice) ?? readString(record.sale_price)),
        currency: normalizeCurrency(readString(record.currency)),
        stockStatus: normalizeStockStatus(readString(record.stockStatus) ?? readString(record.stock_status)),
        stockQuantity: normalizeNumber(record.stockQuantity ?? record.stock_quantity),
        lowStockThreshold: normalizeNumber(record.lowStockThreshold ?? record.low_stock_threshold),
        weightGrams: normalizeNumber(record.weightGrams ?? record.weight_grams),
        dimensions: readDimensions(record.dimensions),
        mediaIds: readStringList(record.mediaIds ?? record.media_ids),
        status: normalizeSkuStatus(readString(record.status)),
        createdAt: null,
        updatedAt: null,
      };
    })
    .filter((item): item is SalesCatalogSku => Boolean(item))
    .slice(0, 120);
}

function readInventory(value: unknown): SalesCatalogProductInventory {
  const fallback = emptySalesCatalogProductInventory();
  const record = readRecord(value);
  if (!record) return fallback;

  return {
    status: normalizeStockStatus(readString(record.status)),
    quantity: normalizeNumber(record.quantity),
    lowStockThreshold: normalizeNumber(record.lowStockThreshold ?? record.low_stock_threshold),
    allowBackorder: readBoolean(record.allowBackorder ?? record.allow_backorder) ?? fallback.allowBackorder,
    notes: normalizeOptionalText(readString(record.notes), 240),
  };
}

function readShipping(value: unknown): SalesCatalogProductShipping {
  const fallback = emptySalesCatalogProductShipping();
  const record = readRecord(value);
  if (!record) return fallback;

  return {
    weightGrams: normalizeNumber(record.weightGrams ?? record.weight_grams),
    dimensions: readDimensions(record.dimensions),
    profile: record.profile === "free" || record.profile === "custom" ? record.profile : "default",
    notes: normalizeOptionalText(readString(record.notes), 240),
  };
}

function readFulfillment(value: unknown): SalesCatalogProductFulfillment {
  const fallback = emptySalesCatalogProductFulfillment();
  const record = readRecord(value);
  if (!record) return fallback;

  return {
    mode: normalizeFulfillmentMode(readString(record.mode)),
    schedulingRequired: readBoolean(record.schedulingRequired ?? record.scheduling_required) ?? fallback.schedulingRequired,
    serviceDuration: normalizeOptionalText(readString(record.serviceDuration ?? record.service_duration), 80),
    deliveryInstructions: normalizeOptionalText(readString(record.deliveryInstructions ?? record.delivery_instructions), 240),
    accessInstructions: normalizeOptionalText(readString(record.accessInstructions ?? record.access_instructions), 240),
  };
}

function readOffer(value: unknown): SalesCatalogProductOffer {
  const fallback = emptySalesCatalogProductOffer();
  const record = readRecord(value);
  if (!record) return fallback;

  return {
    salePrice: normalizePrice(readString(record.salePrice ?? record.sale_price)),
    saleStartsAt: normalizeOptionalText(readString(record.saleStartsAt ?? record.sale_starts_at), 40),
    saleEndsAt: normalizeOptionalText(readString(record.saleEndsAt ?? record.sale_ends_at), 40),
    couponCode: normalizeOptionalText(readString(record.couponCode ?? record.coupon_code), 40),
    couponDescription: normalizeOptionalText(readString(record.couponDescription ?? record.coupon_description), 160),
    callToAction: normalizeOptionalText(readString(record.callToAction ?? record.call_to_action), 180),
    notes: normalizeOptionalText(readString(record.notes), 240),
  };
}

function readDimensions(value: unknown) {
  const record = readRecord(value) ?? {};

  return {
    lengthCm: normalizeNumber(record.lengthCm ?? record.length_cm),
    widthCm: normalizeNumber(record.widthCm ?? record.width_cm),
    heightCm: normalizeNumber(record.heightCm ?? record.height_cm),
  };
}

function mergeAttributesFromSkus(skus: SalesCatalogSku[]) {
  const byName = new Map<string, Set<string>>();

  for (const sku of skus) {
    for (const attribute of sku.attributes) {
      const current = byName.get(attribute.name) ?? new Set<string>();
      for (const value of attribute.values) current.add(value);
      byName.set(attribute.name, current);
    }
  }

  return Array.from(byName.entries()).map(([name, values]) => ({
    id: createAttributeId(name),
    name,
    values: Array.from(values),
  }));
}

function serializeItemAttributes(attributes: SalesCatalogItemAttribute[]) {
  return attributes.map((attribute) => ({
    id: attribute.id,
    name: attribute.name,
    values: attribute.values,
  }));
}

function serializeSalesCatalogSkus(skus: SalesCatalogSku[]) {
  return skus.map((sku) => ({
    id: sku.id,
    sku_code: sku.skuCode,
    title: sku.title,
    attributes: serializeItemAttributes(sku.attributes),
    price: sku.price,
    sale_price: sku.salePrice,
    currency: sku.currency,
    stock_status: sku.stockStatus,
    stock_quantity: sku.stockQuantity,
    low_stock_threshold: sku.lowStockThreshold,
    weight_grams: sku.weightGrams,
    dimensions: {
      length_cm: sku.dimensions.lengthCm,
      width_cm: sku.dimensions.widthCm,
      height_cm: sku.dimensions.heightCm,
    },
    media_ids: sku.mediaIds,
    status: sku.status,
  }));
}

function serializeProductInventory(inventory: SalesCatalogProductInventory) {
  return {
    status: inventory.status,
    quantity: inventory.quantity,
    low_stock_threshold: inventory.lowStockThreshold,
    allow_backorder: inventory.allowBackorder,
    notes: inventory.notes,
  };
}

function serializeProductOffer(offer: SalesCatalogProductOffer) {
  return {
    sale_price: offer.salePrice,
    sale_starts_at: offer.saleStartsAt,
    sale_ends_at: offer.saleEndsAt,
    coupon_code: offer.couponCode,
    coupon_description: offer.couponDescription,
    call_to_action: offer.callToAction,
    notes: offer.notes,
  };
}

function serializeProductFulfillment(fulfillment: SalesCatalogProductFulfillment) {
  return {
    mode: fulfillment.mode,
    scheduling_required: fulfillment.schedulingRequired,
    service_duration: fulfillment.serviceDuration,
    delivery_instructions: fulfillment.deliveryInstructions,
    access_instructions: fulfillment.accessInstructions,
  };
}

function serializeProductShipping(shipping: SalesCatalogProductShipping) {
  return {
    weight_grams: shipping.weightGrams,
    dimensions: {
      length_cm: shipping.dimensions.lengthCm,
      width_cm: shipping.dimensions.widthCm,
      height_cm: shipping.dimensions.heightCm,
    },
    profile: shipping.profile,
    notes: shipping.notes,
  };
}

function serializeSalesCatalogMedia(media: SalesCatalogMedia[]) {
  return media.map((item) => ({
    id: item.id,
    file_name: item.fileName,
    content_type: item.contentType,
    size: item.size,
    storage_url: item.storageUrl,
    kind: item.kind,
    created_at: item.createdAt,
  }));
}

function serializeDuplicateCandidates(candidates: SalesCatalogImportDuplicateCandidate[]) {
  return candidates.map((candidate) => ({
    item_id: candidate.itemId,
    title: candidate.title,
    category: candidate.category,
    price: candidate.price,
    product_url: candidate.productUrl,
    source: candidate.source,
    score: candidate.score,
    reasons: candidate.reasons,
  }));
}

function readDuplicateCandidates(value: unknown): SalesCatalogImportDuplicateCandidate[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): SalesCatalogImportDuplicateCandidate | null => {
      const record = readRecord(item);
      if (!record) return null;

      const itemId = normalizeUuid(readString(record.itemId) ?? readString(record.item_id));
      const title = normalizeTitle(readString(record.title));
      if (!itemId || !title) return null;

      return {
        itemId,
        title,
        category: normalizeOptionalText(readString(record.category), 80),
        price: normalizePrice(readString(record.price)),
        productUrl: normalizeDraftUrl(readString(record.productUrl) ?? readString(record.product_url)),
        source: normalizeOptionalText(readString(record.source), 80),
        score: clampConfidence(readNumber(record.score) ?? 0),
        reasons: readStringList(record.reasons).slice(0, 8),
      };
    })
    .filter((item): item is SalesCatalogImportDuplicateCandidate => Boolean(item))
    .slice(0, 5);
}

function defaultDuplicateAction(candidates: SalesCatalogImportDuplicateCandidate[]): SalesCatalogImportDuplicateAction {
  return candidates.length > 0 ? "skip" : "create_new";
}

function normalizeDuplicateAction(value: unknown): SalesCatalogImportDuplicateAction | null {
  if (value === "create_new" || value === "update_existing" || value === "skip") return value;
  return null;
}

function readCatalogDuplicateSkuCodes(metadata: JsonRecord) {
  const codes = new Set<string>();
  const skus = Array.isArray(metadata.skus) ? metadata.skus : [];

  for (const sku of skus) {
    const record = readRecord(sku);
    const skuCode = normalizeSkuCode(readString(record?.skuCode) ?? readString(record?.sku_code));
    if (skuCode) codes.add(skuCode);
  }

  for (const value of [
    metadata.sku,
    metadata.sku_code,
    metadata.whatsapp_catalog_retailer_id,
    metadata.external_sku,
  ]) {
    const skuCode = normalizeSkuCode(readString(value));
    if (skuCode) codes.add(skuCode);
  }

  return Array.from(codes);
}

function normalizeDuplicateText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:produto|item|modelo|novo|usado|premium)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDuplicateUrl(value: string | null | undefined) {
  const normalized = normalizeDraftUrl(value);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    url.hash = "";
    Array.from(url.searchParams.keys()).forEach((key) => {
      if (/^(utm_|fbclid|gclid|yclid|mc_)/i.test(key)) url.searchParams.delete(key);
    });
    url.pathname = url.pathname.replace(/\/+$/g, "") || "/";
    return url.toString().replace(/\/$/g, "");
  } catch {
    return normalized.replace(/\/+$/g, "");
  }
}

function normalizeDuplicatePrice(value: string) {
  return value.replace(/[^\d]/g, "");
}

function duplicateTitleSimilarity(left: string, right: string) {
  if (!left || !right) return 0;

  const leftTokens = new Set(left.split(" ").filter((token) => token.length > 1));
  const rightTokens = new Set(right.split(" ").filter((token) => token.length > 1));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  const smaller = Math.min(leftTokens.size, rightTokens.size);
  const larger = Math.max(leftTokens.size, rightTokens.size);
  const containment = intersection / smaller;
  const overlap = intersection / larger;

  return (containment * 0.7) + (overlap * 0.3);
}

function resolveDraftDestination(input: {
  explicit: SalesCatalogImportDestination | null;
  targetMode: SalesCatalogImportTargetMode;
  defaultSalesDestination: SalesCatalogImportDestination;
  productUrl: string | null;
}) {
  if (input.explicit) return input.explicit;
  if (input.targetMode === "external_site") return "external_site";
  if (input.targetMode === "connectyhub_checkout") return "connectyhub_checkout";
  if (input.defaultSalesDestination === "external_site" && input.productUrl) return "external_site";
  return input.defaultSalesDestination;
}

function normalizeSourceKind(value: unknown): SalesCatalogImportSourceKind {
  if (value === "csv" || value === "excel" || value === "site" || value === "pdf" || value === "image" || value === "mixed") {
    return value;
  }

  return "text";
}

function normalizeImportPlatform(value: unknown): SalesCatalogImportPlatform {
  if (
    value === "woocommerce"
    || value === "shopify"
    || value === "wix"
    || value === "nuvemshop"
    || value === "loja_integrada"
    || value === "tray"
    || value === "anota_ai"
    || value === "ifood"
    || value === "generic_menu"
    || value === "generic_sheet"
  ) {
    return value;
  }

  return "auto";
}

function normalizeTargetMode(value: unknown): SalesCatalogImportTargetMode {
  if (value === "connectyhub_checkout" || value === "external_site") return value;
  return "connectyhub_checkout";
}

function normalizeSalesDestination(value: unknown, targetMode: SalesCatalogImportTargetMode): SalesCatalogImportDestination {
  if (value === "external_site" || value === "connectyhub_checkout") return value;
  if (targetMode === "external_site") return "external_site";
  return "connectyhub_checkout";
}

function readOptionalSalesDestination(value: unknown): SalesCatalogImportDestination | null {
  if (value === "external_site" || value === "connectyhub_checkout") return value;
  return null;
}

function normalizeItemStatus(value: unknown): SalesCatalogImportItemStatus | null {
  if (value === "draft" || value === "ready" || value === "published" || value === "discarded" || value === "error") return value;
  return null;
}

function normalizeTitle(value: unknown) {
  const title = readString(value)?.replace(/\s+/g, " ").replace(/[-–—:]+$/g, "").trim().slice(0, 160);
  if (!title || title.length < 2) return null;
  return title;
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  const text = readString(value)?.replace(/\s+/g, " ").trim().slice(0, maxLength);
  return text || null;
}

function normalizePrice(value: unknown) {
  const text = readString(value);
  if (!text) return null;

  const match = text.match(/(?:R\$\s*)?\d[\d.,]*(?:[.,]\d{2})?/);
  if (!match) return null;

  return normalizeMoneyText(match[0]);
}

function normalizeMoneyText(value: string) {
  const text = value.replace(/^R\$\s*/i, "").replace(/[^\d.,-]/g, "").trim();
  if (!text) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);
  const decimalPart = decimalIndex >= 0 ? text.slice(decimalIndex + 1).replace(/\D/g, "") : "";

  if (decimalIndex >= 0 && decimalPart.length === 2) {
    const integerPart = text.slice(0, decimalIndex).replace(/[^\d-]/g, "") || "0";
    return `${integerPart},${decimalPart}`;
  }

  return text.replace(/[^\d-]/g, "") || null;
}

function normalizeDraftUrl(value: unknown) {
  const text = cleanUrlCandidate(readString(value));
  if (!text) return null;

  try {
    return normalizeHttpUrl(text);
  } catch {
    return null;
  }
}

function classifyImportLinks(input: {
  productValues: unknown[];
  imageValues: unknown[];
  searchableValues: unknown[];
  fallbackProductUrl?: string | null;
}) {
  const explicitImageUrls = uniqueStrings(input.imageValues.flatMap(extractUrlsFromValue));
  const explicitProductUrls = uniqueStrings(input.productValues.flatMap(extractUrlsFromValue));
  const allUrls = uniqueStrings(input.searchableValues.flatMap(extractUrlsFromValue));
  const imageUrl = explicitImageUrls.find((url) => isLikelyImageUrl(url))
    ?? explicitImageUrls[0]
    ?? allUrls.find((url) => isLikelyImageUrl(url))
    ?? null;
  const productUrl = explicitProductUrls.find((url) => !isLikelyImageUrl(url))
    ?? allUrls.find((url) => !isLikelyImageUrl(url))
    ?? normalizeDraftUrl(input.fallbackProductUrl)
    ?? null;

  return { productUrl, imageUrl };
}

function extractUrlsFromValue(value: unknown) {
  const text = readString(value);
  if (!text) return [];

  return extractUrlsFromText(text);
}

function extractUrlsFromText(text: string) {
  return Array.from(text.matchAll(/https?:\/\/[^\s<>"']+/gi))
    .map((match) => normalizeDraftUrl(match[0]))
    .filter((url): url is string => Boolean(url));
}

function cleanUrlCandidate(value: string | null) {
  return value
    ?.trim()
    .replace(/^[("'[\{]+/g, "")
    .replace(/[)"'\].,;:\}]+$/g, "")
    .trim() ?? null;
}

function isLikelyImageUrl(value: unknown) {
  const normalized = normalizeDraftUrl(value);
  if (!normalized) return false;

  try {
    const url = new URL(normalized);
    const pathname = decodeURIComponent(url.pathname).toLowerCase();
    const host = url.hostname.toLowerCase();
    const format = (url.searchParams.get("format") ?? url.searchParams.get("fm") ?? url.searchParams.get("ext") ?? "").toLowerCase();

    if (/\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(pathname)) return true;
    if (/^(?:avif|gif|jpe?g|png|webp)$/i.test(format)) return true;
    if (pathname.includes("/wp-content/uploads/")) return true;
    if (host.includes("cloudinary") && pathname.includes("/image/")) return true;
    if (/(?:^|\.)images?\./i.test(host) && /\/(?:image|img|media|upload|photo|foto)s?\//i.test(pathname)) return true;

    return false;
  } catch {
    return false;
  }
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeCurrency(value: unknown) {
  const text = readString(value)?.toUpperCase();
  if (text && /^[A-Z]{3}$/.test(text)) return text;
  return "BRL";
}

function normalizeStockStatus(value: unknown): SalesCatalogStockStatus {
  if (value === "out_of_stock" || value === "on_backorder") return value;
  return "in_stock";
}

function normalizeFulfillmentMode(value: unknown): SalesCatalogFulfillmentMode {
  if (value === "digital" || value === "service" || value === "subscription") return value;
  return "physical";
}

function normalizeSkuStatus(value: unknown): SalesCatalogSkuStatus {
  if (value === "draft" || value === "archived") return value;
  return "active";
}

function normalizeSkuCode(value: unknown) {
  const text = readString(value);
  if (!text) return null;

  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return normalized || null;
}

function createSkuCode(title: string, suffix: string | number) {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28) || "SKU";
  const tail = String(suffix).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase() || "1";

  return `${base}-${tail}`;
}

function createAttributeId(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "atributo";
}

function guessDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim());
  if (!firstLine) return null;

  const candidates = [",", ";", "\t"];
  const best = candidates
    .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length }))
    .sort((left, right) => right.count - left.count)[0];

  return best && best.count >= 2 ? best.delimiter : null;
}

function parseDelimitedRows(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"" && next === "\"") {
      current += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current.trim());
      current = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function findHeaderIndex(headers: string[], candidates: string[]) {
  return headers.findIndex((header) => candidates.includes(header) || candidates.some((candidate) => header.includes(candidate)));
}

function findHeaderIndexExactFirst(headers: string[], exactCandidates: string[], containsCandidates: string[]) {
  const exact = headers.findIndex((header) => exactCandidates.includes(header));
  if (exact >= 0) return exact;

  return headers.findIndex((header) => containsCandidates.some((candidate) => header.includes(candidate)));
}

function combineImportedDescription(values: unknown[], maxLength: number) {
  const parts = values
    .map((value) => cleanImportedText(value))
    .filter((value): value is string => Boolean(value));
  const unique = Array.from(new Set(parts));
  const text = unique.join("\n\n").replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").trim();

  return text ? text.slice(0, maxLength) : null;
}

function cleanImportedText(value: unknown) {
  const text = readString(value);
  if (!text) return null;

  const cleaned = decodeHtml(text)
    .replace(/\\n/g, "\n")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|li|div|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned || null;
}

function readDelimitedAttributes(row: string[], headers: string[]) {
  const attributes: SalesCatalogItemAttribute[] = [];

  for (let index = 1; index <= 12; index++) {
    const nameIndex = findHeaderIndexExactFirst(headers, [
      `nome_do_atributo_${index}`,
      `attribute_${index}_name`,
      `attribute_name_${index}`,
      `atributo_${index}_nome`,
    ], []);
    const valuesIndex = findHeaderIndexExactFirst(headers, [
      `valor_es_do_atributo_${index}`,
      `valores_do_atributo_${index}`,
      `attribute_${index}_value_s`,
      `attribute_${index}_values`,
      `attribute_values_${index}`,
      `atributo_${index}_valores`,
    ], []);
    const defaultIndex = findHeaderIndexExactFirst(headers, [
      `valor_padrao_do_atributo_${index}`,
      `attribute_${index}_default`,
      `attribute_default_${index}`,
    ], []);
    const name = normalizeOptionalText(row[nameIndex], 80);
    const values = parseAttributeValues(row[valuesIndex] || row[defaultIndex]);

    if (!name || values.length === 0) continue;

    attributes.push({
      id: createAttributeId(name),
      name,
      values,
    });
  }

  return attributes;
}

function parseAttributeValues(value: unknown) {
  const text = cleanImportedText(value);
  if (!text) return [];

  return Array.from(new Set(text
    .split(/[|,]/g)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 30)));
}

function resolveDelimitedStockStatus(stockValue: unknown, backorderValue: unknown): SalesCatalogStockStatus {
  if (isTruthyLike(backorderValue)) return "on_backorder";
  if (isFalseLike(stockValue)) return "out_of_stock";
  return "in_stock";
}

function normalizeWeightGrams(value: unknown, header: string | undefined) {
  const number = readNumber(value);
  if (number === null) return null;

  return header?.includes("kg") || header === "peso"
    ? Math.round(number * 1000)
    : Math.round(number);
}

function isTruthyLike(value: unknown) {
  const text = normalizeHeader(readString(value) ?? "");
  return ["1", "true", "sim", "s", "yes", "y", "ativo", "active", "instock", "in_stock", "em_estoque"].includes(text);
}

function isFalseLike(value: unknown) {
  const text = normalizeHeader(readString(value) ?? "");
  return ["0", "false", "nao", "n", "no", "inativo", "inactive", "outofstock", "out_of_stock", "fora_de_estoque"].includes(text);
}

function isCategoryLine(line: string) {
  return line.length <= 80 && /[:：]$/.test(line) && !findPriceInText(line);
}

function cleanCategoryLine(line: string) {
  return line.replace(/[:：]+$/g, "").trim().slice(0, 80) || null;
}

function findPriceInText(text: string) {
  const match = text.match(/(?:R\$\s*)?\d[\d.,]*(?:[.,]\d{2})/);
  return match && typeof match.index === "number"
    ? { value: normalizeMoneyText(match[0]) ?? match[0].replace(/^R\$\s*/i, "").trim(), index: match.index }
    : null;
}

function flattenJsonLd(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  const record = readRecord(value);
  if (!record) return [];

  const graph = record["@graph"];
  return [record, ...(Array.isArray(graph) ? graph.flatMap(flattenJsonLd) : [])];
}

function extractGeminiText(value: unknown) {
  const candidates = readRecord(value)?.candidates;
  if (!Array.isArray(candidates)) return "";

  return candidates
    .flatMap((candidate) => {
      const parts = readRecord(readRecord(candidate)?.content)?.parts;
      return Array.isArray(parts) ? parts : [];
    })
    .map((part) => readRecord(part)?.text)
    .filter((text): text is string => typeof text === "string")
    .join("\n")
    .trim();
}

function readGeminiError(value: unknown) {
  const error = readRecord(readRecord(value)?.error);
  const message = error?.message;
  return typeof message === "string" ? message : null;
}

function parseJsonObject(value: unknown): JsonRecord | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonRecord;
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    return JSON.parse(value) as JsonRecord;
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]) as JsonRecord;
    } catch {
      return null;
    }
  }
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item))
    .map((item) => item.slice(0, 120));
}

function normalizeImportAssignmentScope(input: {
  assignedAgentIds?: string[] | null;
  assignedWhatsappInstanceIds?: string[] | null;
}): SalesCatalogImportAssignmentScope {
  return {
    assignedAgentIds: uniqueStrings((input.assignedAgentIds ?? []).map(normalizeUuid).filter((id): id is string => Boolean(id))),
    assignedWhatsappInstanceIds: uniqueStrings((input.assignedWhatsappInstanceIds ?? []).map(normalizeUuid).filter((id): id is string => Boolean(id))),
  };
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const parsed = Number(value.replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNumber(value: unknown) {
  const number = readNumber(value);
  if (number === null) return null;
  return Math.round(number);
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

function normalizeUuid(value: unknown) {
  const text = readString(value);
  if (!text) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function sanitizeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "imagem-importada.jpg";
}

function normalizeImportedImageContentType(value: string | null, imageUrl: string) {
  const contentType = value?.split(";")[0]?.trim().toLowerCase() ?? "";

  if (contentType === "image/jpg") return "image/jpeg";
  if (contentType === "image/jpeg" || contentType === "image/png" || contentType === "image/webp" || contentType === "image/gif" || contentType === "image/avif") {
    return contentType;
  }

  const extension = extensionFromImageUrl(imageUrl);
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "avif") return "image/avif";

  return null;
}

function extensionForImageContentType(contentType: string) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/avif") return "avif";
  return null;
}

function extensionFromImageUrl(value: string) {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]{2,5})$/i);
    const extension = match?.[1]?.toLowerCase();
    return extension && ["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(extension) ? extension : null;
  } catch {
    return null;
  }
}

function fileNameFromUrl(value: string) {
  try {
    const pathname = new URL(value).pathname;
    const fileName = decodeURIComponent(pathname.split("/").filter(Boolean).pop() ?? "");
    return fileName || null;
  } catch {
    return null;
  }
}

function ensureFileExtension(fileName: string, extension: string) {
  if (/\.(?:avif|gif|jpe?g|png|webp)$/i.test(fileName)) return fileName;
  return `${fileName.replace(/\.+$/g, "")}.${extension}`;
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function preview(value: string | null | undefined, length: number) {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  return text.length > length ? `${text.slice(0, Math.max(0, length - 3))}...` : text;
}

function createImportTitle(kind: SalesCatalogImportSourceKind) {
  const label = kind === "site"
    ? "site"
    : kind === "csv" || kind === "excel"
      ? "planilha"
      : kind === "pdf"
        ? "PDF"
        : kind === "image"
          ? "imagem"
          : "texto";

  return `Importacao por IA - ${label}`;
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const result = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item);
    const current = result.get(key) ?? [];
    current.push(item);
    result.set(key, current);
  }

  return result;
}
