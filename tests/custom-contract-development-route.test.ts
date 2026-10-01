import { NextResponse } from "next/server";
import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as development from "@/lib/billing/contract-development";
import * as entitlements from "@/lib/billing/plan-entitlements";

function setup(allowed = true) {
  const rpc = vi.fn(async () => ({ data: { id: "contract" }, error: null }));
  const api = serverModuleHarness<typeof import("../src/app/api/admin/custom-contracts/route")>("src/app/api/admin/custom-contracts/route.ts", {
    "next/server": { NextResponse },
    "@/lib/supabase/admin-auth": { requirePlatformAdmin: async () => allowed ? { userId: "admin" } : NextResponse.json({ error: "Acesso negado" }, { status: 403 }) },
    "@/lib/supabase/service": { createServiceClient: () => ({ rpc }) },
    "@/lib/billing/plan-entitlements": entitlements,
    "@/lib/billing/contract-development": development,
  });
  return { api, rpc };
}
function request(development_scope?: unknown) {
  return new Request("https://example.test/api/admin/custom-contracts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: "account", name: "Plataforma", base_plan_code: "scale", monthly_price_brl: 10000, included_credits: 5000, effective_at: new Date(Date.now() + 60000).toISOString(), first_period_end: new Date(Date.now() + 31 * 86400000).toISOString(), features: {}, resource_limits: {}, development_scope }) });
}
it("passes normalized development terms to the existing administrative RPC", async () => {
  const h = setup();
  expect((await h.api.POST(request({ project_name: " Plataforma ", description: "Vendas e atendimento" }))).status).toBe(200);
  expect(h.rpc).toHaveBeenCalledWith("save_custom_contract", expect.objectContaining({ p_actor: "admin", p_organization: "account", p_terms: expect.objectContaining({ monthly_price_brl: 10000, development_scope: expect.objectContaining({ project_name: "Plataforma", description: "Vendas e atendimento" }) }) }));
});
it("rejects incomplete project descriptions before writing", async () => {
  const h = setup();
  expect((await h.api.POST(request({ project_name: "Plataforma" }))).status).toBe(422);
  expect(h.rpc).not.toHaveBeenCalled();
});
it("preserves contracts without development and denies non-admin writes", async () => {
  const h = setup();
  expect((await h.api.POST(request())).status).toBe(200);
  expect(h.rpc).toHaveBeenCalledWith("save_custom_contract", expect.objectContaining({ p_terms: expect.objectContaining({ development_scope: null }) }));
  const denied = setup(false);
  expect((await denied.api.POST(request())).status).toBe(403);
  expect(denied.rpc).not.toHaveBeenCalled();
});
