import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { loadUazapiCredentials, type UazapiCredentials } from "@/lib/whatsapp/uazapi-credentials";
import {
  createSalesCatalogImportReviewJob,
  type ClientSalesCatalogImportJob,
  type SalesCatalogImportDraft,
} from "./importer";
import {
  createDefaultSalesCatalogSku,
  createSalesCatalogSlug,
  emptySalesCatalogProductFulfillment,
  emptySalesCatalogProductInventory,
  emptySalesCatalogProductOffer,
  emptySalesCatalogProductShipping,
  type ClientSalesCatalogItem,
  type SalesCatalogMedia,
} from "./shared";

type JsonRecord = Record<string, unknown>;

const uazapiRequestTimeoutMs = 18_000;
const whatsappCatalogListPageTimeoutMs = 18_000;

type SalesCatalogMemoryRow = {
  id: string;
  organization_id: string | null;
  title: string;
  content: string;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

type WhatsappInstanceRow = {
  id: string;
  organization_id: string | null;
  provider_instance_id: string | null;
  phone_number: string | null;
  display_name: string | null;
  status: string | null;
  instance_token_encrypted: string | null;
  metadata: JsonRecord | null;
  updated_at: string | null;
};

type NormalizedWhatsappProduct = {
  productId: string;
  title: string;
  description: string;
  price: string | null;
  currency: string;
  media: SalesCatalogMedia[];
  catalogJid: string;
  url: string | null;
  hidden: boolean;
  catalogStatus: string | null;
  availability: string | null;
  retailerId: string | null;
  importedPayload: JsonRecord;
};

export type WhatsappCatalogImportReviewResult = {
  importJob: ClientSalesCatalogImportJob;
  imported: number;
  skipped: number;
  pages: number;
  hasMore: boolean;
  catalogJid: string;
  whatsappInstanceId: string;
  agentId: string | null;
};

export type WhatsappCatalogExportResult = {
  items: ClientSalesCatalogItem[];
  exported: number;
  skipped: number;
  providerSupported: boolean;
  whatsappInstanceId: string;
  agentId: string | null;
};

export async function createWhatsappCatalogImportReview(input: {
  userId: string;
  companyId: string;
  whatsappInstanceId?: string | null;
  client?: SupabaseClient;
}): Promise<WhatsappCatalogImportReviewResult> {
  const client = input.client ?? createServiceClient();
  const company = await requireClientCompanyAccess({ userId: input.userId, companyId: input.companyId, client });
  const instance = await requireCatalogWhatsappInstance(client, company.id, input.whatsappInstanceId);
  const token = decryptInstanceToken(instance);
  const agentId = resolveInstanceAgentId(instance);

  if (!token) {
    throw new Error("Conecte o WhatsApp antes de importar o catalogo.");
  }

  const catalogJid = resolveInstanceCatalogJid(instance);

  if (!catalogJid) {
    throw new Error("Nao foi possivel identificar o catalogo WhatsApp da instancia conectada.");
  }

  const credentials = await loadUazapiCredentials(client);
  const fetched = await fetchWhatsappCatalogPages(credentials, token, catalogJid);
  const now = new Date().toISOString();
  const drafts: SalesCatalogImportDraft[] = [];
  let skipped = 0;

  for (const product of fetched.products) {
    const normalized = normalizeWhatsappProduct(product, catalogJid, now);

    if (!normalized) {
      skipped += 1;
      continue;
    }

    drafts.push(mapWhatsappProductToImportDraft(normalized, {
      whatsappInstanceId: instance.id,
      agentId,
      now,
    }));
  }

  if (drafts.length === 0) {
    throw new Error("Nenhum produto valido foi encontrado no catalogo WhatsApp.");
  }

  const titleParts = [
    "Catalogo WhatsApp",
    instance.display_name ?? instance.phone_number ?? company.name,
  ].filter(Boolean);
  const importJob = await createSalesCatalogImportReviewJob({
    client,
    companyId: company.id,
    userId: input.userId,
    sourceKind: "mixed",
    sourcePlatform: "whatsapp_catalog",
    targetMode: "connectyhub_checkout",
    defaultSalesDestination: "connectyhub_checkout",
    drafts,
    title: titleParts.join(" - "),
    sourceSummary: `${drafts.length} produto(s) encontrados no catalogo WhatsApp. Escolha a categoria de cada produto antes de publicar.`,
    settings: {
      whatsapp_catalog_jid: catalogJid,
      whatsapp_instance_id: instance.id,
      agent_id: agentId,
      provider: "uazapi",
      pages: fetched.pages,
      has_more: fetched.hasMore,
      provider_product_count: fetched.products.length,
      skipped_count: skipped,
    },
    assignedAgentIds: agentId ? [agentId] : [],
    assignedWhatsappInstanceIds: [instance.id],
  });

  await client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: company.id,
    source_type: "sales_catalog_import",
    source_id: importJob.id,
    event_type: "sales_catalog.whatsapp_import_review_created",
    title: "Catalogo WhatsApp pronto para revisao",
    summary: `${drafts.length} produto(s) aguardando categoria e publicacao.`,
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "whatsapp_catalog", "whatsapp_agent", "lead_tracking"],
    payload: {
      import_job_id: importJob.id,
      catalog_jid: catalogJid,
      whatsapp_instance_id: instance.id,
      agent_id: agentId,
      imported: drafts.length,
      skipped,
      pages: fetched.pages,
      has_more: fetched.hasMore,
      synced_by: input.userId,
    },
  });

  return {
    importJob,
    imported: drafts.length,
    skipped,
    pages: fetched.pages,
    hasMore: fetched.hasMore,
    catalogJid,
    whatsappInstanceId: instance.id,
    agentId,
  };
}

