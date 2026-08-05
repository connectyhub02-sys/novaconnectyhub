import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

export const TRIAL_PLAN_CODE = "trial";
export const TRIAL_DAYS = 7;
export const TRIAL_INCLUDED_CREDITS = 1000;
export const TRIAL_CREDIT_CONVERSION_GRACE_DAYS = 7;
export const LOW_CREDIT_PERCENT = 20;

export type BillingAccessState =
  | "trial_active"
  | "trial_low_credits"
  | "trial_no_credits"
  | "trial_expired"
  | "paid_active"
  | "paid_no_credits"
  | "paid_expired"
  | "inactive";

export type BillingAccessStatus = {
  organizationId: string;
  planCode: string | null;
  organizationStatus: string | null;
  state: BillingAccessState;
  canUseBillableFeatures: boolean;
  balanceCredits: number;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  trialDaysTotal: number;
  trialDaysRemaining: number | null;
  includedCredits: number;
  usedCredits: number;
  lowCreditThreshold: number;
  bannerTone: "green" | "amber" | "rose" | "cyan";
  bannerTitle: string;
  bannerDescription: string;
  ctaLabel: string;
  ctaHref: string;
};

type OrganizationBillingRow = {
  id: string;
  plan_code: string | null;
  status: string | null;
  created_at: string | null;
};

type WalletBillingRow = {
  balance_credits: number | string | null;
  lifetime_used_credits: number | string | null;
};

type BillingPlanRelation = {
  plan_code: string | null;
  included_credits?: number | string | null;
} | Array<{
  plan_code: string | null;
  included_credits?: number | string | null;
}> | null;

type BillingCycleRow = {
  id: string;
  cycle_start: string | null;
  cycle_end: string | null;
  included_credits: number | string | null;
  used_credits: number | string | null;
  status: string | null;
  billing_plans: BillingPlanRelation;
};

type BillingPlanLimitRow = {
  plan_code: string;
  agent_limit: number | string | null;
  whatsapp_instance_limit: number | string | null;
  included_credits: number | string | null;
};

type BillingLimitsOverrideRow = {
  metadata: Record<string, unknown> | null;
};

export type OrganizationPlanLimits = {
  planCode: string | null;
  agentLimit: number;
  whatsappInstanceLimit: number;
  includedCredits: number;
};

export class BillingAccessError extends Error {
  status: BillingAccessStatus;

  constructor(status: BillingAccessStatus) {
    super(status.bannerDescription);
    this.name = "BillingAccessError";
    this.status = status;
  }
}

export function formatBillingAccessError(error: unknown, fallback: string) {
  return {
    error: error instanceof Error ? error.message : fallback,
    ...(error instanceof BillingAccessError ? { billingAccess: error.status } : {}),
  };
}

export function statusForBillingAccessError(error: unknown, fallback: number) {
  return error instanceof BillingAccessError ? 402 : fallback;
}

