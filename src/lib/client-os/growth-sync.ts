import "server-only";

import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "../security/credentials-crypto";
import {
  getGrowthIntegrationAssets,
  normalizeGoogleCustomerId,
  normalizeMetaAdAccountId,
  syncGrowthIntegrationAssets,
  type GrowthAssetInput,
  type GrowthIntegrationAsset,
  type GrowthProviderId,
} from "./growth-integrations";

type JsonRecord = Record<string, unknown>;
type CredentialMap = Map<string, string>;

type GrowthSyncRange = {
  since: string;
  until: string;
};

type OrganizationIntegrationRow = {
  id: string;
  organization_id: string;
  provider_id: GrowthProviderId;
  status: string | null;
  metadata: JsonRecord | null;
  scopes: string[] | null;
};

type CredentialRow = {
  scope: string | null;
  organization_id: string | null;
  integration_id: string | null;
  env_name: string | null;
  encrypted_value: string | null;
};

type MetricSnapshotInput = {
  providerId: GrowthProviderId;
  organizationIntegrationId: string;
  assetId?: string | null;
  resourceType: "ad_account" | "campaign" | "post" | "page" | "instagram_account" | "customer" | "site";
  externalId: string;
  label: string;
  dateStart: string;
  dateStop: string;
  metrics: JsonRecord;
  dimensions: JsonRecord;
  rawPayload: JsonRecord;
};

export type GrowthProviderSyncResult = {
  providerId: GrowthProviderId;
  status: "success" | "warning" | "failed";
  jobId: string;
  snapshotsWritten: number;
  assetsWritten: number;
  warnings: string[];
  startedAt: string;
  finishedAt: string;
};

type GoogleAdsSearchRow = {
  campaign?: JsonRecord;
  metrics?: JsonRecord;
  segments?: JsonRecord;
};

const growthCredentialEnvNames = [
  "META_ACCESS_TOKEN",
  "META_APP_SECRET",
  "META_AD_ACCOUNT_ID",
  "META_GRAPH_API_VERSION",
  "FACEBOOK_PAGE_ID",
  "FACEBOOK_PAGE_ACCESS_TOKEN",
  "INSTAGRAM_BUSINESS_ACCOUNT_ID",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
  "GOOGLE_ADS_CUSTOMER_ID",
  "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
  "GOOGLE_ADS_API_VERSION",
  "GOOGLE_SEARCH_CONSOLE_SITE_URL",
];

export async function executeGrowthIntegrationSync(input: {
  actorId?: string | null;
  client: SupabaseClient;
  jobId?: string | null;
  organizationId: string;
  providerId: GrowthProviderId;
}) {
  const startedAt = new Date().toISOString();
  const jobId = input.jobId ?? await createSyncJob({
    actorId: input.actorId,
    client: input.client,
    organizationId: input.organizationId,
    providerId: input.providerId,
  });

  await markSyncJobRunning({
    client: input.client,
    jobId,
    startedAt,
  });

  try {
    const integration = await loadConnectedIntegration({
      client: input.client,
      organizationId: input.organizationId,
      providerId: input.providerId,
    });
    const credentials = await loadGrowthCredentials({
      client: input.client,
      organizationId: input.organizationId,
    });
    const assetsResult = await getGrowthIntegrationAssets({
      client: input.client,
      organizationIds: [input.organizationId],
      providerId: input.providerId,
    });

    if (!assetsResult.ready) {
      throw new Error("Migration 0045 pendente: tabela integration_assets indisponivel.");
    }

    const range = buildGrowthSyncRange(7);
    const result = input.providerId === "meta-ads"
      ? await syncMetaGrowthData({
          assets: assetsResult.rows,
          client: input.client,
          credentials,
          integration,
          organizationId: input.organizationId,
          range,
        })
      : await syncGoogleGrowthData({
          assets: assetsResult.rows,
          client: input.client,
          credentials,
          integration,
          organizationId: input.organizationId,
          range,
        });
    const finishedAt = new Date().toISOString();
    const status = result.warnings.length > 0 ? "warning" : "success";

    await markSyncJobFinished({
      client: input.client,
      finishedAt,
      jobId,
      metadata: {
        assets_written: result.assetsWritten,
        range,
        snapshots_written: result.snapshotsWritten,
        warnings: result.warnings,
      },
      status: "success",
    });
    await input.client
      .from("organization_integrations")
      .update({
        last_error: result.warnings[0] ?? null,
        last_sync_at: finishedAt,
        updated_at: finishedAt,
      })
      .eq("id", integration.id);

    return {
      providerId: input.providerId,
      status,
      jobId,
      snapshotsWritten: result.snapshotsWritten,
      assetsWritten: result.assetsWritten,
      warnings: result.warnings,
      startedAt,
      finishedAt,
    } satisfies GrowthProviderSyncResult;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Falha ao sincronizar dados de crescimento.";

    await markSyncJobFinished({
      client: input.client,
      finishedAt,
      jobId,
      metadata: { error: message },
      status: "failed",
    }).catch(() => null);
    try {
      await input.client
        .from("organization_integrations")
        .update({
          last_error: message,
          updated_at: finishedAt,
        })
        .eq("organization_id", input.organizationId)
        .eq("provider_id", input.providerId);
    } catch {
      // Keep the original sync failure as the returned error.
    }

    return {
      providerId: input.providerId,
      status: "failed",
      jobId,
      snapshotsWritten: 0,
      assetsWritten: 0,
      warnings: [message],
      startedAt,
      finishedAt,
    } satisfies GrowthProviderSyncResult;
  }
}

