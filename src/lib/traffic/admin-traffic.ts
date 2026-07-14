import "server-only";

import { createHmac } from "node:crypto";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";

type JsonRecord = Record<string, unknown>;

type CredentialRow = {
  scope: string | null;
  organization_id: string | null;
  integration_id: string | null;
  env_name: string | null;
  encrypted_value: string | null;
};

type LeadAttributionRow = {
  source: string | null;
  metadata: JsonRecord | null;
  created_at: string | null;
};

type CredentialMap = Map<string, string>;

type TrafficRange = {
  since: string;
  until: string;
  label: string;
};

type TrafficCredentialScope =
  | { scope: "platform"; organizationId?: null }
  | { scope: "organization"; organizationId: string };

export type TrafficProviderStatus = "online" | "warning" | "offline";
export type TrafficProviderKind = "paid" | "organic";

export type TrafficProviderSummary = {
  id: string;
  name: string;
  platform: "Meta" | "Google";
  kind: TrafficProviderKind;
  status: TrafficProviderStatus;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  engagements: number;
  ctr: number;
  cpc: number;
  cpm: number;
  averagePosition: number | null;
  detail: string;
};

export type TrafficCampaign = {
  id: string;
  name: string;
  platform: "Meta" | "Google";
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
};

export type TrafficSeriesPoint = {
  label: string;
  value: number;
};

export type TrafficSourceStatus = {
  id: string;
  label: string;
  status: TrafficProviderStatus;
  detail: string;
};

export type TrafficTrackingSnapshot = {
  metaPixelId: string | null;
  metaAdAccountId: string | null;
  instagramBusinessId: string | null;
  facebookPageId: string | null;
  googleAdsCustomerId: string | null;
  googleAdsConversionId: string | null;
  googleAnalyticsMeasurementId: string | null;
  googleSearchConsoleSiteUrl: string | null;
};

export type TrafficLeadAttribution = {
  meta: number;
  google: number;
  total: number;
  latestReceivedAt: {
    meta: string | null;
    google: string | null;
    any: string | null;
  };
};

export type AdminTrafficOverview = {
  generatedAt: string;
  range: TrafficRange;
  summary: {
    paidSpend: number;
    paidClicks: number;
    paidImpressions: number;
    paidConversions: number;
    organicClicks: number;
    organicImpressions: number;
    organicEngagements: number;
  };
  paidProviders: TrafficProviderSummary[];
  organicProviders: TrafficProviderSummary[];
  campaigns: TrafficCampaign[];
  platformSeries: {
    metaPaidClicks: TrafficSeriesPoint[];
    googlePaidClicks: TrafficSeriesPoint[];
    metaOrganicClicks: TrafficSeriesPoint[];
    googleOrganicClicks: TrafficSeriesPoint[];
  };
  tracking: TrafficTrackingSnapshot;
  leadAttribution: TrafficLeadAttribution;
  paidClickSeries: TrafficSeriesPoint[];
  organicClickSeries: TrafficSeriesPoint[];
  sourceStatus: TrafficSourceStatus[];
  warnings: string[];
};

type ProviderFetchResult = {
  provider: TrafficProviderSummary;
  campaigns?: TrafficCampaign[];
  series?: TrafficSeriesPoint[];
  warnings?: string[];
};

const credentialEnvNames = [
  "META_ACCESS_TOKEN",
  "META_APP_SECRET",
  "META_AD_ACCOUNT_ID",
  "META_PIXEL_ID",
  "INSTAGRAM_BUSINESS_ACCOUNT_ID",
  "FACEBOOK_PAGE_ID",
  "META_GRAPH_API_VERSION",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
  "GOOGLE_ADS_CUSTOMER_ID",
  "GOOGLE_ADS_CONVERSION_ID",
  "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
  "GOOGLE_ANALYTICS_MEASUREMENT_ID",
  "GOOGLE_SEARCH_CONSOLE_SITE_URL",
];

const googleAdsApiVersion = "v24";

export async function getAdminTrafficOverview(): Promise<AdminTrafficOverview> {
  return getTrafficOverview({ scope: "platform" });
}

export async function getClientTrafficOverview(organizationId: string): Promise<AdminTrafficOverview> {
  return getTrafficOverview({ scope: "organization", organizationId });
}

