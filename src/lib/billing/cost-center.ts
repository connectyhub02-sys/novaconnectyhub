import type { SupabaseClient } from "@supabase/supabase-js";

export const billingProviders = [
  "gemini",
  "elevenlabs",
  "uazapi",
  "meta",
  "google_ads",
  "r2",
  "inngest",
  "stripe",
  "wordpress",
  "vercel",
  "openai",
  "supabase",
  "custom",
] as const;

export type BillingProvider = (typeof billingProviders)[number];

export type BillingUnit =
  | "input_token"
  | "output_token"
  | "character"
  | "credit"
  | "request"
  | "minute"
  | "megabyte"
  | "instance"
  | "message"
  | "media"
  | "custom";

export type UsageEventStatus = "pending" | "completed" | "failed" | "refunded";

export type UsageChargeInput = {
  inputUnits?: number;
  outputUnits?: number;
  inputPricePerUnit?: number;
  outputPricePerUnit?: number;
  minimumChargeCredits?: number;
};

export type UsageEventInput = {
  organizationId: string;
  userId?: string | null;
  provider: BillingProvider;
  featureCode: string;
  modelId?: string | null;
  agentId?: string | null;
  conversationId?: string | null;
  leadId?: string | null;
  status?: UsageEventStatus;
  inputUnits?: number;
  outputUnits?: number;
  providerCost?: number;
  connectyChargeCredits?: number;
  connectyRevenueEstimate?: number;
  grossMarginEstimate?: number;
  currency?: string;
  requestId?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
};

export type UsageEventRow = {
  id: string;
  organization_id: string;
  provider: BillingProvider;
  feature_code: string;
  model_id: string | null;
  status: UsageEventStatus;
  input_units: number;
  output_units: number;
  provider_cost: number;
  connecty_charge_credits: number;
  connecty_revenue_estimate: number;
  gross_margin_estimate: number;
  created_at: string;
};

export type CreditGrantInput = {
  organizationId: string;
  amountCredits: number;
  description?: string;
  externalReference?: string;
  metadata?: Record<string, unknown>;
  transactionType?: "grant" | "purchase" | "refund" | "adjustment";
};

