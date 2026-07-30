import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type GrowthProviderId = "meta-ads" | "google-growth";

export type GrowthAssetType =
  | "meta_ad_account"
  | "facebook_page"
  | "instagram_business_account"
  | "google_ads_customer"
  | "google_business_profile"
  | "google_search_console_site"
  | "meta_campaign"
  | "google_campaign"
  | "meta_post"
  | "google_keyword";

export type GrowthIntegrationAsset = {
  id: string;
  companyId: string;
  integrationId: string | null;
  providerId: GrowthProviderId;
  assetType: GrowthAssetType;
  externalId: string;
  parentExternalId: string | null;
  label: string;
  status: "available" | "selected" | "disabled" | "error" | "archived";
  isSelected: boolean;
  permissions: string[];
  metricsSummary: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
  lastSyncedAt: string | null;
  updatedAt: string | null;
};

export type GrowthAssetInput = {
  assetType: GrowthAssetType;
  externalId: string;
  parentExternalId?: string | null;
  label: string;
  status?: GrowthIntegrationAsset["status"];
  isSelected?: boolean;
  permissions?: string[];
  metricsSummary?: Record<string, unknown>;
  rawPayload?: Record<string, unknown>;
};

export type MetaOAuthAssetsSnapshot = {
  adAccountId?: string | null;
  adAccountLabel?: string | null;
  pageId?: string | null;
  pageLabel?: string | null;
  instagramBusinessId?: string | null;
  instagramLabel?: string | null;
  adAccounts?: Array<{ id: string; label: string; status?: string | null }>;
  pages?: Array<{ id: string; label: string }>;
  instagramAccounts?: Array<{ id: string; label: string; parentId?: string | null }>;
};

type GrowthAssetRow = {
  id: string;
  organization_id: string;
  organization_integration_id: string | null;
  provider_id: string;
  asset_type: string;
  external_id: string;
  parent_external_id: string | null;
  label: string | null;
  status: string | null;
  is_selected: boolean | null;
  permissions: string[] | null;
  metrics_summary: Record<string, unknown> | null;
  raw_payload: Record<string, unknown> | null;
  last_synced_at: string | null;
  updated_at: string | null;
};

type OrganizationIntegrationIdRow = {
  id: string;
};

type SyncJobRow = {
  id: string;
  status: string;
  created_at: string | null;
};

const selectedAssetTypesByProvider: Record<GrowthProviderId, GrowthAssetType[]> = {
  "google-growth": ["google_ads_customer"],
  "meta-ads": ["meta_ad_account", "facebook_page", "instagram_business_account"],
};

export function buildMetaOAuthAssetInputs(input: {
  assets: MetaOAuthAssetsSnapshot;
  permissions?: string[];
  selectedAdAccountId?: string | null;
  selectedFacebookPageId?: string | null;
  selectedInstagramBusinessId?: string | null;
}): GrowthAssetInput[] {
  const selectedAdAccountId = normalizeMetaAdAccountId(input.selectedAdAccountId ?? input.assets.adAccountId);
  const selectedFacebookPageId = readString(input.selectedFacebookPageId ?? input.assets.pageId) ?? "";
  const selectedInstagramBusinessId = readString(input.selectedInstagramBusinessId ?? input.assets.instagramBusinessId) ?? "";
  const adAccounts = (input.assets.adAccounts?.length ? input.assets.adAccounts : [{
    id: input.assets.adAccountId ?? "",
    label: input.assets.adAccountLabel ?? input.assets.adAccountId ?? "",
    status: null,
  }])
    .map((account) => ({
      id: normalizeMetaAdAccountId(account.id),
      label: account.label || normalizeMetaAdAccountId(account.id),
      status: account.status ?? null,
    }))
    .filter((account) => account.id);
  const pages = (input.assets.pages?.length ? input.assets.pages : [{
    id: input.assets.pageId ?? "",
    label: input.assets.pageLabel ?? input.assets.pageId ?? "",
  }]).filter((page) => page.id);
  const instagramAccounts = (input.assets.instagramAccounts?.length ? input.assets.instagramAccounts : [{
    id: input.assets.instagramBusinessId ?? "",
    label: input.assets.instagramLabel ?? input.assets.instagramBusinessId ?? "",
    parentId: input.assets.pageId ?? null,
  }]).filter((account) => account.id);

  return [
    ...adAccounts.map((account): GrowthAssetInput => ({
      assetType: "meta_ad_account",
      externalId: account.id,
      label: account.label,
      status: selectedAdAccountId === account.id ? "selected" : "available",
      isSelected: selectedAdAccountId === account.id,
      permissions: input.permissions ?? [],
      rawPayload: {
        account_status: account.status,
        source: "oauth",
      },
    })),
    ...pages.map((page): GrowthAssetInput => ({
      assetType: "facebook_page",
      externalId: page.id,
      label: page.label || page.id,
      status: selectedFacebookPageId === page.id ? "selected" : "available",
      isSelected: selectedFacebookPageId === page.id,
      permissions: input.permissions ?? [],
      rawPayload: { source: "oauth" },
    })),
    ...instagramAccounts.map((account): GrowthAssetInput => ({
      assetType: "instagram_business_account",
      externalId: account.id,
      parentExternalId: account.parentId ?? null,
      label: account.label || account.id,
      status: selectedInstagramBusinessId === account.id ? "selected" : "available",
      isSelected: selectedInstagramBusinessId === account.id,
      permissions: input.permissions ?? [],
      rawPayload: { source: "oauth" },
    })),
  ];
}

