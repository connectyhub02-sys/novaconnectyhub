import "server-only";

import { createClient } from "@/lib/supabase/server";

export type BillingPlanStatus = "draft" | "active" | "archived";

export type BillingPlan = {
  id: string;
  planCode: string;
  name: string;
  shortDescription: string | null;
  status: BillingPlanStatus;
  sortOrder: number;
  highlighted: boolean;
  monthlyPriceBrl: number;
  includedCredits: number;
  overageCreditPriceBrl: number;
  autoRechargeMinCredits: number;
  overageLimitCredits: number;
  trialDays: number;
  agentLimit: number | null;
  whatsappInstanceLimit: number | null;
  userLimit: number | null;
  moduleCodes: string[];
  mercadoPagoPreapprovalPlanId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillingPlanCatalog = {
  schemaReady: boolean;
  plans: BillingPlan[];
  summary: {
    totalPlans: number;
    activePlans: number;
    draftPlans: number;
    archivedPlans: number;
    recurringRevenueBrl: number;
  };
  warnings: string[];
};

export type BillingPlanRow = {
  id: string;
  plan_code: string;
  name: string;
  short_description: string | null;
  status: string | null;
  sort_order: number | string | null;
  highlighted: boolean | null;
  monthly_price_brl: number | string | null;
  included_credits: number | string | null;
  overage_credit_price_brl: number | string | null;
  auto_recharge_min_credits: number | string | null;
  overage_limit_credits: number | string | null;
  trial_days: number | string | null;
  agent_limit: number | string | null;
  whatsapp_instance_limit: number | string | null;
  user_limit: number | string | null;
  module_codes: string[] | null;
  mercado_pago_preapproval_plan_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function getBillingPlanCatalog(): Promise<BillingPlanCatalog> {
  const supabase = await createClient();
  const result = await supabase
    .from("billing_plans")
    .select(
      [
        "id",
        "plan_code",
        "name",
        "short_description",
        "status",
        "sort_order",
        "highlighted",
        "monthly_price_brl",
        "included_credits",
        "overage_credit_price_brl",
        "auto_recharge_min_credits",
        "overage_limit_credits",
        "trial_days",
        "agent_limit",
        "whatsapp_instance_limit",
        "user_limit",
        "module_codes",
        "mercado_pago_preapproval_plan_id",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .order("sort_order", { ascending: true })
    .order("monthly_price_brl", { ascending: true })
    .limit(100);

  if (result.error) {
    return {
      schemaReady: false,
      plans: [],
      summary: {
        totalPlans: 0,
        activePlans: 0,
        draftPlans: 0,
        archivedPlans: 0,
        recurringRevenueBrl: 0,
      },
      warnings: [result.error.message],
    };
  }

  const plans = ((result.data ?? []) as unknown as BillingPlanRow[]).map(mapBillingPlanRow);

  return {
    schemaReady: true,
    plans,
    summary: {
      totalPlans: plans.length,
      activePlans: plans.filter((plan) => plan.status === "active").length,
      draftPlans: plans.filter((plan) => plan.status === "draft").length,
      archivedPlans: plans.filter((plan) => plan.status === "archived").length,
      recurringRevenueBrl: plans
        .filter((plan) => plan.status === "active")
        .reduce((total, plan) => total + plan.monthlyPriceBrl, 0),
    },
    warnings: [],
  };
}

export function mapBillingPlanRow(row: BillingPlanRow): BillingPlan {
  return {
    id: row.id,
    planCode: row.plan_code,
    name: row.name,
    shortDescription: row.short_description,
    status: normalizeStatus(row.status),
    sortOrder: toNumber(row.sort_order),
    highlighted: Boolean(row.highlighted),
    monthlyPriceBrl: toNumber(row.monthly_price_brl),
    includedCredits: toNumber(row.included_credits),
    overageCreditPriceBrl: toNumber(row.overage_credit_price_brl),
    autoRechargeMinCredits: toNumber(row.auto_recharge_min_credits),
    overageLimitCredits: toNumber(row.overage_limit_credits),
    trialDays: toNumber(row.trial_days),
    agentLimit: toNullableNumber(row.agent_limit),
    whatsappInstanceLimit: toNullableNumber(row.whatsapp_instance_limit),
    userLimit: toNullableNumber(row.user_limit),
    moduleCodes: Array.isArray(row.module_codes) ? row.module_codes.filter(Boolean) : [],
    mercadoPagoPreapprovalPlanId: row.mercado_pago_preapproval_plan_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeStatus(value: string | null): BillingPlanStatus {
  if (value === "active" || value === "archived") {
    return value;
  }

  return "draft";
}

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return toNumber(value);
}
