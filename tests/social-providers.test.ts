import { describe, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as policy from "../src/lib/social/policy";
import type { SocialConfig, SocialTokens } from "../src/lib/social/providers";
const config: SocialConfig = { provider: "youtube", clientId: "client", clientSecret: "private-secret", redirectUri: "https://app.example/api/dashboard/social/youtube/callback" };
const tokens: SocialTokens = { accessToken: "private-access", refreshToken: "private-refresh", expiresAt: 10, refreshExpiresAt: null, subject: "creator", scopes: policy.socialScopes.youtube };
function setup(responses: unknown[] = []) {
  const fetch = vi.fn(async () => Response.json(responses.shift() ?? {}));
  const mod = serverModuleHarness<typeof import("../src/lib/social/providers")>("src/lib/social/providers.ts", {
    "./policy": policy,
    "@/lib/security/credentials-crypto": { decryptCredentialValue: (v: string) => v },
    "@/lib/client-os/guided-oauth": { getAppBaseUrl: () => "https://app.example" },
  }, [], { fetch, URLSearchParams });
  return { mod, fetch };
}
describe("social provider contracts", () => {
  it("requests YouTube scopes separately from Google Ads and never embeds secrets in the authorization URL", () => {
    const url = new URL(setup().mod.socialAuthorizationUrl(config, "random-state"));
    expect(url.searchParams.get("scope")).toBe(policy.socialScopes.youtube.join(" "));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("random-state");
    expect(url.href).not.toMatch(/adwords|private-secret/);
  });
  it("uses TikTok's own client_key and comma-separated scopes", () => {
    const url = new URL(setup().mod.socialAuthorizationUrl({ ...config, provider: "tiktok" }, "state"));
    expect(url.origin).toBe("https://www.tiktok.com"); expect(url.searchParams.get("client_key")).toBe("client");
    expect(url.searchParams.get("scope")).toBe("user.info.basic,video.publish");
  });
  it("preserves an existing Google refresh token on renewal", async () => {
    const { mod, fetch } = setup([{ access_token: "new", expires_in: 3600 }]);
    expect((await mod.exchangeSocialTokens(config, "", tokens)).refreshToken).toBe("private-refresh");
    expect(fetch.mock.calls).toHaveLength(1);
  });
  it("requires an offline token for a new connection", async () => {
    const { mod } = setup([{ access_token: "new", expires_in: 3600, scope: policy.socialScopes.youtube.join(" ") }]);
    await expect(mod.exchangeSocialTokens(config, "code")).rejects.toThrow(/autorização/);
  });
  it("rejects a partially granted scope set", async () => {
    const { mod } = setup([{ access_token: "new", refresh_token: "refresh", expires_in: 3600, scope: "user.info.basic" }]);
    await expect(mod.exchangeSocialTokens({ ...config, provider: "tiktok" }, "code")).rejects.toThrow(/autorização/);
  });
  it("persists rotated TikTok refresh tokens and reads only the authorized identity", async () => {
    const { mod } = setup([{ access_token: "next", refresh_token: "rotated", expires_in: 86400, refresh_expires_in: 100000, scope: "user.info.basic,video.publish", open_id: "creator" }, { data: { user: { open_id: "creator", display_name: "Meu perfil" } }, error: { code: "ok" } }]);
    const next = await mod.exchangeSocialTokens({ ...config, provider: "tiktok" }, "code");
    expect(next.refreshToken).toBe("rotated");
    expect(await mod.readSocialAccounts("tiktok", next)).toEqual([{ id: "creator", name: "Meu perfil" }]);
  });
  it("rejects a TikTok profile that differs from the token's subject", async () => {
    const { mod } = setup([{ data: { user: { open_id: "other", display_name: "Other" } }, error: { code: "ok" } }]);
    await expect(mod.readSocialAccounts("tiktok", tokens)).rejects.toThrow(/autorização/);
  });
  it("rejects Google accounts with no accessible YouTube channel", async () => {
    await expect(setup([{ items: [] }]).mod.readSocialAccounts("youtube", tokens)).rejects.toThrow(/autorização/);
  });
  it("does not expose raw provider errors or retry token exchange", async () => {
    const { mod, fetch } = setup([{ error: { code: "invalid_grant", message: "private-provider-payload" } }]);
    await expect(mod.exchangeSocialTokens(config, "code")).rejects.not.toThrow(/private-provider-payload/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
