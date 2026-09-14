import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {aiDatabaseFixture} from './helpers/ai-database';
async function fixture(){
 const f=await aiDatabaseFixture();
 await f.db.exec(`alter type billing_provider add value 'elevenlabs';alter table organizations add column name text;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table organization_storage_usage(organization_id uuid primary key,used_bytes bigint not null default 0,billable_file_count integer not null default 0);
 create function record_organization_storage_usage(uuid,bigint,integer,text,jsonb) returns void language sql as $$insert into organization_storage_usage values($1,$2,$3) on conflict(organization_id) do update set used_bytes=organization_storage_usage.used_bytes+$2,billable_file_count=organization_storage_usage.billable_file_count+$3$$;
 create function release_organization_storage_usage(uuid,bigint,integer,text,jsonb) returns void language sql as $$update organization_storage_usage set used_bytes=greatest(0,used_bytes-$2),billable_file_count=greatest(0,billable_file_count-$3) where organization_id=$1$$;
 create function get_organization_storage_entitlement(uuid) returns table(total_storage_limit_bytes bigint,storage_file_max_bytes bigint,total_storage_file_limit integer) language sql as $$select 1000000::bigint,1000000::bigint,10$$;`);
 await f.db.exec(readFileSync('supabase/migrations/0147_connectyhub_voice.sql','utf8'));
 await f.db.exec(readFileSync('supabase/migrations/0148_studio_assets.sql','utf8'));
 const project=randomUUID(),key=randomUUID();await f.db.query("insert into voice_projects(id,organization_id,name) values($1,$2,'Studio')",[project,f.org]);
 await f.db.query("insert into voice_api_keys(id,project_id,name,key_hash,key_prefix) values($1,$2,'Key','hash','prefix')",[key,project]);
 const hash='a'.repeat(64),sha='b'.repeat(64);
 const create=async(size=300)=>(await f.db.query<{r:Record<string,unknown>}>("select create_studio_asset($1,$2,'Audio',$3,'audio/wav',$4) r",[project,key,size,hash])).rows[0].r;
 const consume=(id:unknown,purpose='upload',h=hash)=>f.db.query('select consume_studio_asset_ticket($1,$2,$3)',[id,h,purpose]);
 const finish=(id:unknown,status='ready',duration:number|null=1.125)=>f.db.query('select finish_studio_asset($1,$2,$3,$4)',[id,status,duration,status==='ready'?sha:null]);
 const usage=async()=>(await f.db.query<{used_bytes:number;billable_file_count:number}>('select * from organization_storage_usage')).rows[0];
 return {...f,project,key,hash,sha,create,consume,finish,usage};
}
it('reserves storage, consumes one ticket, records measured audio once and releases deletion once',async()=>{
 const f=await fixture();try{
  const a=await f.create();expect(Number((await f.usage()).used_bytes)).toBe(300);
  await expect(f.consume(a.id,'upload','c'.repeat(64))).rejects.toThrow('voice_ticket_invalid');
  await f.consume(a.id);await expect(f.consume(a.id)).rejects.toThrow('voice_ticket_invalid');
  await f.finish(a.id);await f.finish(a.id);
  await expect(f.finish(a.id,'ready',2)).rejects.toThrow('voice_asset_state');
  expect(Number((await f.usage()).used_bytes)).toBe(300);
  await f.db.query("update studio_assets set ticket_hash=$2,ticket_purpose='delete',ticket_expires_at=now()+interval '1 minute' where id=$1",[a.id,f.hash]);
  await f.consume(a.id,'delete');await f.finish(a.id,'deleted',null);await f.finish(a.id,'deleted',null);
  expect(Number((await f.usage()).used_bytes)).toBe(0);expect((await f.usage()).billable_file_count).toBe(0);
  expect((await f.db.query('select * from credit_transactions')).rows).toHaveLength(0);
 }finally{await f.db.close();}
});
it('bounds outstanding storage and reclaims expired unconsumed tickets without double release',async()=>{
 const f=await fixture();try{
  const a=await f.create(600000);await expect(f.create(600000)).rejects.toThrow('voice_storage_limit');
  await f.db.query("update studio_assets set ticket_expires_at=now()-interval '1 second' where id=$1",[a.id]);
  await f.create(600000);expect(Number((await f.usage()).used_bytes)).toBe(600000);
  await f.finish(a.id,'failed',null);expect(Number((await f.usage()).used_bytes)).toBe(600000);
  await f.db.query("update studio_assets set ticket_hash=$2,ticket_purpose='delete',ticket_expires_at=now()+interval '1 minute' where id=$1",[a.id,f.hash]);
  await f.consume(a.id,'delete');await f.finish(a.id,'deleted',null);expect(Number((await f.usage()).used_bytes)).toBe(600000);
 }finally{await f.db.close();}
});
it('rechecks revocation and project status before consuming upload or download tickets',async()=>{
 const f=await fixture();try{
  const a=await f.create();await f.db.query("update voice_api_keys set status='revoked' where id=$1",[f.key]);
  await expect(f.consume(a.id)).rejects.toThrow('voice_key_inactive');
  await f.db.query("update voice_api_keys set status='active' where id=$1",[f.key]);await f.consume(a.id);await f.finish(a.id);
  await f.db.query("update studio_assets set ticket_hash=$2,ticket_purpose='download',ticket_expires_at=now()+interval '1 minute' where id=$1",[a.id,f.hash]);
  await f.db.query("update voice_projects set status='paused' where id=$1",[f.project]);await expect(f.consume(a.id,'download')).rejects.toThrow('voice_key_inactive');
 }finally{await f.db.close();}
});
it('rejects non-finite duration, cross-project keys and direct anonymous/authenticated access',async()=>{
 const f=await fixture();try{
  const a=await f.create();await f.consume(a.id);
  await expect(f.db.query("select finish_studio_asset($1,'ready','NaN',$2)",[a.id,f.sha])).rejects.toThrow('voice_asset_state');
  await expect(f.finish(a.id,'ready',1801)).rejects.toThrow('voice_asset_state');
  const foreign=randomUUID();await f.db.query("insert into voice_projects(id,organization_id,name) values($1,$2,'Other')",[foreign,f.org]);
  await expect(f.db.query("select create_studio_asset($1,$2,'a',30,'audio/wav',$3)",[foreign,f.key,f.hash])).rejects.toThrow('voice_key_inactive');
  await f.db.exec('set role authenticated');await expect(f.db.query('select * from studio_assets')).rejects.toThrow('permission denied');await expect(f.create()).rejects.toThrow('permission denied');
 }finally{await f.db.close();}
});