export type CreditDebitInput = {
  organizationId: string;
  amountCredits: number;
  provider?: BillingProvider;
  usageEventId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export type WalletRow = {
  id: string;
  organization_id: string;
  balance_credits: number;
  reserved_credits: number;
  lifetime_purchased_credits: number;
  lifetime_used_credits: number;
  status: string;
};

export const providerLabels: Record<BillingProvider, string> = {
  gemini: "Gemini / Google AI Core",
  elevenlabs: "ElevenLabs / Voz",
  uazapi: "Uazapi / WhatsApp",
  meta: "Meta Ads / Instagram",
  google_ads: "Google Ads",
  r2: "Cloudflare R2",
  inngest: "Inngest",
  stripe: "Stripe",
  wordpress: "WordPress",
  vercel: "Vercel",
  openai: "OpenAI",
  supabase: "Supabase",
  custom: "Custom",
};

export function calculateUsageCharge(input: UsageChargeInput) {
  const inputCharge = (input.inputUnits ?? 0) * (input.inputPricePerUnit ?? 0);
  const outputCharge = (input.outputUnits ?? 0) * (input.outputPricePerUnit ?? 0);
  const rawCharge = inputCharge + outputCharge;
  const minimumCharge = input.minimumChargeCredits ?? 0;

  return roundCredits(Math.max(rawCharge, minimumCharge));
}

export function calculateGrossMargin(providerCost: number, connectyRevenue: number) {
  return roundMoney(Math.max(connectyRevenue - providerCost, 0));
}

export function calculateMarginPercent(providerCost: number, connectyRevenue: number) {
  if (connectyRevenue <= 0) {
    return 0;
  }

  return roundPercent(((connectyRevenue - providerCost) / connectyRevenue) * 100);
}

export function canDebitCredits({
  balanceCredits,
  debitCredits,
  allowOverage = false,
  overageLimitCredits = 0,
}: {
  balanceCredits: number;
  debitCredits: number;
  allowOverage?: boolean;
  overageLimitCredits?: number;
}) {
  const available = balanceCredits + (allowOverage ? overageLimitCredits : 0);
  return available >= debitCredits;
}

export async function ensureCreditWallet(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client.rpc("ensure_credit_wallet", {
    p_organization_id: organizationId,
  });

  if (error) {
    throw new Error(`Nao foi possivel garantir a carteira de creditos: ${error.message}`);
  }

  return data as WalletRow;
}

export async function grantCredits(client: SupabaseClient, input: CreditGrantInput) {
  const { data, error } = await client.rpc("grant_credit_wallet", {
    p_organization_id: input.organizationId,
    p_amount_credits: input.amountCredits,
    p_description: input.description ?? null,
    p_external_reference: input.externalReference ?? null,
    p_metadata: input.metadata ?? {},
    p_transaction_type: input.transactionType ?? "grant",
  });

  if (error) {
    throw new Error(`Nao foi possivel creditar a carteira: ${error.message}`);
  }

  return String(data);
}

export async function debitCredits(client: SupabaseClient, input: CreditDebitInput) {
  const { data, error } = await client.rpc("debit_credit_wallet", {
    p_organization_id: input.organizationId,
    p_amount_credits: input.amountCredits,
    p_provider: input.provider ?? null,
    p_usage_event_id: input.usageEventId ?? null,
    p_description: input.description ?? null,
    p_metadata: input.metadata ?? {},
  });

  if (error) {
    throw new Error(`Nao foi possivel debitar creditos: ${error.message}`);
  }

  return String(data);
}

export async function recordUsageEvent(client: SupabaseClient, input: UsageEventInput) {
  const providerCost = roundMoney(input.providerCost ?? 0);
  const connectyRevenue = roundMoney(input.connectyRevenueEstimate ?? input.connectyChargeCredits ?? 0);
  const grossMargin = roundMoney(input.grossMarginEstimate ?? calculateGrossMargin(providerCost, connectyRevenue));

  const { data, error } = await client
    .from("usage_events")
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId ?? null,
      provider: input.provider,
      feature_code: input.featureCode,
      model_id: input.modelId ?? null,
      agent_id: input.agentId ?? null,
      conversation_id: input.conversationId ?? null,
      lead_id: input.leadId ?? null,
      status: input.status ?? "completed",
      input_units: roundUsageUnits(input.inputUnits ?? 0),
      output_units: roundUsageUnits(input.outputUnits ?? 0),
      provider_cost: providerCost,
      connecty_charge_credits: roundCredits(input.connectyChargeCredits ?? 0),
      connecty_revenue_estimate: connectyRevenue,
      gross_margin_estimate: grossMargin,
      currency: input.currency ?? "BRL",
      request_id: input.requestId ?? null,
      error_message: input.errorMessage ?? null,
      metadata: input.metadata ?? {},
      occurred_at: input.occurredAt ?? new Date().toISOString(),
    })
    .select(
      "id, organization_id, provider, feature_code, model_id, status, input_units, output_units, provider_cost, connecty_charge_credits, connecty_revenue_estimate, gross_margin_estimate, created_at",
    )
    .single();

  if (error) {
    throw new Error(`Nao foi possivel registrar evento de uso: ${error.message}`);
  }

  return data as UsageEventRow;
}

export async function recordUsageAndDebitCredits(
  client: SupabaseClient,
  usage: UsageEventInput,
  debitDescription = "Consumo ConnectyHub",
) {
  const event = await recordUsageEvent(client, usage);
  const charge = Number(event.connecty_charge_credits ?? 0);

  if (charge > 0 && event.status === "completed") {
    await debitCredits(client, {
      organizationId: usage.organizationId,
      amountCredits: charge,
      provider: usage.provider,
      usageEventId: event.id,
      description: debitDescription,
      metadata: {
        featureCode: usage.featureCode,
        modelId: usage.modelId ?? null,
        requestId: usage.requestId ?? null,
      },
    });
  }

  return event;
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

function roundPercent(value: number) {
  return round(value, 2);
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor;
}
