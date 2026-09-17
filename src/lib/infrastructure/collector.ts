import "server-only";
import type { Health, Snapshot, Telemetry } from "./model";
import { createServiceClient } from "@/lib/supabase/service";

type Service = keyof Snapshot["services"];
export type Check = { service: Service; health: Health; reason: string; checkedAt: string };
type Config = Partial<Record<Service, string>> & { supabaseUrl?: string; supabaseKey?: string; inngestAuthorization?: string };
type Observation = { checks: Check[]; telemetry: Telemetry | null };
const cache = new Map<string, { expires: number; pending: Promise<Observation> }>();

function configuration(project: string): Config {
  let projects: Record<string, Config> = {};
  try { projects = JSON.parse(process.env.INFRA_HEALTH_PROJECTS_JSON ?? "{}"); } catch { /* Report missing project settings below. */ }
  const own = projects && Object.hasOwn(projects, project) ? projects[project] : {};
  if (project !== "connectyhub") return own ?? {};
  return {
    app: `${(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.connectyhub.com.br").replace(/\/$/, "")}/api/health`,
    api: `${(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.connectyhub.com.br").replace(/\/$/, "")}/api/health`,
    inngest: `${process.env.INNGEST_BASE_URL || "https://inngest.connectyhub.com.br"}/health`,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SECRET_KEY,
    ...own,
  };
}

async function probe(service: Service, url: string | undefined, headers: Record<string, string> = {}): Promise<Check> {
  let health: Health = "unknown";
  let reason = `Configurar INFRA_HEALTH_PROJECTS_JSON.<projeto>.${service} com endpoint de saúde dedicado.`;
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) throw new Error("CONFIG");
      const r = await fetch(parsed, { headers, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(4000) });
      await r.body?.cancel();
      health = r.ok ? "healthy" : [401, 403].includes(r.status) ? "warning" : "error";
      reason = r.ok ? "Endpoint respondeu HTTP 2xx; não comprova execução de jobs nem resultado de negócio." : [401, 403].includes(r.status) ? `HTTP ${r.status}: serviço exige autenticação; saúde interna não verificada.${service === "inngest" ? " Configurar INFRA_HEALTH_PROJECTS_JSON.<projeto>.inngestAuthorization no servidor." : " Conferir credencial do coletor."}` : `Endpoint respondeu HTTP ${r.status}; conferir serviço no host.`;
    } catch { health = "error"; reason = "Falha de conexão, timeout de 4 s ou URL HTTPS inválida. Conferir configuração e serviço."; }
  }
  return { service, health, reason, checkedAt: new Date().toISOString() };
}

async function collect(project: string): Promise<Observation> {
  const config = configuration(project);
  const base = config.supabaseUrl?.replace(/\/$/, "");
  const headers: Record<string, string> = config.supabaseKey ? { apikey: config.supabaseKey, Authorization: `Bearer ${config.supabaseKey}` } : {};
  const checks = await Promise.all([
    probe("app", config.app), probe("inngest", config.inngest, config.inngestAuthorization ? { Authorization: config.inngestAuthorization } : {}), probe("worker", config.worker),
    probe("auth", config.auth || (base ? `${base}/auth/v1/health` : undefined), config.auth ? {} : headers),
    probe("rest", config.rest || (base && config.supabaseKey ? `${base}/rest/v1/` : undefined), config.rest ? {} : headers),
    probe("storage", config.storage || (base && config.supabaseKey ? `${base}/storage/v1/bucket` : undefined), config.storage ? {} : headers),
    probe("database", config.database || (project === "connectyhub" && base && config.supabaseKey ? `${base}/rest/v1/infra_projects?select=id&limit=0` : undefined), config.database ? {} : headers),
    probe("api", config.api),
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
