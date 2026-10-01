import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { commercialDb } from "./helpers/commercial-db";

let db: PGlite;
const admin = randomUUID();
const scope = { project_name: "Plataforma de teste", description: "Vendas e atendimento", deliverables: "Catálogo e atendimento", recurring_services: "Evolução mensal acordada", exclusions: "Serviços não descritos", additional_fields: [{ label: "Aceite", value: "Validação do cliente" }] };
let legacy: Awaited<ReturnType<typeof account>>;
let legacyPayment: string;

beforeAll(async () => {
  db = await commercialDb();
  await db.exec("alter table profiles add column is_platform_admin boolean default false");
  await db.query("insert into auth.users(id) values($1)", [admin]);
  await db.query("insert into profiles(id,is_platform_admin) values($1,true)", [admin]);
  await db.exec(readFileSync("supabase/migrations/0107_custom_contracts.sql", "utf8"));
  await db.exec("insert into billing_plans(plan_code,name,monthly_price_brl,included_credits) values('scale','Scale',497,1000)");
  legacy = await account();
  await save(legacy.org, undefined);
  legacyPayment = await invoice(legacy);
  await db.exec(readFileSync("supabase/migrations/0175_custom_contract_development.sql", "utf8"));
}, 60000);
afterAll(async () => { await db?.close(); });

async function account() {
  const org = randomUUID(), owner = randomUUID(), sub = randomUUID();
  await db.query("insert into auth.users(id) values($1)", [owner]);
  await db.query("insert into organizations(id,owner_id,name,plan_code,status) values($1,$2,'Cliente de teste','scale','active')", [org, owner]);
  await db.query("insert into organization_subscriptions(id,organization_id,plan_code,status,current_period_start,current_period_end,metadata) values($1,$2,'scale','active',now()-interval '1 day',now()+interval '29 days','{\"commercial_terms\":{\"billing_cycle\":\"recurring\",\"price_brl\":497,\"included_credits\":1000}}')", [sub, org]);
  return { org, owner, sub };
}

async function save(org: string, development_scope: unknown, actor = admin) {
  const terms = { name: "Contrato de teste", base_plan_code: "scale", monthly_price_brl: 10000, included_credits: 5000, effective_at: new Date(Date.now() - 1000).toISOString(), first_period_end: new Date(Date.now() + 30 * 86400000).toISOString(), features: {}, resource_limits: {}, development_scope };
  return (await db.query<{ r: { id: string; development_scope: unknown } }>("select save_custom_contract($1,$2,$3) r", [org, actor, JSON.stringify(terms)])).rows[0].r;
}

async function invoice(a: Awaited<ReturnType<typeof account>>) {
  const inv = randomUUID(), pay = randomUUID();
  await db.query("insert into billing_invoices(id,organization_id,subscription_id,status,total_brl) values($1,$2,$3,'open',497)", [inv, a.org, a.sub]);
  await db.query("insert into billing_invoice_items(invoice_id,organization_id,item_type,total_brl) values($1,$2,'plan',497)", [inv, a.org]);
  await db.query("insert into billing_payments(id,organization_id,subscription_id,invoice_id,status,provider,amount_brl,payload) values($1,$2,$3,$4,'pending','asaas',497,$5)", [pay, a.org, a.sub, inv, JSON.stringify({ checkout_kind: "initial", target_plan_code: "scale", cycle_start_at: new Date().toISOString() })]);
  return pay;
}

async function payment(pay: string) {
  return (await db.query<{ amount_brl: string; payload: { commercial_terms: { development_scope?: unknown }; cycle_start_at: string; cycle_end_at: string }; invoice_id: string }>("select amount_brl,payload,invoice_id from billing_payments where id=$1", [pay])).rows[0];
}

it("preserves invoices issued before the migration and permits contracts without development", async () => {
  expect((await payment(legacyPayment)).payload.commercial_terms).not.toHaveProperty("development_scope");
  const row = await save(legacy.org, null);
  expect(row.development_scope).toBeNull();
  expect((await payment(await invoice(legacy))).payload.commercial_terms.development_scope).toBeNull();
});

it("preserves the invoice scope, fulfills it once, and snapshots the next scope only on renewal", async () => {
  const a = await account();
  const saved = await save(a.org, scope);
  expect(saved.development_scope).toEqual(scope);
  const pay = await invoice(a), old = await payment(pay);
  expect(Number(old.amount_brl)).toBe(10000);
  expect(old.payload.commercial_terms.development_scope).toEqual(scope);
  const invoiceScope = await db.query<{ metadata: { commercial_terms: { development_scope: unknown } } }>("select metadata from billing_invoices where id=$1", [old.invoice_id]);
  expect(invoiceScope.rows[0].metadata.commercial_terms.development_scope).toEqual(scope);
  const nextScope = { ...scope, deliverables: "Novo módulo para próximo ciclo" };
  await save(a.org, nextScope);
  expect((await payment(pay)).payload.commercial_terms.development_scope).toEqual(scope);
  expect((await db.query("select * from test_credit_grants where organization_id=$1", [a.org])).rows).toHaveLength(0);
  await db.query("update billing_payments set status='approved',paid_at=now() where id=$1", [pay]);
  for (let n = 0; n < 2; n++) await db.query("select fulfill_confirmed_billing_payment($1,'scale',$2,$3,'{}')", [pay, old.payload.cycle_start_at, old.payload.cycle_end_at]);
  const current = async () => (await db.query<{ metadata: { commercial_terms: { development_scope: unknown } } }>("select metadata from organization_subscriptions where id=$1", [a.sub])).rows[0].metadata.commercial_terms.development_scope;
  expect(await current()).toEqual(scope);
  expect((await db.query("select * from test_credit_grants where organization_id=$1", [a.org])).rows).toHaveLength(1);
  const end = old.payload.cycle_end_at;
  const next = (await db.query<{ r: { payment_id: string } }>("select prepare_contract_renewal($1,$2,$2,$3,'asaas','{}') r", [a.sub, end, new Date(Date.parse(end) + 32 * 86400000).toISOString()])).rows[0].r;
  expect((await payment(next.payment_id)).payload.commercial_terms.development_scope).toEqual(nextScope);
  expect(await current()).toEqual(scope);
  await expect(db.query("update billing_payments set payload=jsonb_set(payload,'{commercial_terms,development_scope}','null') where id=$1", [pay])).rejects.toThrow("CUSTOM_CONTRACT_TERMS_IMMUTABLE");
});

it("keeps scope isolated to the billing account and requires platform administration", async () => {
  const a = await account(), b = await account();
  await save(a.org, scope);
  expect((await payment(await invoice(b))).payload.commercial_terms?.development_scope).toBeUndefined();
  await expect(save(b.org, scope, b.owner)).rejects.toThrow("ADMIN_REQUIRED");
  const permissions = await db.query("select has_table_privilege('authenticated','organization_custom_contracts','SELECT') as read, has_function_privilege('authenticated','save_custom_contract(uuid,uuid,jsonb)','EXECUTE') as write");
  expect(permissions.rows[0]).toEqual({ read: false, write: false });
});

it("rejects incomplete scope and invalid custom fields at the database boundary", async () => {
  const a = await account();
  for (const invalid of [{}, { ...scope, description: "" }, { ...scope, project_name: "x".repeat(161) }, { ...scope, additional_fields: [{ label: "Prazo" }] }, { ...scope, additional_fields: [{ label: "Prazo", value: "A" }, { label: "prazo", value: "B" }] }]) {
    await expect(save(a.org, invalid)).rejects.toThrow("custom_contract_development_scope_valid");
  }
});
