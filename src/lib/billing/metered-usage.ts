import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CONNECTY_CREDIT_UNIT_BRL } from "@/lib/billing/credit-economics";
import {
  calculateGrossMargin,
  recordUsageAndDebitCredits,
  recordUsageEvent,
  type BillingProvider,
  type BillingUnit,
  type UsageAgentScope,
  type UsageBillingMode,
  type UsageEventStatus,
} from "@/lib/billing/cost-center";

type JsonRecord = Record<string, unknown>;

type UsageOrganizationRow = {
  id: string;
  name: string | null;
  slug: string | null;
  plan_code: string | null;
  status: string | null;
};

type CostCenterRow = {
  id: string;
};

type FeatureRow = {
  id: string;
  feature_code: string;
  enabled: boolean | null;
  billable: boolean | null;
};

type ModelRow = {
  id: string;
  provider_model_id: string;
  feature_code: string | null;
};

type BillingRateRow = {
  id: string;
  feature_id: string | null;
  model_id: string | null;
  plan_code: string | null;
  unit: BillingUnit | string;
  provider_cost_per_unit: number | string | null;
  connecty_price_per_unit: number | string | null;
  minimum_charge_credits: number | string | null;
  effective_from: string | null;
};

type AgentRunUsageRow = {
  input_tokens: number | string | null;
  output_tokens: number | string | null;
  connecty_charge_credits: number | string | null;
};

export type MeteredUsageInput = {
  organizationId?: string | null;
  userId?: string | null;
  provider: BillingProvider;
  featureCode: string;
  modelId?: string | null;
  agentId?: string | null;
  agentRunId?: string | null;
  conversationId?: string | null;
  leadId?: string | null;
  status?: UsageEventStatus;
  billingMode?: UsageBillingMode;
  agentScope?: UsageAgentScope;
  inputUnits?: number;
  outputUnits?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  characters?: number;
  requests?: number;
  messages?: number;
  media?: number;
  minutes?: number;
  megabytes?: number;
  credits?: number;
  quantity?: number;
  providerCostOverride?: number;
  connectyChargeCreditsOverride?: number;
  requestId?: string | null;
  errorMessage?: string | null;
  metadata?: JsonRecord;
  occurredAt?: string;
  debitDescription?: string;
};

export type MeteredUsageResult = {
  usageEventId: string;
  billingMode: UsageBillingMode;
  agentScope: UsageAgentScope;
  debited: boolean;
  deduplicated: boolean;
  providerCost: number;
  chargeCredits: number;
  revenueEstimate: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type MeteredRate = {
  id?: string | null;
  unit: BillingUnit | string;
  providerCostPerUnit: number;
  connectyPricePerUnit: number;
  minimumChargeCredits: number;
};

export type MeteredUsageUnits = {
  inputUnits?: number;
  outputUnits?: number;
  inputTokens?: number;
  outputTokens?: number;
  characters?: number;
  requests?: number;
  messages?: number;
  media?: number;
  minutes?: number;
  megabytes?: number;
  credits?: number;
  quantity?: number;
};

export type CalculatedMeteredUsageCharge = {
  providerCost: number;
  chargeCredits: number;
  rawChargeCredits: number;
  minimumChargeCredits: number;
  matchedUnits: number;
  matchedRates: Array<{
    id: string | null;
    unit: string;
    units: number;
    providerCostPerUnit: number;
    connectyPricePerUnit: number;
    minimumChargeCredits: number;
  }>;
};

export type GeminiTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
  thoughtsTokens: number;
  raw: JsonRecord;
};

