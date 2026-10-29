import * as crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as policy from "../src/lib/social/policy";
import { isSameOriginRequest } from "../src/lib/security/same-origin-request";

const stateHelpers = serverModuleHarness<typeof import("../src/lib/meta/oauth-state")>("src/lib/meta/oauth-state.ts", { "node:crypto": crypto });
const state = "a".repeat(64);
function setup({ user = "user", org = "org", expired = false, consumed = false, cancelled = false } = {}) {
  let attempt: Record<string, unknown> | null = { organization_id: org, user_id: user, provider: "youtube", state_hash: stateHelpers.hashMetaOAuthState(state), shell: "client", expires_at: new Date(Date.now() + (expired ? -60000 : 60000)).toISOString(), consumed_at: consumed ? "old" : null };
  const client = { from: () => {
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    let patch: object | null = null;
    const q = { select: () => q, update: (value: object) => { patch = value; return q; },
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return q; },
      is: (key: string, value: unknown) => { filters.push(row => row[key] === value); return q; },
      gt: (key: string, value: string) => { filters.push(row => String(row[key]) > value); return q; },
      maybeSingle: async () => {
        if (!attempt || !filters.every(f => f(attempt!))) return { data: null, error: null };
        if (patch) attempt = { ...attempt, ...patch };
        return { data: { ...attempt }, error: null };
      },
    }; return q;
  } };
  const exchange = vi.fn(async () => ({ accessToken: "SECRET" }));
  const save = vi.fn(async () => { attempt = null; });
  class AccessError extends Error { status = 403; }
  const mod = serverModuleHarness<typeof import("../src/lib/social/oauth")>("src/lib/social/oauth.ts", {
    "next/server": { NextResponse }, "@/lib/meta/oauth-state": stateHelpers,
    "@/lib/client-os/guided-oauth": { getAppBaseUrl: () => "https://app.example" },
    "@/lib/security/public-request-guard": { validatePublicWriteRequest: () => ({ ok: true }) },
    "@/lib/security/same-origin-request": { isSameOriginRequest: (r: Request) => isSameOriginRequest(r, { NEXT_PUBLIC_APP_URL: "https://app.example" }) },
    "./policy": policy,
    "./access": { SocialAccessError: AccessError, socialAccess: async (_shell: string, requested: string) => { if (requested !== "org") throw Error("Scope denied"); return { organizationId: "org", client, workspace: { user: { id: "user" } } }; } },
    "@/lib/supabase/profile": { getCurrentWorkspace: async () => ({ user: { id: "user" } }) },
    "@/lib/supabase/service": { createServiceClient: () => client },
    "./providers": { loadSocialConfig: async () => ({}), exchangeSocialTokens: exchange, readSocialAccounts: async () => [{ id: "channel", name: "Channel" }] },
    "./connections": { saveSocialConnection: save },
  });
  const request = (cookieState = state) => new NextRequest(`https://app.example/api/dashboard/social/youtube/callback?state=${state}&${cancelled ? "error=access_denied" : "code=private-code"}`, { headers: { Cookie: `__Host-social-oauth-youtube=${cookieState}` } });
  return { mod, exchange, save, request };
}
describe("social OAuth security", () => {
  it.each([{ user: "other" }, { org: "other" }, { expired: true }, { consumed: true }])("rejects invalid authorization context %j", async options => {
    const t = setup(options); const response = await t.mod.socialCallback(t.request(), "youtube");
    expect(response.headers.get("location")).toContain("connection=error"); expect(t.exchange).not.toHaveBeenCalled(); expect(t.save).not.toHaveBeenCalled();
  });
  it("requires the independent browser cookie", async () => {
    const t = setup(); await t.mod.socialCallback(t.request("b".repeat(64)), "youtube"); expect(t.exchange).not.toHaveBeenCalled();
  });
  it("consumes an authorization once and keeps secrets out of redirects", async () => {
    const t = setup(); const response = await t.mod.socialCallback(t.request(), "youtube");
    expect(response.headers.get("location")).toBe("https://app.example/dashboard/redes-sociais/contas?connection=connected");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    await t.mod.socialCallback(t.request(), "youtube"); expect(t.exchange).toHaveBeenCalledTimes(1); expect(t.save).toHaveBeenCalledTimes(1);
    expect(t.save.mock.calls[0]).toEqual(expect.arrayContaining([stateHelpers.hashMetaOAuthState(state)]));
  });
  it("preserves an existing connection when consent is denied", async () => {
    const t = setup({ cancelled: true }); const response = await t.mod.socialCallback(t.request(), "youtube");
    expect(response.headers.get("location")).toContain("connection=cancelled"); expect(t.exchange).not.toHaveBeenCalled(); expect(t.save).not.toHaveBeenCalled();
  });
  it.each([undefined, "https://attacker.example"])("rejects mutation origin %s before touching the database", async origin => {
    const t = setup(); const response = await t.mod.socialAction(new NextRequest("https://app.example/api/dashboard/social/youtube", { method: "POST", headers: origin ? { Origin: origin } : {}, body: "{}" }), "youtube");
    expect(response.status).toBe(403);
  });
});
