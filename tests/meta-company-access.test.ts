import { describe, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

function setup(admin: boolean, companyId = "internal", active = true) {
  const scoped = vi.fn(async () => { throw new Error("client scope denied"); });
  const client = { from: (table: string) => {
    const filters: Record<string,unknown> = {};
    const query = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      maybeSingle: async () => ({error: null, data: table === "profiles" ? {is_platform_admin: admin} :
        filters.id === "internal" && active ? {id: "internal", name: "Internal", slug: "connectyhub-platform-whatsapp", status: "active",created_at: null} : null}) };
    return query;
  }};
  const accessModule = serverModuleHarness<typeof import("../src/lib/meta/company-access")>("src/lib/meta/company-access.ts", {
    "@/lib/client-os/companies": {requireClientCompanyAccess: scoped},
    "@/lib/supabase/profile": {getCurrentWorkspace: async () => ({user:{id:"owner"},profile:{isPlatformAdmin:admin},organization:{id:companyId}})},
    "@/lib/supabase/service": {createServiceClient: () => client},
  });
  return {accessModule,scoped};
}
describe("Meta internal company access", () => {
  it("allows a verified platform administrator to use only the active internal workspace", async () => {
    expect(await setup(true).accessModule.requireMetaCompanyAccess({userId:"owner",companyId:"internal"})).toMatchObject({id:"internal",role:"owner",planCode:"internal"});
  });
  it.each([[false,"internal",true],[true,"customer",true],[true,"internal",false]] as const)("rejects admin=%s company=%s active=%s", async (admin,id,active) => {
    await expect(setup(admin,id,active).accessModule.requireMetaCompanyAccess({userId:"owner",companyId:id})).rejects.toThrow("client scope denied");
  });
  it("preserves the normal customer membership gate and current workspace",async()=>{
    const f = setup(false,"customer");
    f.scoped.mockResolvedValue({id:"customer",role:"owner"} as never);
    expect(await f.accessModule.requireMetaCompanyAccess({userId:"owner",companyId:"customer"})).toMatchObject({id:"customer"});
    expect((await f.accessModule.getMetaWorkspace())?.organization?.id).toBe("customer");
  });
});
