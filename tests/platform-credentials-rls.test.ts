import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { maintenanceIntegrations } from "@/lib/maintenance-vault";

let db: PGlite;
const admin = randomUUID();
const owner = randomUUID();
const outsider = randomUUID();
const activeOrg = randomUUID();
const expiredOrg = randomUUID();
const migration = readFileSync("supabase/migrations/0159_platform_credential_contract_guard.sql", "utf8");

async function asUser<T>(id: string, action: () => Promise<T>): Promise<T> {
  await db.query("select set_config('test.uid',$1,false)", [id]);
  await db.exec("set role authenticated");
  try { return await action(); }
  finally { await db.exec("reset role"); }
}

async function insertCredential(scope: string, org: string | null, integration = "gemini", env = "GEMINI_API_KEY") {
  return db.query(`insert into integration_credentials
    (scope,organization_id,integration_id,env_name,label,encrypted_value,value_preview,value_hash)
    values ($1,$2,$3,$4,'Synthetic test','synthetic-ciphertext','masked','synthetic-hash') returning id`,
  [scope, org, integration, env]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');`);
  await db.exec(readFileSync("supabase/migrations/0001_connectyhub_foundation.sql", "utf8")
    .replace("create extension if not exists pgcrypto;", ""));
  await db.exec(readFileSync("supabase/migrations/0004_integration_credentials_uniqueness.sql", "utf8"));
  // Contract business logic has its own suite. Exercise the actual membership
  // guard here with active/expired contract decisions and real RLS policies.
  await db.exec(`create function resolve_organization_contract_access(org uuid) returns jsonb
    language sql stable security definer set search_path=public as $$
      select jsonb_build_object('allowed',status='active') from organizations where id=org
    $$;`);
  const contractSql = readFileSync("supabase/migrations/0083_contract_access.sql", "utf8");
  await db.exec(contractSql.slice(contractSql.indexOf("create or replace function public.can_operate_organization("),
    contractSql.indexOf("create or replace function public.suspend_expired_platform_contract(")));
  const guardSql = readFileSync("supabase/migrations/0087_operational_access_guards.sql", "utf8");
  await db.exec(guardSql.slice(guardSql.indexOf("do $$ declare t record;"), guardSql.indexOf("-- Credit grants")));
  await db.exec("grant usage on schema public,auth to authenticated,anon; grant select,insert,update,delete on integration_credentials to authenticated,anon;");
  for (const id of [admin, owner, outsider]) await db.query("insert into auth.users(id) values ($1)", [id]);
  await db.query("update profiles set is_platform_admin=true where id=$1", [admin]);
  for (const [id, status] of [[activeOrg, "active"], [expiredOrg, "expired"]]) {
    await db.query("insert into organizations(id,name,status) values ($1,'Test organization',$2)", [id, status]);
    await db.query("insert into organization_members(organization_id,user_id,role) values ($1,$2,'owner')", [id, owner]);
  }
}, 30_000);
afterAll(async () => { await db?.close(); });

describe.sequential("platform vault contract guard", () => {
  it("reproduces the reported RLS error before the migration", async () => {
    await expect(asUser(admin, () => insertCredential("platform", null))).rejects.toThrow(/row-level security/);
    await db.exec(migration);
  });

  it.each(maintenanceIntegrations.map(integration => [integration.id, integration.fields] as const))(
    "allows an admin without organization or contract to rotate every %s field", async (integration, fields) => {
      await asUser(admin, async () => {
        for (const field of fields) {
          const inserted = await insertCredential("platform", null, integration, field.env);
          const id = (inserted.rows[0] as { id: string }).id;
          const updated = await db.query("update integration_credentials set encrypted_value='replacement-ciphertext' where id=$1 returning id", [id]);
          expect(updated.rows).toHaveLength(1);
          expect((await db.query("select encrypted_value from integration_credentials where id=$1", [id])).rows)
            .toEqual([{ encrypted_value: "replacement-ciphertext" }]);
          expect((await db.query("delete from integration_credentials where id=$1 returning id", [id])).rows).toHaveLength(1);
        }
      });
    },
  );

  it("keeps global credentials hidden and immutable for customers and anonymous users", async () => {
    await asUser(admin, () => insertCredential("platform", null));
    for (const id of [owner, outsider]) {
      await asUser(id, async () => {
        expect((await db.query("select id from integration_credentials where scope='platform'")).rows).toHaveLength(0);
        expect((await db.query("update integration_credentials set encrypted_value='forbidden' where scope='platform' returning id")).rows).toHaveLength(0);
        expect((await db.query("delete from integration_credentials where scope='platform' returning id")).rows).toHaveLength(0);
        await expect(insertCredential("platform", null, "elevenlabs", "ELEVENLABS_API_KEY")).rejects.toThrow(/row-level security/);
      });
    }
    await db.query("select set_config('test.uid','',false)");
    await db.exec("set role anon");
    try {
      expect((await db.query("select id from integration_credentials")).rows).toHaveLength(0);
      await expect(insertCredential("platform", null)).rejects.toThrow(/row-level security/);
    } finally { await db.exec("reset role"); }
  });

  it("preserves active tenant access, expired-contract restrictions and tenant isolation", async () => {
    await asUser(owner, () => insertCredential("organization", activeOrg));
    await expect(asUser(owner, () => insertCredential("organization", expiredOrg))).rejects.toThrow(/row-level security/);
    await expect(asUser(outsider, () => insertCredential("organization", activeOrg))).rejects.toThrow(/row-level security/);
    await expect(asUser(admin, () => insertCredential("organization", activeOrg))).rejects.toThrow(/row-level security/);
    await db.query("update organizations set status='expired' where id=$1", [activeOrg]);
    await asUser(owner, async () => {
      expect((await db.query("select id from integration_credentials where scope='organization'")).rows).toHaveLength(0);
      expect((await db.query("update integration_credentials set encrypted_value='forbidden' where scope='organization' returning id")).rows).toHaveLength(0);
    });
  });

  it("does not allow malformed platform scope or changing a global credential to a tenant", async () => {
    await expect(asUser(admin, () => insertCredential("platform", activeOrg))).rejects.toThrow(/row-level security/);
    await expect(asUser(admin, () => db.query("update integration_credentials set scope='organization',organization_id=$1 where scope='platform'", [activeOrg])))
      .rejects.toThrow(/row-level security/);
  });
});
