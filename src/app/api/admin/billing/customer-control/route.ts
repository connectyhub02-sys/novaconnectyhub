import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { debitCredits, grantCredits } from "@/lib/billing/cost-center";
import type { BillingPlanRow } from "@/lib/billing/plans";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type BillingControlAction =
  | "activate_plan"
  | "renew_plan"
  | "extend_trial"
  | "grant_credits"
  | "remove_credits"
  | "block_access"
  | "unblock_access"
  | "update_limits";

type ParsedControlPayload = {
  action: BillingControlAction;
  organizationId: string;
  planCode: string | null;
  amountCredits: number;
  days: number;
  grantIncludedCredits: boolean;
  reason: string;
  limits: {
    monthlyCreditLimit: number | null;
    dailyCreditLimit: number | null;
    allowOverage: boolean;
    overageLimitCredits: number;
    hardBlockWhenEmpty: boolean;
    alertThresholdPercent: number;
    agentLimit: number | null;
    whatsappInstanceLimit: number | null;
    userLimit: number | null;
  };
};

type OrganizationRow = {
  id: string;
  name: string;
  plan_code: string | null;
  status: string | null;
};

type SubscriptionRow = {
  id: string;
  metadata: JsonRecord | null;
};

type BillingCycleRow = {
  id: string;
  cycle_end: string;
  metadata: JsonRecord | null;
};

