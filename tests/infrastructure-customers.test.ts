import { beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { filterInfrastructureCustomers, primaryCustomerAccounts, type CustomerMembership } from "@/lib/infrastructure/customers";
const m = vi.hoisted(() => ({ auth: vi.fn(), rows: [] as unknown[], ranges: [] as number[], failed: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/infrastructure/server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/infrastructure/server")>("@/lib/infrastructure/server");
  return { ...actual, access: m.auth };
});
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: (table: string) => {
  const chain = { select: () => chain, order: () => chain,
    range: async (start: number, end: number) => { m.ranges.push(start); return { data: m.rows.slice(start, end + 1), error: m.failed ? new Error("DB_SECRET") : null }; },
    in: async () => ({ data: [{ id: "owner-a", full_name: "André", email: "andre@example.test" }], error: null }),
  };
  if (!["organization_members", "profiles"].includes(table)) throw new Error("unexpected table");
  return chain;
} }) }));
import { GET } from "@/app/api/admin/infrastructure/customers/route";
const row = (id: string, owner = "owner-a", name = "Vision"): CustomerMembership => ({ user_id: owner, organizations: { id, name, owner_id: owner, status: "active", plan_code: "custom" } });
beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue({ userId: "admin" }); m.rows = []; m.ranges = []; m.failed = false; });
it("uses the primary titular account and preserves distinct customers with identical names", () => {
  const secondary = row("secondary");
  const teammate = { ...row("team"), user_id: "member" };
  expect(primaryCustomerAccounts([row("primary"), secondary, teammate, row("other", "owner-b")]).map(o => o.id)).toEqual(["primary", "other"]);
});
it("skips archived, internal and missing organizations", () => {
  const archived = row("archived"); archived.organizations!.status = "archived";
  const internal = row("internal"); internal.organizations!.plan_code = "internal";
  expect(primaryCustomerAccounts([archived, internal, { user_id: "none", organizations: null }, row("primary")]).map(o => o.id)).toEqual(["primary"]);
});
it("reads beyond 1000 historical memberships without duplicating or losing customers", async () => {
  m.rows = Array.from({ length: 1005 }, (_, i) => row(`org-${i}`)); m.rows.push(row("last", "owner-b", "Zebra"));
  const response = await GET(); const data = await response.json();
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(m.ranges).toEqual([0, 1000]); expect(data.customers.map((c: { id: string }) => c.id)).toEqual(["org-0", "last"]);
  expect(data.customers[0].owner).toBe("André");
});
it("does not read customer data without admin access and does not return partial data on error", async () => {
  m.auth.mockResolvedValue(NextResponse.json({}, { status: 403 })); expect((await GET()).status).toBe(403); expect(m.ranges).toEqual([]);
  m.auth.mockResolvedValue({ userId: "admin" }); m.failed = true;
  const response = await GET(); expect(response.status).toBe(503); expect(await response.text()).not.toContain("DB_SECRET");
});
it("searches company, titular and email regardless of accents and word order", () => {
  const customers = [{ id: "a", name: "Vision Business Group", owner: "André Sampaio", email: "andre@example.test" }, { id: "b", name: "SP Sapo", owner: "Samuel Afonso", email: "samuel@example.test" }];
  expect(filterInfrastructureCustomers(customers, "andre vision").map(c => c.id)).toEqual(["a"]);
  expect(filterInfrastructureCustomers(customers, "SAMUEL@EXAMPLE.TEST").map(c => c.id)).toEqual(["b"]);
  expect(filterInfrastructureCustomers(customers, "missing")).toEqual([]);
});
