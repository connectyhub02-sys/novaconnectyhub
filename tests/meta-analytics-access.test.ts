import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), metaWorkspace: vi.fn(), access: vi.fn(), billable: vi.fn(), report: vi.fn() }));
vi.mock("@/lib/supabase/profile", () => ({ getCurrentWorkspace: mocks.workspace }));
vi.mock("@/lib/meta/company-access", () => ({ getMetaWorkspace: mocks.metaWorkspace, requireMetaCompanyAccess: mocks.access }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/billing/trial", () => ({ assertBillableAccess: mocks.billable }));
vi.mock("@/lib/meta/launch-status", () => ({ metaFeatureLaunchPaused: false }));
vi.mock("@/lib/meta/ads-analytics", () => ({ getMetaAdsAnalytics: mocks.report }));
import { GET } from "../src/app/api/dashboard/meta-analytics/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.workspace.mockResolvedValue({ user: { id: "user" }, profile: { isPlatformAdmin: false }, organization: { id: "org-a" } });
  mocks.metaWorkspace.mockResolvedValue({ user: { id: "admin" }, profile: { isPlatformAdmin: true }, organization: { id: "internal-org" } });
  mocks.access.mockResolvedValue({ id: "org-a", role: "owner", planCode: "scale", status: "active" });
  mocks.billable.mockResolvedValue({}); mocks.report.mockResolvedValue({ status: "empty", totals: { spend: 0 } });
});
describe("Meta analytics API authorization", () => {
  it("rejects unauthenticated requests before reading any reports", async () => {
    mocks.metaWorkspace.mockResolvedValue(null);
    expect((await GET(new Request("https://app.test/api/dashboard/meta-analytics"))).status).toBe(401);
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("rejects another company even when the requester is a platform administrator", async () => {
    mocks.workspace.mockResolvedValue({ user: { id: "admin" }, profile: { isPlatformAdmin: true }, organization: { id: "org-a" } });
    expect((await GET(new Request("https://app.test/api/dashboard/meta-analytics?companyId=org-b"))).status).toBe(403);
    expect(mocks.access).not.toHaveBeenCalled(); expect(mocks.report).not.toHaveBeenCalled();
  });
  it("does not redirect an assisted client page to the internal workspace", async () => {
    const response = await GET(new Request("https://app.test/api/dashboard/meta-analytics?companyId=org-a&days=7&accountId=act_1"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.metaWorkspace).not.toHaveBeenCalled();
    expect(mocks.report).toHaveBeenCalledWith({}, "org-a", { accountId: "act_1", days: "7", since: null, until: null });
  });
  it("uses only the internal Meta workspace on the admin panel", async () => {
    const response = await GET(new Request("https://app.test/api/dashboard/meta-analytics"));
    expect(response.status).toBe(200); expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.access).toHaveBeenCalledWith({ client: {}, userId: "admin", companyId: "internal-org" });
    expect(mocks.report.mock.calls[0][1]).toBe("internal-org");
  });
  it("enforces the plan at the API, not only in the page", async () => {
    mocks.access.mockResolvedValue({ id: "org-a", role: "owner", planCode: "starter", status: "active" });
    expect((await GET(new Request("https://app.test/api/dashboard/meta-analytics?companyId=org-a"))).status).toBe(403);
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("derives review restrictions from the trusted grant, ignoring browser overrides", async () => {
    const org = "4cd0a6bd-4e3c-4773-a9ef-511c802b48df";
    mocks.workspace.mockResolvedValue({ user: { id: "reviewer", app_metadata: { meta_review: { organization_id: org, expires_at: "2099-01-01T00:00:00Z" } } }, profile: { isPlatformAdmin: false }, organization: { id: org } });
    const response = await GET(new Request(`https://app.test/api/dashboard/meta-analytics?companyId=${org}&selectedAccountOnly=false`));
    expect(response.status).toBe(200);
    expect(mocks.report.mock.calls[0][2].selectedAccountOnly).toBe(true);
  });
});
