import type {
  PublicStorefrontBranding,
  PublicStorefrontProduct,
  PublicStorefrontSettings,
  PublicStorefrontTrackingParams,
} from "@/components/checkout/public-storefront";
import { getOrganizationSalesCatalogSettings, mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";
import { buildLeadAwareSalesCatalogStoreProductUrl } from "@/lib/sales-catalog/public-urls";
import {
  isSalesCatalogDisplayableProduct,
  normalizeSalesCatalogStorefrontFontPreset,
  type ClientSalesCatalogItem,
} from "@/lib/sales-catalog/shared";
import { createServiceClient } from "@/lib/supabase/service";
import { createOrganizationTrackingToken } from "@/lib/tracking/organization-attribution";
import type { ConnectyPublicTrackingContext } from "@/lib/tracking/public-context";

type JsonRecord = Record<string, unknown>;

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

type StorefrontWhatsappRow = {
  id: string;
  phone_number: string | null;
  display_name: string | null;
  status: string | null;
};

export type PublicStorefrontPageData = {
  organizationId: string;
  storeSlug: string;
  branding: PublicStorefrontBranding;
  storefront: PublicStorefrontSettings;
  products: PublicStorefrontProduct[];
  tracking: PublicStorefrontTrackingParams;
  publicTrackingContext: ConnectyPublicTrackingContext;
};

export async function loadPublicStorefrontPageData(input: {
  storeSlug: string;
  query?: Record<string, string | string[] | undefined>;
}): Promise<PublicStorefrontPageData | null> {
  const client = createServiceClient();
  const organization = await loadPublicStorefrontOrganization(input.storeSlug);

  if (!organization) return null;

  const publicSlug = organization.slug ?? organization.id;
  const query = input.query ?? {};
  const leadId = readSearchString(query.lead_id);
  const leadPhone = readSearchString(query.lead_phone);
  const conversationId = readSearchString(query.conversation_id);
  const trackingLinkId = readSearchString(query.tracking_link_id);
  const products = await loadStoreProducts(client, {
    storeSlug: publicSlug,
    organizationId: organization.id,
    leadId,
    leadPhone,
    conversationId,
    trackingLinkId,
  });
  const [catalogSettings, whatsapp] = await Promise.all([
    getOrganizationSalesCatalogSettings(client, organization.id),
    loadPublicStorefrontWhatsapp(client, organization.id),
  ]);
  const tracking: PublicStorefrontTrackingParams = {
    organizationId: organization.id,
    leadId,
    leadPhone,
    conversationId,
    trackingLinkId,
  };

  const storefront = resolvePublicStorefrontSettings(catalogSettings?.storefront ?? null);

  return {
    organizationId: organization.id,
    storeSlug: publicSlug,
    branding: resolvePublicStorefrontBranding(organization, whatsapp, storefront),
    storefront,
    products,
    tracking,
    publicTrackingContext: buildStorePublicTrackingContext(tracking),
  };
}

export async function loadPublicStorefrontOrganization(storeSlug: string) {
  const client = createServiceClient();
  const decoded = decodeURIComponent(storeSlug).trim();
  const query = client
    .from("organizations")
    .select("id, name, slug, metadata");

  const { data } = normalizeUuid(decoded)
    ? await query.eq("id", decoded).maybeSingle<OrganizationRow>()
    : await query.eq("slug", decoded).maybeSingle<OrganizationRow>();

  return data ?? null;
}

export function resolvePublicStorefrontBranding(
  organization: OrganizationRow,
  whatsapp?: StorefrontWhatsappRow | null,
  storefront?: PublicStorefrontSettings | null,
): PublicStorefrontBranding {
  const metadata = readRecord(organization.metadata);
  const logoUrl = readString(metadata.brand_logo_url);
  const displayName = readString(storefront?.publicDisplayName)
    ?? readString(metadata.public_display_name)
    ?? organization.name;

  return {
    displayName,
    logoUrl,
    logoAlt: readString(metadata.brand_logo_alt) ?? displayName,
    whatsappHref: buildStoreWhatsappHref({
      organizationName: displayName,
      phoneNumber: whatsapp?.phone_number ?? null,
    }),
  };
}

export function resolvePublicStorefrontSettings(settings: PublicStorefrontSettings | null): PublicStorefrontSettings {
  return {
    publicDisplayName: readString(settings?.publicDisplayName),
    heroTitle: readString(settings?.heroTitle),
    heroHighlight: readString(settings?.heroHighlight),
    heroSubtitle: readString(settings?.heroSubtitle),
    headerText: readString(settings?.headerText),
    footerText: readString(settings?.footerText),
    footerContactText: readString(settings?.footerContactText),
    primaryColor: readString(settings?.primaryColor),
    textColor: readString(settings?.textColor),
    buttonColor: readString(settings?.buttonColor),
    buttonTextColor: readString(settings?.buttonTextColor),
    cardTextColor: readString(settings?.cardTextColor),
    offerTextColor: readString(settings?.offerTextColor),
    heroTitleColor: readString(settings?.heroTitleColor),
    heroHighlightColor: readString(settings?.heroHighlightColor),
    categoryStripColor: readString(settings?.categoryStripColor),
    categoryIconColor: readString(settings?.categoryIconColor),
    bodyFont: normalizeSalesCatalogStorefrontFontPreset(settings?.bodyFont),
    headingFont: normalizeSalesCatalogStorefrontFontPreset(settings?.headingFont),
    homeCategoryNames: Array.isArray(settings?.homeCategoryNames) ? settings.homeCategoryNames : [],
    categoryIcons: settings?.categoryIcons ?? {},
  };
}

export function buildStorePublicTrackingContext(input: {
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

async function loadPublicStorefrontWhatsapp(
  client: ReturnType<typeof createServiceClient>,
  organizationId: string,
) {
  const { data } = await client
    .from("whatsapp_instances")
    .select("id, phone_number, display_name, status")
    .eq("organization_id", organizationId)
    .eq("status", "connected")
    .not("phone_number", "is", null)
    .order("connected_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle<StorefrontWhatsappRow>();

  return data ?? null;
}

function buildStoreWhatsappHref(input: { organizationName: string; phoneNumber: string | null }) {
  const phone = normalizeWhatsappPhone(input.phoneNumber);

  if (!phone) return null;

  const message = [
    `Ola, vim da loja ${input.organizationName}.`,
    "Quero falar com o atendimento pelo WhatsApp.",
  ].join(" ");

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

async function loadStoreProducts(
  client: ReturnType<typeof createServiceClient>,
  input: {
    storeSlug: string;
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
    .limit(160)
    .returns<SalesCatalogMemoryRow[]>();

  const items = ((data ?? []) as SalesCatalogMemoryRow[])
    .map(mapSalesCatalogItem)
    .filter((item) => item.status === "active" && isSalesCatalogDisplayableProduct(item))
    .sort(compareStoreCatalogItems);

  return items.map((item) => mapStorefrontProduct(item, input, item.storeFeatured));
}

function mapStorefrontProduct(
  item: ClientSalesCatalogItem,
  input: {
    storeSlug: string;
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
    highlightLabel: isStoreFeatured ? item.highlightLabel ?? "Destaque" : item.highlightLabel ?? (compareAtLabel ? "Oferta" : null),
    isFeatured: isStoreFeatured,
    canCheckout,
    productUrl: buildLeadAwareSalesCatalogStoreProductUrl({
      storeSlug: input.storeSlug,
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

  return "Disponível";
}

function formatFulfillment(value: ClientSalesCatalogItem["fulfillment"]["mode"]) {
  if (value === "digital") return "Digital";
  if (value === "service") return "Serviço";
  if (value === "subscription") return "Assinatura";
  return "Produto físico";
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

function normalizeWhatsappPhone(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";

  return digits.length >= 10 ? digits : null;
}

function normalizeUuid(value: string | null | undefined) {
  const trimmed = value?.trim();

  return trimmed && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}
