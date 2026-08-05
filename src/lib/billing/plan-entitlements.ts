export type PlanFeatureEntitlement = {
  allowed: boolean;
  featureCode: PlanFeatureCode;
  minimumPlanCode: CommercialPlanCode;
  minimumPlanLabel: string;
  requiredPlanCodes: string[];
  reason: "allowed" | "trial_active" | "plan_required" | "billing_blocked";
  title: string;
  description: string;
  upgradeLabel: string;
};

export type CommercialPlanCode = "trial" | "starter" | "pro" | "scale";

export type PlanFeatureCode =
  | "whatsapp_core"
  | "whatsapp_campaigns"
  | "whatsapp_groups_channels"
  | "meta_social_inbox"
  | "meta_comment_to_direct"
  | "meta_organic_insights"
  | "meta_ads_analytics"
  | "google_ads_analytics"
  | "ai_traffic_manager"
  | "connectyhub_api";

export type BillingAccessStateLike =
  | "trial_active"
  | "trial_low_credits"
  | "trial_no_credits"
  | "trial_expired"
  | "paid_active"
  | "paid_no_credits"
  | "paid_expired"
  | "inactive";

export type PlanEntitlementInput = {
  planCode?: string | null;
  organizationStatus?: string | null;
  billingState?: BillingAccessStateLike | null;
  isPlatformAdmin?: boolean | null;
};

export type PlanFeatureDefinition = {
  code: PlanFeatureCode;
  name: string;
  minimumPlanCode: Exclude<CommercialPlanCode, "trial">;
  minimumPlanLabel: string;
  allowedTitle: string;
  allowedDescription: string;
  blockedTitle: string;
  blockedDescription: string;
};

const paidPlanRank: Record<Exclude<CommercialPlanCode, "trial">, number> = {
  starter: 1,
  pro: 2,
  scale: 3,
};