async function getTrafficOverview(credentialScope: TrafficCredentialScope): Promise<AdminTrafficOverview> {
  const range = buildTrafficRange();
  const warnings: string[] = [];
  const credentials = await loadTrafficCredentials(warnings, credentialScope);
  const googleAccessToken = await exchangeGoogleRefreshToken(credentials, warnings, credentialScope);

  const [metaPaid, googlePaid, metaOrganic, googleOrganic, leadAttribution] = await Promise.all([
    fetchMetaPaidTraffic(credentials, range, credentialScope),
    fetchGooglePaidTraffic(credentials, range, googleAccessToken, credentialScope),
    fetchMetaOrganicTraffic(credentials, range, credentialScope),
    fetchGoogleOrganicTraffic(credentials, range, googleAccessToken, credentialScope),
    loadTrafficLeadAttribution(range, warnings, credentialScope.scope === "organization" ? credentialScope.organizationId : null),
  ]);

  const paidProviders = [metaPaid.provider, googlePaid.provider];
  const organicProviders = [metaOrganic.provider, googleOrganic.provider];
  const campaigns = [...(metaPaid.campaigns ?? []), ...(googlePaid.campaigns ?? [])]
    .sort((left, right) => right.spend - left.spend)
    .slice(0, 50);
  const paidClickSeries = mergeSeries([metaPaid.series ?? [], googlePaid.series ?? []]);
  const organicClickSeries = mergeSeries([metaOrganic.series ?? [], googleOrganic.series ?? []]);

  warnings.push(
    ...(metaPaid.warnings ?? []),
    ...(googlePaid.warnings ?? []),
    ...(metaOrganic.warnings ?? []),
    ...(googleOrganic.warnings ?? []),
  );

  return {
    generatedAt: new Date().toISOString(),
    range,
    summary: {
      paidSpend: sum(paidProviders, "spend"),
      paidClicks: sum(paidProviders, "clicks"),
      paidImpressions: sum(paidProviders, "impressions"),
      paidConversions: sum(paidProviders, "conversions"),
      organicClicks: sum(organicProviders, "clicks"),
      organicImpressions: sum(organicProviders, "impressions"),
      organicEngagements: sum(organicProviders, "engagements"),
    },
    paidProviders,
    organicProviders,
    campaigns,
    platformSeries: {
      metaPaidClicks: metaPaid.series ?? [],
      googlePaidClicks: googlePaid.series ?? [],
      metaOrganicClicks: metaOrganic.series ?? [],
      googleOrganicClicks: googleOrganic.series ?? [],
    },
    tracking: buildTrafficTrackingSnapshot(credentials),
    leadAttribution,
    paidClickSeries,
    organicClickSeries,
    sourceStatus: [
      providerToSourceStatus(metaPaid.provider),
      providerToSourceStatus(googlePaid.provider),
      providerToSourceStatus(metaOrganic.provider),
      providerToSourceStatus(googleOrganic.provider),
    ],
    warnings: [...new Set(warnings.filter(Boolean))],
  };
}

