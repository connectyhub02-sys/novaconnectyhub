import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import * as crypto from 'node:crypto';
import * as net from 'node:net';
import * as cron from 'cron-parser';
import {EventEmitter} from 'node:events';
import {aiDatabaseFixture} from './helpers/ai-database';
import {commerceDatabase} from './helpers/commerce-database';
import {serverModuleHarness} from './helpers/server-module-harness';
import type * as Automation from '../src/lib/ai-api/automation';
import type * as Transport from '../src/lib/ai-api/webhook-transport';
type Row=Record<string,unknown>;
class AiApiError extends Error{constructor(public code:string,public status:number,message:string){super(message);}}
const record=(v:unknown):Row=>v&&typeof v==='object'?v as Row:{};
const transport=serverModuleHarness<typeof Transport>('src/lib/ai-api/webhook-transport.ts',{'node:crypto':crypto,'node:net':net});
const rpc=async(client:unknown,name:string,args:unknown)=>{const result=await (client as {rpc:(n:string,a:unknown)=>Promise<{data:unknown;error:unknown}>}).rpc(name,args);if(result.error)throw result.error;return result.data;};
function moduleFor(imports:Row={}){return serverModuleHarness<typeof Automation>('src/lib/ai-api/automation.ts',{'@/lib/billing/access-control':{statusForAccessControlError:(_error:unknown,fallback:number)=>fallback},'node:crypto':crypto,'cron-parser':cron,'./gateway':{AiApiError,record,rpc},'./webhook-transport':transport,...imports},[],{Request,Response});}
async function sqlFixture(){const f=await aiDatabaseFixture();await f.db.exec(readFileSync('supabase/migrations/0129_ai_automation_delivery.sql','utf8'));return f;}

