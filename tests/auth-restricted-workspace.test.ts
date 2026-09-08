import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import * as destinations from "../src/lib/auth/route-destinations";
import * as recovery from "../src/lib/billing/recovery-paths";
import { serverModuleHarness } from "./helpers/server-module-harness";

const origin = "https://www.connectyhub.com.br";
function fixture({ allowed = false, admin = false, authenticated = true } = {}) {
  const user = authenticated ? { id: "customer-1" } : null;
  const getCurrentWorkspace = vi.fn(async (options?: { allowRestricted?: boolean }) => {
    if (!user) return null;
    if (!admin && !allowed && !options?.allowRestricted) throw new Error("Os serviços do plano estão suspensos.");
    return { user, profile: { isPlatformAdmin: admin }, organization: { id: "org-1", status: allowed ? "active" : "suspended" } };
  });
  const exchangeCodeForSession = vi.fn(async () => ({ error: null }));
  const ensureStarterOrganization = vi.fn(async () => null);
  const imports = {
    "next/server": { NextRequest, NextResponse },
    "@/lib/auth/route-destinations": destinations,
    "@/lib/supabase/profile": { getCurrentWorkspace, ensureStarterOrganization },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { exchangeCodeForSession } }) },
    "@/lib/supabase/auth": { getAuthenticatedUser: async () => user },
    "next/navigation": { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } },
  };
  const continuation = serverModuleHarness<{ GET: (r: NextRequest) => Promise<NextResponse> }>("src/app/auth/continue/route.ts", imports);
  const callback = serverModuleHarness<{ GET: (r: NextRequest) => Promise<NextResponse> }>("src/app/auth/callback/route.ts", imports);
  const profile = {
    full_name: "Cliente Teste", email: "customer@example.test", account_type: "person", document_type: "cpf",
    phone_normalized: "5511999999999", phone_verified_at: "2026-09-01T00:00:00Z", cpf_hash: "test-hash", is_platform_admin: admin,
  };
  const rpc = vi.fn(async () => ({ data: { allowed }, error: null }));
  const supabase = {
    auth: { getUser: async () => ({ data: { user } }) }, rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }) }),
  };
  const proxy = serverModuleHarness<{ updateSession: (r: NextRequest) => Promise<NextResponse> }>("src/lib/supabase/proxy.ts", {
    ...imports, "@supabase/ssr": { createServerClient: () => supabase },
    "@/lib/billing/recovery-paths": recovery,
    "./env": { getSupabasePublicEnv: () => ({ configured: true, url: "https://auth.example.test", publishableKey: "test" }) },
  });
  return { imports, continuation, callback, proxy, getCurrentWorkspace, exchangeCodeForSession, rpc };
}

describe("authentication for overdue customers", () => {
  it("completes admin access and sends the customer to payment recovery without an HTTP 500", async () => {
    const f = fixture();
    const entry = await f.continuation.GET(new NextRequest(`${origin}/auth/continue`));
    expect(entry.status).toBe(307);
    expect(entry.headers.get("location")).toBe(`${origin}/dashboard`);
    const dashboard = await f.proxy.updateSession(new NextRequest(entry.headers.get("location")!));
    expect(dashboard.status).toBe(307);
    expect(dashboard.headers.get("location")).toBe(`${origin}/dashboard/planos?regularizar=1`);
    const payment = await f.proxy.updateSession(new NextRequest(dashboard.headers.get("location")!));
    expect(payment.status).toBe(200);
    expect(payment.headers.get("location")).toBeNull();
  });

  it("also permits the authentication callback and preserves purchased-product deep links", async () => {
    const f = fixture();
    const response = await f.callback.GET(new NextRequest(`${origin}/auth/callback?code=test-code&next=/dashboard/meus-produtos`));
    expect(f.exchangeCodeForSession).toHaveBeenCalledWith("test-code");
    expect(response.headers.get("location")).toBe(`${origin}/dashboard/meus-produtos`);
    expect((await f.proxy.updateSession(new NextRequest(response.headers.get("location")!))).status).toBe(200);
  });

  it.each([
    ["src/app/login/page.tsx", "/dashboard"],
    ["src/app/iniciar/page.tsx", "/dashboard/planos?plan=scale"],
  ])("does not require an active plan on the entry page %s", async (path, expected) => {
    const f = fixture();
    const page = serverModuleHarness<{ default: (props: unknown) => Promise<unknown> }>(path, f.imports);
    await expect(page.default({ searchParams: Promise.resolve({ plan: "scale" }) })).rejects.toThrow(`REDIRECT:${expected}`);
  });

  it("keeps paid features and operational API calls blocked after authentication", async () => {
    const f = fixture();
    for (const path of ["/dashboard/agentes", "/dashboard/automacoes", "/dashboard/integracoes"]) {
      const response = await f.proxy.updateSession(new NextRequest(origin + path));
      expect(response.headers.get("location")).toBe(`${origin}/dashboard/planos?regularizar=1`);
    }
    const api = await f.proxy.updateSession(new NextRequest(`${origin}/api/dashboard/agents`));
    expect(api.status).toBe(402);
    expect(await api.json()).toMatchObject({ code: "billing_access_required" });
    for (const path of ["/api/dashboard/billing/status", "/api/dashboard/meus-produtos"]) {
      expect((await f.proxy.updateSession(new NextRequest(origin + path))).status).toBe(200);
    }
  });

  it("retains normal dashboard access after payment and the admin's own destination", async () => {
    const active = fixture({ allowed: true });
    const entry = await active.continuation.GET(new NextRequest(`${origin}/auth/continue`));
    expect((await active.proxy.updateSession(new NextRequest(entry.headers.get("location")!))).status).toBe(200);
    const admin = fixture({ admin: true });
    expect((await admin.continuation.GET(new NextRequest(`${origin}/auth/continue`))).headers.get("location")).toBe(`${origin}/admin`);
  });

  it("still sends an unauthenticated visitor to login", async () => {
    const f = fixture({ authenticated: false });
    const entry = await f.continuation.GET(new NextRequest(`${origin}/auth/continue`));
    const dashboard = await f.proxy.updateSession(new NextRequest(entry.headers.get("location")!));
    expect(dashboard.headers.get("location")).toBe(`${origin}/login?next=%2Fdashboard`);
  });
});
