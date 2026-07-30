import { describe, expect, it } from "vitest";
import type { AdminTrafficOverview, TrafficProviderSummary } from "./admin-traffic";
import { buildTrafficManagerPlan } from "./traffic-ai-manager";

describe("buildTrafficManagerPlan", () => {
  it("prioritizes sync and tracking when the paid source is not online", () => {
    const overview = buildOverview({
      metaPaid: {
        ...provider("Meta", "paid"),
        status: "offline",
        detail: "Meta token expirado.",
      },
    });

    const plan = buildTrafficManagerPlan(overview, "meta");

    expect(plan.status).toBe("critical");
    expect(plan.recommendations[0]?.id).toBe("sync-source");
    expect(plan.recommendations.some((item) => item.id === "tracking")).toBe(true);
  });

  it("flags paid spend with no reported conversions", () => {
    const overview = buildOverview({
      metaPaid: {
        ...provider("Meta", "paid"),
        status: "online",
        spend: 247,
        impressions: 10000,
        clicks: 80,
        conversions: 0,
        ctr: 0.8,
        cpc: 3.0875,
      },
      tracking: {
        metaAdAccountId: "act_123",
        metaPixelId: "123",
      },
    });

    const plan = buildTrafficManagerPlan(overview, "meta");

    expect(plan.status).toBe("attention");
    expect(plan.recommendations.map((item) => item.id)).toContain("no-conversions");
    expect(plan.nextAction).toContain("Pausar");
  });

  it("finds a campaign candidate for scale", () => {
    const overview = buildOverview({
      googlePaid: {
        ...provider("Google", "paid"),
        status: "online",
        spend: 300,
        impressions: 20000,
        clicks: 500,
        conversions: 12,
        ctr: 2.5,
        cpc: 0.6,
      },
      campaigns: [
        {
          id: "g1",
          name: "Pesquisa marca",
          platform: "Google",
          status: "ENABLED",
          spend: 120,
          impressions: 8000,
          clicks: 220,
          conversions: 10,
          ctr: 2.75,
          cpc: 0.55,
        },
      ],
      tracking: {
        googleAdsCustomerId: "1234567890",
        googleAdsConversionId: "AW-123",
      },
    });

    const plan = buildTrafficManagerPlan(overview, "google");

    expect(plan.recommendations.map((item) => item.id)).toContain("scale-winner");
    expect(plan.budgetFocus[0]?.label).toContain("Escalar");
  });
});

type BuildOverviewInput = Omit<Partial<AdminTrafficOverview>, "tracking"> & {
  metaPaid?: TrafficProviderSummary;
  googlePaid?: TrafficProviderSummary;
  tracking?: Partial<AdminTrafficOverview["tracking"]>;
};

function buildOverview(input: BuildOverviewInput = {}): AdminTrafficOverview {
  const metaPaid = input.metaPaid ?? provider("Meta", "paid");
  const googlePaid = input.googlePaid ?? provider("Google", "paid");
  const metaOrganic = provider("Meta", "organic");
  const googleOrganic = provider("Google", "organic");

  return {
    generatedAt: "2026-07-30T12:00:00.000Z",
    range: {
      label: "ultimos 30 dias",
      since: "2026-07-01",
      until: "2026-07-30",
    },
    summary: {
      organicClicks: 0,
      organicEngagements: 0,
      organicImpressions: 0,
      paidClicks: metaPaid.clicks + googlePaid.clicks,
      paidConversions: metaPaid.conversions + googlePaid.conversions,
      paidImpressions: metaPaid.impressions + googlePaid.impressions,
      paidSpend: metaPaid.spend + googlePaid.spend,
    },
    paidProviders: [metaPaid, googlePaid],
    organicProviders: [metaOrganic, googleOrganic],
    campaigns: input.campaigns ?? [],
    platformSeries: {
      googleOrganicClicks: [],
      googlePaidClicks: [],
      metaOrganicClicks: [],
      metaPaidClicks: [],
    },
    tracking: {
      facebookPageId: null,
      googleAdsConversionId: null,
      googleAdsCustomerId: null,
      googleAnalyticsMeasurementId: null,
      googleSearchConsoleSiteUrl: null,
      instagramBusinessId: null,
      metaAdAccountId: null,
      metaPixelId: null,
      ...input.tracking,
    },
    leadAttribution: {
      google: 0,
      latestReceivedAt: {
        any: null,
        google: null,
        meta: null,
      },
      meta: 0,
      total: 0,
    },
    organicClickSeries: [],
    paidClickSeries: [],
    sourceStatus: [],
    warnings: [],
  };
}

function provider(platform: "Meta" | "Google", kind: "paid" | "organic"): TrafficProviderSummary {
  return {
    id: `${platform}-${kind}`,
    name: `${platform} ${kind}`,
    platform,
    kind,
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
    detail: "Fonte aguardando configuracao.",
  };
}
