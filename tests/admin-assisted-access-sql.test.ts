import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
let db: PGlite;
let admin: string, client: string, org: string, origin: string, target: string;
const hash = "a".repeat(64);
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key,banned_until timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    create table profiles(id uuid primary key,is_platform_admin boolean,full_name text);
    grant select,insert,update on profiles to authenticated;
    create table organizations(id uuid primary key,plan_code text,slug text);
    create table organization_members(user_id uuid,organization_id uuid,role text);
    create table reset_calls(org uuid,lead uuid,actor uuid,confirmed boolean);
    create function reset_lead_data(uuid,uuid,uuid,boolean) returns jsonb language plpgsql security definer as $$
      begin insert into reset_calls values($1,$2,$3,$4); return '{"deleted":true,"complete":true}'::jsonb; end $$;`);
  await db.exec(readFileSync("supabase/migrations/0146_admin_assisted_lead_reset.sql", "utf8"));
  [admin,client,org,origin,target] = Array.from({ length: 5 }, () => randomUUID());
  await db.query("insert into auth.users(id) values($1),($2)",[admin,client]);
  await db.query("insert into profiles(id,is_platform_admin) values($1,true),($2,false)",[admin,client]);
  await db.query("insert into auth.sessions values($1,$2,null),($3,$4,null)",[origin,admin,target,client]);
  await db.query("insert into organizations values($1,'pro','customer')",[org]);
  await db.query("insert into organization_members values($1,$2,'owner')",[client,org]);
  await db.query("insert into admin_assisted_sessions(token_hash,admin_user_id,admin_session_id,target_user_id,target_session_id,organization_id) values($1,$2,$3,$4,$5,$6)",[hash,admin,origin,client,target,org]);
});
afterEach(async () => { await db.close(); });
const check = (overrides: unknown[] = []) => db.query<{access: unknown}>("select check_admin_assisted_session($1,$2,$3,$4) access", [hash,target,client,org].map((v,i) => overrides[i] ?? v));
const reset = (confirm = true) => db.query("select reset_lead_data_assisted($1,$2,$3,$4,$5,$6)",[hash,target,client,org,randomUUID(),confirm]);
it("allows originating platform admin with matching assisted client and records the real actor", async () => {
  expect((await check()).rows[0].access).toMatchObject({adminUserId:admin}); await reset();
  expect((await db.query("select actor,org,confirmed from reset_calls")).rows).toEqual([{actor:admin,org,confirmed:true}]);
  await expect(reset(false)).rejects.toThrow("RESET_CONFIRMATION_REQUIRED");
});
it.each([
  ["owner without platform admin", "update profiles set is_platform_admin=false"],
  ["admin membership without platform admin", "update profiles set is_platform_admin=false; update organization_members set role='admin'"],
  ["ordinary user without platform admin", "update profiles set is_platform_admin=false; update organization_members set role='member'"],
  ["expired assisted session", "update admin_assisted_sessions set started_at=now()-interval '1 hour',expires_at=now()-interval '30 minutes'"],
  ["ended assisted session", "update admin_assisted_sessions set revoked_at=now()"],
  ["deleted originating Auth session", "delete from auth.sessions where user_id in (select id from profiles where is_platform_admin)"],
  ["deleted target Auth session", "delete from auth.sessions where user_id in (select id from profiles where not is_platform_admin)"],
  ["expired Auth sessions", "update auth.sessions set not_after=now()-interval '1 minute'"],
  ["banned originator", "update auth.users set banned_until=now()+interval '1 day' where id in (select id from profiles where is_platform_admin)"],
  ["banned target", "update auth.users set banned_until=now()+interval '1 day' where id in (select id from profiles where not is_platform_admin)"],
  ["removed tenant membership", "delete from organization_members"],
  ["internal organization", "update organizations set plan_code='internal'"],
  ["platform attendance", "update organizations set slug='connectyhub-platform-whatsapp'"],
  ["platform admin as target", "update profiles set is_platform_admin=true"],
])("denies %s before entering deletion", async (_name, mutation) => {
  await db.exec(mutation); expect((await check()).rows[0].access).toBeNull();
  await expect(reset()).rejects.toThrow("RESET_ASSISTED_ACCESS_REQUIRED");
  expect((await db.query("select * from reset_calls")).rows).toEqual([]);
});
it("rejects forged token, another client login, wrong user and divergent tenant", async () => {
  for (const args of [["b".repeat(64)], [hash,randomUUID()], [hash,target,admin], [hash,target,client,randomUUID()]]) {
    expect((await check(args)).rows[0].access).toBeNull();
  }
});
it("denies direct backend calls and capability forgery even with valid identifiers", async () => {
  for (const role of ["anon","authenticated"]) {
    await db.exec(`set role ${role}`);
    await expect(check()).rejects.toThrow("permission denied"); await expect(reset()).rejects.toThrow("permission denied");
    await expect(db.query("select reset_lead_data($1,$2,$3,true)",[org,randomUUID(),admin])).rejects.toThrow("permission denied");
    await expect(db.exec("select * from admin_assisted_sessions")).rejects.toThrow("permission denied");
    await expect(db.exec("update admin_assisted_sessions set revoked_at=null")).rejects.toThrow("permission denied");
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  await expect(db.query("select reset_lead_data($1,$2,$3,true)",[org,randomUUID(),admin])).rejects.toThrow("permission denied"); await reset();
});
it("blocks client promotion on UPDATE and INSERT while allowing ordinary profile edits", async () => {
  await db.exec("set role authenticated");
  await expect(db.query("update profiles set is_platform_admin=true where id=$1",[client])).rejects.toThrow("PLATFORM_ADMIN_ASSIGNMENT_SERVER_ONLY");
  await expect(db.query("insert into profiles(id,is_platform_admin) values($1,true)",[randomUUID()])).rejects.toThrow("PLATFORM_ADMIN_ASSIGNMENT_SERVER_ONLY");
  await db.query("update profiles set full_name='Updated name' where id=$1",[client]);
  expect((await db.query("select is_platform_admin from profiles where id=$1",[client])).rows).toEqual([{is_platform_admin:false}]);
});