export function buildMetaCampaignSnapshot(input: {
  adAccountId: string;
  assetId?: string | null;
  organizationIntegrationId: string;
  row: JsonRecord;
}): MetricSnapshotInput | null {
  const campaignId = readString(input.row.campaign_id);

  if (!campaignId) {
    return null;
  }

  const clicks = readNumber(input.row.clicks);
  const impressions = readNumber(input.row.impressions);
  const spend = readNumber(input.row.spend);
  const conversions = readMetaLeadActions(input.row.actions);

  return {
    providerId: "meta-ads",
    organizationIntegrationId: input.organizationIntegrationId,
    assetId: input.assetId ?? null,
    resourceType: "campaign",
    externalId: campaignId,
    label: readString(input.row.campaign_name) ?? `Campanha Meta ${campaignId}`,
    dateStart: readString(input.row.date_start) ?? todayDate(),
    dateStop: readString(input.row.date_stop) ?? readString(input.row.date_start) ?? todayDate(),
    metrics: {
      clicks,
      conversions,
      cpc: ratio(spend, clicks),
      cpm: impressions > 0 ? spend / impressions * 1000 : 0,
      ctr: ratioPercent(clicks, impressions),
      impressions,
      spend,
    },
    dimensions: {
      ad_account_id: input.adAccountId,
      platform: "meta",
    },
    rawPayload: input.row,
  };
}

export function buildGoogleCampaignSnapshot(input: {
  assetId?: string | null;
  customerId: string;
  organizationIntegrationId: string;
  row: GoogleAdsSearchRow;
}): MetricSnapshotInput | null {
  const campaign = readRecord(input.row.campaign);
  const metrics = readRecord(input.row.metrics);
  const segments = readRecord(input.row.segments);
  const campaignId = readString(campaign?.id);

  if (!campaign || !metrics || !campaignId) {
    return null;
  }

  const clicks = readNumber(metrics.clicks);
  const impressions = readNumber(metrics.impressions);
  const costMicros = readNumber(readAny(metrics, ["costMicros", "cost_micros"]));
  const spend = costMicros / 1_000_000;
  const conversions = readNumber(metrics.conversions);
  const date = readString(segments?.date) ?? todayDate();

  return {
    providerId: "google-growth",
    organizationIntegrationId: input.organizationIntegrationId,
    assetId: input.assetId ?? null,
    resourceType: "campaign",
    externalId: campaignId,
    label: readString(campaign.name) ?? `Campanha Google ${campaignId}`,
    dateStart: date,
    dateStop: date,
    metrics: {
      clicks,
      conversions,
      cpc: ratio(spend, clicks),
      ctr: ratioPercent(clicks, impressions),
      impressions,
      spend,
    },
    dimensions: {
      customer_id: input.customerId,
      platform: "google",
      status: readString(campaign.status) ?? "UNKNOWN",
    },
    rawPayload: input.row as JsonRecord,
  };
}

