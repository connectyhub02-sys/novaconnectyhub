import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Ledger} from './broker.mjs';
import {ProductionBroker,productionManifest,manifest} from './production.mjs';
import {keyHash,sign,verify} from './protocol.mjs';
const key='signkey-prod-'+'a1'.repeat(32),engine='signkey-prod-'+'b2'.repeat(32);
const callbackUrl='http://172.18.0.1:28111/api/inngest';
const config={mode:'betel-production',appId:'betel-ai',live:true,allowRegistration:false,
 activeFrom:Date.now()-60000,upstreamBase:'http://127.0.0.1:8288',callbackUrl,handlerUrl:'http://172.21.0.2:28102/api/inngest',
 projectSigningKey:key,upstreamSigningKey:engine,projectEventKey:'project-test',upstreamEventKey:'engine-test',
 functions:productionManifest(callbackUrl),functionBindings:Object.fromEntries(manifest.map((f,i)=>[f.id,`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`]))};
const authorization='Bearer '+keyHash(key);
async function setup(t,send){
 const folder=await mkdtemp(join(tmpdir(),'betel-production-test-'));t.after(()=>rm(folder,{recursive:true,force:true}));
 const ledger=await Ledger.open(join(folder,'ledger.json')),calls=[];
 const transport=async(url,o)=>{calls.push({url:String(url),...o});if(send)return send(url,o);
  if(url.port==='28102'){assert.ok(verify(JSON.parse(o.body),key,o.headers['x-inngest-signature']));const text='{"ok":true}';return new Response(text,{headers:{'x-inngest-signature':sign(text,key)}});}
  return new Response(JSON.stringify(url.pathname.startsWith('/e/')?{ids:['01BETELRECEIPT']}:{ok:true}));};
 return {ledger,calls,transport,broker:new ProductionBroker(config,ledger,transport)};
}
const event=()=>({name:'meta-whatsapp/campaign.process',id:'campaign-test-v1',ts:Date.now(),data:{campaignId:'test',limit:60}});
const sendEvent=(b,e=event())=>b.handle({method:'POST',rawUrl:'/e/project-test',body:e});
function callback(fn,event,overrides={}){const body={event,events:[event],ctx:{run_id:'01PRODRUN',fn_id:config.functionBindings[fn.id],qi_id:'queue'},...overrides};
 return {method:'POST',rawUrl:`/api/inngest?fnId=${fn.id}&stepId=step`,body,headers:{'x-inngest-signature':sign(body,engine),'x-request-id':'dispatch1','x-inngest-generation-id':'1'}};}
