import { NextResponse } from "next/server";
import { access, audit, failure, getProject, migrationCatalog, response } from "@/lib/infrastructure/server";
import { actions, blockedReason } from "@/lib/infrastructure/model";
import { choice, identifier, keys, object, readBody } from "@/lib/infrastructure/validation";
export async function POST(request: Request, context: { params: Promise<{ project: string }> }) {
  let actor: string | null = null;
  let projectId: string | null = null;
  try {
    const auth = await access(true);
    if (auth instanceof NextResponse) return auth;
    actor = auth.userId;
    const { project } = await context.params;
    const entry = await getProject(project);
    if (!entry) { await audit(actor, null, "operational_attempt", "denied", "project_not_found"); return response({ error: "Projeto não encontrado." }, 404); }
    projectId = project;
    // Browser actions require a same-origin request, even with an authenticated cookie.
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      await audit(actor, project, "operational_attempt", "denied", "origin_mismatch");
      return response({ error: "Origem não autorizada." }, 403);
    }
    const body = object(await readBody(request));
    keys(body, ["action", "target", "confirmation", "checksum"]);
    const action = choice(body.action, actions);
    if (!auth.canOperate) {
      await audit(actor, project, action, "denied", "infra_admin_required");
      return response({ error: "Apenas admin infra explicitamente habilitado pode solicitar ações." }, 403);
    }
    const target = identifier(body.target);
    if (body.confirmation !== `${project}:${action}:${target}`) {
      await audit(actor, project, action, "denied", "confirmation_required", target);
      return response({ error: "Confirmação explícita obrigatória para o projeto, ação e alvo." }, 409);
    }
    if (action === "migration_apply") {
      const migration = (await migrationCatalog(project)).find(m => m.version === target);
      if (!migration || body.checksum !== migration.checksum) {
        await audit(actor, project, action, "denied", "migration_not_versioned_or_changed", target);
        return response({ error: "Migration inexistente ou checksum alterado. Reabra o preview." }, 409);
      }
    }
    await audit(actor, project, action, "blocked", "execution_adapter_unavailable", target);
    return response({ error: blockedReason }, 501);
  } catch (e) {
    if (actor) { try { await audit(actor, projectId, "operational_attempt", "error", "invalid_request_or_dependency_failure"); } catch { return failure(new Error("AUDIT_UNAVAILABLE")); } }
    return failure(e);
  }
}