async function loadTrafficCredentials(warnings: string[], credentialScope: TrafficCredentialScope) {
  const values: CredentialMap = new Map();
  const scopedValues = credentialScope.scope === "organization" ? new Map<string, string>() : values;

  try {
    const client = createServiceClient();
    let query = client
      .from("integration_credentials")
      .select("scope, organization_id, integration_id, env_name, encrypted_value")
      .in("env_name", credentialEnvNames);

    if (credentialScope.scope === "organization") {
      query = query.or(`and(scope.eq.platform,organization_id.is.null),and(scope.eq.organization,organization_id.eq.${credentialScope.organizationId})`);
    } else {
      query = query.eq("scope", "platform").is("organization_id", null);
    }

    const { data, error } = await query;

    if (error) {
      warnings.push(`Nao foi possivel carregar credenciais do cofre: ${error.message}`);
    } else {
      for (const row of (data ?? []) as CredentialRow[]) {
        if (!row.env_name || !row.encrypted_value) {
          continue;
        }

        try {
          const decrypted = decryptCredentialValue(row.encrypted_value);

          if (
            credentialScope.scope === "organization"
            && row.scope === "organization"
            && row.organization_id === credentialScope.organizationId
          ) {
            scopedValues.set(row.env_name, decrypted);
          } else if (!values.has(row.env_name)) {
            values.set(row.env_name, decrypted);
          }
        } catch {
          warnings.push(`Credencial ${row.env_name} existe, mas nao pode ser descriptografada.`);
        }
      }
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Cofre de credenciais indisponivel.");
  }

  for (const envName of credentialEnvNames) {
    const fallback = process.env[envName]?.trim();
    if (fallback && !values.has(envName)) {
      values.set(envName, fallback);
    }
  }

  if (credentialScope.scope === "organization") {
    for (const [envName, value] of scopedValues) {
      values.set(envName, value);
    }
  }

  return values;
}

async function loadTrafficLeadAttribution(
  range: TrafficRange,
  warnings: string[],
  organizationId: string | null,
): Promise<TrafficLeadAttribution> {
  const attribution: TrafficLeadAttribution = {
    meta: 0,
    google: 0,
    total: 0,
    latestReceivedAt: {
      meta: null,
      google: null,
      any: null,
    },
  };

  try {
    const client = createServiceClient();
    let query = client
      .from("leads")
      .select("source, metadata, created_at")
      .gte("created_at", `${range.since}T00:00:00.000Z`)
      .lte("created_at", `${range.until}T23:59:59.999Z`)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }

    const { data, error } = await query;

    if (error) {
      warnings.push(`Nao foi possivel carregar leads internos por origem: ${error.message}`);
      return attribution;
    }

    const rows = (data ?? []) as LeadAttributionRow[];
    attribution.total = rows.length;
    attribution.latestReceivedAt.any = rows.find((row) => row.created_at)?.created_at ?? null;

    for (const row of rows) {
      const platform = classifyLeadPlatform(row);

      if (platform === "meta") {
        attribution.meta += 1;
        attribution.latestReceivedAt.meta ??= row.created_at;
      }

      if (platform === "google") {
        attribution.google += 1;
        attribution.latestReceivedAt.google ??= row.created_at;
      }
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Nao foi possivel carregar leads internos por origem.");
  }

  return attribution;
}

function buildTrafficTrackingSnapshot(credentials: CredentialMap): TrafficTrackingSnapshot {
  return {
    metaPixelId: nullableCredential(getCredential(credentials, ["META_PIXEL_ID"])),
    metaAdAccountId: nullableCredential(getCredential(credentials, ["META_AD_ACCOUNT_ID"])),
    instagramBusinessId: nullableCredential(getCredential(credentials, ["INSTAGRAM_BUSINESS_ACCOUNT_ID"])),
    facebookPageId: nullableCredential(getCredential(credentials, ["FACEBOOK_PAGE_ID"])),
    googleAdsCustomerId: nullableCredential(getCredential(credentials, ["GOOGLE_ADS_CUSTOMER_ID"])),
    googleAdsConversionId: nullableCredential(getCredential(credentials, ["GOOGLE_ADS_CONVERSION_ID"])),
    googleAnalyticsMeasurementId: nullableCredential(getCredential(credentials, ["GOOGLE_ANALYTICS_MEASUREMENT_ID"])),
    googleSearchConsoleSiteUrl: nullableCredential(getCredential(credentials, ["GOOGLE_SEARCH_CONSOLE_SITE_URL"])),
  };
}

async function fetchMetaPaidTraffic(
  credentials: CredentialMap,
  range: TrafficRange,
  credentialScope: TrafficCredentialScope,
): Promise<ProviderFetchResult> {
  const emptyMetaPaid = buildEmptyMetaPaidProvider(credentialScope);
  const accessToken = getCredential(credentials, ["META_ACCESS_TOKEN"]);
  const adAccountId = normalizeMetaAdAccountId(getCredential(credentials, ["META_AD_ACCOUNT_ID"]));

  if (!accessToken || !adAccountId) {
    return {
      provider: {
        ...emptyMetaPaid,
        status: "warning",
      },
    };
  }

  const url = buildMetaGraphUrl(credentials, `/${adAccountId}/insights`);
  url.searchParams.set("level", "campaign");
  url.searchParams.set("fields", "campaign_id,campaign_name,impressions,clicks,spend,cpc,cpm,ctr,actions,date_start,date_stop");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("time_range", JSON.stringify({ since: range.since, until: range.until }));
  url.searchParams.set("limit", "250");
  appendMetaAuth(url, credentials);

  const result = await fetchJson(url.toString());

  if (!result.ok) {
    return {
      provider: {
        ...emptyMetaPaid,
        status: "offline",
        detail: readProviderError(result.data) ?? "Meta Ads nao retornou os insights da conta.",
      },
      warnings: [readProviderError(result.data) ?? "Falha ao consultar Meta Ads."],
    };
  }

  const rows = readArray(readRecord(result.data)?.data);
  const campaignsById = new Map<string, TrafficCampaign>();
  const seriesByDate = new Map<string, number>();

  for (const row of rows) {
    const record = readRecord(row);
    if (!record) continue;

    const id = readString(record.campaign_id) ?? readString(record.campaignName) ?? "meta-campaign";
    const name = readString(record.campaign_name) ?? "Campanha Meta";
    const spend = readNumber(record.spend);
    const clicks = readNumber(record.clicks);
    const impressions = readNumber(record.impressions);
    const conversions = readMetaLeadActions(record.actions);
    const current = campaignsById.get(id) ?? {
      id,
      name,
      platform: "Meta" as const,
      status: "active",
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      ctr: 0,
      cpc: 0,
    };

    current.spend += spend;
    current.clicks += clicks;
    current.impressions += impressions;
    current.conversions += conversions;
    current.ctr = ratioPercent(current.clicks, current.impressions);
    current.cpc = ratio(current.spend, current.clicks);
    campaignsById.set(id, current);

    const date = readString(record.date_start);
    if (date) {
      seriesByDate.set(date, (seriesByDate.get(date) ?? 0) + clicks);
    }
  }

  const campaigns = [...campaignsById.values()];
  const provider = providerFromCampaigns({
    ...emptyMetaPaid,
    status: "online",
    detail: rows.length ? `${rows.length} linha(s) de insights Meta retornada(s).` : "Meta respondeu, mas sem dados no periodo.",
  }, campaigns);

  return {
    provider,
    campaigns,
    series: mapSeries(seriesByDate),
  };
}

async function fetchGooglePaidTraffic(
  credentials: CredentialMap,
  range: TrafficRange,
  accessToken: string | null,
  credentialScope: TrafficCredentialScope,
): Promise<ProviderFetchResult> {
  const emptyGooglePaid = buildEmptyGooglePaidProvider(credentialScope);
  const developerToken = getCredential(credentials, ["GOOGLE_ADS_DEVELOPER_TOKEN"]);

  if (!developerToken || !accessToken) {
    return {
      provider: {
        ...emptyGooglePaid,
        status: "warning",
      },
    };
  }

  const customerId = await resolveGoogleAdsCustomerId(credentials, accessToken, developerToken);

  if (!customerId) {
    return {
      provider: {
        ...emptyGooglePaid,
        status: "warning",
        detail: "OAuth validado, mas nenhuma conta Google Ads acessivel foi encontrada.",
      },
    };
  }

  const headers = buildGoogleAdsHeaders(credentials, accessToken, developerToken);
  const query = [
    "SELECT",
    "campaign.id, campaign.name, campaign.status, segments.date,",
    "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr, metrics.average_cpc",
    "FROM campaign",
    `WHERE segments.date BETWEEN '${range.since}' AND '${range.until}'`,
    "ORDER BY segments.date DESC",
    "LIMIT 500",
  ].join(" ");

  const result = await fetchJson(`https://googleads.googleapis.com/${googleAdsApiVersion}/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ pageSize: 500, query }),
  });

  if (!result.ok) {
    const message = readProviderError(result.data) ?? "Google Ads nao retornou relatorio de campanhas.";
    return {
      provider: {
        ...emptyGooglePaid,
        status: "offline",
        detail: message,
      },
      warnings: [message],
    };
  }

  const rows = readArray(readRecord(result.data)?.results);
  const campaignsById = new Map<string, TrafficCampaign>();
  const seriesByDate = new Map<string, number>();

  for (const row of rows) {
    const record = readRecord(row);
    const campaign = readRecord(record?.campaign);
    const metrics = readRecord(record?.metrics);
    const segments = readRecord(record?.segments);

    if (!campaign || !metrics) continue;

    const id = String(readString(campaign.id) ?? "google-campaign");
    const name = readString(campaign.name) ?? "Campanha Google";
    const status = readString(campaign.status) ?? "UNKNOWN";
    const clicks = readNumber(readAny(metrics, ["clicks"]));
    const impressions = readNumber(readAny(metrics, ["impressions"]));
    const costMicros = readNumber(readAny(metrics, ["costMicros", "cost_micros"]));
    const conversions = readNumber(readAny(metrics, ["conversions"]));
    const spend = costMicros / 1_000_000;
    const current = campaignsById.get(id) ?? {
      id,
      name,
      platform: "Google" as const,
      status,
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      ctr: 0,
      cpc: 0,
    };

    current.spend += spend;
    current.clicks += clicks;
    current.impressions += impressions;
    current.conversions += conversions;
    current.ctr = ratioPercent(current.clicks, current.impressions);
    current.cpc = ratio(current.spend, current.clicks);
    campaignsById.set(id, current);

    const date = readString(segments?.date);
    if (date) {
      seriesByDate.set(date, (seriesByDate.get(date) ?? 0) + clicks);
    }
  }

  const campaigns = [...campaignsById.values()];
  const provider = providerFromCampaigns({
    ...emptyGooglePaid,
    status: "online",
    detail: rows.length ? `${rows.length} linha(s) Google Ads retornada(s).` : "Google Ads respondeu, mas sem dados no periodo.",
  }, campaigns);

  return {
    provider,
    campaigns,
    series: mapSeries(seriesByDate),
  };
}

async function fetchMetaOrganicTraffic(
  credentials: CredentialMap,
  range: TrafficRange,
  credentialScope: TrafficCredentialScope,
): Promise<ProviderFetchResult> {
  const emptyMetaOrganic = buildEmptyMetaOrganicProvider(credentialScope);
  const accessToken = getCredential(credentials, ["META_ACCESS_TOKEN"]);
  const instagramId = getCredential(credentials, ["INSTAGRAM_BUSINESS_ACCOUNT_ID"]);
  const pageId = getCredential(credentials, ["FACEBOOK_PAGE_ID"]);

  if (!accessToken || (!instagramId && !pageId)) {
    return {
      provider: {
        ...emptyMetaOrganic,
        status: "warning",
      },
    };
  }

  const warnings: string[] = [];
  const seriesByDate = new Map<string, number>();
  let impressions = 0;
  let clicks = 0;
  let engagements = 0;

  if (instagramId) {
    const url = buildMetaGraphUrl(credentials, `/${instagramId}/insights`);
    url.searchParams.set("metric", "reach,profile_views,website_clicks");
    url.searchParams.set("period", "day");
    url.searchParams.set("since", String(toUnixSeconds(range.since)));
    url.searchParams.set("until", String(toUnixSeconds(range.until)));
    appendMetaAuth(url, credentials);

    const result = await fetchJson(url.toString());
    if (result.ok) {
      const metricValues = readMetaInsightValues(result.data);
      impressions += metricValues.reach ?? 0;
      clicks += (metricValues.profile_views ?? 0) + (metricValues.website_clicks ?? 0);
      engagements += metricValues.profile_views ?? 0;
      mergeMetaDailySeries(seriesByDate, result.data, ["profile_views", "website_clicks"]);
    } else {
      warnings.push(readProviderError(result.data) ?? "Instagram Insights nao retornou dados organicos.");
    }
  }

  if (pageId) {
    const url = buildMetaGraphUrl(credentials, `/${pageId}/insights`);
    url.searchParams.set("metric", "page_impressions,page_post_engagements");
    url.searchParams.set("period", "day");
    url.searchParams.set("since", String(toUnixSeconds(range.since)));
    url.searchParams.set("until", String(toUnixSeconds(range.until)));
    appendMetaAuth(url, credentials);

    const result = await fetchJson(url.toString());
    if (result.ok) {
      const metricValues = readMetaInsightValues(result.data);
      impressions += metricValues.page_impressions ?? 0;
      engagements += metricValues.page_post_engagements ?? 0;
      mergeMetaDailySeries(seriesByDate, result.data, ["page_post_engagements"]);
    } else {
      warnings.push(readProviderError(result.data) ?? "Facebook Page Insights nao retornou dados organicos.");
    }
  }

  const provider: TrafficProviderSummary = {
    ...emptyMetaOrganic,
    status: warnings.length && impressions + clicks + engagements === 0 ? "offline" : "online",
    impressions,
    clicks,
    engagements,
    ctr: ratioPercent(clicks, impressions),
    detail: impressions + clicks + engagements > 0
      ? "Insights organicos Meta carregados."
      : "Meta respondeu sem metricas organicas no periodo.",
  };

  return {
    provider,
    series: mapSeries(seriesByDate),
    warnings,
  };
}

async function fetchGoogleOrganicTraffic(
  credentials: CredentialMap,
  range: TrafficRange,
  accessToken: string | null,
  credentialScope: TrafficCredentialScope,
): Promise<ProviderFetchResult> {
  const emptyGoogleOrganic = buildEmptyGoogleOrganicProvider(credentialScope);
  const siteUrl = getCredential(credentials, ["GOOGLE_SEARCH_CONSOLE_SITE_URL"]);

  if (!siteUrl || !accessToken) {
    return {
      provider: {
        ...emptyGoogleOrganic,
        status: "warning",
      },
    };
  }

  const result = await fetchJson(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: range.since,
        endDate: range.until,
        dimensions: ["date"],
        rowLimit: 1000,
        type: "web",
      }),
    },
  );

  if (!result.ok) {
    const message = readProviderError(result.data) ?? "Search Console nao retornou dados organicos.";
    return {
      provider: {
        ...emptyGoogleOrganic,
        status: "offline",
        detail: message,
      },
      warnings: [message],
    };
  }

  const rows = readArray(readRecord(result.data)?.rows);
  const seriesByDate = new Map<string, number>();
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;

  for (const row of rows) {
    const record = readRecord(row);
    if (!record) continue;

    const rowClicks = readNumber(record.clicks);
    const rowImpressions = readNumber(record.impressions);
    const position = readNumber(record.position);
    const keys = readArray(record.keys);
    const date = readString(keys[0]);

    clicks += rowClicks;
    impressions += rowImpressions;
    weightedPosition += position * Math.max(rowImpressions, 1);

    if (date) {
      seriesByDate.set(date, (seriesByDate.get(date) ?? 0) + rowClicks);
    }
  }

  const provider: TrafficProviderSummary = {
    ...emptyGoogleOrganic,
    status: "online",
    clicks,
    impressions,
    ctr: ratioPercent(clicks, impressions),
    averagePosition: impressions > 0 ? weightedPosition / impressions : null,
    detail: rows.length ? `${rows.length} dia(s) carregado(s) do Search Console.` : "Search Console respondeu, mas sem dados no periodo.",
  };

  return {
    provider,
    series: mapSeries(seriesByDate),
  };
}

async function exchangeGoogleRefreshToken(
  credentials: CredentialMap,
  warnings: string[],
  credentialScope: TrafficCredentialScope,
) {
  const clientId = getCredential(credentials, ["GOOGLE_ADS_CLIENT_ID"]);
  const clientSecret = getCredential(credentials, ["GOOGLE_ADS_CLIENT_SECRET"]);
  const refreshToken = getCredential(credentials, ["GOOGLE_ADS_REFRESH_TOKEN"]);

  if (!clientId || !clientSecret || !refreshToken) {
    warnings.push(credentialScope.scope === "organization"
      ? "Google Ads ainda nao esta conectado em Integracoes para esta empresa."
      : "Google OAuth ainda nao tem Client ID, Client secret e Refresh token completos na Sala de Manutencao.");
    return null;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const result = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });

  if (!result.ok) {
    warnings.push(readProviderError(result.data) ?? "Google OAuth nao retornou access_token.");
    return null;
  }

  const token = readString(readRecord(result.data)?.access_token);
  if (!token) {
    warnings.push("Google OAuth respondeu sem access_token.");
    return null;
  }

  return token;
}

async function resolveGoogleAdsCustomerId(credentials: CredentialMap, accessToken: string, developerToken: string) {
  const configured = normalizeGoogleCustomerId(getCredential(credentials, ["GOOGLE_ADS_CUSTOMER_ID"]));
  if (configured) {
    return configured;
  }

  const result = await fetchJson(`https://googleads.googleapis.com/${googleAdsApiVersion}/customers:listAccessibleCustomers`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
    },
  });

  if (!result.ok) {
    return "";
  }

  const resourceNames = readArray(readRecord(result.data)?.resourceNames);
  const firstCustomer = resourceNames.map((item) => normalizeGoogleCustomerId(readString(item) ?? "")).find(Boolean);
  return firstCustomer ?? "";
}