export async function exportWhatsappCatalogProducts(input: {
  userId: string;
  companyId: string;
  whatsappInstanceId: string | null;
  itemIds: string[];
  client?: SupabaseClient;
}): Promise<WhatsappCatalogExportResult> {
  const client = input.client ?? createServiceClient();
  const company = await requireClientCompanyAccess({ userId: input.userId, companyId: input.companyId, client });
  const itemIds = uniqueStrings(input.itemIds).slice(0, 80);

  if (!input.whatsappInstanceId) {
    throw new Error("Escolha a instancia WhatsApp que recebera os produtos.");
  }

  if (itemIds.length === 0) {
    throw new Error("Escolha ao menos um produto para exportar.");
  }

  const instance = await requireCatalogWhatsappInstance(client, company.id, input.whatsappInstanceId);
  const agentId = resolveInstanceAgentId(instance);
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("organization_id", company.id)
    .eq("memory_type", "sales_catalog_item")
    .in("id", itemIds)
    .neq("metadata->>status", "archived")
    .returns<SalesCatalogMemoryRow[]>();

  if (error) {
    throw new Error(`Nao foi possivel carregar os produtos para exportacao: ${error.message}`);
  }

  const rows = data ?? [];
  const items: ClientSalesCatalogItem[] = [];

  for (const row of rows) {
    const metadata = readRecord(row.metadata) ?? {};
    const exportTargets = upsertWhatsappExportTarget(metadata.whatsapp_export_targets, {
      whatsappInstanceId: instance.id,
      agentId,
      now,
    });
    const updatedMetadata = {
      ...metadata,
      assigned_agent_ids: mergeStringLists(metadata.assigned_agent_ids ?? metadata.agent_ids, agentId),
      assigned_whatsapp_instance_ids: mergeStringLists(metadata.assigned_whatsapp_instance_ids ?? metadata.whatsapp_instance_ids, instance.id),
      whatsapp_export_targets: exportTargets,
      whatsapp_catalog_export_requested_at: now,
      whatsapp_catalog_export_requested_by: input.userId,
      whatsapp_catalog_export_provider_supported: false,
      updated_by: input.userId,
    };

    const { data: updated, error: updateError } = await client
      .from("intelligence_memory")
      .update({
        metadata: updatedMetadata,
        updated_at: now,
      })
      .eq("id", row.id)
      .eq("scope", "organization")
      .eq("organization_id", company.id)
      .eq("memory_type", "sales_catalog_item")
      .select("id, organization_id, title, content, metadata, created_at, updated_at")
      .single<SalesCatalogMemoryRow>();

    if (updateError || !updated) {
      throw new Error(updateError?.message ?? "Nao foi possivel vincular o produto ao agente WhatsApp.");
    }

    items.push(mapSalesCatalogItem(updated));
  }

  const skipped = Math.max(0, itemIds.length - items.length);

  await client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: company.id,
    source_type: "sales_catalog",
    source_id: company.id,
    event_type: "sales_catalog.whatsapp_export_prepared",
    title: "Catalogo preparado para WhatsApp",
    summary: `${items.length} produto(s) vinculados a instancia WhatsApp.`,
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "whatsapp_catalog", "whatsapp_agent", "lead_tracking"],
    payload: {
      whatsapp_instance_id: instance.id,
      agent_id: agentId,
      item_ids: items.map((item) => item.id),
      skipped,
      exported_by: input.userId,
      provider_supported: false,
      provider_note: "Uazapi operations registered in this codebase do not expose product create/update for native WhatsApp catalog yet.",
    },
  });

  return {
    items,
    exported: items.length,
    skipped,
    providerSupported: false,
    whatsappInstanceId: instance.id,
    agentId,
  };
}

