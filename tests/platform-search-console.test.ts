import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/analytics/platform-analytics", () => ({ platformGoogleReaderAccount: vi.fn(async () => ({ email: "reader", privateKey: "private" })), platformGoogleReadToken: vi.fn(async () => "test") }));
import { getPlatformSearchConsole } from "@/lib/analytics/platform-search-console";
import { platformGoogleReadToken } from "@/lib/analytics/platform-analytics";
beforeEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
it("requests only the canonical property with read-only scope and final data", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe("https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fwww.connectyhub.com.br%2F/searchAnalytics/query");
    expect(JSON.parse(String(init.body))).toMatchObject({ type: "web", dataState: "final", rowLimit: 10 });
    return Response.json({ rows: [{ clicks: 0, impressions: 3, ctr: 0, position: 2 }] });
  }));
  expect(await getPlatformSearchConsole()).toMatchObject({ status: "connected", total: { clicks: 0, impressions: 3 } });
  expect(platformGoogleReadToken).toHaveBeenCalledWith({ email: "reader", privateKey: "private" }, "webmasters.readonly");
});
it("keeps permission failures distinct from empty successful reports", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "private" }, { status: 403 })));
  expect(await getPlatformSearchConsole()).toMatchObject({ status: "error", total: null });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));
  expect(await getPlatformSearchConsole()).toMatchObject({ status: "connected", total: { clicks: 0, impressions: 0 } });
});