async function syncMetaGrowthData(input: {
  assets: GrowthIntegrationAsset[];
  client: SupabaseClient;
  credentials: CredentialMap;
  integration: OrganizationIntegrationRow;
  organizationId: string;
  range: GrowthSyncRange;
}) {
  const warnings: string[] = [];
  const snapshots: MetricSnapshotInput[] = [];
  const campaignAssets: GrowthAssetInput[] = [];
  const accessToken = getCredential(input.credentials, ["META_ACCESS_TOKEN"]);
  const adAccountId = selectedExternalId(input.assets, "meta_ad_account") || normalizeMetaAdAccountId(getCredential(input.credentials, ["META_AD_ACCOUNT_ID"]));
  const adAccountAsset = findAsset(input.assets, "meta_ad_account", adAccountId);
  const pageId = selectedExternalId(input.assets, "facebook_page") || getCredential(input.credentials, ["FACEBOOK_PAGE_ID"]);
  const pageAccessToken = getCredential(input.credentials, ["FACEBOOK_PAGE_ACCESS_TOKEN"]) || accessToken;
  const instagramId = selectedExternalId(input.assets, "instagram_business_account") || getCredential(input.credentials, ["INSTAGRAM_BUSINESS_ACCOUNT_ID"]);

  if (!accessToken) {
    warnings.push("Meta sem access token salvo.");
  }

  if (accessToken && adAccountId) {
    const paidResult = await fetchMetaCampaignInsights({
      adAccountAssetId: adAccountAsset?.id ?? null,
      adAccountId,
      credentials: input.credentials,
      integrationId: input.integration.id,
      range: input.range,
    });

    warnings.push(...paidResult.warnings);
    snapshots.push(...paidResult.snapshots);
    campaignAssets.push(...paidResult.campaignAssets);
  } else {
    warnings.push("Meta sem conta de anuncios selecionada.");
  }

  if (accessToken && pageId) {
    const pageResult = await fetchMetaPagePosts({
      credentials: input.credentials,
      integrationId: input.integration.id,
      pageAccessToken,
      pageId,
      range: input.range,
    });

    warnings.push(...pageResult.warnings);
    snapshots.push(...pageResult.snapshots);
    campaignAssets.push(...pageResult.postAssets);
  }

  if (accessToken && instagramId) {
    const instagramResult = await fetchInstagramMediaInsights({
      credentials: input.credentials,
      integrationId: input.integration.id,
      instagramId,
      pageAccessToken,
      range: input.range,
    });

    warnings.push(...instagramResult.warnings);
    snapshots.push(...instagramResult.snapshots);
    campaignAssets.push(...instagramResult.postAssets);
  }

  const snapshotsWritten = await replaceMetricSnapshots({
    client: input.client,
    organizationId: input.organizationId,
    snapshots,
  });
  const assetsWritten = campaignAssets.length > 0
    ? (await syncGrowthIntegrationAssets({
        assets: campaignAssets,
        client: input.client,
        organizationId: input.organizationId,
        organizationIntegrationId: input.integration.id,
        providerId: "meta-ads",
      })).inserted
    : 0;

  return { snapshotsWritten, assetsWritten, warnings };
}

