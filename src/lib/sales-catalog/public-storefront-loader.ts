import type {
  PublicStorefrontBranding,
  PublicStorefrontProduct,
  PublicStorefrontSettings,
  PublicStorefrontTrackingParams,
} from "@/components/checkout/public-storefront";
import { cookies } from "next/headers";
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
import { resolveLeadPersonalName } from "@/lib/whatsapp/lead-names";

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

type StorefrontLeadRow = {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  metadata: JsonRecord | null;
};

type StorefrontConversationRow = {
  id: string;
  lead_id: string | null;
  metadata: JsonRecord | null;
};

type StorefrontLeadIdentityRow = {
  id: string;
  lead_id: string | null;
  conversation_id: string | null;
  metadata: JsonRecord | null;
};

type StorefrontCommerceSessionRow = {
  id: string;
  lead_id: string | null;
  conversation_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  metadata: JsonRecord | null;
};

export type PublicStorefrontBrowserTrackingContext = {
  visitorId: string | null;
  sessionId: string | null;
};

export type PublicStorefrontLeadContext = {
  leadId: string | null;
  leadName: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  conversationId: string | null;
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
  browserTracking?: PublicStorefrontBrowserTrackingContext | null;
}): Promise<PublicStorefrontPageData | null> {
  const client = createServiceClient();
  const organization = await loadPublicStorefrontOrganization(input.storeSlug);

  if (!organization) return null;

  const publicSlug = organization.slug ?? organization.id;
  const query = input.query ?? {};
  const leadId = readSearchString(query.lead_id);
  const leadPhone = readSearchString(query.lead_phone);
  const conversationId = readSearchString(query.conversation_id);
  const agentId = readSearchString(query.agent_id);
  const trackingLinkId = readSearchString(query.tracking_link_id);
  const leadContext = await loadPublicStorefrontLeadContext(client, {
    organizationId: organization.id,
    leadId,
    leadPhone,
    conversationId,
    trackingLinkId,
    visitorId: input.browserTracking?.visitorId ?? null,
    sessionId: input.browserTracking?.sessionId ?? null,
  });
  const tracking: PublicStorefrontTrackingParams = {
    organizationId: organization.id,
    leadId: leadContext.leadId ?? leadId,
    leadName: leadContext.leadName,
    leadPhone: leadContext.leadPhone ?? leadPhone,
    leadEmail: leadContext.leadEmail,
    conversationId: leadContext.conversationId ?? conversationId,
    agentId,
    trackingLinkId,
  };
  const [catalogSettings, whatsapp] = await Promise.all([
    getOrganizationSalesCatalogSettings(client, organization.id),
    loadPublicStorefrontWhatsapp(client, organization.id, agentId),
  ]);
  const products = await loadStoreProducts(client, {
    storeSlug: publicSlug,
    organizationId: organization.id,
    leadId: tracking.leadId,
    leadPhone: tracking.leadPhone,
    conversationId: tracking.conversationId,
    agentId: tracking.agentId,
    trackingLinkId,
  });

  const storefront = resolvePublicStorefrontSettings(catalogSettings?.storefront ?? null);

  return {
    organizationId: organization.id,
    storeSlug: publicSlug,
    branding: resolvePublicStorefrontBranding(organization, whatsapp, storefront),
    storefront,
    products,
    tracking,
    publicTrackingContext: buildStorePublicTrackingContext({
      ...tracking,
      leadName: tracking.leadName,
      leadEmail: tracking.leadEmail,
    }),
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
  leadName?: string | null;
  leadPhone: string | null;
  leadEmail?: string | null;
  conversationId: string | null;
  agentId: string | null;
  trackingLinkId: string | null;
}): ConnectyPublicTrackingContext {
  const secret = process.env.TRACKING_PUBLIC_TOKEN_SECRET;

  return {
    scope: "organization",
    organization_id: input.organizationId,
    tracking_token: secret ? createOrganizationTrackingToken(input.organizationId, secret) : null,
    lead_id: input.leadId,
    lead_name: input.leadName ?? null,
    lead_phone: input.leadPhone,
    lead_email: input.leadEmail ?? null,
    conversation_id: input.conversationId,
    agent_id: input.agentId,
    tracking_link_id: input.trackingLinkId,
    tracking_source: "sales_catalog_store",
  };
}

