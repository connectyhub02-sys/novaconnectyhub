import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: vi.fn(), graph: vi.fn(), pixel: vi.fn() }));
vi.mock("../src/lib/meta/ads-leads-context", () => ({ loadAdsLeadsContext: mocks.context, adsLeadsGraph: mocks.graph, metaRecord: (v: unknown) => v && typeof v === "object" ? v : {} }));
vi.mock("../src/lib/meta/pixel-conversions", () => ({ pixelConfiguration: mocks.pixel }));
import { getMetaAdsAnalytics } from "../src/lib/meta/ads-analytics";

function database(failTable = "") {
  const queries: { table: string; filters: unknown[][] }[] = [];
  const from = (table: string) => {
    const entry = { table, filters: [] as unknown[][] }; queries.push(entry);
    const q: Record<string, unknown> = {};
    for (const method of ["select", "eq", "gte", "lt", "is", "not", "in", "order", "limit"]) q[method] = (...args: unknown[]) => { entry.filters.push([method, ...args]); return q; };
    const result = () => ({ error: table === failTable ? { message: "error" } : null, count: 3,
      data: table === "organization_integrations" ? { metadata: { ad_accounts: [{ id: "act_1", label: "Own" }, { id: "act_2", label: "Another authorized account" }] } } : [] });
    q.single = async () => result();
    q.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return q;
  };
  return { client: { from } as unknown as SupabaseClient, queries };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ organizationId: "org-a", integrationId: "integration-a", adAccountId: "act_1", pageId: "page-a", scopes: ["ads_read", "ads_mcp_management"] });
  mocks.pixel.mockResolvedValue({ pixel_id: "pixel-a", pixel_name: "Own pixel", ad_account_id: "act_1", enabled: true, test_event_code: "TEST_PRIVATE" });
  mocks.graph.mockImplementation(async (_ctx, path, params) => path.endsWith("/insights") ? { data: params.level === "campaign" ? [{ campaign_id: "c1", campaign_name: "Own campaign", spend: "100", clicks: "20", impressions: "1000" }] : [] } : { id: path, name: "Own", currency: "BRL", timezone_name: "America/Sao_Paulo" });
});
describe("unified report sources", () => {
  it("scopes every DB read to the same tenant, keeps CRM separate and hides secrets", async () => {
    const db = database(); const r = await getMetaAdsAnalytics(db.client, "org-a");
    expect(r.status).toBe("ready"); expect(r.totals?.spend).toBe(100); expect(r.totals?.leads).toBe(0); expect(r.totals?.cpl).toBeNull(); expect(r.crm?.imported).toBe(3);
    expect(r.pixel?.counts?.test).toBe(3); expect(r.pixel?.testMode).toBe(true); expect(JSON.stringify(r)).not.toContain("TEST_PRIVATE");
    for (const q of db.queries) expect(q.filters).toContainEqual(["eq", "organization_id", "org-a"]);
    for (const q of db.queries.filter(q => q.table === "meta_conversion_events")) expect(q.filters).toContainEqual(["eq", "pixel_id", "pixel-a"]);
    for (const q of db.queries.filter(q => q.table === "meta_lead_deliveries")) expect(q.filters).toContainEqual(["eq", "page_id", "page-a"]);
    expect(mocks.context).toHaveBeenCalledWith(db.client, "org-a");
  });
  it("keeps metrics available when a local source fails without inventing zero counts", async () => {
    const r = await getMetaAdsAnalytics(database("meta_lead_deliveries").client, "org-a");
    expect(r.status).toBe("ready"); expect(r.crm).toBeNull(); expect(r.errors[0]).toContain("CRM");
  });
  it("keeps Graph failures distinct from valid empty responses", async () => {
    mocks.graph.mockImplementation(async (_ctx, path) => { if (path.endsWith("/insights")) throw new Error("Denied"); return { id: "act_1", timezone_name: "UTC" }; });
    const r = await getMetaAdsAnalytics(database().client, "org-a");
    expect(r.status).toBe("error"); expect(r.totals).toBeNull(); expect(r.errors).toHaveLength(2);
    mocks.graph.mockImplementation(async (_ctx, path) => path.endsWith("/insights") ? { data: [] } : { id: "act_1", timezone_name: "UTC" });
    const empty = await getMetaAdsAnalytics(database().client, "org-a"); expect(empty.status).toBe("empty"); expect(empty.totals?.spend).toBe(0);
  });
  it("does not join the connected Pixel to a different selected ad account", async () => {
    const db = database(); const r = await getMetaAdsAnalytics(db.client, "org-a", { accountId: "act_2" });
    expect(r.selectedAccountId).toBe("act_2"); expect(r.connectedAccountId).toBe("act_1");
    expect(r.pixel).toMatchObject({ matches: false, enabled: false, counts: null });
    expect(db.queries.some(q => q.table === "meta_conversion_events")).toBe(false);
  });
  it("rejects account injection before Graph or Pixel calls", async () => {
    await expect(getMetaAdsAnalytics(database().client, "org-a", { accountId: "act_999" })).rejects.toThrow("autorizada");
    expect(mocks.graph).not.toHaveBeenCalled(); expect(mocks.pixel).not.toHaveBeenCalled();
  });
  it("limits reviewers to the selected test account despite broader USER OAuth inventory", async () => {
    const db = database();
    const r = await getMetaAdsAnalytics(db.client, "org-a", { selectedAccountOnly: true });
    expect(r.accounts).toEqual([{ id: "act_1", label: "Own" }]);
    mocks.graph.mockClear();
    await expect(getMetaAdsAnalytics(db.client, "org-a", { selectedAccountOnly: true, accountId: "act_2" })).rejects.toThrow("autorizada");
    expect(mocks.graph).not.toHaveBeenCalled();
  });
});
