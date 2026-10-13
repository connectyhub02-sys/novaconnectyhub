import { expect, it } from "vitest";
import { hostingIndicators, hostingServiceReasons } from "@/lib/infrastructure/hosting-indicators";
import type { HostingUsage } from "@/lib/infrastructure/hosting";
import type { CapacityService } from "@/lib/infrastructure/capacity";
const service = (fields: Partial<CapacityService> = {}): CapacityService => ({ name: "Banco", group: "project", state: "running", health: "healthy", cpuCores: .1, cpuLimit: 1, memoryUsed: 30, memoryLimit: 100, throttlePercent: 0, ...fields });
const usage = (services: CapacityService[], stale = false): HostingUsage => ({ services, stale, state: "active", cpuCores: 4, memoryUsed: 1000, observedAt: new Date().toISOString() });
it("highlights independent bottlenecks instead of averaging away a constrained service", () => {
  const metrics = hostingIndicators(usage([
    service({ name: "CPU", cpuCores: .24, cpuLimit: .25 }),
    service({ name: "Memória", memoryUsed: 95 }),
    service({ name: "Fila", throttlePercent: 70 }),
  ]));
  expect(metrics.cpu.value).toBe(96); expect(metrics.cpu.service?.name).toBe("CPU");
  expect(metrics.memory.value).toBe(95); expect(metrics.memory.service?.name).toBe("Memória");
  expect(metrics.throttle.value).toBe(70); expect(metrics.throttle.service?.name).toBe("Fila");
});
it("does not invent quotas for unbounded services or divide project totals by partial limits", () => {
  const metrics = hostingIndicators(usage([service(), service({ cpuCores: 3.9, cpuLimit: null, memoryUsed: 970, memoryLimit: null })]));
  expect(metrics.cpu.value).toBe(10); expect(metrics.cpu.measured).toBe(1); expect(metrics.cpu.total).toBe(2);
  expect(metrics.memory.value).toBe(30); expect(metrics.memory.measured).toBe(1);
});
it("shows unknown for missing, zero or invalid limits but preserves real zero usage", () => {
  expect(hostingIndicators(usage([service({ cpuLimit: null })])).cpu.value).toBeNull();
  expect(hostingIndicators(usage([service({ cpuLimit: 0 })])).cpu.value).toBeNull();
  expect(hostingIndicators(usage([service({ cpuCores: NaN })])).cpu.value).toBeNull();
  expect(hostingIndicators(usage([service({ cpuCores: 0 })])).cpu.value).toBe(0);
});
it("clears all gauges on stale or empty data, even when previous services remain", () => {
  for (const data of [usage([service()], true), usage([])]) {
    for (const metric of Object.values(hostingIndicators(data))) expect(metric).toEqual({ value: null, service: null, measured: 0, total: 0 });
  }
});
it("preserves readings above 100% and explains throttling separately from average CPU", () => {
  expect(hostingIndicators(usage([service({ cpuCores: 1.1 })])).cpu.value).toBeCloseTo(110);
  expect(hostingServiceReasons(service({ cpuCores: .01, throttlePercent: 85 }))).toEqual(["CPU limitada em 85% dos intervalos da amostra"]);
});
it("explains health failures and each exceeded resource without inventing alerts for unknown metrics", () => {
  expect(hostingServiceReasons(service({ health: "unhealthy", state: "restarting", cpuCores: .95, memoryUsed: 92 }))).toHaveLength(4);
  expect(hostingServiceReasons(service({ cpuLimit: null, memoryLimit: null, throttlePercent: null }))).toEqual([]);
});
