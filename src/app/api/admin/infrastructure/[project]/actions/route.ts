import { NextResponse } from "next/server";
import { access, audit, failure, getProject, migrationCatalog, migrationExecution, response } from "@/lib/infrastructure/server";
import { actions, blockedReason } from "@/lib/infrastructure/model";
import { choice, identifier, keys, object, readBody } from "@/lib/infrastructure/validation";
import { executeMigration } from "@/lib/infrastructure/executor";
import { executionPolicy } from "@/lib/infrastructure/sql-policy";
export const maxDuration = 60;
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
    keys(body, ["action", "target", "confirmation", "checksum", "riskAccepted"]);
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
      if (body.riskAccepted !== migration.checksum) {
        await audit(actor, project, action, "denied", "sql_review_required", target);
        return response({ error: "Confirme a revisão do SQL e dos riscos para este hash." }, 409);
      }
      const blockers = executionPolicy(migration.sql);
      if (blockers.length) {
        await audit(actor, project, action, "blocked", "sql_requires_host_review", target, { checksum: migration.checksum });
        return response({ error: blockers.join(" ") }, 422);
      }
      const execution = migrationExecution(project);
      if (execution.status === "blocked") {
        await audit(actor, project, action, "blocked", "migration_execution_not_configured", target, { version: migration.version, checksum: migration.checksum });
        return response({ error: "Migration preparada, mas a execução está bloqueada por configuração.", execution, risk: migration.risk }, 501);
      }
      const result = await executeMigration(project, actor, migration);
      return response(result, result.status === "error" ? 409 : 200);
    }
    await audit(actor, project, action, "blocked", "execution_adapter_unavailable", target);
    return response({ error: blockedReason }, 501);
  } catch (e) {
    if (actor) { try { await audit(actor, projectId, "operational_attempt", "error", "invalid_request_or_dependency_failure"); } catch { return failure(new Error("AUDIT_UNAVAILABLE")); } }
    return failure(e);
  }
}