export const planFeatureDefinitions: Record<PlanFeatureCode, PlanFeatureDefinition> = {
  whatsapp_core: {
    code: "whatsapp_core",
    name: "Atendimento WhatsApp",
    minimumPlanCode: "starter",
    minimumPlanLabel: "Start",
    allowedTitle: "WhatsApp liberado",
    allowedDescription: "Atendimento por WhatsApp, agente IA, leads e conversas ficam disponiveis neste plano.",
    blockedTitle: "Recurso disponivel a partir do Start",
    blockedDescription: "Atendimento WhatsApp exige um plano ativo apos o teste gratis.",
  },
  whatsapp_campaigns: {
    code: "whatsapp_campaigns",
    name: "Campanhas WhatsApp",
    minimumPlanCode: "starter",
    minimumPlanLabel: "Start",
    allowedTitle: "Campanhas WhatsApp liberadas",
    allowedDescription: "Campanhas e automacoes ligadas ao WhatsApp ficam disponiveis neste plano.",
    blockedTitle: "Campanhas WhatsApp exigem plano Start",
    blockedDescription: "Campanhas por WhatsApp ficam liberadas no Start, Pro e Scale apos o teste gratis.",
  },
  whatsapp_groups_channels: {
    code: "whatsapp_groups_channels",
    name: "Grupos e canais WhatsApp",
    minimumPlanCode: "starter",
    minimumPlanLabel: "Start",
    allowedTitle: "Grupos e canais WhatsApp liberados",
    allowedDescription: "Operacao de grupos, canais, respostas e campanhas de WhatsApp fica disponivel neste plano.",
    blockedTitle: "Grupos e canais exigem plano Start",
    blockedDescription: "Grupos e canais de WhatsApp ficam liberados no Start, Pro e Scale apos o teste gratis.",
  },
  meta_social_inbox: {
    code: "meta_social_inbox",
    name: "Instagram Direct e Messenger",
    minimumPlanCode: "pro",
    minimumPlanLabel: "Pro",
    allowedTitle: "Meta Social liberado",
    allowedDescription: "Instagram Direct e Facebook Messenger estao disponiveis neste plano.",
    blockedTitle: "Recurso disponivel nos planos Pro e Scale",
    blockedDescription: "Atendimento automatico no Instagram Direct e Facebook Messenger fica bloqueado no plano Start apos o teste gratis.",
  },
  meta_comment_to_direct: {
    code: "meta_comment_to_direct",
    name: "Comentario para Direct",
    minimumPlanCode: "pro",
    minimumPlanLabel: "Pro",
    allowedTitle: "Comentario para Direct liberado",
    allowedDescription: "Campanhas que respondem comentario e enviam Direct/Messenger ficam disponiveis neste plano.",
    blockedTitle: "Comentario para Direct exige plano Pro",
    blockedDescription: "Automacoes de comentario para Direct usam canais Meta e ficam liberadas nos planos Pro e Scale.",
  },
  meta_organic_insights: {
    code: "meta_organic_insights",
    name: "Organico Meta",
    minimumPlanCode: "pro",
    minimumPlanLabel: "Pro",
    allowedTitle: "Organico Meta liberado",
    allowedDescription: "Publicacoes, posts, leitura organica e preparacao de campanhas Meta ficam disponiveis neste plano.",
    blockedTitle: "Organico Meta exige plano Pro",
    blockedDescription: "Recursos organicos de Instagram e Facebook ficam liberados nos planos Pro e Scale.",
  },
  meta_ads_analytics: {
    code: "meta_ads_analytics",
    name: "Meta Ads e analise de trafego",
    minimumPlanCode: "scale",
    minimumPlanLabel: "Scale",
    allowedTitle: "Meta Ads liberado",
    allowedDescription: "Analise de campanhas, pixel, anuncios e recomendacoes de trafego Meta ficam disponiveis neste plano.",
    blockedTitle: "Meta Ads avancado exige plano Scale",
    blockedDescription: "Analise de trafego pago Meta e preparacao do gestor de trafego IA ficam liberadas no Scale.",
  },
  google_ads_analytics: {
    code: "google_ads_analytics",
    name: "Google Ads e analise de trafego",
    minimumPlanCode: "scale",
    minimumPlanLabel: "Scale",
    allowedTitle: "Google Ads liberado",
    allowedDescription: "Analise de campanhas, tags, conversoes e recomendacoes de trafego Google ficam disponiveis neste plano.",
    blockedTitle: "Google Ads avancado exige plano Scale",
    blockedDescription: "Analise de trafego pago Google e preparacao do gestor de trafego IA ficam liberadas no Scale.",
  },
  ai_traffic_manager: {
    code: "ai_traffic_manager",
    name: "Gestor de trafego IA",
    minimumPlanCode: "scale",
    minimumPlanLabel: "Scale",
    allowedTitle: "Gestor de trafego IA liberado",
    allowedDescription: "Diagnosticos e recomendacoes com IA para trafego pago ficam disponiveis neste plano.",
    blockedTitle: "Gestor de trafego IA exige plano Scale",
    blockedDescription: "Automacoes avancadas de trafego pago com IA ficam reservadas para operacoes no Scale.",
  },
  connectyhub_api: {
    code: "connectyhub_api",
    name: "API WhatsApp",
    minimumPlanCode: "scale",
    minimumPlanLabel: "Scale",
    allowedTitle: "API WhatsApp liberada",
    allowedDescription: "Chaves, webhooks, instancias e chamadas da API WhatsApp ficam disponiveis neste plano.",
    blockedTitle: "API WhatsApp exige plano Scale",
    blockedDescription: "A API WhatsApp fica liberada no teste gratis e, depois dos 7 dias, somente no Scale.",
  },
};

export function resolvePlanFeatureEntitlement(
  featureCode: PlanFeatureCode,
  input: PlanEntitlementInput,
): PlanFeatureEntitlement {
  const feature = planFeatureDefinitions[featureCode];
  const planCode = normalizePlanCode(input.planCode);
  const organizationStatus = normalizePlanCode(input.organizationStatus);

  if (input.isPlatformAdmin || planCode === "internal" || organizationStatus === "internal") {
    return allowedEntitlement(feature, "allowed");
  }

  if (input.billingState) {
    if (input.billingState === "trial_active" || input.billingState === "trial_low_credits") {
      return allowedEntitlement(feature, "trial_active");
    }

    if (input.billingState !== "paid_active") {
      return blockedEntitlement(feature, "billing_blocked");
    }

    return isPlanAllowed(planCode, feature)
      ? allowedEntitlement(feature, "allowed")
      : blockedEntitlement(feature, "plan_required");
  }

  if (planCode === "trial" && !isBlockedTrialStatus(organizationStatus)) {
    return allowedEntitlement(feature, "trial_active");
  }

  if (isPlanAllowed(planCode, feature) && !isBlockedPaidStatus(organizationStatus)) {
    return allowedEntitlement(feature, "allowed");
  }

  return blockedEntitlement(feature, "plan_required");
}