async function syncGoogleGrowthData(input: {
  assets: GrowthIntegrationAsset[];
  client: SupabaseClient;
  credentials: CredentialMap;
  integration: OrganizationIntegrationRow;
  organizationId: string;
  range: GrowthSyncRange;
}) {
  const warnings: string[] = [];
  const snapshots: MetricSnapshotInput[] = [];
  const campaignAssets: GrowthAssetInput[] = [];
  const accessToken = await exchangeGoogleRefreshToken(input.credentials);
  const developerToken = getCredential(input.credentials, ["GOOGLE_ADS_DEVELOPER_TOKEN"]);
  const customerId = selectedExternalId(input.assets, "google_ads_customer") || normalizeGoogleCustomerId(getCredential(input.credentials, ["GOOGLE_ADS_CUSTOMER_ID"]));
  const customerAsset = findAsset(input.assets, "google_ads_customer", customerId);

  if (!accessToken) {
    warnings.push("Google OAuth sem access token. Verifique refresh token, client id e client secret.");
  }

  if (!developerToken) {
    warnings.push("Google Ads Developer Token nao configurado na manutencao.");
  }

  if (!customerId) {
    warnings.push("Google sem conta Ads selecionada.");
  }

  if (accessToken && developerToken && customerId) {
    const paidResult = await fetchGoogleCampaignInsights({
      accessToken,
      assetId: customerAsset?.id ?? null,
      credentials: input.credentials,
      customerId,
      developerToken,
      integrationId: input.integration.id,
      range: input.range,
    });

    warnings.push(...paidResult.warnings);
    snapshots.push(...paidResult.snapshots);
    campaignAssets.push(...paidResult.campaignAssets);
  }

  const siteUrl = getCredential(input.credentials, ["GOOGLE_SEARCH_CONSOLE_SITE_URL"]);
  if (accessToken && siteUrl) {
    const organicResult = await fetchGoogleSearchConsoleSnapshots({
      accessToken,
      integrationId: input.integration.id,
      range: input.range,
      siteUrl,
    });

    warnings.push(...organicResult.warnings);
    snapshots.push(...organicResult.snapshots);
  }

  const snapshotsWritten = await replaceMetricSnapshots({
    client: input.client,
    organizationId: input.organizationId,
    snapshots,
  });
  const assetsWritten = campaignAssets.length > 0
    ? (await syncGrowthIntegrationAssets({
        assets: campaignAssets,
        client: input.client,
        organizationId: input.organizationId,
        organizationIntegrationId: input.integration.id,
        providerId: "google-growth",
      })).inserted
    : 0;

  return { snapshotsWritten, assetsWritten, warnings };
}

async function fetchMetaCampaignInsights(input: {
  adAccountAssetId: string | null;
  adAccountId: string;
  credentials: CredentialMap;
  integrationId: string;
  range: GrowthSyncRange;
}) {
  const url = buildMetaGraphUrl(input.credentials, `/${input.adAccountId}/insights`);
  url.searchParams.set("level", "campaign");
  url.searchParams.set("fields", "campaign_id,campaign_name,impressions,clicks,spend,cpc,cpm,ctr,actions,date_start,date_stop");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("time_range", JSON.stringify({ since: input.range.since, until: input.range.until }));
  url.searchParams.set("limit", "500");
  appendMetaAuth(url, input.credentials);

  const result = await fetchJson(url.toString());

  if (!result.ok) {
    return {
      campaignAssets: [],
      snapshots: [],
      warnings: [readProviderError(result.data) ?? "Meta Ads nao retornou insights de campanhas."],
    };
  }

  const rows = readArray(readRecord(result.data)?.data).map((row) => readRecord(row)).filter((row): row is JsonRecord => Boolean(row));
  const snapshots = rows
    .map((row) => buildMetaCampaignSnapshot({
      adAccountId: input.adAccountId,
      assetId: input.adAccountAssetId,
      organizationIntegrationId: input.integrationId,
      row,
    }))
    .filter((snapshot): snapshot is MetricSnapshotInput => Boolean(snapshot));
  const campaignAssets = dedupeBy(
    snapshots.map((snapshot): GrowthAssetInput => ({
      assetType: "meta_campaign",
      externalId: snapshot.externalId,
      label: snapshot.label,
      metricsSummary: snapshot.metrics,
      parentExternalId: input.adAccountId,
      rawPayload: {
        source: "meta_insights",
        synced_at: new Date().toISOString(),
      },
    })),
    (asset) => asset.externalId,
  );

  return { campaignAssets, snapshots, warnings: [] as string[] };
}