const reject=(p,code)=>assert.rejects(p,e=>e.code===code);
test('production manifest contains exactly 12 reviewed functions and namespaces all business events',()=>{
 assert.equal(config.functions.length,12);for(const f of config.functions)for(const t of f.triggers)if(t.event)assert.ok(t.event.startsWith('betel-production/'));
 assert.throws(()=>new ProductionBroker({...config,functionBindings:{}},{}),/function_bindings_incomplete/);
 const changed=structuredClone(config);changed.functions[0].triggers=[{cron:'* * * * *'}];assert.throws(()=>new ProductionBroker(changed,{}),/unreviewed_manifest/);
});
test('production event idempotency survives restart and isolates event name and engine key',async t=>{
 const {broker,ledger,calls,transport}=await setup(t),e=event();const a=await sendEvent(broker,e);
 const restarted=new ProductionBroker(config,await Ledger.open(ledger.path),transport);assert.deepEqual(await sendEvent(restarted,e),a);assert.equal(calls.length,1);
 const sent=JSON.parse(calls[0].body)[0];assert.equal(sent.name,'betel-production/'+e.name);assert.match(sent.id,/^betel-[a-f0-9]{64}$/);assert.ok(!calls[0].url.includes('project-test'));
 await reject(sendEvent(restarted,{...e,data:{campaignId:'changed'}}),'event_id_conflict');assert.equal(calls.length,1);
});
test('delivery timeout stays uncertain over restart and is never automatically retried',async t=>{
 const {broker,ledger,calls,transport}=await setup(t,()=>{throw Error('timeout');}),e=event();await assert.rejects(sendEvent(broker,e));
 const restarted=new ProductionBroker(config,await Ledger.open(ledger.path),transport);await reject(sendEvent(restarted,e),'event_delivery_uncertain');assert.equal(calls.length,1);
});
test('missing identity, old event, foreign event and batch are denied before engine calls',async t=>{
 const {broker,calls}=await setup(t);const e=event();delete e.id;await reject(sendEvent(broker,e),'missing_field');
 await reject(sendEvent(broker,{...event(),name:'connectyhub/ping'}),'event_not_allowed');
 await reject(sendEvent(broker,{...event(),ts:config.activeFrom-1}),'event_time_denied');
 await reject(broker.event('/e/project-test',[event(),event()]),'single_event_required');assert.equal(calls.length,0);
});
test('event callback verifies pinned engine function, owned receipt, names and both signatures',async t=>{
 const {broker,calls}=await setup(t);await sendEvent(broker);
 const fn=manifest.find(f=>f.id==='betel-ai-meta-whatsapp-campaigns');const e={...event(),id:'01BETELRECEIPT',name:'betel-production/meta-whatsapp/campaign.process'};
 const req=callback(fn,e);const response=await broker.handle(req);assert.equal(response.status,200);assert.ok(verify(response.text,engine,response.headers['x-inngest-signature']));
 assert.equal(JSON.parse(calls[1].body).event.name,'meta-whatsapp/campaign.process');
 const bad=callback(fn,e,{ctx:{...req.body.ctx,fn_id:config.functionBindings[manifest[0].id]}});await reject(broker.handle(bad),'engine_function_mismatch');
 await reject(broker.handle(callback(fn,{...e,id:'01FOREIGNRECEIPT'})),'unsubmitted_event');assert.equal(calls.length,2);
});
test('cron callback requires the exact reviewed cron, function binding and post-cutover timestamp',async t=>{
 const {broker,calls}=await setup(t);const fn=manifest[0];const e={name:'inngest/scheduled.timer',id:'01CRON',ts:Date.now(),data:{cron:fn.triggers[0].cron}};
 assert.equal((await broker.handle(callback(fn,e))).status,200);
 await reject(broker.handle(callback(fn,{...e,ts:config.activeFrom-1})),'pre_cutover_event_denied');
 await reject(broker.handle(callback(fn,{...e,data:{cron:'* * * * *'}})),'cron_trigger_denied');
 assert.equal(calls.length,1);
});
test('production checkpoint ownership, generation and safe long sleep remain enforced after restart',async t=>{
 const {broker,ledger,transport,calls}=await setup(t),fn=manifest[0];await broker.handle(callback(fn,{name:'inngest/scheduled.timer',id:'01CRON',ts:Date.now(),data:{cron:fn.triggers[0].cron}}));
 const restarted=new ProductionBroker(config,await Ledger.open(ledger.path),transport);
 const body={run_id:'01PRODRUN',fn_id:config.functionBindings[fn.id],qi_id:'queue',request_id:'dispatch1',generation_id:1,ts:Date.now(),steps:[{op:'Sleep',id:'scheduled',name:new Date(Date.now()+86400000).toISOString()}]};
 const call=b=>restarted.handle({method:'POST',rawUrl:'/v1/checkpoint/01PRODRUN/async',headers:{authorization},body:b});
 assert.equal((await call(body)).status,200);await reject(call({...body,generation_id:2}),'checkpoint_generation_denied');
 await reject(call({...body,fn_id:config.functionBindings[manifest[1].id]}),'checkpoint_ownership_denied');
 await reject(call({...body,steps:[{op:'InvokeFunction',id:'bad'}]}),'opcode_denied');assert.equal(calls.length,2);
 for(const run of ['__proto__','constructor','foreign'])await reject(restarted.handle({method:'GET',rawUrl:`/v0/runs/${run}/actions`,headers:{authorization}}),'run_not_owned');
});
test('paused runtime rejects business events and registration remains separately disabled',async t=>{
 const {ledger,transport,calls}=await setup(t);const paused=new ProductionBroker({...config,live:false},ledger,transport);
 await reject(sendEvent(paused),'integration_not_enabled');await reject(paused.handle({method:'POST',rawUrl:'/fn/register',headers:{authorization},body:{}}),'registration_disabled');assert.equal(calls.length,0);
});


test('scraper batch forbids whole-function retry and long callback budget leaves control plane short', async t=>{
 const {broker}=await setup(t);
 assert.deepEqual(config.functions.find(f=>f.id==='betel-ai-link-batch-scraper').steps.step.retries,{attempts:0});
 assert.ok(config.functions.filter(f=>f.id!=='betel-ai-link-batch-scraper').every(f=>f.steps.step.retries===undefined));
 const budgets=[];const timeout=AbortSignal.timeout;
 AbortSignal.timeout=ms=>{budgets.push(ms);return timeout(1_000);};
 try {
  await sendEvent(broker);
  const fn=manifest[0];await broker.handle(callback(fn,{name:'inngest/scheduled.timer',id:'01CRON',ts:Date.now(),data:{cron:fn.triggers[0].cron}}));
 } finally {AbortSignal.timeout=timeout;}
 assert.deepEqual(budgets,[30_000,310_000]);
});