export function buildGoogleOAuthAssetInputs(input: {
  accessibleCustomers: string[];
  scopes?: string[];
  selectedCustomerId?: string | null;
  searchConsoleSiteUrl?: string | null;
}): GrowthAssetInput[] {
  const selectedCustomerId = normalizeGoogleCustomerId(input.selectedCustomerId ?? input.accessibleCustomers[0]);
  const customers = input.accessibleCustomers
    .map((customerId) => normalizeGoogleCustomerId(customerId))
    .filter(Boolean);
  const assets = customers.map((customerId): GrowthAssetInput => ({
    assetType: "google_ads_customer",
    externalId: customerId,
    label: `Google Ads ${customerId}`,
    status: selectedCustomerId === customerId ? "selected" : "available",
    isSelected: selectedCustomerId === customerId,
    permissions: input.scopes ?? [],
    rawPayload: { source: "oauth" },
  }));
  const searchConsoleSiteUrl = readString(input.searchConsoleSiteUrl);

  if (searchConsoleSiteUrl) {
    assets.push({
      assetType: "google_search_console_site",
      externalId: searchConsoleSiteUrl,
      label: searchConsoleSiteUrl,
      status: "available",
      permissions: input.scopes ?? [],
      rawPayload: { source: "oauth" },
    });
  }

  return assets;
}

export async function syncMetaOAuthAssets(input: {
  client: SupabaseClient;
  organizationId: string;
  organizationIntegrationId: string;
  assets: MetaOAuthAssetsSnapshot;
  permissions?: string[];
}) {
  const assetInputs = buildMetaOAuthAssetInputs({
    assets: input.assets,
    permissions: input.permissions,
    selectedAdAccountId: input.assets.adAccountId,
    selectedFacebookPageId: input.assets.pageId,
    selectedInstagramBusinessId: input.assets.instagramBusinessId,
  });

  return syncGrowthIntegrationAssets({
    client: input.client,
    organizationId: input.organizationId,
    organizationIntegrationId: input.organizationIntegrationId,
    providerId: "meta-ads",
    assets: assetInputs,
  });
}

export async function syncGoogleOAuthAssets(input: {
  client: SupabaseClient;
  organizationId: string;
  organizationIntegrationId: string;
  accessibleCustomers: string[];
  scopes?: string[];
  selectedCustomerId?: string | null;
}) {
  const assets = buildGoogleOAuthAssetInputs({
    accessibleCustomers: input.accessibleCustomers,
    scopes: input.scopes,
    selectedCustomerId: input.selectedCustomerId,
  });

  return syncGrowthIntegrationAssets({
    client: input.client,
    organizationId: input.organizationId,
    organizationIntegrationId: input.organizationIntegrationId,
    providerId: "google-growth",
    assets,
  });
}

