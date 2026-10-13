import { beforeEach, expect, it, vi } from "vitest";
import { deletedHostingProjects } from "@/lib/infrastructure/hosting-lifecycle";
const mocks = vi.hoisted(() => ({ deleted: new Set(["immov-ai"]), allowed: true, health: vi.fn(), jobs: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/infrastructure/hosting-lifecycle-server", () => ({ readDeletedHosting: async () => mocks.deleted }));
vi.mock("@/lib/infrastructure/collector", () => ({ collectHealth: mocks.health }));
vi.mock("@/lib/infrastructure/jobs", () => ({ collectJobs: mocks.jobs }));
vi.mock("@/lib/infrastructure/readiness", () => ({ projectConfiguration: () => ({}) }));
vi.mock("@/lib/infrastructure/server", async () => {
  const { NextResponse } = await import("next/server");
  return { access: async () => mocks.allowed ? { canOperate: true } : NextResponse.json({}, { status: 401 }),
    response: (data: unknown) => NextResponse.json(data), failure: () => NextResponse.json({}, { status: 503 }),
    getProject: async (id: string) => ({ id, name: id }) };
});
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: (table: string) => {
  const data = table === "infra_projects" ? [{ id: "immov-ai" }, { id: "vision" }] : [];
  const chain = { select: () => chain, order: () => chain, limit: () => chain, eq: () => chain, neq: () => chain,
    maybeSingle: async () => ({ data: null, error: null }), then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
  return chain;
} }) }));
import { GET as overview } from "@/app/api/admin/infrastructure/route";
import { GET as detail } from "@/app/api/admin/infrastructure/[project]/route";
beforeEach(() => { vi.clearAllMocks(); mocks.allowed = true; mocks.deleted = new Set(["immov-ai"]); mocks.health.mockResolvedValue({ checks: [], telemetry: null }); });
it("separates deleted hosting and never health-checks its removed services", async () => {
  const response = await overview(), data = await response.json();
  expect(response.status).toBe(200);
  expect(data.projects).toEqual([{ id: "vision" }]); expect(data.deletedProjects).toEqual([{ id: "immov-ai" }]);
  expect(mocks.health.mock.calls).toEqual([["vision"]]);
});
it("retains unknown projects instead of hiding them without deletion evidence", async () => {
  mocks.deleted = new Set(); const data = await (await overview()).json();
  expect(data.projects).toHaveLength(2); expect(data.deletedProjects).toEqual([]);
});
it("preserves audit access for deleted projects without querying old health or job endpoints", async () => {
  const response = await detail(new Request("https://example.com/api/admin/infrastructure/immov-ai"), { params: Promise.resolve({ project: "immov-ai" }) });
  expect(response.status).toBe(200); const data = await response.json();
  expect(data.hostingDeleted).toBe(true); expect(data.audit).toEqual([]);
  expect(mocks.health).not.toHaveBeenCalled(); expect(mocks.jobs).not.toHaveBeenCalled();
});
it("keeps the inventory protected", async () => {
  mocks.allowed = false; expect((await overview()).status).toBe(401); expect(mocks.health).not.toHaveBeenCalled();
});
it("requires fresh explicit deletion and zero services; quarantine and malformed states stay visible", () => {
  const now = Date.now(), projects = { deleted: { state: "deleted", services: [] }, active: { state: "active", services: [] }, paused: { state: "paused", services: [] }, quarantined: { state: "quarantined", services: [] }, conflict: { state: "deleted", services: ["running"] }, invalid: { state: "deleted" } };
  const snapshot = { observedAt: new Date(now).toISOString(), projects };
  expect([...deletedHostingProjects(snapshot, now)]).toEqual(["deleted"]);
  for (const raw of [null, {}, { ...snapshot, observedAt: "invalid" }, { ...snapshot, projects: [] }, { ...snapshot, observedAt: new Date(now + 60000).toISOString() }]) expect(deletedHostingProjects(raw, now).size).toBe(0);
  expect(deletedHostingProjects(snapshot, now + 121000).size).toBe(0);
});
