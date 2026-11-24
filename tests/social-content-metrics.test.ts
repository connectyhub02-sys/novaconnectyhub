import { describe, expect, it, vi } from "vitest";

const graph = vi.fn();
vi.mock("../src/lib/meta/inbox-content", () => ({
  graphId: (v: unknown) => typeof v === "string" && /^\d+(?:_\d+)?$/.test(v),
  inboxAsset: (_ctx: unknown, network: string) => (network === "instagram" ? "17841" : "2936"),
  inboxGraph: (...args: unknown[]) => graph(...args),
}));
vi.mock("../src/lib/meta/ads-leads-context", () => ({
  metaRecord: (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v : {}),
}));

const { mapFacebookMetrics, readContentMetrics, readInsightValues } = await import("../src/lib/meta/content-metrics");
const insights = (rows: Record<string, number>) => ({ data: Object.entries(rows).map(([name, value]) => ({ name, values: [{ value }] })) });
const ctx = {} as never;

describe("content metrics", () => {
  it("reads the latest insight value per metric", () => {
    expect(readInsightValues({ data: [{ name: "reach", values: [{ value: 3 }, { value: 9 }] }, { name: "views", total_value: { value: 12 } }] })).toEqual({ reach: 9, views: 12 });
    expect(readInsightValues(undefined)).toEqual({});
  });

  it("sums Facebook reactions, comments and shares and keeps missing views as null", () => {
    const post = { reactions: { summary: { total_count: 5 } }, comments: { summary: { total_count: 2 } } };
    expect(mapFacebookMetrics({}, post)).toEqual({ views: null, reach: null, interactions: 7 });
    expect(mapFacebookMetrics({ post_media_view: 40, post_total_media_view_unique: 30 }, { ...post, shares: { count: 1 } })).toEqual({ views: 40, reach: 30, interactions: 8 });
    expect(mapFacebookMetrics({ post_media_view: 150, post_total_media_view_unique: 0 }, post).reach).toBeNull();
  });

  it("returns Instagram metrics only for media owned by the selected profile", async () => {
    graph.mockReset();
    graph.mockImplementation(async (_c: unknown, _n: string, id: string) =>
      id === "1" ? { owner: { id: "17841" }, insights: insights({ views: 284, reach: 230, total_interactions: 7 }) } : { owner: { id: "999" }, insights: insights({ views: 1 }) });
    const result = await readContentMetrics(ctx, "instagram", ["1", "2", "not-an-id"]);
    expect(result["1"]).toEqual({ views: 284, reach: 230, interactions: 7 });
    expect(result["2"]).toMatchObject({ unavailable: true, views: null });
    expect(result["not-an-id"]).toBeUndefined();
  });

  it("salvages individual Instagram metrics when the combined request is refused", async () => {
    graph.mockReset();
    graph.mockImplementation(async (_c: unknown, _n: string, _id: string, params: { fields: string }) => {
      if (params.fields.includes(",")) throw new Error("metric not supported");
      if (params.fields === "owner") return { owner: { id: "17841" } };
      if (params.fields.includes("reach")) return { insights: insights({ reach: 50 }) };
      throw new Error("metric not supported");
    });
    expect((await readContentMetrics(ctx, "instagram", ["1"]))["1"]).toEqual({ views: null, reach: 50, interactions: null });
  });

  it("never queries Facebook posts outside the selected Page", async () => {
    graph.mockReset();
    const result = await readContentMetrics(ctx, "facebook", ["1234_5"]);
    expect(result["1234_5"]).toMatchObject({ unavailable: true });
    expect(graph).not.toHaveBeenCalled();
  });
});

describe("insight permissions", () => {
  it("reports the permission each network needs for views and reach", async () => {
    const { missingInsightPermissions } = await import("../src/lib/meta/content-metrics");
    expect(missingInsightPermissions("instagram", ["instagram_basic"])).toEqual(["instagram_manage_insights"]);
    expect(missingInsightPermissions("facebook", ["read_insights"])).toEqual([]);
  });
});