export async function meterUsageEvent(
  client: SupabaseClient,
  input: MeteredUsageInput,
): Promise<MeteredUsageResult> {
  const organizationId = input.organizationId ?? await resolveInternalUsageOrganizationId(client);

  if (!organizationId) {
    throw new Error("Nao foi possivel resolver a organizacao para registrar consumo.");
  }

  const organization = await loadUsageOrganization(client, organizationId);
  const agentScope = input.agentScope ?? resolveAgentScope(organization);
  const billingMode = input.billingMode ?? resolveBillingMode(organization, agentScope);
  const status = input.status ?? "completed";
  const normalizedModelId = normalizeProviderModelId(input.modelId);
  const rates = await resolveActiveBillingRates(client, {
    provider: input.provider,
    featureCode: input.featureCode,
    modelId: normalizedModelId,
    planCode: organization?.plan_code ?? null,
  });
  const units = buildUsageUnits(input);
  const calculated = calculateMeteredUsageCharge({
    rates,
    units,
    chargeCreditsOverride: input.connectyChargeCreditsOverride,
    providerCostOverride: input.providerCostOverride,
  });
  const chargeCredits = billingMode === "free" ? 0 : calculated.chargeCredits;
  const debited = shouldDebitBillingMode(billingMode) && status === "completed" && chargeCredits > 0;
  const revenueEstimate = debited ? roundMoney(chargeCredits * CONNECTY_CREDIT_UNIT_BRL) : 0;
  const providerCost = input.providerCostOverride === undefined
    ? calculated.providerCost
    : roundMoney(input.providerCostOverride);
  const grossMargin = calculateGrossMargin(providerCost, revenueEstimate);
  const inputTokens = roundUsageUnits(units.inputTokens ?? 0);
  const outputTokens = roundUsageUnits(units.outputTokens ?? 0);
  const totalTokens = roundUsageUnits(input.totalTokens ?? inputTokens + outputTokens);
  const metadata = {
    ...(input.metadata ?? {}),
    billing_mode: billingMode,
    agent_scope: agentScope,
    metering: {
      provider: input.provider,
      featureCode: input.featureCode,
      modelId: normalizedModelId,
      planCode: organization?.plan_code ?? null,
      organizationStatus: organization?.status ?? null,
      debited,
      equivalentChargeCredits: chargeCredits,
      equivalentRevenueBrl: roundMoney(chargeCredits * CONNECTY_CREDIT_UNIT_BRL),
      rawChargeCredits: calculated.rawChargeCredits,
      minimumChargeCredits: calculated.minimumChargeCredits,
      matchedUnits: calculated.matchedUnits,
      matchedRates: calculated.matchedRates,
    },
  };
  const usageInput = {
    organizationId,
    userId: input.userId ?? null,
    provider: input.provider,
    featureCode: input.featureCode,
    modelId: normalizedModelId,
    agentId: input.agentId ?? null,
    agentRunId: input.agentRunId ?? null,
    conversationId: input.conversationId ?? null,
    leadId: input.leadId ?? null,
    billingMode,
    agentScope,
    status,
    inputUnits: input.inputUnits ?? input.inputTokens ?? 0,
    outputUnits: input.outputUnits ?? input.outputTokens ?? input.characters ?? 0,
    inputTokens,
    outputTokens,
    totalTokens,
    providerCost,
    connectyChargeCredits: chargeCredits,
    connectyRevenueEstimate: revenueEstimate,
    grossMarginEstimate: grossMargin,
    requestId: input.requestId ?? null,
    errorMessage: input.errorMessage ?? null,
    metadata,
    occurredAt: input.occurredAt,
  };
  const event = debited
    ? await recordUsageAndDebitCredits(client, usageInput, input.debitDescription ?? "Consumo de agente ConnectyHub")
    : await recordUsageEvent(client, usageInput);

  if (input.agentRunId) {
    await refreshAgentRunUsageTotals(client, input.agentRunId, {
      lastUsageEventId: event.id,
      billingMode,
      agentScope,
      provider: input.provider,
      featureCode: input.featureCode,
      modelId: normalizedModelId,
      meteredAt: new Date().toISOString(),
    });
  }

  return {
    usageEventId: event.id,
    billingMode,
    agentScope,
    debited: debited && !event.deduplicated,
    deduplicated: event.deduplicated === true,
    providerCost,
    chargeCredits,
    revenueEstimate,
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

export function calculateMeteredUsageCharge(input: {
  rates: MeteredRate[];
  units: MeteredUsageUnits;
  chargeCreditsOverride?: number;
  providerCostOverride?: number;
}): CalculatedMeteredUsageCharge {
  let providerCost = 0;
  let rawChargeCredits = 0;
  let minimumChargeCredits = 0;
  let matchedUnits = 0;
  const matchedRates: CalculatedMeteredUsageCharge["matchedRates"] = [];

  for (const rate of input.rates) {
    const units = resolveUnitsForRate(rate.unit, input.units);

    if (units <= 0) {
      continue;
    }

    const providerCostPerUnit = toNumber(rate.providerCostPerUnit);
    const connectyPricePerUnit = toNumber(rate.connectyPricePerUnit);
    const minimum = toNumber(rate.minimumChargeCredits);

    providerCost += units * providerCostPerUnit;
    rawChargeCredits += units * connectyPricePerUnit;
    minimumChargeCredits = Math.max(minimumChargeCredits, minimum);
    matchedUnits += units;
    matchedRates.push({
      id: rate.id ?? null,
      unit: String(rate.unit),
      units: roundUsageUnits(units),
      providerCostPerUnit,
      connectyPricePerUnit,
      minimumChargeCredits: minimum,
    });
  }

  if (input.providerCostOverride !== undefined) {
    providerCost = input.providerCostOverride;
  }

  let chargeCredits = matchedUnits > 0 ? Math.max(rawChargeCredits, minimumChargeCredits) : 0;

  if (input.chargeCreditsOverride !== undefined) {
    chargeCredits = input.chargeCreditsOverride;
  }

  return {
    providerCost: roundMoney(providerCost),
    chargeCredits: roundCredits(chargeCredits),
    rawChargeCredits: roundCredits(rawChargeCredits),
    minimumChargeCredits: roundCredits(matchedUnits > 0 ? minimumChargeCredits : 0),
    matchedUnits: roundUsageUnits(matchedUnits),
    matchedRates,
  };
}

export function extractGeminiUsageMetadata(data: unknown): GeminiTokenUsage | null {
  const metadata = readRecord(readRecord(data)?.usageMetadata) ?? readRecord(readRecord(data)?.usage_metadata);

  if (!metadata) {
    return null;
  }

  const inputTokens = readNumeric(metadata, [
    "promptTokenCount",
    "prompt_token_count",
    "inputTokenCount",
    "input_token_count",
  ]);
  const outputTokens = readNumeric(metadata, [
    "candidatesTokenCount",
    "candidates_token_count",
    "outputTokenCount",
    "output_token_count",
  ]);
  const cachedTokens = readNumeric(metadata, ["cachedContentTokenCount", "cached_content_token_count"]);
  const thoughtsTokens = readNumeric(metadata, ["thoughtsTokenCount", "thoughts_token_count"]);
  const totalTokens = readNumeric(metadata, ["totalTokenCount", "total_token_count"]) || inputTokens + outputTokens + thoughtsTokens;

  if (inputTokens <= 0 && outputTokens <= 0 && totalTokens <= 0) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedTokens,
    thoughtsTokens,
    raw: metadata,
  };
}

export function estimateTokensFromText(value: string | null | undefined) {
  const text = value?.trim() ?? "";

  if (!text) {
    return 0;
  }

  return Math.max(1, Math.ceil(text.length / 4));
}

async function resolveActiveBillingRates(
  client: SupabaseClient,
  input: {
    provider: BillingProvider;
    featureCode: string;
    modelId: string | null;
    planCode: string | null;
  },
): Promise<MeteredRate[]> {
  const { data: costCenter, error: costCenterError } = await client
    .from("provider_cost_centers")
    .select("id")
    .eq("provider", input.provider)
    .maybeSingle<CostCenterRow>();

  if (costCenterError) {
    throw new Error(`Nao foi possivel carregar centro de custo ${input.provider}: ${costCenterError.message}`);
  }

  if (!costCenter?.id) {
    return [];
  }

  const [featuresResult, modelsResult, ratesResult] = await Promise.all([
    client
      .from("provider_features")
      .select("id, feature_code, enabled, billable")
      .eq("cost_center_id", costCenter.id)
      .limit(500),
    client
      .from("provider_models")
      .select("id, provider_model_id, feature_code")
      .eq("cost_center_id", costCenter.id)
      .limit(500),
    client
      .from("billing_rates")
      .select("id, feature_id, model_id, plan_code, unit, provider_cost_per_unit, connecty_price_per_unit, minimum_charge_credits, effective_from")
      .eq("cost_center_id", costCenter.id)
      .eq("active", true)
      .limit(500),
  ]);

  const firstError = featuresResult.error ?? modelsResult.error ?? ratesResult.error;
  if (firstError) {
    throw new Error(`Nao foi possivel carregar tarifas de ${input.provider}: ${firstError.message}`);
  }

  const features = (featuresResult.data ?? []) as FeatureRow[];
  const models = (modelsResult.data ?? []) as ModelRow[];
  const feature = features.find((item) => item.feature_code === input.featureCode) ?? null;

  if (feature && (feature.enabled === false || feature.billable === false)) {
    return [];
  }

  const model = input.modelId
    ? models.find((item) => normalizeProviderModelId(item.provider_model_id) === input.modelId) ?? null
    : null;
  const featureById = new Map(features.map((item) => [item.id, item]));
  const modelById = new Map(models.map((item) => [item.id, item]));
  const rankedRates = ((ratesResult.data ?? []) as BillingRateRow[])
    .map((rate) => ({ rate, score: scoreBillingRate(rate, { feature, model, featureById, modelById, ...input }) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || compareEffectiveFrom(b.rate.effective_from, a.rate.effective_from));
  const bestByUnit = new Map<string, BillingRateRow>();

  for (const item of rankedRates) {
    const unit = String(item.rate.unit);

    if (!bestByUnit.has(unit)) {
      bestByUnit.set(unit, item.rate);
    }
  }

  return Array.from(bestByUnit.values()).map((rate) => ({
    id: rate.id,
    unit: rate.unit,
    providerCostPerUnit: toNumber(rate.provider_cost_per_unit),
    connectyPricePerUnit: toNumber(rate.connecty_price_per_unit),
    minimumChargeCredits: toNumber(rate.minimum_charge_credits),
  }));
}

function scoreBillingRate(
  rate: BillingRateRow,
  input: {
    feature: FeatureRow | null;
    model: ModelRow | null;
    featureCode: string;
    modelId: string | null;
    planCode: string | null;
    featureById: Map<string, FeatureRow>;
    modelById: Map<string, ModelRow>;
  },
) {
  let score = 0;

  if (rate.plan_code) {
    if (rate.plan_code !== input.planCode) {
      return -1;
    }

    score += 20;
  }

  if (rate.feature_id) {
    const ratedFeature = input.featureById.get(rate.feature_id);

    if (input.feature && rate.feature_id === input.feature.id) {
      score += 10;
    } else if (ratedFeature?.feature_code === input.featureCode) {
      score += 8;
    } else {
      return -1;
    }
  } else {
    score += 1;
  }

  if (rate.model_id) {
    const ratedModel = input.modelById.get(rate.model_id);

    if (input.model && rate.model_id === input.model.id) {
      score += 6;
    } else if (input.modelId && normalizeProviderModelId(ratedModel?.provider_model_id) === input.modelId) {
      score += 5;
    } else if (!input.modelId && ratedModel?.feature_code === input.featureCode) {
      score += 2;
    } else {
      return -1;
    }
  } else {
    score += 1;
  }

  return score;
}

async function refreshAgentRunUsageTotals(
  client: SupabaseClient,
  runId: string,
  billingMetadata: JsonRecord,
) {
  const { data: usageRows, error: usageError } = await client
    .from("usage_events")
    .select("input_tokens, output_tokens, connecty_charge_credits")
    .eq("agent_run_id", runId)
    .eq("status", "completed")
    .limit(100);

  if (usageError) {
    throw new Error(`Nao foi possivel consolidar consumo da execucao: ${usageError.message}`);
  }

  const totals = ((usageRows ?? []) as AgentRunUsageRow[]).reduce(
    (acc, row) => {
      acc.inputTokens += toNumber(row.input_tokens);
      acc.outputTokens += toNumber(row.output_tokens);
      acc.costCredits += toNumber(row.connecty_charge_credits);
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, costCredits: 0 },
  );
  const { data: current } = await client
    .from("agent_runs")
    .select("metadata")
    .eq("id", runId)
    .maybeSingle<{ metadata: JsonRecord | null }>();
  const currentMetadata = readRecord(current?.metadata) ?? {};
  const currentBilling = readRecord(currentMetadata.billing) ?? {};

  await client
    .from("agent_runs")
    .update({
      input_tokens: roundUsageUnits(totals.inputTokens),
      output_tokens: roundUsageUnits(totals.outputTokens),
      cost_credits: roundCredits(totals.costCredits),
      metadata: {
        ...currentMetadata,
        billing: {
          ...currentBilling,
          ...billingMetadata,
          inputTokens: roundUsageUnits(totals.inputTokens),
          outputTokens: roundUsageUnits(totals.outputTokens),
          costCredits: roundCredits(totals.costCredits),
        },
      },
    })
    .eq("id", runId);
}

function buildUsageUnits(input: MeteredUsageInput): MeteredUsageUnits {
  const inputTokens = input.inputTokens ?? input.inputUnits ?? 0;
  const outputTokens = input.outputTokens ?? input.outputUnits ?? 0;

  return {
    inputUnits: input.inputUnits ?? inputTokens,
    outputUnits: input.outputUnits ?? outputTokens,
    inputTokens,
    outputTokens,
    characters: input.characters,
    requests: input.requests,
    messages: input.messages,
    media: input.media,
    minutes: input.minutes,
    megabytes: input.megabytes,
    credits: input.credits,
    quantity: input.quantity,
  };
}

function resolveUnitsForRate(unit: BillingUnit | string, units: MeteredUsageUnits) {
  switch (unit) {
    case "input_token":
      return positiveNumber(units.inputTokens ?? units.inputUnits);
    case "output_token":
      return positiveNumber(units.outputTokens ?? units.outputUnits);
    case "character":
      return positiveNumber(units.characters ?? units.outputUnits ?? units.inputUnits);
    case "request":
      return positiveNumber(units.requests ?? units.quantity ?? 1);
    case "message":
      return positiveNumber(units.messages ?? units.quantity ?? 1);
    case "media":
      return positiveNumber(units.media ?? units.quantity ?? 1);
    case "minute":
      return positiveNumber(units.minutes ?? units.quantity);
    case "megabyte":
      return positiveNumber(units.megabytes ?? units.quantity);
    case "credit":
      return positiveNumber(units.credits ?? units.quantity);
    case "custom":
      return positiveNumber(units.quantity ?? units.inputUnits ?? units.outputUnits);
    default:
      return positiveNumber(units.quantity ?? units.inputUnits ?? units.outputUnits);
  }
}

async function loadUsageOrganization(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from("organizations")
    .select("id, name, slug, plan_code, status")
    .eq("id", organizationId)
    .maybeSingle<UsageOrganizationRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar organizacao para metering: ${error.message}`);
  }

  return data ?? null;
}

async function resolveInternalUsageOrganizationId(client: SupabaseClient) {
  const { data } = await client
    .from("organizations")
    .select("id")
    .eq("plan_code", "internal")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  return data?.id ?? null;
}

function resolveAgentScope(organization: UsageOrganizationRow | null): UsageAgentScope {
  return organization?.plan_code === "internal" ? "internal" : "customer";
}

function resolveBillingMode(organization: UsageOrganizationRow | null, agentScope: UsageAgentScope): UsageBillingMode {
  if (agentScope === "platform" || agentScope === "internal" || organization?.plan_code === "internal") {
    return "internal_shadow";
  }

  if (organization?.plan_code === "trial" || organization?.status === "trial" || organization?.status === "trial_pending") {
    return "trial_billable";
  }

  return "customer_billable";
}

function shouldDebitBillingMode(mode: UsageBillingMode) {
  return mode === "customer_billable" || mode === "trial_billable";
}

function normalizeProviderModelId(value: string | null | undefined) {
  const normalized = value?.trim().replace(/^models\//, "") ?? "";
  return normalized.length > 0 ? normalized : null;
}

function readRecord(value: unknown): JsonRecord | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readNumeric(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const parsed = typeof value === "number" ? value : Number(value ?? 0);

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

function compareEffectiveFrom(left: string | null, right: string | null) {
  return new Date(left ?? 0).getTime() - new Date(right ?? 0).getTime();
}

function positiveNumber(value: number | string | null | undefined) {
  return Math.max(toNumber(value), 0);
}

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundUsageUnits(value: number) {
  return round(value, 6);
}

function roundCredits(value: number) {
  return round(value, 6);
}

function roundMoney(value: number) {
  return round(value, 8);
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor;
}