export async function loadPublicStorefrontLeadContext(
  client: ReturnType<typeof createServiceClient>,
  input: {
    organizationId: string;
    leadId: string | null;
    leadPhone: string | null;
    conversationId: string | null;
    trackingLinkId?: string | null;
    visitorId?: string | null;
    sessionId?: string | null;
  },
): Promise<PublicStorefrontLeadContext> {
  const requestedLeadId = normalizeUuid(input.leadId);
  const requestedConversationId = normalizeUuid(input.conversationId);
  const requestedTrackingLinkId = normalizeUuid(input.trackingLinkId);
  const visitorId = readString(input.visitorId);
  const sessionId = readString(input.sessionId);
  let conversationId: string | null = null;
  let leadId: string | null = requestedLeadId;
  let leadName: string | null = null;
  let leadPhone: string | null = normalizeWhatsappPhone(input.leadPhone);
  let leadEmail: string | null = null;
  let lead: StorefrontLeadRow | null = null;

  if (requestedConversationId) {
    const conversation = await loadPublicStorefrontConversation(client, input.organizationId, requestedConversationId);
    const merged = mergePublicStorefrontConversationContext({
      conversation,
      leadId,
      leadName,
      leadPhone,
      leadEmail,
      conversationId,
    });

    leadId = merged.leadId;
    leadName = merged.leadName;
    leadPhone = merged.leadPhone;
    leadEmail = merged.leadEmail;
    conversationId = merged.conversationId;
  }

  const restoredIdentity = await findPublicStorefrontLeadIdentity(client, {
    organizationId: input.organizationId,
    visitorId,
    sessionId,
    trackingLinkId: requestedTrackingLinkId,
  }).catch(() => null);
  const restoredSession = await findPublicStorefrontCommerceSession(client, {
    organizationId: input.organizationId,
    visitorId,
    sessionId,
  }).catch(() => null);
  const restoredIdentityMetadata = readRecord(restoredIdentity?.metadata);
  const restoredSessionMetadata = readRecord(restoredSession?.metadata);

  leadId = leadId ?? normalizeUuid(restoredIdentity?.lead_id) ?? normalizeUuid(restoredSession?.lead_id);
  conversationId = conversationId
    ?? normalizeUuid(restoredIdentity?.conversation_id)
    ?? normalizeUuid(restoredSession?.conversation_id);
  leadName = leadName
    ?? readString(restoredSession?.lead_name)
    ?? resolveLeadPersonalName({ metadata: restoredIdentityMetadata })
    ?? resolveLeadPersonalName({ metadata: restoredSessionMetadata });
  leadPhone = leadPhone
    ?? normalizeWhatsappPhone(readString(restoredIdentityMetadata.lead_phone))
    ?? normalizeWhatsappPhone(readString(restoredSession?.lead_phone))
    ?? normalizeWhatsappPhone(readString(restoredSessionMetadata.lead_phone));
  leadEmail = leadEmail
    ?? resolveLeadEmail(restoredIdentityMetadata)
    ?? resolveLeadEmail(restoredSessionMetadata);

  if (conversationId && conversationId !== requestedConversationId) {
    const conversation = await loadPublicStorefrontConversation(client, input.organizationId, conversationId);
    const merged = mergePublicStorefrontConversationContext({
      conversation,
      leadId,
      leadName,
      leadPhone,
      leadEmail,
      conversationId,
    });

    leadId = merged.leadId;
    leadName = merged.leadName;
    leadPhone = merged.leadPhone;
    leadEmail = merged.leadEmail;
    conversationId = merged.conversationId;
  }

  if (leadId) {
    lead = await loadPublicStorefrontLead(client, input.organizationId, leadId);
  }

  if (!lead && leadPhone) {
    lead = await loadPublicStorefrontLeadByPhone(client, input.organizationId, leadPhone);
  }

  if (lead) {
    leadId = lead.id;
    leadName = resolveLeadPersonalName({ displayName: lead.display_name, metadata: lead.metadata }) ?? leadName;
    leadPhone = normalizeWhatsappPhone(lead.phone_number) ?? leadPhone;
    leadEmail = resolveLeadEmail(readRecord(lead.metadata)) ?? leadEmail;
  }

  return {
    leadId,
    leadName,
    leadPhone,
    leadEmail,
    conversationId,
  };
}

export async function readPublicStorefrontBrowserTrackingContext(): Promise<PublicStorefrontBrowserTrackingContext> {
  const cookieStore = await cookies();

  return {
    visitorId: readCookieString(cookieStore.get("connecty_visitor_id")?.value),
    sessionId: readCookieString(cookieStore.get("connecty_session_id")?.value),
  };
}

async function loadPublicStorefrontConversation(
  client: ReturnType<typeof createServiceClient>,
  organizationId: string,
  conversationId: string,
) {
  const { data } = await client
    .from("conversations")
    .select("id, lead_id, metadata")
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .maybeSingle<StorefrontConversationRow>();

  return data ?? null;
}

function mergePublicStorefrontConversationContext(input: {
  conversation: StorefrontConversationRow | null;
  leadId: string | null;
  leadName: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  conversationId: string | null;
}) {
  if (!input.conversation) {
    return input;
  }

  const conversationMetadata = readRecord(input.conversation.metadata);

  return {
    conversation: input.conversation,
    leadId: input.leadId ?? normalizeUuid(input.conversation.lead_id),
    leadName: input.leadName ?? resolveLeadPersonalName({ metadata: conversationMetadata }),
    leadPhone: input.leadPhone
      ?? normalizeWhatsappPhone(readString(conversationMetadata.lead_phone))
      ?? normalizeWhatsappPhone(readString(conversationMetadata.phone_number))
      ?? normalizeWhatsappPhone(readString(conversationMetadata.customer_phone)),
    leadEmail: input.leadEmail ?? resolveLeadEmail(conversationMetadata),
    conversationId: input.conversation.id,
  };
}

