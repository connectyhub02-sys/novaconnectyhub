import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
let db: PGlite;
const org=randomUUID(), actor=randomUUID(), member=randomUUID(), sub=randomUUID(), inv=randomUUID(), pay=randomUUID();
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);
 create table organizations(id uuid primary key,owner_id uuid);create table organization_members(organization_id uuid,user_id uuid,role text);
 create table organization_subscriptions(id uuid primary key,organization_id uuid,provider_subscription_id text,billing_provider text,status text,subscription_kind text,plan_code text,current_period_end timestamptz,metadata jsonb default '{}');
 create table billing_invoices(id uuid primary key default gen_random_uuid(),organization_id uuid,subscription_id uuid,status text,subtotal_brl numeric,discount_brl numeric,total_brl numeric,provider text,provider_payment_id text,metadata jsonb default '{}');
 create table billing_payments(id uuid primary key default gen_random_uuid(),organization_id uuid,subscription_id uuid,invoice_id uuid,status text,amount_brl numeric,provider text,provider_payment_id text,provider_status text,paid_at timestamptz,payload jsonb default '{}',updated_at timestamptz);
 create table billing_invoice_items(id uuid default gen_random_uuid(),invoice_id uuid,organization_id uuid,item_type text,description text,quantity numeric,unit_price_brl numeric,total_brl numeric,credit_amount numeric,metadata jsonb default '{}');
 create table sales_catalog_card_attempts(id uuid primary key,state text,effects_completed_state text,effects_claimed_at timestamptz);
 create table intelligence_events(scope text,organization_id uuid,source_type text,source_id uuid,event_type text,title text,summary text,visibility text,tags text[],payload jsonb);`);
 await db.exec(readFileSync("supabase/migrations/0078_ecosystem_native_billing.sql","utf8"));
 await db.exec(readFileSync("supabase/migrations/0154_pix_automatic.sql","utf8"));
},30000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
 await db.exec("truncate billing_pix_events,billing_pix_payments,billing_pix_authorizations,billing_card_attempts,billing_invoice_items,billing_payments,billing_invoices,organization_subscriptions,organization_members,organizations,auth.users,intelligence_events cascade");
 await db.query("insert into auth.users values($1),($2)",[actor,member]);
 await db.query("insert into organizations values($1,$2)",[org,actor]);
 await db.query("insert into organization_members values($1,$2,'member')",[org,member]);
 await db.query("insert into organization_subscriptions(id,organization_id,status,subscription_kind,billing_provider,plan_code) values($1,$2,'pending','plan','asaas','pro')",[sub,org]);
 await db.query("insert into billing_invoices(id,organization_id,subscription_id,status,total_brl) values($1,$2,$3,'open',130)",[inv,org,sub]);
 await db.query(`insert into billing_payments(id,organization_id,subscription_id,invoice_id,status,provider,amount_brl,payload) values($1,$2,$3,$4,'pending','asaas',130,'{"checkout_kind":"initial","commercial_terms":{"price_brl":100,"billing_cycle":"recurring","billing_interval":"month"},"selected_bumps":[{"code":"monthly","recurrence":"monthly","price_brl":10},{"code":"once","recurrence":"one_time","price_brl":20}]}')`,[pay,org,sub,inv]);
});
async function begin(id=randomUUID(),user=actor,organization=org,amount=130){return (await db.query<{r:{claimed:boolean;authorization:{id:string;contract_id:string;state:string}}}>("select begin_billing_pix_authorization($1,$2,$3,$4,$5,'sandbox',0,$6,110,'MONTHLY','2035-10-17') r",[organization,user,sub,pay,id,amount])).rows[0].r;}
async function sync(id:string,state="CREATED",failure:string|null=null){
 const remote={id:"auth_fixture",status:state,contractId:id.replaceAll("-",""),customerId:"cus_fixture",subscriptionId:state==="CREATED"?"":"sub_fixture",value:110,frequency:"MONTHLY",startDate:"2035-10-17",paymentCreationMode:"SUBSCRIPTION",conciliationIdentifier:"txid_fixture",payload:"qr_fixture",encodedImage:"base64"};
 return (await db.query<{r:{state:string}}>("select sync_billing_pix_authorization($1,$2,$3) r",[id,remote,failure])).rows[0].r;
}
async function prepare(state="CREATED") {const a=await begin();await db.query("update billing_pix_authorizations set customer_id='cus_fixture',state='dispatching' where id=$1",[a.authorization.id]);await sync(a.authorization.id,state);return a.authorization.id;}
const bind=(id:string,provider="pay_initial",amount=130,initial=true)=>db.query<{r:string}>("select bind_billing_pix_payment($1,$2,$3,$4,'2035-10-17T12:00:00Z','2035-11-17T12:00:00Z') r",[id,provider,amount,initial]);
describe("Pix Automatic durable financial boundaries",()=>{
 it("scopes authorization and detects stale pricing before creating a mandate",async()=>{
  await expect(begin(randomUUID(),member)).rejects.toThrow("PIX_FORBIDDEN");
  await expect(begin(randomUUID(),actor,randomUUID())).rejects.toThrow("PIX_FORBIDDEN");
  await expect(begin(randomUUID(),actor,org,129)).rejects.toThrow("PIX_CHANGED");
  expect((await db.query("select * from billing_pix_authorizations")).rows).toHaveLength(0);
 });
 it("serializes two requests and blocks card, manual Pix and cart edits",async()=>{
  const [a,b]=await Promise.all([begin(),begin()]);expect([a,b].filter(x=>x.claimed)).toHaveLength(1);expect(a.authorization.id).toBe(b.authorization.id);
  await expect(db.query("select claim_native_billing_pix($1,$2)",[org,pay])).rejects.toThrow("BILLING_PAYMENT_BUSY");
  await expect(db.query("select claim_native_billing_card($1,$2,$3,0,130,110,'fixture')",[org,pay,randomUUID()])).rejects.toThrow("BILLING_PIX_PENDING");
  await expect(db.query("update billing_payments set amount_brl=140 where id=$1",[pay])).rejects.toThrow("BILLING_PIX_PENDING");
 });
 it("cannot activate from QR creation; binds one paid initial transaction only after ACTIVE",async()=>{
  const id=await prepare();await expect(bind(id)).rejects.toThrow("PIX_NOT_ACTIVE");
  expect((await db.query("select status from organization_subscriptions")).rows[0]).toEqual({status:"pending"});
  await sync(id,"ACTIVE"); const a=await bind(id),b=await bind(id);expect(a.rows).toEqual(b.rows);
  expect((await db.query("select initial_effects_completed from billing_pix_authorizations")).rows[0]).toEqual({initial_effects_completed:false});
  await expect(bind(id,"pay_duplicate")).rejects.toThrow("PIX_NOT_ACTIVE");
  expect((await db.query("select * from billing_pix_payments")).rows).toHaveLength(1);
 });
 it("retains an ambiguous creation hold and releases only definitive failure",async()=>{
  const id=await prepare();await sync(id,"CREATED","unknown");
  expect((await begin()).authorization.id).toBe(id);
  await expect(db.query("select claim_native_billing_pix($1,$2)",[org,pay])).rejects.toThrow("BILLING_PAYMENT_BUSY");
  await sync(id,"CREATED","provider_rejected");expect((await begin()).claimed).toBe(true);
 });
 it.each(["CANCELLED","EXPIRED","REFUSED"])("keeps terminal %s authoritative over delayed ACTIVE",async state=>{
  const id=await prepare();await sync(id,state);expect(await sync(id,"ACTIVE")).toMatchObject({state});
  expect((await db.query("select qr_payload from billing_pix_authorizations")).rows[0]).toEqual({qr_payload:null});
 });
 it("lets a definitive refusal switch to manual Pix without retaining the mandate recovery marker",async()=>{
  const id=await prepare();await sync(id,"REFUSED");await db.query("select claim_native_billing_pix($1,$2)",[org,pay]);
  const result=(await db.query<{payload:Record<string,unknown>}>("select payload from billing_payments where id=$1",[pay])).rows[0].payload;
  expect(result.payment_method).toBe("pix");expect(result.pix_creation_pending).toBe(true);expect(result.pix_automatic_authorization_id).toBeUndefined();
  expect((await db.query("select state from billing_pix_authorizations where id=$1",[id])).rows[0]).toEqual({state:"REFUSED"});
 });
 it("creates a recurring invoice exactly once and excludes one-time extras",async()=>{
  const id=await prepare("ACTIVE");await bind(id);
  await db.query("update organization_subscriptions set status='active',current_period_end='2035-10-17T12:00:00Z' where id=$1",[sub]);
  const result=await bind(id,"pay_renewal",110,false);expect((await bind(id,"pay_renewal",110,false)).rows).toEqual(result.rows);
  const invoice=result.rows[0].r.split(":")[3];
  expect((await db.query<{metadata:{selected_bump_codes:string[]}}>("select metadata from billing_invoices where id=$1",[invoice])).rows[0].metadata.selected_bump_codes).toEqual(["monthly"]);
  expect((await db.query("select sum(total_brl)::text total from billing_invoice_items where invoice_id=$1",[invoice])).rows[0]).toEqual({total:"110"});
  await expect(bind(id,"pay_duplicate_cycle",110,false)).rejects.toThrow("billing_pix_one_payment_per_cycle");
  await expect(bind(id,"pay_wrong_amount",130,false)).rejects.toThrow("PIX_INVALID_RENEWAL");
 });
 it("does not allow an existing active plan to create an immediate-payment mandate",async()=>{
  await db.query("update organization_subscriptions set status='active' where id=$1",[sub]);await expect(begin()).rejects.toThrow("PIX_INITIAL_ONLY");
 });
 it("denies browser roles access to mandate details and SQL mutations",async()=>{
  for(const role of ["anon","authenticated"]){
   expect((await db.query<{ok:boolean}>("select has_table_privilege($1,'billing_pix_authorizations','SELECT') ok",[role])).rows[0].ok).toBe(false);
   expect((await db.query<{ok:boolean}>("select has_function_privilege($1,'sync_billing_pix_authorization(uuid,jsonb,text)','EXECUTE') ok",[role])).rows[0].ok).toBe(false);
  }
 });
});
