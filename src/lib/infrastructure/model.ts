export const stages = ["queued", "package", "build", "tests", "backup", "switch", "healthcheck", "completed", "failed", "rollback"] as const;
export type Stage = typeof stages[number];
export const stageLabels: Record<Stage, string> = { queued: "Aguardando", package: "Preparando pacote", build: "Buildando imagem", tests: "Testes", backup: "Backup", switch: "Troca de container", healthcheck: "Healthcheck", completed: "Concluído", failed: "Falhou", rollback: "Rollback" };
export const healthValues = ["healthy", "warning", "error", "unknown"] as const;
export type Health = typeof healthValues[number];
export const healthLabels: Record<Health, string> = { healthy: "Saudável", warning: "Atenção", error: "Erro", unknown: "Sem evidência" };
export const origins = ["vercel", "vps", "vercel_proxy_vps", "github_push"] as const;
export type DeployOrigin = typeof origins[number];
export const originLabels: Record<DeployOrigin, string> = { vercel: "Deploy Vercel", vps: "Deploy VPS", vercel_proxy_vps: "Proxy Vercel → VPS", github_push: "Push GitHub (não comprova deploy)" };
export const actions = ["migration_apply", "inngest_pause", "inngest_resume", "inngest_retry", "inngest_resend", "app_rollback"] as const;
export type InfraAction = typeof actions[number];
export const actionLabels: Record<InfraAction, string> = { migration_apply: "Aplicar migration", inngest_pause: "Pausar função", inngest_resume: "Retomar função", inngest_retry: "Reprocessar job", inngest_resend: "Reenviar evento", app_rollback: "Rollback do app" };
export const blockedReason = "Somente leitura: adaptador de execução e credenciais com escopo ainda não habilitados. Nenhuma operação será executada.";
export type Project = { id: string; name: string; company: string; environment: string; topology: DeployOrigin | "unknown"; app: string; supabase: string; inngest: string; worker: string; storage: string };
export type Deployment = { id: string; project_id: string; app: string; origin: DeployOrigin; stage: Stage; current_image: string; new_image: string; executor: string; container: string; health: Health; sequence: number; started_at: string; finished_at: string | null; updated_at: string };
export type DeployEvent = { sequence: number; stage: Stage; code: string; created_at: string; executor: string };
export const eventCodes = ["started", "progress", "step_ok", "step_failed", "health_ok", "health_failed", "rollback_ok"] as const;
export const eventLabels: Record<string, string> = { started: "Publicação iniciada", progress: "Etapa em andamento", step_ok: "Etapa verificada", step_failed: "Etapa falhou; consultar logs privados no host", health_ok: "Healthcheck aprovado", health_failed: "Healthcheck falhou", rollback_ok: "Rollback concluído no host" };
export type Snapshot = {
  services: Record<"app" | "api" | "auth" | "rest" | "storage" | "database" | "inngest" | "worker", Health>;
  version: string; image: string; container: string; rollbackAvailable: boolean | null;
  appliedMigrations: string[] | null;
  appLogs: { code: "process_started" | "process_stopped" | "request_failed" | "health_ok" | "health_failed"; at: string }[];
  tables: { name: string; health: Health; rls: "enabled" | "disabled" | "unknown"; permissions: "verified" | "warning" | "unknown" }[];
  inngest: { functions: { id: string; status: "active" | "paused" | "unknown" }[]; events: { id: string; status: "completed" | "failed" | "running" | "queued"; retries: number }[]; failures: number | null; retries: number | null; queued: number | null; delaySeconds: number | null; workers: number | null };
};
export type Telemetry = { received_at: string; observed_at: string; executor: string; payload: Snapshot };
export type Migration = { version: string; name: string; sql: string; checksum: string };
export type Audit = { id: string; actor: string; action: string; target: string | null; result: string; reason: string; created_at: string; before_state: unknown; after_state: unknown };
export type Overview = { projects: Project[]; telemetry: (Telemetry & { project_id: string })[]; canOperate: boolean };
export type Detail = { project: Project; telemetry: Telemetry | null; deployments: Deployment[]; events: DeployEvent[]; selectedDeployId: string | null; audit: Audit[]; canOperate: boolean; truncated: boolean };

export function stale(telemetry: Telemetry | null | undefined, now = Date.now()) {
  return !telemetry || now - Date.parse(telemetry.observed_at) > 120_000;
}
export function projectHealth(telemetry: Telemetry | null | undefined, now = Date.now()): Health {
  if (stale(telemetry, now)) return "unknown";
  const values = Object.values(telemetry!.payload.services);
  if (values.includes("error")) return "error";
  if (values.includes("warning") || values.includes("unknown")) return "warning";
  return "healthy";
}
