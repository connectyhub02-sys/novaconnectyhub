import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { BillingProvider, BillingUnit } from "./cost-center";

export type BillingCatalogRate = {
  id: string;
  provider: BillingProvider | string;
  providerLabel: string;
  featureCode: string;
  featureName: string;
  modelId: string | null;
  modelName: string | null;
  planCode: string | null;
  unit: BillingUnit | string;
  providerCostPerUnit: number;
  connectyPricePerUnit: number;
  marginMultiplier: number | null;
  minimumChargeCredits: number;
  active: boolean;
};

export type BillingCatalogFeature = {
  id: string;
  provider: BillingProvider | string;
  providerLabel: string;
  featureCode: string;
  name: string;
  description: string | null;
  unit: BillingUnit | string;
  enabled: boolean;
  billable: boolean;
  includedInPlans: string[];
};

export type BillingCatalogOrganization = {
  id: string;
  name: string;
  slug: string | null;
  planCode: string;
  status: string;
  balanceCredits: number;
  lifetimePurchasedCredits: number;
  lifetimeUsedCredits: number;
};

export type BillingCommercialCatalog = {
  schemaReady: boolean;
  features: BillingCatalogFeature[];
  rates: BillingCatalogRate[];
  organizations: BillingCatalogOrganization[];
  warnings: string[];
};

type CostCenterRow = {
  id: string;
  provider: BillingProvider | string;
  name: string;
};

type FeatureRow = {
  id: string;
  cost_center_id: string;
  feature_code: string;
  name: string;
  description: string | null;
  unit: BillingUnit | string;
  enabled: boolean | null;
  billable: boolean | null;
  included_in_plans: string[] | null;
};

type ModelRow = {
  id: string;
  cost_center_id: string;
  provider_model_id: string;
  display_name: string;
  feature_code: string | null;
};

type RateRow = {
  id: string;
  cost_center_id: string;
  feature_id: string | null;
  model_id: string | null;
  plan_code: string | null;
  unit: BillingUnit | string;
  provider_cost_per_unit: number | string | null;
  connecty_price_per_unit: number | string | null;
  margin_multiplier: number | string | null;
  minimum_charge_credits: number | string | null;
  active: boolean | null;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string | null;
  plan_code: string;
  status: string;
};

type WalletRow = {
  organization_id: string;
  balance_credits: number | string | null;
  lifetime_purchased_credits: number | string | null;
  lifetime_used_credits: number | string | null;
};

export async function getBillingCommercialCatalog(): Promise<BillingCommercialCatalog> {
  const supabase = await createClient();

  const [costCentersResult, featuresResult, modelsResult, ratesResult, organizationsResult, walletsResult] = await Promise.all([
    supabase.from("provider_cost_centers").select("id, provider, name").order("name", { ascending: true }).limit(100),
    supabase
      .from("provider_features")
      .select("id, cost_center_id, feature_code, name, description, unit, enabled, billable, included_in_plans")
      .order("name", { ascending: true })
      .limit(500),
    supabase.from("provider_models").select("id, cost_center_id, provider_model_id, display_name, feature_code").order("display_name", { ascending: true }).limit(500),
    supabase
      .from("billing_rates")
      .select("id, cost_center_id, feature_id, model_id, plan_code, unit, provider_cost_per_unit, connecty_price_per_unit, margin_multiplier, minimum_charge_credits, active")
      .order("created_at", { ascending: true })
      .limit(1000),
    supabase.from("organizations").select("id, name, slug, plan_code, status").order("created_at", { ascending: false }).limit(300),
    supabase.from("credit_wallets").select("organization_id, balance_credits, lifetime_purchased_credits, lifetime_used_credits").limit(1000),
  ]);

  const errors = [
    costCentersResult.error,
    featuresResult.error,
    modelsResult.error,
    ratesResult.error,
    organizationsResult.error,
    walletsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    return {
      schemaReady: false,
      features: [],
      rates: [],
      organizations: [],
      warnings: errors.map((error) => error?.message ?? "Erro desconhecido ao carregar catalogo financeiro."),
    };
  }

  const costCenters = ((costCentersResult.data ?? []) as CostCenterRow[]).reduce((map, row) => {
    map.set(row.id, row);
    return map;
  }, new Map<string, CostCenterRow>());

  const features = ((featuresResult.data ?? []) as FeatureRow[]).reduce((map, row) => {
    map.set(row.id, row);
    return map;
  }, new Map<string, FeatureRow>());

  const models = ((modelsResult.data ?? []) as ModelRow[]).reduce((map, row) => {
    map.set(row.id, row);
    return map;
  }, new Map<string, ModelRow>());

  const wallets = ((walletsResult.data ?? []) as WalletRow[]).reduce((map, row) => {
    map.set(row.organization_id, row);
    return map;
  }, new Map<string, WalletRow>());

  const rates = ((ratesResult.data ?? []) as RateRow[]).map((rate) => {
    const costCenter = costCenters.get(rate.cost_center_id);
    const feature = rate.feature_id ? features.get(rate.feature_id) : null;
    const model = rate.model_id ? models.get(rate.model_id) : null;

    return {
      id: rate.id,
      provider: costCenter?.provider ?? "custom",
      providerLabel: costCenter?.name ?? "Provedor",
      featureCode: feature?.feature_code ?? model?.feature_code ?? "custom",
      featureName: feature?.name ?? model?.display_name ?? "Recurso",
      modelId: model?.provider_model_id ?? null,
      modelName: model?.display_name ?? null,
      planCode: rate.plan_code,
      unit: rate.unit,
      providerCostPerUnit: toNumber(rate.provider_cost_per_unit),
      connectyPricePerUnit: toNumber(rate.connecty_price_per_unit),
      marginMultiplier: rate.margin_multiplier === null ? null : toNumber(rate.margin_multiplier),
      minimumChargeCredits: toNumber(rate.minimum_charge_credits),
      active: Boolean(rate.active),
    };
  });

  const commercialFeatures = ((featuresResult.data ?? []) as FeatureRow[]).map((feature) => {
    const costCenter = costCenters.get(feature.cost_center_id);

    return {
      id: feature.id,
      provider: costCenter?.provider ?? "custom",
      providerLabel: costCenter?.name ?? "Provedor",
      featureCode: feature.feature_code,
      name: feature.name,
      description: feature.description,
      unit: feature.unit,
      enabled: feature.enabled !== false,
      billable: feature.billable !== false,
      includedInPlans: toStringArray(feature.included_in_plans),
    };
  });

  const organizations = ((organizationsResult.data ?? []) as OrganizationRow[]).map((organization) => {
    const wallet = wallets.get(organization.id);

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      planCode: organization.plan_code,
      status: organization.status,
      balanceCredits: toNumber(wallet?.balance_credits),
      lifetimePurchasedCredits: toNumber(wallet?.lifetime_purchased_credits),
      lifetimeUsedCredits: toNumber(wallet?.lifetime_used_credits),
    };
  });

  return {
    schemaReady: true,
    features: commercialFeatures,
    rates,
    organizations,
    warnings: [],
  };
}

function toStringArray(value: string[] | null | undefined) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
