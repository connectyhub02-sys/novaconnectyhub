import "server-only";
import type { Health, HealthCheck, Snapshot, Telemetry } from "./model";
import { createServiceClient } from "@/lib/supabase/service";
import { infrastructureCredential } from "./credentials";

type Service = keyof Snapshot["services"];
export type Check = HealthCheck & { service: Service };
type Config = Partial<Record<Service, string>> & { supabaseUrl?: string; supabaseKey?: string; inngestAuthorization?: string; supabaseProbeTable?: string };
type Observation = { checks: Check[]; telemetry: Telemetry | null };
const cache = new Map<string, { expires: number; pending: Promise<Observation> }>();

async function configuration(project: string): Promise<Config> {
  let projects: Record<string, Config> = {};
  projects = JSON.parse(await infrastructureCredential("INFRA_HEALTH_PROJECTS_JSON") ?? "{}");
  if (!projects || typeof projects !== "object" || Array.isArray(projects)) throw new Error("INVALID_CONFIG");
  const own = projects && Object.hasOwn(projects, project) ? projects[project] : {};
  if (!own || typeof own !== "object" || Array.isArray(own) || Object.values(own).some(v => typeof v !== "string")) throw new Error("INVALID_CONFIG");
  // Public Betel origins verified against its VPS migration records. No key is
  // inherited from ConnectyHub, and HTTP liveness is not job/database evidence.
  if (project === "betel") return { app: "https://betel.connectyhub.com.br/login", supabaseUrl: "https://betel-supabase.connectyhub.com.br", ...own };
  if (project !== "connectyhub") return own;
  return {
    app: `${(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.connectyhub.com.br").replace(/\/$/, "")}/api/health`,
    api: `${(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.connectyhub.com.br").replace(/\/$/, "")}/api/health`,
    inngest: `${process.env.INNGEST_BASE_URL || "https://inngest.connectyhub.com.br"}/health`,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SECRET_KEY,
    ...own,
  };
}

async function probe(service: Service, url: string | undefined, required: string[], headers: Record<string, string> = {}, authSetting?: string): Promise<Check> {
  let health: Health = "unknown";
  let configuration: Check["configuration"] = "missing";
  let missing = required;
  let reason = `Bloqueado por configuração ausente: ${required.join("; ")}.`;
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) throw new Error("CONFIG");
      configuration = "ready"; missing = [];
      const r = await fetch(parsed, { headers, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(4000) });
      await r.body?.cancel();
      health = r.ok ? "healthy" : [401, 403].includes(r.status) ? "warning" : "error";
      if ([401, 403].includes(r.status)) { configuration = "unauthorized"; missing = [authSetting ?? required[0]]; }
      reason = r.ok ? "Endpoint respondeu HTTP 2xx; não comprova execução de jobs nem resultado de negócio." : [401, 403].includes(r.status) ? `HTTP ${r.status}: autenticação pendente. Conferir ${missing.join("; ")} no servidor.` : `Endpoint respondeu HTTP ${r.status}; conferir serviço no host.`;
    } catch { health = "error"; if (configuration !== "ready") { configuration = "invalid"; reason = `URL HTTPS inválida. Corrigir ${required.join("; ")}.`; } else reason = "Falha de conexão ou timeout de 4 s. Conferir rede e serviço no host."; }
  }
  return { service, health, reason, checkedAt: new Date().toISOString(), configuration, missing };
}

async function collect(project: string): Promise<Observation> {
  let config: Config;
  try { config = await configuration(project); } catch {
    return { telemetry: null, checks: (["app", "api", "auth", "rest", "storage", "database", "inngest", "worker"] as Service[]).map(service => ({ service, health: "unknown", configuration: "invalid", missing: [`INFRA_HEALTH_PROJECTS_JSON.${project}: conferir JSON e acesso ao cofre em Admin OS > Manutenção > Infraestrutura (ou ambiente do servidor)`], reason: "Coleta bloqueada: configuração JSON inválida ou cofre indisponível; nenhum endpoint foi consultado.", checkedAt: new Date().toISOString() })) };
  }
  const base = config.supabaseUrl?.replace(/\/$/, "");
  const headers: Record<string, string> = config.supabaseKey ? { apikey: config.supabaseKey, Authorization: `Bearer ${config.supabaseKey}` } : {};
  const table = config.supabaseProbeTable && /^[a-z][a-z0-9_]{0,62}$/.test(config.supabaseProbeTable) ? config.supabaseProbeTable : project === "connectyhub" ? "infra_projects" : null;
  const setting = (key: string) => `INFRA_HEALTH_PROJECTS_JSON.${project}.${key}`;
  const required = (service: Service, usesKey = true) => {
    if (config[service]) return [setting(service)];
    const names = [!base ? project === "connectyhub" ? "NEXT_PUBLIC_SUPABASE_URL" : setting("supabaseUrl") : "", usesKey && !config.supabaseKey ? project === "connectyhub" ? "SUPABASE_SECRET_KEY" : setting("supabaseKey") : ""].filter(Boolean);
    return names.length ? names : [setting(service)];
  };
  const checks = await Promise.all([
    probe("app", config.app, [setting("app")]), probe("inngest", config.inngest, [setting("inngest")], config.inngestAuthorization ? { Authorization: config.inngestAuthorization } : {}, setting("inngestAuthorization")), probe("worker", config.worker, [setting("worker")]),
    probe("auth", config.auth || (base ? `${base}/auth/v1/health` : undefined), required("auth", false), config.auth ? {} : headers, setting("supabaseKey")),
    probe("rest", config.rest || (base && config.supabaseKey ? `${base}/rest/v1/` : undefined), required("rest"), config.rest ? {} : headers, project === "connectyhub" ? "SUPABASE_SECRET_KEY" : setting("supabaseKey")),
    probe("storage", config.storage || (base && config.supabaseKey ? `${base}/storage/v1/bucket` : undefined), required("storage"), config.storage ? {} : headers, project === "connectyhub" ? "SUPABASE_SECRET_KEY" : setting("supabaseKey")),
    probe("database", config.database || (table && base && config.supabaseKey ? `${base}/rest/v1/${table}?select=*&limit=0` : undefined), project === "connectyhub" ? required("database") : [setting("supabaseProbeTable"), ...(!base || !config.supabaseKey ? required("database") : [])], config.database ? {} : headers),
    probe("api", config.api, [setting("api")]),
  ]);
  let database: { applied: string[]; tables: Snapshot["tables"] } | null = null;
  if (project === "connectyhub") {
    try { const r = await createServiceClient().rpc("infra_database_status"); if (!r.error && Array.isArray(r.data?.applied)) database = r.data; } catch { /* Missing schema is shown separately by migration history. */ }
  }
  const observed = checks.some(c => c.health !== "unknown");
  const at = new Date().toISOString();
  return { checks, telemetry: observed ? {
    observed_at: at, received_at: at, executor: "server:http-health",
    payload: { services: Object.fromEntries(checks.map(c => [c.service, c.health])) as Snapshot["services"], version: project === "connectyhub" ? process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown" : "unknown", image: "unknown", container: "unknown", rollbackAvailable: null, appliedMigrations: database?.applied ?? null, appLogs: [], tables: database?.tables ?? [], inngest: { functions: [], events: [], failures: null, retries: null, queued: null, delaySeconds: null, workers: null } },
  } : null };
}

export function collectHealth(project: string) {
  const previous = cache.get(project);
  if (previous && previous.expires > Date.now()) return previous.pending;
  const pending = collect(project);
  cache.set(project, { expires: Date.now() + 30000, pending });
  return pending;
}
