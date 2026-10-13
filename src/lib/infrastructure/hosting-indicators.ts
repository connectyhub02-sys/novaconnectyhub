import { capacityLevel, servicePercent, type CapacityService } from "./capacity";
import type { HostingUsage } from "./hosting";

export type HostingIndicator = { value: number | null; service: CapacityService | null; measured: number; total: number };
export function hostingIndicators(usage: HostingUsage) {
  const services = usage.stale ? [] : usage.services;
  const highest = (read: (s: CapacityService) => number | null): HostingIndicator => {
    let value: number | null = null, service: CapacityService | null = null, measured = 0;
    for (const candidate of services) {
      const n = read(candidate);
      if (n === null || !Number.isFinite(n) || n < 0) continue;
      measured++;
      if (value === null || n > value) { value = n; service = candidate; }
    }
    return { value, service, measured, total: services.length };
  };
  return {
    cpu: highest(s => servicePercent(s.cpuCores, s.cpuLimit)),
    memory: highest(s => servicePercent(s.memoryUsed, s.memoryLimit)),
    throttle: highest(s => s.throttlePercent),
  };
}

export function hostingServiceReasons(s: CapacityService) {
  const reasons: string[] = [];
  if (s.health === "unhealthy") reasons.push("Serviço com falha de saúde");
  if (s.state !== "running") reasons.push("Serviço fora de execução");
  const attention = (n: number | null, metric: "cpu" | "memory" | "throttle") => ["critical", "attention"].includes(capacityLevel(n, metric));
  if (attention(servicePercent(s.cpuCores, s.cpuLimit), "cpu")) reasons.push("Uso de CPU próximo da cota");
  if (attention(servicePercent(s.memoryUsed, s.memoryLimit), "memory")) reasons.push("Memória próxima da cota");
  if (attention(s.throttlePercent, "throttle")) reasons.push(`CPU limitada em ${s.throttlePercent!.toFixed(0)}% dos intervalos da amostra`);
  return reasons;
}
