import { describe, expect, it, vi } from "vitest";
import * as crypto from "node:crypto";
import { serverModuleHarness } from "./helpers/server-module-harness";

function fixture(denied = false, providerFailure = false) {
  const filters: unknown[][] = [];
  const query = { select: () => query, eq: (...args: unknown[]) => { filters.push(args); return query; },
    in: async () => ({ error: null, data: [
      { env_name: "META_ACCESS_TOKEN", encrypted_value: "private-token" },
      { env_name: "INSTAGRAM_BUSINESS_ACCOUNT_ID", encrypted_value: "123456789" },
    ] }) };
  const from = vi.fn(() => query);
  const fetch = vi.fn(async (url: URL) => providerFailure ? Response.json({ error: "private-token" }, { status: 403 }) :
    Response.json(url.pathname.endsWith("/media") ? { data: [{ id: "post", caption: "Hello" }] } : { id: "123456789", username: "example" }));
  const reader = serverModuleHarness<typeof import("../src/lib/meta/instagram-reader")>("src/lib/meta/instagram-reader.ts", {
    "node:crypto": crypto,
    "./company-access": { requireMetaCompanyAccess: async () => { if (denied) throw new Error("access denied"); return { id: "tenant-a" }; } },
    "@/lib/supabase/service": { createServiceClient: () => ({ from }) },
    "@/lib/client-os/guided-oauth": { loadMetaGuidedOAuthConfig: async () => ({ graphVersion: "v25.0", appSecret: "test" }) },
    "@/lib/security/credentials-crypto": { decryptCredentialValue: (value: string) => value },
  }, [], { fetch });
  return { reader, from, fetch, filters };
}

describe("Instagram tenant reader", () => {
  it("rejects unauthorized access before reading credentials or calling Meta", async () => {
    const f = fixture(true);
    await expect(f.reader.getInstagramOverview("user", "tenant-b")).rejects.toThrow("access denied");
    expect(f.from).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it("uses the authorized tenant and keeps credentials out of returned data and request URLs", async () => {
    const f = fixture(); const result = await f.reader.getInstagramOverview("user", "tenant-a");
    expect(f.filters).toContainEqual(["organization_id", "tenant-a"]);
    expect(result.profile?.username).toBe("example"); expect(result.media).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("private-token");
    for (const [url] of f.fetch.mock.calls) expect(url.toString()).not.toContain("private-token");
  });
  it("does not disclose provider error details", async () => {
    const f = fixture(false, true); const result = await f.reader.getInstagramOverview("user", "tenant-a");
    expect(result.profile).toBeNull(); expect(result.error).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain("private-token");
  });
  it("only allows official HTTPS Instagram permalinks", () => {
    const { reader } = fixture();
    for (const value of ["javascript:alert(1)", "https://instagram.com.evil.test/x", "http://instagram.com/x"]) expect(reader.safeInstagramPermalink(value)).toBeNull();
    expect(reader.safeInstagramPermalink("https://www.instagram.com/p/example/")).toBe("https://www.instagram.com/p/example/");
  });
});
