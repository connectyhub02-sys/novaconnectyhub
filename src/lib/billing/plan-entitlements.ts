export type PlanFeatureEntitlement = {
  allowed: boolean;
  requiredPlanCodes: string[];
  reason: "allowed" | "trial_active" | "plan_required" | "billing_blocked";
  title: string;
  description: string;
  upgradeLabel: string;
};

export type BillingAccessStateLike =
  | "trial_active"
  | "trial_low_credits"
  | "trial_no_credits"
  | "trial_expired"
  | "paid_active"
  | "paid_no_credits"
  | "paid_expired"
  | "inactive";

const metaSocialPaidPlans = ["pro", "scale"];
const metaSocialRequiredPlanCodes = ["pro", "scale"];

export function resolveMetaSocialChannelsEntitlement(input: {
  planCode?: string | null;
  organizationStatus?: string | null;
  billingState?: BillingAccessStateLike | null;
}): PlanFeatureEntitlement {
  const planCode = normalizePlanCode(input.planCode);
  const organizationStatus = normalizePlanCode(input.organizationStatus);

  if (planCode === "internal") {
    return allowedEntitlement("allowed");
  }

  if (input.billingState) {
    if (input.billingState === "trial_active" || input.billingState === "trial_low_credits") {
      return allowedEntitlement("trial_active");
    }

    if (input.billingState === "paid_active" && metaSocialPaidPlans.includes(planCode)) {
      return allowedEntitlement("allowed");
    }

    return blockedEntitlement(input.billingState === "paid_active" ? "plan_required" : "billing_blocked");
  }

  if (planCode === "trial" && organizationStatus !== "trial_expired") {
    return allowedEntitlement("trial_active");
  }

  if (metaSocialPaidPlans.includes(planCode) && !isBlockedPaidStatus(organizationStatus)) {
    return allowedEntitlement("allowed");
  }

  return blockedEntitlement("plan_required");
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

function allowedEntitlement(reason: "allowed" | "trial_active"): PlanFeatureEntitlement {
  return {
    allowed: true,
    requiredPlanCodes: metaSocialRequiredPlanCodes,
    reason,
    title: reason === "trial_active" ? "Liberado no teste gratis" : "Meta Social liberado",
    description: reason === "trial_active"
      ? "Durante os 7 dias de teste, Instagram Direct e Facebook Messenger ficam liberados para validar a operacao."
      : "Instagram Direct e Facebook Messenger estao disponiveis neste plano.",
    upgradeLabel: "Ver planos",
  };
}

function blockedEntitlement(reason: "plan_required" | "billing_blocked"): PlanFeatureEntitlement {
  return {
    allowed: false,
    requiredPlanCodes: metaSocialRequiredPlanCodes,
    reason,
    title: "Recurso disponivel nos planos Pro e Scale",
    description: "Atendimento automatico no Instagram Direct e Facebook Messenger fica bloqueado no plano Start apos o teste gratis.",
    upgradeLabel: "Upgrade para Pro",
  };
}

function normalizePlanCode(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
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

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