type BillingLimitsRow = {
  metadata: JsonRecord | null;
};

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

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json().catch(() => null);
  const parsed = parseControlPayload(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const client = createServiceClient();

  try {
    const organization = await loadOrganization(client, parsed.payload.organizationId);

    if (!organization) {
      return NextResponse.json({ error: "Cliente nao encontrado." }, { status: 404 });
    }

    const result = await applyControlAction(client, {
      actorId: auth.userId,
      organization,
      payload: parsed.payload,
    });

    await client.from("maintenance_audit_logs").insert({
      actor_id: auth.userId,
      event_type: `billing.customer_control.${parsed.payload.action}`,
      target_table: "organizations",
      target_id: organization.id,
      metadata: {
        organizationId: organization.id,
        organizationName: organization.name,
        previousPlanCode: organization.plan_code,
        previousStatus: organization.status,
        reason: parsed.payload.reason,
        ...result.auditMetadata,
      },
    });

    revalidatePath("/admin/clientes");
    revalidatePath("/admin/financeiro");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/planos");

    return NextResponse.json({
      ok: true,
      action: parsed.payload.action,
      message: result.message,
      metadata: result.publicMetadata,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel aplicar o controle do cliente." },
      { status: 500 },
    );
  }
}

async function applyControlAction(
  client: SupabaseClient,
  input: {
    actorId: string;
    organization: OrganizationRow;
    payload: ParsedControlPayload;
  },
) {
  const { action } = input.payload;

  if (action === "activate_plan" || action === "renew_plan") {
    return activateOrRenewPlan(client, input);
  }

  if (action === "extend_trial") {
    return extendTrial(client, input);
  }

  if (action === "grant_credits") {
    return grantManualCredits(client, input);
  }

  if (action === "remove_credits") {
    return removeManualCredits(client, input);
  }

  if (action === "block_access") {
    return blockCustomerAccess(client, input);
  }

  if (action === "unblock_access") {
    return unblockCustomerAccess(client, input);
  }

  return updateCustomerLimits(client, input);
}

async function activateOrRenewPlan(
  client: SupabaseClient,
  input: {
    actorId: string;
    organization: OrganizationRow;
    payload: ParsedControlPayload;
  },
) {
  const planCode = input.payload.planCode ?? input.organization.plan_code;

  if (!planCode) {
    throw new Error("Escolha o plano que sera aplicado ao cliente.");
  }

  const plan = await loadPlan(client, planCode);

  if (!plan) {
    throw new Error("Plano nao encontrado ou arquivado.");
  }

  const now = new Date();
  const cycleStart = now.toISOString();
  const cycleEnd = addCalendarMonth(now).toISOString();
  const subscriptionId = await upsertManualSubscription(client, {
    actorId: input.actorId,
    organization: input.organization,
    plan,
    cycleStart,
    cycleEnd,
    reason: input.payload.reason,
    source: input.payload.action === "renew_plan" ? "admin_manual_renewal" : "admin_manual_activation",
  });

  let creditTransactionId: string | null = null;

  await updateOrganizationPlanState(client, input.organization.id, {
    planCode: plan.plan_code,
    status: plan.plan_code === "trial" ? "trial" : "active",
  });

  await ensureBillingLimits(client, input.organization.id, {
    source: input.payload.action,
    actorId: input.actorId,
    reason: input.payload.reason,
  });

  if (input.payload.grantIncludedCredits && toNumber(plan.included_credits) > 0) {
    creditTransactionId = await grantPlanCredits(client, {
      organizationId: input.organization.id,
      planCode: plan.plan_code,
      cycleStart,
      cycleEnd,
      externalReference: `${input.payload.action}:${input.organization.id}:${cycleStart}`,
    });
  } else {
    await upsertManualBillingCycle(client, {
      organizationId: input.organization.id,
      subscriptionId,
      planId: plan.id,
      planCode: plan.plan_code,
      cycleStart,
      cycleEnd,
      includedCredits: 0,
      actorId: input.actorId,
      reason: input.payload.reason,
      source: input.payload.action,
    });
  }

  await linkLatestCycleToSubscription(client, {
    organizationId: input.organization.id,
    subscriptionId,
    cycleStart,
    cycleEnd,
  });

  return {
    message: input.payload.action === "renew_plan"
      ? `Plano ${plan.name} renovado manualmente.`
      : `Plano ${plan.name} ativado manualmente.`,
    publicMetadata: {
      planCode: plan.plan_code,
      subscriptionId,
      creditTransactionId,
      grantedIncludedCredits: input.payload.grantIncludedCredits,
    },
    auditMetadata: {
      planCode: plan.plan_code,
      subscriptionId,
      creditTransactionId,
      cycleStart,
      cycleEnd,
      grantedIncludedCredits: input.payload.grantIncludedCredits,
      includedCredits: toNumber(plan.included_credits),
    },
  };
}

async function extendTrial(
  client: SupabaseClient,
  input: {
    actorId: string;
    organization: OrganizationRow;
    payload: ParsedControlPayload;
  },
) {
  if (input.payload.days <= 0) {
    throw new Error("Informe quantos dias gratis serao adicionados.");
  }

  const trialPlan = await loadPlan(client, "trial");

  if (!trialPlan) {
    throw new Error("Plano de teste gratis nao encontrado.");
  }

  const now = new Date();
  const existingCycle = await loadOpenTrialCycle(client, input.organization.id);
  const baseEnd = existingCycle && new Date(existingCycle.cycle_end).getTime() > now.getTime()
    ? new Date(existingCycle.cycle_end)
    : now;
  const nextEnd = addDays(baseEnd, input.payload.days).toISOString();
  const metadata = {
    ...(existingCycle?.metadata ?? {}),
    source: "admin_trial_extension",
    actor_id: input.actorId,
    reason: input.payload.reason,
    added_days: input.payload.days,
    extended_at: now.toISOString(),
  };

  if (existingCycle) {
    const { error } = await client
      .from("billing_cycles")
      .update({
        cycle_end: nextEnd,
        status: "open",
        metadata,
      })
      .eq("id", existingCycle.id);

    if (error) {
      throw new Error(`Nao foi possivel estender o teste gratis: ${error.message}`);
    }
  } else {
    const { error } = await client.from("billing_cycles").insert({
      organization_id: input.organization.id,
      plan_id: trialPlan.id,
      cycle_start: now.toISOString(),
      cycle_end: nextEnd,
      included_credits: toNumber(trialPlan.included_credits),
      status: "open",
      metadata,
    });

    if (error) {
      throw new Error(`Nao foi possivel criar o novo periodo de teste: ${error.message}`);
    }
  }

  await updateOrganizationPlanState(client, input.organization.id, {
    planCode: "trial",
    status: "trial",
  });

  return {
    message: `${input.payload.days} dia${input.payload.days === 1 ? "" : "s"} gratis adicionados ao teste.`,
    publicMetadata: {
      trialEndsAt: nextEnd,
    },
    auditMetadata: {
      addedDays: input.payload.days,
      trialEndsAt: nextEnd,
    },
  };
}

async function grantManualCredits(
  client: SupabaseClient,
  input: {
    actorId: string;
    organization: OrganizationRow;
    payload: ParsedControlPayload;
  },
) {
  if (input.payload.amountCredits <= 0) {
    throw new Error("Informe uma quantidade de creditos maior que zero.");
  }

  const transactionId = await grantCredits(client, {
    organizationId: input.organization.id,
    amountCredits: input.payload.amountCredits,
    description: input.payload.reason,
    externalReference: `admin-grant:${input.organization.id}:${Date.now()}`,
    metadata: {
      source: "admin_customer_control",
      actor_id: input.actorId,
      reason: input.payload.reason,
    },
    transactionType: "grant",
  });

  return {
    message: `${formatCredits(input.payload.amountCredits)} creditos adicionados ao cliente.`,
    publicMetadata: {
      transactionId,
      amountCredits: input.payload.amountCredits,
    },
    auditMetadata: {
      transactionId,
      amountCredits: input.payload.amountCredits,
    },
  };
}

async function removeManualCredits(
  client: SupabaseClient,
  input: {
    actorId: string;
    organization: OrganizationRow;
    payload: ParsedControlPayload;
  },
) {
  if (input.payload.amountCredits <= 0) {
    throw new Error("Informe uma quantidade de creditos maior que zero.");
  }

  const transactionId = await debitCredits(client, {
    organizationId: input.organization.id,
    amountCredits: input.payload.amountCredits,
    provider: "custom",
    description: input.payload.reason,
    metadata: {
      source: "admin_customer_control",
      actor_id: input.actorId,
      reason: input.payload.reason,
      manual_credit_removal: true,
    },
  });

  return {
    message: `${formatCredits(input.payload.amountCredits)} creditos removidos do cliente.`,
    publicMetadata: {
      transactionId,
      amountCredits: input.payload.amountCredits,
    },
    auditMetadata: {
      transactionId,
      amountCredits: input.payload.amountCredits,
    },
  };
}

async function blockCustomerAccess(
  client: SupabaseClient,
  input: {
    actorId: string;
    organization: OrganizationRow;
    payload: ParsedControlPayload;
  },
) {
  const now = new Date().toISOString();

  await updateOrganizationPlanState(client, input.organization.id, {
    planCode: input.organization.plan_code,
    status: "suspended",
  });

  await client
    .from("organization_subscriptions")
    .update({ status: "paused" })
    .eq("organization_id", input.organization.id)
    .in("status", ["pending", "active", "past_due", "incomplete"]);

  await client
    .from("credit_wallets")
    .update({ status: "blocked" })
    .eq("organization_id", input.organization.id);

  return {
    message: "Cliente bloqueado. O painel abre, mas recursos com custo ficam travados.",
    publicMetadata: {
      status: "suspended",
    },
    auditMetadata: {
      status: "suspended",
      blockedAt: now,
    },
  };
}

async function unblockCustomerAccess(
  client: SupabaseClient,
  input: {
    actorId: string;
    organization: OrganizationRow;
    payload: ParsedControlPayload;
  },
) {
  const nextStatus = input.organization.plan_code === "trial" ? "trial" : "active";
  const now = new Date().toISOString();

  await updateOrganizationPlanState(client, input.organization.id, {
    planCode: input.organization.plan_code,
    status: nextStatus,
  });

  await client
    .from("organization_subscriptions")
    .update({ status: "active" })
    .eq("organization_id", input.organization.id)
    .in("status", ["paused", "past_due", "incomplete"]);

  await client
    .from("credit_wallets")
    .update({ status: "active" })
    .eq("organization_id", input.organization.id);

  return {
    message: "Cliente desbloqueado.",
    publicMetadata: {
      status: nextStatus,
    },
    auditMetadata: {
      status: nextStatus,
      unblockedAt: now,
    },
  };
}

async function updateCustomerLimits(
  client: SupabaseClient,
  input: {
    actorId: string;
    organization: OrganizationRow;
    payload: ParsedControlPayload;
  },
) {
  const { data: existing } = await client
    .from("organization_billing_limits")
    .select("metadata")
    .eq("organization_id", input.organization.id)
    .maybeSingle<BillingLimitsRow>();

  const metadata = {
    ...(existing?.metadata ?? {}),
    resource_overrides: {
      agent_limit: input.payload.limits.agentLimit,
      whatsapp_instance_limit: input.payload.limits.whatsappInstanceLimit,
      user_limit: input.payload.limits.userLimit,
    },
    source: "admin_customer_control",
    actor_id: input.actorId,
    reason: input.payload.reason,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client.from("organization_billing_limits").upsert({
    organization_id: input.organization.id,
    monthly_credit_limit: input.payload.limits.monthlyCreditLimit,
    daily_credit_limit: input.payload.limits.dailyCreditLimit,
    allow_overage: input.payload.limits.allowOverage,
    overage_limit_credits: input.payload.limits.overageLimitCredits,
    hard_block_when_empty: input.payload.limits.hardBlockWhenEmpty,
    alert_threshold_percent: input.payload.limits.alertThresholdPercent,
    metadata,
  }, {
    onConflict: "organization_id",
  });

  if (error) {
    throw new Error(`Nao foi possivel salvar os limites: ${error.message}`);
  }

  return {
    message: "Limites do cliente atualizados.",
    publicMetadata: {
      limits: input.payload.limits,
    },
    auditMetadata: {
      limits: input.payload.limits,
    },
  };
}

async function loadOrganization(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from("organizations")
    .select("id, name, plan_code, status")
    .eq("id", organizationId)
    .maybeSingle<OrganizationRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar o cliente: ${error.message}`);
  }

  return data;
}

async function loadPlan(client: SupabaseClient, planCode: string) {
  const { data, error } = await client
    .from("billing_plans")
    .select(PLAN_SELECT)
    .eq("plan_code", planCode)
    .in("status", ["active", "draft"])
    .maybeSingle<BillingPlanRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar o plano: ${error.message}`);
  }

  return data;
}

