import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
let db: PGlite;
const org = randomUUID(), other = randomUUID(), owner = randomUUID(), sub = randomUUID(), old = randomUUID(), active = randomUUID();
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table organizations(id uuid primary key,owner_id uuid);
    create table organization_members(organization_id uuid,user_id uuid,role text);
    create table organization_subscriptions(id uuid primary key,organization_id uuid);
    create table billing_asaas_card_vault(id uuid primary key,organization_id uuid,subscription_id uuid,status text,selectable boolean);
    create table credit_topup_policies(organization_id uuid,card_method_id uuid,enabled boolean);
    create table billing_card_attempts(organization_id uuid,state text);
    create table platform_customer_journey(user_id uuid,event_key text unique,event_type text,source_id uuid,payload jsonb);
    create table usage_events(organization_id uuid,status text,feature_code text,connecty_charge_credits numeric,occurred_at timestamptz,created_at timestamptz);
    create table wallet_alert_state(organization_id uuid,reference_credits numeric);`);
  await db.exec(readFileSync("supabase/migrations/0212_account_billing_clarity.sql", "utf8"));
  await db.query("insert into organizations values ($1,$2),($3,$3)", [org, owner, other]);
  await db.query("insert into organization_subscriptions values ($1,$2)", [sub, org]);
  await db.query("insert into billing_asaas_card_vault values ($1,$2,$3,'inactive',true),($4,$2,$3,'active',true)", [old, org, sub, active]);
}, 30000);
afterAll(() => db.close());
const remove = (method = old, actor = owner, organization = org) => db.query("select remove_saved_billing_card($1,$2,$3,$4)", [organization, actor, sub, method]);
it("aggregates over 1000 events, honors Brazil midnight, status and organization boundaries", async () => {
  await db.query("insert into usage_events select $1,'completed','llm',1,'2026-10-26T03:00:00Z','2026-10-26T03:00:00Z' from generate_series(1,1501)", [org]);
  await db.query("insert into usage_events values ($1,'completed','voice',20,'2026-10-26T02:59:59Z',null),($1,'failed','llm',500,'2026-10-26T04:00:00Z',null),($2,'completed','llm',9999,'2026-10-26T04:00:00Z',null),($1,'completed','llm',999,'2026-09-01T04:00:00Z',null),($1,'completed','llm',5,null,'2026-10-26T04:00:00Z')", [org, other]);
  const result = (await db.query<{ r: { totalChargeCredits30d: number; todayChargeCredits: number; eventCount30d: number; features: unknown[] } }>("select account_usage_totals($1,'2026-10-26T18:00:00Z') r", [org])).rows[0].r;
  expect(result.totalChargeCredits30d).toBe(1526);
  expect(result.todayChargeCredits).toBe(1506);
  expect(result.eventCount30d).toBe(1503);
  expect(result.features).toHaveLength(2);
});
it("blocks removal of the default, an authorized topup card, and a card during an uncertain payment", async () => {
  await expect(remove(active)).rejects.toThrow("CARD_IN_USE");
  await db.query("insert into credit_topup_policies values ($1,$2,true)", [org, old]);
  await expect(remove()).rejects.toThrow("CARD_IN_USE");
  await db.exec("delete from credit_topup_policies");
  await db.query("insert into billing_card_attempts values ($1,'unknown')", [org]);
  await expect(remove()).rejects.toThrow("CARD_PAYMENT_BUSY");
  await db.exec("delete from billing_card_attempts");
});
it("rejects unauthorized actors and cross-organization cards", async () => {
  await expect(remove(old, other)).rejects.toThrow("CARD_FORBIDDEN");
  await expect(remove(old, other, other)).rejects.toThrow("CARD_NOT_FOUND");
});
it("removes only selection, preserves the record, and replays without duplicate audit or charge", async () => {
  await remove(); await remove();
  expect((await db.query("select status,selectable from billing_asaas_card_vault where id=$1", [old])).rows).toEqual([{ status: "inactive", selectable: false }]);
  expect((await db.query("select * from platform_customer_journey")).rows).toHaveLength(1);
  expect((await db.query("select * from billing_card_attempts")).rows).toHaveLength(0);
  expect((await db.query("select selectable from billing_asaas_card_vault where id=$1", [active])).rows).toEqual([{ selectable: true }]);
});
it("restricts aggregate and mutation RPCs to the server", async () => {
  const result = await db.query("select has_function_privilege('authenticated','account_usage_totals(uuid,timestamptz)','EXECUTE') summary, has_function_privilege('anon','remove_saved_billing_card(uuid,uuid,uuid,uuid)','EXECUTE') removal");
  expect(result.rows).toEqual([{ summary: false, removal: false }]);
});