export async function setWhatsappCatalogVisibility(input: {
  userId: string;
  companyId: string;
  itemId: string;
  visible: boolean;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const company = await requireClientCompanyAccess({ userId: input.userId, companyId: input.companyId, client });
  const row = await requireSalesCatalogMemoryRow(client, company.id, input.itemId);
  const metadata = readRecord(row.metadata) ?? {};
  const whatsappCatalogId = readString(metadata.whatsapp_catalog_id);

  if (!whatsappCatalogId) {
    throw new Error("Este item ainda nao esta vinculado a um produto nativo do WhatsApp.");
  }

  const instance = await requireCatalogWhatsappInstance(
    client,
    company.id,
    readString(metadata.source_whatsapp_instance_id) ?? firstString(metadata.assigned_whatsapp_instance_ids),
  );
  const token = decryptInstanceToken(instance);

  if (!token) {
    throw new Error("Conecte o WhatsApp antes de sincronizar o catalogo nativo.");
  }

  const credentials = await loadUazapiCredentials(client);
  const path = input.visible ? "/business/catalog/show" : "/business/catalog/hide";
  const provider = await callUazapi(credentials, path, {
    method: "POST",
    token,
    body: { id: whatsappCatalogId },
  });
  const now = new Date().toISOString();
  const updatedMetadata = {
    ...metadata,
    status: input.visible ? "active" : "draft",
    whatsapp_catalog_hidden: !input.visible,
    whatsapp_catalog_synced_at: now,
    whatsapp_catalog_last_action: input.visible ? "show" : "hide",
    whatsapp_catalog_last_provider_status: provider.status,
  };

  const { data, error } = await client
    .from("intelligence_memory")
    .update({
      metadata: updatedMetadata,
      updated_at: now,
    })
    .eq("id", row.id)
    .eq("organization_id", company.id)
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .single<SalesCatalogMemoryRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel atualizar o item sincronizado.");
  }

  await client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: company.id,
    source_type: "sales_catalog",
    source_id: row.id,
    event_type: input.visible ? "sales_catalog.whatsapp_shown" : "sales_catalog.whatsapp_hidden",
    title: input.visible ? `Produto exibido no WhatsApp: ${row.title}` : `Produto ocultado no WhatsApp: ${row.title}`,
    summary: `Produto nativo ${whatsappCatalogId} sincronizado com o catalogo de vendas.`,
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "whatsapp_catalog", "whatsapp_agent", "lead_tracking"],
    payload: {
      product_id: row.id,
      whatsapp_catalog_id: whatsappCatalogId,
      visible: input.visible,
      provider_status: provider.status,
      synced_by: input.userId,
    },
  });

  return {
    item: mapSalesCatalogItem(data),
    providerStatus: provider.status,
  };
}

async function fetchWhatsappCatalogPages(credentials: UazapiCredentials, token: string, catalogJid: string) {
  const productsById = new Map<string, JsonRecord>();
  let after: string | null = null;
  let pages = 0;
  let hasMore = false;

  for (let page = 0; page < 6; page += 1) {
    const response = await callUazapi(credentials, "/business/catalog/list", {
      method: "POST",
      token,
      body: after ? { jid: catalogJid, after } : { jid: catalogJid },
      timeoutMs: whatsappCatalogListPageTimeoutMs,
    });
    const parsed = readCatalogPage(response.data);

    pages += 1;

    for (const product of parsed.products) {
      const productId = readString(product.ID) ?? readString(product.id) ?? readString(product.Id);
      if (productId) {
        productsById.set(productId, product);
      }
    }

    after = parsed.after;
    hasMore = Boolean(after);

    if (!after) {
      break;
    }
  }

  return {
    products: Array.from(productsById.values()),
    pages,
    hasMore,
  };
}