export async function grantTrialCredits(input: {
  organizationId: string;
  userId?: string | null;
  externalReference?: string | null;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const { data, error } = await client.rpc("grant_connectyhub_trial_credits", {
    p_organization_id: input.organizationId,
    p_user_id: input.userId ?? null,
    p_external_reference: input.externalReference ?? null,
  });

  if (error) {
    throw new Error(`Nao foi possivel conceder o teste gratis: ${error.message}`);
  }

  return data ? String(data) : null;
}

export async function scheduleTrialConversionMessages(input: {
  organizationId: string;
  userId?: string | null;
  optIn: boolean;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const { data, error } = await client.rpc("schedule_connectyhub_trial_messages", {
    p_organization_id: input.organizationId,
    p_user_id: input.userId ?? null,
    p_opt_in: input.optIn,
  });

  if (error) {
    throw new Error(`Nao foi possivel agendar avisos do teste gratis: ${error.message}`);
  }

  return Number(data ?? 0);
}

export async function enqueueTrialNoCreditsMessage(input: {
  organizationId: string;
  userId?: string | null;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const { data, error } = await client.rpc("enqueue_connectyhub_trial_no_credits_message", {
    p_organization_id: input.organizationId,
    p_user_id: input.userId ?? null,
  });

  if (error) {
    throw new Error(`Nao foi possivel enfileirar aviso de creditos: ${error.message}`);
  }

  return data ? String(data) : null;
}

export async function getOrganizationBillingAccess(input: {
  organizationId: string;
  now?: Date;
  client?: SupabaseClient;
}): Promise<BillingAccessStatus> {
  const client = input.client ?? createServiceClient();
  const now = input.now ?? new Date();

  const [{ data: organization, error: organizationError }, { data: wallet, error: walletError }] = await Promise.all([
    client
      .from("organizations")
      .select("id, plan_code, status, created_at")
      .eq("id", input.organizationId)
      .maybeSingle<OrganizationBillingRow>(),
    client
      .from("credit_wallets")
      .select("balance_credits, lifetime_used_credits")
      .eq("organization_id", input.organizationId)
      .maybeSingle<WalletBillingRow>(),
  ]);

  if (organizationError) {
    throw new Error(`Nao foi possivel carregar a empresa para billing: ${organizationError.message}`);
  }

  if (walletError) {
    throw new Error(`Nao foi possivel carregar creditos da empresa: ${walletError.message}`);
  }

  if (!organization) {
    return buildInactiveStatus(input.organizationId);
  }

  const cycles = await loadBillingCycles(client, input.organizationId);
  const planCode = organization.plan_code;
  const organizationStatus = organization.status;
  const balanceCredits = toNumber(wallet?.balance_credits);

  if (planCode === "internal") {
    return {
      organizationId: organization.id,
      planCode,
      organizationStatus,
      state: "paid_active",
      canUseBillableFeatures: true,
      balanceCredits,
      trialStartsAt: null,
      trialEndsAt: null,
      trialDaysTotal: 0,
      trialDaysRemaining: null,
      includedCredits: 0,
      usedCredits: 0,
      lowCreditThreshold: 0,
      bannerTone: "cyan",
      bannerTitle: "Operacao interna ativa",
      bannerDescription: "Workspace interno da ConnectyHub liberado para operacao.",
      ctaLabel: "Painel admin",
      ctaHref: "/admin",
    };
  }

  const isTrial = planCode === TRIAL_PLAN_CODE || organizationStatus === "trial" || organizationStatus === "trial_expired";
  const currentCycle = findCurrentBillingCycle(cycles, now) ?? cycles[0] ?? null;
  const trialCycle = cycles.find((cycle) => readPlanCode(cycle.billing_plans) === TRIAL_PLAN_CODE) ?? null;
  const cycle = isTrial ? trialCycle ?? currentCycle : currentCycle;
  const fallbackTrialStart = organization.created_at;
  const fallbackTrialEnd = addDaysIso(fallbackTrialStart, TRIAL_DAYS);
  const trialStartsAt = cycle?.cycle_start ?? (isTrial ? fallbackTrialStart : null);
  const trialEndsAt = cycle?.cycle_end ?? (isTrial ? fallbackTrialEnd : null);
  const includedCredits = toNumber(cycle?.included_credits) || readPlanIncludedCredits(cycle?.billing_plans) || (isTrial ? TRIAL_INCLUDED_CREDITS : 0);
  const usedCredits = resolveCycleUsedCredits({
    balanceCredits,
    cycle,
    includedCredits,
    isTrial,
  });
  const lowCreditThreshold = includedCredits > 0 ? includedCredits * (LOW_CREDIT_PERCENT / 100) : 0;
  const expired = Boolean(isTrial && trialEndsAt && new Date(trialEndsAt).getTime() <= now.getTime());
  const trialDaysRemaining = isTrial && trialEndsAt ? Math.max(Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / 86_400_000), 0) : null;
  const paidUsageDescription = includedCredits > 0
    ? ` ${formatCredits(usedCredits)} de ${formatCredits(includedCredits)} creditos do ciclo ja foram utilizados.`
    : "";

  if (organizationStatus === "trial_pending") {
    return {
      organizationId: organization.id,
      planCode,
      organizationStatus,
      state: "inactive",
      canUseBillableFeatures: false,
      balanceCredits,
      trialStartsAt,
      trialEndsAt,
      trialDaysTotal: TRIAL_DAYS,
      trialDaysRemaining,
      includedCredits,
      usedCredits,
      lowCreditThreshold,
      bannerTone: "amber",
      bannerTitle: "Cadastro pendente",
      bannerDescription: "Complete seus dados para ativar o teste gratis de 7 dias.",
      ctaLabel: "Completar cadastro",
      ctaHref: "/dashboard/minha-conta?complete=1",
    };
  }

  if (isTrial && expired) {
    return {
      organizationId: organization.id,
      planCode,
      organizationStatus,
      state: "trial_expired",
      canUseBillableFeatures: false,
      balanceCredits,
      trialStartsAt,
      trialEndsAt,
      trialDaysTotal: TRIAL_DAYS,
      trialDaysRemaining,
      includedCredits,
      usedCredits,
      lowCreditThreshold,
      bannerTone: "rose",
      bannerTitle: "Teste gratis encerrado",
      bannerDescription: balanceCredits > 0
        ? `Seu teste de 7 dias acabou. ${formatCredits(balanceCredits)} creditos ficaram guardados. Assine em ate ${TRIAL_CREDIT_CONVERSION_GRACE_DAYS} dias para somar esse saldo ao novo plano.`
        : "Seu teste de 7 dias acabou. Seus dados continuam salvos, mas os agentes e recursos com custo estao pausados ate voce escolher um plano.",
      ctaLabel: "Escolher plano",
      ctaHref: "/dashboard/planos",
    };
  }

  if (isTrial && balanceCredits <= 0) {
    return {
      organizationId: organization.id,
      planCode,
      organizationStatus,
      state: "trial_low_credits",
      canUseBillableFeatures: true,
      balanceCredits,
      trialStartsAt,
      trialEndsAt,
      trialDaysTotal: TRIAL_DAYS,
      trialDaysRemaining,
      includedCredits,
      usedCredits,
      lowCreditThreshold,
      bannerTone: "amber",
      bannerTitle: "Teste gratis ativo",
      bannerDescription: "Seu teste de 7 dias continua liberado. Ao final do periodo, os recursos ficam pausados ate voce escolher um plano.",
      ctaLabel: "Assinar agora",
      ctaHref: "/dashboard/planos",
    };
  }

  if (isTrial && balanceCredits <= lowCreditThreshold) {
    return {
      organizationId: organization.id,
      planCode,
      organizationStatus,
      state: "trial_low_credits",
      canUseBillableFeatures: true,
      balanceCredits,
      trialStartsAt,
      trialEndsAt,
      trialDaysTotal: TRIAL_DAYS,
      trialDaysRemaining,
      includedCredits,
      usedCredits,
      lowCreditThreshold,
      bannerTone: "amber",
      bannerTitle: "Creditos de teste quase acabando",
      bannerDescription: `Restam ${formatCredits(balanceCredits)} creditos. Se voce assinar agora, esse saldo soma aos creditos do plano escolhido.`,
      ctaLabel: "Ver planos",
      ctaHref: "/dashboard/planos",
    };
  }

  if (isTrial) {
    return {
      organizationId: organization.id,
      planCode,
      organizationStatus,
      state: "trial_active",
      canUseBillableFeatures: true,
      balanceCredits,
      trialStartsAt,
      trialEndsAt,
      trialDaysTotal: TRIAL_DAYS,
      trialDaysRemaining,
      includedCredits,
      usedCredits,
      lowCreditThreshold,
      bannerTone: "green",
      bannerTitle: "Teste gratis ativo",
      bannerDescription: `${trialDaysRemaining ?? TRIAL_DAYS} dia${trialDaysRemaining === 1 ? "" : "s"} restante${trialDaysRemaining === 1 ? "" : "s"} e ${formatCredits(balanceCredits)} creditos disponiveis. Se assinar durante o teste, o saldo restante soma ao plano.`,
      ctaLabel: "Ver planos",
      ctaHref: "/dashboard/planos",
    };
  }

  if (isPaidPlanExpired(organizationStatus)) {
    return {
      organizationId: organization.id,
      planCode,
      organizationStatus,
      state: "paid_expired",
      canUseBillableFeatures: false,
      balanceCredits,
      trialStartsAt: null,
      trialEndsAt: null,
      trialDaysTotal: 0,
      trialDaysRemaining: null,
      includedCredits,
      usedCredits,
      lowCreditThreshold: 0,
      bannerTone: "rose",
      bannerTitle: "Plano vencido",
      bannerDescription: balanceCredits > 0
        ? `Seu plano venceu. ${formatCredits(balanceCredits)} creditos continuam guardados, mas ficam congelados ate renovar ou migrar de plano.`
        : "Seu plano venceu. O painel continua acessivel, mas os recursos ficam bloqueados ate renovar ou migrar de plano.",
      ctaLabel: "Renovar plano",
      ctaHref: "/dashboard/planos",
    };
  }

  if (balanceCredits <= 0) {
    return {
      organizationId: organization.id,
      planCode,
      organizationStatus,
      state: "paid_no_credits",
      canUseBillableFeatures: false,
      balanceCredits,
      trialStartsAt: null,
      trialEndsAt: null,
      trialDaysTotal: 0,
      trialDaysRemaining: null,
      includedCredits,
      usedCredits,
      lowCreditThreshold: 0,
      bannerTone: "amber",
      bannerTitle: "Creditos acabaram",
      bannerDescription: "Seu painel continua acessivel, mas IA, voz e atendimentos automaticos precisam de creditos para operar.",
      ctaLabel: "Comprar creditos",
      ctaHref: "/dashboard/planos",
    };
  }

  return {
    organizationId: organization.id,
    planCode,
    organizationStatus,
    state: "paid_active",
    canUseBillableFeatures: true,
    balanceCredits,
    trialStartsAt: null,
    trialEndsAt: null,
    trialDaysTotal: 0,
    trialDaysRemaining: null,
    includedCredits,
    usedCredits,
    lowCreditThreshold: 0,
    bannerTone: "cyan",
    bannerTitle: "Plano ativo",
    bannerDescription: `${formatCredits(balanceCredits)} creditos acumulados disponiveis para IA, voz e atendimentos automaticos.${paidUsageDescription}`,
    ctaLabel: "Comprar creditos",
    ctaHref: "/dashboard/planos",
  };
}

export async function assertBillableAccess(input: {
  organizationId: string;
  client?: SupabaseClient;
}) {
  const status = await getOrganizationBillingAccess(input);

  if (!status.canUseBillableFeatures) {
    if (status.state === "trial_no_credits") {
      await enqueueTrialNoCreditsMessage({ organizationId: input.organizationId, client: input.client }).catch(() => null);
    }

    throw new BillingAccessError(status);
  }

  return status;
}

export async function getOrganizationPlanLimits(input: {
  organizationId: string;
  client?: SupabaseClient;
}): Promise<OrganizationPlanLimits> {
  const client = input.client ?? createServiceClient();
  const { data: organization, error: organizationError } = await client
    .from("organizations")
    .select("plan_code")
    .eq("id", input.organizationId)
    .maybeSingle<{ plan_code: string | null }>();

  if (organizationError) {
    throw new Error(`Nao foi possivel carregar plano da empresa: ${organizationError.message}`);
  }

  const planCode = organization?.plan_code ?? null;

  if (planCode === "internal") {
    return {
      planCode,
      agentLimit: Number.MAX_SAFE_INTEGER,
      whatsappInstanceLimit: Number.MAX_SAFE_INTEGER,
      includedCredits: 0,
    };
  }

  const [{ data: plan, error: planError }, { data: billingLimits, error: limitsError }] = await Promise.all([
    client
      .from("billing_plans")
      .select("plan_code, agent_limit, whatsapp_instance_limit, included_credits")
      .eq("plan_code", planCode ?? "")
      .maybeSingle<BillingPlanLimitRow>(),
    client
      .from("organization_billing_limits")
      .select("metadata")
      .eq("organization_id", input.organizationId)
      .maybeSingle<BillingLimitsOverrideRow>(),
  ]);

  if (planError) {
    throw new Error(`Nao foi possivel carregar limites do plano: ${planError.message}`);
  }

  if (limitsError) {
    throw new Error(`Nao foi possivel carregar limites manuais do cliente: ${limitsError.message}`);
  }

  const overrides = readResourceLimitOverrides(billingLimits?.metadata);
  const planAgentLimit = positiveLimit(plan?.agent_limit, fallbackAgentLimit(planCode));
  const planWhatsappLimit = positiveLimit(plan?.whatsapp_instance_limit, fallbackWhatsappLimit(planCode));

  return {
    planCode,
    agentLimit: resolveManualLimit(overrides.agentLimit, planAgentLimit),
    whatsappInstanceLimit: resolveManualLimit(overrides.whatsappInstanceLimit, planWhatsappLimit),
    includedCredits: toNumber(plan?.included_credits),
  };
}

function buildInactiveStatus(organizationId: string): BillingAccessStatus {
  return {
    organizationId,
    planCode: null,
    organizationStatus: null,
    state: "inactive",
    canUseBillableFeatures: false,
    balanceCredits: 0,
    trialStartsAt: null,
    trialEndsAt: null,
    trialDaysTotal: 0,
    trialDaysRemaining: null,
    includedCredits: 0,
    usedCredits: 0,
    lowCreditThreshold: 0,
    bannerTone: "rose",
    bannerTitle: "Empresa indisponivel",
    bannerDescription: "Nao foi possivel validar plano e creditos desta empresa.",
    ctaLabel: "Ver planos",
    ctaHref: "/dashboard/planos",
  };
}

function isPaidPlanExpired(status: string | null) {
  const normalized = (status ?? "").toLowerCase();
  return normalized === "expired"
    || normalized === "past_due"
    || normalized === "cancelled"
    || normalized === "canceled"
    || normalized === "inactive"
    || normalized === "suspended"
    || normalized === "paused"
    || normalized === "pending"
    || normalized === "payment_pending"
    || normalized === "incomplete";
}

function positiveLimit(value: number | string | null | undefined, fallback: number) {
  const limit = toNumber(value);
  return limit > 0 ? limit : fallback;
}

function resolveManualLimit(value: number | null, fallback: number) {
  return value !== null && value >= 0 ? value : fallback;
}

function readResourceLimitOverrides(metadata: Record<string, unknown> | null | undefined) {
  const raw = metadata?.resource_overrides;
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};

  return {
    agentLimit: readNullableLimit(record.agent_limit),
    whatsappInstanceLimit: readNullableLimit(record.whatsapp_instance_limit),
  };
}

function readNullableLimit(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

function fallbackAgentLimit(planCode: string | null) {
  if (planCode === TRIAL_PLAN_CODE) return 1;
  if (planCode === "starter") return 1;
  if (planCode === "pro") return 4;
  if (planCode === "scale") return 8;
  return 0;
}

function fallbackWhatsappLimit(planCode: string | null) {
  if (planCode === TRIAL_PLAN_CODE) return 1;
  if (planCode === "starter") return 1;
  if (planCode === "pro") return 4;
  if (planCode === "scale") return 8;
  return 0;
}

async function loadBillingCycles(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from("billing_cycles")
    .select("id, cycle_start, cycle_end, included_credits, used_credits, status, billing_plans(plan_code, included_credits)")
    .eq("organization_id", organizationId)
    .order("cycle_end", { ascending: false })
    .limit(8)
    .returns<BillingCycleRow[]>();

  if (error) {
    throw new Error(`Nao foi possivel carregar ciclos de billing: ${error.message}`);
  }

  return data ?? [];
}

function findCurrentBillingCycle(cycles: BillingCycleRow[], now: Date) {
  const nowTime = now.getTime();

  return cycles.find((cycle) => {
    const startsAt = new Date(cycle.cycle_start ?? 0).getTime();
    const endsAt = new Date(cycle.cycle_end ?? 0).getTime();

    return cycle.status === "open"
      && Number.isFinite(startsAt)
      && Number.isFinite(endsAt)
      && startsAt <= nowTime
      && endsAt > nowTime;
  }) ?? null;
}

function resolveCycleUsedCredits({
  balanceCredits,
  cycle,
  includedCredits,
  isTrial,
}: {
  balanceCredits: number;
  cycle: BillingCycleRow | null;
  includedCredits: number;
  isTrial: boolean;
}) {
  const cycleUsedCredits = toNumber(cycle?.used_credits);

  if (cycleUsedCredits > 0 || !isTrial) {
    return cycleUsedCredits;
  }

  return Math.max(includedCredits - balanceCredits, 0);
}

function readPlanCode(relation: BillingPlanRelation) {
  const plan = Array.isArray(relation) ? relation[0] : relation;
  return plan?.plan_code ?? null;
}

function readPlanIncludedCredits(relation: BillingPlanRelation | undefined) {
  const plan = Array.isArray(relation) ? relation[0] : relation;
  return toNumber(plan?.included_credits);
}

function addDaysIso(value: string | null | undefined, days: number) {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();

  if (!Number.isFinite(time)) {
    return null;
  }

  return new Date(time + days * 86_400_000).toISOString();
}

function formatCredits(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: value < 10 ? 2 : 0,
  }).format(Math.max(value, 0));
}

function toNumber(value: number | string | null | undefined) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}
