import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { SalesCatalogCommercialFlowType, SalesCatalogRevenueOwnerType } from "@/lib/sales-catalog/shared";
import type { BillingProvider } from "./cost-center";

export type CommerceFlowSummary = {
  flow: SalesCatalogCommercialFlowType;
  label: string;
  orders: number;
  grossAmount: number;
  clientRevenue: number;
  connectyHubRevenue: number;
  commissionAmount: number;
  netConnectyHubRevenue: number;
};

export type CommerceRevenueSummary = {
  schemaReady: boolean;
  approvedPayments: number;
  grossAmount: number;
  clientDirectGross: number;
  connectyHubResaleGross: number;
  connectyHubDirectGross: number;
  externalMarketplaceGross: number;
  connectyHubGrossRevenue: number;
  clientGrossRevenue: number;
  commissionAccrued: number;
  commissionPayable: number;
  commissionPaid: number;
  netConnectyHubRevenue: number;
  flows: CommerceFlowSummary[];
  warnings: string[];
};

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
  commerce: CommerceRevenueSummary;
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

type CommerceSessionRow = {
  id: string;
  amount: number | string | null;
  payment_owner_type?: string | null;
  commercial_flow_type?: string | null;
  revenue_owner_type?: string | null;
  commission_eligible?: boolean | null;
  commission_context?: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
};

