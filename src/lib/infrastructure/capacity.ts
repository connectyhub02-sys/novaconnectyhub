export type CapacityLevel = "comfortable" | "attention" | "critical" | "unknown";
export const capacityLabels: Record<CapacityLevel, string> = { comfortable: "Com folga", attention: "Perto do limite", critical: "No limite", unknown: "Sem leitura atual" };
export type CapacityMetric = "cpu" | "memory" | "disk" | "throttle";
export const capacityThresholds: Record<CapacityMetric, [number, number]> = { cpu: [70, 90], memory: [80, 90], disk: [80, 90], throttle: [20, 50] };
export type CapacityService = { name: string; group: string; state: string; health: string; cpuCores: number | null; cpuLimit: number | null; memoryUsed: number | null; memoryLimit: number | null; throttlePercent: number | null };
export type CapacityPoint = { at: string; cpu: number | null; memory: number; disk: number };
export type CapacitySnapshot = {
  version: 1; observedAt: string; sampleSeconds: number | null; host: string;
  cpu: { cores: number; percent: number | null; ioWaitPercent: number | null; load1: number };
  memory: { total: number; available: number; used: number; percent: number };
  disk: { total: number; used: number; available: number; percent: number };
  services: CapacityService[]; servicesAvailable: boolean; history: CapacityPoint[];
};
export function capacityStale(snapshot: CapacitySnapshot | null, now = Date.now()) {
  const at = Date.parse(snapshot?.observedAt ?? "");
  return !Number.isFinite(at) || now - at > 120_000 || at - now > 30_000;
}
export function capacityLevel(value: number | null, metric: CapacityMetric, unavailable = false): CapacityLevel {
  if (unavailable || value === null || !Number.isFinite(value) || value < 0) return "unknown";
  const [warning, critical] = capacityThresholds[metric];
  return value >= critical ? "critical" : value >= warning ? "attention" : "comfortable";
}
export function servicePercent(used: number | null, limit: number | null) {
  return used === null || limit === null || limit <= 0 ? null : used / limit * 100;
}
export function serviceDisplayName(name: string) {
  if (/buildkit/.test(name)) return "Preparação de publicações";
  if (/inngest.*postgres/.test(name)) return "Banco das automações";
  if (/redis/.test(name)) return "Fila e cache das automações";
  if (/inngest/.test(name)) return "Executor de automações";
  if (/supabase-db|database/.test(name)) return "Banco de dados";
  if (/auth/.test(name)) return "Login e autenticação";
  if (/rest/.test(name)) return "API do banco de dados";
  if (/storage|objects/.test(name)) return "Arquivos e armazenamento";
  if (/studio/.test(name)) return "Painel do banco de dados";
  if (/functions/.test(name)) return "Funções do banco";
  if (/realtime/.test(name)) return "Atualizações em tempo real";
  if (/pooler|supavisor/.test(name)) return "Conexões ao banco";
  if (/meta/.test(name)) return "Administração do banco";
  if (/caddy|envoy|gateway|api-gw/.test(name)) return "Entrada de sites e APIs";
  if (/storefront/.test(name)) return "Site público";
  if (/app/.test(name)) return "Aplicação e painel";
  if (/imgproxy/.test(name)) return "Processamento de imagens";
  if (/relay/.test(name)) return "Áudio e arquivos de IA";
  return "Serviço de apoio";
}
export function serviceLevel(service: CapacityService, unavailable = false): CapacityLevel {
  if (unavailable) return "unknown";
  if (service.health === "unhealthy" || service.state !== "running") return "critical";
  const levels = [capacityLevel(servicePercent(service.cpuCores, service.cpuLimit), "cpu"), capacityLevel(servicePercent(service.memoryUsed, service.memoryLimit), "memory"), capacityLevel(service.throttlePercent, "throttle")];
  if (levels.includes("critical")) return "critical";
  if (levels.includes("attention")) return "attention";
  return service.cpuCores === null || service.memoryUsed === null ? "unknown" : "comfortable";
}
export function capacityAlerts(snapshot: CapacitySnapshot, unavailable = false) {
  if (unavailable) return [{ level: "unknown" as CapacityLevel, title: "A leitura precisa ser atualizada", detail: "Os últimos valores foram preservados. Aguarde a conexão antes de avaliar a capacidade." }];
  const alerts: { level: CapacityLevel; title: string; detail: string }[] = [];
  if (snapshot.cpu.percent === null) alerts.push({ level: "unknown", title: "Medição de CPU em preparação", detail: "São necessárias duas coletas consecutivas. Aguarde a próxima atualização para avaliar o processamento." });
  if (capacityLevel(snapshot.disk.percent, "disk") !== "comfortable") alerts.push({ level: capacityLevel(snapshot.disk.percent, "disk"), title: "Espaço em disco precisa de atenção", detail: "Revise versões antigas e a retenção dos históricos. A limpeza deve preservar dados, backups e versões de recuperação." });
  if (["critical", "attention"].includes(capacityLevel(snapshot.memory.percent, "memory"))) alerts.push({ level: capacityLevel(snapshot.memory.percent, "memory"), title: "Memória com pouca folga", detail: "Confira os serviços que mais consomem memória antes de aumentar a capacidade." });
  if (["critical", "attention"].includes(capacityLevel(snapshot.cpu.percent, "cpu"))) alerts.push({ level: capacityLevel(snapshot.cpu.percent, "cpu"), title: "Processamento elevado", detail: "Observe a tendência: um pico isolado não significa falta permanente de CPU." });
  const limited = snapshot.services.filter(s => (s.throttlePercent ?? 0) >= 20);
  if (limited.length) alerts.push({ level: limited.some(s => (s.throttlePercent ?? 0) >= 50) ? "critical" : "attention", title: `${limited.length} serviço(s) limitado(s) pela cota de CPU`, detail: "Um serviço pode atingir sua própria cota mesmo com folga na VPS. Confira os limites na lista abaixo." });
  const unhealthy = snapshot.services.filter(s => s.health === "unhealthy" || s.state !== "running");
  if (unhealthy.length) alerts.push({ level: "critical", title: `${unhealthy.length} serviço(s) com falha de saúde ou reiniciando`, detail: "Verifique os serviços destacados. O monitor não reinicia nem altera aplicações." });
  if (!snapshot.servicesAvailable) alerts.push({ level: "unknown", title: "Leitura dos serviços indisponível", detail: "Os indicadores gerais da VPS continuam separados da leitura dos serviços." });
  return alerts;
}