async function fetchMetaPagePosts(input: {
  credentials: CredentialMap;
  integrationId: string;
  pageAccessToken: string;
  pageId: string;
  range: GrowthSyncRange;
}) {
  const url = buildMetaGraphUrl(input.credentials, `/${input.pageId}/posts`);
  url.searchParams.set("fields", "id,message,created_time,permalink_url,insights.metric(post_impressions,post_engaged_users)");
  url.searchParams.set("limit", "50");
  appendMetaAuth(url, input.credentials, input.pageAccessToken);

  const result = await fetchJson(url.toString());

  if (!result.ok) {
    return {
      postAssets: [],
      snapshots: [],
      warnings: [readProviderError(result.data) ?? "Facebook Page nao retornou posts/insights."],
    };
  }

  const rows = readArray(readRecord(result.data)?.data).map((row) => readRecord(row)).filter((row): row is JsonRecord => Boolean(row));
  const snapshots: MetricSnapshotInput[] = [];
  const postAssets: GrowthAssetInput[] = [];

  for (const row of rows) {
    const postId = readString(row.id);
    if (!postId) continue;

    const metrics = readMetaInsightValues(row.insights);
    const date = normalizeDate(readString(row.created_time)) ?? input.range.until;
    const label = truncate(readString(row.message) ?? `Post Facebook ${postId}`, 90);

    snapshots.push({
      providerId: "meta-ads",
      organizationIntegrationId: input.integrationId,
      resourceType: "post",
      externalId: postId,
      label,
      dateStart: date,
      dateStop: date,
      metrics: {
        engagements: metrics.post_engaged_users ?? 0,
        impressions: metrics.post_impressions ?? 0,
      },
      dimensions: {
        page_id: input.pageId,
        platform: "facebook",
        permalink_url: readString(row.permalink_url),
      },
      rawPayload: row,
    });
    postAssets.push({
      assetType: "meta_post",
      externalId: postId,
      label,
      metricsSummary: snapshots[snapshots.length - 1].metrics,
      parentExternalId: input.pageId,
      rawPayload: {
        platform: "facebook",
        source: "page_posts",
        synced_at: new Date().toISOString(),
      },
    });
  }

  return { postAssets, snapshots, warnings: [] as string[] };
}

async function fetchInstagramMediaInsights(input: {
  credentials: CredentialMap;
  integrationId: string;
  instagramId: string;
  pageAccessToken: string;
  range: GrowthSyncRange;
}) {
  const url = buildMetaGraphUrl(input.credentials, `/${input.instagramId}/media`);
  url.searchParams.set("fields", "id,caption,timestamp,permalink,like_count,comments_count,insights.metric(impressions,reach,engagement,saved)");
  url.searchParams.set("limit", "50");
  appendMetaAuth(url, input.credentials, input.pageAccessToken);

  const result = await fetchJson(url.toString());

  if (!result.ok) {
    return {
      postAssets: [],
      snapshots: [],
      warnings: [readProviderError(result.data) ?? "Instagram nao retornou midias/insights."],
    };
  }

  const rows = readArray(readRecord(result.data)?.data).map((row) => readRecord(row)).filter((row): row is JsonRecord => Boolean(row));
  const snapshots: MetricSnapshotInput[] = [];
  const postAssets: GrowthAssetInput[] = [];

  for (const row of rows) {
    const mediaId = readString(row.id);
    if (!mediaId) continue;

    const metrics = readMetaInsightValues(row.insights);
    const date = normalizeDate(readString(row.timestamp)) ?? input.range.until;
    const label = truncate(readString(row.caption) ?? `Post Instagram ${mediaId}`, 90);
    const likes = readNumber(row.like_count);
    const comments = readNumber(row.comments_count);

    snapshots.push({
      providerId: "meta-ads",
      organizationIntegrationId: input.integrationId,
      resourceType: "post",
      externalId: mediaId,
      label,
      dateStart: date,
      dateStop: date,
      metrics: {
        comments,
        engagements: (metrics.engagement ?? 0) + likes + comments,
        impressions: metrics.impressions ?? 0,
        likes,
        reach: metrics.reach ?? 0,
        saved: metrics.saved ?? 0,
      },
      dimensions: {
        instagram_business_id: input.instagramId,
        permalink_url: readString(row.permalink),
        platform: "instagram",
      },
      rawPayload: row,
    });
    postAssets.push({
      assetType: "meta_post",
      externalId: mediaId,
      label,
      metricsSummary: snapshots[snapshots.length - 1].metrics,
      parentExternalId: input.instagramId,
      rawPayload: {
        platform: "instagram",
        source: "instagram_media",
        synced_at: new Date().toISOString(),
      },
    });
  }

  return { postAssets, snapshots, warnings: [] as string[] };
}

