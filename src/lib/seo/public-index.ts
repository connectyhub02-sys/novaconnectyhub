import { mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";
import { isSalesCatalogDisplayableProduct } from "@/lib/sales-catalog/shared";
import { buildCanonicalUrl, toAbsoluteUrl, truncateSeoText } from "@/lib/seo/site";
import { createServiceClient } from "@/lib/supabase/service";

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

type OrganizationRow = {
  id: string;
  name: string;
  slug: string | null;
  status?: string | null;
  metadata?: JsonRecord | null;
};

export type PublicIndexStore = {
  id: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string | null;
  url: string;
  productsUrl: string;
  productCount: number;
  updatedAt: string | null;
};

export type PublicIndexProduct = {
  id: string;
  organizationId: string;
  storeSlug: string;
  organizationName: string;
  title: string;
  description: string;
  category: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string;
  url: string;
  updatedAt: string | null;
};

export async function loadPublicCatalogIndex(input: { productLimit?: number } = {}) {
  try {
    const client = createServiceClient();
    const { data, error } = await client
      .from("intelligence_memory")
      .select("id, organization_id, title, content, metadata, created_at, updated_at")
      .eq("scope", "organization")
      .eq("memory_type", "sales_catalog_item")
      .filter("metadata->>status", "eq", "active")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(input.productLimit ?? 1200)
      .returns<SalesCatalogMemoryRow[]>();

    if (error || !data?.length) {
      return { stores: [] as PublicIndexStore[], products: [] as PublicIndexProduct[] };
    }

    const items = data
      .map(mapSalesCatalogItem)
      .filter((item) => item.companyId && item.status === "active" && isSalesCatalogDisplayableProduct(item));
    const organizationIds = Array.from(new Set(items.map((item) => item.companyId)));

    if (!organizationIds.length) {
      return { stores: [] as PublicIndexStore[], products: [] as PublicIndexProduct[] };
    }

    const { data: organizations } = await client
      .from("organizations")
      .select("id, name, slug, status, metadata")
      .in("id", organizationIds)
      .returns<OrganizationRow[]>();
    const organizationById = new Map(
      (organizations ?? [])
        .filter(isPublicOrganization)
        .map((organization) => [organization.id, organization]),
    );
    const products: PublicIndexProduct[] = [];
    const storeStats = new Map<string, { count: number; updatedAt: string | null }>();

    for (const item of items) {
      const organization = organizationById.get(item.companyId);
      if (!organization) continue;

      const storeSlug = organization.slug ?? organization.id;
      const organizationName = resolveOrganizationDisplayName(organization);
      const cover = item.media.find((media) => media.kind === "image") ?? null;
      const price = normalizeCurrencyAmount(item.offer.salePrice) ?? normalizeCurrencyAmount(item.price);
      const updatedAt = item.updatedAt ?? item.createdAt;

      products.push({
        id: item.id,
        organizationId: organization.id,
        storeSlug,
        organizationName,
        title: item.title,
        description: truncateSeoText(item.description, 240),
        category: item.category,
        imageUrl: toAbsoluteUrl(cover?.storageUrl ?? null),
        price,
        currency: item.currency || "BRL",
        url: buildCanonicalUrl(`/loja/${encodeURIComponent(storeSlug)}/produto/${encodeURIComponent(item.id)}`),
        updatedAt,
      });

      const current = storeStats.get(organization.id) ?? { count: 0, updatedAt: null };
      storeStats.set(organization.id, {
        count: current.count + 1,
        updatedAt: maxIsoDate(current.updatedAt, updatedAt),
      });
    }

    const stores = Array.from(organizationById.values())
      .map((organization): PublicIndexStore | null => {
        const stats = storeStats.get(organization.id);
        if (!stats?.count) return null;

        const storeSlug = organization.slug ?? organization.id;
        const name = resolveOrganizationDisplayName(organization);

        return {
          id: organization.id,
          slug: storeSlug,
          name,
          description: resolveOrganizationDescription(organization, name),
          logoUrl: resolveOrganizationLogoUrl(organization),
          url: buildCanonicalUrl(`/loja/${encodeURIComponent(storeSlug)}`),
          productsUrl: buildCanonicalUrl(`/loja/${encodeURIComponent(storeSlug)}/produtos`),
          productCount: stats.count,
          updatedAt: stats.updatedAt,
        };
      })
      .filter((store): store is PublicIndexStore => Boolean(store))
      .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt));

    return { stores, products };
  } catch {
    return { stores: [] as PublicIndexStore[], products: [] as PublicIndexProduct[] };
  }
}

function isPublicOrganization(organization: OrganizationRow) {
  const status = organization.status?.toLowerCase().trim();
  return !status || !["archived", "blocked", "deleted", "disabled", "inactive", "suspended"].includes(status);
}

function resolveOrganizationDisplayName(organization: OrganizationRow) {
  const metadata = readRecord(organization.metadata);
  return readString(metadata.public_display_name) ?? organization.name;
}

function resolveOrganizationDescription(organization: OrganizationRow, displayName: string) {
  const metadata = readRecord(organization.metadata);
  return readString(metadata.public_description)
    ?? readString(metadata.brand_description)
    ?? `Produtos selecionados pela ${displayName}, com atendimento pelo WhatsApp e checkout seguro pela ConnectyHub.`;
}

function resolveOrganizationLogoUrl(organization: OrganizationRow) {
  const metadata = readRecord(organization.metadata);
  return toAbsoluteUrl(readString(metadata.brand_logo_url));
}

function maxIsoDate(left: string | null, right: string | null) {
  if (!left) return right;
  if (!right) return left;

  return toTimestamp(right) > toTimestamp(left) ? right : left;
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0;

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