export async function syncGrowthIntegrationAssets(input: {
  client: SupabaseClient;
  organizationId: string;
  organizationIntegrationId: string;
  providerId: GrowthProviderId;
  assets: GrowthAssetInput[];
}) {
  const now = new Date().toISOString();
  const assets = input.assets
    .map((asset) => ({
      ...asset,
      externalId: asset.externalId.trim(),
      label: asset.label.trim() || asset.externalId.trim(),
    }))
    .filter((asset) => asset.externalId);
  const selectedTypes = [...new Set(assets.filter((asset) => asset.isSelected).map((asset) => asset.assetType))];

  if (selectedTypes.length > 0) {
    const { error: resetError } = await input.client
      .from("integration_assets")
      .update({ is_selected: false, status: "available", updated_at: now })
      .eq("organization_id", input.organizationId)
      .eq("provider_id", input.providerId)
      .in("asset_type", selectedTypes);

    if (resetError) {
      throw new Error(resetError.message);
    }
  }

  if (assets.length === 0) {
    return { ready: true, inserted: 0, selected: 0 };
  }

  const { error } = await input.client
    .from("integration_assets")
    .upsert(assets.map((asset) => ({
      organization_id: input.organizationId,
      organization_integration_id: input.organizationIntegrationId,
      provider_id: input.providerId,
      asset_type: asset.assetType,
      external_id: asset.externalId,
      parent_external_id: asset.parentExternalId ?? null,
      label: asset.label,
      status: asset.isSelected ? "selected" : asset.status ?? "available",
      is_selected: asset.isSelected === true,
      permissions: asset.permissions ?? [],
      metrics_summary: asset.metricsSummary ?? {},
      raw_payload: asset.rawPayload ?? {},
      last_synced_at: now,
      updated_at: now,
    })), { onConflict: "organization_id,provider_id,asset_type,external_id" });

  if (error) {
    throw new Error(error.message);
  }

  return {
    ready: true,
    inserted: assets.length,
    selected: assets.filter((asset) => asset.isSelected).length,
  };
}

export async function markSelectedGrowthAssets(input: {
  client: SupabaseClient;
  organizationId: string;
  providerId: GrowthProviderId;
  selected: Partial<Record<GrowthAssetType, string | null>>;
}) {
  const now = new Date().toISOString();
  const resetTypes = selectedAssetTypesByProvider[input.providerId].filter((assetType) =>
    Object.prototype.hasOwnProperty.call(input.selected, assetType),
  );

  if (resetTypes.length === 0) {
    return { updated: 0 };
  }

  const { error: resetError } = await input.client
    .from("integration_assets")
    .update({ is_selected: false, status: "available", updated_at: now })
    .eq("organization_id", input.organizationId)
    .eq("provider_id", input.providerId)
    .in("asset_type", resetTypes);

  if (resetError) {
    throw new Error(resetError.message);
  }

  let updated = 0;

  for (const assetType of resetTypes) {
    const externalId = readString(input.selected[assetType]);

    if (!externalId) {
      continue;
    }

    const normalizedId = assetType === "meta_ad_account"
      ? normalizeMetaAdAccountId(externalId)
      : assetType === "google_ads_customer"
        ? normalizeGoogleCustomerId(externalId)
        : externalId;
    const { error } = await input.client
      .from("integration_assets")
      .update({ is_selected: true, status: "selected", updated_at: now })
      .eq("organization_id", input.organizationId)
      .eq("provider_id", input.providerId)
      .eq("asset_type", assetType)
      .eq("external_id", normalizedId);

    if (error) {
      throw new Error(error.message);
    }

    updated += 1;
  }

  return { updated };
}