function buildGoogleAdsHeaders(credentials: CredentialMap, accessToken: string, developerToken: string) {
  const loginCustomerId = normalizeGoogleCustomerId(getCredential(credentials, ["GOOGLE_ADS_LOGIN_CUSTOMER_ID"]));
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "developer-token": developerToken,
  };

  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  return headers;
}

function buildMetaGraphUrl(credentials: CredentialMap, path: string) {
  const version = getCredential(credentials, ["META_GRAPH_API_VERSION"]) || "v23.0";
  return new URL(`https://graph.facebook.com/${version}${path}`);
}

function appendMetaAuth(url: URL, credentials: CredentialMap) {
  const accessToken = getCredential(credentials, ["META_ACCESS_TOKEN"]);
  const appSecret = getCredential(credentials, ["META_APP_SECRET"]);

  url.searchParams.set("access_token", accessToken);

  if (appSecret) {
    url.searchParams.set("appsecret_proof", createHmac("sha256", appSecret).update(accessToken).digest("hex"));
  }
}

async function fetchJson(url: string, init: RequestInit = {}) {
  try {
    const headers = new Headers(init.headers);
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }

    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers,
    });
    const data = await response.json().catch(() => null);

    return {
      ok: response.ok,
      httpStatus: response.status,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 0,
      data: {
        error: {
          message: error instanceof Error ? error.message : "Falha de rede.",
        },
      },
    };
  }
}

