import "server-only";
import { createHash } from "node:crypto";
import { jobActions, type JobAction, type JobsObservation } from "./model";
import { choice, identifier, keys, object, parseSnapshot, readBody } from "./validation";
import { audit } from "./server";

function configuration(project: string) {
  try {
    const all = JSON.parse(process.env.INFRA_JOB_ADAPTERS_JSON ?? "{}");
    const config = Object.hasOwn(all, project) ? all[project] : null;
    if (!config || typeof config.url !== "string" || typeof config.token !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(config.token)) return null;
    const url = new URL(config.url);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return { url, token: config.token };
  } catch { return null; }
}

export const jobsRequirement = (project: string) => `INFRA_JOB_ADAPTERS_JSON.${project}.url e .token: configurar adaptador HTTPS de jobs no host, com leitura e ações autorizadas por projeto. Credencial Inngest isolada no adaptador; health HTTP não habilita comandos.`;
export const jobsConfigured = (project: string) => configuration(project) !== null;

export async function collectJobs(project: string): Promise<JobsObservation> {
  const empty = { revision: null, observedAt: null, actions: [], snapshot: null };
  const config = configuration(project);
  if (!config) return { ...empty, status: "blocked", reason: jobsRequirement(project) };
  try {
    const res = await fetch(config.url, { headers: { Authorization: `Bearer ${config.token}`, "X-Infra-Project": project }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!res.ok) { await res.body?.cancel(); return { ...empty, status: "error", reason: `Adaptador jobs HTTP ${res.status}. Conferir INFRA_JOB_ADAPTERS_JSON.${project}, permissão e processo no host.` }; }
    const body = object(await readBody(res));
    keys(body, ["project", "revision", "observedAt", "actions", "snapshot"]);
    if (body.project !== project || !Array.isArray(body.actions) || body.actions.length > jobActions.length) throw new Error("INVALID_SCOPE");
    // Reuse the strict telemetry contract; never forward provider bodies or logs.
    const parsed = parseSnapshot({ observedAt: body.observedAt, payload: { services: Object.fromEntries(["app", "api", "auth", "rest", "database", "storage", "inngest", "worker"].map(k => [k, "unknown"])), version: "unknown", image: "unknown", container: "unknown", rollbackAvailable: null, appliedMigrations: null, tables: [], inngest: body.snapshot } });
    return { status: "ready", reason: "Leitura autenticada do adaptador de jobs. Ações limitadas às capacidades e alvos informados pelo host.", revision: identifier(body.revision), observedAt: parsed.observedAt, actions: body.actions.map(a => choice(a, jobActions)), snapshot: parsed.payload.inngest };
  } catch { return { ...empty, status: "error", reason: `Adaptador indisponível ou resposta inválida/antiga/de outro projeto. Conferir INFRA_JOB_ADAPTERS_JSON.${project} e contrato do host; nenhuma ação liberada.` }; }
}

export async function executeJobAction(project: string, actor: string, action: JobAction, target: string, revision: unknown) {
  const state = await collectJobs(project);
  if (state.status !== "ready") {
    await audit(actor, project, action, "blocked", "job_adapter_unavailable", target);
    return { status: "blocked", message: state.reason };
  }
  const fn = state.snapshot!.functions.find(f => f.id === target);
  const event = state.snapshot!.events.find(e => e.id === target);
  const eligible = action === "inngest_pause" ? fn?.status === "active" : action === "inngest_resume" ? fn?.status === "paused" : event?.status === "failed";
  if (revision !== state.revision || !state.actions.includes(action) || !eligible) {
    await audit(actor, project, action, "denied", "job_target_state_or_revision_mismatch", target);
    return { status: "blocked", message: "Alvo, estado, capacidade ou revisão mudou. Atualize a lista e confirme novamente. Reenvio/reprocessamento só aceita execução falha." };
  }
  const config = configuration(project)!;
  const operationId = createHash("sha256").update(JSON.stringify([project, action, target, revision])).digest("hex");
  const metadata = { operationId, revision, startedAt: new Date().toISOString() };
  await audit(actor, project, action, "running", "job_action_started", target, metadata);
  let status = "unknown";
  try {
    const res = await fetch(config.url, { method: "POST", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json", "X-Infra-Project": project, "Idempotency-Key": operationId }, body: JSON.stringify({ project, actor, action, target, revision, operationId }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const result = object(await readBody(res));
      keys(result, ["project", "operationId", "status"]);
      if (result.project === project && result.operationId === operationId) status = choice(result.status, ["accepted", "completed", "rejected"]);
    } else await res.body?.cancel();
  } catch { /* An interrupted request may have reached the host; never retry. */ }
  await audit(actor, project, action, status, status === "unknown" ? "job_outcome_unknown_check_host" : "job_adapter_receipt", target, { ...metadata, finishedAt: new Date().toISOString() });
  return { status, operationId, message: status === "completed" ? "Ação concluída conforme recibo do adaptador; confira a nova leitura." : status === "accepted" ? "Ação aceita pelo adaptador; conclusão ainda pendente. Acompanhe execuções e auditoria." : status === "rejected" ? "Adaptador recusou a ação. Confira escopo, revisão e permissão no host." : "Resultado incerto. Confira o recibo no host pelo ID da operação antes de repetir; não houve repetição automática." };
}
