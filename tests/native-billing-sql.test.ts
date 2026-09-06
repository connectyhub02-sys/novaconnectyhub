import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const org = "11111111-1111-4111-8111-111111111111", sub = "22222222-2222-4222-8222-222222222222", inv = "33333333-3333-4333-8333-333333333333", pay = "44444444-4444-4444-8444-444444444444", first = "55555555-5555-4555-8555-555555555555", second = "66666666-6666-4666-8666-666666666666";
let db: PGlite;
beforeAll(async () => {
 db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create table organizations(id uuid primary key);
 create table organization_subscriptions(id uuid primary key,organization_id uuid,provider_subscription_id text,billing_provider text,metadata jsonb default '{}');
 create table billing_invoices(id uuid primary key default gen_random_uuid(),organization_id uuid,subscription_id uuid,status text,subtotal_brl numeric,discount_brl numeric,total_brl numeric,provider text,provider_payment_id text,metadata jsonb default '{}');
 create table billing_payments(id uuid primary key default gen_random_uuid(),organization_id uuid,subscription_id uuid,invoice_id uuid,status text,amount_brl numeric,provider text,provider_payment_id text,provider_status text,paid_at timestamptz,payload jsonb default '{}',updated_at timestamptz);
 create table billing_invoice_items(id uuid default gen_random_uuid(),invoice_id uuid,organization_id uuid,item_type text,description text,quantity numeric,unit_price_brl numeric,total_brl numeric,credit_amount numeric,metadata jsonb default '{}');
 create table sales_catalog_card_attempts(id uuid primary key,state text,effects_completed_state text,effects_claimed_at timestamptz);
 create table intelligence_events(scope text,organization_id uuid,source_type text,source_id uuid,event_type text,title text,summary text,visibility text,tags text[],payload jsonb);
 `);
 await db.exec(readFileSync('supabase/migrations/0078_ecosystem_native_billing.sql','utf8'));
 await db.query('insert into organizations values ($1)',[org]); await db.query('insert into organization_subscriptions(id,organization_id) values ($1,$2)',[sub,org]);
 await db.query('insert into billing_invoices(id,organization_id,subscription_id,status,total_brl) values ($1,$2,$3,\'open\',130)',[inv,org,sub]);
 await db.query(`insert into billing_payments(id,organization_id,subscription_id,invoice_id,status,amount_brl,payload) values ($1,$2,$3,$4,'pending',130,'{"selected_bumps":[{"code":"monthly","recurrence":"monthly","price_brl":10},{"code":"once","recurrence":"one_time","price_brl":20}],"target_plan_code":"starter"}')`,[pay,org,sub,inv]);
},30000);
afterAll(async()=>{await db?.close()});
async function claim(id=first, amount=130, organization=org) {return (await db.query<{result:{claimed:boolean;attempt:{id:string,state:string}}}>('select claim_native_billing_card($1,$2,$3,0,$4,110,$5) as result',[organization,pay,id,amount,`billing_card:${id}`])).rows[0].result}
describe.sequential('native panel financial boundaries',()=>{
 it('rejects a stale amount and a different organization before dispatch',async()=>{
  await expect(claim(first,129)).rejects.toThrow('BILLING_CHANGED'); await expect(claim(first,130,second)).rejects.toThrow('BILLING_NOT_FOUND');
  expect((await db.query('select * from billing_card_attempts')).rows).toHaveLength(0);
 });
 it('serializes Pix creation against cards and edits',async()=>{
  await db.query('select claim_native_billing_pix($1,$2)',[org,pay]);
  await expect(claim()).rejects.toThrow('BILLING_PIX_PENDING');
  await expect(db.query('select claim_native_billing_pix($1,$2)',[org,pay])).rejects.toThrow('BILLING_PAYMENT_BUSY');
  await expect(db.query('update billing_payments set amount_brl=140 where id=$1',[pay])).rejects.toThrow('BILLING_PIX_PENDING');
  await db.query(`update billing_payments set payload=payload||'{"pix_creation_pending":false}' where id=$1`,[pay]);
 });
 it('claims one dispatch across multiple submissions and locks both payment methods',async()=>{
  const result=await Promise.all([claim(),claim(second)]); expect(result.filter(r=>r.claimed)).toHaveLength(1);expect(result.every(r=>r.attempt.id===first)).toBe(true);
  await expect(db.query('update billing_invoices set total_brl=140 where id=$1',[inv])).rejects.toThrow('BILLING_PAYMENT_BUSY');
  await expect(db.query('select claim_native_billing_pix($1,$2)',[org,pay])).rejects.toThrow('BILLING_PAYMENT_BUSY');
 });
 it('retains an unknown result and cannot dispatch a second charge',async()=>{
  await db.query("select finish_native_billing_card($1,'unknown')",[first]); expect((await claim(second)).attempt.state).toBe('unknown');
 });
 it('commits approval and a single audit even when events are repeated or late',async()=>{
  await db.query("select finish_native_billing_card($1,'approved','pay_test','CONFIRMED')",[first]);
  await db.query("select finish_native_billing_card($1,'approved','pay_test','CONFIRMED')",[first]);
  await db.query("select finish_native_billing_card($1,'pending','pay_test','PENDING')",[first]);
  expect((await db.query('select status from billing_payments where id=$1',[pay])).rows[0]).toEqual({status:'approved'});
  expect((await db.query("select * from intelligence_events where event_type='billing.native_card_approved'")).rows).toHaveLength(1);
 });
 it('creates one invoice per renewal and excludes all one-time extras',async()=>{
  const bind=()=>db.query<{ref:string}>("select bind_native_billing_renewal($1,'pay_month2',110) as ref",[first]);
  const a=await bind(), b=await bind();expect(a.rows).toEqual(b.rows);
  const invoiceId=a.rows[0].ref.split(':')[3];const metadata=(await db.query<{metadata:{selected_bump_codes:string[]}}> ('select metadata from billing_invoices where id=$1',[invoiceId])).rows[0].metadata;
  expect(metadata.selected_bump_codes).toEqual(['monthly']);
  expect((await db.query('select * from billing_native_renewals')).rows).toHaveLength(1);
  await expect(db.query("select bind_native_billing_renewal($1,'pay_month3',130)",[first])).rejects.toThrow('BILLING_INVALID_RENEWAL');
 });
 it('keeps a refund authoritative over delayed approvals',async()=>{
  await db.query("select finish_native_billing_card($1,'refunded','pay_test','REFUNDED')",[first]); await db.query("select finish_native_billing_card($1,'approved','pay_test','CONFIRMED')",[first]);
  expect((await db.query('select status from billing_payments where id=$1',[pay])).rows[0]).toEqual({status:'refunded'});
 });
 it.each(['pending','unknown','rejected','error','cancelled','refunded','approved'])('claims notification delivery for store outcome %s',async(state)=>{
  await db.query('delete from sales_catalog_card_attempts');await db.query('insert into sales_catalog_card_attempts(id,state) values($1,$2)',[first,state]);
  const r=await db.query<{a:unknown}>('select claim_checkout_payment_effects($1) as a',[first]);expect(r.rows[0].a).toBeTruthy();
  expect((await db.query<{a:unknown}>('select claim_checkout_payment_effects($1) as a',[first])).rows[0].a).toBeNull();
 });
 it('denies browser roles access to payment attempt records and mutation functions',async()=>{
  const result=await db.query("select has_table_privilege('anon','billing_card_attempts','select') as readable,has_function_privilege('authenticated','claim_native_billing_card(uuid,uuid,uuid,bigint,numeric,numeric,text)','execute') as writable");expect(result.rows[0]).toEqual({readable:false,writable:false});
 });
 it('updates the cart atomically and invalidates the prior payment revision',async()=>{
  const newInvoice='77777777-7777-4777-8777-777777777777', newPayment='88888888-8888-4888-8888-888888888888';
  await db.query("insert into billing_invoices(id,organization_id,subscription_id,status,total_brl) values($1,$2,$3,'open',100)",[newInvoice,org,sub]);
  await db.query("insert into billing_payments(id,organization_id,subscription_id,invoice_id,status,amount_brl) values($1,$2,$3,$4,'pending',100)",[newPayment,org,sub,newInvoice]);
  await db.query('select sync_native_billing_cart($1,$2,$3,$4,110,$5,$6)',[org,sub,newInvoice,newPayment,JSON.stringify({selected_bump_codes:['monthly']}),JSON.stringify([{item_type:'adjustment',description:'Monthly add-on',unit_price_brl:10,total_brl:10,metadata:{source:'dashboard_plan_checkout_bump'}}])]);
  expect((await db.query('select amount_brl,checkout_revision from billing_payments where id=$1',[newPayment])).rows[0]).toEqual({amount_brl:'110',checkout_revision:1});
  expect((await db.query('select * from billing_invoice_items where invoice_id=$1',[newInvoice])).rows).toHaveLength(1);
 });
});