export async function disableGrowthProviderAssets(input: {
  client: SupabaseClient;
  organizationId: string;
  providerId: GrowthProviderId;
}) {
  const { error } = await input.client
    .from("integration_assets")
    .update({
      is_selected: false,
      status: "disabled",
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId)
    .eq("provider_id", input.providerId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function queueGrowthIntegrationSyncJob(input: {
  client: SupabaseClient;
  organizationId: string;
  organizationIntegrationId?: string | null;
  providerId: GrowthProviderId;
  jobType?: "oauth_assets" | "traffic_snapshot" | "organic_snapshot" | "full_sync";
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const integrationId = input.organizationIntegrationId
    ?? await loadOrganizationIntegrationId({
      client: input.client,
      organizationId: input.organizationId,
      providerId: input.providerId,
    });
  const { data, error } = await input.client
    .from("integration_sync_jobs")
    .insert({
      organization_id: input.organizationId,
      organization_integration_id: integrationId,
      provider_id: input.providerId,
      job_type: input.jobType ?? "full_sync",
      status: "queued",
      created_by: input.actorId ?? null,
      metadata: input.metadata ?? {},
    })
    .select("id, status, created_at")
    .single<SyncJobRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel criar job de sincronizacao.");
  }

  return {
    id: data.id,
    status: data.status,
    createdAt: data.created_at,
  };
}

export async function getGrowthIntegrationAssets(input: {
  client: SupabaseClient;
  organizationIds: string[];
  providerId?: GrowthProviderId | null;
}) {
  if (input.organizationIds.length === 0) {
    return { ready: true, rows: [] as GrowthIntegrationAsset[] };
  }

  let query = input.client
    .from("integration_assets")
    .select("id, organization_id, organization_integration_id, provider_id, asset_type, external_id, parent_external_id, label, status, is_selected, permissions, metrics_summary, raw_payload, last_synced_at, updated_at")
    .in("organization_id", input.organizationIds)
    .order("updated_at", { ascending: false });

  if (input.providerId) {
    query = query.eq("provider_id", input.providerId);
  }

  const { data, error } = await query;

  if (error) {
    return { ready: false, rows: [] as GrowthIntegrationAsset[], message: error.message };
  }

  return {
    ready: true,
    rows: ((data ?? []) as GrowthAssetRow[]).map(mapGrowthAssetRow).filter((asset): asset is GrowthIntegrationAsset => Boolean(asset)),
  };
}

export function summarizeGrowthAssets(assets: GrowthIntegrationAsset[]) {
  return {
    total: assets.length,
    selected: assets.filter((asset) => asset.isSelected).length,
    metaAdAccounts: assets.filter((asset) => asset.assetType === "meta_ad_account").length,
    facebookPages: assets.filter((asset) => asset.assetType === "facebook_page").length,
    instagramBusinessAccounts: assets.filter((asset) => asset.assetType === "instagram_business_account").length,
    googleAdsCustomers: assets.filter((asset) => asset.assetType === "google_ads_customer").length,
  };
}

export function isGrowthProviderId(value: string | null | undefined): value is GrowthProviderId {
  return value === "meta-ads" || value === "google-growth";
}

export function normalizeGoogleCustomerId(value: string | null | undefined) {
  return value?.trim().replace(/^customers\//, "").replace(/\D/g, "") ?? "";
}

export function normalizeMetaAdAccountId(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed.replace(/^act_/, "")}`;
}

async function loadOrganizationIntegrationId(input: {
  client: SupabaseClient;
  organizationId: string;
  providerId: GrowthProviderId;
}) {
  const { data, error } = await input.client
    .from("organization_integrations")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("provider_id", input.providerId)
    .maybeSingle<OrganizationIntegrationIdRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

function mapGrowthAssetRow(row: GrowthAssetRow): GrowthIntegrationAsset | null {
  if (!isGrowthProviderId(row.provider_id) || !isGrowthAssetType(row.asset_type)) {
    return null;
  }

  return {
    id: row.id,
    companyId: row.organization_id,
    integrationId: row.organization_integration_id,
    providerId: row.provider_id,
    assetType: row.asset_type,
    externalId: row.external_id,
    parentExternalId: row.parent_external_id,
    label: row.label ?? row.external_id,
    status: normalizeAssetStatus(row.status),
    isSelected: row.is_selected === true,
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    metricsSummary: row.metrics_summary ?? {},
    rawPayload: row.raw_payload ?? {},
    lastSyncedAt: row.last_synced_at,
    updatedAt: row.updated_at,
  };
}

function isGrowthAssetType(value: string): value is GrowthAssetType {
  return selectedAssetTypesByProvider["meta-ads"].includes(value as GrowthAssetType)
    || selectedAssetTypesByProvider["google-growth"].includes(value as GrowthAssetType)
    || value === "google_business_profile"
    || value === "google_search_console_site"
    || value === "meta_campaign"
    || value === "google_campaign"
    || value === "meta_post"
    || value === "google_keyword";
}

function normalizeAssetStatus(value: string | null): GrowthIntegrationAsset["status"] {
  if (value === "selected" || value === "disabled" || value === "error" || value === "archived") {
    return value;
  }

  return "available";
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
