import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireClientCompanyAccess, listClientCompanies } from "@/lib/client-os/companies";
import { createServiceClient } from "@/lib/supabase/service";
import {
  createSalesCatalogTag,
  getSalesCatalogReadiness,
  resolveSalesCatalogMediaKind,
  type ClientSalesCatalogItem,
  type SalesCatalogItemStatus,
  type SalesCatalogMedia,
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
    source: normalizeSource(readString(metadata.source)),
    whatsappCatalogId: readString(metadata.whatsapp_catalog_id),
    readiness: getSalesCatalogReadiness({ description, media }),
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

function normalizeSource(value: string | null): SalesCatalogSource {
  if (value === "whatsapp_catalog") return "whatsapp_catalog";
  return "manual";
}

function previewContent(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 600);
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
