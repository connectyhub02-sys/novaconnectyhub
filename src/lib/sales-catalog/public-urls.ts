import { appendLeadTrackingParams, getPublicAppUrl } from "@/lib/tracking/tracked-links";

export function buildSalesCatalogProductUrl(productId: string) {
  return `${getPublicAppUrl()}/produto/${encodeURIComponent(productId)}`;
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