async function fetchGoogleCampaignInsights(input: {
  accessToken: string;
  assetId: string | null;
  credentials: CredentialMap;
  customerId: string;
  developerToken: string;
  integrationId: string;
  range: GrowthSyncRange;
}) {
  const apiVersion = getCredential(input.credentials, ["GOOGLE_ADS_API_VERSION"]) || "v24";
  const query = [
    "SELECT",
    "campaign.id, campaign.name, campaign.status, segments.date,",
    "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr, metrics.average_cpc",
    "FROM campaign",
    `WHERE segments.date BETWEEN '${input.range.since}' AND '${input.range.until}'`,
    "ORDER BY segments.date DESC",
    "LIMIT 500",
  ].join(" ");
  const result = await fetchJson(`https://googleads.googleapis.com/${apiVersion}/customers/${input.customerId}/googleAds:search`, {
    method: "POST",
    headers: buildGoogleAdsHeaders(input.credentials, input.accessToken, input.developerToken),
    body: JSON.stringify({ pageSize: 500, query }),
  });

  if (!result.ok) {
    return {
      campaignAssets: [],
      snapshots: [],
      warnings: [readProviderError(result.data) ?? "Google Ads nao retornou campanhas."],
    };
  }

  const rows = readArray(readRecord(result.data)?.results)
    .map((row) => readRecord(row))
    .filter((row): row is GoogleAdsSearchRow => Boolean(row));
  const snapshots = rows
    .map((row) => buildGoogleCampaignSnapshot({
      assetId: input.assetId,
      customerId: input.customerId,
      organizationIntegrationId: input.integrationId,
      row,
    }))
    .filter((snapshot): snapshot is MetricSnapshotInput => Boolean(snapshot));
  const campaignAssets = dedupeBy(
    snapshots.map((snapshot): GrowthAssetInput => ({
      assetType: "google_campaign",
      externalId: snapshot.externalId,
      label: snapshot.label,
      metricsSummary: snapshot.metrics,
      parentExternalId: input.customerId,
      rawPayload: {
        source: "google_ads_search",
        synced_at: new Date().toISOString(),
      },
    })),
    (asset) => asset.externalId,
  );

  return { campaignAssets, snapshots, warnings: [] as string[] };
}

async function fetchGoogleSearchConsoleSnapshots(input: {
  accessToken: string;
  integrationId: string;
  range: GrowthSyncRange;
  siteUrl: string;
}) {
  const result = await fetchJson(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(input.siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dimensions: ["date"],
        endDate: input.range.until,
        rowLimit: 500,
        startDate: input.range.since,
        type: "web",
      }),
    },
  );

  if (!result.ok) {
    return {
      snapshots: [],
      warnings: [readProviderError(result.data) ?? "Search Console nao retornou dados."],
    };
  }

  const rows = readArray(readRecord(result.data)?.rows).map((row) => readRecord(row)).filter((row): row is JsonRecord => Boolean(row));
  const snapshots = rows.map((row): MetricSnapshotInput => {
    const keys = readArray(row.keys);
    const date = readString(keys[0]) ?? input.range.until;

    return {
      providerId: "google-growth",
      organizationIntegrationId: input.integrationId,
      resourceType: "site",
      externalId: input.siteUrl,
      label: input.siteUrl,
      dateStart: date,
      dateStop: date,
      metrics: {
        clicks: readNumber(row.clicks),
        ctr: readNumber(row.ctr) * 100,
        impressions: readNumber(row.impressions),
        position: readNumber(row.position),
      },
      dimensions: {
        platform: "google_search_console",
        site_url: input.siteUrl,
      },
      rawPayload: row,
    };
  });

  return { snapshots, warnings: [] as string[] };
}

