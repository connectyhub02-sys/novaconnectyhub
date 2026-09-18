import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
let db: PGlite;
const org=randomUUID(), otherOrg=randomUUID(), platform=randomUUID(), buyer=randomUUID(), sub=randomUUID(), lead=randomUUID(), wrongLead=randomUUID(), agent=randomUUID();
const address={postalCode:"01001000",street:"Praça da Sé",number:"10",complement:"",neighborhood:"Sé",city:"São Paulo",state:"SP",country:"BR"};
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
 create table organizations(id uuid primary key,owner_id uuid);
 create table profiles(id uuid primary key,phone_normalized text,phone_verified_at timestamptz,full_name text);
 create table organization_subscriptions(id uuid primary key,organization_id uuid,metadata jsonb default '{}',payer_email text,status text,plan_code text,current_period_end timestamptz,next_billing_at timestamptz);
 create table billing_payments(id uuid default gen_random_uuid(),subscription_id uuid,organization_id uuid,status text,amount_brl numeric,created_at timestamptz default now());
 create table leads(id uuid primary key default gen_random_uuid(),organization_id uuid,phone_number text,channel text default 'whatsapp',source text,display_name text,metadata jsonb default '{}',updated_at timestamptz);
 create unique index lead_phone on leads(organization_id,channel,phone_number) where phone_number is not null;
 create table platform_customer_identities(user_id uuid primary key,lead_id uuid unique,verified_phone text,updated_at timestamptz);
 create table platform_customer_journey(id uuid primary key default gen_random_uuid(),user_id uuid,event_key text,event_type text,source_id uuid,payload jsonb,created_at timestamptz default now(),archived_at timestamptz);
 create table maintenance_audit_logs(actor_id uuid,event_type text,target_table text,target_id uuid,metadata jsonb);
 create table whatsapp_instances(id uuid default gen_random_uuid(),organization_id uuid,metadata jsonb,updated_at timestamptz);
 create table billing_notification_events(id uuid,recipient_phone text,selected_agent_id uuid);
 create table platform_billing_settings(setting_key text,billing_whatsapp_agent_id uuid);
 create table intelligence_events(scope text,organization_id uuid,source_type text,source_id text,event_type text,title text,summary text,visibility text,tags text[],payload jsonb);
 create function lead_archive_safe_json(value jsonb) returns jsonb language sql immutable as 'select value';
 create function archive_platform_customer_journey(p_limit integer default 100) returns integer language plpgsql as $$ declare j platform_customer_journey; begin perform public.lead_archive_safe_json(j.payload)||jsonb_build_object('fixture',true); return 0;end $$;
 create function archive_platform_financial_change() returns trigger language plpgsql as $$ begin perform jsonb_build_object('selected_bumps',new.payload->'selected_bumps'); return new; end $$;`);
 const journey=readFileSync('supabase/migrations/0085_platform_customer_journey.sql','utf8');
 await db.exec(journey.slice(journey.indexOf('create or replace function public.archive_platform_customer_journey'),journey.indexOf('revoke all on function public.archive_platform_customer_journey')));
 await db.exec(readFileSync('supabase/migrations/0155_organization_billing_address.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/0156_billing_address_semantics.sql','utf8'));
 await db.query('insert into auth.users values($1)',[buyer]);
 await db.query('insert into organizations values($1,$2),($3,$2),($4,$2)',[org,buyer,otherOrg,platform]);
 await db.query("insert into profiles(id,phone_normalized,phone_verified_at) values($1,'5511999999999',now())",[buyer]);
 await db.query("insert into organization_subscriptions(id,organization_id,status,plan_code,metadata) values($1,$2,'pending','scale',jsonb_build_object('lead_id',$3::text))",[sub,org,wrongLead]);
 await db.query("insert into leads(id,organization_id,phone_number,metadata) values($1,$2,'5511999999999','{\"email\":\"trusted@example.test\",\"address\":\"Existing address\"}'),($3,$4,'5511999999999','{}')",[lead,platform,wrongLead,org]);
 await db.query("insert into platform_customer_identities(user_id,lead_id,verified_phone) values($1,$2,'5511999999999')",[buyer,lead]);
 await db.query("insert into whatsapp_instances(organization_id,metadata) values($1,jsonb_build_object('admin_whatsapp',true,'agent_id',$2::text));",[platform,agent]);
 await db.query("insert into platform_billing_settings values('default',$1)",[agent]);
},30000);
afterAll(async()=>{await db?.close()});
describe.sequential('billing relationship ownership',()=>{
 it('saves address and queues the organization owner, ignoring customer-CRM metadata',async()=>{
  await db.query('select save_organization_billing_address($1,$2,$3,$4,$5)',[org,buyer,address,{name:'Billing Person',email:'new@example.test',phone:'11999999999',documentPreview:'***8909'},sub]);
  const journal=(await db.query<{user_id:string,payload:Record<string,unknown>}>('select user_id,payload from platform_customer_journey')).rows[0];
  expect(journal.user_id).toBe(buyer); expect(journal.payload.billing_address).toEqual(address); expect(journal.payload.document_preview).toBe('***8909');
  expect((await db.query<{metadata:unknown}>('select metadata from leads where id=$1',[wrongLead])).rows[0].metadata).toEqual({});
 });
 it('archives to verified platform lead and preserves conflicting facts',async()=>{
  const j=(await db.query<{id:string,payload:Record<string,unknown>}>('select id,payload from platform_customer_journey limit 1')).rows[0];
  expect((await db.query<{archived:number}>('select archive_platform_customer_journey(100) archived')).rows[0].archived).toBe(1);
  const facts=(await db.query<{metadata:Record<string,unknown>}>('select metadata from leads where id=$1',[lead])).rows[0].metadata;
  expect(facts.email).toBe('trusted@example.test');expect(facts.address).toBe('Existing address');expect(facts.billing_address).toEqual(address);
  expect((await db.query<{metadata:unknown}>('select metadata from leads where id=$1',[wrongLead])).rows[0].metadata).toEqual({});
  await expect(db.query("insert into intelligence_events(organization_id,source_type,source_id,event_type,payload) values($1,'platform_customer',$2,'lead.connectyhub_billing_address_confirmed',$3)",[org,j.id,{lead_id:wrongLead}])).rejects.toThrow('PLATFORM_LEAD_SCOPE');
 });
 it('rejects a checkout belonging to another organization atomically',async()=>{
  await expect(db.query('select save_organization_billing_address($1,$2,$3,$4,$5)',[otherOrg,buyer,address,{},sub])).rejects.toThrow('CHECKOUT_SCOPE');
  expect((await db.query('select * from organization_billing_addresses where organization_id=$1',[otherOrg])).rows).toHaveLength(0);
 });
 it('has private grants and records an explicit pending note without a verified identity',async()=>{
  await db.query('update profiles set phone_verified_at=null where id=$1',[buyer]);
  const result=await db.query<{result:string}>("select record_billing_lead_context($1,$2,'method_selected','pix_automatic',$3) result",[org,sub,buyer]);
  expect(result.rows[0].result).toBe('queued_awaiting_verified_phone_no_lead_updated');
  expect((await db.query<{allowed:boolean}>("select has_table_privilege('authenticated','organization_billing_addresses','SELECT') allowed")).rows[0].allowed).toBe(false);
 });
 it('strips financial secrets and identifiers from payment facts',async()=>{
  const result=await db.query<{facts:unknown}>("select platform_lead_billing_facts('payment',$1) facts",[{status:'approved',amount_brl:497,provider_payment_id:'private',cardNumber:'secret',ccv:'123',pix_qr_code:'secret'}]);
  expect(result.rows[0].facts).toEqual({status:'approved',amount_brl:497,source:'platform_billing'});
 });
});
