export type MetaReviewSurface = "ads" | "facebook" | "instagram" | "social" | "webhook" | "oauth";
export type MetaReviewSeverity = "required" | "recommended";
export type MetaReviewStatus = "ready" | "warning" | "blocked";

export type MetaReviewCapabilityId =
  | "oauth_permissions"
  | "business_management"
  | "ads_read"
  | "pages_read_engagement"
  | "facebook_publish_ready"
  | "instagram_profile"
  | "instagram_publish_ready"
  | "social_agent_permissions"
  | "page_webhook_subscription"
  | "webhook_runtime";

export type MetaReviewTestResult = {
  id: MetaReviewCapabilityId;
  label: string;
  ok: boolean;
  permission: string;
  permissions: string[];
  status: number | null;
  detail: string;
  endpoint: string;
  surface: MetaReviewSurface;
  severity: MetaReviewSeverity;
  action: string;
};

export type MetaReviewReadinessSummary = {
  status: MetaReviewStatus;
  total: number;
  ready: number;
  warning: number;
  blocked: number;
  generatedAt: string;
};

export type MetaPermissionRequirement = {
  all?: string[];
  any?: string[];
};

type CapabilityDefinition = {
  id: MetaReviewCapabilityId;
  label: string;
  permission: string;
  permissions: string[];
  surface: MetaReviewSurface;
  severity: MetaReviewSeverity;
  action: string;
};

export const metaReviewCapabilities: Record<MetaReviewCapabilityId, CapabilityDefinition> = {
  oauth_permissions: {
    id: "oauth_permissions",
    label: "Permissoes OAuth",
    permission: "app_review",
    permissions: [
      "ads_read",
      "business_management",
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_metadata",
      "pages_manage_posts",
      "pages_messaging",
      "instagram_basic",
      "instagram_manage_comments",
      "instagram_manage_messages",
      "instagram_content_publish",
    ],
    surface: "oauth",
    severity: "required",
    action: "Confirme no App Review e no Login for Business se as permissoes solicitadas foram aprovadas.",
  },
  business_management: {
    id: "business_management",
    label: "Business Manager",
    permission: "business_management",
    permissions: ["business_management"],
    surface: "ads",
    severity: "required",
    action: "Autorize um usuario com acesso ao Business Manager da empresa.",
  },
  ads_read: {
    id: "ads_read",
    label: "Meta Ads Insights",
    permission: "ads_read",
    permissions: ["ads_read", "read_insights"],
    surface: "ads",
    severity: "required",
    action: "Selecione uma conta de anuncios e aprove ads_read/read_insights.",
  },
  pages_read_engagement: {
    id: "pages_read_engagement",
    label: "Facebook Page",
    permission: "pages_read_engagement",
    permissions: ["pages_read_engagement", "pages_show_list"],
    surface: "facebook",
    severity: "required",
    action: "Selecione uma Pagina administrada e aprove pages_read_engagement/pages_show_list.",
  },
  facebook_publish_ready: {
    id: "facebook_publish_ready",
    label: "Publicacao Facebook",
    permission: "pages_manage_posts",
    permissions: ["pages_manage_posts", "pages_read_engagement", "pages_show_list"],
    surface: "facebook",
    severity: "required",
    action: "Aprove pages_manage_posts e garanta token da Pagina selecionada.",
  },
  instagram_profile: {
    id: "instagram_profile",
    label: "Instagram Business",
    permission: "instagram_basic",
    permissions: ["instagram_basic"],
    surface: "instagram",
    severity: "required",
    action: "Conecte uma conta Instagram Business vinculada a Pagina.",
  },
  instagram_publish_ready: {
    id: "instagram_publish_ready",
    label: "Publicacao Instagram",
    permission: "instagram_content_publish / instagram_business_content_publish",
    permissions: ["instagram_basic", "instagram_content_publish", "instagram_business_content_publish"],
    surface: "instagram",
    severity: "required",
    action: "Aprove a permissao de publicacao de conteudo Instagram no App Review.",
  },
  social_agent_permissions: {
    id: "social_agent_permissions",
    label: "Agentes sociais",
    permission: "pages_messaging / instagram_manage_messages",
    permissions: [
      "pages_manage_metadata",
      "pages_messaging",
      "instagram_manage_comments",
      "instagram_manage_messages",
    ],
    surface: "social",
    severity: "required",
    action: "Aprove mensagens, comentarios e metadata para liberar Direct/Messenger e comentarios.",
  },
  page_webhook_subscription: {
    id: "page_webhook_subscription",
    label: "Subscription da Pagina",
    permission: "pages_manage_metadata",
    permissions: ["pages_manage_metadata"],
    surface: "webhook",
    severity: "recommended",
    action: "Assine a Pagina no App Dashboard ou via Graph API quando a Meta liberar as permissoes.",
  },
  webhook_runtime: {
    id: "webhook_runtime",
    label: "Webhook runtime",
    permission: "META_WEBHOOK_VERIFY_TOKEN",
    permissions: ["META_WEBHOOK_VERIFY_TOKEN", "META_APP_SECRET"],
    surface: "webhook",
    severity: "required",
    action: "Configure verify token, app secret e URL publica /api/webhooks/meta.",
  },
};

export function createMetaReviewResult(input: {
  id: MetaReviewCapabilityId;
  ok: boolean;
  status?: number | null;
  detail: string;
  endpoint: string;
}): MetaReviewTestResult {
  const definition = metaReviewCapabilities[input.id];

  return {
    ...definition,
    ok: input.ok,
    status: input.status ?? null,
    detail: input.detail,
    endpoint: input.endpoint,
  };
}

export function summarizeMetaReviewReadiness(
  results: Pick<MetaReviewTestResult, "ok" | "severity">[],
  generatedAt = new Date().toISOString(),
): MetaReviewReadinessSummary {
  const blocked = results.filter((result) => !result.ok && result.severity === "required").length;
  const warning = results.filter((result) => !result.ok && result.severity === "recommended").length;
  const ready = results.filter((result) => result.ok).length;

  return {
    status: blocked > 0 ? "blocked" : warning > 0 ? "warning" : "ready",
    total: results.length,
    ready,
    warning,
    blocked,
    generatedAt,
  };
}

export function hasMetaPermissionSet(
  grantedPermissions: Iterable<string>,
  requirement: MetaPermissionRequirement,
) {
  const granted = new Set(Array.from(grantedPermissions).map((permission) => permission.trim()).filter(Boolean));
  const allReady = (requirement.all ?? []).every((permission) => granted.has(permission));
  const any = requirement.any ?? [];
  const anyReady = any.length === 0 || any.some((permission) => granted.has(permission));

  return allReady && anyReady;
}
