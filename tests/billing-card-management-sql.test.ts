import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
let db:PGlite;
const org=randomUUID(),otherOrg=randomUUID(),owner=randomUUID(),otherOwner=randomUUID(),sub=randomUUID(),oldCard=randomUUID();
const end="2030-10-14T13:33:55Z";
const encrypted={customer_id:"cus_fixture",token_encrypted:"v1:fixture",brand:"VISA",last_digits:"4242",exp_month:"12",exp_year:"2032"};
const call=(overrides:unknown[]=[],request=randomUUID())=>db.query<{r:{methodId:string;replayed:boolean;topupUpdated:boolean}}>("select set_billing_default_card($1,$2,$3,$4,$5,$6,$7,$8,$9) r",[org,owner,sub,request,oldCard,end,"connectyhub-card-default-v1",null,encrypted].map((v,i)=>i in overrides?overrides[i]:v));
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key);
 create table organizations(id uuid primary key,owner_id uuid);
 create table organization_members(organization_id uuid,user_id uuid,role text);
 create table organization_subscriptions(id uuid primary key,organization_id uuid,status text,billing_provider text,provider_subscription_id text,metadata jsonb,current_period_end timestamptz,next_billing_at timestamptz,plan_code text);
 create table billing_card_attempts(id uuid primary key,organization_id uuid,subscription_id uuid,state text);
 create table billing_asaas_card_vault(id uuid primary key default gen_random_uuid(),organization_id uuid references organizations(id),subscription_id uuid references organization_subscriptions(id),activation_attempt_id uuid not null unique references billing_card_attempts(id),customer_id text not null,token_encrypted text not null,consent_version text not null,consent_at timestamptz default now(),status text not null default 'pending' check(status in ('pending','active','inactive')),created_at timestamptz default now());
 create unique index billing_asaas_one_active_method on billing_asaas_card_vault(subscription_id) where status='active';
 create table credit_topup_policies(organization_id uuid primary key,card_method_id uuid references billing_asaas_card_vault(id),enabled boolean,monthly_cap_brl numeric,updated_at timestamptz);
 create table platform_customer_journey(user_id uuid,event_key text unique,event_type text,source_id uuid,payload jsonb);
 `);await db.exec(readFileSync("supabase/migrations/0152_billing_payment_method_management.sql","utf8"));
 await db.query("insert into auth.users values ($1),($2)",[owner,otherOwner]);await db.query("insert into organizations values ($1,$2),($3,$4)",[org,owner,otherOrg,otherOwner]);
 await db.query("insert into organization_subscriptions values ($1,$2,'active','asaas',null,'{\"commercial_terms\":{\"billing_cycle\":\"recurring\"}}',$3,$3,'business')",[sub,org,end]);
},30000);
beforeEach(async()=>{
 await db.exec("delete from billing_payment_method_changes;delete from platform_customer_journey;delete from credit_topup_policies;delete from billing_asaas_card_vault;delete from billing_card_attempts;");
 await db.query("insert into billing_asaas_card_vault(id,organization_id,subscription_id,customer_id,token_encrypted,consent_version,status,selectable) values ($1,$2,$3,'cus_fixture','v1:old','connectyhub-advance-3-2-1-v1','active',true)",[oldCard,org,sub]);
 await db.query("insert into credit_topup_policies values ($1,$2,true,250,now())",[org,oldCard]);
});
afterAll(()=>db.close());
it("atomically replaces the default without changing cycle, plan or due date; moves only existing topup authorization",async()=>{
 const before=(await db.query("select * from organization_subscriptions")).rows;
 const r=(await call()).rows[0].r;expect(r.topupUpdated).toBe(true);
 expect((await db.query("select * from organization_subscriptions")).rows).toEqual(before);
 expect((await db.query("select card_method_id,enabled,monthly_cap_brl from credit_topup_policies")).rows).toEqual([{card_method_id:r.methodId,enabled:true,monthly_cap_brl:"250"}]);
 expect((await db.query("select id,status from billing_asaas_card_vault order by status")).rows).toEqual([{id:r.methodId,status:"active"},{id:oldCard,status:"inactive"}]);
 expect((await db.query("select * from billing_card_attempts")).rows).toHaveLength(0);
 const audit=JSON.stringify((await db.query("select payload from platform_customer_journey")).rows);expect(audit).toContain('"charged":false');expect(audit).not.toMatch(/token|4242|fixture/);
});
it("retains the old default and topup authorization when saving the new card fails",async()=>{
 const args:unknown[]=[];args[8]={...encrypted,exp_month:"99"};await expect(call(args)).rejects.toThrow("CARD_INVALID");
 expect((await db.query("select id from billing_asaas_card_vault where status='active'")).rows).toEqual([{id:oldCard}]);
 expect((await db.query("select card_method_id from credit_topup_policies")).rows).toEqual([{card_method_id:oldCard}]);
});
it("rolls back the replacement if audit persistence fails",async()=>{
 await db.exec("alter table platform_customer_journey add constraint fail_audit check(false) not valid");
 await expect(call()).rejects.toThrow();
 await db.exec("alter table platform_customer_journey drop constraint fail_audit");
 expect((await db.query("select id,status from billing_asaas_card_vault")).rows).toEqual([{id:oldCard,status:"active"}]);
});
it("prevents cross-organization and unauthorized changes",async()=>{
 let args:unknown[]=[];args[1]=otherOwner;await expect(call(args)).rejects.toThrow("CARD_FORBIDDEN");
 args=[otherOrg,otherOwner];await expect(call(args)).rejects.toThrow("CARD_NOT_FOUND");
 args=[];args[7]=randomUUID();await expect(call(args)).rejects.toThrow("CARD_NOT_FOUND");
});
it("requires explicit consent, rejects stale defaults and blocks in-flight payments",async()=>{
 let args:unknown[]=[];args[6]="wrong";await expect(call(args)).rejects.toThrow("CARD_CONSENT_REQUIRED");
 args=[];args[4]=null;await expect(call(args)).rejects.toThrow("CARD_STALE");
 await db.query("insert into billing_card_attempts values ($1,$2,$3,'unknown')",[randomUUID(),org,sub]);await expect(call()).rejects.toThrow("CARD_PAYMENT_BUSY");
});
it("replays the same request once and allows a previously saved card to become default again",async()=>{
 const request=randomUUID(),r=(await call([],request)).rows[0].r;
 expect((await call([],request)).rows[0].r).toEqual({...r,replayed:true});
 expect((await db.query("select * from billing_payment_method_changes")).rows).toHaveLength(1);
 const args:unknown[]=[];args[4]=r.methodId;args[7]=oldCard;args[8]=null;
 expect((await call(args)).rows[0].r.methodId).toBe(oldCard);
 expect((await db.query("select card_method_id from credit_topup_policies")).rows).toEqual([{card_method_id:oldCard}]);
});
it("does not grant client roles access to the mutation RPC or receipt table",async()=>{
 const r=await db.query("select has_function_privilege('authenticated','set_billing_default_card(uuid,uuid,uuid,uuid,uuid,timestamptz,text,uuid,jsonb)','EXECUTE') allowed,has_table_privilege('anon','billing_payment_method_changes','SELECT') readable");expect(r.rows).toEqual([{allowed:false,readable:false}]);
});
