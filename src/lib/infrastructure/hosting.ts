import { capacityStale, serviceDisplayName, type CapacitySnapshot, type CapacityService } from "./capacity";
import type { ProjectStorage } from "./storage";

export type HostingInventory = { observedAt: string; projects: Record<string, { state: string; services: string[] }> };
export type HostingUsage = { observedAt: string | null; stale: boolean; state: string; services: CapacityService[]; cpuCores: number | null; memoryUsed: number | null; storage?: ProjectStorage };
export type CustomerHosting = { id: string; name: string; company: string; organizationId: string; usage: HostingUsage };
export type HostingPreview = { project: string; revision: string; state: string; services: { name: string; running: boolean }[]; volumes: string[]; directories: string[]; actions: string[]; exclusions: string[]; operation?: { id: string; action: string; status: string } };
export const hostingActionLabels: Record<string, string> = { pause: "Pausar", quarantine: "Colocar em quarentena", resume: "Retomar", delete: "Excluir hospedagem" };
export const hostingStateLabels: Record<string, string> = { active: "Em operação", paused: "Pausada", quarantined: "Em quarentena", deleted: "Hospedagem excluída", pending: "Aguardando configuração", error: "Operação requer conferência" };

// Inventory comes from a root-owned, reviewed mapping. Display groups are never an authorization boundary.
export function projectUsage(project: string, capacity: CapacitySnapshot | null, inventory: HostingInventory | null, now = Date.now()): HostingUsage {
  const owner = inventory?.projects[project];
  const stale = !owner || !capacity || capacityStale(capacity, now) || !capacity.servicesAvailable ||
    !Number.isFinite(Date.parse(inventory!.observedAt)) || Math.abs(now - Date.parse(inventory!.observedAt)) > 120_000;
  if (stale) return { observedAt: null, stale: true, state: owner?.state ?? "pending", services: [], cpuCores: null, memoryUsed: null };
  const allowed = new Set(owner.services);
  const services = capacity!.services.filter(s => allowed.has(s.name)).map((s, i) => ({ ...s, name: `${serviceDisplayName(s.name)} ${i + 1}`, group: project }));
  const sum = (key: "cpuCores" | "memoryUsed") => services.length && services.every(s => s[key] !== null) ? services.reduce((a, s) => a + s[key]!, 0) : null;
  return { observedAt: capacity!.observedAt, stale: false, state: owner.state, services, cpuCores: sum("cpuCores"), memoryUsed: sum("memoryUsed") };
}
