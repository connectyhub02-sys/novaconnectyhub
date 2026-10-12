// User-token validation is reserved for the app owner and trusted review grants.
// Customer businesses continue to use the platform's Business Login configuration.
export function resolveInternalMetaLoginConfig(input: {
  isPlatformAdmin: boolean; slug: string | null; planCode: string;
  metadata: Record<string, unknown>; defaultConfigId: string | null;
  organizationId?: string; reviewAccess?: { organizationId: string; active: boolean } | null;
}) {
  const reviewer = input.reviewAccess?.active === true
    && input.reviewAccess.organizationId === input.organizationId;
  const internal = input.isPlatformAdmin && input.slug === "connectyhub-platform-whatsapp"
    && input.planCode === "internal";
  const candidate = reviewer ? input.metadata.review_validation_config_id : input.metadata.internal_validation_config_id;
  return (reviewer || internal) && typeof candidate === "string" && /^\d+$/.test(candidate)
    ? candidate : input.defaultConfigId;
}
