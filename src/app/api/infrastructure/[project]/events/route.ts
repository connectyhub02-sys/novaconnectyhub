import { createServiceClient } from "@/lib/supabase/service";
import { audit, failure, getProject, ingestionIdentity, response } from "@/lib/infrastructure/server";
import { choice, object, parseDeploy, parseSnapshot, readBody } from "@/lib/infrastructure/validation";
export async function POST(request: Request, context: { params: Promise<{ project: string }> }) {
  let actor = "unauthenticated-script";
  let projectId: string | null = null;
  try {
    const { project } = await context.params;
    const identity = ingestionIdentity(request, project);
    if (!identity) {
      await audit(actor, null, "ingest_attempt", "denied", "invalid_credential");
      return response({ error: "Credencial inválida para este projeto." }, 401);
    }
    actor = identity.actor;
    if (!await getProject(project)) { await audit(actor, null, "ingest_attempt", "denied", "project_not_found"); return response({ error: "Projeto não encontrado." }, 404); }
    projectId = project;
    const body = object(await readBody(request));
    const kind = choice(body.kind, ["deploy", "telemetry"]);
    if (!identity.scopes.includes(kind)) {
      await audit(actor, project, "ingest_attempt", "denied", "scope_missing");
      return response({ error: "Credencial sem este escopo." }, 403);
    }
    const db = createServiceClient();
    if (kind === "deploy") {
      const event = parseDeploy(body);
      const { data, error } = await db.rpc("infra_record_deploy", { p_project: project, p_actor: actor, p_event: event });
      if (error) throw new Error("INGEST_FAILED");
      return response(data, data?.error ? 409 : 200);
    }
    const snapshot = parseSnapshot(body);
    const { data, error } = await db.rpc("infra_record_telemetry", { p_project: project, p_actor: actor, p_observed: snapshot.observedAt, p_payload: snapshot.payload });
    if (error) throw new Error("INGEST_FAILED");
    return response({ recorded: data });
  } catch (e) {
    try { await audit(actor, projectId, "ingest_attempt", "error", "invalid_payload_or_dependency_failure"); } catch { return failure(new Error("AUDIT_UNAVAILABLE")); }
    return failure(e);
  }
}
