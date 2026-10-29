import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { socialNavigation } from "../src/lib/social/policy";
import { isMetaReviewPath } from "../src/lib/auth/meta-review-access";
function setup(admin = false, role = "owner", review = false) {
  const current = { user: { id: "user" }, profile: { isPlatformAdmin: admin }, organization: { id: "customer" } };
  const billing = vi.fn();
  const mod = serverModuleHarness<typeof import("../src/lib/social/access")>("src/lib/social/access.ts", {
    "@/lib/supabase/profile": { getCurrentWorkspace: async () => current },
    "@/lib/meta/company-access": { getMetaWorkspace: async () => admin ? { ...current, organization: { id: "internal" } } : current, requireMetaCompanyAccess: async ({ companyId }: { companyId: string }) => ({ id: companyId, role }) },
    "@/lib/client-os/dashboard-route-scope": { resolveDashboardCompanyId: ({ workspace, requestedCompanyId }: { workspace: typeof current; requestedCompanyId?: string }) => {
      if (requestedCompanyId && workspace.organization.id !== requestedCompanyId) throw Error("Empresa fora do workspace"); return workspace.organization.id;
    } },
    "@/lib/supabase/service": { createServiceClient: () => ({}) },
    "@/lib/auth/meta-review-access": { readMetaReviewAccess: () => review ? {} : null },
    "@/lib/billing/trial": { assertBillableAccess: billing },
  });
  return { mod, billing };
}
it("keeps platform-owned connections separate from assisted customer access", async () => {
  const { mod } = setup(true);
  expect((await mod.socialAccess("admin")).organizationId).toBe("internal");
  expect((await mod.socialAccess("client")).organizationId).toBe("customer");
  await expect(mod.socialAccess("client", "internal", true)).rejects.toThrow(/workspace/);
  await expect(mod.socialAccess("admin", "customer", true)).rejects.toThrow(/workspace/);
});
it("denies admin shell to a customer", async () => { await expect(setup().mod.socialAccess("admin")).rejects.toThrow(/administrativo/); });
it("allows reading but not mutating connections to a non-manager", async () => {
  const { mod } = setup(false, "member"); expect((await mod.socialAccess("client")).canManage).toBe(false);
  await expect(mod.socialAccess("client", "customer", true)).rejects.toThrow(/gestores/);
});
it("requires billable access for mutations and rejects Meta-only review accounts", async () => {
  const { mod, billing } = setup(); await mod.socialAccess("client", "customer", true); expect(billing).toHaveBeenCalledTimes(1);
  await expect(setup(false, "owner", true).mod.socialAccess("client")).rejects.toThrow(/exclusiva/);
});
it("exposes matching social navigation without widening the Meta review grant", () => {
  expect(socialNavigation("client").map(i => i.label)).toEqual(socialNavigation("admin").map(i => i.label));
  expect(isMetaReviewPath("/dashboard/redes-sociais/publicacoes")).toBe(true);
  expect(isMetaReviewPath("/dashboard/redes-sociais/contas")).toBe(false);
  expect(isMetaReviewPath("/api/dashboard/social/youtube")).toBe(false);
});
