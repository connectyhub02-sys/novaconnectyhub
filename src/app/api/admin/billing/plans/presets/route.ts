import { NextResponse } from "next/server";
import { mapBillingPlanRow, type BillingPlanRow } from "@/lib/billing/plans";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";

export const runtime = "nodejs";

const PLAN_SELECT = [
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
].join(", ");

const COMMERCIAL_PLAN_PRESETS = [
  {
    plan_code: "trial",
    name: "Teste gratis",
    short_description: "Teste de 7 dias com creditos limitados para validar o atendimento no WhatsApp.",
    status: "active",
    sort_order: 5,
    highlighted: false,
    monthly_price_brl: 0,
    included_credits: 1000,
    overage_credit_price_brl: 0.01,
    auto_recharge_min_credits: 0,
    overage_limit_credits: 0,
    trial_days: 7,
    agent_limit: 1,
    whatsapp_instance_limit: 1,
    user_limit: 1,
    module_codes: ["whatsapp_agent", "sales_catalog", "crm_basic", "voice_ai"],
    metadata: {
      seed: "trial_credit_catalog",
      credit_unit_brl: 0.01,
      target_markup: 4,
      included_credit_value_brl: 10,
      target_provider_cost_brl: 2.5,
      credits_expire_with_trial: true,
      editable: true,
    },
  },
  {
    plan_code: "starter",
    name: "Start",
    short_description: "Entrada com agente WhatsApp, catalogo e creditos iniciais para validar vendas.",
    status: "active",
    sort_order: 10,
    highlighted: false,
    monthly_price_brl: 97,
    included_credits: 3000,
    overage_credit_price_brl: 0.01,
    auto_recharge_min_credits: 600,
    overage_limit_credits: 0,
    trial_days: 0,
    agent_limit: 1,
    whatsapp_instance_limit: 1,
    user_limit: 2,
    module_codes: ["whatsapp_agent", "sales_catalog", "crm_basic", "voice_ai"],
    metadata: {
      seed: "commercial_credit_catalog",
      credit_unit_brl: 0.01,
      target_markup: 4,
      included_credit_value_brl: 30,
      target_provider_cost_brl: 7.5,
      agent_whatsapp_ratio: "1:1",
      editable: true,
    },
  },
  {
    plan_code: "pro",
    name: "Pro",
    short_description: "Plano para operacao com mais agentes, automacoes e maior volume de conversas.",
    status: "active",
    sort_order: 20,
    highlighted: true,
    monthly_price_brl: 247,
    included_credits: 10000,
    overage_credit_price_brl: 0.01,
    auto_recharge_min_credits: 2000,
    overage_limit_credits: 0,
    trial_days: 0,
    agent_limit: 4,
    whatsapp_instance_limit: 4,
    user_limit: 5,
    module_codes: ["whatsapp_agent", "sales_catalog", "crm_basic", "automations", "voice_ai", "reports", "team_users"],
    metadata: {
      seed: "commercial_credit_catalog",
      credit_unit_brl: 0.01,
      target_markup: 4,
      included_credit_value_brl: 100,
      target_provider_cost_brl: 25,
      agent_whatsapp_ratio: "1:1",
      limit_update: "pro_4_agents_4_whatsapps",
      editable: true,
    },
  },
  {
    plan_code: "scale",
    name: "Scale",
    short_description: "Plano para times com varias instancias, voz, automacoes e escala comercial.",
    status: "active",
    sort_order: 30,
    highlighted: false,
    monthly_price_brl: 497,
    included_credits: 25000,
    overage_credit_price_brl: 0.01,
    auto_recharge_min_credits: 5000,
    overage_limit_credits: 0,
    trial_days: 0,
    agent_limit: 8,
    whatsapp_instance_limit: 8,
    user_limit: 15,
    module_codes: ["whatsapp_agent", "sales_catalog", "crm_basic", "automations", "voice_ai", "api_whatsapp", "reports", "team_users"],
    metadata: {
      seed: "commercial_credit_catalog",
      credit_unit_brl: 0.01,
      target_markup: 4,
      included_credit_value_brl: 250,
      target_provider_cost_brl: 62.5,
      agent_whatsapp_ratio: "1:1",
      limit_update: "scale_8_agents_8_whatsapps",
      editable: true,
    },
  },
];

export async function POST() {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const { error } = await auth.supabase
    .from("billing_plans")
    .upsert(COMMERCIAL_PLAN_PRESETS, { onConflict: "plan_code" })
    .select(PLAN_SELECT)
    .order("sort_order", { ascending: true })
    .returns<BillingPlanRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auth.supabase
    .from("billing_plans")
    .update({
      status: "archived",
      highlighted: false,
      metadata: {
        superseded_by: "starter",
        archived_by: "commercial_credit_catalog",
      },
    })
    .eq("plan_code", "basic");

  await auth.supabase.from("maintenance_audit_logs").insert({
    actor_id: auth.userId,
    event_type: "billing.plan.presets_applied",
    target_table: "billing_plans",
    metadata: {
      planCodes: COMMERCIAL_PLAN_PRESETS.map((plan) => plan.plan_code),
      monthlyPricesBrl: COMMERCIAL_PLAN_PRESETS.map((plan) => plan.monthly_price_brl),
      includedCredits: COMMERCIAL_PLAN_PRESETS.map((plan) => plan.included_credits),
    },
  });

  const { data: plans, error: listError } = await auth.supabase
    .from("billing_plans")
    .select(PLAN_SELECT)
    .order("sort_order", { ascending: true })
    .order("monthly_price_brl", { ascending: true })
    .returns<BillingPlanRow[]>();

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  return NextResponse.json({
    plans: (plans ?? []).map(mapBillingPlanRow),
  });
}
