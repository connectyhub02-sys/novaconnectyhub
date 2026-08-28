import { appendLeadTrackingParams, getPublicAppUrl } from "@/lib/tracking/tracked-links";

export function buildSalesCatalogProductUrl(productId: string) {
  return `${getPublicAppUrl()}/produto/${encodeURIComponent(productId)}`;
}

export function buildSalesCatalogStoreUrl(storeSlug: string) {
  return `${getPublicAppUrl()}/loja/${encodeURIComponent(storeSlug)}`;
}

export function buildSalesCatalogStoreProductsUrl(storeSlug: string) {
  return `${buildSalesCatalogStoreUrl(storeSlug)}/produtos`;
}

export function buildSalesCatalogStoreCartUrl(storeSlug: string) {
  return `${buildSalesCatalogStoreUrl(storeSlug)}/carrinho`;
}

export function buildSalesCatalogStoreProductUrl(input: {
  storeSlug: string;
  productId: string;
}) {
  return `${buildSalesCatalogStoreUrl(input.storeSlug)}/produto/${encodeURIComponent(input.productId)}`;
}

export function buildLeadAwareSalesCatalogProductUrl(input: {
  productId: string;
  organizationId?: string | null;
  leadId?: string | null;
  leadPhone?: string | null;
  conversationId?: string | null;
  trackingLinkId?: string | null;
}) {
  return appendLeadTrackingParams(buildSalesCatalogProductUrl(input.productId), {
    organizationId: input.organizationId,
    leadId: input.leadId,
    leadPhone: input.leadPhone,
    conversationId: input.conversationId,
    trackingLinkId: input.trackingLinkId,
    trackingSource: "sales_catalog_product",
  });
}

export function buildLeadAwareSalesCatalogStoreProductUrl(input: {
  storeSlug: string;
  productId: string;
  organizationId?: string | null;
  leadId?: string | null;
  leadPhone?: string | null;
  conversationId?: string | null;
  trackingLinkId?: string | null;
}) {
  return appendLeadTrackingParams(buildSalesCatalogStoreProductUrl(input), {
    organizationId: input.organizationId,
    leadId: input.leadId,
    leadPhone: input.leadPhone,
    conversationId: input.conversationId,
    trackingLinkId: input.trackingLinkId,
    trackingSource: "sales_catalog_product",
  });
}

export function buildLeadAwareSalesCatalogStoreProductsUrl(input: {
  storeSlug: string;
  organizationId?: string | null;
  leadId?: string | null;
  leadPhone?: string | null;
  conversationId?: string | null;
  trackingLinkId?: string | null;
}) {
  return appendLeadTrackingParams(buildSalesCatalogStoreProductsUrl(input.storeSlug), {
    organizationId: input.organizationId,
    leadId: input.leadId,
    leadPhone: input.leadPhone,
    conversationId: input.conversationId,
    trackingLinkId: input.trackingLinkId,
    trackingSource: "sales_catalog_store",
  });
}

export function buildLeadAwareSalesCatalogStoreCartUrl(input: {
  storeSlug: string;
  organizationId?: string | null;
  leadId?: string | null;
  leadPhone?: string | null;
  conversationId?: string | null;
  trackingLinkId?: string | null;
}) {
  return appendLeadTrackingParams(buildSalesCatalogStoreCartUrl(input.storeSlug), {
    organizationId: input.organizationId,
    leadId: input.leadId,
    leadPhone: input.leadPhone,
    conversationId: input.conversationId,
    trackingLinkId: input.trackingLinkId,
    trackingSource: "sales_catalog_store",
  });
}

export function buildLeadAwareSalesCatalogStoreUrl(input: {
  storeSlug: string;
  organizationId?: string | null;
  leadId?: string | null;
  leadPhone?: string | null;
  conversationId?: string | null;
  trackingLinkId?: string | null;
}) {
  return appendLeadTrackingParams(buildSalesCatalogStoreUrl(input.storeSlug), {
    organizationId: input.organizationId,
    leadId: input.leadId,
    leadPhone: input.leadPhone,
    conversationId: input.conversationId,
    trackingLinkId: input.trackingLinkId,
    trackingSource: "sales_catalog_store",
  });
}
