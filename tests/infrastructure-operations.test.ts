import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/infrastructure/server", () => ({ audit: vi.fn() }));
import { applyTransaction, type SqlConnection } from "@/lib/infrastructure/executor";
import { executionPolicy, sqlHash } from "@/lib/infrastructure/sql-policy";
import { projectDatabaseUrl } from "@/lib/infrastructure/database";
let db: PGlite;
let connection: SqlConnection;
const migration = (version: string, sql: string) => ({ version, name: "test", sql, checksum: sqlHash(sql), risk: { level: "low" as const, transactional: true, reasons: [] } });
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create table organizations(id uuid primary key); create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]); alter default privileges grant all on tables to anon,authenticated,service_role;");
  await db.exec(readFileSync("supabase/migrations/0150_infrastructure_cockpit.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0151_infrastructure_operations.sql", "utf8"));
  connection = { query: async (sql, params) => params ? db.query(sql, params) : (await db.exec(sql)).at(-1)! };
});
afterAll(async () => { await db.close(); });

it("adds Hora Space with client visibility disabled and preserves tenant isolation", async () => {
  expect((await db.query("select client_access_enabled,organization_id from infra_projects where id='hora-space'")).rows).toEqual([{ client_access_enabled: false, organization_id: null }]);
  expect((await db.query("select has_function_privilege('authenticated','infra_database_status()','EXECUTE') allowed, has_function_privilege('anon','infra_prepare_migration(text,text,text,text,text,text)','EXECUTE') prepare")).rows).toEqual([{ allowed: false, prepare: false }]);
});
it("prepares immutable project-scoped SQL and audit atomically", async () => {
  const args = ["betel", "9998", "example", "create table example(id int)", "a".repeat(64), "operator"];
  await db.query("select infra_prepare_migration($1,$2,$3,$4,$5,$6)", args);
  await expect(db.query("select infra_prepare_migration($1,$2,$3,$4,$5,$6)", args)).rejects.toThrow();
  expect((await db.query("select project_id,actor,after_state->>'checksum' checksum from infra_audit where action='migration_prepare'")).rows).toEqual([{ project_id: "betel", actor: "operator", checksum: "a".repeat(64) }]);
});
it("applies SQL, receipt and history once; repeating an identical version is a no-op", async () => {
  const m = migration("9991", "create table public.operation_test(id int primary key); insert into public.operation_test values(1);");
  expect(await applyTransaction(connection, "betel", "admin-uuid", m, randomUUID())).toBe("applied");
  expect(await applyTransaction(connection, "betel", "admin-uuid", m, randomUUID())).toBe("already_applied");
  expect((await db.query("select * from operation_test")).rows).toEqual([{ id: 1 }]);
  expect((await db.query("select actor,project_id,checksum from infra_control.receipts where version='9991'")).rows).toEqual([{ actor: "admin-uuid", project_id: "betel", checksum: m.checksum }]);
});
it("rolls back all SQL and history on a later statement failure", async () => {
  const m = migration("9992", "create table public.rollback_test(id int); insert into public.missing_table values(1);");
  await expect(applyTransaction(connection, "betel", "admin", m, randomUUID())).rejects.toThrow();
  expect((await db.query("select to_regclass('public.rollback_test') value")).rows).toEqual([{ value: null }]);
  expect((await db.query("select version from supabase_migrations.schema_migrations where version='9992'")).rows).toEqual([]);
});
it("refuses checksum conflict, legacy reapplication and reuse of a database by another project", async () => {
  await expect(applyTransaction(connection, "betel", "admin", migration("9991", "create table x(id int)"), randomUUID())).rejects.toThrow("CHECKSUM_CONFLICT");
  await db.query("insert into supabase_migrations.schema_migrations(version) values('9993')");
  await expect(applyTransaction(connection, "betel", "admin", migration("9993", "create table x(id int)"), randomUUID())).rejects.toThrow("ALREADY_APPLIED_LEGACY");
  await expect(applyTransaction(connection, "betel", "admin", migration("9000", "create table x(id int)"), randomUUID())).rejects.toThrow("HISTORICAL_GAP_REVIEW");
  await expect(applyTransaction(connection, "vision", "admin", migration("9994", "create table x(id int)"), randomUUID())).rejects.toThrow("PROJECT_DATABASE_MISMATCH");
});
it("never executes a modified SQL/hash pair", async () => {
  const m = migration("9995", "create table changed(id int)");
  await expect(applyTransaction(connection, "betel", "admin", { ...m, sql: m.sql + "; drop table operation_test" }, randomUUID())).rejects.toThrow("SQL_POLICY");
});
it("rejects transaction escapes, session commands, dynamic execution and protected ledgers", () => {
  for (const sql of ["create table x(id int); commit;", "end;", "set role postgres;", "DO $$begin null; end$$;", "CALL proc();", "create table infra_control.fake(id int)", "create index concurrently idx on x(id)", "create table x(id text default 'unterminated)"]) expect(executionPolicy(sql).length).toBeGreaterThan(0);
  expect(executionPolicy("-- commit;\ncreate table x(id text default 'commit;'); /* nested /* begin; */ comment */")).toEqual([]);
  expect(executionPolicy("create function public.demo() returns text language sql as $$select 'begin; commit;'$$;")).toEqual([]);
});
it("requires a per-project TLS URL with no SSL overrides or fallback to another project", () => {
  vi.stubEnv("INFRA_PROJECT_DATABASE_URLS_JSON", JSON.stringify({ betel: "postgres://user:secret@db.example/betel", vision: "postgres://user:secret@db.example/vision?sslmode=disable" }));
  expect(projectDatabaseUrl("betel")).toContain("/betel");
  expect(projectDatabaseUrl("vision")).toBeNull();
  expect(projectDatabaseUrl("connectyhub")).toBeNull();
  vi.unstubAllEnvs();
});
