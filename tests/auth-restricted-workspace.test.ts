import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import * as destinations from "../src/lib/auth/route-destinations";
import * as companySetup from "../src/lib/account/workspace-required";
import * as recovery from "../src/lib/billing/recovery-paths";
import { serverModuleHarness } from "./helpers/server-module-harness";

const origin = "https://www.connectyhub.com.br";
function fixture({ allowed = false, admin = false, authenticated = true, workspaceMissing = false, complete = true } = {}) {
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
    phone_normalized: "5511999999999", phone_verified_at: "2026-09-01T00:00:00Z", cpf_hash: complete ? "test-hash" : null, is_platform_admin: admin,
  };
  const rpc = vi.fn(async () => ({ data: { allowed, reason: workspaceMissing ? "workspace_required" : "expired" }, error: null }));
  const supabase = {
    auth: { getUser: async () => ({ data: { user } }) }, rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }) }),
  };
  const proxy = serverModuleHarness<{ updateSession: (r: NextRequest) => Promise<NextResponse> }>("src/lib/supabase/proxy.ts", {
    ...imports, "@supabase/ssr": { createServerClient: () => supabase },
    "@/lib/auth/meta-review-access": { readMetaReviewAccess: () => null },
    "@/lib/billing/recovery-paths": recovery,
    "@/lib/account/workspace-required": companySetup,
    "./env": { getSupabasePublicEnv: () => ({ configured: true, url: "https://auth.example.test", publishableKey: "test" }) },
  });
  return { imports, continuation, callback, proxy, getCurrentWorkspace, exchangeCodeForSession, rpc };
}

describe("authentication for overdue customers", () => {
  it.each([false, true])("allows account, invoices and security with paid access=%s", async allowed => {
    const f = fixture({ allowed });
    for (const path of ["/dashboard/minha-conta", "/dashboard/minha-conta/faturas/fixture", "/api/dashboard/account", "/api/dashboard/account/security", "/api/dashboard/billing/payment-methods", "/api/dashboard/billing/address"]) {
      expect((await f.proxy.updateSession(new NextRequest(origin + path))).status).toBe(200);
    }
    expect(recovery.isClientBillingRecoveryPage("/dashboard/minha-conta")).toBe(true);
    for (const path of ["/dashboard/minha-conta-maliciosa", "/dashboard/agentes", "/dashboard/automacoes", "/dashboard/catalogo", "/dashboard/api"]) expect(recovery.isClientBillingRecoveryPage(path)).toBe(false);
  });
  it("completes admin access and sends the customer to payment recovery without an HTTP 500", async () => {
    const f = fixture();
    const entry = await f.continuation.GET(new NextRequest(`${origin}/auth/continue`));
    expect(entry.status).toBe(303);
    expect(entry.headers.get("location")).toBe("/dashboard");
    const dashboard = await f.proxy.updateSession(new NextRequest(new URL(entry.headers.get("location")!, origin)));
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
    expect(response.headers.get("location")).toBe("/dashboard/meus-produtos");
    expect((await f.proxy.updateSession(new NextRequest(new URL(response.headers.get("location")!, origin)))).status).toBe(200);
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
    for (const path of ["/dashboard/agentes", "/dashboard/automacoes", "/dashboard/integracoes", "/dashboard/api", "/dashboard/catalogo"]) {
      const response = await f.proxy.updateSession(new NextRequest(origin + path));
      expect(response.headers.get("location")).toBe(`${origin}/dashboard/planos?regularizar=1`);
    }
    for (const path of ["/api/dashboard/agents", "/api/dashboard/automations", "/api/dashboard/integrations"]) {
      const api = await f.proxy.updateSession(new NextRequest(origin + path));
      expect(api.status).toBe(402);
      expect(await api.json()).toMatchObject({ code: "billing_access_required" });
      expect((await fixture({ allowed: true }).proxy.updateSession(new NextRequest(origin + path))).status).toBe(200);
    }
    for (const path of ["/api/dashboard/billing/status", "/api/dashboard/meus-produtos"]) {
      expect((await f.proxy.updateSession(new NextRequest(origin + path))).status).toBe(200);
    }
  });

  it("retains normal dashboard access after payment and the admin's own destination", async () => {
    const active = fixture({ allowed: true });
    const entry = await active.continuation.GET(new NextRequest(`${origin}/auth/continue`));
    expect((await active.proxy.updateSession(new NextRequest(new URL(entry.headers.get("location")!, origin)))).status).toBe(200);
    const admin = fixture({ admin: true });
    expect((await admin.continuation.GET(new NextRequest(`${origin}/auth/continue`))).headers.get("location")).toBe("/admin");
  });

  it("still sends an unauthenticated visitor to login", async () => {
    const f = fixture({ authenticated: false });
    const entry = await f.continuation.GET(new NextRequest(`${origin}/auth/continue`));
    const dashboard = await f.proxy.updateSession(new NextRequest(new URL(entry.headers.get("location")!, origin)));
    expect(dashboard.headers.get("location")).toBe(`${origin}/login?next=%2Fdashboard`);
  });
});


it("permits only first-company setup when the authenticated account has no workspace", async () => {
  const f=fixture({workspaceMissing:true});
  for (const [path,method] of [["/dashboard/empresa","GET"],["/api/dashboard/agents","GET"],["/api/dashboard/companies","GET"],["/api/dashboard/companies","POST"]]) {
    expect((await f.proxy.updateSession(new NextRequest(origin+path,{method}))).status).toBe(200);
  }
  for (const method of ["PATCH","DELETE"]) expect((await f.proxy.updateSession(new NextRequest(origin+"/api/dashboard/companies",{method}))).status).toBe(409);
  expect((await f.proxy.updateSession(new NextRequest(origin+"/api/dashboard/agents",{method:"POST"}))).status).toBe(409);
  expect((await f.proxy.updateSession(new NextRequest(origin+"/dashboard"))).headers.get("location")).toBe(origin+"/dashboard/empresa");
  expect((await fixture({workspaceMissing:true,complete:false}).proxy.updateSession(new NextRequest(origin+"/api/dashboard/companies",{method:"POST"}))).status).toBe(428);
  expect((await fixture().proxy.updateSession(new NextRequest(origin+"/api/dashboard/companies",{method:"POST"}))).status).toBe(402);
});
