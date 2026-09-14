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
 create function get_organization_storage_entitlement(uuid) returns table(total_storage_limit_bytes bigint,storage_file_max_bytes bigint,total_storage_file_limit integer) language sql as $$select 50000000::bigint,20000000::bigint,100$$;`);
 for(const m of ['0147_connectyhub_voice','0148_studio_assets','0149_studio_operations'])await f.db.exec(readFileSync(`supabase/migrations/${m}.sql`,'utf8'));
 const project=randomUUID(),key=randomUUID();await f.db.query("insert into voice_projects(id,organization_id,name) values($1,$2,'Studio')",[project,f.org]);
 await f.db.query("insert into voice_api_keys(id,project_id,name,key_hash,key_prefix) values($1,$2,'Key','hash','prefix')",[key,project]);
 await f.db.exec(`insert into studio_capabilities(operation,model_id,provider,feature_code,enabled,confirmed_at,cost_evidence,confirmed_rates) values('gemini_tts','gemini-tts','gemini','voice_generation_audio',true,now(),'Synthetic confirmed tariff','[{"id":"rate"}]')`);
 const reserve=async(idem:string,charge=50,input:object={})=>(await f.db.query<{r:Record<string,unknown>}>("select reserve_studio_operation($1,$2,$3,$3,'gemini_tts','gemini-tts','voice',100,$4,.1,'[]',$5,'{\"inputTokens\":100,\"outputTokens\":1000}',20000000,1) r",[project,key,idem,charge,JSON.stringify(input)])).rows[0].r;
 const output=async(id:unknown)=>{await f.db.query("update voice_generations set object_path='private/result',bytes_size=100 where id=$1",[id]);await f.db.query("update studio_operations set result_mime='audio/wav',result_file_count=1 where id=$1",[id]);};
 const finish=(id:unknown,status='completed',charge=5,units:object|null={inputTokens:100,outputTokens:20})=>f.db.query('select finish_studio_operation($1,$2,$3,.01,$4)',[id,status,charge,JSON.stringify(units)]);
 return {...f,project,key,reserve,output,finish};
}
it('shares holds with existing TTS, settles actual tokens once and restores unused storage capacity',async()=>{
 const f=await fixture();try{
  const a=await f.reserve('one');expect((await f.reserve('one')).claimed).toBe(false);
  const legacy=await f.db.query<{r:Record<string,unknown>}>("select reserve_voice_generation($1,$2,'legacy','legacy','voice','tts',100,10,.01,'[]') r",[f.project,f.key]);
  await expect(f.reserve('third',5)).rejects.toThrow('voice_concurrency_limit');
  await f.db.query('select start_voice_generation($1)',[a.id]);
  await expect(f.db.query("select finish_voice_generation($1,'completed')",[a.id])).rejects.toThrow('voice_studio_receipt');
  await expect(f.finish(a.id)).rejects.toThrow('voice_result_missing');
  await f.output(a.id);await f.finish(a.id);await f.finish(a.id);
  const wallet=(await f.db.query<{balance_credits:string;reserved_credits:string}>('select * from credit_wallets')).rows[0];expect(Number(wallet.balance_credits)).toBe(95);expect(Number(wallet.reserved_credits)).toBe(10);
  const events=(await f.db.query<{provider:string;input_tokens:number;output_tokens:number}>('select * from usage_events')).rows;expect(events).toHaveLength(1);expect(events[0]).toMatchObject({provider:'gemini'});expect(Number(events[0].output_tokens)).toBe(20);
  expect((await f.db.query('select * from credit_transactions')).rows).toHaveLength(1);
  expect(Number((await f.db.query<{used_bytes:number}>('select * from organization_storage_usage')).rows[0].used_bytes)).toBe(100);
  await f.db.query("select finish_voice_generation($1,'failed')",[legacy.rows[0].r.id]);
 }finally{await f.db.close();}
});
it('keeps uncertain cost reserved and refuses missing usage or settlement above the hold',async()=>{
 const f=await fixture();try{
  const a=await f.reserve('pending');await f.db.query('select start_voice_generation($1)',[a.id]);await f.output(a.id);
  await f.finish(a.id,'uncertain');await expect(f.finish(a.id,'completed',51)).rejects.toThrow('voice_settlement_pending');
  await expect(f.finish(a.id,'completed',5,{})).rejects.toThrow('voice_usage_missing');
  expect(Number((await f.db.query<{reserved_credits:string}>('select * from credit_wallets')).rows[0].reserved_credits)).toBe(50);
  await f.finish(a.id,'failed');expect((await f.db.query('select * from credit_transactions')).rows).toHaveLength(0);
  expect(Number((await f.db.query<{used_bytes:number}>('select * from organization_storage_usage')).rows[0].used_bytes)).toBe(0);
 }finally{await f.db.close();}
});
it('blocks inactive capabilities and client access to operation finance and resources',async()=>{
 const f=await fixture();try{
  await f.db.exec('update studio_capabilities set enabled=false');await expect(f.reserve('inactive')).rejects.toThrow('voice_capability_unavailable');
  await f.db.exec('set role authenticated');for(const table of ['studio_capabilities','studio_operations','studio_resources'])await expect(f.db.query(`select * from ${table}`)).rejects.toThrow('permission denied');
  await expect(f.reserve('forbidden')).rejects.toThrow('permission denied');
 }finally{await f.db.close();}
});
it('protects a project-owned input against deletion while its operation is pending',async()=>{
 const f=await fixture();try{
  const hash='a'.repeat(64),sha='b'.repeat(64);
  const a=(await f.db.query<{r:Record<string,unknown>}>("select create_studio_asset($1,$2,'input',300,'audio/wav',$3) r",[f.project,f.key,hash])).rows[0].r;
  await f.db.query("select consume_studio_asset_ticket($1,$2,'upload')",[a.id,hash]);await f.db.query("select finish_studio_asset($1,'ready',1,$2)",[a.id,sha]);
  const operation=await f.reserve('with-asset',5,{asset_id:a.id});
  await f.db.query("update studio_assets set ticket_hash=$2,ticket_purpose='delete',ticket_expires_at=now()+interval '1 minute' where id=$1",[a.id,hash]);
  await expect(f.db.query("select consume_studio_asset_ticket($1,$2,'delete')",[a.id,hash])).rejects.toThrow('voice_asset_in_use');
  await f.finish(operation.id,'failed');await f.db.query("select consume_studio_asset_ticket($1,$2,'delete')",[a.id,hash]);
 }finally{await f.db.close();}
});
it('removes completed output capacity once without refunding or deleting its receipt',async()=>{
 const f=await fixture();try{
  const a=await f.reserve('output-delete');
  await expect(f.db.query('select prepare_studio_result_delete($1)',[a.id])).rejects.toThrow('voice_result_pending');
  await f.db.query('select start_voice_generation($1)',[a.id]);await f.output(a.id);await f.finish(a.id);
  await f.db.query('select prepare_studio_result_delete($1)',[a.id]);
  expect(Number((await f.db.query<{used_bytes:number}>('select * from organization_storage_usage')).rows[0].used_bytes)).toBe(100);
  await f.db.query('select finish_studio_result_delete($1)',[a.id]);await f.db.query('select finish_studio_result_delete($1)',[a.id]);
  expect(Number((await f.db.query<{used_bytes:number}>('select * from organization_storage_usage')).rows[0].used_bytes)).toBe(0);
  const receipt=(await f.db.query<{status:string;charged_credits:string;object_path:string|null}>('select * from voice_generations where id=$1',[a.id])).rows[0];
  expect(receipt.status).toBe('completed');expect(Number(receipt.charged_credits)).toBe(5);expect(receipt.object_path).toBeNull();
  expect((await f.db.query('select * from credit_transactions')).rows).toHaveLength(1);
 }finally{await f.db.close();}
});
it('releases only stale incomplete uploads and preserves a concurrently finished upload',async()=>{
 const f=await fixture();try{
  const hash='a'.repeat(64),sha='b'.repeat(64);
  const create=async()=>(await f.db.query<{r:{id:string}}>("select create_studio_asset($1,$2,'input',300,'audio/wav',$3) r",[f.project,f.key,hash])).rows[0].r;
  const a=await create(),b=await create();
  for(const asset of [a,b])await f.db.query("select consume_studio_asset_ticket($1,$2,'upload')",[asset.id,hash]);
  await f.db.query('select fail_stale_studio_asset($1)',[a.id]);
  expect(Number((await f.db.query<{used_bytes:number}>('select * from organization_storage_usage')).rows[0].used_bytes)).toBe(600);
  await f.db.exec("update studio_assets set updated_at=now()-interval '11 minutes'");
  await f.db.query("select finish_studio_asset($1,'ready',1,$2)",[b.id,sha]);
  for(const id of [a.id,a.id,b.id])await f.db.query('select fail_stale_studio_asset($1)',[id]);
  expect(Number((await f.db.query<{used_bytes:number}>('select * from organization_storage_usage')).rows[0].used_bytes)).toBe(300);
  expect((await f.db.query<{status:string}>('select status from studio_assets where id=$1',[b.id])).rows[0].status).toBe('ready');
 }finally{await f.db.close();}
});
