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
  marginBrl: number;
  marginPercent: number;
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
  provider: BillingProvider | string | null;
  name: string | null;
  enabled: boolean | null;
};

type RateRow = {
  active: boolean | null;
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

type WhatsappInstanceRow = {
  id: string;
  organization_id: string | null;
  provider: string | null;
  status: string | null;
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
    whatsappInstanceResult,
    commerce,
  ] = await Promise.all([
    supabase
      .from("usage_events")
      .select("organization_id, provider, provider_cost, connecty_revenue_estimate, gross_margin_estimate, connecty_charge_credits, occurred_at, billing_mode, agent_scope")
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
      .from("whatsapp_instances")
      .select("id, organization_id, provider, status")
      .eq("provider", "uazapi")
      .limit(5000),
    getCommerceRevenueSummary(supabase, sinceIso),
  ]);

  const errors = [usageResult.error, walletResult.error, costCenterResult.error, rateResult.error].filter(Boolean);
  const nonBlockingWarnings = [
    paymentResult.error?.message,
    creditTransactionResult.error?.message,
    organizationResult.error?.message,
    whatsappInstanceResult.error?.message,
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
  const whatsappInstanceRows = whatsappInstanceResult.error ? [] : (whatsappInstanceResult.data ?? []) as WhatsappInstanceRow[];
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
    whatsappInstanceRows,
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
  whatsappInstanceRows,
  todayStart,
  providerLabels,
}: {
  usageRows: UsageRow[];
  paymentRows: BillingPaymentRow[];
  creditTransactionRows: CreditTransactionRow[];
  organizationRows: OrganizationRow[];
  whatsappInstanceRows: WhatsappInstanceRow[];
  todayStart: Date;
  providerLabels: Map<string, string>;
}): CurrentCostCenterSummary {
  const organizationById = new Map(organizationRows.map((organization) => [organization.id, organization]));
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
  const providerMap = new Map<string, CostCenterProviderEconomics>();
  const customerMap = new Map<string, CostCenterCustomerEconomics>();
  let consumedCredits = 0;
  let todayConsumedCredits = 0;
  let variableCostBrl = 0;
  let todayVariableCostBrl = 0;
  let creditRevenueBrl = 0;
  let todayCreditRevenueBrl = 0;

  for (const provider of CURRENT_COST_PROVIDERS) {
    providerMap.set(provider, createProviderEconomics(provider, providerLabels));
  }

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

  const fixedCostBrl = fixedProvider.periodCostBrl;
  const todayFixedCostBrl = fixedProvider.todayCostBrl;
  const totalCostBrl = variableCostBrl + fixedCostBrl;
  const todayTotalCostBrl = todayVariableCostBrl + todayFixedCostBrl;
  const grossProfitBrl = approvedRevenueBrl - totalCostBrl;
  const todayGrossProfitBrl = todayApprovedRevenueBrl - todayTotalCostBrl;
  const realCostPerConsumedCreditBrl = consumedCredits > 0 ? totalCostBrl / consumedCredits : 0;
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

  return {
    periodLabel: "Ultimos 30 dias",
    scopeLabel: "Custos atuais: Gemini, ElevenLabs e Uazapi",
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

  return {
    periodLabel: "Ultimos 30 dias",
    scopeLabel: "Custos atuais: Gemini, ElevenLabs e Uazapi",
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
    providers: [
      roundProviderEconomics(createProviderEconomics("gemini", new Map())),
      roundProviderEconomics(createProviderEconomics("elevenlabs", new Map())),
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
