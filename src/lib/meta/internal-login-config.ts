// A user-token configuration is reserved for the app owner's own portfolio.
// Customer businesses continue to use the platform's Business Login configuration.
export function resolveInternalMetaLoginConfig(input: {
  isPlatformAdmin: boolean; slug: string | null; planCode: string;
  metadata: Record<string, unknown>; defaultConfigId: string | null;
}) {
  const candidate = input.metadata.internal_validation_config_id;
  return input.isPlatformAdmin && input.slug === "connectyhub-platform-whatsapp"
    && input.planCode === "internal" && typeof candidate === "string" && /^\d+$/.test(candidate)
    ? candidate : input.defaultConfigId;
}
