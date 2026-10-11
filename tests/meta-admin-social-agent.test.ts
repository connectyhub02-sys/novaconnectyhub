import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { readFileSync } from "node:fs";
function fixture(admin = true) {
  const scopes: unknown[][] = [];
  const insert = vi.fn();
  let writing = false;
  const q = { select: () => q, eq: (key: string, value: unknown) => { scopes.push([key, value]); return q; },
    maybeSingle: async () => ({ data: null, error: null }),
    insert: (value: unknown) => { writing = true; insert(value); return q; },
    single: async () => ({ data: writing ? { id: "own-agent" } : null, error: null }) };
  const from = vi.fn(() => q);
  const validate = vi.fn(async () => ({ channels: {} }));
  const route = serverModuleHarness<typeof import("../src/app/api/admin/meta/social-agent/route")>("src/app/api/admin/meta/social-agent/route.ts", {
    "next/server": { NextResponse },
    "@/lib/meta/company-access": { getMetaWorkspace: async () => ({ user: { id: "admin" }, profile: { isPlatformAdmin: admin }, organization: { id: "internal" } }) },
    "@/lib/supabase/service": { createServiceClient: () => ({ from }) },
    "@/lib/agents/channel-availability-server": { validateAgentChannelSelection: validate },
    "@/lib/billing/trial": { assertBillableAccess: async () => {} },
  });
  return { route, from, insert, scopes, validate };
}
describe("own Meta admin agent", () => {
  it("rejects a customer before reading any agent", async () => {
    const f = fixture(false); expect((await f.route.GET()).status).toBe(403); expect(f.from).not.toHaveBeenCalled();
  });
  it("ignores a submitted foreign organization and validates the real own channels", async () => {
    const f = fixture();
    expect((await f.route.POST(new Request("https://example.test/api", { method: "POST", body: JSON.stringify({ organizationId: "customer", name: "Own agent", prompt: "Help", channelConfig: { channels: {} } }) }))).status).toBe(200);
    expect(f.scopes).toContainEqual(["organization_id", "internal"]);
    expect(f.insert).toHaveBeenCalledWith(expect.objectContaining({ organization_id: "internal", scope: "organization", requires_human_approval: true }));
    const schema = readFileSync("supabase/migrations/0006_autonomous_company_foundation.sql", "utf8");
    const statuses = schema.match(/create type public\.agent_status as enum \(([^)]+)\)/)![1];
    expect(statuses).toContain(`'${f.insert.mock.calls[0][0].status}'`);
    expect(f.validate).toHaveBeenCalledWith(expect.anything(), "internal", { channels: {} }, undefined);
  });
});
