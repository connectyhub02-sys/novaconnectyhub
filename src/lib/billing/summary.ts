import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { SalesCatalogCommercialFlowType, SalesCatalogRevenueOwnerType } from "@/lib/sales-catalog/shared";
import type { BillingProvider, UsageAgentScope, UsageBillingMode } from "./cost-center";

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

export type BillingModeSummary = {
  mode: UsageBillingMode | "unknown";
  label: string;
  events: number;
  providerCost: number;
  connectyRevenue: number;
  chargeCredits: number;
};

export type BillingAgentScopeSummary = {
  scope: UsageAgentScope | "unknown";
  label: string;
  events: number;
  chargeCredits: number;
};

export type FixedProviderCostSummary = {
  provider: string;
  label: string;
  monthlyCostBrl: number;
  periodCostBrl: number;
  todayCostBrl: number;
  capacityUnits: number;
  activeUnits: number;
  activeOrganizations: number;
  plannedCostPerUnitBrl: number;
  effectiveCostPerUnitBrl: number;
  unitLabel: string;
  allocationLabel: string;
};

export type CostCenterProviderEconomics = {
  provider: string;
  label: string;
  events: number;
  variableCostBrl: number;
  fixedCostBrl: number;
  totalCostBrl: number;
  chargeCredits: number;
  creditRevenueBrl: number;
  marginBrl: number;
  marginPercent: number;
};

export type CostCenterCustomerEconomics = {
  organizationId: string;
  name: string;
  planCode: string;
  status: string;
  revenueBrl: number;
  variableCostBrl: number;
  fixedCostBrl: number;
  totalCostBrl: number;
  chargeCredits: number;
  connectedWhatsappInstances: number;
  storageUsedBytes: number;
  storageCostBrl: number;
  marginBrl: number;
  marginPercent: number;
};

export type StorageCostSummary = {
  provider: string;
  label: string;
  totalUsedBytes: number;
  billableUsedBytes: number;
  freeTierBytes: number;
  activeOrganizations: number;
  monthlyCostBrl: number;
  todayCostBrl: number;
  costPerGbMonthBrl: number;
  pricingSource: string;
};

export type PlanCreditEconomicsSummary = {
  planCode: string;
  name: string;
  status: string;
  monthlyPriceBrl: number;
  includedCredits: number;
  overageCreditPriceBrl: number;
  revenuePerIncludedCreditBrl: number;
  estimatedCostPerCreditBrl: number;
  estimatedProfitPerCreditBrl: number;
  estimatedPlanCostBrl: number;
  estimatedPlanProfitBrl: number;
  marginPercent: number;
};

export type ProviderUsageUnitSummary = {
  provider: string;
  label: string;
  events: number;
  inputUnits: number;
  outputUnits: number;
  totalUnits: number;
  unitLabel: string;
  providerCostBrl: number;
  creditRevenueBrl: number;
  chargeCredits: number;
  profitBrl: number;
};

export type CreditEconomicsSummary = {
  averagePlanCreditPriceBrl: number;
  averageActualRevenuePerCreditBrl: number;
  realCostPerCreditBrl: number;
  profitPerCreditBrl: number;
  marginPercent: number;
  consumedCredits: number;
  purchasedCredits: number;
  providerCostBrl: number;
  revenueBrl: number;
  profitBrl: number;
  activePlanCredits: number;
  activePlanMonthlyRevenueBrl: number;
  plans: PlanCreditEconomicsSummary[];
  providers: ProviderUsageUnitSummary[];
};

export type CurrentCostCenterSummary = {
  periodLabel: string;
  scopeLabel: string;
  creditUnitPriceBrl: number;
  approvedRevenueBrl: number;
  todayApprovedRevenueBrl: number;
  purchasedCredits: number;
  todayPurchasedCredits: number;
  consumedCredits: number;
  todayConsumedCredits: number;
  variableCostBrl: number;
  todayVariableCostBrl: number;
  fixedCostBrl: number;
  todayFixedCostBrl: number;
  totalCostBrl: number;
  todayTotalCostBrl: number;
  creditRevenueBrl: number;
  todayCreditRevenueBrl: number;
  grossProfitBrl: number;
  todayGrossProfitBrl: number;
  grossMarginPercent: number;
  realCostPerConsumedCreditBrl: number;
  suggestedCreditPrice60MarginBrl: number;
  suggestedCreditPrice70MarginBrl: number;
  activeConnectedWhatsappInstances: number;
  activeWhatsappOrganizations: number;
  storage: StorageCostSummary;
  creditEconomics: CreditEconomicsSummary;
  providers: CostCenterProviderEconomics[];
  fixedProviders: FixedProviderCostSummary[];
  customers: CostCenterCustomerEconomics[];
};

export type BillingAdminSummary = {
  schemaReady: boolean;
  periodLabel: string;
  sinceIso: string;
  generatedAt: string;
  totals: {
    usageEvents: number;
    todayUsageEvents: number;
    providerCost: number;
    todayProviderCost: number;
    connectyRevenue: number;
    todayConnectyRevenue: number;
    grossMargin: number;
    chargeCredits: number;
    todayChargeCredits: number;
    customerBillableCredits: number;
    trialBillableCredits: number;
    internalShadowCredits: number;
    platformAbsorbedCredits: number;
    freeCredits: number;
    walletBalanceCredits: number;
    activeCostCenters: number;
    activeRates: number;
  };
  providers: BillingProviderSummary[];
  billingModes: BillingModeSummary[];
  agentScopes: BillingAgentScopeSummary[];
  currentCostCenter: CurrentCostCenterSummary;
  commerce: CommerceRevenueSummary;
  warnings: string[];
};

type UsageRow = {
  organization_id: string | null;
  provider: BillingProvider | string | null;
  input_units: number | string | null;
  output_units: number | string | null;
  provider_cost: number | string | null;
  connecty_revenue_estimate: number | string | null;
  gross_margin_estimate: number | string | null;
  connecty_charge_credits: number | string | null;
  occurred_at: string | null;
  billing_mode?: UsageBillingMode | string | null;
  agent_scope?: UsageAgentScope | string | null;
};

