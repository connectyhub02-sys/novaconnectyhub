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
 create table conversation_messages(id uuid primary key default gen_random_uuid(),organization_id uuid,conversation_id uuid,lead_id uuid,provider text,provider_message_id text,provider_chat_id text,direction text,message_type text,text_content text,payload jsonb,occurred_at timestamptz,whatsapp_instance_id uuid);
 create unique index fixture_message_index on conversation_messages(provider,whatsapp_instance_id,provider_message_id) nulls not distinct where provider_message_id is not null;
 create table whatsapp_instances(phone_number text);
 `);
 await db.exec(readFileSync("supabase/migrations/0189_meta_whatsapp_official.sql","utf8"));
 await db.exec(readFileSync("supabase/migrations/0190_meta_whatsapp_archive_index.sql","utf8"));
 await db.exec(readFileSync("supabase/migrations/0191_meta_whatsapp_recipient_identity.sql","utf8"));
 await db.exec(readFileSync("supabase/migrations/0192_meta_whatsapp_workspace.sql","utf8"));
},30000);
afterAll(()=>db.close());

describe("official WhatsApp persistence",()=>{
 it("archives a provider-confirmed alternate recipient in the original conversation",async()=>{
   const input='5511944444444',wa='551144444444';
   await db.query("insert into meta_whatsapp_recipient_aliases(organization_id,phone_number_id,input_phone,wa_id) values($1,'111111',$2,$3)",[org,input,wa]);
   const outgoing=await db.query<{id:string}>("insert into meta_whatsapp_messages(organization_id,phone_number_id,phone,direction,message_type,text_content,status) values($1,'111111',$2,'outbound','text','Hello','accepted') returning id",[org,input]);
   const incoming=await db.query<{id:string}>("insert into meta_whatsapp_messages(organization_id,phone_number_id,phone,direction,message_type,text_content,status) values($1,'111111',$2,'inbound','text','Hi','received') returning id",[org,wa]);
   for(const row of [...outgoing.rows,...incoming.rows]) await db.query('select archive_meta_whatsapp_message($1)',[row.id]);
   const result=await db.query<{count:number}>("select count(distinct conversation_id)::int count from conversation_messages where provider_chat_id=$1",['111111:'+input]);
   expect(result.rows[0].count).toBe(1);
   const contact=await db.query<{last_inbound_at:string}>("select last_inbound_at from meta_whatsapp_contacts where organization_id=$1 and phone=$2",[org,input]);
   expect(contact.rows[0].last_inbound_at).toBeTruthy();
 });
 it("denies token/message/receipt access to authenticated clients",async()=>{
   for(const table of ["meta_whatsapp_connections","meta_whatsapp_messages","meta_whatsapp_receipts","meta_whatsapp_oauth_attempts","meta_whatsapp_recipient_aliases","meta_whatsapp_threads","meta_whatsapp_notes","meta_whatsapp_media","meta_whatsapp_campaigns","meta_whatsapp_campaign_recipients"]){
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
   await db.query("update meta_whatsapp_messages set provider_message_id='wamid.race',status='accepted' where organization_id=$1 and request_key='00000000-0000-0000-0000-000000000003'",[org]);
   await db.query("select reconcile_meta_whatsapp_receipt('111111','wamid.race')");
   await db.query("insert into meta_whatsapp_receipts values('111111','wamid.race','sent',now(),null),('111111','wamid.race','failed',now(),'123')");
   await db.query("select reconcile_meta_whatsapp_receipt('111111','wamid.race')");
   const result=await db.query<{status:string}>("select status from meta_whatsapp_messages where organization_id=$1 and provider_message_id='wamid.race'",[org]);expect(result.rows[0].status).toBe("read");
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


describe("official multi-number inbox and campaign queue",()=>{
 const template={name:'test_campaign',language:'pt_BR',status:'APPROVED',components:[{type:'BODY',text:'Mensagem de teste'}]};
 async function campaign(key:string,phones=['5511991111111','5511992222222'],company=org,sender='333333') {
  const result=await db.query<{id:string}>("select create_meta_whatsapp_campaign($1,null,$2,$3,'Teste',$4::jsonb,'[]'::jsonb,'Lista com autorização',$5::jsonb,null) id",[company,key,sender,JSON.stringify(template),JSON.stringify(phones)]);
  return result.rows[0].id;
 }
 it("connects multiple senders atomically without allowing ownership transfer",async()=>{
  const sql="select connect_meta_whatsapp_sender($1,$2,'123456','15555555555','Teste','encrypted',array['whatsapp_business_messaging'],null)";
  await db.query(sql,[org,'333333']);await db.query(sql,[org,'444444']);
  await expect(db.query(sql,[other,'333333'])).rejects.toThrow(/SENDER_ALREADY_OWNED/);
  const result=await db.query<{organization_id:string}>("select organization_id from meta_whatsapp_connections where phone_number_id='333333'");expect(result.rows[0].organization_id).toBe(org);
  await db.query("update meta_whatsapp_connections set webhook_subscribed=true where phone_number_id in ('333333','444444')");
 });
 it("keeps the same lead's inbox and service window separate by sender",async()=>{
  const sql="insert into meta_whatsapp_messages(organization_id,phone_number_id,phone,direction,message_type,text_content,status) values($1,$2,'5511981111111',$3,'text','Olá',$4)";
  await db.query(sql,[org,'333333','inbound','received']);await db.query(sql,[org,'444444','outbound','accepted']);
  const result=await db.query<{phone_number_id:string;last_inbound_at:string|null;unread_count:number}>("select * from meta_whatsapp_threads where phone='5511981111111' order by phone_number_id");
  expect(result.rows).toHaveLength(2);expect(result.rows[0].last_inbound_at).toBeTruthy();expect(result.rows[0].unread_count).toBe(1);expect(result.rows[1].last_inbound_at).toBeNull();
 });
 it("creates a draft idempotently, rejects key mutation and tenant mismatch",async()=>{
  const key='10000000-0000-0000-0000-000000000001',id=await campaign(key);
  expect(await campaign(key)).toBe(id);
  await expect(campaign(key,['5511993333333'])).rejects.toThrow(/CAMPAIGN_KEY_CONFLICT/);
  await expect(campaign('10000000-0000-0000-0000-000000000002',undefined,other)).rejects.toThrow(/INVALID_SENDER/);
  expect((await db.query('select * from claim_meta_whatsapp_campaign_batch(20)')).rows).toHaveLength(0);
 });
 it("claims only running due recipients once and reconciles a cancellation",async()=>{
  const id=await campaign('10000000-0000-0000-0000-000000000003');
  await db.query("update meta_whatsapp_campaigns set status='running' where id=$1",[id]);
  const batch=await db.query<{id:string}>('select * from claim_meta_whatsapp_campaign_batch(1)');expect(batch.rows).toHaveLength(1);
  const next=await db.query<{id:string}>('select * from claim_meta_whatsapp_campaign_batch(1)');expect(next.rows).toHaveLength(1);expect(next.rows[0].id).not.toBe(batch.rows[0].id);
  expect((await db.query('select * from claim_meta_whatsapp_campaign_batch(20)')).rows).toHaveLength(0);
  await db.query("update meta_whatsapp_campaigns set status='cancelled' where id=$1",[id]);
  await db.query("update meta_whatsapp_campaign_recipients set updated_at=now()-interval '11 minutes' where campaign_id=$1",[id]);
  await db.query('select * from claim_meta_whatsapp_campaign_batch(20)');
  const result=await db.query<{status:string}>("select status from meta_whatsapp_campaign_recipients where campaign_id=$1",[id]);expect(result.rows.every(r=>r.status==='cancelled')).toBe(true);
 });
 it("recovers delivered and uncertain sends without sending them twice",async()=>{
  const id=await campaign('10000000-0000-0000-0000-000000000004');
  await db.query("update meta_whatsapp_campaigns set status='running' where id=$1",[id]);
  const batch=await db.query<{request_key:string;phone:string}>('select * from claim_meta_whatsapp_campaign_batch(20)');expect(batch.rows).toHaveLength(2);
  for(const [i,r] of batch.rows.entries())await db.query("insert into meta_whatsapp_messages(organization_id,phone_number_id,phone,direction,message_type,text_content,status,request_key) values($1,'333333',$2,'outbound','template','Teste',$3,$4)",[org,r.phone,i?'sending':'delivered',r.request_key]);
  await db.query("update meta_whatsapp_campaign_recipients set updated_at=now()-interval '11 minutes' where campaign_id=$1",[id]);
  expect((await db.query('select * from claim_meta_whatsapp_campaign_batch(20)')).rows).toHaveLength(0);
  const rows=await db.query<{status:string}>("select status from meta_whatsapp_campaign_recipients where campaign_id=$1",[id]);expect(rows.rows.map(r=>r.status).sort()).toEqual(['sent','uncertain']);
  const summary=await db.query<{value:{id:string;counts:Record<string,number>}}>('select meta_whatsapp_campaign_summaries($1) value',[org]);expect(summary.rows.find(r=>r.value.id===id)?.value.counts).toEqual({delivered:1,uncertain:1});
  expect((await db.query('select meta_whatsapp_campaign_summaries($1)',[other])).rows).toHaveLength(0);
 });
 it("deduplicates only provider-confirmed audience aliases",async()=>{
  await db.query("insert into meta_whatsapp_recipient_aliases(organization_id,phone_number_id,input_phone,wa_id) values($1,'333333','5511983333333','551183333333')",[org]);
  const id=await campaign('10000000-0000-0000-0000-000000000005',['5511983333333','551183333333']);
  const result=await db.query<{phone:string}>("select phone from meta_whatsapp_campaign_recipients where campaign_id=$1",[id]);expect(result.rows).toEqual([{phone:'5511983333333'}]);
 });
});
