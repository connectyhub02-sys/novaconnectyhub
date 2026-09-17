import { eventCodes, healthValues, origins, stages, type Snapshot } from "./model";

export class InvalidInput extends Error {}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvalidInput("Objeto inválido.");
  return value as Record<string, unknown>;
}
export function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(k => !allowed.includes(k))) throw new InvalidInput("Campo não permitido; não envie logs livres ou segredos.");
}
export function identifier(value: unknown, max = 160): string {
  if (typeof value !== "string" || !value.length || value.length > max || !/^[a-zA-Z0-9_.:/@-]+$/.test(value) || value.includes("://") || /(?:^|[/:])(eyJ|sk[-_]|sb_secret|sbp_|ghp_|github_pat_|AIza|AKIA)/i.test(value)) throw new InvalidInput("Identificador inválido.");
  return value;
}
export function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new InvalidInput("Valor não permitido.");
  return value as T;
}
function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 1_000_000_000) throw new InvalidInput("Contador inválido.");
  return value as number;
}
function list<T>(value: unknown, parser: (v: unknown) => T, max = 100): T[] {
  if (!Array.isArray(value) || value.length > max) throw new InvalidInput("Lista inválida.");
  return value.map(parser);
}
export function uuid(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new InvalidInput("UUID inválido.");
  return value;
}
export function parseDeploy(value: unknown) {
  const v = object(value);
  keys(v, ["kind", "deployId", "sequence", "stage", "origin", "app", "currentImage", "newImage", "container", "health", "code"]);
  const result = { deployId: uuid(v.deployId), sequence: count(v.sequence), stage: choice(v.stage, stages), origin: choice(v.origin, origins), app: identifier(v.app), currentImage: identifier(v.currentImage), newImage: identifier(v.newImage), container: choice(v.container, ["unknown", "running", "stopped", "restarting", "exited"]), health: choice(v.health, healthValues), code: choice(v.code, eventCodes) };
  if (result.sequence < 1) throw new InvalidInput("Sequência começa em 1.");
  if (result.stage === "completed" && result.origin !== "github_push" && result.health !== "healthy") throw new InvalidInput("Conclusão exige healthcheck saudável.");
  if (result.stage === "rollback" && (!(["started", "progress", "rollback_ok"] as string[]).includes(result.code) || (result.code === "rollback_ok" && result.health !== "healthy"))) throw new InvalidInput("Conclusão do rollback exige recuperação verificada.");
  return result;
}
export function parseSnapshot(value: unknown): { observedAt: string; payload: Snapshot } {
  const root = object(value);
  keys(root, ["kind", "observedAt", "payload"]);
  if (typeof root.observedAt !== "string" || !Number.isFinite(Date.parse(root.observedAt)) || Math.abs(Date.now() - Date.parse(root.observedAt)) > 120_000) throw new InvalidInput("Observação fora da janela de dois minutos.");
  const p = object(root.payload);
  keys(p, ["services", "version", "image", "container", "rollbackAvailable", "appliedMigrations", "tables", "inngest", "appLogs"]);
  const services = object(p.services);
  const serviceKeys = ["app", "api", "auth", "rest", "storage", "database", "inngest", "worker"] as const;
  keys(services, [...serviceKeys]);
  const checkedServices = Object.fromEntries(serviceKeys.map(k => [k, choice(services[k], healthValues)])) as Snapshot["services"];
  if (p.rollbackAvailable !== null && typeof p.rollbackAvailable !== "boolean") throw new InvalidInput("Rollback inválido.");
  const i = object(p.inngest);
  keys(i, ["functions", "events", "failures", "retries", "queued", "delaySeconds", "workers"]);
  const nullableCount = (v: unknown) => v === null ? null : count(v);
  return { observedAt: new Date(root.observedAt).toISOString(), payload: {
    services: checkedServices, version: identifier(p.version), image: identifier(p.image), container: choice(p.container, ["unknown", "running", "stopped", "restarting", "exited"]), rollbackAvailable: p.rollbackAvailable,
    appliedMigrations: p.appliedMigrations === null ? null : list(p.appliedMigrations, v => identifier(v, 100), 2000),
    appLogs: list(p.appLogs ?? [], v => { const log = object(v); keys(log, ["code", "at"]); if (typeof log.at !== "string" || !Number.isFinite(Date.parse(log.at)) || Date.parse(log.at) > Date.now() + 120_000) throw new InvalidInput("Horário de log inválido."); return { code: choice(log.code, ["process_started", "process_stopped", "request_failed", "health_ok", "health_failed"]), at: new Date(log.at).toISOString() }; }),
    tables: list(p.tables, v => { const t = object(v); keys(t, ["name", "health", "rls", "permissions"]); return { name: identifier(t.name), health: choice(t.health, healthValues), rls: choice(t.rls, ["enabled", "disabled", "unknown"]), permissions: choice(t.permissions, ["verified", "warning", "unknown"]) }; }),
    inngest: { failures: nullableCount(i.failures), retries: nullableCount(i.retries), queued: nullableCount(i.queued), delaySeconds: nullableCount(i.delaySeconds), workers: nullableCount(i.workers),
      functions: list(i.functions, v => { const f = object(v); keys(f, ["id", "status"]); return { id: identifier(f.id), status: choice(f.status, ["active", "paused", "unknown"]) }; }),
      events: list(i.events, v => { const e = object(v); keys(e, ["id", "status", "retries"]); return { id: identifier(e.id), status: choice(e.status, ["completed", "failed", "running", "queued"]), retries: count(e.retries) }; }) },
  } };
}

// Bound the actual stream too: Content-Length is not trustworthy.
export async function readBody(request: Request | Response): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidInput("Corpo obrigatório.");
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64 * 1024) { await reader.cancel(); throw new InvalidInput("Corpo excede 64 KiB."); }
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch (e) { if (e instanceof InvalidInput) throw e; throw new InvalidInput("JSON inválido."); }
}
