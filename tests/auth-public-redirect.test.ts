import { NextRequest, NextResponse } from "next/server";
import { expect, it, vi } from "vitest";
import * as destinations from "../src/lib/auth/route-destinations";
import { serverModuleHarness } from "./helpers/server-module-harness";

it.each([false, true])("keeps login on the public browser origin behind the proxy (admin=%s)", async (admin) => {
  const route = serverModuleHarness<{ GET(r: NextRequest): Promise<Response> }>("src/app/auth/continue/route.ts", {
    "next/server": { NextResponse },
    "@/lib/auth/route-destinations": destinations,
    "@/lib/supabase/profile": { getCurrentWorkspace: async () => ({ profile: { isPlatformAdmin: admin } }) },
  });
  const response = await route.GET(new NextRequest("http://0.0.0.0:3000/auth/continue", {
    headers: { "x-forwarded-host": "attacker.invalid", "x-forwarded-proto": "https" },
  }));
  expect(response.status).toBe(303);
  expect(new URL(response.headers.get("location")!, "https://www.connectyhub.com.br/auth/continue").href)
    .toBe(`https://www.connectyhub.com.br/${admin ? "admin" : "dashboard"}`);
  expect(response.headers.get("cache-control")).toContain("no-store");
});

it.each([undefined, "https://www.connectyhub.com.br", "http://localhost:3000"])(
  "generates magic links with the configured public callback (%s), ignoring the container and hostile headers",
  async (appUrl) => {
    const generateLink = vi.fn(async () => ({ data: { properties: { action_link: "https://auth.example.test/verify" } }, error: null }));
    const route = serverModuleHarness<{ POST(r: NextRequest): Promise<Response> }>("src/app/api/admin/users/access-link/route.ts", {
      "next/server": { NextResponse },
      "@/lib/supabase/admin-auth": { requirePlatformAdmin: async () => ({ userId: "admin-test" }) },
      "@/lib/supabase/service": { createServiceClient: () => ({ auth: { admin: {
        getUserById: async () => ({ data: { user: { email: "test@example.test" } }, error: null }), generateLink,
      } } }) },
    }, [], { process: { env: { NEXT_PUBLIC_APP_URL: appUrl } } });
    const response = await route.POST(new NextRequest("http://0.0.0.0:3000/api/admin/users/access-link", {
      method: "POST", body: JSON.stringify({ userId: "test-user" }),
      headers: { "content-type": "application/json", "x-forwarded-host": "attacker.invalid" },
    }));
    expect(response.status).toBe(200);
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "test@example.test", options: {
      redirectTo: `${appUrl || "https://www.connectyhub.com.br"}/auth/callback?next=%2Fdashboard`,
    } });
  },
);
