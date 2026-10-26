import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,it,expect} from 'vitest';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;
 create table organizations(id uuid primary key,slug text,owner_id uuid);
 create table profiles(id uuid primary key,full_name text,phone text);
 create table leads(id uuid primary key,organization_id uuid,channel text default 'whatsapp',phone_number text);
 create table whatsapp_outbound_deliveries(id uuid primary key,organization_id uuid,lead_id uuid,whatsapp_instance_id uuid,target text,payload jsonb);
 create table billing_notification_events(id uuid primary key,organization_id uuid,status text,recipient_phone text,metadata jsonb);`);
 await db.exec(readFileSync('supabase/migrations/0218_platform_notice_contact_names.sql','utf8'));
},30000);
afterAll(async()=>{await db.close();});
async function fixture(){
 const org=randomUUID(),archive=randomUUID(),owner=randomUUID(),lead=randomUUID(),event=randomUUID(),sender=randomUUID(),delivery=randomUUID();
 await db.query("insert into organizations values($1,'customer',$2),($3,'connectyhub-platform-whatsapp',null)",[org,owner,archive]);
 await db.query("insert into profiles values($1,'Pessoa Cadastrada','+55 (11) 99999-0000')",[owner]);
 await db.query("insert into leads(id,organization_id,phone_number) values($1,$2,'5511999990000')",[lead,archive]);
 await db.query("insert into billing_notification_events values($1,$2,'sent','5511999990000',$3)",[event,org,{sender_kind:'platform',sender_instance_id:sender}]);
 await db.query("insert into whatsapp_outbound_deliveries values($1,$2,$3,$4,'5511999990000',$5)",[delivery,archive,lead,sender,{track_id:`billing_notice_${event}:delivery:${delivery}`}]);
 return {org,archive,owner,lead,event,sender,delivery};
}
async function names(lead:string){return (await db.query('select * from platform_notice_contact_names($1)',[[lead]])).rows;}
it('returns the registered owner only from a sent, exactly linked notice and leaves leads untouched',async()=>{
 const f=await fixture();const before=(await db.query('select * from leads where id=$1',[f.lead])).rows;
 expect(await names(f.lead)).toEqual([{lead_id:f.lead,contact_name:'Pessoa Cadastrada'}]);
 expect((await db.query('select * from leads where id=$1',[f.lead])).rows).toEqual(before);
 expect((await db.query('select * from platform_notice_contact_names($1)',[[]])).rows).toEqual([]);
});
it('does not reuse the owner name for a responsible person',async()=>{
 const f=await fixture();await db.query("update profiles set phone='5511888880000' where id=$1",[f.owner]);
 expect(await names(f.lead)).toEqual([]);
 await db.query("update billing_notification_events set metadata=metadata||'{\"recipient_kind\":\"agent_responsible\",\"responsible_name\":\"Responsável Cadastrado\"}' where id=$1",[f.event]);
 expect(await names(f.lead)).toEqual([{lead_id:f.lead,contact_name:'Responsável Cadastrado'}]);
});
it.each(['tenant','sender','recipient','target','status','tracking'])('rejects unrelated %s context',async(kind)=>{
 const f=await fixture();
 if(kind==='tenant')await db.query("update organizations set slug='other' where id=$1",[f.archive]);
 if(kind==='sender')await db.query("update whatsapp_outbound_deliveries set whatsapp_instance_id=$2 where id=$1",[f.delivery,randomUUID()]);
 if(kind==='recipient')await db.query("update billing_notification_events set recipient_phone='5511888880000' where id=$1",[f.event]);
 if(kind==='target')await db.query("update whatsapp_outbound_deliveries set target='5511888880000' where id=$1",[f.delivery]);
 if(kind==='status')await db.query("update billing_notification_events set status='failed' where id=$1",[f.event]);
 if(kind==='tracking')await db.query("update whatsapp_outbound_deliveries set payload='{}' where id=$1",[f.delivery]);
 expect(await names(f.lead)).toEqual([]);
});
it('leaves ambiguous account associations unresolved',async()=>{
 const f=await fixture(),g=await fixture();
 await db.query("insert into whatsapp_outbound_deliveries values($1,$2,$3,$4,'5511999990000',$5)",[randomUUID(),f.archive,f.lead,g.sender,{track_id:`billing_notice_${g.event}`}]);
 expect(await names(f.lead)).toEqual([]);
});
it('denies direct cross-customer lookup to browser roles',async()=>{
 for(const role of ['anon','authenticated'])expect((await db.query("select has_function_privilege($1,'platform_notice_contact_names(uuid[])','EXECUTE') ok",[role])).rows[0]).toEqual({ok:false});
});
