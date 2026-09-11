import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create table agent_registry(id uuid primary key,organization_id uuid,metadata jsonb);
    create table intelligence_memory(id uuid primary key,organization_id uuid,scope text,memory_type text,metadata jsonb);
    create table customer_agenda_resources(id uuid primary key,organization_id uuid,kind text);
    create table sales_catalog_import_jobs(default_sales_destination text);
    create table sales_catalog_import_items(id uuid primary key,organization_id uuid,sales_destination text,status text,metadata jsonb,source_evidence jsonb,fulfillment jsonb,warnings text[]);
    create table sales_catalog_order_items(order_id uuid,organization_id uuid,catalog_item_id uuid);
    create table sales_catalog_payment_sessions(order_id uuid,organization_id uuid,status text);
    create table sales_catalog_card_attempts(order_id uuid,organization_id uuid,state text);`);
  await db.exec(readFileSync("supabase/migrations/0130_catalog_item_appointments.sql", "utf8"));
}, 45000);
afterAll(async () => { await db?.close(); });
async function fixture() {
  const org = randomUUID(), agent = randomUUID(), item = randomUUID(), resource = randomUUID();
  await db.query("insert into agent_registry values($1,$2,$3)", [agent, org, { prompt_builder_config: { templateId: "dentista", professionalIdentity: { name: "Titular", registration: "123", state: "SP" } } }]);
  await db.query("insert into agent_registry values($1,$2,$3)", [randomUUID(), org, { controls_all_whatsapp_agents: true }]);
  await db.query("insert into customer_agenda_resources values($1,$2,'service')", [resource, org]);
  await db.query("insert into intelligence_memory values($1,$2,'organization','sales_catalog_item',$3)", [item, org, { sales_destination: "connectyhub_checkout", fulfillment: { agenda_resource_id: resource } }]);
  return { org, agent, item, resource };
}
async function metadata(id: string) { return (await db.query<{metadata: Record<string, unknown>}>("select metadata from intelligence_memory where id=$1", [id])).rows[0].metadata; }
it("applies the professional default despite a global controller and preserves explicit retail items", async () => {
  const f = await fixture();
  expect(await metadata(f.item)).toMatchObject({ sales_destination: "appointment", action_origin: "activity_default", activity_profile: { templateId: "dentista" } });
  await db.query("update intelligence_memory set metadata=metadata || $2::jsonb where id=$1", [f.item, { sales_destination: "connectyhub_checkout", action_version: 1 }]);
  expect(await metadata(f.item)).toMatchObject({ sales_destination: "connectyhub_checkout", action_version: 1 });
});
it("requires review of old professional import defaults and preserves an explicit sale choice", async () => {
  const f = await fixture(), draft = randomUUID();
  await db.query("insert into sales_catalog_import_items(id,organization_id,sales_destination,status,source_evidence) values($1,$2,'connectyhub_checkout','ready',$3)", [draft,f.org,{source_agent_id:f.agent}]);
  const row = (await db.query("select sales_destination,status,fulfillment from sales_catalog_import_items where id=$1",[draft])).rows[0];
  expect(row).toMatchObject({sales_destination:"appointment",status:"draft",fulfillment:{mode:"service",scheduling_required:true}});
  await db.query("update sales_catalog_import_items set sales_destination='connectyhub_checkout',metadata=$2 where id=$1",[draft,{action_version:1}]);
  expect((await db.query("select sales_destination from sales_catalog_import_items where id=$1",[draft])).rows[0]).toMatchObject({sales_destination:"connectyhub_checkout"});
});
it("updates inherited actions when the activity changes while retaining explicit choices", async () => {
  const f = await fixture();
  await db.query("update agent_registry set metadata=$2 where id=$1", [f.agent, { prompt_builder_config: { templateId: "ecommerce" } }]);
  expect(await metadata(f.item)).toMatchObject({ sales_destination: "connectyhub_checkout", activity_profile: { templateId: "ecommerce" } });
  await db.query("update intelligence_memory set metadata=metadata || $2::jsonb where id=$1", [f.item, { sales_destination: "appointment", action_version: 1 }]);
  await db.query("update agent_registry set metadata=$2 where id=$1", [f.agent, { prompt_builder_config: { templateId: "moda_varejo" } }]);
  expect(await metadata(f.item)).toMatchObject({ sales_destination: "appointment" });
});
it("rejects a foreign agenda and never trusts supplied identity snapshots", async () => {
  const f = await fixture(), other = await fixture();
  await expect(db.query("update intelligence_memory set metadata=metadata || $2::jsonb where id=$1", [f.item, { fulfillment: { agenda_resource_id: other.resource } }])).rejects.toThrow("AGENDA_RESOURCE_SCOPE");
  await db.query("update intelligence_memory set metadata=metadata || $2::jsonb where id=$1", [f.item, { source_agent_id: other.agent, activity_profile: { templateId: "advogado" }, assigned_agent_ids: "malformed" }]);
  expect((await metadata(f.item)).activity_profile).toBeUndefined();
});
it("blocks new sessions and card attempts for appointments, permits explicit sale and financial status updates", async () => {
  const f = await fixture(), order = randomUUID();
  await db.query("insert into sales_catalog_order_items values($1,$2,$3)", [order, f.org, f.item]);
  await expect(db.query("insert into sales_catalog_payment_sessions values($1,$2,'created')", [order,f.org])).rejects.toThrow("CATALOG_ITEM_NOT_FOR_CHECKOUT");
  await expect(db.query("insert into sales_catalog_card_attempts values($1,$2,'processing')", [order,f.org])).rejects.toThrow("CATALOG_ITEM_NOT_FOR_CHECKOUT");
  await db.query("update intelligence_memory set metadata=metadata || $2::jsonb where id=$1", [f.item, { sales_destination: "connectyhub_checkout", action_version: 1 }]);
  await db.query("insert into sales_catalog_payment_sessions values($1,$2,'created')", [order,f.org]);
  await db.query("update intelligence_memory set metadata=metadata || $2::jsonb where id=$1", [f.item, { sales_destination: "appointment" }]);
  await db.query("update sales_catalog_payment_sessions set status='paid' where order_id=$1", [order]);
  expect((await db.query("select status from sales_catalog_payment_sessions where order_id=$1",[order])).rows[0]).toMatchObject({status:"paid"});
});