// Only an explicit, bounded schema crosses from the host file to the browser.
export function parseCapacity(input: unknown): CapacitySnapshot {
  const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("INVALID_CAPACITY"); return v as Record<string, unknown>; };
  const num = (v: unknown, max = Number.MAX_SAFE_INTEGER): number => { if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max) throw new Error("INVALID_CAPACITY"); return v; };
  const nullable = (v: unknown, max?: number) => v === null ? null : num(v, max);
  const timestamp = (v: unknown) => { if (typeof v !== "string" || v.length > 40 || !Number.isFinite(Date.parse(v))) throw new Error("INVALID_CAPACITY"); return v; };
  const label = (v: unknown) => { if (typeof v !== "string" || !/^[a-zA-Z0-9_.-]{1,128}$/.test(v)) throw new Error("INVALID_CAPACITY"); return v; };
  const data = object(input), cpu = object(data.cpu), memory = object(data.memory), disk = object(data.disk);
  if (data.version !== 1 || typeof data.servicesAvailable !== "boolean" || !Array.isArray(data.services) || data.services.length > 300 || !Array.isArray(data.history) || data.history.length > 120) throw new Error("INVALID_CAPACITY");
  const memoryTotal = num(memory.total), diskTotal = num(disk.total);
  if (!memoryTotal || !diskTotal) throw new Error("INVALID_CAPACITY");
  return {
    version: 1, observedAt: timestamp(data.observedAt), sampleSeconds: nullable(data.sampleSeconds, 120), host: label(data.host),
    cpu: { cores: num(cpu.cores, 1024), percent: nullable(cpu.percent, 100), ioWaitPercent: nullable(cpu.ioWaitPercent, 100), load1: num(cpu.load1) },
    memory: { total: memoryTotal, available: num(memory.available, memoryTotal), used: num(memory.used, memoryTotal), percent: num(memory.percent, 100) },
    disk: { total: diskTotal, available: num(disk.available, diskTotal), used: num(disk.used, diskTotal), percent: num(disk.percent, 100) },
    servicesAvailable: data.servicesAvailable,
    services: data.services.map(v => { const s = object(v); return { name: label(s.name), group: label(s.group), state: label(s.state), health: label(s.health), cpuCores: nullable(s.cpuCores, 1024), cpuLimit: nullable(s.cpuLimit, 1024), memoryUsed: nullable(s.memoryUsed), memoryLimit: nullable(s.memoryLimit), throttlePercent: nullable(s.throttlePercent, 100) }; }),
    history: data.history.map(v => { const p = object(v); return { at: timestamp(p.at), cpu: nullable(p.cpu, 100), memory: num(p.memory, 100), disk: num(p.disk, 100) }; }),
  };
}
