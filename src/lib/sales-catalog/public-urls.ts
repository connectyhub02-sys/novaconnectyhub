import { appendLeadTrackingParams, getPublicAppUrl } from "@/lib/tracking/tracked-links";

export function buildSalesCatalogProductUrl(productId: string) {
  return `${getPublicAppUrl()}/produto/${encodeURIComponent(productId)}`;
}

export function buildSalesCatalogStoreUrl(storeSlug: string) {
  return `${getPublicAppUrl()}/loja/${encodeURIComponent(storeSlug)}`;
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
