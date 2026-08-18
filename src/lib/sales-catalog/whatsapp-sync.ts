import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { loadUazapiCredentials, type UazapiCredentials } from "@/lib/whatsapp/uazapi-credentials";
import {
  buildSalesCatalogContent,
  createSalesCatalogSlug,
  createSalesCatalogTag,
  getSalesCatalogReadiness,
  type ClientSalesCatalogItem,
  type SalesCatalogItemStatus,
  type SalesCatalogMedia,
} from "./shared";

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
  category: string | null;
  price: string | null;
  currency: string;
  status: SalesCatalogItemStatus;
  media: SalesCatalogMedia[];
  catalogJid: string;
  url: string | null;
  hidden: boolean;
  catalogStatus: string | null;
  availability: string | null;
  retailerId: string | null;
  importedPayload: JsonRecord;
};

export type WhatsappCatalogImportResult = {
  items: ClientSalesCatalogItem[];
  imported: number;
  updated: number;
  skipped: number;
  pages: number;
  hasMore: boolean;
  catalogJid: string;
};

export type WhatsappCatalogExportResult = {
  items: ClientSalesCatalogItem[];
  exported: number;
  skipped: number;
  providerSupported: boolean;
  whatsappInstanceId: string;
  agentId: string | null;
};

export async function importWhatsappCatalog(input: {
  userId: string;
  companyId: string;
  whatsappInstanceId?: string | null;
  client?: SupabaseClient;
}): Promise<WhatsappCatalogImportResult> {
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
  const items: ClientSalesCatalogItem[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const product of fetched.products) {
    const normalized = normalizeWhatsappProduct(product, catalogJid, now);

    if (!normalized) {
      skipped += 1;
      continue;
    }

    const result = await upsertWhatsappCatalogProduct(client, {
      companyId: company.id,
      product: normalized,
      whatsappInstanceId: instance.id,
      agentId,
      userId: input.userId,
      now,
    });

    if (result.created) {
      imported += 1;
    } else {
      updated += 1;
    }

    items.push(mapSalesCatalogItem(result.row));
  }

  await client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: company.id,
    source_type: "sales_catalog",
    source_id: company.id,
    event_type: "sales_catalog.whatsapp_imported",
    title: "Catalogo WhatsApp sincronizado",
    summary: `${imported} novos, ${updated} atualizados, ${skipped} ignorados.`,
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "whatsapp_catalog", "whatsapp_agent", "lead_tracking"],
    payload: {
      catalog_jid: catalogJid,
      whatsapp_instance_id: instance.id,
      agent_id: agentId,
      imported,
      updated,
      skipped,
      pages: fetched.pages,
      has_more: fetched.hasMore,
      synced_by: input.userId,
    },
  });

  return {
    items,
    imported,
    updated,
    skipped,
    pages: fetched.pages,
    hasMore: fetched.hasMore,
    catalogJid,
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

async function upsertWhatsappCatalogProduct(
  client: SupabaseClient,
  input: {
    companyId: string;
    product: NormalizedWhatsappProduct;
    whatsappInstanceId: string;
    agentId: string | null;
    userId: string;
    now: string;
  },
) {
  const { data: existing, error: existingError } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("organization_id", input.companyId)
    .eq("memory_type", "sales_catalog_item")
    .eq("metadata->>whatsapp_catalog_id", input.product.productId)
    .limit(1)
    .maybeSingle<SalesCatalogMemoryRow>();

  if (existingError) {
    throw new Error(`Nao foi possivel verificar produto importado: ${existingError.message}`);
  }

  const itemId = existing?.id ?? randomUUID();
  const existingMetadata = readRecord(existing?.metadata) ?? {};
  const tag = readString(existingMetadata.tag) ?? createSalesCatalogTag(input.product.title, itemId);
  const content = buildSalesCatalogContent(input.product);
  const metadata = {
    ...existingMetadata,
    title: input.product.title,
    description: input.product.description,
    category: input.product.category,
    price: input.product.price,
    currency: input.product.currency,
    status: input.product.status,
    tag,
    media: serializeMedia(input.product.media),
    source: "whatsapp_catalog",
    source_whatsapp_instance_id: readString(existingMetadata.source_whatsapp_instance_id) ?? input.whatsappInstanceId,
    source_agent_id: readString(existingMetadata.source_agent_id) ?? input.agentId,
    assigned_whatsapp_instance_ids: mergeStringLists(existingMetadata.assigned_whatsapp_instance_ids ?? existingMetadata.whatsapp_instance_ids, input.whatsappInstanceId),
    assigned_agent_ids: mergeStringLists(existingMetadata.assigned_agent_ids ?? existingMetadata.agent_ids, input.agentId),
    readiness: getSalesCatalogReadiness({ description: input.product.description, media: input.product.media }),
    whatsapp_catalog_id: input.product.productId,
    whatsapp_catalog_jid: input.product.catalogJid,
    whatsapp_catalog_url: input.product.url,
    whatsapp_catalog_hidden: input.product.hidden,
    whatsapp_catalog_status: input.product.catalogStatus,
    whatsapp_catalog_availability: input.product.availability,
    whatsapp_catalog_retailer_id: input.product.retailerId,
    whatsapp_catalog_payload: input.product.importedPayload,
    whatsapp_catalog_imported_at: readString(existingMetadata.whatsapp_catalog_imported_at) ?? input.now,
    whatsapp_catalog_synced_at: input.now,
    updated_by: input.userId,
  };
  const payload = {
    id: itemId,
    scope: "organization",
    organization_id: input.companyId,
    memory_type: "sales_catalog_item",
    title: input.product.title,
    content,
    importance: 0.84,
    tags: ["sales_catalog_item", "sales_catalog", "whatsapp_catalog", "whatsapp_agent", "lead_tracking"],
    metadata,
    updated_at: input.now,
  };
  const query = existing
    ? client.from("intelligence_memory").update(payload).eq("id", existing.id)
    : client.from("intelligence_memory").insert({ ...payload, created_at: input.now });
  const { data, error } = await query
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .single<SalesCatalogMemoryRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel salvar produto importado.");
  }

  return {
    row: data,
    created: !existing,
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
  const status = hidden ? "draft" : "active";
  const media = readProductImages(product, title, now);

  return {
    productId,
    title,
    description,
    category: "WhatsApp Catalog",
    price,
    currency,
    status,
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

function serializeMedia(media: SalesCatalogMedia[]) {
  return media.map((item) => ({
    id: item.id,
    file_name: item.fileName,
    content_type: item.contentType,
    size: item.size,
    storage_url: item.storageUrl,
    object_key: item.objectKey ?? null,
    kind: item.kind,
    created_at: item.createdAt,
  }));
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
  },
) {
  const response = await fetch(`${credentials.baseUrl}${path}`, {
    method: options.method,
    headers: {
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      token: options.token,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
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