async function loadPublicStorefrontLead(
  client: ReturnType<typeof createServiceClient>,
  organizationId: string,
  leadId: string,
) {
  const { data } = await client
    .from("leads")
    .select("id, display_name, phone_number, metadata")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle<StorefrontLeadRow>();

  return data ?? null;
}

async function loadPublicStorefrontLeadByPhone(
  client: ReturnType<typeof createServiceClient>,
  organizationId: string,
  leadPhone: string,
) {
  const { data } = await client
    .from("leads")
    .select("id, display_name, phone_number, metadata")
    .eq("organization_id", organizationId)
    .eq("phone_number", leadPhone)
    .limit(1)
    .maybeSingle<StorefrontLeadRow>();

  return data ?? null;
}

async function findPublicStorefrontLeadIdentity(
  client: ReturnType<typeof createServiceClient>,
  input: {
    organizationId: string;
    visitorId: string | null;
    sessionId: string | null;
    trackingLinkId: string | null;
  },
) {
  const identities = [
    input.visitorId ? { identity_type: "visitor_cookie", identity_value: input.visitorId } : null,
    input.sessionId ? { identity_type: "session_cookie", identity_value: input.sessionId } : null,
    input.trackingLinkId ? { identity_type: "tracking_link", identity_value: input.trackingLinkId } : null,
  ].filter((row): row is { identity_type: string; identity_value: string } => Boolean(row));

  if (identities.length === 0) {
    return null;
  }

  const filters = identities
    .map((row) => `and(identity_type.eq.${row.identity_type},identity_value.eq.${escapeSupabaseOrValue(row.identity_value)})`)
    .join(",");
  const { data } = await client
    .from("lead_web_identities")
    .select("id, lead_id, conversation_id, metadata")
    .eq("organization_id", input.organizationId)
    .or(filters)
    .order("confidence", { ascending: false })
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle<StorefrontLeadIdentityRow>();

  return data?.lead_id || data?.conversation_id ? data : null;
}

async function findPublicStorefrontCommerceSession(
  client: ReturnType<typeof createServiceClient>,
  input: {
    organizationId: string;
    visitorId: string | null;
    sessionId: string | null;
  },
) {
  if (input.sessionId) {
    const { data } = await client
      .from("commerce_sessions")
      .select("id, lead_id, conversation_id, lead_name, lead_phone, metadata")
      .eq("organization_id", input.organizationId)
      .eq("session_cookie_id", input.sessionId)
      .eq("status", "active")
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle<StorefrontCommerceSessionRow>();

    if (data) return data;
  }

  if (!input.visitorId) {
    return null;
  }

  const { data } = await client
    .from("commerce_sessions")
    .select("id, lead_id, conversation_id, lead_name, lead_phone, metadata")
    .eq("organization_id", input.organizationId)
    .eq("visitor_cookie_id", input.visitorId)
    .eq("status", "active")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle<StorefrontCommerceSessionRow>();

  return data ?? null;
}

async function loadPublicStorefrontWhatsapp(
  client: ReturnType<typeof createServiceClient>,
  organizationId: string,
  agentId: string | null,
) {
  if (agentId) {
    const { data } = await client
      .from("whatsapp_instances")
      .select("id, phone_number, display_name, status")
      .eq("organization_id", organizationId)
      .eq("status", "connected")
      .not("phone_number", "is", null)
      .contains("metadata", { agent_id: agentId })
      .order("connected_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<StorefrontWhatsappRow>();

    if (data) {
      return data;
    }
  }

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

export async function loadStoreProducts(
  client: ReturnType<typeof createServiceClient>,
  input: {
    storeSlug: string;
    organizationId: string;
    leadId: string | null;
    leadPhone: string | null;
    conversationId: string | null;
    agentId: string | null;
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

export function mapStorefrontProduct(
  item: ClientSalesCatalogItem,
  input: {
    storeSlug: string;
    organizationId: string;
    leadId: string | null;
    leadPhone: string | null;
    conversationId: string | null;
    agentId: string | null;
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
      agentId: input.agentId,
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

function resolveLeadEmail(metadata: JsonRecord | null) {
  const record = readRecord(metadata);

  return normalizeEmail(readString(record.email))
    ?? normalizeEmail(readString(record.customer_email))
    ?? normalizeEmail(readString(record.lead_email))
    ?? normalizeEmail(readString(record.checkout_email))
    ?? normalizeEmail(readString(record.contact_email));
}

function normalizeEmail(value: string | null) {
  const normalized = value?.replace(/\s+/g, "").trim().toLowerCase().slice(0, 160);

  return normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function readCookieString(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeWhatsappPhone(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";

  return digits.length >= 10 ? digits : null;
}

function escapeSupabaseOrValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/\)/g, "\\)");
}

function normalizeUuid(value: string | null | undefined) {
  const trimmed = value?.trim();

  return trimmed && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}
