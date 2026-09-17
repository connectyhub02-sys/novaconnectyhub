import "server-only";
import { Client } from "pg";
import { createServiceClient } from "@/lib/supabase/service";

export function projectDatabaseUrl(project: string): string | null {
  try {
    const config = JSON.parse(process.env.INFRA_PROJECT_DATABASE_URLS_JSON ?? "{}");
    const value = Object.hasOwn(config, project) ? config[project] : null;
    if (typeof value !== "string") return null;
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.password || url.search) return null;
    return value;
  } catch { return null; }
}

export function projectDatabase(project: string) {
  const connectionString = projectDatabaseUrl(project);
  if (!connectionString) throw new Error("DATABASE_NOT_CONFIGURED");
  return new Client({ connectionString, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 5000, statement_timeout: 20000, query_timeout: 25000, idle_in_transaction_session_timeout: 30000, application_name: "connectyhub-infra" });
}

export async function migrationHistory(project: string): Promise<{ applied: string[] | null; reason: string | null }> {
  if (project === "connectyhub") {
    const { data, error } = await createServiceClient().rpc("infra_database_status");
    if (!error && Array.isArray(data?.applied)) return { applied: data.applied, reason: null };
    if (!projectDatabaseUrl(project)) return { applied: null, reason: "Aplicar migration 0151: RPC infra_database_status ausente ou sem permissão." };
  }
  if (!projectDatabaseUrl(project)) return { applied: null, reason: `INFRA_PROJECT_DATABASE_URLS_JSON.${project}: conexão PostgreSQL TLS não configurada.` };
  const db = projectDatabase(project);
  try {
    await db.connect();
    const result = await db.query("select version from supabase_migrations.schema_migrations order by version limit 2001");
    if (result.rows.length > 2000) return { applied: null, reason: "Histórico excede 2.000 versões; requer reconciliação no host." };
    return { applied: result.rows.map(r => String(r.version)), reason: null };
  } catch { return { applied: null, reason: "Não foi possível ler supabase_migrations.schema_migrations. Conferir TLS, rede, credencial e permissão SELECT no projeto." }; }
  finally { await db.end().catch(() => {}); }
}
