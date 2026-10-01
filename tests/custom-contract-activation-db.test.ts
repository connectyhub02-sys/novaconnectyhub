import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { commercialDb } from "./helpers/commercial-db";
let db: PGlite;
const admin = randomUUID();
beforeAll(async () => {
  db = await commercialDb();
  await db.exec(`alter table profiles add column is_platform_admin boolean default false;
    create table organization_billing_limits(organization_id uuid primary key,allow_overage boolean,overage_limit_credits numeric,hard_block_when_empty boolean,alert_threshold_percent integer);
    create table billing_pix_authorizations(subscription_id uuid,state text);
    create table connectyhub_api_clients(id uuid primary key,organization_id uuid,status text,metadata jsonb);
    create table connectyhub_api_keys(id uuid primary key,client_id uuid,status text,metadata jsonb);
    create table connectyhub_webhook_endpoints(id uuid primary key,client_id uuid,status text,metadata jsonb);
    insert into billing_plans(plan_code,name,status,monthly_price_brl,included_credits) values('scale','Scale','active',497,1000);`);
  await db.query("insert into auth.users(id) values($1)", [admin]);
  await db.query("insert into profiles(id,is_platform_admin) values($1,true)", [admin]);
  for (const file of ["0107_custom_contracts", "0175_custom_contract_development", "0176_custom_contract_activation", "0177_custom_contract_provider_guard", "0178_custom_contract_api_restore"]) await db.exec(readFileSync(`supabase/migrations/${file}.sql`, "utf8"));
}, 60000);
afterAll(async () => { await db?.close(); });
it("restores billing-paused API resources atomically while retaining manual and revoked access states", async () => {
  const a=await account(), b=await account(), api=randomUUID(), manual=randomUUID(), other=randomUUID();
  const guard=JSON.stringify({connectyhub_api_access_guard:{paused_by:'connectyhub_api_access_guard',allowed:false}});
  await db.query("insert into connectyhub_api_clients values($1,$2,'paused',$3),($4,$2,'paused','{}'),($5,$6,'paused',$3)",[api,a.org,guard,manual,other,b.org]);
  for(const table of ['connectyhub_api_keys','connectyhub_webhook_endpoints']) {
    await db.query(`insert into ${table} values($1,$2,'paused',$3),($4,$2,'paused','{}'),($5,$2,'revoked',$3),($6,$7,'paused',$3)`,[randomUUID(),api,guard,randomUUID(),randomUUID(),randomUUID(),manual]);
  }
  await activate(a.org,await contract(a));
  expect((await db.query("select status from connectyhub_api_clients where id=$1",[api])).rows).toEqual([{status:'active'}]);
  expect((await db.query("select status from connectyhub_api_clients where id in ($1,$2)",[manual,other])).rows).toEqual([{status:'paused'},{status:'paused'}]);
  for(const table of ['connectyhub_api_keys','connectyhub_webhook_endpoints']) {
    expect((await db.query(`select status from ${table} where client_id=$1 order by status`,[api])).rows).toEqual([{status:'active'},{status:'paused'},{status:'revoked'}]);
    expect((await db.query(`select status from ${table} where client_id=$1`,[manual])).rows).toEqual([{status:'paused'}]);
  }
});
async function account() {
  const org = randomUUID(), owner = randomUUID(), sub = randomUUID();
  await db.query("insert into auth.users(id) values($1)", [owner]);
  await db.query("insert into organizations(id,owner_id,name,plan_code,status) values($1,$2,'Cliente teste','trial','trial_expired')", [org, owner]);
  await db.query("insert into organization_subscriptions(id,organization_id,plan_code,status,current_period_end,metadata) values($1,$2,'scale','past_due',now()-interval '15 days','{}')", [sub, org]);
  return { org, owner, sub };
}
async function contract(a: Awaited<ReturnType<typeof account>>, credits = 150000, limit = 8, dates: Record<string, string> = {}) {
  const terms = { name: "Projeto e APIs", base_plan_code: "scale", monthly_price_brl: 10000, included_credits: credits,
    effective_at: new Date(Date.now()-5000).toISOString(), first_period_end: new Date(Date.now()+9*86400000).toISOString(),
    features: { llm_api: true, voice_api: true, connectyhub_api: true, meta_ads_analytics: false }, resource_limits: { whatsapp_instance_limit: limit },
    development_scope: { project_name: "Projeto teste", description: "Desenvolvimento contínuo" }, ...dates };
  return (await db.query<{ r: { id: string } }>("select save_custom_contract($1,$2,$3) r", [a.org, admin, JSON.stringify(terms)])).rows[0].r.id;
}
async function activate(org: string, id: string, actor = admin) {
  return (await db.query<{ r: { credits_granted: number; already_applied: boolean; payment_id: string; cycle_end: string } }>("select activate_custom_contract($1,$2,$3) r", [org, id, actor])).rows[0].r;
}
it("activates the exact negotiated scope and credits once, with an unpaid invoice and no automatic debit", async () => {
  const a = await account(), id = await contract(a);
  const first = await activate(a.org, id);
  expect(Number(first.credits_granted)).toBe(150000);
  expect((await activate(a.org, id)).already_applied).toBe(true);
  expect((await db.query("select * from test_credit_grants where organization_id=$1", [a.org])).rows).toHaveLength(1);
  const sub = (await db.query<{ status: string; metadata: Record<string, unknown> }>("select status,metadata from organization_subscriptions where id=$1", [a.sub])).rows[0];
  expect(sub.status).toBe("active");
  expect(sub.metadata.commercial_terms).toMatchObject({ custom_contract_id: id, included_credits: 150000, resource_limits: { whatsapp_instance_limit: 8 }, features: { llm_api: true, meta_ads_analytics: false }, development_scope: { project_name: "Projeto teste" } });
  expect(sub.metadata.auto_charge_disabled).toBe(true);
  const pay = (await db.query<{ status: string; paid_at: null; amount_brl: string; payload: Record<string, unknown> }>("select status,paid_at,amount_brl,payload from billing_payments where id=$1", [first.payment_id])).rows[0];
  expect(pay.status).toBe("pending"); expect(pay.paid_at).toBeNull(); expect(Number(pay.amount_brl)).toBe(10000);
  expect(pay.payload.auto_charge_disabled).toBe(true);
  const access = (await db.query<{ r: { allowed: boolean } }>("select resolve_organization_contract_access($1) r", [a.org])).rows[0].r;
  expect(access.allowed).toBe(true);
});
it("applies larger limits immediately without duplicating a monthly grant or rewriting an issued invoice", async () => {
  const a = await account(), firstId = await contract(a), first = await activate(a.org, firstId);
  const nextId = await contract(a, 150000, 20);
  const next = await activate(a.org, nextId);
  expect(Number(next.credits_granted)).toBe(0);
  expect(next.cycle_end).toBe(first.cycle_end);
  expect(next.payment_id).not.toBe(first.payment_id);
  expect((await db.query<{status:string}>("select status from billing_payments where id=$1",[first.payment_id])).rows[0].status).toBe("canceled");
  expect((await db.query<{ value: string }>("select metadata#>>'{commercial_terms,resource_limits,whatsapp_instance_limit}' value from organization_subscriptions where id=$1", [a.sub])).rows[0].value).toBe("20");
  expect((await db.query<{ value: string }>("select payload#>>'{commercial_terms,custom_contract_id}' value from billing_payments where id=$1", [first.payment_id])).rows[0].value).toBe(firstId);
  const higher = await contract(a, 160000, 20);
  expect(Number((await activate(a.org, higher)).credits_granted)).toBe(10000);
  const lower = await contract(a, 155000, 20);
  expect(Number((await activate(a.org, lower)).credits_granted)).toBe(0);
});
it("settles the pending invoice through the normal fulfillment and preserves the new limits", async () => {
  const a=await account(), id=await contract(a); await activate(a.org,id);
  const nextId=await contract(a,150000,20), next=await activate(a.org,nextId);
  await db.query("update billing_payments set status='approved',paid_at=now() where id=$1",[next.payment_id]);
  for(let i=0;i<2;i++) await db.query("select fulfill_confirmed_billing_payment(id,'scale',(payload->>'cycle_start_at')::timestamptz,(payload->>'cycle_end_at')::timestamptz,'{}') from billing_payments where id=$1",[next.payment_id]);
  expect((await db.query<{value:string}>("select metadata#>>'{commercial_terms,resource_limits,whatsapp_instance_limit}' value from organization_subscriptions where id=$1",[a.sub])).rows[0].value).toBe("20");
  expect((await db.query("select * from test_credit_grants where organization_id=$1",[a.org])).rows).toHaveLength(2);
  const renewed = (await db.query<{r:{payment_id:string}}>("select prepare_contract_renewal(id,current_period_end,current_period_end,current_period_end+interval '1 month','asaas','{}') r from organization_subscriptions where id=$1",[a.sub])).rows[0].r.payment_id;
  await db.query("update billing_payments set status='approved',paid_at=now() where id=$1",[renewed]);
  for(let i=0;i<2;i++) await db.query("select fulfill_confirmed_billing_payment(id,'scale',(payload->>'cycle_start_at')::timestamptz,(payload->>'cycle_end_at')::timestamptz,'{}') from billing_payments where id=$1",[renewed]);
  expect((await db.query("select * from test_credit_grants where organization_id=$1",[a.org])).rows).toHaveLength(3);
});
it("rolls back the entire activation if the next invoice is already external", async () => {
  const a=await account(), firstId=await contract(a), first=await activate(a.org,firstId);
  await db.query("update billing_payments set provider_payment_id='pay_existing' where id=$1",[first.payment_id]);
  const nextId=await contract(a,200000,20);
  await expect(activate(a.org,nextId)).rejects.toThrow("PENDING_INVOICE_REVIEW_REQUIRED");
  expect((await db.query<{value:string}>("select metadata#>>'{commercial_terms,custom_contract_id}' value from organization_subscriptions where id=$1",[a.sub])).rows[0].value).toBe(firstId);
  expect((await db.query("select * from test_credit_grants where organization_id=$1",[a.org])).rows).toHaveLength(1);
});
it("keeps previous invoices and prevents old payment events from replacing the activated version", async () => {
  const a = await account();
  const inv = randomUUID(), pay = randomUUID();
  await db.query("insert into billing_invoices(id,organization_id,subscription_id,status,total_brl) values($1,$2,$3,'open',497)", [inv,a.org,a.sub]);
  await db.query("insert into billing_payments(id,organization_id,subscription_id,invoice_id,status,amount_brl,provider,payload,created_at) values($1,$2,$3,$4,'rejected',497,'asaas','{\"target_plan_code\":\"scale\"}',now()-interval '1 day')", [pay,a.org,a.sub,inv]);
  const id = await contract(a); await activate(a.org,id);
  expect((await db.query("select status,amount_brl from billing_payments where id=$1",[pay])).rows[0]).toEqual({status:"rejected",amount_brl:"497"});
  await db.query("update billing_payments set status='approved',paid_at=now() where id=$1",[pay]);
  await db.query("select fulfill_confirmed_billing_payment($1,'scale',now()-interval '1 month',now(),'{}')",[pay]);
  expect((await db.query<{ value:string }>("select metadata#>>'{commercial_terms,custom_contract_id}' value from organization_subscriptions where id=$1",[a.sub])).rows[0].value).toBe(id);
});
it("rejects other accounts, non-admins, stale/future versions, expired deadlines and suspended accounts", async () => {
  const a = await account(), b = await account(), id = await contract(a);
  await expect(activate(b.org,id)).rejects.toThrow("CONTRACT_NOT_FOUND");
  await expect(activate(a.org,id,a.owner)).rejects.toThrow("ADMIN_REQUIRED");
  const newer = await contract(a);
  await expect(activate(a.org,id)).rejects.toThrow("CONTRACT_VERSION_CHANGED");
  await db.query("update organizations set status='suspended' where id=$1",[a.org]);
  await expect(activate(a.org,newer)).rejects.toThrow("ACCOUNT_SUSPENDED");
  const future = await contract(b,150000,8,{effective_at:new Date(Date.now()+86400000).toISOString()});
  await expect(activate(b.org,future)).rejects.toThrow("CONTRACT_NOT_EFFECTIVE");
  const d = await account(), expired = await contract(d,150000,8,{effective_at:new Date(Date.now()-3*86400000).toISOString(),first_period_end:new Date(Date.now()-86400000).toISOString()});
  await expect(activate(d.org,expired)).rejects.toThrow("CONTRACT_DEADLINE_EXPIRED");
  expect((await db.query("select * from test_credit_grants where organization_id=$1",[d.org])).rows).toHaveLength(0);
  const permission = await db.query("select has_function_privilege('authenticated','activate_custom_contract(uuid,uuid,uuid)','EXECUTE') allowed");
  expect(permission.rows[0]).toEqual({allowed:false});
});
it("rolls back access and credits when an external Pix agreement is still preparing", async () => {
  const a=await account(), id=await contract(a);
  await db.query("insert into billing_pix_authorizations(subscription_id,state) values($1,'preparing')",[a.sub]);
  await expect(activate(a.org,id)).rejects.toThrow("PROVIDER_SUBSCRIPTION_REVIEW_REQUIRED");
  expect((await db.query("select * from test_credit_grants where organization_id=$1",[a.org])).rows).toHaveLength(0);
  expect((await db.query<{status:string}>("select status from organization_subscriptions where id=$1",[a.sub])).rows[0].status).toBe("past_due");
  expect((await db.query("select * from billing_payments where organization_id=$1",[a.org])).rows).toHaveLength(0);
});
