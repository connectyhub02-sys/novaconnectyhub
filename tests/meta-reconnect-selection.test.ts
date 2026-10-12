import * as crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveInternalMetaLoginConfig } from "@/lib/meta/internal-login-config";
import { serverModuleHarness } from "./helpers/server-module-harness";
import type * as OAuth from "@/lib/client-os/guided-oauth";

describe("Meta reconnect selection", () => {
  const input = { isPlatformAdmin: true, slug: "connectyhub-platform-whatsapp", planCode: "internal", metadata: { internal_validation_config_id: "123" }, defaultConfigId: "456" };
  it("only uses the internal login config for the admin's internal workspace", () => {
    expect(resolveInternalMetaLoginConfig(input)).toBe("123");
    expect(resolveInternalMetaLoginConfig({ ...input, isPlatformAdmin: false })).toBe("456");
    expect(resolveInternalMetaLoginConfig({ ...input, slug: "customer" })).toBe("456");
    expect(resolveInternalMetaLoginConfig({ ...input, planCode: "scale" })).toBe("456");
    expect(resolveInternalMetaLoginConfig({ ...input, metadata: { internal_validation_config_id: "bad" } })).toBe("456");
  });
  it("keeps the selected account and page, and never switches a revoked selection to another asset", async () => {
    const oauth = serverModuleHarness<typeof OAuth>("src/lib/client-os/guided-oauth.ts", { "node:crypto": crypto }, [], {
      fetch: async (url: string) => Response.json({ data: url.includes("adaccounts")
        ? [{ id: "act_other", name: "Other", account_status: 1 }, { id: "act_own", name: "Own", account_status: 1 }]
        : [{ id: "other", name: "Other" }, { id: "own", name: "Own", access_token: "test", instagram_business_account: { id: "ig-own" } }] }),
    });
    const config = { appSecret: "test", graphVersion: "v25.0" } as OAuth.MetaGuidedOAuthConfig;
    const own = await oauth.listMetaConnectionAssets({ accessToken: "test", config, preferredAdAccountId: "act_own", preferredPageId: "own" });
    expect(own.adAccountId).toBe("act_own");
    expect(own.pageId).toBe("own");
    expect(own.instagramBusinessId).toBe("ig-own");
    const revoked = await oauth.listMetaConnectionAssets({ accessToken: "test", config, preferredAdAccountId: "act_revoked", preferredPageId: "revoked" });
    expect(revoked.adAccountId).toBe("");
    expect(revoked.pageId).toBeNull();
  });
});
