import { getPublicTrackingContextSignature, type ConnectyPublicTrackingContext } from "@/lib/tracking/public-context";

// The store endpoint is always organization-scoped. A platform bridge can
// briefly change the tracking label without changing the actual conversation.
export function getCommerceAgentTrackingSignature(context: ConnectyPublicTrackingContext | null) {
  return getPublicTrackingContextSignature(context?.organization_id ? { ...context, scope: "organization" } : context);
}
