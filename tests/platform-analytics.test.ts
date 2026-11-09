import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { analyticsLocation, analyticsReferrer, isPlatformAnalyticsPage } from "@/lib/tracking/google-analytics-policy";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn(() => { throw new Error("No vault in this test"); }) }));
import { getPlatformAnalytics } from "@/lib/analytics/platform-analytics";

describe("platform-only measurement", () => {
  it("excludes tenant pages, private routes, unexpected hosts and lookalike paths", () => {
    for (const path of ["/admin", "/admin/analytics", "/dashboard", "/login", "/loja/buffalo", "/api/test", "/solucoes/unknown"])
      expect(isPlatformAnalyticsPage(path, "www.connectyhub.com.br")).toBe(false);
    expect(isPlatformAnalyticsPage("/", "localhost")).toBe(false);
    expect(isPlatformAnalyticsPage("/", "customer.example.com")).toBe(false);
    expect(isPlatformAnalyticsPage("/solucoes/producao-de-videos", "www.connectyhub.com.br")).toBe(true);
  });
  it("omits personal query parameters, auth fragments and external referrer paths", () => {
    expect(analyticsLocation("https://www.connectyhub.com.br/cadastro?email=private@example.com&code=secret#access_token=secret"))
      .toBe("https://www.connectyhub.com.br/cadastro");
    expect(analyticsReferrer("https://example.com/private/person?q=secret")).toBe("https://example.com/");
    expect(analyticsReferrer("javascript:alert(1)")).toBe("");
  });
});

describe("GA4 reports", () => {
  beforeEach(() => {
    vi.unstubAllEnvs(); vi.unstubAllGlobals();
    const key = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
    vi.stubEnv("GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON", JSON.stringify({ type: "service_account", client_email: "reader@example.iam.gserviceaccount.com", private_key: key }));
    vi.stubEnv("GOOGLE_ANALYTICS_PROPERTY_ID", "478860449");
  });
  it("uses read-only scope, the intended property and production host filter", async () => {
    const fetcher = vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith("/token")) {
        const assertion = (options.body as URLSearchParams).get("assertion")!;
        expect(JSON.parse(Buffer.from(assertion.split(".")[1], "base64url").toString()).scope).toBe("https://www.googleapis.com/auth/analytics.readonly");
        return Response.json({ access_token: "test-token" });
      }
      expect(url).toContain("properties/478860449:");
      const body = JSON.parse(String(options.body));
      if (!url.endsWith("runRealtimeReport")) expect(body.dimensionFilter.filter.inListFilter.values).toEqual(["www.connectyhub.com.br", "connectyhub.com.br"]);
      return Response.json({ rows: [{ dimensionValues: [{ value: "/" }], metricValues: [{ value: "7" }, { value: "9" }, { value: "12" }] }] });
    });
    vi.stubGlobal("fetch", fetcher);
    const report = await getPlatformAnalytics();
    expect(report).toMatchObject({ status: "connected", users: 7, sessions: 9, views: 12, realtimeUsers: 7 });
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it("does not disguise permission failures as zero visits or leak provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/token") ? Response.json({ access_token: "secret" }) : Response.json({ error: "sensitive provider detail" }, { status: 403 })));
    const report = await getPlatformAnalytics();
    expect(report.status).toBe("error"); expect(report.users).toBeNull(); expect(report.detail).toContain("negou");
    expect(JSON.stringify(report)).not.toContain("sensitive provider detail");
  });
  it("distinguishes an authorized empty report from a failed request", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.endsWith("/token") ? { access_token: "test" } : {})));
    expect(await getPlatformAnalytics()).toMatchObject({ status: "connected", users: 0, sessions: 0, views: 0 });
  });
});