type CommerceCommissionRow = {
  status: string | null;
  commission_amount: number | string | null;
  metadata: Record<string, unknown> | null;
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

  const [usageResult, walletResult, costCenterResult, rateResult, commerce] = await Promise.all([
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
    getCommerceRevenueSummary(supabase, sinceIso),
  ]);

  const errors = [usageResult.error, walletResult.error, costCenterResult.error, rateResult.error].filter(Boolean);

  if (errors.length > 0) {
    return emptySummary({
      sinceIso,
      schemaReady: false,
      commerce,
      warnings: [
        ...errors.map((error) => error?.message ?? "Erro desconhecido ao carregar billing."),
        ...commerce.warnings,
      ],
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
    commerce,
    warnings: commerce.warnings,
  };
}

async function getCommerceRevenueSummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sinceIso: string,
): Promise<CommerceRevenueSummary> {
  const [sessionsResult, commissionsResult] = await Promise.all([
    supabase
      .from("sales_catalog_payment_sessions")
      .select("id, amount, payment_owner_type, commercial_flow_type, revenue_owner_type, commission_context, metadata")
      .eq("status", "approved")
      .gte("created_at", sinceIso)
      .limit(5000),
    supabase
      .from("platform_product_commissions")
      .select("status, commission_amount, metadata")
      .gte("created_at", sinceIso)
      .limit(5000),
  ]);

  const warnings = [
    ...(sessionsResult.error ? [sessionsResult.error.message] : []),
    ...(commissionsResult.error ? [commissionsResult.error.message] : []),
  ];

  if (sessionsResult.error) {
    return emptyCommerceSummary(false, warnings);
  }

  const sessions = (sessionsResult.data ?? []) as CommerceSessionRow[];
  const commissions = commissionsResult.error ? [] : (commissionsResult.data ?? []) as CommerceCommissionRow[];
  const flowMap = createCommerceFlowMap();
  let grossAmount = 0;
  let clientGrossRevenue = 0;
  let connectyHubGrossRevenue = 0;
  let commissionAccrued = 0;
  let commissionPayable = 0;
  let commissionPaid = 0;

  for (const session of sessions) {
    const amount = toNumber(session.amount);
    const metadata = readRecord(session.metadata);
    const commercialFlow = normalizeCommercialFlowType(
      session.commercial_flow_type ?? readString(metadata.commercial_flow_type),
    );
    const revenueOwner = normalizeRevenueOwnerType(
      session.revenue_owner_type ?? readString(metadata.revenue_owner_type),
    );
    const flow = flowMap.get(commercialFlow) ?? flowMap.get("client_direct")!;

    grossAmount += amount;
    flow.orders += 1;
    flow.grossAmount += amount;

    if (revenueOwner === "client") {
      clientGrossRevenue += amount;
      flow.clientRevenue += amount;
    } else {
      connectyHubGrossRevenue += amount;
      flow.connectyHubRevenue += amount;
    }
  }

  for (const commission of commissions) {
    const amount = toNumber(commission.commission_amount);
    const status = commission.status ?? "pending";

    if (status === "cancelled" || status === "blocked" || status === "refunded") {
      continue;
    }

    commissionAccrued += amount;
    const flow = flowMap.get(normalizeCommercialFlowType(readString(readRecord(commission.metadata).commercial_flow_type)))
      ?? flowMap.get("connectyhub_resale")!;
    flow.commissionAmount += amount;

    if (status === "paid") {
      commissionPaid += amount;
    } else if (status === "pending" || status === "available") {
      commissionPayable += amount;
    }
  }

  const flows = Array.from(flowMap.values())
    .map((flow) => ({
      ...flow,
      grossAmount: roundMoney(flow.grossAmount),
      clientRevenue: roundMoney(flow.clientRevenue),
      connectyHubRevenue: roundMoney(flow.connectyHubRevenue),
      commissionAmount: roundMoney(flow.commissionAmount),
      netConnectyHubRevenue: roundMoney(flow.connectyHubRevenue - flow.commissionAmount),
    }))
    .filter((flow) => flow.orders > 0 || flow.commissionAmount > 0);

  return {
    schemaReady: warnings.length === 0,
    approvedPayments: sessions.length,
    grossAmount: roundMoney(grossAmount),
    clientDirectGross: roundMoney(flowMap.get("client_direct")?.grossAmount ?? 0),
    connectyHubResaleGross: roundMoney(flowMap.get("connectyhub_resale")?.grossAmount ?? 0),
    connectyHubDirectGross: roundMoney(flowMap.get("connectyhub_direct")?.grossAmount ?? 0),
    externalMarketplaceGross: roundMoney(flowMap.get("external_marketplace")?.grossAmount ?? 0),
    connectyHubGrossRevenue: roundMoney(connectyHubGrossRevenue),
    clientGrossRevenue: roundMoney(clientGrossRevenue),
    commissionAccrued: roundMoney(commissionAccrued),
    commissionPayable: roundMoney(commissionPayable),
    commissionPaid: roundMoney(commissionPaid),
    netConnectyHubRevenue: roundMoney(connectyHubGrossRevenue - commissionAccrued),
    flows,
    warnings,
  };
}

function emptySummary({
  sinceIso,
  schemaReady,
  commerce,
  warnings,
}: {
  sinceIso: string;
  schemaReady: boolean;
  commerce?: CommerceRevenueSummary;
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
    commerce: commerce ?? emptyCommerceSummary(false, []),
    warnings,
  };
}

function emptyCommerceSummary(schemaReady: boolean, warnings: string[]): CommerceRevenueSummary {
  return {
    schemaReady,
    approvedPayments: 0,
    grossAmount: 0,
    clientDirectGross: 0,
    connectyHubResaleGross: 0,
    connectyHubDirectGross: 0,
    externalMarketplaceGross: 0,
    connectyHubGrossRevenue: 0,
    clientGrossRevenue: 0,
    commissionAccrued: 0,
    commissionPayable: 0,
    commissionPaid: 0,
    netConnectyHubRevenue: 0,
    flows: [],
    warnings,
  };
}

function createCommerceFlowMap() {
  const entries: CommerceFlowSummary[] = [
    {
      flow: "client_direct",
      label: "Venda propria do cliente",
      orders: 0,
      grossAmount: 0,
      clientRevenue: 0,
      connectyHubRevenue: 0,
      commissionAmount: 0,
      netConnectyHubRevenue: 0,
    },
    {
      flow: "connectyhub_resale",
      label: "Produto ConnectyHub revendido",
      orders: 0,
      grossAmount: 0,
      clientRevenue: 0,
      connectyHubRevenue: 0,
      commissionAmount: 0,
      netConnectyHubRevenue: 0,
    },
    {
      flow: "connectyhub_direct",
      label: "Venda direta ConnectyHub",
      orders: 0,
      grossAmount: 0,
      clientRevenue: 0,
      connectyHubRevenue: 0,
      commissionAmount: 0,
      netConnectyHubRevenue: 0,
    },
    {
      flow: "external_marketplace",
      label: "Marketplace externo",
      orders: 0,
      grossAmount: 0,
      clientRevenue: 0,
      connectyHubRevenue: 0,
      commissionAmount: 0,
      netConnectyHubRevenue: 0,
    },
  ];

  return new Map(entries.map((entry) => [entry.flow, entry]));
}

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeCommercialFlowType(value: string | null | undefined): SalesCatalogCommercialFlowType {
  if (value === "connectyhub_resale" || value === "connectyhub_direct" || value === "external_marketplace") return value;
  return "client_direct";
}

function normalizeRevenueOwnerType(value: string | null | undefined): SalesCatalogRevenueOwnerType {
  if (value === "connectyhub" || value === "split" || value === "external_provider") return value;
  return "client";
}

function roundMoney(value: number) {
  return Math.round(value * 100000000) / 100000000;
}

function roundCredits(value: number) {
  return Math.round(value * 1000000) / 1000000;
}