async function requireSalesCatalogMemoryRow(client: SupabaseClient, companyId: string, itemId: string) {
  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("id", itemId)
    .eq("scope", "organization")
    .eq("organization_id", companyId)
    .eq("memory_type", "sales_catalog_item")
    .maybeSingle<SalesCatalogMemoryRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar o produto: ${error.message}`);
  }

  if (!data) {
    throw new Error("Produto nao encontrado para esta empresa.");
  }

  return data;
}

async function requireCatalogWhatsappInstance(client: SupabaseClient, companyId: string, whatsappInstanceId?: string | null) {
  if (whatsappInstanceId) {
    const { data, error } = await client
      .from("whatsapp_instances")
      .select("id, organization_id, provider_instance_id, phone_number, display_name, status, instance_token_encrypted, metadata, updated_at")
      .eq("id", whatsappInstanceId)
      .eq("organization_id", companyId)
      .eq("provider", "uazapi")
      .neq("status", "archived")
      .maybeSingle<WhatsappInstanceRow>();

    if (error) {
      throw new Error(`Nao foi possivel carregar a instancia WhatsApp: ${error.message}`);
    }

    if (!data) {
      throw new Error("Instancia WhatsApp nao encontrada para esta empresa.");
    }

    if (data.status !== "connected" || !data.instance_token_encrypted) {
      throw new Error("Escolha uma instancia WhatsApp conectada antes de sincronizar o catalogo.");
    }

    return data;
  }

  const { data, error } = await client
    .from("whatsapp_instances")
    .select("id, organization_id, provider_instance_id, phone_number, display_name, status, instance_token_encrypted, metadata, updated_at")
    .eq("organization_id", companyId)
    .eq("provider", "uazapi")
    .neq("status", "archived")
    .order("status", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(12)
    .returns<WhatsappInstanceRow[]>();

  if (error) {
    throw new Error(`Nao foi possivel carregar a conexao WhatsApp: ${error.message}`);
  }

  const instances = data ?? [];
  const connected = instances.find((instance) => instance.status === "connected" && instance.instance_token_encrypted);

  if (!connected) {
    throw new Error("Conecte o WhatsApp desta empresa antes de sincronizar o catalogo.");
  }

  return connected;
}

function normalizeWhatsappProduct(product: JsonRecord, catalogJid: string, now: string): NormalizedWhatsappProduct | null {
  const productId = readString(product.ID) ?? readString(product.id) ?? readString(product.Id);
  const title = normalizeText(readString(product.Name) ?? readString(product.name) ?? readString(product.Title), 120);

  if (!productId || !title) {
    return null;
  }

  const description = normalizeText(readString(product.Description) ?? readString(product.description), 1800) ?? "";
  const price = readCatalogPrice(product);
  const currency = readCatalogCurrency(product) ?? "BRL";
  const hidden = readBoolean(product.IsHidden) ?? readBoolean(product.isHidden) ?? false;
  const statusInfo = readRecord(product.StatusInfo) ?? readRecord(product.statusInfo);
  const catalogStatus = readString(statusInfo?.Status) ?? readString(statusInfo?.status);
  const availability = readString(product.Availability) ?? readString(product.availability);
  const retailerId = readString(product.RetailerID) ?? readString(product.retailerId) ?? readString(product.SKU);
  const url = readString(product.Url) ?? readString(product.URL) ?? readString(product.url);
  const media = readProductImages(product, title, now);

  return {
    productId,
    title,
    description,
    price,
    currency,
    media,
    catalogJid,
    url,
    hidden,
    catalogStatus,
    availability,
    retailerId,
    importedPayload: compactRecord({
      image_fetch_status: readString(product.ImageFetchStatus) ?? readString(product.imageFetchStatus),
      max_available: readNumber(product.MaxAvailable) ?? readNumber(product.maxAvailable),
      sale_price: readString(product.SalePrice) ?? readString(product.salePrice),
      source: readString(product.Source) ?? readString(product.source),
    }),
  };
}

function mapWhatsappProductToImportDraft(
  product: NormalizedWhatsappProduct,
  input: {
    whatsappInstanceId: string;
    agentId: string | null;
    now: string;
  },
): SalesCatalogImportDraft {
  const imageUrl = product.media.find((media) => media.kind === "image")?.storageUrl ?? null;
  const warnings = product.price
    ? []
    : ["Preco nao encontrado no catalogo WhatsApp. Informe o preco antes de publicar."];

  if (product.hidden) {
    warnings.push("Produto esta oculto no catalogo WhatsApp. Revise antes de publicar na loja.");
  }

  return {
    title: product.title,
    description: product.description || null,
    category: null,
    price: product.price,
    currency: product.currency,
    productUrl: product.url,
    imageUrl,
    importExternalImage: Boolean(imageUrl),
    attributes: [],
    skus: [
      createDefaultSalesCatalogSku({
        skuCode: product.retailerId ?? product.productId,
        title: product.title,
        price: product.price,
        currency: product.currency,
        stockStatus: product.hidden ? "out_of_stock" : "in_stock",
      }),
    ],
    inventory: {
      ...emptySalesCatalogProductInventory(),
      status: product.hidden ? "out_of_stock" : "in_stock",
    },
    shipping: emptySalesCatalogProductShipping(),
    fulfillment: emptySalesCatalogProductFulfillment(),
    offer: emptySalesCatalogProductOffer(),
    salesDestination: "connectyhub_checkout",
    confidence: product.price ? 0.9 : 0.72,
    warnings,
    sourceEvidence: compactRecord({
      source_platform: "whatsapp_catalog",
      whatsapp_catalog_id: product.productId,
      whatsapp_catalog_jid: product.catalogJid,
      whatsapp_catalog_url: product.url,
      whatsapp_catalog_hidden: product.hidden,
      whatsapp_catalog_status: product.catalogStatus,
      whatsapp_catalog_availability: product.availability,
      whatsapp_catalog_retailer_id: product.retailerId,
      source_whatsapp_instance_id: input.whatsappInstanceId,
      source_agent_id: input.agentId,
      whatsapp_catalog_payload: product.importedPayload,
      whatsapp_catalog_synced_at: input.now,
    }),
  };
}

function readProductImages(product: JsonRecord, title: string, now: string): SalesCatalogMedia[] {
  const images = readArray(product.Images) ?? readArray(product.images) ?? [];

  return images
    .map((value, index): SalesCatalogMedia | null => {
      const image = readRecord(value);
      if (!image) return null;

      const storageUrl =
        readString(image.OriginalImageUrl) ??
        readString(image.originalImageUrl) ??
        readString(image.RequestImageUrl) ??
        readString(image.requestImageUrl);

      if (!storageUrl) return null;

      return {
        id: readString(image.ID) ?? readString(image.id) ?? `${createSalesCatalogSlug(title)}-${index + 1}`,
        fileName: `${createSalesCatalogSlug(title)}-${index + 1}.jpg`,
        contentType: "image/jpeg",
        size: 0,
        storageUrl,
        kind: "image",
        createdAt: now,
      };
    })
    .filter((item): item is SalesCatalogMedia => Boolean(item));
}

function readCatalogPage(value: unknown) {
  const root = readRecord(value) ?? {};
  const response = readRecord(root.response) ?? root;
  const products = readArray(response.Products) ?? readArray(response.products) ?? [];
  const paging = readRecord(response.Paging) ?? readRecord(response.paging) ?? {};

  return {
    products: products.map(readRecord).filter((item): item is JsonRecord => Boolean(item)),
    after: readString(paging.After) ?? readString(paging.after),
  };
}

function readCatalogPrice(product: JsonRecord) {
  const price = readRecord(product.Price) ?? readRecord(product.price);
  const amount = readString(price?.Amount) ?? readString(price?.amount) ?? readString(product.Price) ?? readString(product.price);

  if (!amount) return null;

  const normalized = amount.trim();

  if (/^\d+$/.test(normalized)) {
    const value = Number(normalized) / 100;
    return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return normalized.slice(0, 60);
}

function readCatalogCurrency(product: JsonRecord) {
  const price = readRecord(product.Price) ?? readRecord(product.price);
  return normalizeText(readString(price?.Currency) ?? readString(price?.currency) ?? readString(product.Currency), 12);
}

function resolveInstanceCatalogJid(instance: WhatsappInstanceRow) {
  const metadata = readRecord(instance.metadata);
  return normalizeCatalogJid(instance.phone_number)
    ?? normalizeCatalogJid(readString(metadata?.phone_number))
    ?? normalizeCatalogJid(readString(metadata?.owner))
    ?? normalizeCatalogJid(readString(metadata?.number))
    ?? normalizeCatalogJid(readString(metadata?.profile_phone));
}

function normalizeCatalogJid(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;

  if (raw.includes("@")) {
    return raw;
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return `${digits}@s.whatsapp.net`;
}

function resolveInstanceAgentId(instance: WhatsappInstanceRow) {
  const metadata = readRecord(instance.metadata) ?? {};

  return readString(metadata.agent_id)
    ?? readString(metadata.agentId)
    ?? readString(metadata.whatsapp_agent_id)
    ?? readString(metadata.producer_agent_id)
    ?? firstString(metadata.agent_ids);
}

function upsertWhatsappExportTarget(
  value: unknown,
  input: {
    whatsappInstanceId: string;
    agentId: string | null;
    now: string;
  },
) {
  const targets = new Map<string, JsonRecord>();

  if (Array.isArray(value)) {
    for (const item of value) {
      const record = readRecord(item);
      const instanceId = readString(record?.whatsapp_instance_id) ?? readString(record?.whatsappInstanceId);

      if (!record || !instanceId) {
        continue;
      }

      targets.set(instanceId, {
        whatsapp_instance_id: instanceId,
        agent_id: readString(record.agent_id) ?? readString(record.agentId),
        status: readString(record.status) ?? "pending_provider_support",
        exported_at: readString(record.exported_at) ?? readString(record.exportedAt),
        provider_product_id: readString(record.provider_product_id) ?? readString(record.providerProductId),
      });
    }
  }

  targets.set(input.whatsappInstanceId, {
    whatsapp_instance_id: input.whatsappInstanceId,
    agent_id: input.agentId,
    status: "pending_provider_support",
    exported_at: null,
    provider_product_id: null,
    requested_at: input.now,
  });

  return Array.from(targets.values());
}

function mergeStringLists(value: unknown, next: string | null) {
  const current = Array.isArray(value)
    ? value.map((item) => readString(item)).filter((item): item is string => Boolean(item))
    : [];

  return uniqueStrings([...current, next]);
}

function firstString(value: unknown) {
  if (typeof value === "string") return readString(value);
  if (!Array.isArray(value)) return null;

  for (const item of value) {
    const text = readString(item);
    if (text) return text;
  }

  return null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => readString(value)).filter((value): value is string => Boolean(value))));
}

function decryptInstanceToken(instance: WhatsappInstanceRow) {
  if (!instance.instance_token_encrypted) return null;

  try {
    return decryptCredentialValue(instance.instance_token_encrypted);
  } catch {
    return null;
  }
}

async function callUazapi(
  credentials: UazapiCredentials,
  path: string,
  options: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    token: string;
    timeoutMs?: number;
  },
) {
  const timeoutMs = options.timeoutMs ?? uazapiRequestTimeoutMs;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch(`${credentials.baseUrl}${path}`, {
      method: options.method,
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        token: options.token,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "O provedor WhatsApp demorou para responder o catalogo. Tente novamente ou use a importacao em etapas quando o catalogo tiver muitos produtos.",
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await readProviderResponse(response);

  if (!response.ok) {
    throw new Error(readProviderError(data) ?? `Provedor WhatsApp respondeu status ${response.status}.`);
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

async function readProviderResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readProviderError(value: unknown) {
  if (typeof value === "string") return value.trim() || null;
  const record = readRecord(value);
  return readString(record?.error)
    ?? readString(record?.message)
    ?? readString(readRecord(record?.error)?.message);
}

function compactRecord(record: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function normalizeText(value: string | null | undefined, maxLength: number) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized ? normalized.slice(0, maxLength) : null;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}
