import "server-only";
import { randomUUID } from "node:crypto";
import { projectDatabase } from "./database";
import { audit } from "./server";
import { executionPolicy, sqlHash } from "./sql-policy";
import type { Migration } from "./model";

export type SqlConnection = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

// Target receipt + Supabase history + migration are committed together. The
// database-wide advisory lock serializes requests even across Vercel instances.
export async function applyTransaction(db: SqlConnection, project: string, actor: string, migration: Migration, run: string) {
  if (sqlHash(migration.sql) !== migration.checksum || executionPolicy(migration.sql).length) throw new Error("SQL_POLICY");
  await db.query("begin");
  try {
    await db.query("set local lock_timeout = '5s'");
    await db.query("set local statement_timeout = '20s'");
    await db.query("select pg_advisory_xact_lock(713609160151)");
    // Never infer old migrations from tables, nor create an empty fake history.
    const history = await db.query("select version from supabase_migrations.schema_migrations order by version");
    const alreadyRecorded = history.rows.some(r => r.version === migration.version);
    await db.query("create schema if not exists infra_control");
    await db.query("revoke all on schema infra_control from public");
    await db.query("create table if not exists infra_control.receipts (version text primary key, project_id text not null, actor text not null, checksum text not null, run_id uuid not null, applied_at timestamptz not null default now())");
    const foreign = await db.query("select project_id from infra_control.receipts where project_id <> $1 limit 1", [project]);
    if (foreign.rows.length) throw new Error("PROJECT_DATABASE_MISMATCH");
    const receipt = await db.query("select checksum from infra_control.receipts where version=$1", [migration.version]);
    if (receipt.rows.length) {
      if (receipt.rows[0].checksum !== migration.checksum) throw new Error("CHECKSUM_CONFLICT");
      if (!alreadyRecorded) throw new Error("HISTORY_CONFLICT");
      await db.query("rollback");
      return "already_applied" as const;
    }
    if (alreadyRecorded) throw new Error("ALREADY_APPLIED_LEGACY");
    if (history.rows.some(r => !/^\d{4,20}$/.test(String(r.version)) || BigInt(String(r.version)) >= BigInt(migration.version))) throw new Error("HISTORICAL_GAP_REVIEW");
    await db.query(migration.sql);
    await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)", [migration.version, migration.name, [migration.sql]]);
    await db.query("insert into infra_control.receipts(version,project_id,actor,checksum,run_id) values($1,$2,$3,$4,$5)", [migration.version, project, actor, migration.checksum, run]);
    await db.query("commit");
    return "applied" as const;
  } catch (error) { await db.query("rollback").catch(() => {}); throw error; }
}

export async function executeMigration(project: string, actor: string, migration: Migration) {
  const run = randomUUID();
  const metadata = { run, version: migration.version, checksum: migration.checksum, startedAt: new Date().toISOString() };
  await audit(actor, project, "migration_apply", "running", "execution_started", migration.version, metadata);
  const db = projectDatabase(project);
  let result: string;
  try {
    await db.connect();
    result = await applyTransaction(db, project, actor, migration, run);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const known = ["SQL_POLICY", "PROJECT_DATABASE_MISMATCH", "CHECKSUM_CONFLICT", "HISTORY_CONFLICT", "ALREADY_APPLIED_LEGACY", "HISTORICAL_GAP_REVIEW"];
    const reason = known.includes(code) ? code : "DATABASE_ERROR_OR_OUTCOME_UNKNOWN";
    await audit(actor, project, "migration_apply", "error", reason, migration.version, { ...metadata, finishedAt: new Date().toISOString() });
    return { status: "error", run, message: reason === "ALREADY_APPLIED_LEGACY" ? "Versão já consta no histórico legado. Nenhum SQL reaplicado." : `Execução não confirmada (${reason}). Confira o histórico do banco e o recibo antes de tentar novamente.` };
  } finally { await db.end().catch(() => {}); }
  await audit(actor, project, "migration_apply", result, "execution_confirmed", migration.version, { ...metadata, finishedAt: new Date().toISOString() });
  return { status: result, run, message: result === "applied" ? "Migration aplicada e registrada no banco de destino." : "Migration já aplicada com o mesmo hash; SQL não repetido." };
}