type WalletRow = {
  balance_credits: number | string | null;
};

type CostCenterRow = {
  id: string;
  provider: BillingProvider | string | null;
  name: string | null;
  enabled: boolean | null;
};

type RateRow = {
  active: boolean | null;
  cost_center_id?: string | null;
  unit?: string | null;
  provider_cost_per_unit?: number | string | null;
};

type BillingPaymentRow = {
  organization_id: string | null;
  status: string | null;
  amount_brl: number | string | null;
  paid_at: string | null;
  created_at: string | null;
};

type CreditTransactionRow = {
  organization_id: string | null;
  transaction_type: string | null;
  amount_credits: number | string | null;
  created_at: string | null;
};

type OrganizationRow = {
  id: string;
  name: string | null;
  slug: string | null;
  plan_code: string | null;
  status: string | null;
};

type BillingPlanRow = {
  plan_code: string;
  name: string | null;
  status: string | null;
  monthly_price_brl: number | string | null;
  included_credits: number | string | null;
  overage_credit_price_brl: number | string | null;
};

type WhatsappInstanceRow = {
  id: string;
  organization_id: string | null;
  provider: string | null;
  status: string | null;
};

type StorageUsageRow = {
  organization_id: string;
  used_bytes: number | string | null;
  billable_file_count: number | string | null;
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

const CONNECTY_CREDIT_UNIT_BRL = 0.01;
const COST_PERIOD_DAYS = 30;
const CURRENT_COST_PROVIDERS = new Set(["gemini", "elevenlabs"]);
const UAZAPI_MONTHLY_COST_BRL = 138;
const UAZAPI_CAPACITY_UNITS = 100;
const R2_FREE_TIER_STORAGE_BYTES = 10 * 1024 ** 3;
const R2_STANDARD_STORAGE_COST_USD_PER_GB_MONTH = 0.015;
const R2_ESTIMATED_USD_TO_BRL = 5.5;

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

const billingModeLabels: Record<string, string> = {
  customer_billable: "Clientes cobrados",
  trial_billable: "Trial cobrado em creditos",
  internal_shadow: "ConnectyHub interno",
  platform_absorbed: "Absorvido pela plataforma",
  free: "Gratis / isento",
  unknown: "Sem modo",
};

const agentScopeLabels: Record<string, string> = {
  customer: "Agentes de clientes",
  platform: "Agentes admin/plataforma",
  internal: "Organizacao interna",
  unknown: "Sem escopo",
};

export async function getBillingAdminSummary(
  supabase: SupabaseClient = createServiceClient(),
): Promise<BillingAdminSummary> {
  const generatedAt = new Date();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceIso = since.toISOString();
  const todayStart = new Date(generatedAt);
  todayStart.setHours(0, 0, 0, 0);

  const [
    usageResult,
    walletResult,
    costCenterResult,
    rateResult,
    paymentResult,
    creditTransactionResult,
    organizationResult,
    planResult,
    whatsappInstanceResult,
    storageUsageResult,
    commerce,
  ] = await Promise.all([
    supabase
      .from("usage_events")
      .select("organization_id, provider, input_units, output_units, provider_cost, connecty_revenue_estimate, gross_margin_estimate, connecty_charge_credits, occurred_at, billing_mode, agent_scope")
      .gte("occurred_at", sinceIso)
      .limit(5000),
    supabase
      .from("credit_wallets")
      .select("balance_credits")
      .limit(5000),
    supabase
      .from("provider_cost_centers")
      .select("id, provider, name, enabled")
      .limit(100),
    supabase
      .from("billing_rates")
      .select("active, cost_center_id, unit, provider_cost_per_unit")
      .eq("active", true)
      .limit(5000),
    supabase
      .from("billing_payments")
      .select("organization_id, status, amount_brl, paid_at, created_at")
      .gte("created_at", sinceIso)
      .limit(5000),
    supabase
      .from("credit_transactions")
      .select("organization_id, transaction_type, amount_credits, created_at")
      .gte("created_at", sinceIso)
      .limit(5000),
    supabase
      .from("organizations")
      .select("id, name, slug, plan_code, status")
      .limit(1000),
    supabase
      .from("billing_plans")
      .select("plan_code, name, status, monthly_price_brl, included_credits, overage_credit_price_brl")
      .order("sort_order", { ascending: true })
      .limit(100),
    supabase
      .from("whatsapp_instances")
      .select("id, organization_id, provider, status")
      .eq("provider", "uazapi")
      .limit(5000),
    supabase
      .from("organization_storage_usage")
      .select("organization_id, used_bytes, billable_file_count")
      .limit(5000),
    getCommerceRevenueSummary(supabase, sinceIso),
  ]);

  const errors = [usageResult.error, walletResult.error, costCenterResult.error, rateResult.error].filter(Boolean);
  const nonBlockingWarnings = [
    paymentResult.error?.message,
    creditTransactionResult.error?.message,
    organizationResult.error?.message,
    planResult.error?.message,
    whatsappInstanceResult.error?.message,
    storageUsageResult.error?.message,
  ].filter((message): message is string => Boolean(message));

  if (errors.length > 0) {
    return emptySummary({
      sinceIso,
      generatedAt: generatedAt.toISOString(),
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
  const paymentRows = paymentResult.error ? [] : (paymentResult.data ?? []) as BillingPaymentRow[];
  const creditTransactionRows = creditTransactionResult.error ? [] : (creditTransactionResult.data ?? []) as CreditTransactionRow[];
  const organizationRows = organizationResult.error ? [] : (organizationResult.data ?? []) as OrganizationRow[];
  const planRows = planResult.error ? [] : (planResult.data ?? []) as BillingPlanRow[];
  const whatsappInstanceRows = whatsappInstanceResult.error ? [] : (whatsappInstanceResult.data ?? []) as WhatsappInstanceRow[];
  const storageUsageRows = storageUsageResult.error ? [] : (storageUsageResult.data ?? []) as StorageUsageRow[];
  const providerLabels = new Map<string, string>();

  for (const row of costCenterRows) {
    if (row.provider) {
      providerLabels.set(row.provider, row.name || providerNames[row.provider] || row.provider);
    }
  }

  const providerMap = new Map<string, BillingProviderSummary>();
  const billingModeMap = new Map<string, BillingModeSummary>();
  const agentScopeMap = new Map<string, BillingAgentScopeSummary>();
  const todayTotals = {
    usageEvents: 0,
    providerCost: 0,
    connectyRevenue: 0,
    chargeCredits: 0,
  };

  for (const row of usageRows) {
    const provider = row.provider || "unknown";
    const billingMode = row.billing_mode || "unknown";
    const agentScope = row.agent_scope || "unknown";
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

    const modeSummary = billingModeMap.get(billingMode) ?? {
      mode: billingMode as UsageBillingMode | "unknown",
      label: billingModeLabels[billingMode] ?? billingMode,
      events: 0,
      providerCost: 0,
      connectyRevenue: 0,
      chargeCredits: 0,
    };

    modeSummary.events += 1;
    modeSummary.providerCost += toNumber(row.provider_cost);
    modeSummary.connectyRevenue += toNumber(row.connecty_revenue_estimate);
    modeSummary.chargeCredits += toNumber(row.connecty_charge_credits);
    billingModeMap.set(billingMode, modeSummary);

    const scopeSummary = agentScopeMap.get(agentScope) ?? {
      scope: agentScope as UsageAgentScope | "unknown",
      label: agentScopeLabels[agentScope] ?? agentScope,
      events: 0,
      chargeCredits: 0,
    };

    scopeSummary.events += 1;
    scopeSummary.chargeCredits += toNumber(row.connecty_charge_credits);
    agentScopeMap.set(agentScope, scopeSummary);

    if (isOnOrAfter(row.occurred_at, todayStart)) {
      todayTotals.usageEvents += 1;
      todayTotals.providerCost += toNumber(row.provider_cost);
      todayTotals.connectyRevenue += toNumber(row.connecty_revenue_estimate);
      todayTotals.chargeCredits += toNumber(row.connecty_charge_credits);
    }
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
  const billingModes = Array.from(billingModeMap.values())
    .map((mode) => ({
      ...mode,
      providerCost: roundMoney(mode.providerCost),
      connectyRevenue: roundMoney(mode.connectyRevenue),
      chargeCredits: roundCredits(mode.chargeCredits),
    }))
    .sort((a, b) => b.chargeCredits - a.chargeCredits);
  const agentScopes = Array.from(agentScopeMap.values())
    .map((scope) => ({
      ...scope,
      chargeCredits: roundCredits(scope.chargeCredits),
    }))
    .sort((a, b) => b.chargeCredits - a.chargeCredits);

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
      todayUsageEvents: todayTotals.usageEvents,
      providerCost: 0,
      todayProviderCost: todayTotals.providerCost,
      connectyRevenue: 0,
      todayConnectyRevenue: todayTotals.connectyRevenue,
      grossMargin: 0,
      chargeCredits: 0,
      todayChargeCredits: todayTotals.chargeCredits,
      customerBillableCredits: 0,
      trialBillableCredits: 0,
      internalShadowCredits: 0,
      platformAbsorbedCredits: 0,
      freeCredits: 0,
      walletBalanceCredits: 0,
      activeCostCenters: costCenterRows.filter((row) => row.enabled).length,
      activeRates: rateRows.filter((row) => row.active).length,
    },
  );
  const modeTotals = billingModes.reduce(
    (acc, mode) => {
      if (mode.mode === "customer_billable") acc.customerBillableCredits += mode.chargeCredits;
      if (mode.mode === "trial_billable") acc.trialBillableCredits += mode.chargeCredits;
      if (mode.mode === "internal_shadow") acc.internalShadowCredits += mode.chargeCredits;
      if (mode.mode === "platform_absorbed") acc.platformAbsorbedCredits += mode.chargeCredits;
      if (mode.mode === "free") acc.freeCredits += mode.chargeCredits;
      return acc;
    },
    {
      customerBillableCredits: 0,
      trialBillableCredits: 0,
      internalShadowCredits: 0,
      platformAbsorbedCredits: 0,
      freeCredits: 0,
    },
  );

  totals.walletBalanceCredits = walletRows.reduce((sum, row) => sum + toNumber(row.balance_credits), 0);
  const currentCostCenter = buildCurrentCostCenterSummary({
    usageRows,
    paymentRows,
    creditTransactionRows,
    organizationRows,
    planRows,
    whatsappInstanceRows,
    storageUsageRows,
    costCenterRows,
    rateRows,
    todayStart,
    providerLabels,
  });

  return {
    schemaReady: true,
    periodLabel: "Ultimos 30 dias",
    sinceIso,
    generatedAt: generatedAt.toISOString(),
    totals: {
      ...totals,
      providerCost: roundMoney(totals.providerCost),
      todayProviderCost: roundMoney(totals.todayProviderCost),
      connectyRevenue: roundMoney(totals.connectyRevenue),
      todayConnectyRevenue: roundMoney(totals.todayConnectyRevenue),
      grossMargin: roundMoney(totals.grossMargin),
      chargeCredits: roundCredits(totals.chargeCredits),
      todayChargeCredits: roundCredits(totals.todayChargeCredits),
      customerBillableCredits: roundCredits(modeTotals.customerBillableCredits),
      trialBillableCredits: roundCredits(modeTotals.trialBillableCredits),
      internalShadowCredits: roundCredits(modeTotals.internalShadowCredits),
      platformAbsorbedCredits: roundCredits(modeTotals.platformAbsorbedCredits),
      freeCredits: roundCredits(modeTotals.freeCredits),
      walletBalanceCredits: roundCredits(totals.walletBalanceCredits),
    },
    providers,
    billingModes,
    agentScopes,
    currentCostCenter,
    commerce,
    warnings: [...nonBlockingWarnings, ...commerce.warnings],
  };
}

function buildCurrentCostCenterSummary({
  usageRows,
  paymentRows,
  creditTransactionRows,
  organizationRows,
  planRows,
  whatsappInstanceRows,
  storageUsageRows,
  costCenterRows,
  rateRows,
  todayStart,
  providerLabels,
}: {
  usageRows: UsageRow[];
  paymentRows: BillingPaymentRow[];
  creditTransactionRows: CreditTransactionRow[];
  organizationRows: OrganizationRow[];
  planRows: BillingPlanRow[];
  whatsappInstanceRows: WhatsappInstanceRow[];
  storageUsageRows: StorageUsageRow[];
  costCenterRows: CostCenterRow[];
  rateRows: RateRow[];
  todayStart: Date;
  providerLabels: Map<string, string>;
}): CurrentCostCenterSummary {
  const organizationById = new Map(organizationRows.map((organization) => [organization.id, organization]));
  const costCenterById = new Map(costCenterRows.map((costCenter) => [costCenter.id, costCenter]));
  const activeWhatsappInstances = whatsappInstanceRows.filter(
    (instance) => instance.provider === "uazapi" && instance.status === "connected" && Boolean(instance.organization_id),
  );
  const connectedInstancesByOrganization = new Map<string, number>();

  for (const instance of activeWhatsappInstances) {
    if (!instance.organization_id) continue;
    connectedInstancesByOrganization.set(
      instance.organization_id,
      (connectedInstancesByOrganization.get(instance.organization_id) ?? 0) + 1,
    );
  }

  const activeWhatsappOrganizations = connectedInstancesByOrganization.size;
  const fixedProvider = buildUazapiFixedCostSummary(activeWhatsappInstances.length, activeWhatsappOrganizations);
  const storage = buildStorageCostSummary(storageUsageRows, costCenterById, rateRows);
  const providerMap = new Map<string, CostCenterProviderEconomics>();
  const unitProviderMap = new Map<string, ProviderUsageUnitSummary>();
  const customerMap = new Map<string, CostCenterCustomerEconomics>();
  let consumedCredits = 0;
  let todayConsumedCredits = 0;
  let variableCostBrl = 0;
  let todayVariableCostBrl = 0;
  let creditRevenueBrl = 0;
  let todayCreditRevenueBrl = 0;

  for (const provider of CURRENT_COST_PROVIDERS) {
    providerMap.set(provider, createProviderEconomics(provider, providerLabels));
    unitProviderMap.set(provider, createProviderUsageSummary(provider, providerLabels));
  }
  providerMap.set(storage.provider, createProviderEconomics(storage.provider, providerLabels));
  unitProviderMap.set(storage.provider, createProviderUsageSummary(storage.provider, providerLabels));

  for (const row of usageRows) {
    const provider = row.provider ?? "unknown";

    if (!isCurrentCostProvider(provider)) {
      continue;
    }

    const providerCost = toNumber(row.provider_cost);
    const chargeCredits = toNumber(row.connecty_charge_credits);
    const creditRevenue = toNumber(row.connecty_revenue_estimate);
    const today = isOnOrAfter(row.occurred_at, todayStart);
    const providerSummary = providerMap.get(provider) ?? createProviderEconomics(provider, providerLabels);

    providerSummary.events += 1;
    providerSummary.variableCostBrl += providerCost;
    providerSummary.totalCostBrl += providerCost;
    providerSummary.chargeCredits += chargeCredits;
    providerSummary.creditRevenueBrl += creditRevenue;
    providerSummary.marginBrl += creditRevenue - providerCost;
    providerMap.set(provider, providerSummary);

    const unitSummary = unitProviderMap.get(provider) ?? createProviderUsageSummary(provider, providerLabels);
    unitSummary.events += 1;
    unitSummary.inputUnits += toNumber(row.input_units);
    unitSummary.outputUnits += toNumber(row.output_units);
    unitSummary.totalUnits += toNumber(row.input_units) + toNumber(row.output_units);
    unitSummary.providerCostBrl += providerCost;
    unitSummary.creditRevenueBrl += creditRevenue;
    unitSummary.chargeCredits += chargeCredits;
    unitSummary.profitBrl += creditRevenue - providerCost;
    unitProviderMap.set(provider, unitSummary);

    consumedCredits += chargeCredits;
    variableCostBrl += providerCost;
    creditRevenueBrl += creditRevenue;

    if (today) {
      todayConsumedCredits += chargeCredits;
      todayVariableCostBrl += providerCost;
      todayCreditRevenueBrl += creditRevenue;
    }

    if (row.organization_id) {
      const customer = getOrCreateCustomerEconomics(customerMap, row.organization_id, organizationById);
      customer.variableCostBrl += providerCost;
      customer.totalCostBrl += providerCost;
      customer.chargeCredits += chargeCredits;
    }
  }

  let approvedRevenueBrl = 0;
  let todayApprovedRevenueBrl = 0;

  for (const payment of paymentRows) {
    if (payment.status !== "approved") {
      continue;
    }

    const amount = toNumber(payment.amount_brl);
    const paidAt = payment.paid_at ?? payment.created_at;

    approvedRevenueBrl += amount;
    if (isOnOrAfter(paidAt, todayStart)) {
      todayApprovedRevenueBrl += amount;
    }

    if (payment.organization_id) {
      const customer = getOrCreateCustomerEconomics(customerMap, payment.organization_id, organizationById);
      customer.revenueBrl += amount;
    }
  }

  let purchasedCredits = 0;
  let todayPurchasedCredits = 0;

  for (const transaction of creditTransactionRows) {
    if (transaction.transaction_type !== "purchase") {
      continue;
    }

    const amountCredits = Math.max(0, toNumber(transaction.amount_credits));
    purchasedCredits += amountCredits;

    if (isOnOrAfter(transaction.created_at, todayStart)) {
      todayPurchasedCredits += amountCredits;
    }
  }

  for (const [organizationId, connectedWhatsappInstances] of connectedInstancesByOrganization.entries()) {
    const fixedShare = activeWhatsappInstances.length > 0
      ? (fixedProvider.periodCostBrl * connectedWhatsappInstances) / activeWhatsappInstances.length
      : 0;
    const customer = getOrCreateCustomerEconomics(customerMap, organizationId, organizationById);

    customer.connectedWhatsappInstances = connectedWhatsappInstances;
    customer.fixedCostBrl += fixedShare;
    customer.totalCostBrl += fixedShare;
  }

  if (storage.totalUsedBytes > 0) {
    const storageProvider = providerMap.get(storage.provider) ?? createProviderEconomics(storage.provider, providerLabels);
    const storageUnits = unitProviderMap.get(storage.provider) ?? createProviderUsageSummary(storage.provider, providerLabels);

    storageProvider.events = storage.activeOrganizations;
    storageProvider.variableCostBrl += storage.monthlyCostBrl;
    storageProvider.totalCostBrl += storage.monthlyCostBrl;
    storageProvider.marginBrl -= storage.monthlyCostBrl;
    providerMap.set(storage.provider, storageProvider);

    storageUnits.events = storage.activeOrganizations;
    storageUnits.totalUnits += bytesToGb(storage.totalUsedBytes);
    storageUnits.providerCostBrl += storage.monthlyCostBrl;
    storageUnits.profitBrl -= storage.monthlyCostBrl;
    unitProviderMap.set(storage.provider, storageUnits);

    for (const row of storageUsageRows) {
      const usedBytes = toNumber(row.used_bytes);
      if (usedBytes <= 0) continue;
      const storageShare = storage.totalUsedBytes > 0 ? storage.monthlyCostBrl * (usedBytes / storage.totalUsedBytes) : 0;
      const customer = getOrCreateCustomerEconomics(customerMap, row.organization_id, organizationById);

      customer.storageUsedBytes += usedBytes;
      customer.storageCostBrl += storageShare;
      customer.variableCostBrl += storageShare;
      customer.totalCostBrl += storageShare;
    }
  }

  variableCostBrl += storage.monthlyCostBrl;
  todayVariableCostBrl += storage.todayCostBrl;

  const fixedCostBrl = fixedProvider.periodCostBrl;
  const todayFixedCostBrl = fixedProvider.todayCostBrl;
  const totalCostBrl = variableCostBrl + fixedCostBrl;
  const todayTotalCostBrl = todayVariableCostBrl + todayFixedCostBrl;
  const grossProfitBrl = approvedRevenueBrl - totalCostBrl;
  const todayGrossProfitBrl = todayApprovedRevenueBrl - todayTotalCostBrl;
  const realCostPerConsumedCreditBrl = consumedCredits > 0 ? totalCostBrl / consumedCredits : 0;
  const averageActualRevenuePerCreditBrl = consumedCredits > 0 ? approvedRevenueBrl / consumedCredits : 0;
  const providers = Array.from(providerMap.values())
    .map(roundProviderEconomics)
    .concat([
      roundProviderEconomics({
        provider: fixedProvider.provider,
        label: fixedProvider.label,
        events: fixedProvider.activeUnits,
        variableCostBrl: 0,
        fixedCostBrl: fixedProvider.periodCostBrl,
        totalCostBrl: fixedProvider.periodCostBrl,
        chargeCredits: 0,
        creditRevenueBrl: 0,
        marginBrl: -fixedProvider.periodCostBrl,
        marginPercent: 0,
      }),
    ])
    .sort((a, b) => b.totalCostBrl - a.totalCostBrl);
  const customers = Array.from(customerMap.values())
    .map(roundCustomerEconomics)
    .sort((a, b) => b.totalCostBrl - a.totalCostBrl)
    .slice(0, 8);
  const creditEconomics = buildCreditEconomicsSummary({
    planRows,
    unitProviderRows: Array.from(unitProviderMap.values()),
    approvedRevenueBrl,
    consumedCredits,
    purchasedCredits,
    providerCostBrl: totalCostBrl,
    realCostPerCreditBrl: realCostPerConsumedCreditBrl,
    averageActualRevenuePerCreditBrl,
  });

  return {
    periodLabel: "Ultimos 30 dias",
    scopeLabel: "Custos atuais: Gemini, ElevenLabs, Uazapi e Cloudflare R2",
    creditUnitPriceBrl: CONNECTY_CREDIT_UNIT_BRL,
    approvedRevenueBrl: roundMoney(approvedRevenueBrl),
    todayApprovedRevenueBrl: roundMoney(todayApprovedRevenueBrl),
    purchasedCredits: roundCredits(purchasedCredits),
    todayPurchasedCredits: roundCredits(todayPurchasedCredits),
    consumedCredits: roundCredits(consumedCredits),
    todayConsumedCredits: roundCredits(todayConsumedCredits),
    variableCostBrl: roundMoney(variableCostBrl),
    todayVariableCostBrl: roundMoney(todayVariableCostBrl),
    fixedCostBrl: roundMoney(fixedCostBrl),
    todayFixedCostBrl: roundMoney(todayFixedCostBrl),
    totalCostBrl: roundMoney(totalCostBrl),
    todayTotalCostBrl: roundMoney(todayTotalCostBrl),
    creditRevenueBrl: roundMoney(creditRevenueBrl),
    todayCreditRevenueBrl: roundMoney(todayCreditRevenueBrl),
    grossProfitBrl: roundMoney(grossProfitBrl),
    todayGrossProfitBrl: roundMoney(todayGrossProfitBrl),
    grossMarginPercent: calculateMarginPercent(totalCostBrl, approvedRevenueBrl),
    realCostPerConsumedCreditBrl: roundMoney(realCostPerConsumedCreditBrl),
    suggestedCreditPrice60MarginBrl: roundMoney(suggestCreditPrice(realCostPerConsumedCreditBrl, 60)),
    suggestedCreditPrice70MarginBrl: roundMoney(suggestCreditPrice(realCostPerConsumedCreditBrl, 70)),
    activeConnectedWhatsappInstances: activeWhatsappInstances.length,
    activeWhatsappOrganizations,
    storage,
    creditEconomics,
    providers,
    fixedProviders: [fixedProvider],
    customers,
  };
}

async function getCommerceRevenueSummary(
  supabase: SupabaseClient,
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
  generatedAt,
  schemaReady,
  commerce,
  warnings,
}: {
  sinceIso: string;
  generatedAt: string;
  schemaReady: boolean;
  commerce?: CommerceRevenueSummary;
  warnings: string[];
}): BillingAdminSummary {
  return {
    schemaReady,
    periodLabel: "Ultimos 30 dias",
    sinceIso,
    generatedAt,
    totals: {
      usageEvents: 0,
      todayUsageEvents: 0,
      providerCost: 0,
      todayProviderCost: 0,
      connectyRevenue: 0,
      todayConnectyRevenue: 0,
      grossMargin: 0,
      chargeCredits: 0,
      todayChargeCredits: 0,
      customerBillableCredits: 0,
      trialBillableCredits: 0,
      internalShadowCredits: 0,
      platformAbsorbedCredits: 0,
      freeCredits: 0,
      walletBalanceCredits: 0,
      activeCostCenters: 0,
      activeRates: 0,
    },
    providers: [],
    billingModes: [],
    agentScopes: [],
    currentCostCenter: emptyCurrentCostCenterSummary(),
    commerce: commerce ?? emptyCommerceSummary(false, []),
    warnings,
  };
}

function emptyCurrentCostCenterSummary(): CurrentCostCenterSummary {
  const fixedProvider = buildUazapiFixedCostSummary(0, 0);
  const storage = emptyStorageCostSummary();

  return {
    periodLabel: "Ultimos 30 dias",
    scopeLabel: "Custos atuais: Gemini, ElevenLabs, Uazapi e Cloudflare R2",
    creditUnitPriceBrl: CONNECTY_CREDIT_UNIT_BRL,
    approvedRevenueBrl: 0,
    todayApprovedRevenueBrl: 0,
    purchasedCredits: 0,
    todayPurchasedCredits: 0,
    consumedCredits: 0,
    todayConsumedCredits: 0,
    variableCostBrl: 0,
    todayVariableCostBrl: 0,
    fixedCostBrl: fixedProvider.periodCostBrl,
    todayFixedCostBrl: fixedProvider.todayCostBrl,
    totalCostBrl: fixedProvider.periodCostBrl,
    todayTotalCostBrl: fixedProvider.todayCostBrl,
    creditRevenueBrl: 0,
    todayCreditRevenueBrl: 0,
    grossProfitBrl: -fixedProvider.periodCostBrl,
    todayGrossProfitBrl: -fixedProvider.todayCostBrl,
    grossMarginPercent: 0,
    realCostPerConsumedCreditBrl: 0,
    suggestedCreditPrice60MarginBrl: 0,
    suggestedCreditPrice70MarginBrl: 0,
    activeConnectedWhatsappInstances: 0,
    activeWhatsappOrganizations: 0,
    storage,
    creditEconomics: emptyCreditEconomicsSummary(),
    providers: [
      roundProviderEconomics(createProviderEconomics("gemini", new Map())),
      roundProviderEconomics(createProviderEconomics("elevenlabs", new Map())),
      roundProviderEconomics(createProviderEconomics(storage.provider, new Map())),
      roundProviderEconomics({
        provider: fixedProvider.provider,
        label: fixedProvider.label,
        events: 0,
        variableCostBrl: 0,
        fixedCostBrl: fixedProvider.periodCostBrl,
        totalCostBrl: fixedProvider.periodCostBrl,
        chargeCredits: 0,
        creditRevenueBrl: 0,
        marginBrl: -fixedProvider.periodCostBrl,
        marginPercent: 0,
      }),
    ],
    fixedProviders: [fixedProvider],
    customers: [],
  };
}

function emptyCreditEconomicsSummary(): CreditEconomicsSummary {
  return {
    averagePlanCreditPriceBrl: 0,
    averageActualRevenuePerCreditBrl: 0,
    realCostPerCreditBrl: 0,
    profitPerCreditBrl: 0,
    marginPercent: 0,
    consumedCredits: 0,
    purchasedCredits: 0,
    providerCostBrl: 0,
    revenueBrl: 0,
    profitBrl: 0,
    activePlanCredits: 0,
    activePlanMonthlyRevenueBrl: 0,
    plans: [],
    providers: [
      roundProviderUsageSummary(createProviderUsageSummary("gemini", new Map())),
      roundProviderUsageSummary(createProviderUsageSummary("elevenlabs", new Map())),
      roundProviderUsageSummary(createProviderUsageSummary("r2", new Map())),
    ],
  };
}

function emptyStorageCostSummary(): StorageCostSummary {
  const costPerGbMonthBrl = readR2FallbackCostPerGbMonthBrl();

  return {
    provider: "r2",
    label: providerNames.r2,
    totalUsedBytes: 0,
    billableUsedBytes: 0,
    freeTierBytes: R2_FREE_TIER_STORAGE_BYTES,
    activeOrganizations: 0,
    monthlyCostBrl: 0,
    todayCostBrl: 0,
    costPerGbMonthBrl: roundMoney(costPerGbMonthBrl),
    pricingSource: "Cloudflare R2 Standard estimado: US$ 0.015 por GB-mes com cambio configurado no codigo.",
  };
}

function buildStorageCostSummary(
  storageUsageRows: StorageUsageRow[],
  costCenterById: Map<string, CostCenterRow>,
  rateRows: RateRow[],
): StorageCostSummary {
  const totalUsedBytes = storageUsageRows.reduce((sum, row) => sum + toNumber(row.used_bytes), 0);
  const billableUsedBytes = Math.max(0, totalUsedBytes - R2_FREE_TIER_STORAGE_BYTES);
  const activeOrganizations = storageUsageRows.filter((row) => toNumber(row.used_bytes) > 0).length;
  const costPerGbMonthBrl = readR2CostPerGbMonthBrl(costCenterById, rateRows);
  const monthlyCostBrl = bytesToGb(billableUsedBytes) * costPerGbMonthBrl;

  return {
    provider: "r2",
    label: providerNames.r2,
    totalUsedBytes: roundStorageBytes(totalUsedBytes),
    billableUsedBytes: roundStorageBytes(billableUsedBytes),
    freeTierBytes: R2_FREE_TIER_STORAGE_BYTES,
    activeOrganizations,
    monthlyCostBrl: roundMoney(monthlyCostBrl),
    todayCostBrl: roundMoney(monthlyCostBrl / COST_PERIOD_DAYS),
    costPerGbMonthBrl: roundMoney(costPerGbMonthBrl),
    pricingSource: "Cloudflare R2 Standard: storage estimado por GB-mes; free tier global aplicado no calculo.",
  };
}

function readR2CostPerGbMonthBrl(costCenterById: Map<string, CostCenterRow>, rateRows: RateRow[]) {
  const configuredRate = rateRows.find((rate) => {
    if (rate.active === false || rate.unit !== "megabyte" || !rate.cost_center_id) {
      return false;
    }

    const costCenter = costCenterById.get(rate.cost_center_id);
    return costCenter?.provider === "r2" && toNumber(rate.provider_cost_per_unit) > 0;
  });

  if (configuredRate) {
    return toNumber(configuredRate.provider_cost_per_unit) * 1024;
  }

  return readR2FallbackCostPerGbMonthBrl();
}

function readR2FallbackCostPerGbMonthBrl() {
  return R2_STANDARD_STORAGE_COST_USD_PER_GB_MONTH * R2_ESTIMATED_USD_TO_BRL;
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

function buildUazapiFixedCostSummary(activeUnits: number, activeOrganizations: number): FixedProviderCostSummary {
  return {
    provider: "uazapi",
    label: providerNames.uazapi,
    monthlyCostBrl: roundMoney(UAZAPI_MONTHLY_COST_BRL),
    periodCostBrl: roundMoney(UAZAPI_MONTHLY_COST_BRL),
    todayCostBrl: roundMoney(UAZAPI_MONTHLY_COST_BRL / COST_PERIOD_DAYS),
    capacityUnits: UAZAPI_CAPACITY_UNITS,
    activeUnits,
    activeOrganizations,
    plannedCostPerUnitBrl: roundMoney(UAZAPI_MONTHLY_COST_BRL / UAZAPI_CAPACITY_UNITS),
    effectiveCostPerUnitBrl: roundMoney(activeUnits > 0 ? UAZAPI_MONTHLY_COST_BRL / activeUnits : 0),
    unitLabel: "instancia WhatsApp conectada",
    allocationLabel: "R$ 138/mes ate 100 dispositivos; rateio pelas instancias conectadas.",
  };
}

function createProviderEconomics(
  provider: string,
  providerLabels: Map<string, string>,
): CostCenterProviderEconomics {
  return {
    provider,
    label: providerLabels.get(provider) ?? providerNames[provider] ?? provider,
    events: 0,
    variableCostBrl: 0,
    fixedCostBrl: 0,
    totalCostBrl: 0,
    chargeCredits: 0,
    creditRevenueBrl: 0,
    marginBrl: 0,
    marginPercent: 0,
  };
}

function roundProviderEconomics(provider: CostCenterProviderEconomics): CostCenterProviderEconomics {
  const totalCostBrl = provider.variableCostBrl + provider.fixedCostBrl;

  return {
    ...provider,
    variableCostBrl: roundMoney(provider.variableCostBrl),
    fixedCostBrl: roundMoney(provider.fixedCostBrl),
    totalCostBrl: roundMoney(totalCostBrl),
    chargeCredits: roundCredits(provider.chargeCredits),
    creditRevenueBrl: roundMoney(provider.creditRevenueBrl),
    marginBrl: roundMoney(provider.creditRevenueBrl - totalCostBrl),
    marginPercent: calculateMarginPercent(totalCostBrl, provider.creditRevenueBrl),
  };
}

function createProviderUsageSummary(
  provider: string,
  providerLabels: Map<string, string>,
): ProviderUsageUnitSummary {
  return {
    provider,
    label: providerLabels.get(provider) ?? providerNames[provider] ?? provider,
    events: 0,
    inputUnits: 0,
    outputUnits: 0,
    totalUnits: 0,
    unitLabel: provider === "elevenlabs"
      ? "caracteres/request"
      : provider === "gemini"
        ? "tokens"
        : provider === "r2"
          ? "GB armazenados"
          : "unidades",
    providerCostBrl: 0,
    creditRevenueBrl: 0,
    chargeCredits: 0,
    profitBrl: 0,
  };
}

function roundProviderUsageSummary(provider: ProviderUsageUnitSummary): ProviderUsageUnitSummary {
  return {
    ...provider,
    inputUnits: roundCredits(provider.inputUnits),
    outputUnits: roundCredits(provider.outputUnits),
    totalUnits: roundCredits(provider.totalUnits),
    providerCostBrl: roundMoney(provider.providerCostBrl),
    creditRevenueBrl: roundMoney(provider.creditRevenueBrl),
    chargeCredits: roundCredits(provider.chargeCredits),
    profitBrl: roundMoney(provider.creditRevenueBrl - provider.providerCostBrl),
  };
}

function buildCreditEconomicsSummary({
  planRows,
  unitProviderRows,
  approvedRevenueBrl,
  consumedCredits,
  purchasedCredits,
  providerCostBrl,
  realCostPerCreditBrl,
  averageActualRevenuePerCreditBrl,
}: {
  planRows: BillingPlanRow[];
  unitProviderRows: ProviderUsageUnitSummary[];
  approvedRevenueBrl: number;
  consumedCredits: number;
  purchasedCredits: number;
  providerCostBrl: number;
  realCostPerCreditBrl: number;
  averageActualRevenuePerCreditBrl: number;
}): CreditEconomicsSummary {
  const activePlans = planRows.filter((plan) => plan.status === "active");
  const activePlanCredits = activePlans.reduce((total, plan) => total + toNumber(plan.included_credits), 0);
  const activePlanMonthlyRevenueBrl = activePlans.reduce((total, plan) => total + toNumber(plan.monthly_price_brl), 0);
  const averagePlanCreditPriceBrl = activePlanCredits > 0 ? activePlanMonthlyRevenueBrl / activePlanCredits : 0;
  const benchmarkRevenuePerCreditBrl = averageActualRevenuePerCreditBrl > 0
    ? averageActualRevenuePerCreditBrl
    : averagePlanCreditPriceBrl;
  const profitPerCreditBrl = benchmarkRevenuePerCreditBrl - realCostPerCreditBrl;
  const plans = activePlans
    .map((plan) => mapPlanCreditEconomics(plan, realCostPerCreditBrl))
    .sort((a, b) => a.monthlyPriceBrl - b.monthlyPriceBrl);

  return {
    averagePlanCreditPriceBrl: roundMoney(averagePlanCreditPriceBrl),
    averageActualRevenuePerCreditBrl: roundMoney(averageActualRevenuePerCreditBrl),
    realCostPerCreditBrl: roundMoney(realCostPerCreditBrl),
    profitPerCreditBrl: roundMoney(profitPerCreditBrl),
    marginPercent: calculateMarginPercent(realCostPerCreditBrl, benchmarkRevenuePerCreditBrl),
    consumedCredits: roundCredits(consumedCredits),
    purchasedCredits: roundCredits(purchasedCredits),
    providerCostBrl: roundMoney(providerCostBrl),
    revenueBrl: roundMoney(approvedRevenueBrl),
    profitBrl: roundMoney(approvedRevenueBrl - providerCostBrl),
    activePlanCredits: roundCredits(activePlanCredits),
    activePlanMonthlyRevenueBrl: roundMoney(activePlanMonthlyRevenueBrl),
    plans,
    providers: unitProviderRows.map(roundProviderUsageSummary).sort((a, b) => b.providerCostBrl - a.providerCostBrl),
  };
}

function mapPlanCreditEconomics(
  plan: BillingPlanRow,
  realCostPerCreditBrl: number,
): PlanCreditEconomicsSummary {
  const monthlyPriceBrl = toNumber(plan.monthly_price_brl);
  const includedCredits = toNumber(plan.included_credits);
  const overageCreditPriceBrl = toNumber(plan.overage_credit_price_brl);
  const revenuePerIncludedCreditBrl = includedCredits > 0
    ? monthlyPriceBrl / includedCredits
    : overageCreditPriceBrl;
  const estimatedPlanCostBrl = includedCredits * realCostPerCreditBrl;
  const estimatedPlanProfitBrl = monthlyPriceBrl - estimatedPlanCostBrl;

  return {
    planCode: plan.plan_code,
    name: plan.name || plan.plan_code,
    status: plan.status || "draft",
    monthlyPriceBrl: roundMoney(monthlyPriceBrl),
    includedCredits: roundCredits(includedCredits),
    overageCreditPriceBrl: roundMoney(overageCreditPriceBrl),
    revenuePerIncludedCreditBrl: roundMoney(revenuePerIncludedCreditBrl),
    estimatedCostPerCreditBrl: roundMoney(realCostPerCreditBrl),
    estimatedProfitPerCreditBrl: roundMoney(revenuePerIncludedCreditBrl - realCostPerCreditBrl),
    estimatedPlanCostBrl: roundMoney(estimatedPlanCostBrl),
    estimatedPlanProfitBrl: roundMoney(estimatedPlanProfitBrl),
    marginPercent: calculateMarginPercent(estimatedPlanCostBrl, monthlyPriceBrl),
  };
}

function getOrCreateCustomerEconomics(
  customers: Map<string, CostCenterCustomerEconomics>,
  organizationId: string,
  organizationById: Map<string, OrganizationRow>,
) {
  const current = customers.get(organizationId);

  if (current) {
    return current;
  }

  const organization = organizationById.get(organizationId);
  const customer: CostCenterCustomerEconomics = {
    organizationId,
    name: organization?.name || organization?.slug || `Cliente ${organizationId.slice(0, 8)}`,
    planCode: organization?.plan_code || "sem_plano",
    status: organization?.status || "sem_status",
    revenueBrl: 0,
    variableCostBrl: 0,
    fixedCostBrl: 0,
    totalCostBrl: 0,
    chargeCredits: 0,
    connectedWhatsappInstances: 0,
    storageUsedBytes: 0,
    storageCostBrl: 0,
    marginBrl: 0,
    marginPercent: 0,
  };

  customers.set(organizationId, customer);
  return customer;
}

function roundCustomerEconomics(customer: CostCenterCustomerEconomics): CostCenterCustomerEconomics {
  const totalCostBrl = customer.variableCostBrl + customer.fixedCostBrl;

  return {
    ...customer,
    revenueBrl: roundMoney(customer.revenueBrl),
    variableCostBrl: roundMoney(customer.variableCostBrl),
    fixedCostBrl: roundMoney(customer.fixedCostBrl),
    totalCostBrl: roundMoney(totalCostBrl),
    chargeCredits: roundCredits(customer.chargeCredits),
    storageUsedBytes: roundStorageBytes(customer.storageUsedBytes),
    storageCostBrl: roundMoney(customer.storageCostBrl),
    marginBrl: roundMoney(customer.revenueBrl - totalCostBrl),
    marginPercent: calculateMarginPercent(totalCostBrl, customer.revenueBrl),
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

function isOnOrAfter(value: string | null | undefined, threshold: Date) {
  if (!value) {
    return false;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= threshold.getTime();
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

function isCurrentCostProvider(provider: string | null | undefined) {
  return Boolean(provider && CURRENT_COST_PROVIDERS.has(provider));
}

function calculateMarginPercent(cost: number, revenue: number) {
  if (revenue <= 0) {
    return 0;
  }

  return Math.round(((revenue - cost) / revenue) * 10000) / 100;
}

function suggestCreditPrice(realCostPerCredit: number, targetMarginPercent: number) {
  if (realCostPerCredit <= 0 || targetMarginPercent >= 100) {
    return 0;
  }

  return realCostPerCredit / (1 - targetMarginPercent / 100);
}

function roundMoney(value: number) {
  return Math.round(value * 100000000) / 100000000;
}

function roundCredits(value: number) {
  return Math.round(value * 1000000) / 1000000;
}

function bytesToGb(value: number) {
  return value / 1024 ** 3;
}

function roundStorageBytes(value: number) {
  return Math.round(Math.max(0, value));
}