function providerFromCampaigns(base: TrafficProviderSummary, campaigns: TrafficCampaign[]): TrafficProviderSummary {
  const spend = campaigns.reduce((total, campaign) => total + campaign.spend, 0);
  const clicks = campaigns.reduce((total, campaign) => total + campaign.clicks, 0);
  const impressions = campaigns.reduce((total, campaign) => total + campaign.impressions, 0);
  const conversions = campaigns.reduce((total, campaign) => total + campaign.conversions, 0);

  return {
    ...base,
    spend,
    clicks,
    impressions,
    conversions,
    ctr: ratioPercent(clicks, impressions),
    cpc: ratio(spend, clicks),
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
  };
}

function buildEmptyMetaPaidProvider(credentialScope: TrafficCredentialScope) {
  return buildEmptyProvider({
    id: "meta-paid",
    name: "Meta Ads",
    platform: "Meta",
    kind: "paid",
    detail: credentialScope.scope === "organization"
      ? "Conecte Meta em Integracoes e selecione a conta de anuncios que alimenta este dashboard."
      : "Configure o app ConnectyHub Meta e as credenciais de teste na Sala de Manutencao.",
  });
}

function buildEmptyGooglePaidProvider(credentialScope: TrafficCredentialScope) {
  return buildEmptyProvider({
    id: "google-paid",
    name: "Google Ads",
    platform: "Google",
    kind: "paid",
    detail: credentialScope.scope === "organization"
      ? "Conecte Google em Integracoes e selecione a conta Google Ads que alimenta este dashboard."
      : "Configure o app ConnectyHub Google, Developer Token e credenciais de teste na Sala de Manutencao.",
  });
}

