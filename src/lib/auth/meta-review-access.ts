/** Provisioned only by the service-role Auth API, never user_metadata. */
export function readMetaReviewAccess(user: { app_metadata?: Record<string, unknown> }, now = Date.now()) {
  const value = user.app_metadata?.meta_review;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const organizationId = record.organization_id;
  const expiresAt = typeof record.expires_at === "string" ? Date.parse(record.expires_at) : NaN;
  if (typeof organizationId !== "string" || !/^[a-f0-9-]{36}$/i.test(organizationId)) return null;
  return { organizationId, active: Number.isFinite(expiresAt) && expiresAt > now };
}

export function isMetaReviewPath(path: string) {
  return ["/dashboard/integracoes", "/dashboard/chat-meta", "/api/dashboard/integrations/meta/connect",
    "/api/dashboard/integrations/meta/callback", "/api/dashboard/integrations/meta/whatsapp",
    "/api/dashboard/integrations/meta/whatsapp/signup", "/dashboard/meta/revisao",
    "/api/dashboard/meta-review-agent", "/api/dashboard/agents/channels",
    "/api/dashboard/social-automations", "/api/dashboard/meta-social",
    "/api/dashboard/social-approvals", "/api/dashboard/meta-ads-leads", "/api/dashboard/meta-pixel"].includes(path);
}