async function replaceMetricSnapshots(input: {
  client: SupabaseClient;
  organizationId: string;
  snapshots: MetricSnapshotInput[];
}) {
  if (input.snapshots.length === 0) {
    return 0;
  }

  for (const snapshot of input.snapshots) {
    const deleteQuery = input.client
      .from("integration_metric_snapshots")
      .delete()
      .eq("organization_id", input.organizationId)
      .eq("provider_id", snapshot.providerId)
      .eq("resource_type", snapshot.resourceType)
      .eq("external_id", snapshot.externalId)
      .eq("date_start", snapshot.dateStart)
      .eq("date_stop", snapshot.dateStop);
    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
      throw new Error(deleteError.message);
    }
  }

  const { error } = await input.client.from("integration_metric_snapshots").insert(input.snapshots.map((snapshot) => ({
    organization_id: input.organizationId,
    organization_integration_id: snapshot.organizationIntegrationId,
    provider_id: snapshot.providerId,
    asset_id: snapshot.assetId ?? null,
    resource_type: snapshot.resourceType,
    external_id: snapshot.externalId,
    label: snapshot.label,
    date_start: snapshot.dateStart,
    date_stop: snapshot.dateStop,
    metrics: snapshot.metrics,
    dimensions: snapshot.dimensions,
    raw_payload: snapshot.rawPayload,
  })));

  if (error) {
    throw new Error(error.message);
  }

  return input.snapshots.length;
}

async function loadConnectedIntegration(input: {
  client: SupabaseClient;
  organizationId: string;
  providerId: GrowthProviderId;
}) {
  const { data, error } = await input.client
    .from("organization_integrations")
    .select("id, organization_id, provider_id, status, metadata, scopes")
    .eq("organization_id", input.organizationId)
    .eq("provider_id", input.providerId)
    .maybeSingle<OrganizationIntegrationRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.status !== "connected") {
    throw new Error("Conecte esta integracao antes de sincronizar dados.");
  }

  return data;
}

async function loadGrowthCredentials(input: {
  client: SupabaseClient;
  organizationId: string;
}) {
  const values: CredentialMap = new Map();
  const organizationValues: CredentialMap = new Map();
  const { data, error } = await input.client
    .from("integration_credentials")
    .select("scope, organization_id, integration_id, env_name, encrypted_value")
    .in("env_name", growthCredentialEnvNames)
    .or(`and(scope.eq.platform,organization_id.is.null),and(scope.eq.organization,organization_id.eq.${input.organizationId})`);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of (data ?? []) as CredentialRow[]) {
    if (!row.env_name || !row.encrypted_value) {
      continue;
    }

    const decrypted = decryptCredentialValue(row.encrypted_value);

    if (row.scope === "organization" && row.organization_id === input.organizationId) {
      organizationValues.set(row.env_name, decrypted);
    } else if (!values.has(row.env_name)) {
      values.set(row.env_name, decrypted);
    }
  }

  for (const envName of growthCredentialEnvNames) {
    const fallback = process.env[envName]?.trim();
    if (fallback && !values.has(envName)) {
      values.set(envName, fallback);
    }
  }

  for (const [envName, value] of organizationValues) {
    values.set(envName, value);
  }

  return values;
}

async function exchangeGoogleRefreshToken(credentials: CredentialMap) {
  const clientId = getCredential(credentials, ["GOOGLE_ADS_CLIENT_ID"]);
  const clientSecret = getCredential(credentials, ["GOOGLE_ADS_CLIENT_SECRET"]);
  const refreshToken = getCredential(credentials, ["GOOGLE_ADS_REFRESH_TOKEN"]);

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const result = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!result.ok) {
    return null;
  }

  return readString(readRecord(result.data)?.access_token);
}

