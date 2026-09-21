import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const owner = randomUUID(), colleague = randomUUID(), outsider = randomUUID();
const org = randomUUID(), otherOrg = randomUUID();

async function asUser<T>(id: string, action: () => Promise<T>) {
  await db.query("select set_config('test.uid',$1,false)", [id]);
  await db.exec("set role authenticated");
  try { return await action(); } finally { await db.exec("reset role"); }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');`);
  await db.exec(readFileSync("supabase/migrations/0001_connectyhub_foundation.sql", "utf8").replace("create extension if not exists pgcrypto;", ""));
  await db.exec("create type billing_provider as enum('elevenlabs');");
  const billing = readFileSync("supabase/migrations/0005_billing_cost_centers.sql", "utf8");
  await db.exec(billing.slice(billing.indexOf("create table if not exists public.customer_voices ("), billing.indexOf("create table if not exists public.generated_media (")));
  await db.exec("alter table customer_voices enable row level security; grant usage on schema public,auth to authenticated,anon; grant select,insert,update,delete on customer_voices to authenticated,anon;");
  await db.exec(readFileSync("supabase/migrations/0042_customer_voice_owner_privacy.sql", "utf8"));
  for (const id of [owner, colleague, outsider]) await db.query("insert into auth.users(id) values($1)", [id]);
  for (const id of [org, otherOrg]) await db.query("insert into organizations(id,name,status) values($1,'Synthetic','active')", [id]);
  for (const [user, company] of [[owner, org], [colleague, org], [outsider, otherOrg]]) {
    await db.query("insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')", [company, user]);
  }
  await db.query("insert into customer_voices(organization_id,owner_user_id,name,status) values($1,$2,'Own clone','ready'),($1,null,'Legacy unassigned','ready'),($3,$4,'Other organization','ready')", [org, owner, otherOrg, outsider]);
}, 30_000);
afterAll(async () => { await db?.close(); });

describe.sequential("strict clone ownership", () => {
  it("removes the legacy unassigned-voice exception", async () => {
    expect((await asUser(colleague, () => db.query("select name from customer_voices"))).rows).toEqual([{ name: "Legacy unassigned" }]);
    await db.exec(readFileSync("supabase/migrations/0160_customer_voice_strict_owner.sql", "utf8"));
    expect((await asUser(colleague, () => db.query("select name from customer_voices"))).rows).toEqual([]);
  });
  it("returns only the owner's clone, and rejects direct cross-user modifications", async () => {
    expect((await asUser(owner, () => db.query("select name from customer_voices"))).rows).toEqual([{ name: "Own clone" }]);
    expect((await asUser(outsider, () => db.query("select name from customer_voices"))).rows).toEqual([{ name: "Other organization" }]);
    expect((await asUser(colleague, () => db.query("update customer_voices set name='stolen' returning id"))).rows).toEqual([]);
    expect((await asUser(colleague, () => db.query("delete from customer_voices returning id"))).rows).toEqual([]);
  });
  it("requires both the current owner and organization membership when creating a clone", async () => {
    const insert = (company: string, user: string | null) => db.query("insert into customer_voices(organization_id,owner_user_id,name) values($1,$2,'New clone') returning id", [company,user]);
    expect((await asUser(owner, () => insert(org,owner))).rows).toHaveLength(1);
    await expect(asUser(owner, () => insert(org,colleague))).rejects.toThrow(/row-level security/);
    await expect(asUser(owner, () => insert(org,null))).rejects.toThrow(/row-level security/);
    await expect(asUser(owner, () => insert(otherOrg,owner))).rejects.toThrow(/row-level security/);
    await expect(asUser(owner, () => db.query("update customer_voices set owner_user_id=$1 where name='Own clone'", [colleague]))).rejects.toThrow(/row-level security/);
  });
  it("does not expose clones to anonymous requests", async () => {
    await db.exec("select set_config('test.uid','',false); set role anon;");
    try { expect((await db.query("select id from customer_voices")).rows).toEqual([]); }
    finally { await db.exec("reset role"); }
  });
});