function buildEmptyMetaOrganicProvider(credentialScope: TrafficCredentialScope) {
  return buildEmptyProvider({
    id: "meta-organic",
    name: "Instagram / Facebook organico",
    platform: "Meta",
    kind: "organic",
    detail: credentialScope.scope === "organization"
      ? "Opcional: selecione Instagram Business ou pagina Facebook em Integracoes para leitura organica."
      : "Configure Instagram Business ID ou Facebook Page ID para leitura organica.",
  });
}

function buildEmptyGoogleOrganicProvider(credentialScope: TrafficCredentialScope) {
  return buildEmptyProvider({
    id: "google-organic",
    name: "Google Search Console",
    platform: "Google",
    kind: "organic",
    detail: credentialScope.scope === "organization"
      ? "Opcional: vincule Search Console ou GA4 em Integracoes quando esse recurso estiver liberado."
      : "Configure a propriedade do Search Console e OAuth com escopo de leitura.",
  });
}

function buildEmptyProvider(input: {
  id: string;
  name: string;
  platform: "Meta" | "Google";
  kind: TrafficProviderKind;
  detail: string;
}): TrafficProviderSummary {
  return {
    ...input,
    status: "warning",
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    engagements: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
    averagePosition: null,
  };
}

function providerToSourceStatus(provider: TrafficProviderSummary): TrafficSourceStatus {
  return {
    id: provider.id,
    label: provider.name,
    status: provider.status,
    detail: provider.detail,
  };
}

