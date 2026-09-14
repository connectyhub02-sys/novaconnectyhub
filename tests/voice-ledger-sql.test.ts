import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {aiDatabaseFixture} from './helpers/ai-database';
async function fixture(){
 const f=await aiDatabaseFixture();
 await f.db.exec(`alter type billing_provider add value 'elevenlabs'; alter table organizations add column name text; create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table voice_storage_audit(org uuid,bytes bigint);
 create function record_organization_storage_usage(uuid,bigint,integer,text,jsonb) returns void language sql as $$insert into voice_storage_audit values($1,$2)$$;`);
 await f.db.exec(readFileSync('supabase/migrations/0147_connectyhub_voice.sql','utf8'));
 const project=randomUUID(),key=randomUUID();await f.db.query("insert into voice_projects(id,organization_id,name) values($1,$2,'Voz')",[project,f.org]);await f.db.query("insert into voice_api_keys(id,project_id,name,key_hash,key_prefix) values($1,$2,'Key',$3,'prefix')",[key,project,randomUUID()]);
 const reserve=async(idem:string,hash='same',charge=5)=> (await f.db.query<{r:Record<string,unknown>}>("select reserve_voice_generation($1,$2,$3,$4,'voice','eleven_multilingual_v2',100,$5,.005,'[]') r",[project,key,idem,hash,charge])).rows[0].r;
 const finish=async(id:unknown,status='completed')=>(await f.db.query<{r:Record<string,unknown>}>("select finish_voice_generation($1,$2) r",[id,status])).rows[0].r;
 return {...f,project,key,reserve,finish};
}
it('reserves once, replays across key rotation, settles one wallet debit and storage record',async()=>{
 const f=await fixture();try{
  const r=await f.reserve('one');expect(r.claimed).toBe(true);expect((await f.reserve('one')).claimed).toBe(false);
  await expect(f.reserve('one','changed')).rejects.toThrow('voice_idempotency_conflict');
  await f.db.query('select start_voice_generation($1)',[r.id]);
  await expect(f.finish(r.id)).rejects.toThrow('voice_audio_missing');
  await f.db.query("update voice_generations set object_path='private/audio.mp3',bytes_size=300 where id=$1",[r.id]);
  expect(Number((await f.finish(r.id)).charged_credits)).toBe(5);await f.finish(r.id);
  const w=(await f.db.query<{balance_credits:string;reserved_credits:string}>('select balance_credits,reserved_credits from credit_wallets where organization_id=$1',[f.org])).rows[0];
  expect(Number(w.balance_credits)).toBe(95);expect(Number(w.reserved_credits)).toBe(0);
  expect((await f.db.query('select * from credit_transactions')).rows).toHaveLength(1);
  expect((await f.db.query('select * from usage_events')).rows).toHaveLength(1);
  expect((await f.db.query('select * from voice_storage_audit')).rows).toHaveLength(1);
  await f.db.query("update voice_api_keys set key_hash=$1 where id=$2",[randomUUID(),f.key]);expect((await f.reserve('one')).id).toBe(r.id);
 }finally{await f.db.close();}
});
it('retains uncertain holds, releases definitive failures, blocks overspend and revoked dispatch',async()=>{
 const f=await fixture();try{
  const a=await f.reserve('a','a',60);await expect(f.reserve('b','b',50)).rejects.toThrow('voice_insufficient_credits');
  await f.finish(a.id,'uncertain');expect(Number((await f.db.query<{reserved_credits:string}>('select reserved_credits from credit_wallets')).rows[0].reserved_credits)).toBe(60);
  await f.finish(a.id,'failed');expect((await f.db.query('select * from credit_transactions')).rows).toHaveLength(0);
  const b=await f.reserve('b','b',50);await f.db.query("update voice_api_keys set status='revoked' where id=$1",[f.key]);
  await expect(f.db.query('select start_voice_generation($1)',[b.id])).rejects.toThrow('voice_key_inactive');
  await f.finish(b.id,'failed');expect(Number((await f.db.query<{reserved_credits:string}>('select reserved_credits from credit_wallets')).rows[0].reserved_credits)).toBe(0);
 }finally{await f.db.close();}
});
it('limits project/month and denies direct customer access to ledgers, keys and finance RPCs',async()=>{
 const f=await fixture();try{
  await f.db.query('update voice_projects set monthly_credit_limit=4 where id=$1',[f.project]);await expect(f.reserve('over')).rejects.toThrow('voice_project_limit');
  await f.db.exec('set role authenticated');
  for(const t of ['voice_projects','voice_api_keys','voice_generations','voice_clones'])await expect(f.db.query(`select * from ${t}`)).rejects.toThrow('permission denied');
  await expect(f.reserve('forbidden')).rejects.toThrow('permission denied');await expect(f.finish(randomUUID(),'failed')).rejects.toThrow('permission denied');
 }finally{await f.db.close();}
});
it('records a zero-priced clone and included preview once without a wallet debit',async()=>{
 const f=await fixture();try{
  const c=(await f.db.query<{r:Record<string,unknown>}>("select reserve_voice_generation($1,$2,'clone','hash','private','ivc',1,0,0,'[]','voice_clone') r",[f.project,f.key])).rows[0].r;
  await f.db.query('select start_voice_generation($1)',[c.id]);
  await expect(f.finish(c.id)).rejects.toThrow('voice_clone_missing');
  await f.db.query("insert into voice_clones(organization_id,project_id,provider_voice_id,name,status,consent_text,idempotency_key,input_hash,generation_id) values($1,$2,'private','Voice','ready','Authorized','clone','hash',$3)",[f.org,f.project,c.id]);
  await f.finish(c.id);await f.finish(c.id);
  const p=(await f.db.query<{r:Record<string,unknown>}>("select reserve_voice_generation($1,$2,'preview','hash','private','tts',80,0,.004,'[]','voice_clone_preview') r",[f.project,f.key])).rows[0].r;
  await f.db.query('select start_voice_generation($1)',[p.id]);await f.db.query("update voice_generations set object_path='private/preview.mp3',bytes_size=100 where id=$1",[p.id]);await f.finish(p.id);await f.finish(p.id);
  expect((await f.db.query('select * from usage_events')).rows).toHaveLength(2);
  expect((await f.db.query('select * from credit_transactions')).rows).toHaveLength(0);
  expect((await f.db.query('select * from voice_storage_audit')).rows).toHaveLength(1);
  expect(Number((await f.db.query<{balance_credits:string}>('select balance_credits from credit_wallets')).rows[0].balance_credits)).toBe(100);
 }finally{await f.db.close();}
});
