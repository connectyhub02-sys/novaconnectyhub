import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {managedDatabaseFixture,ids} from './helpers/managed-database';
const sample=(time:number,cpu:number|null)=>({measured_at:new Date(time).toISOString(),cpu_percent:cpu,memory_total:100,memory_available:80,disk_total:100,disk_used:20,network_rx_bytes:0,network_tx_bytes:0,services:[]});
describe('persistent infrastructure alerts',()=>{
 it('requires sustained load, ignores replay, preserves alert across restore, and records recovery once',async()=>{
  const f=await managedDatabaseFixture();let restored:PGlite|undefined;try{
   await f.db.exec(readFileSync('supabase/migrations/0153_managed_persistent_alerts.sql','utf8'));const now=Date.now();
   await expect(f.as(ids.admin,'select managed_record_host_sample($1)',[sample(now,99)])).rejects.toThrow();
   for(let i=0;i<3;i++)await f.service('select managed_record_host_sample($1)',[sample(now+i*1000,99)]);
   expect((await f.db.query("select event from infrastructure_alert_events where metric='cpu'")).rows).toEqual([{event:'opened'}]);
   expect((await f.service('select managed_record_host_sample($1) accepted',[sample(now+2000,99)])).rows[0].accepted).toBe(false);
   restored=new PGlite({loadDataDir:await f.db.dumpDataDir()});
   expect((await restored.query("select active,bad_samples from infrastructure_alert_states where metric='cpu'")).rows[0]).toEqual({active:true,bad_samples:3});
   await restored.query('select managed_record_host_sample($1)',[sample(now+3000,null)]);
   expect((await restored.query("select active,last_value from infrastructure_alert_states where metric='cpu'")).rows[0]).toEqual({active:true,last_value:null});
   await restored.query('select managed_record_host_sample($1)',[sample(now+4000,50)]);
   await restored.query('select managed_record_host_sample($1)',[sample(now+5000,50)]);
   expect((await restored.query("select event from infrastructure_alert_events where metric='cpu' order by measured_at")).rows).toEqual([{event:'opened'},{event:'recovered'}]);
   expect((await f.as(ids.a,'select * from infrastructure_alert_events')).rows).toEqual([]);
   expect((await f.as(ids.admin,'select * from infrastructure_alert_events')).rows).toHaveLength(1);
  }finally{await restored?.close();await f.db.close();}
 },30000);
 it('resets consecutive samples after a collection gap and rolls back invalid measurements',async()=>{
  const f=await managedDatabaseFixture();try{await f.db.exec(readFileSync('supabase/migrations/0153_managed_persistent_alerts.sql','utf8'));await f.db.exec('update infrastructure_alert_settings set stale_seconds=30');const now=Date.now();
   for(const offset of [0,1000,40000])await f.service('select managed_record_host_sample($1)',[sample(now+offset,99)]);
   expect((await f.db.query("select active,bad_samples from infrastructure_alert_states where metric='cpu'")).rows[0]).toEqual({active:false,bad_samples:1});
   await expect(f.service('select managed_record_host_sample($1)',[{...sample(now+41000,99),memory_available:200}])).rejects.toThrow();
   expect((await f.db.query<{count:number}>('select count(*)::int count from infrastructure_samples')).rows[0].count).toBe(3);
  }finally{await f.db.close();}
 },30000);
});
