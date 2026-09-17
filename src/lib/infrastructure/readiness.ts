import "server-only";
import type { HealthCheck, Project, ProjectConfiguration } from "./model";
import { migrationExecution } from "./server";
import { jobsConfigured, jobsRequirement } from "./jobs";

// Only configuration names and fixed diagnostics may leave this boundary.
// A configured token is not evidence that its publisher is actually running.
export function projectConfiguration(project: Project, checks: HealthCheck[], canOperate: boolean): ProjectConfiguration {
  let entries: unknown = [];
  try { entries = JSON.parse(process.env.INFRA_INGEST_KEYS_JSON ?? "[]"); } catch { /* Fail closed. */ }
  const hasScope = (scope: string) => Array.isArray(entries) && entries.some(e => e && e.project === project.id && /^[a-f0-9]{64}$/.test(e.sha256) && /^[a-zA-Z0-9_.-]{1,64}$/.test(e.actor) && Array.isArray(e.scopes) && e.scopes.includes(scope));
  const reporter = { deploy: hasScope("deploy"), telemetry: hasScope("telemetry") };
  const sql = migrationExecution(project.id);
  if (!canOperate) { sql.status = "blocked"; sql.missing.push("INFRA_ADMIN_USER_IDS: incluir o UUID do administrador responsável"); }
  const missing = checks.flatMap(check => check.missing);
  for (const field of ["environment", "app", "supabase", "inngest", "worker", "storage"] as const) {
    if (!project[field] || project[field] === "A confirmar") missing.push(`infra_projects.${field}: cadastrar o destino de ${project.id}`);
  }
  if (!project.topology || project.topology === "unknown") missing.push("infra_projects.topology: definir Vercel, VPS ou proxy");
  if (project.client_access_enabled && !project.organization_id) missing.push("infra_projects.organization_id: vincular organização antes de disponibilizar acesso cliente");
  missing.push(...sql.missing);
  if (!jobsConfigured(project.id)) missing.push(jobsRequirement(project.id));
  if (!reporter.telemetry) missing.push(`INFRA_INGEST_KEYS_JSON: credencial de ${project.id} com escopo telemetry para jobs, tabelas e processos do host`);
  if (project.topology !== "vercel" && !reporter.deploy) missing.push(`INFRA_INGEST_KEYS_JSON: credencial de ${project.id} com escopo deploy para o publicador VPS`);
  const checked = checks.filter(check => check.configuration === "ready").length;
  return { status: !missing.length ? "ready" : checked ? "incomplete" : "blocked", checked, total: checks.length, missing: [...new Set(missing)], sql, reporter };
}
