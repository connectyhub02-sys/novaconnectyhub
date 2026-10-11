import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { readMetaReviewAccess } from "../src/lib/auth/meta-review-access";

const organizationId = "bf240c2b-1be2-4d73-955e-528eec184bd0";
function fixture({ granted = true, admin = false, wrongOrganization = false, member = true, expired = false } = {}) {
  const scopes: unknown[][] = [];
  const insert = vi.fn();
  const q = { select: () => q, eq: (key: string, value: unknown) => { scopes.push([key, value]); return q; }, maybeSingle: async () => ({ data: null, error: null }), insert: (value: unknown) => { insert(value); return q; }, single: async () => ({ data: { id: "review-agent" }, error: null }) };
  const from = vi.fn(() => q);
  const access = vi.fn(async () => { if (!member) throw new Error("Not a member"); });
  const validate = vi.fn(async () => ({ channels: {} }));
  const workspace = { user: { id: "review", app_metadata: granted ? { meta_review: { organization_id: organizationId, expires_at: expired ? "2000-01-01" : "2099-01-01" } } : {} }, profile: { isPlatformAdmin: admin }, organization: { id: wrongOrganization ? "foreign" : organizationId } };
  const route = serverModuleHarness<typeof import("../src/app/api/dashboard/meta-review-agent/route")>("src/app/api/dashboard/meta-review-agent/route.ts", {
    "next/server": { NextResponse },
    "@/lib/supabase/profile": { getCurrentWorkspace: async () => workspace },
    "@/lib/auth/meta-review-access": { readMetaReviewAccess },
    "@/lib/client-os/companies": { requireClientCompanyAccess: access },
    "@/lib/supabase/service": { createServiceClient: () => ({ from }) },
    "@/lib/agents/channel-availability-server": { validateAgentChannelSelection: validate },
    "@/lib/billing/trial": { assertBillableAccess: async () => {} },
  });
  return { route, from, insert, scopes, validate };
}
describe("isolated Meta review editor", () => {
  it.each([{ granted: false }, { admin: true }, { wrongOrganization: true }, { member: false }, { expired: true }])("rejects unauthorized context %j before reading agents", async (options) => {
    const f = fixture(options); expect((await f.route.GET()).status).toBe(403); expect(f.from).not.toHaveBeenCalled();
  });
  it("ignores foreign organization, requires channel validation and enforces private human review", async () => {
    const f = fixture();
    const response = await f.route.POST(new Request("https://example.test/api", { method: "POST", body: JSON.stringify({ organizationId: "foreign", name: "Test", prompt: "Help", paused: true, channelConfig: {} }) }));
    expect(response.status).toBe(200);
    expect(f.insert).toHaveBeenCalledWith(expect.objectContaining({ organization_id: organizationId, status: "paused", requires_human_approval: true, scope: "organization" }));
    expect(f.validate).toHaveBeenCalledWith(expect.anything(), organizationId, {}, undefined);
  });
  it("does not offer webhook or operational activation through its agent endpoint", async () => {
    const f = fixture(); expect((await f.route.POST(new Request("https://example.test/api", { method: "POST", body: JSON.stringify({ action: "webhooks" }) }))).status).toBe(400); expect(f.insert).not.toHaveBeenCalled();
  });
});
