import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireClientCompanyAccess, listClientCompanies } from "@/lib/client-os/companies";
import { createServiceClient } from "@/lib/supabase/service";
import {
  createDefaultSalesCatalogShippingServices,
  defaultSalesCatalogShippingRules,
  emptySalesCatalogProductShipping,
  createSalesCatalogTag,
  getSalesCatalogReadiness,
  resolveSalesCatalogMediaKind,
  salesCatalogBusinessTemplates,
  type ClientSalesCatalogSettings,
  type ClientSalesCatalogItem,
  type ClientSalesCatalogShippingSettings,
  type SalesCatalogAttribute,
  type SalesCatalogBusinessType,
  type SalesCatalogItemAttribute,
  type SalesCatalogItemStatus,
  type SalesCatalogMedia,
  type SalesCatalogProductShipping,
  type SalesCatalogShippingProvider,
  type SalesCatalogShippingProfile,
  type SalesCatalogShippingRule,
  type SalesCatalogShippingService,
  type SalesCatalogShippingWeightTier,
  type SalesCatalogSource,
} from "@/lib/sales-catalog/shared";

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

export async function listClientSalesCatalog(input: {
  userId: string;
  companyId?: string | null;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const companyIds = input.companyId
    ? [(await requireClientCompanyAccess({ userId: input.userId, companyId: input.companyId, client })).id]
    : (await listClientCompanies(input.userId, client)).map((company) => company.id);

  if (companyIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("memory_type", "sales_catalog_item")
    .in("organization_id", companyIds)
    .order("created_at", { ascending: false })
    .limit(120);

  if (error) {
    throw new Error(`Nao foi possivel carregar o catalogo de vendas: ${error.message}`);
  }

  return ((data ?? []) as SalesCatalogMemoryRow[]).map(mapSalesCatalogItem);
}

export async function listClientSalesCatalogSettings(input: {
  userId: string;
  companyId?: string | null;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const companyIds = input.companyId
    ? [(await requireClientCompanyAccess({ userId: input.userId, companyId: input.companyId, client })).id]
    : (await listClientCompanies(input.userId, client)).map((company) => company.id);

  if (companyIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("memory_type", "sales_catalog_settings")
    .in("organization_id", companyIds)
    .order("updated_at", { ascending: false })
    .limit(80);

  if (error) {
    throw new Error(`Nao foi possivel carregar a configuracao do catalogo: ${error.message}`);
  }

  const latestByCompany = new Map<string, ClientSalesCatalogSettings>();

  for (const row of (data ?? []) as SalesCatalogMemoryRow[]) {
    const settings = mapSalesCatalogSettings(row);
    if (settings.companyId && !latestByCompany.has(settings.companyId)) {
      latestByCompany.set(settings.companyId, settings);
    }
  }

  return Array.from(latestByCompany.values());
}

export async function listClientSalesCatalogShippingSettings(input: {
  userId: string;
  companyId?: string | null;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const companyIds = input.companyId
    ? [(await requireClientCompanyAccess({ userId: input.userId, companyId: input.companyId, client })).id]
    : (await listClientCompanies(input.userId, client)).map((company) => company.id);

  if (companyIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("memory_type", "sales_catalog_shipping_settings")
    .in("organization_id", companyIds)
    .order("updated_at", { ascending: false })
    .limit(80);

  if (error) {
    throw new Error(`Nao foi possivel carregar o frete do catalogo: ${error.message}`);
  }

  const latestByCompany = new Map<string, ClientSalesCatalogShippingSettings>();

  for (const row of (data ?? []) as SalesCatalogMemoryRow[]) {
    const settings = mapSalesCatalogShippingSettings(row);
    if (settings.companyId && !latestByCompany.has(settings.companyId)) {
      latestByCompany.set(settings.companyId, settings);
    }
  }

  return Array.from(latestByCompany.values());
}

export async function listOrganizationSalesCatalog(
  client: SupabaseClient,
  organizationId: string,
  limit = 80,
) {
  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .eq("memory_type", "sales_catalog_item")
    .neq("metadata->>status", "archived")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Nao foi possivel carregar o catalogo de vendas: ${error.message}`);
  }

  return ((data ?? []) as SalesCatalogMemoryRow[]).map(mapSalesCatalogItem);
}

export function mapSalesCatalogItem(row: SalesCatalogMemoryRow): ClientSalesCatalogItem {
  const metadata = readRecord(row.metadata) ?? {};
  const media = readMediaList(metadata.media);
  const description = readString(metadata.description) ?? previewContent(row.content);
  const status = normalizeStatus(readString(metadata.status));
  const currency = readString(metadata.currency) ?? "BRL";

  return {
    id: row.id,
    companyId: readString(row.organization_id) ?? "",
    title: readString(metadata.title) ?? row.title,
    description,
    category: readString(metadata.category),
    price: readString(metadata.price),
    currency,
    status,
    tag: readString(metadata.tag) ?? createSalesCatalogTag(row.title, row.id),
    media,
    attributes: readItemAttributes(metadata.attributes),
    shipping: readProductShipping(metadata.shipping),
    source: normalizeSource(readString(metadata.source)),
    whatsappCatalogId: readString(metadata.whatsapp_catalog_id),
    whatsappCatalogJid: readString(metadata.whatsapp_catalog_jid),
    whatsappCatalogHidden: readBoolean(metadata.whatsapp_catalog_hidden),
    whatsappCatalogStatus: readString(metadata.whatsapp_catalog_status),
    whatsappCatalogSyncedAt: readString(metadata.whatsapp_catalog_synced_at),
    readiness: getSalesCatalogReadiness({ description, media }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSalesCatalogShippingSettings(row: SalesCatalogMemoryRow): ClientSalesCatalogShippingSettings {
  const metadata = readRecord(row.metadata) ?? {};

  return {
    id: row.id,
    companyId: readString(row.organization_id) ?? "",
    configured: readBoolean(metadata.configured),
    localPickup: readBoolean(metadata.local_pickup),
    originCep: readString(metadata.origin_cep),
    defaultHandlingDays: readNumber(metadata.default_handling_days),
    rules: readShippingRules(metadata.rules),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSalesCatalogSettings(row: SalesCatalogMemoryRow): ClientSalesCatalogSettings {
  const metadata = readRecord(row.metadata) ?? {};
  const businessType = normalizeBusinessType(readString(metadata.business_type));
  const fallback = salesCatalogBusinessTemplates.find((template) => template.value === businessType)
    ?? salesCatalogBusinessTemplates[salesCatalogBusinessTemplates.length - 1];

  return {
    id: row.id,
    companyId: readString(row.organization_id) ?? "",
    configured: readBoolean(metadata.configured),
    businessType,
    categories: readStringList(metadata.categories, fallback.categories),
    attributes: readAttributeList(metadata.attributes, fallback.attributes),
    trackInventory: readNullableBoolean(metadata.track_inventory) ?? fallback.trackInventory,
    variationMedia: readNullableBoolean(metadata.variation_media) ?? fallback.variationMedia,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readMediaList(value: unknown): SalesCatalogMedia[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): SalesCatalogMedia | null => {
      const record = readRecord(item);
      if (!record) return null;

      const storageUrl = readString(record.storage_url);
      const fileName = readString(record.file_name);
      const contentType = readString(record.content_type) ?? "application/octet-stream";
      const size = readNumber(record.size) ?? 0;

      if (!storageUrl || !fileName) return null;

      return {
        id: readString(record.id) ?? fileName,
        fileName,
        contentType,
        size,
        storageUrl,
        kind: normalizeKind(readString(record.kind), contentType, fileName),
        createdAt: readString(record.created_at),
      };
    })
    .filter((item): item is SalesCatalogMedia => Boolean(item));
}

function readProductShipping(value: unknown): SalesCatalogProductShipping {
  const fallback = emptySalesCatalogProductShipping();
  const record = readRecord(value);

  if (!record) return fallback;

  const dimensions = readRecord(record.dimensions) ?? {};

  return {
    weightGrams: readNumber(record.weight_grams) ?? readNumber(record.weightGrams),
    dimensions: {
      lengthCm: readNumber(dimensions.length_cm) ?? readNumber(dimensions.lengthCm),
      widthCm: readNumber(dimensions.width_cm) ?? readNumber(dimensions.widthCm),
      heightCm: readNumber(dimensions.height_cm) ?? readNumber(dimensions.heightCm),
    },
    profile: normalizeShippingProfile(readString(record.profile)),
    notes: readString(record.notes),
  };
}

function readShippingRules(value: unknown): SalesCatalogShippingRule[] {
  const rulesByUf = new Map(defaultSalesCatalogShippingRules.map((rule) => [rule.uf, cloneShippingRule(rule)]));

  if (!Array.isArray(value)) {
    return defaultSalesCatalogShippingRules.map(cloneShippingRule);
  }

  for (const item of value) {
    const record = readRecord(item);
    if (!record) continue;

    const uf = normalizeUf(readString(record.uf));
    if (!uf || !rulesByUf.has(uf)) continue;

    const fallback = rulesByUf.get(uf)!;
    rulesByUf.set(uf, {
      uf,
      state: readString(record.state) ?? fallback.state,
      active: readNullableBoolean(record.active) ?? fallback.active,
      cepStart: readString(record.cep_start) ?? readString(record.cepStart) ?? fallback.cepStart,
      cepEnd: readString(record.cep_end) ?? readString(record.cepEnd) ?? fallback.cepEnd,
      price: readString(record.price),
      minDays: readNumber(record.min_days) ?? readNumber(record.minDays),
      maxDays: readNumber(record.max_days) ?? readNumber(record.maxDays),
      freeShippingThreshold: readString(record.free_shipping_threshold) ?? readString(record.freeShippingThreshold),
      services: readShippingServices(record.services, fallback.services),
      notes: readString(record.notes),
    });
  }

  return defaultSalesCatalogShippingRules.map((rule) => rulesByUf.get(rule.uf) ?? cloneShippingRule(rule));
}

function cloneShippingRule(rule: SalesCatalogShippingRule): SalesCatalogShippingRule {
  return {
    ...rule,
    services: rule.services.map((service) => ({
      ...service,
      tiers: service.tiers.map((tier) => ({ ...tier })),
    })),
  };
}

function readShippingServices(value: unknown, fallback: SalesCatalogShippingService[]): SalesCatalogShippingService[] {
  const fallbackById = new Map((fallback.length > 0 ? fallback : createDefaultSalesCatalogShippingServices()).map((service) => [service.id, service]));

  if (!Array.isArray(value)) {
    return Array.from(fallbackById.values()).map(cloneShippingService);
  }

  for (const item of value) {
    const record = readRecord(item);
    if (!record) continue;

    const id = readString(record.id);
    if (!id) continue;

    const fallbackService = fallbackById.get(id);
    fallbackById.set(id, {
      id,
      provider: normalizeShippingProvider(readString(record.provider), fallbackService?.provider),
      name: readString(record.name) ?? fallbackService?.name ?? id,
      active: readNullableBoolean(record.active) ?? fallbackService?.active ?? false,
      tiers: readWeightTiers(record.tiers, fallbackService?.tiers ?? []),
    });
  }

  return Array.from(fallbackById.values()).map(cloneShippingService);
}

function readWeightTiers(value: unknown, fallback: SalesCatalogShippingWeightTier[]): SalesCatalogShippingWeightTier[] {
  if (!Array.isArray(value)) {
    return fallback.map((tier) => ({ ...tier }));
  }

  const tiers = value
    .map((item): SalesCatalogShippingWeightTier | null => {
      const record = readRecord(item);
      if (!record) return null;

      const id = readString(record.id);
      const maxWeightGrams = readNumber(record.max_weight_grams) ?? readNumber(record.maxWeightGrams);

      if (!id && maxWeightGrams === null) return null;

      return {
        id: id ?? `tier_${maxWeightGrams}`,
        name: readString(record.name) ?? (maxWeightGrams ? `Ate ${maxWeightGrams} g` : "Faixa"),
        active: readNullableBoolean(record.active) ?? true,
        maxWeightGrams,
        price: readString(record.price),
        minDays: readNumber(record.min_days) ?? readNumber(record.minDays),
        maxDays: readNumber(record.max_days) ?? readNumber(record.maxDays),
      };
    })
    .filter((item): item is SalesCatalogShippingWeightTier => Boolean(item));

  return tiers.length > 0 ? tiers : fallback.map((tier) => ({ ...tier }));
}

function cloneShippingService(service: SalesCatalogShippingService): SalesCatalogShippingService {
  return {
    ...service,
    tiers: service.tiers.map((tier) => ({ ...tier })),
  };
}

function normalizeShippingProvider(value: string | null, fallback?: SalesCatalogShippingProvider): SalesCatalogShippingProvider {
  if (value === "carrier") return "carrier";
  if (value === "correios") return "correios";
  return fallback ?? "carrier";
}

function normalizeKind(value: string | null, contentType: string, fileName: string) {
  if (value === "image" || value === "video" || value === "document") {
    return value;
  }

  return resolveSalesCatalogMediaKind(contentType, fileName);
}

function normalizeStatus(value: string | null): SalesCatalogItemStatus {
  if (value === "draft" || value === "archived") return value;
  return "active";
}

function normalizeBusinessType(value: string | null): SalesCatalogBusinessType {
  if (value === "fashion" || value === "physical" || value === "services" || value === "digital" || value === "food") {
    return value;
  }

  return "simple";
}

function normalizeSource(value: string | null): SalesCatalogSource {
  if (value === "whatsapp_catalog") return "whatsapp_catalog";
  return "manual";
}

function normalizeShippingProfile(value: string | null): SalesCatalogShippingProfile {
  if (value === "free" || value === "custom") return value;
  return "default";
}

function normalizeUf(value: string | null) {
  if (!value) return null;
  const uf = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(uf) ? uf : null;
}

function previewContent(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 600);
}

function readItemAttributes(value: unknown): SalesCatalogItemAttribute[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): SalesCatalogItemAttribute | null => {
      const record = readRecord(item);
      if (!record) return null;

      const name = readString(record.name);
      const values = readStringList(record.values, []);

      if (!name || values.length === 0) return null;

      return {
        id: readString(record.id) ?? createAttributeId(name),
        name,
        values,
      };
    })
    .filter((item): item is SalesCatalogItemAttribute => Boolean(item));
}

function readAttributeList(value: unknown, fallback: SalesCatalogAttribute[]): SalesCatalogAttribute[] {
  if (!Array.isArray(value)) return fallback;

  const attributes = value
    .map((item): SalesCatalogAttribute | null => {
      const record = readRecord(item);
      if (!record) return null;

      const name = readString(record.name);
      const values = readStringList(record.values, []);

      if (!name) return null;

      return {
        id: readString(record.id) ?? createAttributeId(name),
        name,
        values,
        required: readNullableBoolean(record.required) ?? false,
      };
    })
    .filter((item): item is SalesCatalogAttribute => Boolean(item));

  return attributes.length > 0 ? attributes : fallback;
}

function readStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;

  const values = value
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item));

  return Array.from(new Set(values));
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function readNullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
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
