import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

it("restricts sender preferences to the server and enforces the billing-account boundary", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key);
      create table organizations(id uuid primary key,owner_id uuid,billing_organization_id uuid);
      create table agent_registry(id uuid primary key,organization_id uuid,scope text,metadata jsonb);`);
    await db.exec(readFileSync("supabase/migrations/0120_notification_sender_preferences.sql", "utf8"));
    const owner = randomUUID(), account = randomUUID(), child = randomUUID(), foreign = randomUUID(), agent = randomUUID(), foreignAgent = randomUUID();
    await db.query("insert into organizations values($1,$2,null),($3,$2,$1),($4,$5,null)", [account, owner, child, foreign, randomUUID()]);
    await db.query("insert into agent_registry values($1,$2,'organization','{\"agent_kind\":\"whatsapp\"}'),($3,$4,'organization','{\"agent_kind\":\"whatsapp\"}')", [agent, child, foreignAgent, foreign]);
    await db.query("insert into notification_sender_preferences(organization_id,mode,agent_id) values($1,'agent',$2)", [account, agent]);
    await expect(db.query("update notification_sender_preferences set agent_id=$1 where organization_id=$2", [foreignAgent, account])).rejects.toThrow("NOTIFICATION_SENDER_ACCOUNT_MISMATCH");
    const permissions = await db.query<{ read: boolean; write: boolean }>("select has_table_privilege('authenticated','notification_sender_preferences','SELECT') as read,has_table_privilege('authenticated','notification_sender_preferences','UPDATE') as write");
    expect(permissions.rows[0]).toEqual({ read: false, write: false });
    await db.query("delete from agent_registry where id=$1", [agent]);
    expect((await db.query("select mode,agent_id from notification_sender_preferences")).rows[0]).toEqual({ mode: "agent", agent_id: null });
  } finally { await db.close(); }
});
