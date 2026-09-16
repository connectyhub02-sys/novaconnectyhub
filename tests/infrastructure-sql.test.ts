import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; alter default privileges grant all on tables to anon,authenticated,service_role;");
  await db.exec(readFileSync("supabase/migrations/0150_infrastructure_cockpit.sql", "utf8"));
});
afterAll(async () => { await db.close(); });
const event = (id = randomUUID(), overrides = {}) => ({ deployId: id, sequence: 1, stage: "queued", origin: "vps", app: "app-production", currentImage: "betel:old", newImage: "betel:new", container: "running", health: "unknown", code: "started", ...overrides });
async function record(e: unknown, project = "betel", actor = "script:betel-publisher") {
  const result = await db.query<{ value: { error?: string; replay?: boolean } }>("select infra_record_deploy($1,$2,$3::jsonb) value", [project, actor, JSON.stringify(e)]);
  return result.rows[0].value;
}
it("seeds declared inventory without inventing healthy observations", async () => {
  expect((await db.query("select id,topology from infra_projects order by id")).rows).toEqual([{ id: "betel", topology: "vercel_proxy_vps" }, { id: "connectyhub", topology: "vercel" }, { id: "vision", topology: "unknown" }]);
  expect((await db.query("select * from infra_telemetry")).rows).toEqual([]);
});
it("atomically records ordered progress and audit, with one history entry on replay", async () => {
  const e = event();
  expect(await record(e)).toMatchObject({ replay: false });
  expect(await record(e)).toMatchObject({ replay: true });
  expect((await db.query("select * from infra_deploy_events where deploy_id=$1", [e.deployId])).rows).toHaveLength(1);
  expect(await record({ ...e, sequence: 2, stage: "build", code: "progress" })).not.toHaveProperty("error");
  expect(await record({ ...e, sequence: 3, stage: "healthcheck", code: "health_ok", health: "healthy" })).not.toHaveProperty("error");
  expect(await record({ ...e, sequence: 4, stage: "completed", code: "step_ok", health: "healthy" })).not.toHaveProperty("error");
  expect((await db.query("select stage,sequence,finished_at is not null as finished from infra_deployments where id=$1", [e.deployId])).rows).toEqual([{ stage: "completed", sequence: 4, finished: true }]);
  const audits = await db.query<{before_state: unknown; after_state: unknown}>("select before_state,after_state from infra_audit where after_state->>'deployId'=$1", [e.deployId]);
  expect(audits.rows).toHaveLength(4);
  expect(audits.rows[1].before_state).toMatchObject({ stage: "queued" });
});
it("denies project and executor crossover, changed images and conflicting retries", async () => {
  const e = event(); await record(e);
  expect(await record(e, "vision")).toMatchObject({ error: "scope_mismatch" });
  expect(await record(e, "betel", "script:other")).toMatchObject({ error: "scope_mismatch" });
  expect(await record({ ...e, code: "progress" })).toMatchObject({ error: "sequence_conflict" });
  expect(await record({ ...e, sequence: 2, newImage: "other:new", stage: "build" })).toMatchObject({ error: "invalid_transition" });
});
it("rolls back the deployment update if inserting its event fails", async () => {
  const e = event(); await record(e);
  await expect(record({ ...e, sequence: 2, stage: "build", code: "not-allowed" })).rejects.toThrow();
  expect((await db.query("select stage,sequence from infra_deployments where id=$1", [e.deployId])).rows).toEqual([{ stage: "queued", sequence: 1 }]);
  expect((await db.query("select sequence from infra_deploy_events where deploy_id=$1", [e.deployId])).rows).toEqual([{ sequence: 1 }]);
});
it("rejects out-of-order progress and terminal rewrites, supports verified rollback after failure", async () => {
  const e = event();
  expect(await record({ ...e, stage: "build" })).toMatchObject({ error: "invalid_transition" });
  await record(e);
  expect(await record({ ...e, sequence: 3, stage: "build" })).toMatchObject({ error: "invalid_transition" });
  await record({ ...e, sequence: 2, stage: "build" });
  expect(await record({ ...e, sequence: 3, stage: "package" })).toMatchObject({ error: "invalid_transition" });
  expect(await record({ ...e, sequence: 3, stage: "completed" })).toMatchObject({ error: "invalid_transition" });
  await record({ ...e, sequence: 3, stage: "failed", code: "step_failed", health: "error" });
  expect(await record({ ...e, sequence: 4, stage: "build" })).toMatchObject({ error: "invalid_transition" });
  expect(await record({ ...e, sequence: 4, stage: "rollback", code: "progress", health: "unknown" })).not.toHaveProperty("error");
  expect((await db.query("select finished_at from infra_deployments where id=$1", [e.deployId])).rows).toEqual([{ finished_at: null }]);
  expect(await record({ ...e, sequence: 5, stage: "rollback", code: "rollback_ok", health: "healthy" })).not.toHaveProperty("error");
  expect(await record({ ...e, sequence: 6, stage: "build" })).toMatchObject({ error: "invalid_transition" });
});
it("does not let an older snapshot overwrite a newer observation", async () => {
  const ingest = (time: string, payload: object) => db.query<{ recorded: boolean }>("select infra_record_telemetry('betel','script:collector',$1,$2) recorded", [time, JSON.stringify(payload)]);
  expect((await ingest("2026-09-16T12:00:00Z", { version: "v2" })).rows[0].recorded).toBe(true);
  expect((await ingest("2026-09-16T11:59:00Z", { version: "v1" })).rows[0].recorded).toBe(false);
  expect((await db.query("select payload from infra_telemetry where project_id='betel'")).rows).toEqual([{ payload: { version: "v2" } }]);
});
it("denies anonymous/client SQL reads, mutations and RPCs, even with known project UUIDs", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    for (const table of ["infra_projects", "infra_telemetry", "infra_migrations", "infra_deployments", "infra_deploy_events", "infra_audit"]) {
      await expect(db.exec(`select * from ${table}`)).rejects.toThrow("permission denied");
      await expect(db.exec(`delete from ${table}`)).rejects.toThrow("permission denied");
    }
    await expect(record(event())).rejects.toThrow("permission denied");
    await expect(db.exec("select infra_record_telemetry('betel','forged',now(),'{}')")).rejects.toThrow("permission denied");
    await db.exec("reset role");
  }
});
it("service can use RPC but cannot rewrite/delete audit or event history directly", async () => {
  await db.exec("set role service_role");
  expect(await record(event())).not.toHaveProperty("error");
  for (const table of ["infra_deployments", "infra_deploy_events", "infra_audit"]) await expect(db.exec(`delete from ${table}`)).rejects.toThrow("permission denied");
  await db.exec("reset role");
});
