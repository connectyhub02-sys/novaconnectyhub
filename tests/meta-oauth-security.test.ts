import * as crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

const stateHelpers = serverModuleHarness<typeof import("../src/lib/meta/oauth-state")>(
  "src/lib/meta/oauth-state.ts", { "node:crypto": crypto },
);
const baseUrl = "https://www.connectyhub.com.br";

function fixture() {
  const state = stateHelpers.createMetaOAuthState();
  const config = { permissions: ["ads_read", "ads_management"], redirectUri: `${baseUrl}/api/dashboard/integrations/meta/callback` };
  const row = { id: "integration-a", organization_id: "company-a", metadata: {
    oauth_state_hash: stateHelpers.hashMetaOAuthState(state), oauth_requested_by: "user-a",
    oauth_requested_at: new Date().toISOString(),
  } as Record<string, unknown> };
  const from = vi.fn(() => {
    let update: { metadata?: Record<string, unknown> } | undefined;
    let predicate: Record<string, unknown> = {};
    const builder = {
      select: () => builder,
      eq: () => builder,
      contains: (_key: string, value: Record<string, unknown>) => { predicate = value; return builder; },
      update: (value: typeof update) => { update = value; return builder; },
      maybeSingle: async () => {
        if (!Object.entries(predicate).every(([key, value]) => row.metadata[key] === value)) return { data: null, error: null };
        if (update?.metadata) row.metadata = update.metadata;
        return { data: { ...row, metadata: { ...row.metadata } }, error: null };
      },
    };
    return builder;
  });
  const assets = { adAccountId: "act_test", adAccounts: [], pages: [], instagramAccounts: [] };
  const oauth = {
    getAppBaseUrl: () => baseUrl,
    loadMetaGuidedOAuthConfig: vi.fn(async () => config),
    buildMetaAuthorizationUrl: ({ state: value }: { state: string }) => `https://www.facebook.com/dialog/oauth?state=${value}`,
    exchangeMetaAuthorizationCode: vi.fn(async () => ({ access_token: "test-token" })),
    listMetaGrantedPermissions: vi.fn(async () => ["ads_read"]),
    listMetaConnectionAssets: vi.fn(async () => assets),
    saveOAuthCredentials: vi.fn(async () => ["META_ACCESS_TOKEN"]),
    upsertGuidedOAuthConnection: vi.fn(async () => row.id),
    readOAuthReturnReason: () => "oauth_failed",
    logIntegrationAction: vi.fn(async () => {}),
  };
  const syncMetaOAuthAssets = vi.fn(async () => ({}));
  const requireClientCompanyAccess = vi.fn(async () => ({ id: row.organization_id, role: "owner" }));
  const imports = {
    "next/server": { NextResponse }, "next/cache": { revalidatePath: vi.fn() },
    "@/lib/client-os/guided-oauth": oauth,
    "@/lib/meta/oauth-state": stateHelpers,
    "@/lib/billing/trial": { assertBillableAccess: vi.fn() },
    "@/lib/client-os/companies": { requireClientCompanyAccess },
    "@/lib/client-os/dashboard-route-scope": { resolveDashboardCompanyId: () => row.organization_id },
    "@/lib/supabase/profile": { getCurrentWorkspace: async () => ({ user: { id: "user-a" } }) },
    "@/lib/supabase/service": { createServiceClient: () => ({ from }) },
    "@/lib/client-os/growth-integrations": { syncMetaOAuthAssets, queueGrowthIntegrationSyncJob: vi.fn(async () => null) },
  };
  type Route = { GET(request: NextRequest): Promise<NextResponse> };
  const callback = serverModuleHarness<Route>("src/app/api/dashboard/integrations/meta/callback/route.ts", imports);
  const connect = serverModuleHarness<Route>("src/app/api/dashboard/integrations/meta/connect/route.ts", imports);
  const request = (cookie: string | null = state) => new NextRequest(`${baseUrl}/api/dashboard/integrations/meta/callback?code=test-code&state=${state}`, {
    headers: cookie === null ? {} : { cookie: `${stateHelpers.metaOAuthCookie(baseUrl).name}=${cookie}` },
  });
  return { state, row, from, oauth, syncMetaOAuthAssets, requireClientCompanyAccess, callback, connect, request };
}

