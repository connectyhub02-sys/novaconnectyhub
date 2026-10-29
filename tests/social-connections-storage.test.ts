import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

const org = "11111111-1111-4111-8111-111111111111", other = "33333333-3333-4333-8333-333333333333", user = "22222222-2222-4222-8222-222222222222";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create table auth.users(id uuid primary key); create table organizations(id uuid primary key);
    insert into auth.users values('${user}'); insert into organizations values('${org}'),('${other}');`);
  await db.exec(readFileSync("supabase/migrations/0220_social_connections.sql", "utf8"));
}, 30000);
beforeEach(async () => { await db.exec("delete from social_oauth_attempts; delete from social_connections;"); });
afterAll(async () => { await db.close(); });
async function attempt(consumed = true, expired = false) {
  await db.query(`insert into social_oauth_attempts values ($1,'youtube',$2,'state','client',now() + interval '${expired ? "-1" : "10"} minutes',${consumed ? "now()" : "null"})`, [org, user]);
}
function complete(organizationId = org) {
  return db.query("select complete_social_oauth($1,$2,'youtube','state','encrypted',array['scope'],'[{\"id\":\"channel\",\"name\":\"Canal\"}]')", [organizationId, user]);
}
it("keeps tokens and OAuth states inaccessible to browser roles, including completion RPC", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      await expect(db.query("select * from social_connections")).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from social_oauth_attempts")).rejects.toThrow(/permission denied/);
      await expect(complete()).rejects.toThrow(/permission denied/);
    } finally { await db.exec("reset role"); }
  }
});
it("atomically consumes the claimed attempt without selecting an account on the user's behalf", async () => {
  await attempt(); await complete();
  const saved = await db.query<{ selected_account_id: string | null; organization_id: string }>("select * from social_connections");
  expect(saved.rows).toHaveLength(1); expect(saved.rows[0].organization_id).toBe(org); expect(saved.rows[0].selected_account_id).toBeNull();
  await expect(complete()).rejects.toThrow(/cancelled/);
});
it.each([[false, false], [true, true]])("rejects unclaimed/expired attempts claimed=%s expired=%s", async (claimed, expired) => {
  await attempt(claimed, expired); await expect(complete()).rejects.toThrow(/cancelled/);
});
it("rejects another organization's attempt", async () => {
  await attempt(); await expect(complete(other)).rejects.toThrow(/cancelled/); await complete();
});
it("does not resurrect a connection after disconnect cancels an in-flight callback", async () => {
  await attempt(); await db.exec("delete from social_oauth_attempts;");
  await expect(complete()).rejects.toThrow(/cancelled/);
  expect((await db.query("select * from social_connections")).rows).toHaveLength(0);
});
it("preserves the previous connection if a replacement authorization was cancelled", async () => {
  await attempt(); await complete(); await attempt();
  await db.exec("delete from social_oauth_attempts;");
  await expect(complete()).rejects.toThrow(/cancelled/);
  expect((await db.query("select * from social_connections")).rows).toHaveLength(1);
});
