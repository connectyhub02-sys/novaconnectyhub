import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  PublicStorefront,
  type PublicStorefrontBranding,
  type PublicStorefrontSettings,
  type PublicStorefrontProduct,
  type PublicStorefrontTrackingParams,
} from "@/components/checkout/public-storefront";
import { getOrganizationSalesCatalogSettings, mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";
import { buildLeadAwareSalesCatalogProductUrl } from "@/lib/sales-catalog/public-urls";
import { isSalesCatalogDisplayableProduct, type ClientSalesCatalogItem } from "@/lib/sales-catalog/shared";
import { createServiceClient } from "@/lib/supabase/service";
import { createOrganizationTrackingToken } from "@/lib/tracking/organization-attribution";
import type { ConnectyPublicTrackingContext } from "@/lib/tracking/public-context";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

type StorePageProps = {
  params: Promise<{ storeSlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string | null;
  metadata?: JsonRecord | null;
};

type SalesCatalogMemoryRow = {
  id: string;
  organization_id: string | null;
  title: string;
  content: string;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function generateMetadata({ params }: StorePageProps): Promise<Metadata> {
  const { storeSlug } = await params;
  const client = createServiceClient();
  const organization = await loadOrganizationBySlug(client, storeSlug);

  if (!organization) {
    return {
      title: "Loja | ConnectyHub",
      description: "Loja indisponivel.",
    };
  }

  const branding = resolveOrganizationBranding(organization);

  return {
    title: `${branding.displayName} | Loja`,
    description: `Compre produtos da ${branding.displayName} com checkout seguro e atendimento no WhatsApp.`,
  };
}

export default async function StorePage({ params, searchParams }: StorePageProps) {
  const { storeSlug } = await params;
  const query = (await searchParams) ?? {};
  const client = createServiceClient();
  const organization = await loadOrganizationBySlug(client, storeSlug);

  if (!organization) {
    notFound();
  }

  const branding = resolveOrganizationBranding(organization);
  const publicSlug = organization.slug ?? organization.id;
  const leadId = readSearchString(query.lead_id);
  const leadPhone = readSearchString(query.lead_phone);
  const conversationId = readSearchString(query.conversation_id);
  const trackingLinkId = readSearchString(query.tracking_link_id);
  const products = await loadStoreProducts(client, {
    organizationId: organization.id,
    leadId,
    leadPhone,
    conversationId,
    trackingLinkId,
  });
  const catalogSettings = await getOrganizationSalesCatalogSettings(client, organization.id);
  const storefront = catalogSettings?.storefront ?? null;
  const publicTrackingContext = buildStorePublicTrackingContext({
    organizationId: organization.id,
    leadId,
    leadPhone,
    conversationId,
    trackingLinkId,
  });
  const tracking: PublicStorefrontTrackingParams = {
    organizationId: organization.id,
    leadId,
    leadPhone,
    conversationId,
    trackingLinkId,
  };

  return (
    <>
      <script
        id="connecty-public-tracking-context"
        dangerouslySetInnerHTML={{
          __html: `window.__CONNECTYHUB_TRACKING_CONTEXT__=${safeJson(publicTrackingContext)};`,
        }}
      />
      <PublicStorefront
        storeSlug={publicSlug}
        branding={branding}
        storefront={resolveStorefrontSettings(storefront)}
        products={products}
        tracking={tracking}
      />
    </>
  );
}

async function loadOrganizationBySlug(
  client: ReturnType<typeof createServiceClient>,
  storeSlug: string,
) {
  const decoded = decodeURIComponent(storeSlug).trim();
  const query = client
    .from("organizations")
    .select("id, name, slug, metadata");

  const { data } = normalizeUuid(decoded)
    ? await query.eq("id", decoded).maybeSingle<OrganizationRow>()
    : await query.eq("slug", decoded).maybeSingle<OrganizationRow>();

  return data ?? null;
}

async function loadStoreProducts(
  client: ReturnType<typeof createServiceClient>,
  input: {
    organizationId: string;
    leadId: string | null;
    leadPhone: string | null;
    conversationId: string | null;
    trackingLinkId: string | null;
  },
) {
  const { data } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("organization_id", input.organizationId)
    .eq("memory_type", "sales_catalog_item")
    .filter("metadata->>status", "eq", "active")
    .order("updated_at", { ascending: false })
    .limit(96)
    .returns<SalesCatalogMemoryRow[]>();

  const items = ((data ?? []) as SalesCatalogMemoryRow[])
    .map(mapSalesCatalogItem)
    .filter((item) => item.status === "active" && isSalesCatalogDisplayableProduct(item))
    .sort(compareStoreCatalogItems);
  let featuredAssigned = false;

  return items.map((item) => {
    const isStoreFeatured = item.storeFeatured && !featuredAssigned;
    if (isStoreFeatured) {
      featuredAssigned = true;
    }

    return mapStorefrontProduct(item, input, isStoreFeatured);
  });
}

function mapStorefrontProduct(
  item: ClientSalesCatalogItem,
  input: {
    organizationId: string;
    leadId: string | null;
    leadPhone: string | null;
    conversationId: string | null;
    trackingLinkId: string | null;
  },
  isStoreFeatured: boolean,
): PublicStorefrontProduct {
  const salePrice = normalizeCurrencyAmount(item.offer.salePrice);
  const basePrice = normalizeCurrencyAmount(item.price);
  const price = salePrice ?? basePrice;
  const cover = item.media.find((media) => media.kind === "image") ?? null;
  const canCheckout = item.salesDestination === "connectyhub_checkout"
    && price !== null
    && !(item.inventory.status === "out_of_stock" && !item.inventory.allowBackorder);
  const compareAtLabel = salePrice !== null && basePrice !== null && basePrice > salePrice
    ? formatCurrency(basePrice)
    : null;

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    shortDescription: createShortDescription(item.description),
    category: item.category ?? "Produto",
    priceLabel: price !== null ? formatCurrency(price) : "Sob consulta",
    priceCents: price !== null ? Math.round(price * 100) : null,
    compareAtLabel,
    coverUrl: cover?.storageUrl ?? null,
    stockLabel: formatStockLabel(item),
    fulfillmentLabel: formatFulfillment(item.fulfillment.mode),
    highlightLabel: isStoreFeatured ? item.highlightLabel ?? "Destaque" : item.highlightLabel ?? (item.offer.salePrice ? "Oferta" : null),
    isFeatured: isStoreFeatured,
    canCheckout,
    productUrl: buildLeadAwareSalesCatalogProductUrl({
      productId: item.id,
      organizationId: input.organizationId,
      leadId: input.leadId,
      leadPhone: input.leadPhone,
      conversationId: input.conversationId,
      trackingLinkId: input.trackingLinkId,
    }),
  };
}

function compareStoreCatalogItems(a: ClientSalesCatalogItem, b: ClientSalesCatalogItem) {
  const featuredA = a.storeFeatured ? 0 : 1;
  const featuredB = b.storeFeatured ? 0 : 1;

  if (featuredA !== featuredB) {
    return featuredA - featuredB;
  }

  if (a.storeFeatured || b.storeFeatured) {
    const rankA = a.storeFeaturedRank ?? 999;
    const rankB = b.storeFeaturedRank ?? 999;

    if (rankA !== rankB) {
      return rankA - rankB;
    }
  }

  return toStoreCatalogTimestamp(b.updatedAt ?? b.createdAt) - toStoreCatalogTimestamp(a.updatedAt ?? a.createdAt);
}

function buildStorePublicTrackingContext(input: {
  organizationId: string;
  leadId: string | null;
  leadPhone: string | null;
  conversationId: string | null;
  trackingLinkId: string | null;
}): ConnectyPublicTrackingContext {
  const secret = process.env.TRACKING_PUBLIC_TOKEN_SECRET;

  return {
    scope: "organization",
    organization_id: input.organizationId,
    tracking_token: secret ? createOrganizationTrackingToken(input.organizationId, secret) : null,
    lead_id: input.leadId,
    lead_phone: input.leadPhone,
    conversation_id: input.conversationId,
    tracking_link_id: input.trackingLinkId,
    tracking_source: "sales_catalog_store",
  };
}

function resolveOrganizationBranding(organization: OrganizationRow): PublicStorefrontBranding {
  const metadata = readRecord(organization.metadata);
  const logoUrl = readString(metadata.brand_logo_url);
  const displayName = readString(metadata.public_display_name) ?? organization.name;

  return {
    displayName,
    logoUrl,
    logoAlt: readString(metadata.brand_logo_alt) ?? displayName,
  };
}

function resolveStorefrontSettings(settings: PublicStorefrontSettings | null): PublicStorefrontSettings {
  return {
    heroTitle: readString(settings?.heroTitle),
    heroHighlight: readString(settings?.heroHighlight),
    heroSubtitle: readString(settings?.heroSubtitle),
    headerText: readString(settings?.headerText),
    footerText: readString(settings?.footerText),
    footerContactText: readString(settings?.footerContactText),
    primaryColor: readString(settings?.primaryColor),
  };
}

function createShortDescription(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= 150) return compact;

  const slice = compact.slice(0, 150);
  const lastBreak = Math.max(slice.lastIndexOf("."), slice.lastIndexOf(","), slice.lastIndexOf(" "));
  const ending = lastBreak > 80 ? slice.slice(0, lastBreak) : slice;

  return `${ending.trim()}...`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatStockLabel(item: ClientSalesCatalogItem) {
  if (item.inventory.status === "out_of_stock") {
    return item.inventory.allowBackorder ? "Sob encomenda" : "Esgotado";
  }

  if (item.inventory.status === "on_backorder") {
    return "Sob encomenda";
  }

  return "Disponivel";
}

function formatFulfillment(value: ClientSalesCatalogItem["fulfillment"]["mode"]) {
  if (value === "digital") return "Digital";
  if (value === "service") return "Servico";
  if (value === "subscription") return "Assinatura";
  return "Produto fisico";
}

function toStoreCatalogTimestamp(value: string | null | undefined) {
  if (!value) return 0;

  const timestamp = new Date(value).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function readSearchString(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }

  return value?.trim() || null;
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeUuid(value: string | null | undefined) {
  const trimmed = value?.trim();

  return trimmed && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
