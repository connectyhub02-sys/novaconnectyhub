import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { serverModuleHarness } from "./helpers/server-module-harness";

describe("Meta OAuth navigation", () => {
  it.each([true, false])("returns the social authorization to the matching panel (admin=%s)", async admin => {
    const route = serverModuleHarness<typeof import("../src/app/api/dashboard/integrations/meta/callback/route")>(
      "src/app/api/dashboard/integrations/meta/callback/route.ts", {
        "next/server": { NextResponse }, "next/cache": {},
        "@/lib/billing/trial": {}, "@/lib/client-os/dashboard-route-scope": {},
        "@/lib/meta/company-access": { getMetaWorkspace: async () => ({profile:{isPlatformAdmin:admin}}) },
        "@/lib/client-os/guided-oauth": { getAppBaseUrl: () => "https://example.test" },
        "@/lib/client-os/growth-integrations": {}, "@/lib/supabase/service": {},
        "@/lib/meta/oauth-state": { metaOAuthCookie: () => ({name:"state",path:"/"}) },
      });
    const response = await route.GET(new NextRequest("https://example.test/api/dashboard/integrations/meta/callback"));
    expect(new URL(response.headers.get("location")!).pathname).toBe(admin ? "/admin/meta/social" : "/dashboard/integracoes");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it.each<Record<string, string>>([
    { "next-router-prefetch": "1" },
    { purpose: "prefetch" },
    { "sec-purpose": "prefetch;prerender" },
    { rsc: "1" },
  ])("does not replace a connection during speculative loading: %j", async headers => {
    const workspace = vi.fn(), save = vi.fn();
    const route = serverModuleHarness<typeof import("../src/app/api/dashboard/integrations/meta/connect/route")>(
      "src/app/api/dashboard/integrations/meta/connect/route.ts", {
        "next/server": { NextResponse },
        "@/lib/billing/trial": {},
        "@/lib/meta/company-access": { getMetaWorkspace: workspace },
        "@/lib/client-os/dashboard-route-scope": {},
        "@/lib/client-os/guided-oauth": { upsertGuidedOAuthConnection: save },
        "@/lib/supabase/service": {},
        "@/lib/meta/oauth-state": {},
      });
    const response = await route.GET(new NextRequest("https://example.test/api/dashboard/integrations/meta/connect", { headers }));
    expect(response.status).toBe(204);
    expect(workspace).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it("does not restart Google OAuth during speculative loading", async () => {
    const workspace = vi.fn();
    const route = serverModuleHarness<typeof import("../src/app/api/dashboard/integrations/google/connect/route")>(
      "src/app/api/dashboard/integrations/google/connect/route.ts", {
        "next/server": { NextResponse },
        "@/lib/billing/trial": {},
        "@/lib/meta/company-access": { getMetaWorkspace: workspace },
        "@/lib/client-os/dashboard-route-scope": {},
        "@/lib/client-os/guided-oauth": {},
        "@/lib/supabase/service": {},
      });
    const response = await route.GET(new NextRequest("https://example.test/api/dashboard/integrations/google/connect", { headers: { "next-router-prefetch": "1" } }));
    expect(response.status).toBe(204);
    expect(workspace).not.toHaveBeenCalled();
  });
});