describe("Meta OAuth trust boundaries", () => {
  it("binds login to a short-lived host-only browser cookie and stores only the state hash", async () => {
    const f = fixture();
    const response = await f.connect.GET(new NextRequest(`${baseUrl}/api/dashboard/integrations/meta/connect`));
    const state = new URL(response.headers.get("location")!).searchParams.get("state")!;
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain(`__Host-meta-oauth-state=${state}`);
    for (const attribute of ["HttpOnly", "Secure", "SameSite=lax", "Max-Age=600", "Path=/"]) expect(cookie).toContain(attribute);
    expect(cookie).not.toContain("Domain=");
    const saved = f.oauth.upsertGuidedOAuthConnection.mock.calls[0] as unknown as [{ scopes: string[]; metadata: Record<string, unknown> }];
    expect(saved[0].scopes).toEqual([]);
    expect(saved[0].metadata.oauth_state).toBeUndefined();
    expect(saved[0].metadata.oauth_state_hash).toBe(stateHelpers.hashMetaOAuthState(state));
  });

  it.each([null, "a".repeat(64), "malformed"])("rejects absent or mismatched browser proof (%s) before database access", async (cookie) => {
    const f = fixture();
    const response = await f.callback.GET(f.request(cookie));
    expect(response.headers.get("location")).toContain("reason=invalid_state");
    expect(f.from).not.toHaveBeenCalled();
    expect(f.oauth.exchangeMetaAuthorizationCode).not.toHaveBeenCalled();
  });

  it.each(["other-user", "expired", "future"])("rejects %s even with a matching state and cookie", async (scenario) => {
    const f = fixture();
    if (scenario === "other-user") f.row.metadata.oauth_requested_by = "other-owner";
    else f.row.metadata.oauth_requested_at = new Date(Date.now() + (scenario === "expired" ? -601_000 : 60_000)).toISOString();
    const response = await f.callback.GET(f.request());
    expect(response.headers.get("location")).toContain("reason=invalid_state");
    expect(f.oauth.exchangeMetaAuthorizationCode).not.toHaveBeenCalled();
    expect(f.oauth.saveOAuthCredentials).not.toHaveBeenCalled();
  });

  it("rechecks the organization role before exchanging the code", async () => {
    const f = fixture();
    f.requireClientCompanyAccess.mockResolvedValue({ id: f.row.organization_id, role: "member" });
    const response = await f.callback.GET(f.request());
    expect(response.headers.get("location")).toContain("reason=permission");
    expect(f.oauth.exchangeMetaAuthorizationCode).not.toHaveBeenCalled();
  });

  it("consumes state once under concurrent callbacks and records granted scopes only", async () => {
    const f = fixture();
    const responses = await Promise.all([f.callback.GET(f.request()), f.callback.GET(f.request())]);
    expect(responses.map((r) => new URL(r.headers.get("location")!).searchParams.get("integration")).sort())
      .toEqual(["meta_connected", "meta_error"]);
    expect(f.oauth.exchangeMetaAuthorizationCode).toHaveBeenCalledOnce();
    expect(f.oauth.saveOAuthCredentials).toHaveBeenCalledOnce();
    expect(f.oauth.upsertGuidedOAuthConnection).toHaveBeenCalledWith(expect.objectContaining({ scopes: ["ads_read"] }));
    expect(f.syncMetaOAuthAssets).toHaveBeenCalledWith(expect.objectContaining({ permissions: ["ads_read"] }));
    expect(responses[0].headers.get("set-cookie")).toContain("Max-Age=0");
    const replay = await f.callback.GET(f.request());
    expect(replay.headers.get("location")).toContain("invalid_state");
    expect(f.oauth.exchangeMetaAuthorizationCode).toHaveBeenCalledOnce();
  });

  it("does not persist credentials when permission verification fails, and disallows retrying the same state", async () => {
    const f = fixture();
    f.oauth.listMetaGrantedPermissions.mockRejectedValue(new Error("unavailable"));
    const response = await f.callback.GET(f.request());
    expect(response.headers.get("location")).toContain("meta_error");
    expect(f.oauth.saveOAuthCredentials).not.toHaveBeenCalled();
    expect((await f.callback.GET(f.request())).headers.get("location")).toContain("invalid_state");
  });
});

describe("Meta granted permission discovery", () => {
  function load(fetch: ReturnType<typeof vi.fn>) {
    return serverModuleHarness<typeof import("../src/lib/meta/oauth-permissions")>(
      "src/lib/meta/oauth-permissions.ts", { "node:crypto": crypto }, [], { fetch },
    );
  }
  const input = { accessToken: "fake-secret-token", config: { graphVersion: "v25.0", appSecret: "test-secret" } };
  it("ignores declined and expired scopes, paginates through the trusted endpoint and keeps the token out of URLs", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: [{ permission: "ads_read", status: "granted" }, { permission: "ads_management", status: "declined" }], paging: { next: "https://untrusted.example", cursors: { after: "page2" } } }))
      .mockResolvedValueOnce(Response.json({ data: [{ permission: "pages_show_list", status: "granted" }, { permission: "ads_read", status: "expired" }] }));
    expect(await load(fetch).listMetaGrantedPermissions(input)).toEqual(["ads_read", "pages_show_list"]);
    for (const [url, options] of fetch.mock.calls) {
      expect(url.origin).toBe("https://graph.facebook.com");
      expect(url.toString()).not.toContain(input.accessToken);
      expect(options.headers.Authorization).toBe(`Bearer ${input.accessToken}`);
    }
    expect(fetch.mock.calls[1][0].searchParams.get("after")).toBe("page2");
  });
  it.each([{ error: { message: "provider sensitive detail" } }, { data: "malformed" }])("fails closed on invalid permission responses", async (body) => {
    const fetch = vi.fn(async () => Response.json(body));
    await expect(load(fetch).listMetaGrantedPermissions(input)).rejects.toThrow("confirmar as permissoes");
  });
  it("does not loop forever or return a partial grant list on repeated cursors", async () => {
    const fetch = vi.fn(async () => Response.json({ data: [], paging: { next: "next", cursors: { after: "same" } } }));
    await expect(load(fetch).listMetaGrantedPermissions(input)).rejects.toThrow("concluir a leitura");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