async function createSyncJob(input: {
  actorId?: string | null;
  client: SupabaseClient;
  organizationId: string;
  providerId: GrowthProviderId;
}) {
  const { data, error } = await input.client
    .from("integration_sync_jobs")
    .insert({
      organization_id: input.organizationId,
      provider_id: input.providerId,
      job_type: "full_sync",
      status: "queued",
      created_by: input.actorId ?? null,
      metadata: { source: "growth_sync_executor" },
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel criar job de sincronizacao.");
  }

  return data.id;
}

async function markSyncJobRunning(input: {
  client: SupabaseClient;
  jobId: string;
  startedAt: string;
}) {
  const { error } = await input.client
    .from("integration_sync_jobs")
    .update({
      started_at: input.startedAt,
      status: "running",
      updated_at: input.startedAt,
    })
    .eq("id", input.jobId);

  if (error) {
    throw new Error(error.message);
  }
}

async function markSyncJobFinished(input: {
  client: SupabaseClient;
  finishedAt: string;
  jobId: string;
  metadata: JsonRecord;
  status: "success" | "failed";
}) {
  const { error } = await input.client
    .from("integration_sync_jobs")
    .update({
      finished_at: input.finishedAt,
      last_error: input.status === "failed" ? readString(input.metadata.error) : null,
      metadata: input.metadata,
      status: input.status,
      updated_at: input.finishedAt,
    })
    .eq("id", input.jobId);

  if (error) {
    throw new Error(error.message);
  }
}

function buildGrowthSyncRange(days: number): GrowthSyncRange {
  const until = new Date();
  const since = new Date(until);
  since.setUTCDate(until.getUTCDate() - Math.max(days - 1, 0));

  return {
    since: toDateString(since),
    until: toDateString(until),
  };
}

function buildMetaGraphUrl(credentials: CredentialMap, path: string) {
  const version = getCredential(credentials, ["META_GRAPH_API_VERSION"]) || "v25.0";
  return new URL(`https://graph.facebook.com/${version}${path}`);
}

function appendMetaAuth(url: URL, credentials: CredentialMap, accessTokenOverride?: string) {
  const accessToken = accessTokenOverride || getCredential(credentials, ["META_ACCESS_TOKEN"]);
  const appSecret = getCredential(credentials, ["META_APP_SECRET"]);

  url.searchParams.set("access_token", accessToken);

  if (appSecret) {
    url.searchParams.set("appsecret_proof", createHmac("sha256", appSecret).update(accessToken).digest("hex"));
  }
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
      data,
      httpStatus: response.status,
      ok: response.ok,
    };
  } catch (error) {
    return {
      data: {
        error: {
          message: error instanceof Error ? error.message : "Falha de rede.",
        },
      },
      httpStatus: 0,
      ok: false,
    };
  }
}

function readMetaLeadActions(value: unknown) {
  return readArray(value).reduce<number>((total, action) => {
    const record = readRecord(action);
    const type = readString(record?.action_type);

    if (!type) return total;

    return type.includes("lead") || type.includes("complete_registration") || type.includes("purchase")
      ? total + readNumber(record?.value)
      : total;
  }, 0);
}

function readMetaInsightValues(value: unknown) {
  const data = readRecord(value)?.data ?? value;
  const values: Record<string, number> = {};

  for (const metric of readArray(data)) {
    const record = readRecord(metric);
    const name = readString(record?.name);
    if (!name) continue;

    values[name] = readArray(record?.values).reduce<number>((total, item) => {
      const itemRecord = readRecord(item);
      return total + readNumber(itemRecord?.value);
    }, 0);
  }

  return values;
}

function readProviderError(value: unknown) {
  const record = readRecord(value);
  const error = readRecord(record?.error);

  return readString(error?.message) ?? readString(record?.message) ?? null;
}

function selectedExternalId(assets: GrowthIntegrationAsset[], assetType: GrowthIntegrationAsset["assetType"]) {
  return assets.find((asset) => asset.assetType === assetType && asset.isSelected)?.externalId ?? "";
}

function findAsset(assets: GrowthIntegrationAsset[], assetType: GrowthIntegrationAsset["assetType"], externalId: string) {
  return assets.find((asset) => asset.assetType === assetType && asset.externalId === externalId) ?? null;
}

function getCredential(credentials: CredentialMap, names: string[]) {
  for (const name of names) {
    const value = credentials.get(name)?.trim();
    if (value) return value;
  }

  return "";
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
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
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
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

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function ratioPercent(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator * 100 : 0;
}

function dedupeBy<T>(items: T[], key: (item: T) => string) {
  const map = new Map<string, T>();

  for (const item of items) {
    map.set(key(item), item);
  }

  return [...map.values()];
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function normalizeDate(value: string | null) {
  if (!value) return null;

  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;

  return toDateString(new Date(time));
}

function todayDate() {
  return toDateString(new Date());
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}
