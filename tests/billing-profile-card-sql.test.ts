import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";




let db: PGlite;
const org = randomUUID(), otherOrg = randomUUID(), actor = randomUUID(), member = randomUUID(), outsider = randomUUID();
const sub = randomUUID(), otherSub = randomUUID(), card = randomUUID(), oldAttempt = randomUUID();
const encrypted = "v1:fixture-iv:fixture-tag:fixture-ciphertext";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create table organizations(id uuid primary key,owner_id uuid);
    create table organization_members(organization_id uuid,user_id uuid,role text);
    create table organization_subscriptions(id uuid primary key,organization_id uuid,status text default 'active',subscription_kind text default 'plan',plan_code text default 'pro',current_period_start timestamptz default now(),current_period_end timestamptz default now()+interval '20 days',next_billing_at timestamptz default now()+interval '20 days',canceled_at timestamptz,billing_provider text default 'asaas',provider_subscription_id text,metadata jsonb default '{"commercial_terms":{"price_brl":97,"billing_cycle":"recurring"}}');
    create table billing_card_attempts(id uuid primary key,organization_id uuid,subscription_id uuid,state text);
    create table commercial_agreements(platform_subscription_id uuid,cancel_at_period_end boolean default false,state text default 'active');
    create table credit_topup_policies(organization_id uuid primary key,card_method_id uuid,enabled boolean default true,agreed_amount_brl numeric default 30,monthly_cap_brl numeric default 90,authorized_by uuid,updated_at timestamptz);
    create table billing_payments(id uuid primary key,amount numeric); create table billing_invoices(id uuid primary key,amount numeric); create table billing_cycles(id uuid primary key,credits numeric);
    create table platform_customer_journey(user_id uuid,event_key text unique,event_type text,source_id uuid,payload jsonb);
  `);
  // Execute the existing vault DDL with its real constraints and RLS.
  await db.exec(readFileSync("supabase/migrations/0093_managed_asaas_renewals.sql", "utf8").split("alter table public.billing_card_attempts")[0]);
  await db.exec(readFileSync("supabase/migrations/0152_billing_payment_method_management.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0153_subscription_card_replacement.sql", "utf8"));
  await db.exec(`create table organization_billing_addresses(organization_id uuid primary key references organizations(id) on delete cascade,address jsonb not null,contact jsonb not null default '{}',updated_by uuid,updated_at timestamptz not null default now());
    alter table organization_billing_addresses enable row level security; grant all on organization_billing_addresses to service_role;
    create table maintenance_audit_logs(actor_id uuid,event_type text,target_table text,target_id uuid,metadata jsonb);
    create function record_billing_lead_context(uuid,uuid,text,text,uuid) returns text language sql as $$ select 'queued'::text $$;`);
  await db.exec(readFileSync("supabase/migrations/0157_billing_profile_and_card_recovery.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("truncate billing_card_replacements,billing_asaas_card_vault,billing_card_attempts,credit_topup_policies,commercial_agreements,organization_subscriptions,organization_members,organizations,auth.users,billing_payments,billing_invoices,billing_cycles cascade");
  await db.exec("delete from platform_customer_journey; delete from maintenance_audit_logs;");
  await db.query("insert into auth.users values ($1),($2),($3)", [actor, member, outsider]);
  await db.query("insert into organizations values ($1,$2),($3,$4)", [org, actor, otherOrg, outsider]);
  await db.query("insert into organization_members values ($1,$2,'member')", [org, member]);
  await db.query("insert into organization_subscriptions(id,organization_id) values ($1,$2),($3,$4)", [sub, org, otherSub, otherOrg]);
  await db.query("insert into billing_card_attempts values ($1,$2,$3,'approved')", [oldAttempt, org, sub]);
  await db.query("insert into billing_asaas_card_vault(id,organization_id,subscription_id,activation_attempt_id,customer_id,token_encrypted,consent_version,status) values ($1,$2,$3,$4,'cus_original',$5,'connectyhub-advance-3-2-1-v1','active')", [card, org, sub, oldAttempt, encrypted]);
  await db.query("insert into credit_topup_policies(organization_id,card_method_id,authorized_by) values ($1,$2,$3)", [org, card, actor]);
});

const holder = {name:"Billing Person",email:"billing@example.test",cpfCnpj:"12345678909",phone:"11999999999",postalCode:"01001000",addressNumber:"42",ccv:"NEVER_STORE",cardNumber:"4111111111111111",token:"NEVER_STORE"};
const address = {postalCode:"01001000",street:"Rua Confirmada",number:"10",complement:"",neighborhood:"Centro",city:"São Paulo",state:"SP",country:"BR"};
const metadata = {brand:"visa",exp_month:"12",exp_year:"2035"};
async function begin(request=randomUUID()) { await db.query('select begin_billing_card_replacement($1,$2,$3,$4)',[org,actor,sub,request]); return request; }
async function finish(request:string, display=metadata, details=holder) {
 return (await db.query<{r:{state:string}}> ('select finish_billing_card_replacement_profile($1,$2,$3,$4,$5,$6,null,$7,$8) r',[org,actor,sub,request,encrypted,'1111',display,details])).rows[0].r;
}
async function profile() { return (await db.query<{address:typeof address;contact:Record<string,string>;suggestion:{id:string;contact:Record<string,string>};address_confirmed:boolean;updated_at:string}>('select * from organization_billing_addresses where organization_id=$1',[org])).rows[0]; }

describe('billing profile and card recovery transactions',()=>{
 it('saves an added card and holder once and attributes admin changes to the organization owner',async()=>{
  await db.query("update organization_members set role='admin' where user_id=$1",[member]);
  const request=randomUUID();
  const end=(await db.query<{value:string}>('select current_period_end::text value from organization_subscriptions where id=$1',[sub])).rows[0].value;
  const params=[org,member,sub,request,card,end,{customer_id:'cus_original',token_encrypted:encrypted,last_digits:'1111',...metadata},holder];
  const sql="select set_billing_default_card_profile($1,$2,$3,$4,$5,$6,'connectyhub-card-default-v1',null,$7,$8)";
  await db.query(sql,params);const first=await profile();await db.query(sql,params);
  expect(await profile()).toEqual(first);
  expect(first.suggestion.contact.name).toBe(holder.name);
  expect((await db.query('select * from billing_asaas_card_vault')).rows).toHaveLength(2);
  expect((await db.query('select distinct user_id from platform_customer_journey')).rows).toEqual([{user_id:actor}]);
 });
 it('persists safe metadata and reviewable holder without overwriting confirmed billing',async()=>{
  await db.query('insert into organization_billing_addresses(organization_id,address,contact) values($1,$2,$3)',[org,address,{name:'Confirmed Owner'}]);
  const prior=(await db.query('select * from organization_subscriptions where id=$1',[sub])).rows;
  const request=await begin();expect((await finish(request)).state).toBe('succeeded');
  expect(await profile()).toMatchObject({address,contact:{name:'Confirmed Owner'},address_confirmed:true,suggestion:{id:request,contact:{name:holder.name,cpfCnpj:holder.cpfCnpj}}});
  const cards=(await db.query<{id:string;status:string}>('select * from billing_asaas_card_vault')).rows;
  expect(cards).toHaveLength(2);expect(cards.filter(c=>c.status==='active')).toHaveLength(1);
  expect(cards.find(c=>c.status==='active')).toMatchObject({...metadata,last_digits:'1111',selectable:true});
  expect((await db.query('select * from organization_subscriptions where id=$1',[sub])).rows).toEqual(prior);
  const stored=JSON.stringify(await profile());expect(stored).not.toContain('4111111111111111');expect(stored).not.toContain('NEVER_STORE');expect(stored).not.toContain('ccv');
  const journal=(await db.query<{user_id:string;payload:unknown}>('select user_id,payload from platform_customer_journey')).rows;
  expect(journal[0].user_id).toBe(actor);expect(JSON.stringify(journal)).not.toContain(holder.cpfCnpj);
 });
 it('keeps an incomplete address explicitly unconfirmed and makes replay inert',async()=>{
  const request=await begin();await finish(request);const first=await profile();
  expect(first.address_confirmed).toBe(false);expect(first.address).toEqual({});
  await finish(request,metadata,{...holder,name:'Late replay'});expect(await profile()).toEqual(first);
  expect((await db.query('select * from maintenance_audit_logs')).rows).toHaveLength(1);
 });
 it('requires explicit confirmation and rejects stale profiles',async()=>{
  const request=await begin();await finish(request);const draft=await profile();
  await expect(db.query('select confirm_organization_billing_profile($1,$2,$3,$4,null,$5,$6)',[org,actor,address,holder,request,sub])).rejects.toThrow('BILLING_PROFILE_CHANGED');
  await db.query('select confirm_organization_billing_profile($1,$2,$3,$4,$5,$6,$7)',[org,actor,address,holder,draft.updated_at,request,sub]);
  expect(await profile()).toMatchObject({address,address_confirmed:true,suggestion:null,contact:{name:holder.name,cpfCnpj:holder.cpfCnpj}});
  expect(JSON.stringify(await profile())).not.toContain('NEVER_STORE');
 });
 it('isolates organization and actor, even for a valid draft',async()=>{
  await expect(db.query('select capture_billing_holder($1,$2,$3,$4,$5,$6)',[otherOrg,outsider,sub,randomUUID(),'card_added',holder])).rejects.toThrow('BILLING_SCOPE');
  await expect(db.query('select capture_billing_holder($1,$2,$3,$4,$5,$6)',[org,member,sub,randomUUID(),'card_added',holder])).rejects.toThrow('BILLING_FORBIDDEN');
  expect((await db.query('select * from organization_billing_addresses')).rows).toHaveLength(0);
 });
 it('allows an overdue plan to change its default while preserving dates, balance and paid status',async()=>{
  await db.query("update organization_subscriptions set status='past_due',current_period_end=now()-interval '1 day',next_billing_at=now()-interval '1 day' where id=$1",[sub]);
  await db.query("update billing_asaas_card_vault set selectable=true where id=$1",[card]);
  const prior=(await db.query('select * from organization_subscriptions where id=$1',[sub])).rows;
  expect((await finish(await begin())).state).toBe('succeeded');
  const current=(await db.query<{id:string}>("select id from billing_asaas_card_vault where status='active'")).rows[0];
  const end=(await db.query<{value:string}>('select current_period_end::text value from organization_subscriptions where id=$1',[sub])).rows[0].value;
  await db.query("select set_billing_default_card_profile($1,$2,$3,$4,$5,$6,'connectyhub-card-default-v1',$7,null,null)",[org,actor,sub,randomUUID(),current.id,end,card]);
  expect((await db.query("select id from billing_asaas_card_vault where status='active'")).rows).toEqual([{id:card}]);
  expect((await db.query('select * from organization_subscriptions where id=$1',[sub])).rows).toEqual(prior);
  expect((await db.query('select * from billing_payments')).rows).toHaveLength(0);
 });
 it('retains busy-payment and canceled-plan guards',async()=>{
  await db.query("insert into billing_card_attempts values($1,$2,$3,'unknown')",[randomUUID(),org,sub]);
  const request=await begin();expect((await finish(request)).state).toBe('failed');expect(await profile()).toBeUndefined();
  await db.query("delete from billing_card_attempts where state='unknown'");
  await db.query("update organization_subscriptions set status='canceled' where id=$1",[sub]);
  expect((await finish(await begin())).state).toBe('failed');
 });
 it('rolls back the new default when profile metadata cannot be saved',async()=>{
  const request=await begin();await expect(finish(request,{...metadata,exp_month:'99'})).rejects.toThrow();
  expect((await db.query("select id from billing_asaas_card_vault where status='active'")).rows).toEqual([{id:card}]);
  expect(await profile()).toBeUndefined();
  expect((await db.query('select state from billing_card_replacements where id=$1',[request])).rows).toEqual([{state:'processing'}]);
 });
 it('keeps profile and new RPCs private',async()=>{
  expect((await db.query<{allowed:boolean}>("select has_function_privilege('authenticated','capture_billing_holder(uuid,uuid,uuid,uuid,text,jsonb)','execute') allowed")).rows[0].allowed).toBe(false);
  expect((await db.query<{allowed:boolean}>("select has_table_privilege('authenticated','organization_billing_addresses','select') allowed")).rows[0].allowed).toBe(false);
 });
});
