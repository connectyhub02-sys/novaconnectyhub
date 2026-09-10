import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
export async function aiDatabaseFixture(){const db=new PGlite();await db.exec(`
create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;
create type billing_provider as enum('gemini');create type usage_event_status as enum('pending','completed','failed','refunded');
create table organizations(id uuid primary key,plan_code text default 'scale',status text default 'active',owner_id uuid,created_at timestamptz default now());
create table billing_plans(id uuid primary key,plan_code text);create table billing_cycles(id uuid primary key,organization_id uuid,plan_id uuid,cycle_start timestamptz,cycle_end timestamptz,status text,used_credits numeric default 0,included_credits numeric default 0,overage_credits numeric default 0,updated_at timestamptz);
create table organization_billing_limits(organization_id uuid primary key,daily_credit_limit numeric,monthly_credit_limit numeric,allow_overage boolean default false,overage_limit_credits numeric default 0,hard_block_when_empty boolean default true);
create table credit_wallets(id uuid primary key default gen_random_uuid(),organization_id uuid unique,balance_credits numeric default 100,reserved_credits numeric default 0,lifetime_used_credits numeric default 0,status text default 'active',updated_at timestamptz);
create table usage_events(id uuid primary key default gen_random_uuid(),organization_id uuid,provider billing_provider,feature_code text,model_id text,status usage_event_status,input_units numeric,output_units numeric,input_tokens bigint,output_tokens bigint,total_tokens bigint,provider_cost numeric,connecty_revenue_estimate numeric,gross_margin_estimate numeric,connecty_charge_credits numeric,request_id text,billing_mode text,metadata jsonb,error_message text,occurred_at timestamptz default now());
create table credit_transactions(id uuid primary key default gen_random_uuid(),organization_id uuid,wallet_id uuid,transaction_type text,amount_credits numeric,balance_after_credits numeric,provider billing_provider,usage_event_id uuid,description text,metadata jsonb,created_by uuid);
create function ensure_credit_wallet(uuid) returns void language sql as $$insert into credit_wallets(organization_id) values($1) on conflict do nothing$$;
create function resolve_organization_contract_access(uuid) returns jsonb language sql as $$select jsonb_build_object('allowed',status='active','billing_organization_id',id) from organizations where id=$1$$;
create function enqueue_connectyhub_trial_no_credits_message(uuid,uuid) returns void language sql as $$select$$;
`);const legacy=readFileSync("supabase/migrations/0034_credit_rollover_policy.sql","utf8");await db.exec(legacy.slice(legacy.indexOf("create or replace function public.debit_credit_wallet(")));
await db.exec(readFileSync("supabase/migrations/0106_ai_credit_reservations.sql","utf8"));
await db.exec(readFileSync("supabase/migrations/0119_simple_ai_usage.sql","utf8"));
const org=randomUUID(),project=randomUUID(),key=randomUUID();await db.query("insert into organizations(id) values($1)",[org]);await db.query("insert into ai_projects(id,organization_id,name) values($1,$2,'Projeto')",[project,org]);await db.query("insert into ai_api_keys(id,project_id,key_hash,key_prefix,name) values($1,$2,$3,'prefix','key')",[key,project,randomUUID()]);
async function claim(idem:string,hash="same"){return (await db.query<{r:Record<string,unknown>}>("select claim_ai_request($1,$2,$3) r",[key,idem,hash])).rows[0].r;}
async function reserve(id:unknown,amount:number){await db.query("select reserve_ai_credits($1,$2,'gemini-test','[]')",[id,amount]);}
async function finish(id:unknown,status:string,charge=0){return db.query("select finish_ai_request($1,$2,$3,'{\"ok\":true}',null)",[id,status,JSON.stringify({charge,input:2,output:3,cost:0.1})]);}
return {db,org,key,project,claim,reserve,finish};}
