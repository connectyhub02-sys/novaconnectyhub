import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

export const TRIAL_PLAN_CODE = "trial";
export const TRIAL_DAYS = 7;
export const TRIAL_INCLUDED_CREDITS = 1000;
export const LOW_CREDIT_PERCENT = 20;

export type BillingAccessState =
  | "trial_active"
  | "trial_low_credits"
  | "trial_no_credits"
  | "trial_expired"
  | "paid_active"
  | "paid_no_credits"
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
} | Array<{
  plan_code: string | null;
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

export class BillingAccessError extends Error {
  status: BillingAccessStatus;

  constructor(status: BillingAccessStatus) {
    super(status.bannerDescription);
    this.name = "BillingAccessError";
    this.status = status;
  }
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

  const cycle = await loadTrialCycle(client, input.organizationId);
  const planCode = organization.plan_code;
  const organizationStatus = organization.status;
  const isTrial = planCode === TRIAL_PLAN_CODE || organizationStatus === "trial" || organizationStatus === "trial_expired";
  const balanceCredits = toNumber(wallet?.balance_credits);
  const fallbackTrialStart = organization.created_at;
  const fallbackTrialEnd = addDaysIso(fallbackTrialStart, TRIAL_DAYS);
  const trialStartsAt = cycle?.cycle_start ?? (isTrial ? fallbackTrialStart : null);
  const trialEndsAt = cycle?.cycle_end ?? (isTrial ? fallbackTrialEnd : null);
  const includedCredits = toNumber(cycle?.included_credits) || (isTrial ? TRIAL_INCLUDED_CREDITS : 0);
  const usedCredits = toNumber(cycle?.used_credits) || Math.max(TRIAL_INCLUDED_CREDITS - balanceCredits, 0);
  const lowCreditThreshold = includedCredits > 0 ? includedCredits * (LOW_CREDIT_PERCENT / 100) : 0;
  const expired = Boolean(isTrial && trialEndsAt && new Date(trialEndsAt).getTime() <= now.getTime());
  const trialDaysRemaining = isTrial && trialEndsAt ? Math.max(Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / 86_400_000), 0) : null;

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
      bannerDescription: "Seu teste de 7 dias acabou. Seus dados continuam salvos, mas os agentes e recursos com custo estao pausados.",
      ctaLabel: "Escolher plano",
      ctaHref: "/#planos",
    };
  }

  if (isTrial && balanceCredits <= 0) {
    return {
      organizationId: organization.id,
      planCode,
      organizationStatus,
      state: "trial_no_credits",
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
      bannerTitle: "Creditos de teste acabaram",
      bannerDescription: "Voce ainda pode mexer no painel, mas os atendimentos automaticos, IA e voz ficam pausados ate assinar um plano.",
      ctaLabel: "Assinar agora",
      ctaHref: "/#planos",
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
      bannerDescription: `Restam ${formatCredits(balanceCredits)} creditos. Para continuar atendendo sem pausa, escolha um plano.`,
      ctaLabel: "Ver planos",
      ctaHref: "/#planos",
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
      bannerDescription: `${trialDaysRemaining ?? TRIAL_DAYS} dia${trialDaysRemaining === 1 ? "" : "s"} restante${trialDaysRemaining === 1 ? "" : "s"} e ${formatCredits(balanceCredits)} creditos disponiveis.`,
      ctaLabel: "Ver planos",
      ctaHref: "/#planos",
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
      includedCredits: 0,
      usedCredits: 0,
      lowCreditThreshold: 0,
      bannerTone: "amber",
      bannerTitle: "Creditos acabaram",
      bannerDescription: "Seu painel continua acessivel, mas IA, voz e atendimentos automaticos precisam de creditos para operar.",
      ctaLabel: "Comprar creditos",
      ctaHref: "/#planos",
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
    includedCredits: 0,
    usedCredits: 0,
    lowCreditThreshold: 0,
    bannerTone: "cyan",
    bannerTitle: "Plano ativo",
    bannerDescription: `${formatCredits(balanceCredits)} creditos disponiveis para IA, voz e atendimentos automaticos.`,
    ctaLabel: "Comprar creditos",
    ctaHref: "/#planos",
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
    ctaHref: "/#planos",
  };
}

async function loadTrialCycle(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from("billing_cycles")
    .select("id, cycle_start, cycle_end, included_credits, used_credits, status, billing_plans(plan_code)")
    .eq("organization_id", organizationId)
    .order("cycle_end", { ascending: false })
    .limit(5)
    .returns<BillingCycleRow[]>();

  if (error) {
    throw new Error(`Nao foi possivel carregar ciclo do teste gratis: ${error.message}`);
  }

  return (data ?? []).find((cycle) => readPlanCode(cycle.billing_plans) === TRIAL_PLAN_CODE) ?? null;
}

function readPlanCode(relation: BillingPlanRelation) {
  const plan = Array.isArray(relation) ? relation[0] : relation;
  return plan?.plan_code ?? null;
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
