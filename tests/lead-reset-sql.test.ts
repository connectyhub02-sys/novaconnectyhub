import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";

let db: PGlite;
let org: string, foreign: string, lead: string, other: string, chat: string, order: string, actor: string;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table organizations(id uuid primary key);
    create table leads(id uuid primary key default gen_random_uuid(),organization_id uuid references organizations,channel text default 'whatsapp',phone_number text,last_message_at timestamptz,metadata jsonb default '{}');
    create table conversations(id uuid primary key,organization_id uuid,lead_id uuid references leads on delete set null,provider_chat_id text,metadata jsonb default '{}');
    create table conversation_messages(id uuid primary key,organization_id uuid,conversation_id uuid references conversations,lead_id uuid references leads,payload jsonb default '{}');
    create table sales_catalog_orders(id uuid primary key,organization_id uuid,lead_id uuid references leads on delete set null,conversation_id uuid references conversations,metadata jsonb default '{}',parent_id uuid references sales_catalog_orders);
    create table sessions(id uuid primary key,order_id uuid references sales_catalog_orders,organization_id uuid);
    alter table sales_catalog_orders add column session_id uuid references sessions;
    create table items(order_id uuid references sales_catalog_orders,item integer,primary key(order_id,item));
    create table agent_runs(id uuid primary key,organization_id uuid,run_status text,metadata jsonb default '{}');
    create table usage_events(id uuid primary key,agent_run_id uuid references agent_runs on delete set null,metadata jsonb,amount numeric);
    create table automation_dispatches(id uuid primary key,organization_id uuid,lead_id uuid,status text);
    create table lead_message_archive(id uuid primary key,organization_id uuid,lead_id uuid references leads on delete cascade,claimed_at timestamptz);
    create table lead_files(id uuid primary key,organization_id uuid,lead_id uuid references leads on delete set null,object_key text,byte_size bigint,metadata jsonb);
    create table intelligence_events(id uuid primary key,organization_id uuid,payload jsonb);
    create table intelligence_memory(id uuid primary key,organization_id uuid,tags text[],metadata jsonb);
    create table whatsapp_webhook_events(id uuid primary key,organization_id uuid,provider_chat_id text);
    create table generated_media(id uuid primary key,organization_id uuid,r2_object_key text,bytes_size bigint);
    create table empty_legacy(lead_id uuid);
    create table released(bytes bigint);
    create table archive_calls(id uuid);
    create function archive_lead_message_trigger() returns trigger language plpgsql security definer as $$
      begin insert into archive_calls values(coalesce(new.id,old.id));
      if tg_op='DELETE' then return old; else return new; end if; end $$;
    create trigger archive_messages after insert or update or delete on conversation_messages for each row execute function archive_lead_message_trigger();
    create function release_organization_storage_usage(uuid,bigint,integer,text,jsonb) returns void language sql as $$insert into released values($2)$$;`);
  await db.exec(readFileSync("supabase/migrations/0134_lead_reset.sql", "utf8"));
  [org, foreign, lead, other, chat, order, actor] = Array.from({ length: 7 }, () => randomUUID());
  await db.query("insert into organizations values($1),($2)", [org, foreign]);
  await db.query("insert into leads(id,organization_id,phone_number) values($1,$2,'5511999999999'),($3,$4,'5511999999999')", [lead,org,other,foreign]);
  await db.query("insert into conversations values($1,$2,$3,'chat','{}')", [chat,org,lead]);
  await db.query("insert into sales_catalog_orders(id,organization_id,lead_id,conversation_id) values($1,$2,$3,$4)",[order,org,lead,chat]);
});
afterEach(async () => { await db.close(); });
const reset = (confirm = true, scope = org) => db.query<{result: {deleted:boolean;complete:boolean;jobId:string;counts:Record<string,number>}}>("select reset_lead_data($1,$2,$3,$4) result",[scope,lead,actor,confirm]);

it("purges active and detached archives, JSON links, SET NULL children and cyclic orders without touching another company", async () => {
  const session = randomUUID(), run = randomUUID();
  await db.query("insert into sessions values($1,$2,$3)",[session,order,org]);
  await db.query("update sales_catalog_orders set session_id=$1 where id=$2",[session,order]);
  await db.query("insert into items values($1,1),($1,2)",[order]);
  await db.query("insert into conversations values($1,$2,null,'archive',$3)",[randomUUID(),org,{original_lead_id:lead}]);
  await db.query("insert into agent_runs values($1,$2,'completed',$3)",[run,org,{conversationId:chat}]);
  await db.query("insert into usage_events values($1,$2,'{\"private\":true}',25)",[randomUUID(),run]);
  await db.query("insert into intelligence_events values($1,$2,$3)",[randomUUID(),org,{lead_id:lead}]);
  await db.query("insert into intelligence_memory values($1,$2,'{agent_learning}',$3),($4,$2,'{knowledge}','{}')",[randomUUID(),org,{source_conversation_id:chat},randomUUID()]);
  const preview = (await reset(false)).rows[0].result;
  expect(preview.deleted).toBe(false); expect(preview.counts.conversations).toBe(2);
  const done = (await reset()).rows[0].result;
  expect(done.complete).toBe(true);
  for (const table of ["conversations","sales_catalog_orders","items","sessions","agent_runs","intelligence_events"]) expect((await db.query(`select * from ${table}`)).rows).toEqual([]);
  expect((await db.query("select id from leads")).rows).toEqual([{id:other}]);
  expect((await db.query("select tags from intelligence_memory")).rows).toEqual([{tags:["knowledge"]}]);
  expect((await db.query("select agent_run_id,metadata,amount::text from usage_events")).rows).toEqual([{agent_run_id:null,metadata:{},amount:"25"}]);
  expect((await reset()).rows[0].result.jobId).toBe(done.jobId);
});

it("rejects foreign scope, cross-company references, running work and unprivileged calls atomically", async () => {
  await expect(reset(true,foreign)).rejects.toThrow("RESET_LEAD_NOT_FOUND");
  await db.query("insert into sessions values($1,$2,$3)",[randomUUID(),order,foreign]);
  await expect(reset()).rejects.toThrow("RESET_CROSS_ORGANIZATION_REFERENCE");
  expect((await db.query("select * from lead_reset_jobs")).rows).toEqual([]);
  await db.exec("delete from sessions");
  await db.query("insert into agent_runs values($1,$2,'running',$3)",[randomUUID(),org,{leadId:lead}]);
  await expect(reset()).rejects.toThrow("RESET_ATTENDANCE_BUSY");
  expect((await db.query("select has_function_privilege('authenticated','reset_lead_data(uuid,uuid,uuid,boolean)','EXECUTE') callable,has_table_privilege('anon','lead_reset_jobs','SELECT') readable")).rows[0]).toEqual({callable:false,readable:false});
});

it("detaches nullable checkout references from another tenant without deleting its session or customer", async () => {
  await db.exec("create table foreign_visits(id uuid primary key,organization_id uuid,order_id uuid references sales_catalog_orders on delete set null,lead_id uuid references leads on delete set null)");
  const visit = randomUUID();
  await db.query("insert into foreign_visits values($1,$2,$3,$4)",[visit,foreign,order,other]);
  await reset();
  expect((await db.query("select * from foreign_visits")).rows).toEqual([{id:visit,organization_id:foreign,order_id:null,lead_id:other}]);
});

it("suppresses re-archiving only during the scoped reset and removes its private transaction markers", async () => {
  const message = randomUUID();
  await db.query("insert into conversation_messages values($1,$2,$3,$4,'{}')",[message,org,chat,lead]);
  expect((await db.query("select * from archive_calls")).rows).toHaveLength(1);
  await reset();
  expect((await db.query("select * from archive_calls")).rows).toHaveLength(1);
  expect((await db.query("select * from lead_reset_internal.active_targets")).rows).toEqual([]);
  expect((await db.query("select has_table_privilege('authenticated','lead_reset_internal.active_targets','INSERT') writable")).rows[0]).toEqual({writable:false});
  await db.query("insert into conversation_messages values($1,$2,null,$3,'{}')",[randomUUID(),foreign,other]);
  expect((await db.query("select * from archive_calls")).rows).toHaveLength(2);
});

it("waits for storage, acknowledges quota only once, rejects old replays and allows a new contact", async () => {
  await db.query("insert into lead_files values($1,$2,$3,'private/file',123,'{\"storage_bucket\":\"lead-archive\"}')",[randomUUID(),org,lead]);
  const done = (await reset()).rows[0].result;
  expect(done.complete).toBe(false);
  await expect(db.query("insert into leads(organization_id,phone_number,last_message_at) values($1,'5511999999999',clock_timestamp())",[org])).rejects.toThrow("LEAD_RESET_OLD_EVENT");
  for (let i=0;i<2;i++) await db.query("select complete_lead_reset_asset($1,$2,0)",[org,done.jobId]);
  expect((await db.query("select bytes::text from released")).rows).toEqual([{bytes:"123"}]);
  expect((await db.query("select assets from lead_reset_jobs")).rows[0]).toEqual({assets:[{done:true}]});
  await expect(db.query("insert into leads(organization_id,phone_number,last_message_at) values($1,'5511999999999','2000-01-01')",[org])).rejects.toThrow("LEAD_RESET_OLD_EVENT");
  await db.query("insert into leads(organization_id,phone_number,last_message_at) values($1,'5511999999999',clock_timestamp())",[org]);
  expect((await db.query("select lead_reset_message_status($1,'5511999999999','2000-01-01',true) status",[org])).rows[0]).toEqual({status:"old"});
  expect((await db.query("select lead_reset_message_status($1,'5511999999999',clock_timestamp(),true) status",[org])).rows[0]).toEqual({status:"allowed"});
});

it("removes earlier archived copies of the same contact while preserving a different phone and another tenant", async () => {
  const archived = randomUUID(), separate = randomUUID(), archivedChat = randomUUID();
  await db.query("insert into leads(id,organization_id,metadata) values($1,$2,'{\"archived_reopened_original_phone\":\"5511999999999\"}'),($3,$2,'{\"archived_reopened_original_phone\":\"5511888888888\"}')",[archived,org,separate]);
  await db.query("insert into conversations values($1,$2,$3,'old-chat','{}')",[archivedChat,org,archived]);
  await reset();
  expect((await db.query("select id from leads order by id")).rows).toEqual([other,separate].sort().map(id=>({id})));
  expect((await db.query("select * from conversations")).rows).toEqual([]);
});
