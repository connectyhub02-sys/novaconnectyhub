import { NextResponse } from "next/server";
import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

function fixture(configured = true) {
  const signOut = vi.fn(async () => ({ error: null }));
  const revoke = vi.fn(async () => {});
  const createClient = vi.fn(async () => ({ auth: { signOut } }));
  const route = serverModuleHarness<{ GET(request: Request): Promise<Response> }>(
    "src/app/auth/signout/route.ts",
    {
      "next/server": { NextResponse },
      "@/lib/supabase/server": { createClient },
      "@/lib/supabase/env": { isSupabaseAuthConfigured: () => configured },
      "@/lib/admin-assisted-access": { revokeAdminAssistedAccess: revoke },
    },
  );
  return { route, signOut, revoke, createClient };
}

it.each(["/dashboard", "/admin"])(
  "returns to the public home after signing out from %s behind the container proxy",
  async (panel) => {
    const f = fixture();
    const response = await f.route.GET(new Request("http://0.0.0.0:3000/auth/signout", {
      headers: {
        referer: `https://www.connectyhub.com.br${panel}`,
        "x-forwarded-host": "www.connectyhub.com.br",
        "x-forwarded-proto": "https",
      },
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    expect(new URL(response.headers.get("location")!, "https://www.connectyhub.com.br/auth/signout").href)
      .toBe("https://www.connectyhub.com.br/");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(f.signOut).toHaveBeenCalledOnce();
    expect(f.revoke).toHaveBeenCalledOnce();
    expect(f.revoke.mock.invocationCallOrder[0]).toBeLessThan(f.signOut.mock.invocationCallOrder[0]);
  },
);

it("returns to the home on local development without configured auth", async () => {
  const f = fixture(false);
  const response = await f.route.GET(new Request("http://localhost:3000/auth/signout"));
  expect(response.status).toBe(303);
  expect(new URL(response.headers.get("location")!, "http://localhost:3000/auth/signout").href)
    .toBe("http://localhost:3000/");
  expect(f.createClient).not.toHaveBeenCalled();
  expect(f.revoke).not.toHaveBeenCalled();
});
