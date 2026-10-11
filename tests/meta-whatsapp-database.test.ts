import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
const org="00000000-0000-0000-0000-000000000001", other="00000000-0000-0000-0000-000000000002";
const db=new PGlite();
beforeAll(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);
 create table organizations(id uuid primary key);insert into organizations values('${org}'),('${other}');
 create table leads(id uuid primary key default gen_random_uuid(),organization_id uuid,channel text,phone_number text,display_name text,status text,source text,metadata jsonb,created_at timestamptz default now(),last_message_at timestamptz,last_event_summary text);
 create table conversations(id uuid primary key default gen_random_uuid(),organization_id uuid,lead_id uuid,channel text,provider text,provider_chat_id text,status text,metadata jsonb,last_message_at timestamptz,last_message_preview text);
 create table conversation_messages(id uuid primary key default gen_random_uuid(),organization_id uuid,conversation_id uuid,lead_id uuid,provider text,provider_message_id text,provider_chat_id text,direction text,message_type text,text_content text,payload jsonb,occurred_at timestamptz,unique(provider,provider_message_id));
 create table whatsapp_instances(phone_number text);
 `);
 await db.exec(readFileSync("supabase/migrations/0189_meta_whatsapp_official.sql","utf8"));
},30000);
afterAll(()=>db.close());

describe("official WhatsApp persistence",()=>{
 it("denies token/message/receipt access to authenticated clients",async()=>{
   for(const table of ["meta_whatsapp_connections","meta_whatsapp_messages","meta_whatsapp_receipts","meta_whatsapp_oauth_attempts"]){
     const result=await db.query<{allowed:boolean}>(`select has_table_privilege('authenticated',$1,'SELECT') allowed`,[table]);expect(result.rows[0].allowed).toBe(false);
   }
 });
 it("prevents sharing one sender between companies",async()=>{
   await db.query("insert into meta_whatsapp_connections(organization_id,waba_id,phone_number_id,display_phone,encrypted_token) values($1,'123456','111111','15555555555','encrypted')",[org]);
   await expect(db.query("insert into meta_whatsapp_connections(organization_id,waba_id,phone_number_id,display_phone,encrypted_token) values($1,'123456','111111','15555555555','encrypted')",[other])).rejects.toThrow();
 });
 it("rejects the same send key but permits independent company keys",async()=>{
   const sql="insert into meta_whatsapp_messages(organization_id,phone_number_id,phone,direction,message_type,text_content,status,request_key) values($1,$2,'5511999999999','outbound','text','Teste','sending','00000000-0000-0000-0000-000000000003')";
   await db.query(sql,[org,"111111"]);await expect(db.query(sql,[org,"111111"])).rejects.toThrow();await db.query(sql,[other,"222222"]);
 });
 it("reconciles receipts that arrive before the send response and ignores older states",async()=>{
   await db.query("insert into meta_whatsapp_receipts values('111111','wamid.race','read',now(),null)");
   await db.query("select reconcile_meta_whatsapp_receipt('111111','wamid.race')");
   await db.query("update meta_whatsapp_messages set provider_message_id='wamid.race',status='accepted' where organization_id=$1",[org]);
   await db.query("select reconcile_meta_whatsapp_receipt('111111','wamid.race')");
   await db.query("insert into meta_whatsapp_receipts values('111111','wamid.race','sent',now(),null),('111111','wamid.race','failed',now(),'123')");
   await db.query("select reconcile_meta_whatsapp_receipt('111111','wamid.race')");
   const result=await db.query<{status:string}>("select status from meta_whatsapp_messages where organization_id=$1",[org]);expect(result.rows[0].status).toBe("read");
 });
 it("archives inbound messages once and updates the service window in the correct company",async()=>{
   const {rows}=await db.query<{id:string}>("insert into meta_whatsapp_messages(organization_id,phone_number_id,phone,direction,message_type,text_content,status,provider_message_id) values($1,'111111','5511888888888','inbound','text','Olá','received','wamid.inbound') returning id",[org]);
   await db.query("select archive_meta_whatsapp_message($1)",[rows[0].id]);await db.query("select archive_meta_whatsapp_message($1)",[rows[0].id]);
   const archived=await db.query<{count:number}>("select count(*)::int count from conversation_messages where provider_message_id='wamid.inbound'");expect(archived.rows[0].count).toBe(1);
   const contact=await db.query<{organization_id:string;last_inbound_at:string}>("select * from meta_whatsapp_contacts where phone='5511888888888'");expect(contact.rows[0].organization_id).toBe(org);expect(contact.rows[0].last_inbound_at).toBeTruthy();
 });
 it("respects formatted CRM opt-outs without leaking decisions between companies",async()=>{
   await db.query("insert into leads(organization_id,phone_number,status,metadata) values($1,'+55 (11) 77777-7777','active','{\"whatsapp_opt_out\":true}')",[org]);
   const denied=await db.query<{allowed:boolean}>("select meta_whatsapp_contact_allowed($1,'5511777777777') allowed",[org]);expect(denied.rows[0].allowed).toBe(false);
   const allowed=await db.query<{allowed:boolean}>("select meta_whatsapp_contact_allowed($1,'5511777777777') allowed",[other]);expect(allowed.rows[0].allowed).toBe(true);
 });
 it("rejects an existing UAZAPI number",async()=>{
   await db.query("insert into whatsapp_instances values('+55 (11) 66666-6666')");
   const result=await db.query<{allowed:boolean}>("select meta_whatsapp_number_separate('5511666666666') allowed");expect(result.rows[0].allowed).toBe(false);
 });
});