describe('Webhook network boundary',()=>{
  it('pins the public DNS address and reports redirects without following them',async()=>{
    let calls=0;let pinned='';let sent='';
    const sender=serverModuleHarness<typeof Transport>('src/lib/ai-api/webhook-transport.ts',{
      'node:crypto':crypto,'node:net':net,'node:dns/promises':{lookup:async()=>[{address:'8.8.8.8',family:4}]},
      'node:https':{request:(url:URL,options:{lookup:(host:string,options:object,callback:(error:unknown,address:string)=>void)=>void;headers:Row},onResponse:(response:{statusCode:number;destroy:()=>void})=>void)=>{
        calls++;expect(url.hostname).toBe('client.example');
        options.lookup('client.example',{},(_error:unknown,address:string)=>{pinned=address;});
        expect(options.headers.Authorization).toBeUndefined();expect(options.headers['X-ConnectyHub-Signature']).toMatch(/^v1=/);
        const emitter=new EventEmitter();
        return Object.assign(emitter,{end:(body:string)=>{sent=body;onResponse({statusCode:302,destroy:()=>{}});emitter.emit('close');},destroy:()=>{}});
      }},
    },[],{setTimeout,clearTimeout});
    expect(await sender.deliverAiWebhook('https://client.example/events','secret','event',{credits:7})).toBe(302);
    expect(calls).toBe(1);expect(pinned).toBe('8.8.8.8');expect(sent).toBe('{"credits":7}');
  });
  it('rejects a DNS response containing a private address before opening a connection',async()=>{
    let calls=0;
    const sender=serverModuleHarness<typeof Transport>('src/lib/ai-api/webhook-transport.ts',{
      'node:crypto':crypto,'node:net':net,'node:dns/promises':{lookup:async()=>[{address:'8.8.8.8'},{address:'127.0.0.1'}]},
      'node:https':{request:()=>{calls++;}},
    });
    await expect(sender.deliverAiWebhook('https://client.example/events','secret','event',{})).rejects.toThrow('Destino indisponível');
    expect(calls).toBe(0);
  });
});
describe('AI automation SQL ledger',()=>{
  it('queues one notification only after settlement and never duplicates the debit or event',async()=>{
    const f=await sqlFixture();try{
      await f.db.query("insert into ai_webhooks(project_id,url,secret_encrypted) values($1,'https://client.example/events','encrypted')",[f.project]);
      const r=await f.claim('event');await f.reserve(r.id,10);await f.db.query('select start_ai_request($1)',[r.id]);
      expect((await f.db.query('select * from ai_webhook_deliveries')).rows).toHaveLength(0);
      await f.finish(r.id,'completed',7);await f.finish(r.id,'completed',7);
      const events=(await f.db.query<{payload:Row}>('select payload from ai_webhook_deliveries')).rows;
      expect(events).toHaveLength(1);expect(events[0].payload.data).toMatchObject({request_id:r.id,credits:7,status:'completed'});
      expect(JSON.stringify(events)).not.toContain('key_hash');expect((await f.db.query('select * from credit_transactions')).rows).toHaveLength(1);
    }finally{await f.db.close();}
  });
  it('records no completion event when credits cannot be reserved',async()=>{
    const f=await sqlFixture();try{
      await f.db.query("insert into ai_webhooks(project_id,url,secret_encrypted) values($1,'https://client.example/events','encrypted')",[f.project]);
      const r=await f.claim('empty');await expect(f.reserve(r.id,1000)).rejects.toThrow('ai_insufficient_credits');
      expect((await f.db.query('select * from ai_webhook_deliveries')).rows).toHaveLength(0);
    }finally{await f.db.close();}
  });
  it('claims each schedule once and retains its original input across retries',async()=>{
    const f=await sqlFixture();try{
      const due=new Date(Date.now()-60000).toISOString(),next=new Date(Date.now()+60000).toISOString();
      const t=(await f.db.query<{id:string}>("insert into ai_triggers(project_id,key_id,display_name,schedule,time_zone,interaction,next_run_at) values($1,$2,'Daily','0 9 * * *','America/Sao_Paulo','{\"input\":\"original\"}',$3) returning id",[f.project,f.key,due])).rows[0];
      const claim=()=>f.db.query<{id:string|null}>('select claim_ai_trigger($1,$2,$3) id',[t.id,due,next]);
      const first=(await claim()).rows[0].id;expect(first).toBeTruthy();expect((await claim()).rows[0].id).toBeNull();
      const lease=crypto.randomUUID();const run=(await f.db.query<{r:Row}>('select claim_ai_trigger_run($1,$2) r',[first,lease])).rows[0].r;
      expect(run.interaction).toEqual({input:'original'});
      expect((await f.db.query<{r:unknown}>('select claim_ai_trigger_run($1,$2) r',[first,crypto.randomUUID()])).rows[0].r).toBeNull();
      await f.db.query('update ai_triggers set next_run_at=$2 where id=$1',[t.id,due]);
      expect((await claim()).rows[0].id).toBeNull();expect((await f.db.query('select * from ai_trigger_runs')).rows).toHaveLength(1);
    }finally{await f.db.close();}
  });
  it('uses exclusive webhook leases and closes an exhausted delivery after a worker crash',async()=>{
    const f=await sqlFixture();try{
      await f.db.query("insert into ai_webhooks(project_id,url,secret_encrypted) values($1,'https://client.example/events','encrypted')",[f.project]);
      const r=await f.claim('failed');await f.finish(r.id,'failed');
      const delivery=(await f.db.query<{id:string}>('select id from ai_webhook_deliveries')).rows[0];
      const lease=crypto.randomUUID();expect((await f.db.query<{r:Row}>('select claim_ai_webhook_delivery($1,$2) r',[delivery.id,lease])).rows[0].r.attempts).toBe(1);
      expect((await f.db.query<{r:unknown}>('select claim_ai_webhook_delivery($1,$2) r',[delivery.id,crypto.randomUUID()])).rows[0].r).toBeNull();
      await f.db.query("update ai_webhook_deliveries set attempts=8,lease_until=now()-interval '1 minute' where id=$1",[delivery.id]);
      await f.db.query('select claim_ai_webhook_delivery($1,$2)',[delivery.id,lease]);
      expect((await f.db.query<{status:string}>('select status from ai_webhook_deliveries')).rows[0].status).toBe('failed');
      expect((await f.db.query("select has_table_privilege('anon','ai_triggers','select') allowed")).rows[0]).toEqual({allowed:false});
    }finally{await f.db.close();}
  });
});
describe('Schedule and webhook boundaries',()=>{
  it('interprets local cron schedules including a daylight saving transition',()=>{
    const api=moduleFor();expect(api.nextAiSchedule('0 9 * * *','America/Sao_Paulo',new Date('2026-09-10T11:00:00Z'))).toBe('2026-09-10T12:00:00.000Z');
    expect(api.nextAiSchedule('0 9 * * *','America/New_York',new Date('2026-03-07T15:00:00Z'))).toBe('2026-03-08T13:00:00.000Z');
    expect(()=>api.nextAiSchedule('* * * * * *','UTC')).toThrow();expect(()=>api.nextAiSchedule('* * * * *','Invalid/Zone')).toThrow();
  });
  it('rejects private, loopback, link-local and metadata network destinations',()=>{
    for(const ip of ['127.0.0.1','169.254.169.254','10.0.0.1','172.16.0.1','192.168.1.1','100.64.0.1','::1','224.0.0.1'])expect(transport.publicWebhookIpv4(ip)).toBe(false);
    expect(transport.publicWebhookIpv4('8.8.8.8')).toBe(true);
    for(const url of ['http://client.example','https://user:pass@client.example','https://127.0.0.1','https://client.example:8443','https://[::1]'])expect(()=>transport.publicWebhookUrl(url)).toThrow();
    expect(transport.signAiWebhook('secret','event','1','{}')).toBe(crypto.createHmac('sha256','secret').update('event.1.{}').digest('hex'));
  });
  it('uses the authenticated wallet gateway for a schedule and recovers the same identity',async()=>{
    const run={id:'run-1',trigger_id:'trigger',project_id:'project',key_id:'key',status:'pending',interaction:{input:'hello'},created_at:'2020'};
    const db=commerceDatabase({ai_triggers:[{id:'trigger',enabled:true,next_run_at:'2099'}],ai_trigger_runs:[run],ai_api_keys:[{id:'key',project_id:'project',status:'active'}]});
    const calls:Row[]=[];
    const api=moduleFor({'./gateway':{AiApiError,record,rpc,authorizeAiKey:async(_c:unknown,key:Row)=>{expect(key.status).toBe('active');return {key,project:{id:'project'}};}},'./resources':{createAuthorizedAiResource:async(_c:unknown,request:Request,auth:Row,collection:string,body:Row)=>{calls.push({id:request.headers.get('Idempotency-Key'),auth,collection,body});return {id:'request',request_id:'request'};}}});
    const client={...db.client,rpc:async(_n:string,args:Row)=>{Object.assign(db.tables.ai_trigger_runs[0],{lease_id:args.p_lease});return {data:{...run},error:null};}};
    expect(await api.processAiTriggers(client as never)).toEqual({submitted:1});expect(calls[0]).toMatchObject({id:'trigger:run-1',collection:'interactions',body:{input:'hello'}});
    expect(db.tables.ai_trigger_runs[0]).toMatchObject({status:'submitted',request_id:'request'});
    await api.processAiTriggers(client as never);expect(calls).toHaveLength(1);
  });
  it('never dispatches a paused schedule or leaks the stored webhook secret',async()=>{
    const db=commerceDatabase({ai_triggers:[{id:'trigger',project_id:'project',enabled:false}],ai_trigger_runs:[{id:'run',trigger_id:'trigger',project_id:'project',status:'pending'}],ai_webhooks:[{id:'hook',project_id:'project',url:'https://client.example',secret_encrypted:'private'}]});
    const api=moduleFor({'./resources':{createAuthorizedAiResource:()=>{throw new Error('must not dispatch');}}});
    const client={...db.client,rpc:async(_n:string,args:Row)=>{db.tables.ai_trigger_runs[0].lease_id=args.p_lease;return {data:{...db.tables.ai_trigger_runs[0]},error:null};}};
    await api.processAiTriggers(client as never);expect(db.tables.ai_trigger_runs[0].status).toBe('skipped');
    const result=await api.aiAutomationApi(client as never,{project:{id:'project'}} as never,new Request('https://local/api'),['webhooks','hook']);
    expect(JSON.stringify(result)).not.toContain('private');expect(result).not.toHaveProperty('secret_encrypted');
    await expect(api.aiAutomationApi(client as never,{project:{id:'other'}} as never,new Request('https://local/api'),['webhooks','hook'])).rejects.toMatchObject({status:404});
  });
});
