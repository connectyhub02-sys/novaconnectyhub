import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ workspace: vi.fn(), internal: vi.fn(), access: vi.fn(), billable: vi.fn() }));
vi.mock("@/lib/supabase/profile", () => ({ getCurrentWorkspace: m.workspace }));
vi.mock("@/lib/meta/company-access", () => ({ getMetaWorkspace: m.internal, requireMetaCompanyAccess: m.access }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/billing/trial", () => ({ assertBillableAccess: m.billable }));
vi.mock("@/lib/meta/launch-status", () => ({ metaFeatureLaunchPaused: false }));
import { metaOrganicAccess } from "../src/lib/meta/organic-access";
const request = (id?: string) => new Request(`https://app.test/api/dashboard/meta-organic${id ? `?companyId=${id}` : ""}`);
beforeEach(() => {
  vi.clearAllMocks();
  m.workspace.mockResolvedValue({ user: { id: "user" }, profile: { isPlatformAdmin: false }, organization: { id: "company" } });
  m.internal.mockResolvedValue({ user: { id: "admin" }, profile: { isPlatformAdmin: true }, organization: { id: "internal" } });
  m.access.mockResolvedValue({ id: "company", planCode: "scale", status: "active" });
  m.billable.mockResolvedValue({});
});
describe("publishing tenant authorization", () => {
  it("rejects an unauthenticated request", async () => {
    m.internal.mockResolvedValue(null);
    await expect(metaOrganicAccess(request())).rejects.toMatchObject({ status: 401 });
    expect(m.access).not.toHaveBeenCalled();
  });
  it("blocks cross-tenant reads and writes", async () => {
    await expect(metaOrganicAccess(request("another"))).rejects.toMatchObject({ status: 403 });
    expect(m.access).not.toHaveBeenCalled();
  });
  it("retains the active company when an admin assists a client", async () => {
    m.workspace.mockResolvedValue({ user: { id: "admin" }, profile: { isPlatformAdmin: true }, organization: { id: "company" } });
    expect((await metaOrganicAccess(request("company"))).organizationId).toBe("company");
    expect(m.internal).not.toHaveBeenCalled();
  });
  it("allows only the platform's internal company as an admin exception", async () => {
    m.workspace.mockResolvedValue({ user: { id: "admin" }, profile: { isPlatformAdmin: true }, organization: { id: "company" } });
    expect((await metaOrganicAccess(request("internal"))).organizationId).toBe("internal");
    await expect(metaOrganicAccess(request("another"))).rejects.toMatchObject({ status: 403 });
  });
  it("enforces the plan on the API", async () => {
    m.access.mockResolvedValue({ id: "company", planCode: "starter", status: "active" });
    await expect(metaOrganicAccess(request("company"))).rejects.toMatchObject({ status: 403 });
  });
});
