import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildGoogleCampaignSnapshot, buildMetaCampaignSnapshot } from "./growth-sync";

describe("growth sync snapshot mapping", () => {
  it("maps Meta campaign insight rows into metric snapshots", () => {
    const snapshot = buildMetaCampaignSnapshot({
      adAccountId: "act_123",
      assetId: "asset-1",
      organizationIntegrationId: "integration-1",
      row: {
        actions: [
          { action_type: "lead", value: "3" },
          { action_type: "link_click", value: "20" },
        ],
        campaign_id: "cmp_1",
        campaign_name: "Campanha Lead",
        clicks: "40",
        date_start: "2026-07-24",
        date_stop: "2026-07-24",
        impressions: "1000",
        spend: "120.50",
      },
    });

    expect(snapshot?.providerId).toBe("meta-ads");
    expect(snapshot?.resourceType).toBe("campaign");
    expect(snapshot?.externalId).toBe("cmp_1");
    expect(snapshot?.metrics.spend).toBe(120.5);
    expect(snapshot?.metrics.conversions).toBe(3);
    expect(snapshot?.metrics.ctr).toBe(4);
    expect(snapshot?.dimensions.ad_account_id).toBe("act_123");
  });

  it("maps Google Ads campaign rows into metric snapshots", () => {
    const snapshot = buildGoogleCampaignSnapshot({
      assetId: "asset-2",
      customerId: "1234567890",
      organizationIntegrationId: "integration-2",
      row: {
        campaign: {
          id: "777",
          name: "Pesquisa Marca",
          status: "ENABLED",
        },
        metrics: {
          clicks: "25",
          conversions: "2",
          costMicros: "50000000",
          impressions: "500",
        },
        segments: {
          date: "2026-07-25",
        },
      },
    });

    expect(snapshot?.providerId).toBe("google-growth");
    expect(snapshot?.resourceType).toBe("campaign");
    expect(snapshot?.externalId).toBe("777");
    expect(snapshot?.metrics.spend).toBe(50);
    expect(snapshot?.metrics.conversions).toBe(2);
    expect(snapshot?.metrics.ctr).toBe(5);
    expect(snapshot?.dimensions.customer_id).toBe("1234567890");
  });
});
