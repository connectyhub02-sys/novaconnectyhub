import { NextResponse, type NextRequest } from "next/server";
import { mapBillingPlanRow, type BillingPlanRow, type BillingPlanStatus } from "@/lib/billing/plans";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json().catch(() => null);
  const parsed = parsePlanPayload(body, "create");

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("billing_plans")
    .insert(toPlanDatabasePayload(parsed.plan))
    .select(PLAN_SELECT)
    .single<BillingPlanRow>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auth.supabase.from("maintenance_audit_logs").insert({
    actor_id: auth.userId,
    event_type: "billing.plan.created",
    target_table: "billing_plans",
    target_id: data.id,
    metadata: {
      planCode: data.plan_code,
      monthlyPriceBrl: data.monthly_price_brl,
      includedCredits: data.included_credits,
    },
  });

  return NextResponse.json({ plan: mapBillingPlanRow(data) }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json().catch(() => null);
  const parsed = parsePlanPayload(body, "update");

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("billing_plans")
    .update(toPlanDatabasePayload(parsed.plan))
    .eq("id", parsed.plan.planId)
    .select(PLAN_SELECT)
    .single<BillingPlanRow>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auth.supabase.from("maintenance_audit_logs").insert({
    actor_id: auth.userId,
    event_type: "billing.plan.updated",
    target_table: "billing_plans",
    target_id: data.id,
    metadata: {
      planCode: data.plan_code,
      status: data.status,
      monthlyPriceBrl: data.monthly_price_brl,
      includedCredits: data.included_credits,
    },
  });

  return NextResponse.json({ plan: mapBillingPlanRow(data) });
}

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

type ParsedPlanPayload = {
  planId: string;
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
};

function parsePlanPayload(body: unknown, mode: "create" | "update"):
  | { ok: true; plan: ParsedPlanPayload }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Payload invalido." };
  }

  const record = body as Record<string, unknown>;
  const planId = typeof record.planId === "string" ? record.planId.trim() : "";
  const planCode = normalizeCode(record.planCode);
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const status = normalizeStatus(record.status);

  if (mode === "update" && !planId) {
    return { ok: false, error: "Informe o plano." };
  }

  if (!planCode || !/^[a-z0-9_-]{2,60}$/.test(planCode)) {
    return { ok: false, error: "Use um codigo de plano com letras minusculas, numeros, - ou _." };
  }

  if (!name) {
    return { ok: false, error: "Informe o nome do plano." };
  }

  const monthlyPriceBrl = toFiniteNumber(record.monthlyPriceBrl, 0);
  const includedCredits = toFiniteNumber(record.includedCredits, 0);
  const overageCreditPriceBrl = toFiniteNumber(record.overageCreditPriceBrl, 0);
  const autoRechargeMinCredits = toFiniteNumber(record.autoRechargeMinCredits, 0);
  const overageLimitCredits = toFiniteNumber(record.overageLimitCredits, 0);
  const trialDays = toInteger(record.trialDays, 0);
  const sortOrder = toInteger(record.sortOrder, 100);
  const agentLimit = toNullableInteger(record.agentLimit);
  const whatsappInstanceLimit = toNullableInteger(record.whatsappInstanceLimit);
  const userLimit = toNullableInteger(record.userLimit);

  if (
    monthlyPriceBrl < 0 ||
    includedCredits < 0 ||
    overageCreditPriceBrl < 0 ||
    autoRechargeMinCredits < 0 ||
    overageLimitCredits < 0 ||
    trialDays < 0 ||
    sortOrder < 0 ||
    (agentLimit !== null && agentLimit < 0) ||
    (whatsappInstanceLimit !== null && whatsappInstanceLimit < 0) ||
    (userLimit !== null && userLimit < 0)
  ) {
    return { ok: false, error: "Valores do plano nao podem ser negativos." };
  }

  return {
    ok: true,
    plan: {
      planId,
      planCode,
      name,
      shortDescription: readOptionalText(record.shortDescription),
      status,
      sortOrder,
      highlighted: record.highlighted === true,
      monthlyPriceBrl,
      includedCredits,
      overageCreditPriceBrl,
      autoRechargeMinCredits,
      overageLimitCredits,
      trialDays,
      agentLimit,
      whatsappInstanceLimit,
      userLimit,
      moduleCodes: normalizeCodeList(record.moduleCodes),
      mercadoPagoPreapprovalPlanId: readOptionalText(record.mercadoPagoPreapprovalPlanId),
    },
  };
}

function toPlanDatabasePayload(plan: ParsedPlanPayload) {
  return {
    plan_code: plan.planCode,
    name: plan.name,
    short_description: plan.shortDescription,
    status: plan.status,
    sort_order: plan.sortOrder,
    highlighted: plan.highlighted,
    monthly_price_brl: plan.monthlyPriceBrl,
    included_credits: plan.includedCredits,
    overage_credit_price_brl: plan.overageCreditPriceBrl,
    auto_recharge_min_credits: plan.autoRechargeMinCredits,
    overage_limit_credits: plan.overageLimitCredits,
    trial_days: plan.trialDays,
    agent_limit: plan.agentLimit,
    whatsapp_instance_limit: plan.whatsappInstanceLimit,
    user_limit: plan.userLimit,
    module_codes: plan.moduleCodes,
    mercado_pago_preapproval_plan_id: plan.mercadoPagoPreapprovalPlanId,
  };
}

function normalizeStatus(value: unknown): BillingPlanStatus {
  return value === "active" || value === "archived" ? value : "draft";
}

function normalizeCode(value: unknown) {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
    : "";
}

function normalizeCodeList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => normalizeCode(item))
        .filter((item) => /^[a-z0-9_-]{2,60}$/.test(item)),
    ),
  );
}

function readOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toFiniteNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toInteger(value: unknown, fallback: number) {
  return Math.trunc(toFiniteNumber(value, fallback));
}

function toNullableInteger(value: unknown) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  return toInteger(value, 0);
}
