import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/client-os/guided-oauth", () => ({ loadMetaGuidedOAuthConfig: vi.fn() }));
import { analyticsAccounts, selectAnalyticsAccount, analyticsPeriod, insightMetrics, sumInsights } from "../src/lib/meta/ads-analytics-model";
import { readInsights } from "../src/lib/meta/ads-analytics";
import { analyticsPlan } from "../src/lib/meta/ads-analytics-plan";
import type { AdsLeadsContext } from "../src/lib/meta/ads-leads-context";
import type { MetaAdsAnalytics } from "../src/lib/meta/ads-analytics";
afterEach(() => vi.unstubAllGlobals());
describe("tenant Meta analytics metrics", () => {
  it("selects only valid accounts from this connection, never a browser-injected account", () => {
    const accounts = analyticsAccounts({ ad_accounts: [{ id: "act_1", label: "Own" }, { id: "act_1" }, { id: "https://evil" }] }, "act_2");
    expect(accounts).toEqual([{ id: "act_1", label: "Own" }, { id: "act_2", label: "act_2" }]);
    expect(selectAnalyticsAccount(accounts, "act_2", "act_1")).toBe("act_1");
    expect(() => selectAnalyticsAccount(accounts, "act_2", "act_999")).toThrow("autorizada");
  });
  it("computes inclusive dates in the ad account timezone, including local midnight", () => {
    expect(analyticsPeriod({ days: "7" }, "America/Sao_Paulo", new Date("2026-10-12T01:00:00Z"))).toEqual({
      since: "2026-10-05", until: "2026-10-11", start: "2026-10-05T03:00:00.000Z", end: "2026-10-12T03:00:00.000Z", timezone: "America/Sao_Paulo",
    });
    const dst = analyticsPeriod({ since: "2026-03-08", until: "2026-03-08" }, "America/New_York", new Date("2026-10-12T00:00:00Z"));
    expect(dst.start).toBe("2026-03-08T05:00:00.000Z"); expect(dst.end).toBe("2026-03-09T04:00:00.000Z");
  });
  it.each([{ days: "999" }, { since: "2026-02-30", until: "2026-03-01" }, { since: "2026-01-01", until: "2026-10-01" }, { since: "2026-01-01" }, { since: "2027-01-01", until: "2027-01-02" }])("rejects invalid or unbounded periods %o", input => {
    expect(() => analyticsPeriod(input, "UTC", new Date("2026-10-12"))).toThrow();
  });
  it("does not sum aggregate/destination aliases or engagement actions as conversions", () => {
    const metrics = insightMetrics({ spend: "100", impressions: "1000", clicks: "20", actions: [
      { action_type: "lead", value: "5" }, { action_type: "onsite_conversion.lead_grouped", value: "3" },
      { action_type: "omni_purchase", value: "2" }, { action_type: "purchase", value: "2" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "2" }, { action_type: "post_engagement", value: "900" },
    ], action_values: [{ action_type: "omni_purchase", value: "250" }, { action_type: "purchase", value: "250" }] });
    expect(metrics).toMatchObject({ leads: 5, purchases: 2, purchaseValue: 250, roas: 2.5, cpl: 20, cpc: 5, ctr: 2 });
  });
  it("weights ratios by totals and leaves undefined ratios null", () => {
    const empty = insightMetrics({}); expect(empty.cpc).toBeNull(); expect(empty.roas).toBeNull();
    const total = sumInsights([insightMetrics({ spend: "100", clicks: "10", impressions: "100" }), insightMetrics({ spend: "20", clicks: "20", impressions: "1000" })]);
    expect(total.cpc).toBe(4); expect(total.ctr).toBeCloseTo(30 / 1100 * 100);
  });
});
describe("Meta reporting transport", () => {
  const ctx = { adAccountId: "act_123", token: "PRIVATE_TOKEN", config: { graphVersion: "v24.0", appSecret: "PRIVATE_APP_SECRET" } } as AdsLeadsContext;
  it("follows opaque cursors on the trusted Graph host using GET only", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ campaign_id: "1" }], paging: { next: "https://evil.test/secret", cursors: { after: "cursor" } } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ campaign_id: "2" }] })));
    vi.stubGlobal("fetch", fetch);
    expect(await readInsights(ctx, { level: "campaign" })).toHaveLength(2);
    for (const [url, options] of fetch.mock.calls) {
      expect(new URL(String(url)).hostname).toBe("graph.facebook.com"); expect(options.method).toBe("GET");
      expect(String(url)).not.toContain("PRIVATE_TOKEN"); expect(options.headers.Authorization).toBe("Bearer PRIVATE_TOKEN");
    }
    expect(String(fetch.mock.calls[1][0])).toContain("after=cursor");
  });
  it("does not present partial totals when pagination fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ spend: 999 }], paging: { next: "next" } }))));
    await expect(readInsights(ctx, {})).rejects.toThrow("Nenhum total parcial");
  });
  it("does not convert a denied permission into an empty successful report", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 200, message: "PRIVATE_TOKEN" } }), { status: 403 })));
    await expect(readInsights(ctx, {})).rejects.toThrow("HTTP 403, código 200");
  });
  it("refuses AI analysis without observed campaign metrics", () => {
    expect(() => analyticsPlan({ status: "empty", totals: sumInsights([]) } as MetaAdsAnalytics)).toThrow("métricas suficientes");
    expect(() => analyticsPlan({ status: "error", totals: null } as MetaAdsAnalytics)).toThrow();
  });
});