export function resolvePlanEntitlements(input: PlanEntitlementInput): Record<PlanFeatureCode, PlanFeatureEntitlement> {
  return (Object.keys(planFeatureDefinitions) as PlanFeatureCode[]).reduce((entitlements, featureCode) => {
    entitlements[featureCode] = resolvePlanFeatureEntitlement(featureCode, input);
    return entitlements;
  }, {} as Record<PlanFeatureCode, PlanFeatureEntitlement>);
}

export function getPlanFeatureDefinition(featureCode: PlanFeatureCode) {
  return planFeatureDefinitions[featureCode];
}

export function resolveMetaSocialChannelsEntitlement(input: PlanEntitlementInput): PlanFeatureEntitlement {
  return resolvePlanFeatureEntitlement("meta_social_inbox", input);
}

export function resolveConnectyhubApiEntitlement(input: PlanEntitlementInput): PlanFeatureEntitlement {
  return resolvePlanFeatureEntitlement("connectyhub_api", input);
}

export function hasEnabledMetaSocialChannels(config: unknown) {
  const record = readRecord(config);
  const channels = readRecord(record?.channels);

  return [
    "instagram_direct",
    "instagram_comments",
    "facebook_messenger",
    "facebook_comments",
  ].some((channelId) => readRecord(channels?.[channelId])?.enabled === true);
}

function allowedEntitlement(
  feature: PlanFeatureDefinition,
  reason: "allowed" | "trial_active",
): PlanFeatureEntitlement {
  return {
    allowed: true,
    featureCode: feature.code,
    minimumPlanCode: feature.minimumPlanCode,
    minimumPlanLabel: feature.minimumPlanLabel,
    requiredPlanCodes: requiredPlanCodesFor(feature.minimumPlanCode),
    reason,
    title: reason === "trial_active" ? "Liberado no teste gratis" : feature.allowedTitle,
    description: reason === "trial_active"
      ? `Durante os 7 dias de teste, ${feature.name} fica liberado para validar a operacao.`
      : feature.allowedDescription,
    upgradeLabel: "Ver planos",
  };
}

function blockedEntitlement(
  feature: PlanFeatureDefinition,
  reason: "plan_required" | "billing_blocked",
): PlanFeatureEntitlement {
  return {
    allowed: false,
    featureCode: feature.code,
    minimumPlanCode: feature.minimumPlanCode,
    minimumPlanLabel: feature.minimumPlanLabel,
    requiredPlanCodes: requiredPlanCodesFor(feature.minimumPlanCode),
    reason,
    title: reason === "billing_blocked" ? "Assinatura sem acesso ativo" : feature.blockedTitle,
    description: reason === "billing_blocked"
      ? "Regularize a assinatura ou os creditos para liberar este recurso novamente."
      : feature.blockedDescription,
    upgradeLabel: `Upgrade para ${feature.minimumPlanLabel}`,
  };
}

function normalizePlanCode(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();

  if (normalized === "start") {
    return "starter";
  }

  return normalized;
}

function isPlanAllowed(planCode: string, feature: PlanFeatureDefinition) {
  if (!isPaidPlanCode(planCode)) {
    return false;
  }

  return paidPlanRank[planCode] >= paidPlanRank[feature.minimumPlanCode];
}

function isPaidPlanCode(planCode: string): planCode is Exclude<CommercialPlanCode, "trial"> {
  return planCode === "starter" || planCode === "pro" || planCode === "scale";
}

function requiredPlanCodesFor(minimumPlanCode: Exclude<CommercialPlanCode, "trial">) {
  return (Object.keys(paidPlanRank) as Exclude<CommercialPlanCode, "trial">[])
    .filter((planCode) => paidPlanRank[planCode] >= paidPlanRank[minimumPlanCode]);
}

function isBlockedPaidStatus(status: string) {
  return [
    "expired",
    "past_due",
    "cancelled",
    "canceled",
    "inactive",
    "suspended",
    "paused",
    "pending",
    "payment_pending",
    "incomplete",
  ].includes(status);
}

function isBlockedTrialStatus(status: string) {
  return [
    "trial_expired",
    "trial_no_credits",
    "expired",
    "inactive",
    "suspended",
  ].includes(status);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