function buildTrafficRange(): TrafficRange {
  const today = new Date();
  const until = toDateKey(today);
  const sinceDate = new Date(today);
  sinceDate.setDate(sinceDate.getDate() - 29);

  return {
    since: toDateKey(sinceDate),
    until,
    label: "ultimos 30 dias",
  };
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toUnixSeconds(dateKey: string) {
  return Math.floor(new Date(`${dateKey}T00:00:00.000Z`).getTime() / 1000);
}

function normalizeMetaAdAccountId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed.replace(/^act_/, "")}`;
}

function normalizeGoogleCustomerId(value: string) {
  return value.replace(/^customers\//, "").replace(/[^0-9]/g, "");
}

function getCredential(credentials: CredentialMap, names: string[]) {
  for (const name of names) {
    const value = credentials.get(name) ?? process.env[name];
    if (value?.trim()) {
      return value.trim();
    }
  }

  return "";
}

function nullableCredential(value: string) {
  return value.trim() ? value.trim() : null;
}

function classifyLeadPlatform(row: LeadAttributionRow): "meta" | "google" | null {
  const source = row.source ?? "";
  const metadataText = row.metadata ? JSON.stringify(row.metadata) : "";
  const text = `${source} ${metadataText}`.toLowerCase();

  if (/\b(gclid|gbraid|wbraid|google|adwords|google_ads)\b/.test(text)) {
    return "google";
  }

  if (/\b(meta|facebook|instagram|fbclid|igclid|meta_ads)\b/.test(text)) {
    return "meta";
  }

  return null;
}

function readMetaInsightValues(data: unknown) {
  const metrics: Record<string, number> = {};
  const rows = readArray(readRecord(data)?.data);

  for (const row of rows) {
    const metric = readRecord(row);
    const name = readString(metric?.name);
    const values = readArray(metric?.values);

    if (!name) continue;

    metrics[name] = values.reduce<number>((total, value) => {
      const record = readRecord(value);
      return total + readNumber(record?.value);
    }, 0);
  }

  return metrics;
}

function mergeMetaDailySeries(seriesByDate: Map<string, number>, data: unknown, metricNames: string[]) {
  const rows = readArray(readRecord(data)?.data);
  const allowed = new Set(metricNames);

  for (const row of rows) {
    const metric = readRecord(row);
    const name = readString(metric?.name);
    if (!name || !allowed.has(name)) continue;

    for (const value of readArray(metric?.values)) {
      const record = readRecord(value);
      const endTime = readString(record?.end_time);
      const date = endTime?.slice(0, 10);
      if (!date) continue;

      seriesByDate.set(date, (seriesByDate.get(date) ?? 0) + readNumber(record?.value));
    }
  }
}

function readMetaLeadActions(actions: unknown) {
  return readArray(actions).reduce<number>((total, action) => {
    const record = readRecord(action);
    const actionType = readString(record?.action_type) ?? "";
    const value = readNumber(record?.value);

    if (/(lead|complete_registration|contact|onsite_conversion)/i.test(actionType)) {
      return total + value;
    }

    return total;
  }, 0);
}

function mergeSeries(seriesList: TrafficSeriesPoint[][]) {
  const merged = new Map<string, number>();

  for (const series of seriesList) {
    for (const point of series) {
      merged.set(point.label, (merged.get(point.label) ?? 0) + point.value);
    }
  }

  return mapSeries(merged);
}

function mapSeries(seriesByDate: Map<string, number>): TrafficSeriesPoint[] {
  return [...seriesByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, value]) => ({ label: label.slice(5), value: Math.round(value * 100) / 100 }));
}

function sum(providers: TrafficProviderSummary[], key: keyof Pick<TrafficProviderSummary, "spend" | "clicks" | "impressions" | "conversions" | "engagements">) {
  return providers.reduce((total, provider) => total + provider[key], 0);
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function ratioPercent(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function readProviderError(data: unknown) {
  const record = readRecord(data);
  const error = readRecord(record?.error);
  const message = readString(error?.message) ?? readString(record?.error_description) ?? readString(record?.message);

  if (message) {
    return message;
  }

  const details = readArray(readRecord(error?.details)?.errors);
  const firstDetail = readRecord(details[0]);
  return readString(firstDetail?.message);
}

function readAny(record: JsonRecord | null | undefined, keys: string[]) {
  if (!record) return undefined;

  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
