import { NextResponse } from "next/server";
import { access, audit, failure, getProject, migrationCatalog, migrationExecution, migrationRisk, response } from "@/lib/infrastructure/server";
import { migrationHistory } from "@/lib/infrastructure/database";
import { executionPolicy, sqlHash } from "@/lib/infrastructure/sql-policy";
import { object, keys, readBody, InvalidInput } from "@/lib/infrastructure/validation";
import { createServiceClient } from "@/lib/supabase/service";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ project: string }> }) {
  try {
    const auth = await access();
    if (auth instanceof NextResponse) return auth;
    const { project } = await context.params;
    if (!await getProject(project)) return response({ error: "Projeto não encontrado." }, 404);
    const [migrations, history] = await Promise.all([migrationCatalog(project), migrationHistory(project)]);
    const execution = migrationExecution(project);
    if (history.reason) { execution.status = "blocked"; execution.missing.push(history.reason); }
    for (const migration of migrations) {
      if (history.applied && !history.applied.includes(migration.version) && history.applied.some(v => !/^\d{4,20}$/.test(v) || BigInt(v) >= BigInt(migration.version))) {
        migration.blockers = [...(migration.blockers ?? []), "Versão ausente em histórico que já possui versões posteriores. Reconciliar no host antes de aplicar; não presumir migration pendente."];
      }
    }
    return response({ migrations, execution, history });
  } catch (e) { return failure(e); }
}

export async function POST(request: Request, context: { params: Promise<{ project: string }> }) {
  let actor: string | null = null;
  let projectId: string | null = null;
  try {
    const auth = await access(true);
    if (auth instanceof NextResponse) return auth;
    actor = auth.userId;
    const { project } = await context.params;
    if (!await getProject(project)) return response({ error: "Projeto não encontrado." }, 404);
    projectId = project;
    if (!auth.canOperate || request.headers.get("origin") !== new URL(request.url).origin) {
      await audit(auth.userId, project, "migration_prepare", "denied", "infra_admin_or_origin_required");
      return response({ error: "Exige admin infra e origem autorizada." }, 403);
    }
    const body = object(await readBody(request));
    keys(body, ["version", "name", "sql"]);
    if (typeof body.version !== "string" || !/^\d{4,20}$/.test(body.version) || typeof body.name !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.name) || typeof body.sql !== "string" || !body.sql.trim() || Buffer.byteLength(body.sql) > 60000) throw new InvalidInput("Informe versão numérica (4–20 dígitos), nome sem espaços e SQL de até 60 KB.");
    if ((await migrationCatalog(project)).some(m => m.version === body.version)) {
      await audit(auth.userId, project, "migration_prepare", "denied", "version_exists", body.version);
      return response({ error: "Versão já existe. Crie uma nova versão; SQL preparado é imutável." }, 409);
    }
    const sql = body.sql.replace(/\r\n/g, "\n");
    const blockers = executionPolicy(sql);
    if (blockers.length) {
      await audit(auth.userId, project, "migration_prepare", "blocked", "sql_requires_host_review", body.version, { checksum: sqlHash(sql) });
      return response({ error: blockers.join(" ") }, 422);
    }
    const checksum = sqlHash(sql);
    const { error } = await createServiceClient().rpc("infra_prepare_migration", { p_project: project, p_version: body.version, p_name: body.name, p_sql: sql, p_checksum: checksum, p_actor: auth.userId });
    if (error) return response({ error: "Não foi possível preparar: confira migration 0151 e conflito de versão. Nenhum SQL executado." }, 409);
    return response({ migration: { version: body.version, name: body.name, sql, checksum, risk: migrationRisk(sql), blockers }, message: "Migration preparada e auditada. Revise o SQL antes de confirmar a execução." }, 201);
  } catch (e) {
    if (actor) { try { await audit(actor, projectId, "migration_prepare", "error", "invalid_request_or_dependency_failure"); } catch { return failure(new Error("AUDIT_UNAVAILABLE")); } }
    return failure(e);
  }
}