async function upsertManualSubscription(
  client: SupabaseClient,
  input: {
    actorId: string;
    organization: OrganizationRow;
    plan: BillingPlanRow;
    cycleStart: string;
    cycleEnd: string;
    reason: string;
    source: string;
  },
) {
  const { data: existing, error: existingError } = await client
    .from("organization_subscriptions")
    .select("id, metadata")
    .eq("organization_id", input.organization.id)
    .in("status", ["pending", "active", "past_due", "incomplete"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<SubscriptionRow>();

  if (existingError) {
    throw new Error(`Nao foi possivel consultar a assinatura atual: ${existingError.message}`);
  }

  const payload = {
    organization_id: input.organization.id,
    plan_id: input.plan.id,
    plan_code: input.plan.plan_code,
    status: "active",
    billing_provider: "admin_manual",
    provider_plan_id: input.plan.mercado_pago_preapproval_plan_id,
    current_period_start: input.cycleStart,
    current_period_end: input.cycleEnd,
    next_billing_at: input.cycleEnd,
    metadata: {
      ...(existing?.metadata ?? {}),
      source: input.source,
      actor_id: input.actorId,
      reason: input.reason,
      manual_activation: true,
      updated_at: new Date().toISOString(),
    },
  };

  if (existing) {
    const { data, error } = await client
      .from("organization_subscriptions")
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single<{ id: string }>();

    if (error) {
      throw new Error(`Nao foi possivel atualizar a assinatura: ${error.message}`);
    }

    return data.id;
  }

  const { data, error } = await client
    .from("organization_subscriptions")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(`Nao foi possivel criar a assinatura manual: ${error.message}`);
  }

  return data.id;
}

async function upsertManualBillingCycle(
  client: SupabaseClient,
  input: {
    organizationId: string;
    subscriptionId: string;
    planId: string;
    planCode: string;
    cycleStart: string;
    cycleEnd: string;
    includedCredits: number;
    actorId: string;
    reason: string;
    source: string;
  },
) {
  const { error } = await client.from("billing_cycles").insert({
    organization_id: input.organizationId,
    subscription_id: input.subscriptionId,
    plan_id: input.planId,
    cycle_start: input.cycleStart,
    cycle_end: input.cycleEnd,
    included_credits: input.includedCredits,
    status: "open",
    metadata: {
      source: input.source,
      plan_code: input.planCode,
      actor_id: input.actorId,
      reason: input.reason,
      manual_cycle: true,
    },
  });

  if (error) {
    throw new Error(`Nao foi possivel abrir o ciclo manual: ${error.message}`);
  }
}

async function grantPlanCredits(
  client: SupabaseClient,
  input: {
    organizationId: string;
    planCode: string;
    cycleStart: string;
    cycleEnd: string;
    externalReference: string;
  },
) {
  const { data, error } = await client.rpc("grant_billing_plan_credits", {
    p_organization_id: input.organizationId,
    p_plan_code: input.planCode,
    p_cycle_start: input.cycleStart,
    p_cycle_end: input.cycleEnd,
    p_external_reference: input.externalReference,
  });

  if (error) {
    throw new Error(`Nao foi possivel liberar os creditos do plano: ${error.message}`);
  }

  return data ? String(data) : null;
}

async function linkLatestCycleToSubscription(
  client: SupabaseClient,
  input: {
    organizationId: string;
    subscriptionId: string;
    cycleStart: string;
    cycleEnd: string;
  },
) {
  await client
    .from("billing_cycles")
    .update({ subscription_id: input.subscriptionId })
    .eq("organization_id", input.organizationId)
    .eq("cycle_start", input.cycleStart)
    .eq("cycle_end", input.cycleEnd);
}

async function loadOpenTrialCycle(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from("billing_cycles")
    .select("id, cycle_end, metadata, billing_plans!inner(plan_code)")
    .eq("organization_id", organizationId)
    .eq("status", "open")
    .eq("billing_plans.plan_code", "trial")
    .order("cycle_end", { ascending: false })
    .limit(1)
    .maybeSingle<BillingCycleRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar o teste gratis atual: ${error.message}`);
  }

  return data;
}

async function updateOrganizationPlanState(
  client: SupabaseClient,
  organizationId: string,
  input: {
    planCode: string | null;
    status: string;
  },
) {
  const payload: Record<string, string> = {
    status: input.status,
  };

  if (input.planCode) {
    payload.plan_code = input.planCode;
  }

  const { error } = await client
    .from("organizations")
    .update(payload)
    .eq("id", organizationId);

  if (error) {
    throw new Error(`Nao foi possivel atualizar o status do cliente: ${error.message}`);
  }
}

async function ensureBillingLimits(
  client: SupabaseClient,
  organizationId: string,
  metadata: JsonRecord,
) {
  const { data: existing, error: existingError } = await client
    .from("organization_billing_limits")
    .select("metadata")
    .eq("organization_id", organizationId)
    .maybeSingle<BillingLimitsRow>();

  if (existingError) {
    throw new Error(`Nao foi possivel consultar limites do cliente: ${existingError.message}`);
  }

  if (existing) {
    const { error } = await client
      .from("organization_billing_limits")
      .update({
        metadata: {
          ...(existing.metadata ?? {}),
          ...metadata,
          ensured_at: new Date().toISOString(),
        },
      })
      .eq("organization_id", organizationId);

    if (error) {
      throw new Error(`Nao foi possivel atualizar limites do cliente: ${error.message}`);
    }

    return;
  }

  const { error } = await client.from("organization_billing_limits").insert({
    organization_id: organizationId,
    allow_overage: false,
    overage_limit_credits: 0,
    hard_block_when_empty: true,
    alert_threshold_percent: 80,
    metadata: {
      ...metadata,
      ensured_at: new Date().toISOString(),
    },
  });

  if (error) {
    throw new Error(`Nao foi possivel criar limites do cliente: ${error.message}`);
  }
}

function parseControlPayload(body: unknown):
  | { ok: true; payload: ParsedControlPayload }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Payload invalido." };
  }

  const record = body as JsonRecord;
  const action = readAction(record.action);
  const organizationId = readUuid(record.organizationId);

  if (!action) {
    return { ok: false, error: "Acao de controle invalida." };
  }

  if (!organizationId) {
    return { ok: false, error: "Escolha o cliente." };
  }

  const reason = readString(record.reason) ?? "Ajuste manual do admin";
  const amountCredits = toNumber(record.amountCredits);
  const days = Math.trunc(toNumber(record.days));

  return {
    ok: true,
    payload: {
      action,
      organizationId,
      planCode: readPlanCode(record.planCode),
      amountCredits,
      days,
      grantIncludedCredits: record.grantIncludedCredits !== false,
      reason,
      limits: parseLimits(record.limits),
    },
  };
}

function parseLimits(value: unknown): ParsedControlPayload["limits"] {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};

  return {
    monthlyCreditLimit: toNullableNumber(record.monthlyCreditLimit),
    dailyCreditLimit: toNullableNumber(record.dailyCreditLimit),
    allowOverage: record.allowOverage === true,
    overageLimitCredits: Math.max(toNumber(record.overageLimitCredits), 0),
    hardBlockWhenEmpty: record.hardBlockWhenEmpty !== false,
    alertThresholdPercent: clamp(toNumber(record.alertThresholdPercent, 80), 0, 100),
    agentLimit: toNullableInteger(record.agentLimit),
    whatsappInstanceLimit: toNullableInteger(record.whatsappInstanceLimit),
    userLimit: toNullableInteger(record.userLimit),
  };
}

function readAction(value: unknown): BillingControlAction | null {
  return value === "activate_plan"
    || value === "renew_plan"
    || value === "extend_trial"
    || value === "grant_credits"
    || value === "remove_credits"
    || value === "block_access"
    || value === "unblock_access"
    || value === "update_limits"
    ? value
    : null;
}

function readPlanCode(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9_-]{2,60}$/.test(normalized) ? normalized : null;
}

function readUuid(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toNullableNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const parsed = toNumber(value);
  return parsed >= 0 ? parsed : null;
}

function toNullableInteger(value: unknown) {
  const parsed = toNullableNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function addCalendarMonth(date: Date) {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + 1);
  return next;
}

function formatCredits(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: value < 10 ? 2 : 0,
  }).format(Math.max(value, 0));
}
