import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
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

export type SalesCatalogImportSourceKind = "text" | "csv" | "excel" | "site" | "pdf" | "image" | "mixed";
export type SalesCatalogImportTargetMode = "connectyhub_checkout" | "external_site" | "review";
export type SalesCatalogImportDestination = "connectyhub_checkout" | "external_site" | "manual_handoff";
export type SalesCatalogImportJobStatus = "uploaded" | "extracting" | "review_required" | "ready_to_publish" | "publishing" | "published" | "failed";
export type SalesCatalogImportItemStatus = "draft" | "ready" | "published" | "discarded" | "error";

type JsonRecord = Record<string, unknown>;

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
  targetMode: SalesCatalogImportTargetMode;
  defaultSalesDestination: SalesCatalogImportDestination;
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
};

export type SalesCatalogImportFileInput = {
  fileName: string;
  contentType: string;
  size: number;
  base64: string;
  text?: string | null;
};

const maxImportTextChars = 60000;
const maxPageChars = 45000;
const maxDraftItems = 120;
const maxGeminiOutputTokens = 7000;

export const salesCatalogImportProcessRequestedEventName = "connectyhub/sales-catalog.import.process_requested";

export async function createSalesCatalogImportJob(input: {
  client: SupabaseClient;
  companyId: string;
  userId: string;
  sourceKind: SalesCatalogImportSourceKind;
  targetMode: SalesCatalogImportTargetMode;
  defaultSalesDestination: SalesCatalogImportDestination;
  text?: string | null;
  sourceUrl?: string | null;
  files?: SalesCatalogImportFileInput[] | null;
  title?: string | null;
}) {
  const now = new Date().toISOString();
  const sourceKind = normalizeSourceKind(input.sourceKind);
  const targetMode = normalizeTargetMode(input.targetMode);
  const defaultSalesDestination = normalizeSalesDestination(input.defaultSalesDestination, targetMode);
  const title = normalizeOptionalText(input.title, 140) ?? createImportTitle(sourceKind);
  const sourceUrl = normalizeOptionalText(input.sourceUrl, 1000);
  const sourceText = normalizeOptionalText(input.text, maxImportTextChars) ?? "";
  const files = input.files ?? [];

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

  await input.client.from("sales_catalog_import_events").insert({
    import_job_id: job.id,
    organization_id: input.companyId,
    level: "info",
    event_type: "sales_catalog_import.created",
    title: "Importacao enfileirada",
    summary: sourceUrl ? `Fonte: ${sourceUrl}` : "Fonte enviada pelo usuario.",
    payload: { sourceKind, targetMode, defaultSalesDestination, files: files.length },
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
  targetMode: SalesCatalogImportTargetMode;
  defaultSalesDestination: SalesCatalogImportDestination;
  text?: string | null;
  sourceUrl?: string | null;
  files?: SalesCatalogImportFileInput[] | null;
  title?: string | null;
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
  let manualItems = 0;
  let errors = 0;

  for (const item of candidates) {
    try {
      if (item.salesDestination === "external_site") {
        await publishImportItemAsTrackedLink({
          client: input.client,
          companyId: input.companyId,
          userId: input.userId,
          jobId: input.jobId,
          item,
        });
        linkButtons += 1;
      } else {
        await publishImportItemAsCatalogItem({
          client: input.client,
          companyId: input.companyId,
          userId: input.userId,
          jobId: input.jobId,
          item,
          manualHandoff: item.salesDestination === "manual_handoff",
        });
        if (item.salesDestination === "manual_handoff") {
          manualItems += 1;
        } else {
          catalogItems += 1;
        }
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
        published_manual_items: manualItems,
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
    summary: `${catalogItems} produto(s), ${linkButtons} botao(oes) externo(s), ${manualItems} item(ns) para humano.`,
    payload: { catalogItems, linkButtons, manualItems, errors },
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

    const itemPayload = extraction.drafts.slice(0, maxDraftItems).map((draft) => ({
      import_job_id: input.job.id,
      organization_id: input.companyId,
      status: draft.warnings.length > 0 ? "draft" : "ready",
      sales_destination: draft.salesDestination,
      title: draft.title,
      description: draft.description,
      category: draft.category,
      price: draft.price,
      currency: draft.currency,
      product_url: draft.productUrl,
      image_url: draft.imageUrl,
      attributes: serializeItemAttributes(draft.attributes),
      skus: serializeSalesCatalogSkus(draft.skus),
      inventory: serializeProductInventory(draft.inventory),
      shipping: serializeProductShipping(draft.shipping),
      fulfillment: serializeProductFulfillment(draft.fulfillment),
      offer: serializeProductOffer(draft.offer),
      confidence: draft.confidence,
      warnings: draft.warnings,
      source_evidence: draft.sourceEvidence,
      metadata: {
        created_from: "sales_catalog_ai_import",
        import_version: 1,
      },
    }));

    const { error: itemError } = await input.client
      .from("sales_catalog_import_items")
      .insert(itemPayload);

    if (itemError) {
      await markImportFailed(input.client, input.job.id, input.companyId, itemError.message);
      return;
    }

    const warningCount = extraction.drafts.reduce((total, draft) => total + draft.warnings.length, 0);
    const readyCount = extraction.drafts.filter((draft) => draft.warnings.length === 0).length;
    const reviewRequired = warningCount > 0;
    const status: SalesCatalogImportJobStatus = reviewRequired ? "review_required" : "ready_to_publish";

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
          ai_used: extraction.aiUsed,
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
        ai_used: extraction.aiUsed,
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

  if (!sourceText.trim() && !input.sourceUrl && files.length === 0) {
    return {
      drafts: [] as SalesCatalogImportDraft[],
      sourceText: "",
      summary: "Nenhuma fonte textual foi enviada.",
      warnings: ["Envie texto, CSV ou URL para importar."],
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
    sourceText,
    sourceUrl: input.sourceUrl,
    sourceKind: input.job.source_kind,
    targetMode: input.job.target_mode,
    defaultSalesDestination: input.job.default_sales_destination,
  });

  return {
    drafts: fallbackDrafts,
    sourceText,
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
    "Use salesDestination conforme o objetivo do usuario: connectyhub_checkout, external_site ou manual_handoff.",
  ].join("\n");
  const prompt = [
    `Fonte: ${input.sourceKind}`,
    input.sourceUrl ? `URL analisada: ${input.sourceUrl}` : "",
    `Modo escolhido: ${input.targetMode}`,
    `Destino padrao: ${input.defaultSalesDestination}`,
    "",
    "Retorne neste formato:",
    '{"items":[{"title":"string","description":"string|null","category":"string|null","price":"string|null","currency":"BRL","productUrl":"string|null","imageUrl":"string|null","salesDestination":"connectyhub_checkout|external_site|manual_handoff","attributes":[{"name":"Tamanho","values":["P","M"]}],"skus":[{"skuCode":"PIZZA-G","title":"Grande","price":"45,00","salePrice":null,"attributes":[{"name":"Tamanho","values":["Grande"]}],"stockStatus":"in_stock","stockQuantity":null,"weightGrams":null}],"inventory":{"status":"in_stock","quantity":null,"allowBackorder":false,"notes":null},"shipping":{"profile":"default","notes":null},"fulfillment":{"mode":"physical","schedulingRequired":false,"serviceDuration":null,"deliveryInstructions":null,"accessInstructions":null},"offer":{"salePrice":null,"couponCode":null,"notes":null},"confidence":0.86,"warnings":["string"],"sourceEvidence":{"line":"trecho que justifica"}}]}',
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
      targetMode: input.targetMode,
      defaultSalesDestination: input.defaultSalesDestination,
      fileCount: files.length,
      fileTypes: files.map((file) => file.contentType),
      extractedItems: drafts.length,
    },
  }).catch(() => null);

  return { drafts };
}

function parseFallbackDrafts(input: {
  sourceText: string;
  sourceUrl?: string | null;
  sourceKind: SalesCatalogImportSourceKind;
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
  targetMode: SalesCatalogImportTargetMode;
  defaultSalesDestination: SalesCatalogImportDestination;
}) {
  const delimiter = guessDelimiter(input.sourceText);
  if (!delimiter) return [];

  const rows = parseDelimitedRows(input.sourceText, delimiter);
  if (rows.length < 2) return [];

  const headers = rows[0].map((value) => normalizeHeader(value));
  const dataRows = rows.slice(1).filter((row) => row.some((value) => value.trim()));
  const titleIndex = findHeaderIndex(headers, ["produto", "nome", "name", "title", "item", "servico", "servico_servico"]);
  const priceIndex = findHeaderIndex(headers, ["preco", "price", "valor", "amount"]);

  if (titleIndex < 0) return [];

  const descriptionIndex = findHeaderIndex(headers, ["descricao", "description", "detalhes", "observacoes"]);
  const categoryIndex = findHeaderIndex(headers, ["categoria", "category", "grupo", "secao"]);
  const urlIndex = findHeaderIndex(headers, ["url", "link", "product_url", "site"]);
  const imageIndex = findHeaderIndex(headers, ["imagem", "image", "foto", "photo"]);
  const skuIndex = findHeaderIndex(headers, ["sku", "codigo", "code"]);
  const stockIndex = findHeaderIndex(headers, ["estoque", "stock", "quantidade"]);

  return dataRows
    .map((row, index) => {
      const title = normalizeTitle(row[titleIndex]);
      if (!title) return null;

      const productUrl = normalizeDraftUrl(row[urlIndex]) ?? (input.targetMode === "external_site" ? input.sourceUrl ?? null : null);
      const price = normalizePrice(row[priceIndex]);
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
      const stockQuantity = normalizeNumber(row[stockIndex]);
      const skuCode = normalizeSkuCode(row[skuIndex]) ?? createSkuCode(title, String(index + 1));

      return buildDraft({
        title,
        description: normalizeOptionalText(row[descriptionIndex], 1200),
        category: normalizeOptionalText(row[categoryIndex], 80),
        price,
        productUrl,
        imageUrl: normalizeDraftUrl(row[imageIndex]),
        salesDestination: destination,
        confidence: warnings.length ? 0.68 : 0.84,
        warnings,
        sourceEvidence: { row: index + 2 },
        skus: [{
          ...createDraftSku({ title, skuCode, price, stockQuantity }),
        }],
        inventory: {
          ...emptySalesCatalogProductInventory(),
          quantity: stockQuantity,
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
    const maybeUrl = findUrlInText(line) ?? (input.targetMode === "external_site" ? input.sourceUrl ?? null : null);
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
      imageUrl: null,
      salesDestination: destination,
      confidence: price ? 0.7 : 0.55,
      warnings: price ? warnings : Array.from(new Set([...warnings, "Preco nao identificado na linha."])),
      sourceEvidence: { line },
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
  manualHandoff: boolean;
}) {
  const itemId = randomUUID();
  const now = new Date().toISOString();
  const tag = createSalesCatalogTag(input.item.title, itemId);
  const media = buildImportedMedia(input.item);
  const inventory = input.item.inventory;
  const offer = input.item.offer;
  const itemFulfillment = input.item.fulfillment;
  const fulfillment = {
    ...itemFulfillment,
    mode: input.item.salesDestination === "manual_handoff" ? "service" as SalesCatalogFulfillmentMode : itemFulfillment.mode,
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
  });
  const metadata = {
    title: input.item.title,
    description: input.item.description ?? buildFallbackDescription(input.item),
    category: input.item.category,
    price: input.item.price,
    currency: input.item.currency,
    status: input.manualHandoff ? "draft" : "active",
    tag,
    highlight_label: input.manualHandoff ? "Atendimento humano" : "Importado por IA",
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
    import_job_id: input.jobId,
    import_item_id: input.item.id,
    readiness: getSalesCatalogReadiness({
      description: input.item.description ?? buildFallbackDescription(input.item),
      media,
    }),
    created_by: input.userId,
    updated_by: input.userId,
    updated_from: "sales_catalog_ai_import",
  };

  const { data, error } = await input.client
    .from("intelligence_memory")
    .insert({
      id: itemId,
      scope: "organization",
      organization_id: input.companyId,
      memory_type: "sales_catalog_item",
      title: input.item.title,
      content,
      importance: input.manualHandoff ? 0.72 : 0.82,
      tags: [
        "sales_catalog_item",
        "sales_catalog",
        "ai_import",
        "whatsapp_agent",
        "lead_tracking",
        ...(input.manualHandoff ? ["manual_handoff"] : []),
      ],
      metadata,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel publicar produto no catalogo.");
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
    summary: input.manualHandoff ? "Publicado como item de atendimento humano." : "Publicado no catalogo ConnectyHub.",
    confidence: input.item.confidence,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_item", "ai_import", "whatsapp_agent", "lead_tracking"],
    payload: {
      import_job_id: input.jobId,
      import_item_id: input.item.id,
      catalog_item_id: data.id,
      sales_destination: input.item.salesDestination,
    },
  });
}

async function publishImportItemAsTrackedLink(input: {
  client: SupabaseClient;
  companyId: string;
  userId: string;
  jobId: string;
  item: ClientSalesCatalogImportItem;
}) {
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

  const productUrl = normalizeDraftUrl(readString(record.productUrl) ?? readString(record.product_url)) ?? (input.targetMode === "external_site" ? input.sourceUrl ?? null : null);
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
    imageUrl: normalizeDraftUrl(readString(record.imageUrl) ?? readString(record.image_url)),
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

function buildImportedMedia(item: ClientSalesCatalogImportItem): SalesCatalogMedia[] {
  if (!item.imageUrl) return [];

  let fileName = "imagem-importada";
  try {
    const url = new URL(item.imageUrl);
    fileName = url.pathname.split("/").filter(Boolean).pop() ?? fileName;
  } catch {
    fileName = "imagem-importada";
  }

  const contentType = /\.(png)$/i.test(fileName)
    ? "image/png"
    : /\.(webp)$/i.test(fileName)
      ? "image/webp"
      : "image/jpeg";

  return [{
    id: randomUUID(),
    fileName: sanitizeFileName(fileName),
    contentType,
    size: 0,
    storageUrl: item.imageUrl,
    kind: resolveSalesCatalogMediaKind(contentType, fileName),
    createdAt: new Date().toISOString(),
  }];
}

function buildFallbackDescription(item: ClientSalesCatalogImportItem) {
  const parts = [
    item.description,
    item.productUrl ? `Produto importado do site: ${item.productUrl}` : "",
    item.salesDestination === "manual_handoff" ? "Fechamento precisa de atendimento humano." : "",
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
  return {
    id: job.id,
    companyId: job.organization_id,
    createdBy: job.created_by,
    sourceKind: job.source_kind,
    targetMode: job.target_mode,
    defaultSalesDestination: job.default_sales_destination,
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

function normalizeTargetMode(value: unknown): SalesCatalogImportTargetMode {
  if (value === "connectyhub_checkout" || value === "external_site") return value;
  return "review";
}

function normalizeSalesDestination(value: unknown, targetMode: SalesCatalogImportTargetMode): SalesCatalogImportDestination {
  if (value === "external_site" || value === "manual_handoff" || value === "connectyhub_checkout") return value;
  if (targetMode === "external_site") return "external_site";
  return "connectyhub_checkout";
}

function readOptionalSalesDestination(value: unknown): SalesCatalogImportDestination | null {
  if (value === "external_site" || value === "manual_handoff" || value === "connectyhub_checkout") return value;
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

  const match = text.match(/(?:R\$\s*)?\d{1,6}(?:[.,]\d{2})?/);
  return match ? match[0].replace(/^R\$\s*/i, "").trim() : null;
}

function normalizeDraftUrl(value: unknown) {
  const text = readString(value);
  if (!text) return null;

  try {
    return normalizeHttpUrl(text);
  } catch {
    return null;
  }
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
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => parseDelimitedLine(line, delimiter));
}

function parseDelimitedLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const next = line[index + 1];

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
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function findHeaderIndex(headers: string[], candidates: string[]) {
  return headers.findIndex((header) => candidates.includes(header) || candidates.some((candidate) => header.includes(candidate)));
}

function isCategoryLine(line: string) {
  return line.length <= 80 && /[:：]$/.test(line) && !findPriceInText(line);
}

function cleanCategoryLine(line: string) {
  return line.replace(/[:：]+$/g, "").trim().slice(0, 80) || null;
}

function findPriceInText(text: string) {
  const match = text.match(/(?:R\$\s*)?\d{1,5}(?:[.,]\d{2})/);
  return match && typeof match.index === "number"
    ? { value: match[0].replace(/^R\$\s*/i, "").trim(), index: match.index }
    : null;
}

function findUrlInText(text: string) {
  return normalizeDraftUrl(text.match(/https?:\/\/\S+/i)?.[0]);
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
