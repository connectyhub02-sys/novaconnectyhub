import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import * as contract from "../src/lib/commerce-agent/web-actions";
import type * as Server from "../src/lib/commerce-agent/web-actions-server";
import type { CommerceAgentResolvedContext } from "../src/lib/commerce-agent/server";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Row = Record<string, unknown>;
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create type agent_scope as enum ('platform','organization');
    create table organizations(id uuid primary key);
    create table leads(id uuid primary key);
    create table conversations(id uuid primary key);
    create table agent_registry(id uuid primary key);
    create table intelligence_memory(id uuid primary key, organization_id uuid, scope text, memory_type text,
      title text, content text, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
    create table sales_catalog_orders(id uuid primary key);
    create table sales_catalog_payment_sessions(id uuid primary key);
    create table sales_catalog_skus(id uuid primary key);
    create function touch_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
    create function is_platform_admin() returns boolean language sql stable as $$select false$$;
    create function is_organization_member(uuid) returns boolean language sql stable as $$select $1::text=current_setting('test.organization',true)$$;
    create function is_organization_admin(uuid) returns boolean language sql stable as $$select $1::text=current_setting('test.organization',true) and current_setting('test.org_admin',true)='true'$$;`);
  const foundation = readFileSync("supabase/migrations/0006_autonomous_company_foundation.sql", "utf8");
  const eventTable = foundation.match(/create table if not exists public\.intelligence_events \([\s\S]*?\n\);/)?.[0];
  const policies = foundation.slice(foundation.indexOf('drop policy if exists "intelligence events visible by scope"'), foundation.indexOf('drop policy if exists "intelligence memory visible by scope"'));
  if (!eventTable || !policies) throw new Error("Foundation event SQL was not found");
  await db.exec(eventTable);
  await db.exec("alter table intelligence_events enable row level security;");
  await db.exec(policies);
  await db.exec(readFileSync("supabase/migrations/0067_commerce_agent_foundation.sql", "utf8"));
  // Match Supabase's table grants; the versioned RLS policies remain authoritative.
  await db.exec("grant usage on schema public to anon,authenticated,service_role; grant all on all tables in schema public to anon,authenticated,service_role;");
}, 45000);
afterEach(async () => { await db.exec("reset role; reset test.organization; reset test.org_admin;"); });
afterAll(async () => { await db?.close(); });

/** Small PostgREST-shaped transport backed by PostgreSQL, not an in-memory row mock. */
class Query {
  values: unknown[] = [];
  where: string[] = [];
  patch: Row | null = null;
  constructor(public table: string) { if (!["commerce_agent_actions", "intelligence_events", "intelligence_memory"].includes(table)) throw new Error("Unexpected table"); }
  eq(key: string, value: unknown) { this.where.push(`${column(key)} = $${this.values.push(value)}`); return this; }
  filter(key: string, op: string, value: unknown) { if (key !== "metadata->>status" || op !== "eq") throw new Error("Unexpected filter"); this.where.push(`metadata->>'status' = $${this.values.push(value)}`); return this; }
  select() { return this; }
  order() { return this; }
  limit() { return this; }
  update(patch: Row) { this.patch = patch; return this; }
  async insert(row: Row) { return this.write(row, false); }
  async upsert(row: Row) { return this.write(row, true); }
  async write(row: Row, ignore: boolean) {
    const entries = Object.entries(row);
    try {
      await db.query(`insert into ${this.table} (${entries.map(([key]) => column(key)).join(",")}) values (${entries.map((_, index) => `$${index + 1}`).join(",")}) ${ignore ? "on conflict (id) do nothing" : ""}`, entries.map(([, value]) => value));
      return { error: null };
    } catch (error) { return { error }; }
  }
  async result(single: boolean) {
    const values = [...this.values];
    const patch = this.patch ? Object.entries(this.patch).map(([key, value]) => `${column(key)} = $${values.push(value)}`).join(",") : null;
    const sql = `${patch ? `update ${this.table} set ${patch}` : `select * from ${this.table}`}${this.where.length ? ` where ${this.where.join(" and ")}` : ""}${patch ? " returning *" : ""}`;
    try { const result = await db.query(sql, values); return { data: single ? result.rows[0] ?? null : result.rows, error: null }; }
    catch (error) { return { data: null, error }; }
  }
  maybeSingle() { return this.result(true); }
  then(resolve: (value: unknown) => unknown) { return this.result(false).then(resolve); }
}
function column(key: string) { if (!/^[a-z_]+$/.test(key)) throw new Error("Unexpected SQL identifier"); return `"${key}"`; }

const server = serverModuleHarness<typeof Server>("src/lib/commerce-agent/web-actions-server.ts", {
  "node:crypto": crypto, "./web-actions": contract,
  "@/lib/client-os/sales-catalog": { mapSalesCatalogItem: (row: Row) => ({ ...row, salesDestination: "connectyhub_checkout", price: "10", offer: { salePrice: null }, inventory: {} }) },
  "@/lib/sales-catalog/shared": { isSalesCatalogDisplayableProduct: () => true },
});

async function fixture() {
  const [org, lead, conversation, agent, product, session] = Array.from({ length: 6 }, () => crypto.randomUUID());
  for (const [table, id] of [["organizations", org], ["leads", lead], ["conversations", conversation], ["agent_registry", agent]]) await db.query(`insert into ${table}(id) values($1)`, [id]);
  await db.query("insert into intelligence_memory(id,organization_id,scope,memory_type,title,metadata) values($1,$2,'organization','sales_catalog_item','Produto de teste','{\"status\":\"active\"}')", [product, org]);
  await db.query("insert into commerce_sessions(id,organization_id,lead_id,conversation_id) values($1,$2,$3,$4)", [session, org, lead, conversation]);
  const context = { ok: true, client: { from: (table: string) => new Query(table) }, organization: { id: org },
    settings: { commerceAgent: { mode: "assistant" } }, commerceSessionId: session, leadId: lead,
    conversationId: conversation, agentId: agent, agentName: "Agente de teste", visitorId: "visitor", sessionId: "browser",
    surface: "store", pagePath: "/loja/test", productId: null,
  } as unknown as Extract<CommerceAgentResolvedContext, { ok: true }>;
  const action: contract.WebAction = { id: crypto.randomUUID(), kind: "request_add_to_cart_confirmation", productId: product, productTitle: "Produto de teste", quantity: 2, reason: "Pedido do lead" };
  const execute = () => server.handleWebAction(context, { web_action_id: action.id, phase: "execute", confirmation: { accepted: true, actionId: action.id, productId: product, quantity: 2 } });
  return { context, action, execute, org, lead };
}

it("persists the actual server payloads, conditional authorization and idempotent lead events", async () => {
  const f = await fixture(); await db.exec("set role service_role");
  await server.issueWebAction(f.context, f.action);
  expect(await f.execute()).toMatchObject({ action: { kind: "add_to_cart_after_confirmation", quantity: 2 } });
  await expect(f.execute()).rejects.toThrow();
  const receipt = { web_action_id: f.action.id, phase: "complete", outcome: "applied" };
  await server.handleWebAction(f.context, receipt); await server.handleWebAction(f.context, receipt);
  expect((await db.query("select status,catalog_item_id,result_payload from commerce_agent_actions where id=$1", [f.action.id])).rows[0]).toMatchObject({ status: "applied", catalog_item_id: f.action.productId, result_payload: { confirmed_quantity: 2, confirmation_method: "lead_confirmation_button" } });
  const events = (await db.query<Row>("select * from intelligence_events where payload->>'action_id'=$1 order by occurred_at", [f.action.id])).rows;
  expect(events).toHaveLength(3);
  const crm = serverModuleHarness<{ matchLeadEvents(lead: Row, conversations: Row[], events: Row[]): Row[]; buildActivities(lead: Row, conversations: Row[], events: Row[]): Row[] }>("src/lib/client-os/leads-crm.ts", {}, ["matchLeadEvents", "buildActivities"]);
  const lead = { id: f.lead, organization_id: f.org, phone_number: null, metadata: {} };
  const matched = crm.matchLeadEvents(lead, [], events);
  expect(matched).toHaveLength(3);
  expect(crm.buildActivities(lead, [], matched)).toEqual(expect.arrayContaining([expect.objectContaining({ type: "commerce_agent.assisted_action", title: "Ação assistida: Adicionar item ao carrinho" })]));
});

it("allows only one conditional execution with two concurrent requests in PostgreSQL", async () => {
  const f = await fixture(); await server.issueWebAction(f.context, f.action);
  expect((await Promise.allSettled([f.execute(), f.execute()])).filter(result => result.status === "fulfilled")).toHaveLength(1);
});

it("enforces real action types, statuses and product foreign keys", async () => {
  const f = await fixture(); await server.issueWebAction(f.context, f.action);
  await expect(db.query("update commerce_agent_actions set action_type='execute_js' where id=$1", [f.action.id])).rejects.toThrow();
  await expect(db.query("update commerce_agent_actions set status='invented' where id=$1", [f.action.id])).rejects.toThrow();
  await expect(db.query("update commerce_agent_actions set catalog_item_id=$1 where id=$2", [crypto.randomUUID(), f.action.id])).rejects.toThrow();
});

it("keeps actions and archive events unreadable and unwritable for anonymous visitors", async () => {
  const f = await fixture(); await server.issueWebAction(f.context, f.action);
  await db.exec("set role anon");
  for (const table of ["commerce_agent_actions", "intelligence_events"]) expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
  await expect(server.issueWebAction(f.context, { ...f.action, id: crypto.randomUUID() })).rejects.toThrow();
  await expect(db.query("insert into intelligence_events(organization_id,event_type,title) values($1,'forged','Forged')", [f.org])).rejects.toThrow();
});

it("lets an organization member read its archive but rejects another tenant and unauthorized writes", async () => {
  const f = await fixture(); await server.issueWebAction(f.context, f.action);
  await db.query("select set_config('test.organization',$1,false)", [f.org]);
  await db.exec("set role authenticated");
  expect((await db.query("select * from commerce_agent_actions where id=$1", [f.action.id])).rows).toHaveLength(1);
  expect((await db.query("select * from intelligence_events where source_id=$1", [f.lead])).rows).toHaveLength(1);
  await expect(server.issueWebAction(f.context, { ...f.action, id: crypto.randomUUID() })).rejects.toThrow();
  await db.query("select set_config('test.organization',$1,false)", [crypto.randomUUID()]);
  expect((await db.query("select * from commerce_agent_actions where id=$1", [f.action.id])).rows).toHaveLength(0);
  expect((await db.query("select * from intelligence_events where source_id=$1", [f.lead])).rows).toHaveLength(0);
});
