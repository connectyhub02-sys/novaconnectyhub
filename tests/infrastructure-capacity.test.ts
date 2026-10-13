import { beforeEach, expect, it, vi } from "vitest";
import { capacityAlerts, capacityLevel, capacityStale, parseCapacity, serviceLevel, servicePercent, type CapacitySnapshot } from "@/lib/infrastructure/capacity";

const mock = vi.hoisted(() => ({ user: true, admin: true, read: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/infrastructure/capacity-server", () => ({ readCapacity: mock.read }));
vi.mock("@/lib/infrastructure/credentials", () => ({ infrastructureCredential: async () => "" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mock.user ? { id: "admin" } : null } }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_platform_admin: mock.admin } }) }) }) }) }) }));
import { GET } from "@/app/api/admin/infrastructure/capacity/route";

const sample = (): CapacitySnapshot => ({ version: 1, observedAt: new Date().toISOString(), sampleSeconds: 30, host: "test-vps", cpu: { cores: 8, percent: 40, ioWaitPercent: 1, load1: 5 }, memory: { total: 24e9, used: 14e9, available: 10e9, percent: 58 }, disk: { total: 300e9, used: 285e9, available: 15e9, percent: 95 }, servicesAvailable: true, services: [{ name: "vision-inngest-db", group: "Vision", state: "running", health: "healthy", cpuCores: .25, cpuLimit: .25, memoryUsed: 200e6, memoryLimit: 512e6, throttlePercent: 99 }], history: [] });
beforeEach(() => { vi.clearAllMocks(); mock.user = true; mock.admin = true; mock.read.mockResolvedValue(sample()); });

it("protects all host and cross-project metrics before reading the file", async () => {
  mock.user = false; expect((await GET()).status).toBe(401);
  mock.user = true; mock.admin = false; expect((await GET()).status).toBe(403);
  expect(mock.read).not.toHaveBeenCalled();
  mock.admin = true; const response = await GET();
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("does not leak paths or private read errors", async () => {
  mock.read.mockRejectedValue(new Error("/private/path SECRET"));
  const response = await GET(); expect(response.status).toBe(503); expect(await response.text()).not.toContain("SECRET");
});
it("makes absent, invalid and outdated observations unknown rather than healthy", () => {
  expect(capacityLevel(null, "cpu")).toBe("unknown"); expect(capacityLevel(NaN, "cpu")).toBe("unknown");
  expect(capacityStale(null)).toBe(true);
  expect(capacityStale({ ...sample(), observedAt: "bad" })).toBe(true);
  expect(capacityStale({ ...sample(), observedAt: new Date(Date.now() - 121000).toISOString() })).toBe(true);
  expect(capacityStale({ ...sample(), observedAt: new Date(Date.now() + 31000).toISOString() })).toBe(true);
  expect(serviceLevel(sample().services[0], true)).toBe("unknown");
  expect(capacityAlerts(sample(), true)).toHaveLength(1);
});
it("distinguishes a constrained service from a host with spare capacity", () => {
  const s = sample(); expect(capacityLevel(s.cpu.percent, "cpu")).toBe("comfortable");
  expect(servicePercent(.25, .25)).toBe(100); expect(serviceLevel(s.services[0])).toBe("critical");
  expect(capacityAlerts(s).map(a => a.title).join(" ")).toContain("cota de CPU");
  expect(servicePercent(4, null)).toBeNull(); expect(servicePercent(4, 0)).toBeNull();
});
it("applies exact warning boundaries and treats resource limits separately from health", () => {
  expect(capacityLevel(79.99, "disk")).toBe("comfortable"); expect(capacityLevel(80, "disk")).toBe("attention"); expect(capacityLevel(90, "disk")).toBe("critical");
  expect(capacityLevel(70, "cpu")).toBe("attention");
  expect(serviceLevel({ ...sample().services[0], cpuCores: 0, throttlePercent: 0, health: "unhealthy" })).toBe("critical");
});
it("bounds file contents and strips unrecognized fields from the response", () => {
  expect(parseCapacity({ ...sample(), secret: "PRIVATE" })).not.toHaveProperty("secret");
  expect(() => parseCapacity({ ...sample(), cpu: { ...sample().cpu, percent: 101 } })).toThrow();
  expect(() => parseCapacity({ ...sample(), memory: { ...sample().memory, available: 30e9 } })).toThrow();
  expect(() => parseCapacity({ ...sample(), services: Array(301).fill(sample().services[0]) })).toThrow();
  expect(() => parseCapacity({ ...sample(), host: "user:password@host" })).toThrow();
  expect(parseCapacity({ ...sample(), cpu: { ...sample().cpu, percent: null } }).cpu.percent).toBeNull();
});
