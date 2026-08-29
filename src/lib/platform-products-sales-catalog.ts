import "server-only";

import {
  emptySalesCatalogProductPageContent,
  getSalesCatalogReadiness,
  type ClientSalesCatalogItem,
  type SalesCatalogSalesDestination,
} from "@/lib/sales-catalog/shared";
import {
  isPlatformProductCommissionEligible,
  resolvePlatformProductCommercialFlow,
  type PlatformProduct,
} from "@/lib/platform-products";

export function mapPlatformProductToClientSalesCatalogItem(
  product: PlatformProduct,
  companyId = "connectyhub-platform",
): ClientSalesCatalogItem {
  const description = product.commercialDescription || product.shortDescription || "";

  return {
    id: product.id,
    companyId,
    title: product.name,
    description,
    category: product.category,
    price: product.price,
    currency: product.currency,
    status: product.status === "archived" ? "archived" : product.status === "active" ? "active" : "draft",
    tag: product.agentTag,
    highlightLabel: product.highlightLabel,
    storeFeatured: product.marketplaceStatus === "featured",
    storeFeaturedRank: null,
    storeFeaturedAt: null,
    media: product.media,
    attributes: product.attributes,
    inventory: product.inventory,
    skus: product.skus,
    offer: product.offer,
    fulfillment: product.fulfillment,
    shipping: product.shipping,
    pageContent: emptySalesCatalogProductPageContent(),
    productOriginType: product.ownerType === "external_provider" ? "external_provider" : product.ownerType === "connectyhub" ? "connectyhub" : "client",
    commercialFlowType: resolvePlatformProductCommercialFlow(product),
    revenueOwnerType: product.revenueOwnerType,
    commissionPolicyType: product.commissionPolicyType,
    commissionEligible: isPlatformProductCommissionEligible(product),
    platformProductId: product.id,
    platformProductCode: product.productCode,
    platformProductCommissionPercentage: product.commissionPercentage,
    platformProductCommissionReleaseDays: product.commissionReleaseDays,
    platformProductAgentPrompt: product.agentPrompt,
    salesDestination: resolvePlatformProductSalesDestination(product),
    productUrl: readProductUrl(product),
    externalLinkButtonId: null,
    externalLinkButtonLabel: product.offer.callToAction,
    externalLinkButtonTag: null,
    externalLinkButtonTrackingUrl: readProductUrl(product),
    assignedAgentIds: [],
    assignedWhatsappInstanceIds: [],
    sourceAgentId: null,
    sourceWhatsappInstanceId: null,
    whatsappExportTargets: [],
    source: "manual",
    whatsappCatalogId: null,
    whatsappCatalogJid: null,
    whatsappCatalogHidden: false,
    whatsappCatalogStatus: null,
    whatsappCatalogSyncedAt: null,
    readiness: getSalesCatalogReadiness({ description, media: product.media }),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function resolvePlatformProductSalesDestination(product: PlatformProduct): SalesCatalogSalesDestination {
  if (product.ownerType === "external_provider") return "external_site";
  if (product.salesChannelType === "direct") return "manual_handoff";
  return "connectyhub_checkout";
}

function readProductUrl(product: PlatformProduct) {
  return readUrl(product.metadata.public_url)
    ?? readUrl(product.metadata.product_url)
    ?? readUrl(product.metadata.checkout_url)
    ?? readUrl(product.metadata.external_url);
}

function readUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
