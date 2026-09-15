import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Broker} from './broker.mjs';
import {canonical,demand,equal,exactKeys,verify} from './protocol.mjs';

export const manifest=JSON.parse(readFileSync(new URL('./betel-production-manifest.json',import.meta.url),'utf8'));
const names=new Set(manifest.flatMap(f=>f.triggers.flatMap(t=>t.event?[t.event]:[])));
const prefix='betel-production/';
const idPattern=/^[a-zA-Z0-9_-]{1,160}$/;
const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
const owned=(o,k)=>Object.hasOwn(o,k)?o[k]:undefined;
export function productionManifest(callbackUrl){
 return manifest.map(f=>({...f,triggers:f.triggers.map(t=>t.event?{event:prefix+t.event}:t),steps:{step:{id:'step',name:'step',runtime:{type:'http',url:`${callbackUrl}?fnId=${f.id}&stepId=step`}}}}));
}

// A separate, paused-by-default broker instance is required. Never reuse the rehearsal ledger.
export class ProductionBroker extends Broker {
 validateScope(c){
  demand(c.mode==='betel-production'&&c.appId==='betel-ai',500,'invalid_production_scope');
  demand(canonical(c.functions)===canonical(productionManifest(c.callbackUrl)),500,'unreviewed_manifest');
  demand(c.functionBindings&&Object.keys(c.functionBindings).every(k=>manifest.some(f=>f.id===k)&&uuidPattern.test(c.functionBindings[k])),500,'invalid_function_bindings');
  if(c.live===true){
   demand(Object.keys(c.functionBindings).length===12&&new Set(Object.values(c.functionBindings)).size===12,500,'function_bindings_incomplete');
   demand(Number.isSafeInteger(c.activeFrom)&&c.activeFrom>0,500,'cutover_time_required');
  }
 }
 validateSteps(items){
  demand(Array.isArray(items)&&items.length>0&&items.length<=32,400,'invalid_steps');
  demand(Buffer.byteLength(JSON.stringify(items))<=131072,413,'steps_too_large');
  for(const s of items){
   demand(s&&['StepRun','StepPlanned','StepError','StepFailed','Sleep','RunComplete'].includes(s.op),403,'opcode_denied');
   demand(typeof s.id==='string'&&s.id.length<=160,400,'invalid_step_id');
   demand(!s.opts?.url&&!s.opts?.function_id&&!s.opts?.event,403,'step_target_denied');
   if(s.op==='Sleep'){
    const duration=/^(\d+)(ms|s|m|h|d)$/.exec(s.name??'');
    const seconds=duration?Number(duration[1])*({ms:.001,s:1,m:60,h:3600,d:86400}[duration[2]]):null;
    const absolute=typeof s.name==='string'&&/^\d{4}-\d\d-\d\dT/.test(s.name)?Date.parse(s.name):NaN;
    demand(seconds!==null?seconds<=366*86400:Number.isFinite(absolute)&&absolute<=Date.now()+366*86400000,403,'sleep_limit');
   }
  }
 }
 async handle(request){
  // Registration can be prepared while execution remains paused. Only the server-held
  // project signing credential and exact checked-in manifest can request it.
  if(request.method==='POST'&&request.rawUrl==='/fn/register'){
   this.limit();demand(equal(request.headers?.authorization,this.projectAuth),401,'project_auth_required');
   return this.register(request.body);
  }
  return super.handle(request);
 }
 async register(body){
  demand(this.c.allowRegistration===true,403,'registration_disabled');
  exactKeys(body,['url','deployType','framework','appName','functions','sdk','v'],['capabilities','appVersion']);
  demand(body.url===this.c.callbackUrl&&body.appName===this.c.appId&&body.deployType==='ping'&&body.v==='0.1'&&body.sdk==='js:v4.6.0',403,'registration_scope_denied');
  demand(canonical(body.functions)===canonical(this.c.functions),403,'function_manifest_denied');
  demand(this.ledger.value.registrations<16,429,'registration_cap');
  await this.ledger.change(s=>{s.registrations++;});
  return this.upstream('/fn/register','POST',{url:this.c.callbackUrl,deployType:'ping',framework:body.framework,appName:'betel-ai',functions:this.c.functions,sdk:'js:v4.6.0',v:'0.1',capabilities:{}});
 }
 async event(path,body){
  demand(equal(path,`/e/${this.c.projectEventKey}`),401,'event_key_required');
  const list=Array.isArray(body)?body:[body];demand(list.length===1,400,'single_event_required');
  const event=list[0];exactKeys(event,['name','data','id'],['ts','v']);
  demand(names.has(event.name),403,'event_not_allowed');
  demand(typeof event.id==='string'&&event.id.length>0&&event.id.length<=256&&!/[\x00-\x1f]/.test(event.id),400,'stable_event_id_required');
  demand(event.data&&typeof event.data==='object'&&!Array.isArray(event.data),400,'invalid_event_data');
  demand(Buffer.byteLength(canonical(event.data))<=49152,413,'event_too_large');
  demand(event.ts===undefined||Number.isSafeInteger(event.ts)&&event.ts>=this.c.activeFrom&&event.ts<=Date.now()+60000,400,'event_time_denied');
  const key=hash([event.name,event.id]),fingerprint=hash([event.name,event.data,event.v??null]);
  const previous=await this.ledger.change(state=>{
   const prior=owned(state.events,key);
   if(prior){demand(prior.hash===fingerprint,409,'event_id_conflict');return prior;}
   demand(Object.keys(state.events).length<100000,429,'ledger_capacity');
   state.events[key]={hash:fingerprint,name:event.name,state:'uncertain',createdAt:Date.now()};return null;
  });
  if(previous){demand(previous.state==='accepted',409,'event_delivery_uncertain');return {status:200,body:previous.reply};}
  const response=await this.upstream(`/e/${this.c.upstreamEventKey}`,'POST',[{...event,name:prefix+event.name,id:'betel-'+key}]);
  demand(response.status===200,502,'event_delivery_uncertain');
  const reply=JSON.parse(response.text);demand(Array.isArray(reply.ids)&&reply.ids.length===1&&idPattern.test(reply.ids[0]),502,'invalid_event_receipt');
  const receipt={ids:reply.ids,status:200};
  await this.ledger.change(state=>{Object.assign(state.events[key],{state:'accepted',reply:receipt});});
  return {status:200,body:receipt};
 }
 async callback(method,url,headers,body){
  demand(this.c.live===true,503,'integration_not_enabled');
  demand(method==='POST',403,'callback_method_denied');
  demand([...url.searchParams.keys()].every(k=>['fnId','stepId'].includes(k))&&url.searchParams.getAll('fnId').length===1&&url.searchParams.getAll('stepId').length<=1,403,'callback_query_denied');
  const fn=manifest.find(f=>f.id===url.searchParams.get('fnId'));
  demand(fn,403,'callback_function_denied');
  demand(!url.searchParams.has('stepId')||idPattern.test(url.searchParams.get('stepId')),400,'invalid_step');
  demand(verify(body,this.c.upstreamSigningKey,headers['x-inngest-signature']),401,'engine_signature_required');
  demand(body?.ctx?.fn_id===this.c.functionBindings[fn.id],403,'engine_function_mismatch');
  demand(idPattern.test(body.ctx.run_id??'')&&typeof body.ctx.qi_id==='string',400,'invalid_run_context');
  const requestId=headers['x-request-id'],generation=headers['x-inngest-generation-id'];
  demand(idPattern.test(requestId??''),400,'invalid_request_id');
  demand(generation===undefined||/^\d{1,12}$/.test(generation),400,'invalid_generation');
  const checkEvent=e=>{
   demand(e&&Number.isSafeInteger(e.ts)&&e.ts>=this.c.activeFrom&&e.ts<=Date.now()+60000,403,'pre_cutover_event_denied');
   if(e.name==='inngest/scheduled.timer'){
    demand(fn.triggers.some(t=>t.cron&&t.cron===e.data?.cron),403,'cron_trigger_denied');return e;
   }
   demand(typeof e.name==='string'&&e.name.startsWith(prefix),403,'foreign_event_denied');
   const name=e.name.slice(prefix.length);
   demand(fn.triggers.some(t=>t.event===name),403,'event_function_mismatch');
   // The engine event's id is its receipt ID, not necessarily the client id.
   const accepted=Object.values(this.ledger.value.events).some(v=>v.name===name&&v.state==='accepted'&&v.reply?.ids?.includes(e.id));
   demand(accepted,403,'unsubmitted_event');
   return {...e,name};
  };
  const event=checkEvent(body.event);const events=body.events?.map(checkEvent);
  demand(!events||events.length===1&&events[0].id===event.id,403,'callback_batch_denied');
  const run=body.ctx.run_id;
  await this.ledger.change(state=>{
   const prior=owned(state.runs,run);
   demand(!prior||prior.fnId===body.ctx.fn_id&&prior.eventId===body.event.id,403,'run_collision');
   demand(prior||Object.keys(state.runs).length<100000,429,'ledger_capacity');
   const value=prior??{fnId:body.ctx.fn_id,eventId:body.event.id,dispatches:{}};
   demand(Object.keys(value.dispatches).length<2000||Object.hasOwn(value.dispatches,requestId),429,'dispatch_cap');
   value.dispatches[requestId]={queue:body.ctx.qi_id,generation:generation===undefined?null:Number(generation)};
   state.runs[run]=value;
  });
  return this.forwardCallback(url,headers,{...body,event,...(events?{events}:{})});
 }
}
