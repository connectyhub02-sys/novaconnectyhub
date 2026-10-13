import { beforeEach, expect, it, vi } from "vitest";
import { projectUsage } from "@/lib/infrastructure/hosting";
import type { CapacitySnapshot } from "@/lib/infrastructure/capacity";
const mocks = vi.hoisted(() => ({ user: "user-a" as string | null, membershipError: false, members: ["org-a"], visible: true, usage: vi.fn(), queries: [] as { table: string; filters: [string, unknown][] }[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/infrastructure/hosting-server", () => ({ usageSources: async () => mocks.usage }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mocks.user ? { id: mocks.user } : null } }) } }) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: (table: string) => {
  const query = { table, filters: [] as [string, unknown][] }; mocks.queries.push(query);
  const chain = { select: () => chain, in: (key: string, value: unknown) => { query.filters.push([key, value]); return chain; }, eq: (key: string, value: unknown) => { query.filters.push([key, value]); return chain; }, order: () => chain,
    then: (resolve: (v: unknown) => unknown) => resolve({ error: table === "organization_members" && mocks.membershipError ? new Error("DB_SECRET") : null, data: table === "organization_members" ? mocks.members.map(organization_id => ({ organization_id })) : table === "organizations" ? [{ id: "org-a", name: "Empresa A" }] : mocks.visible ? [{ id: "project-a", name: "A", organization_id: "org-a" }] : [] }) };
  return chain;
} }) }));
import { GET } from "@/app/api/dashboard/infrastructure/route";
beforeEach(() => { mocks.user = "user-a"; mocks.members = ["org-a"]; mocks.visible = true; mocks.membershipError = false; mocks.queries = []; mocks.usage.mockReset().mockReturnValue({ state: "active" }); });
it("rejects anonymous access before reading project inventory", async () => { mocks.user = null; expect((await GET()).status).toBe(401); expect(mocks.queries).toHaveLength(0); });
it("only selects explicitly visible projects in authenticated memberships", async () => {
  const r = await GET(); expect(r.status).toBe(200); expect(r.headers.get("Cache-Control")).toBe("no-store");
  expect(mocks.queries[0].filters).toEqual([["user_id", "user-a"]]);
  expect(mocks.queries.find(q => q.table === "infra_projects")?.filters).toEqual([["organization_id", ["org-a"]], ["client_access_enabled", true]]);
  expect(mocks.usage).toHaveBeenCalledExactlyOnceWith("project-a");
});
it("revocation and no membership clear the result without leaking inventory", async () => {
  mocks.members = []; expect(await (await GET()).json()).toEqual({ projects: [] }); expect(mocks.usage).not.toHaveBeenCalled();
  mocks.members = ["org-a"]; mocks.visible = false; expect(await (await GET()).json()).toEqual({ projects: [] });
});
it("fails closed on membership lookup errors", async () => { mocks.membershipError = true; const r = await GET(); expect(r.status).toBe(503); expect(await r.text()).not.toContain("DB_SECRET"); expect(mocks.usage).not.toHaveBeenCalled(); });
it("never treats a friendly service group as an ownership boundary", () => {
  const now = new Date().toISOString();
  const service = { name: "reviewed-service", group: "Vision", state: "running", health: "healthy", cpuCores: .2, cpuLimit: 1, memoryUsed: 100, memoryLimit: 1000, throttlePercent: 0 };
  const capacity = { observedAt: now, servicesAvailable: true, services: [service, { ...service, name: "another-customer-secret", memoryUsed: 999 }] } as CapacitySnapshot;
  const inventory = { observedAt: now, projects: { vision: { state: "active", services: ["reviewed-service"] } } };
  const result = projectUsage("vision", capacity, inventory);
  expect(result.memoryUsed).toBe(100); expect(result.services).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain("another-customer"); expect(JSON.stringify(result)).not.toContain("reviewed-service");
  expect(projectUsage("unknown", capacity, inventory).stale).toBe(true);
  expect(projectUsage("vision", capacity, { ...inventory, observedAt: "2020-01-01" }).services).toEqual([]);
  expect(projectUsage("vision", { ...capacity, servicesAvailable: false }, inventory).cpuCores).toBeNull();
});
