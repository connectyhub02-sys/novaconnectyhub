import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { BillingProvider } from "./cost-center";

export type BillingProviderSummary = {
  provider: BillingProvider | "unknown";
  label: string;
  events: number;
  providerCost: number;
  connectyRevenue: number;
  grossMargin: number;
  chargeCredits: number;
};

export type BillingAdminSummary = {
  schemaReady: boolean;
  periodLabel: string;
  sinceIso: string;
  totals: {
    usageEvents: number;
    providerCost: number;
    connectyRevenue: number;
    grossMargin: number;
    chargeCredits: number;
    walletBalanceCredits: number;
    activeCostCenters: number;
    activeRates: number;
  };
  providers: BillingProviderSummary[];
  warnings: string[];
};

type UsageRow = {
  provider: BillingProvider | string | null;
  provider_cost: number | string | null;
  connecty_revenue_estimate: number | string | null;
  gross_margin_estimate: number | string | null;
  connecty_charge_credits: number | string | null;
};

type WalletRow = {
  balance_credits: number | string | null;
};

type CostCenterRow = {
  provider: BillingProvider | string | null;
  name: string | null;
  enabled: boolean | null;
};

type RateRow = {
  active: boolean | null;
};

const providerNames: Record<string, string> = {
  gemini: "Gemini / Google AI Core",
  elevenlabs: "ElevenLabs / Voz",
  uazapi: "Uazapi / WhatsApp",
  meta: "Meta / Instagram",
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

export async function getBillingAdminSummary(): Promise<BillingAdminSummary> {
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceIso = since.toISOString();

  const [usageResult, walletResult, costCenterResult, rateResult] = await Promise.all([
    supabase
      .from("usage_events")
      .select("provider, provider_cost, connecty_revenue_estimate, gross_margin_estimate, connecty_charge_credits")
      .gte("occurred_at", sinceIso)
      .limit(5000),
    supabase
      .from("credit_wallets")
      .select("balance_credits")
      .limit(5000),
    supabase
      .from("provider_cost_centers")
      .select("provider, name, enabled")
      .limit(100),
    supabase
      .from("billing_rates")
      .select("active")
      .eq("active", true)
      .limit(5000),
  ]);

  const errors = [usageResult.error, walletResult.error, costCenterResult.error, rateResult.error].filter(Boolean);

  if (errors.length > 0) {
    return emptySummary({
      sinceIso,
      schemaReady: false,
      warnings: errors.map((error) => error?.message ?? "Erro desconhecido ao carregar billing."),
    });
  }

  const usageRows = (usageResult.data ?? []) as UsageRow[];
  const walletRows = (walletResult.data ?? []) as WalletRow[];
  const costCenterRows = (costCenterResult.data ?? []) as CostCenterRow[];
  const rateRows = (rateResult.data ?? []) as RateRow[];
  const providerLabels = new Map<string, string>();

  for (const row of costCenterRows) {
    if (row.provider) {
      providerLabels.set(row.provider, row.name || providerNames[row.provider] || row.provider);
    }
  }

  const providerMap = new Map<string, BillingProviderSummary>();

  for (const row of usageRows) {
    const provider = row.provider || "unknown";
    const current = providerMap.get(provider) ?? {
      provider: provider as BillingProvider | "unknown",
      label: providerLabels.get(provider) ?? providerNames[provider] ?? provider,
      events: 0,
      providerCost: 0,
      connectyRevenue: 0,
      grossMargin: 0,
      chargeCredits: 0,
    };

    current.events += 1;
    current.providerCost += toNumber(row.provider_cost);
    current.connectyRevenue += toNumber(row.connecty_revenue_estimate);
    current.grossMargin += toNumber(row.gross_margin_estimate);
    current.chargeCredits += toNumber(row.connecty_charge_credits);
    providerMap.set(provider, current);
  }

  const providers = Array.from(providerMap.values())
    .map((provider) => ({
      ...provider,
      providerCost: roundMoney(provider.providerCost),
      connectyRevenue: roundMoney(provider.connectyRevenue),
      grossMargin: roundMoney(provider.grossMargin),
      chargeCredits: roundCredits(provider.chargeCredits),
    }))
    .sort((a, b) => b.connectyRevenue - a.connectyRevenue);

  const totals = providers.reduce(
    (acc, provider) => {
      acc.usageEvents += provider.events;
      acc.providerCost += provider.providerCost;
      acc.connectyRevenue += provider.connectyRevenue;
      acc.grossMargin += provider.grossMargin;
      acc.chargeCredits += provider.chargeCredits;
      return acc;
    },
    {
      usageEvents: 0,
      providerCost: 0,
      connectyRevenue: 0,
      grossMargin: 0,
      chargeCredits: 0,
      walletBalanceCredits: 0,
      activeCostCenters: costCenterRows.filter((row) => row.enabled).length,
      activeRates: rateRows.filter((row) => row.active).length,
    },
  );

  totals.walletBalanceCredits = walletRows.reduce((sum, row) => sum + toNumber(row.balance_credits), 0);

  return {
    schemaReady: true,
    periodLabel: "Ultimos 30 dias",
    sinceIso,
    totals: {
      ...totals,
      providerCost: roundMoney(totals.providerCost),
      connectyRevenue: roundMoney(totals.connectyRevenue),
      grossMargin: roundMoney(totals.grossMargin),
      chargeCredits: roundCredits(totals.chargeCredits),
      walletBalanceCredits: roundCredits(totals.walletBalanceCredits),
    },
    providers,
    warnings: [],
  };
}

function emptySummary({
  sinceIso,
  schemaReady,
  warnings,
}: {
  sinceIso: string;
  schemaReady: boolean;
  warnings: string[];
}): BillingAdminSummary {
  return {
    schemaReady,
    periodLabel: "Ultimos 30 dias",
    sinceIso,
    totals: {
      usageEvents: 0,
      providerCost: 0,
      connectyRevenue: 0,
      grossMargin: 0,
      chargeCredits: 0,
      walletBalanceCredits: 0,
      activeCostCenters: 0,
      activeRates: 0,
    },
    providers: [],
    warnings,
  };
}

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100000000) / 100000000;
}

function roundCredits(value: number) {
  return Math.round(value * 1000000) / 1000000;
}
