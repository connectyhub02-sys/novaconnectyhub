import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { serverModuleHarness } from "./helpers/server-module-harness";

describe("Meta OAuth navigation", () => {
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
});
