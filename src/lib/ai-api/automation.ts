import 'server-only';
import {randomBytes,randomUUID} from 'node:crypto';
import {CronExpressionParser} from 'cron-parser';
import type {SupabaseClient} from '@supabase/supabase-js';
import {encryptCredentialValue,decryptCredentialValue} from '@/lib/security/credentials-crypto';
import {statusForAccessControlError} from '@/lib/billing/access-control';
import {AiApiError,authorizeAiKey,record,rpc} from './gateway';
import type {AiAuth} from './operation-ledger';
import {createAuthorizedAiResource} from './resources';
import {deliverAiWebhook,publicWebhookUrl} from './webhook-transport';

type Row=Record<string,unknown>;
export const automationCollections=['webhooks','triggers'] as const;
export function nextAiSchedule(schedule:unknown,zone:unknown,now=new Date()) {
  if(typeof schedule!=='string'||schedule.length>100||schedule.trim().split(/\s+/).length!==5||/\bH\b|\?/i.test(schedule))throw new AiApiError('invalid_schedule',422,'Use uma expressão cron de cinco campos.');
  if(typeof zone!=='string'||zone.length>80)throw new AiApiError('invalid_schedule',422,'Informe time_zone.');
  try {new Intl.DateTimeFormat('en',{timeZone:zone});return CronExpressionParser.parse(schedule,{tz:zone,currentDate:now}).next().toISOString();}
  catch{throw new AiApiError('invalid_schedule',422,'Horário ou fuso inválido.');}
}
const publicHook=(row:Row)=>Object.fromEntries(['id','project_id','url','events','enabled','created_at'].map(k=>[k,row[k]]));
const publicTrigger=(row:Row)=>Object.fromEntries(['id','project_id','display_name','schedule','time_zone','interaction','enabled','next_run_at','created_at'].map(k=>[k,row[k]]));
const table=(collection:string)=>collection==='webhooks'?'ai_webhooks':'ai_triggers';
async function owned(client:SupabaseClient,auth:AiAuth,collection:string,id:string) {
  const found=await client.from(table(collection)).select('*').eq('project_id',auth.project.id).eq('id',id).maybeSingle();
  if(found.error)throw new Error('Não foi possível consultar a configuração.');
  if(!found.data)throw new AiApiError('resource_not_found',404,'Recurso não encontrado neste projeto.');return found.data as Row;
}
export async function aiAutomationApi(client:SupabaseClient,auth:AiAuth,request:Request,parts:string[],raw?:unknown) {
  const [collection,id,action]=parts,body=record(raw),method=request.method;
  if(parts.length>3||!automationCollections.includes(collection as never))throw new AiApiError('resource_not_found',404,'Operação não encontrada.');
  if(id) {
    const row=await owned(client,auth,collection,id);
    if(action==='deliveries'&&collection==='webhooks'&&method==='GET') {
      const deliveries=await client.from('ai_webhook_deliveries').select('id,request_id,event_type,status,attempts,http_status,created_at').eq('project_id',auth.project.id).eq('webhook_id',id).order('created_at',{ascending:false}).limit(100);
      if(deliveries.error)throw new Error('Não foi possível consultar entregas.');return {object:'list',data:deliveries.data};
    }
    if(action==='runs'&&collection==='triggers'&&method==='GET') {
      const runs=await client.from('ai_trigger_runs').select('id,request_id,status,error_code,created_at').eq('project_id',auth.project.id).eq('trigger_id',id).order('created_at',{ascending:false}).limit(100);
      if(runs.error)throw new Error('Não foi possível consultar execuções.');return {object:'list',data:runs.data};
    }
    if(action)throw new AiApiError('resource_not_found',404,'Operação não encontrada.');
    if(method==='GET')return collection==='webhooks'?publicHook(row):publicTrigger(row);
    if(method==='PATCH'||method==='DELETE') {
      if(method==='PATCH'&&(typeof body.enabled!=='boolean'||Object.keys(body).some(k=>k!=='enabled')))throw new AiApiError('invalid_configuration',422,'Envie apenas enabled como booleano.');
      const enabled=method==='PATCH'&&body.enabled===true;
      const patch={enabled,...(collection==='triggers'&&enabled?{next_run_at:nextAiSchedule(row.schedule,row.time_zone)}:{})};
      const saved=await client.from(table(collection)).update(patch).eq('id',id).eq('project_id',auth.project.id).select('*').single();
      if(saved.error)throw new Error('Não foi possível atualizar a configuração.');return collection==='webhooks'?publicHook(saved.data):publicTrigger(saved.data);
    }
    throw new AiApiError('method_not_allowed',405,'Método não suportado.');
  }
  if(method==='GET') {
    const data=await client.from(table(collection)).select('*').eq('project_id',auth.project.id).order('created_at',{ascending:false}).limit(100);
    if(data.error)throw new Error('Não foi possível listar configurações.');return {object:'list',data:(data.data??[]).map(collection==='webhooks'?publicHook:publicTrigger)};
  }
  if(method!=='POST')throw new AiApiError('method_not_allowed',405,'Método não suportado.');
  if(collection==='webhooks') {
    if(Object.keys(body).some(k=>!['url','events'].includes(k)))throw new AiApiError('invalid_configuration',422,'Use url e events.');
    let url:URL;try{url=publicWebhookUrl(body.url);}catch{throw new AiApiError('invalid_webhook_url',422,'Use uma URL HTTPS pública.');}
    const events=body.events??['request.completed','request.failed'];
    if(!Array.isArray(events)||!events.length||events.some(e=>!['request.completed','request.failed'].includes(String(e))))throw new AiApiError('invalid_event',422,'Evento inválido.');
    const secret=randomBytes(32).toString('hex');
    const saved=await client.from('ai_webhooks').insert({project_id:auth.project.id,url:url.href,events:[...new Set(events)],secret_encrypted:encryptCredentialValue(secret)}).select('*').single();
    if(saved.error)throw new Error('Não foi possível criar o webhook.');return {...publicHook(saved.data),signing_secret:secret};
  }
  if(Object.keys(body).some(k=>!['display_name','schedule','time_zone','interaction'].includes(k)))throw new AiApiError('invalid_configuration',422,'Configuração de agendamento inválida.');
  const interaction=record(body.interaction);
  if(!interaction.input||JSON.stringify(interaction).length>100000)throw new AiApiError('invalid_input',422,'Informe interaction.input; envie arquivos pela API para conteúdos maiores.');
  if(interaction.model&&interaction.model!==auth.key.model_id)throw new AiApiError('model_key_mismatch',422,'O agendamento usa o modelo da chave.');
  const next=nextAiSchedule(body.schedule,body.time_zone??'America/Sao_Paulo');
  const saved=await client.from('ai_triggers').insert({project_id:auth.project.id,key_id:auth.key.id,display_name:String(body.display_name??'Agendamento').slice(0,200),
    schedule:body.schedule,time_zone:body.time_zone??'America/Sao_Paulo',interaction,next_run_at:next}).select('*').single();
  if(saved.error)throw new Error('Não foi possível criar o agendamento.');return publicTrigger(saved.data);
}

export async function processAiTriggers(client:SupabaseClient) {
  const due=await client.from('ai_triggers').select('*').eq('enabled',true).lte('next_run_at',new Date().toISOString()).order('next_run_at').limit(20);
  if(due.error)throw new Error('Não foi possível carregar agendamentos.');
  for(const trigger of due.data??[])await rpc(client,'claim_ai_trigger',{p_id:trigger.id,p_due:trigger.next_run_at,p_next:nextAiSchedule(trigger.schedule,trigger.time_zone)});
  const pending=await client.from('ai_trigger_runs').select('id').eq('status','pending').order('created_at').limit(2);
  if(pending.error)throw new Error('Não foi possível carregar execuções.');
  let submitted=0;
  for(const candidate of pending.data??[]) {
    const lease=randomUUID(),run=record(await rpc(client,'claim_ai_trigger_run',{p_id:candidate.id,p_lease:lease}));
    if(!run.id)continue;
    let patch:Row={};
    try {
      const trigger=await client.from('ai_triggers').select('enabled').eq('id',run.trigger_id).single();
      if(trigger.error)throw new Error('Não foi possível verificar agendamento.');
      if(!trigger.data?.enabled){patch={status:'skipped',error_code:'trigger_paused'};}
      else {
        const key=await client.from('ai_api_keys').select('id,project_id,status,model_id').eq('id',run.key_id).eq('project_id',run.project_id).single();
        if(key.error)throw new Error('Não foi possível verificar chave.');
        const auth=await authorizeAiKey(client,key.data);
        const response=await createAuthorizedAiResource(client,new Request('https://www.connectyhub.com.br/api/v1/ai/interactions',{method:'POST',headers:{'Idempotency-Key':`trigger:${run.id}`}}),auth,'interactions',run.interaction);
        patch={status:'submitted',request_id:('request_id' in response ? response.request_id : undefined)??response.id,error_code:null};submitted++;
      }
    }catch(error){
      // Recover the original request, never dispatch again with a new identity.
      const original=await client.from('ai_requests').select('id,status').eq('project_id',run.project_id).eq('idempotency_key',`trigger:${run.id}`).maybeSingle();
      if(original.error)continue;
      if(original.data)patch={status:'submitted',request_id:original.data.id,error_code:null};
      else if(error instanceof AiApiError&&error.status<500)patch={status:'failed',error_code:error.code};
      else if(statusForAccessControlError(error,503)<500)patch={status:'failed',error_code:'account_access_denied'};
      else continue; // Lease expiry retries verification; no unconfirmed failure is discarded.
    }
    const update=await client.from('ai_trigger_runs').update({...patch,lease_until:null}).eq('id',run.id).eq('lease_id',lease);
    if(update.error)throw new Error('Execução aguarda recuperação.');
  }
  return {submitted};
}

export async function processAiWebhooks(client:SupabaseClient) {
  const due=await client.from('ai_webhook_deliveries').select('id').eq('status','pending').lte('next_attempt_at',new Date().toISOString()).order('next_attempt_at').limit(20);
  if(due.error)throw new Error('Não foi possível carregar entregas.');
  let delivered=0;
  for(const candidate of due.data??[]) {
    const lease=randomUUID(),row=record(await rpc(client,'claim_ai_webhook_delivery',{p_id:candidate.id,p_lease:lease}));if(!row.id)continue;
    let code:number|null=null,skip=false;
    try {
      const hook=await client.from('ai_webhooks').select('*').eq('id',row.webhook_id).eq('project_id',row.project_id).single();
      if(hook.error)throw new Error('Configuração indisponível.');
      skip=!hook.data?.enabled;
      if(!skip)code=await deliverAiWebhook(hook.data.url,decryptCredentialValue(hook.data.secret_encrypted),String(row.id),{id:row.id,...record(row.payload)});
    }catch{/* Retry transport failures without re-running or re-billing the AI request. */}
    const ok=code!==null&&code>=200&&code<300;
    const saved=await client.from('ai_webhook_deliveries').update({status:skip?'skipped':ok?'delivered':Number(row.attempts)>=8?'failed':'pending',http_status:code,
      next_attempt_at:new Date(Date.now()+Math.min(86400,30*2**Number(row.attempts))*1000).toISOString(),lease_until:null}).eq('id',row.id).eq('lease_id',lease);
    if(saved.error)throw new Error('Entrega aguarda recuperação.');if(ok)delivered++;
  }
  return {delivered};
}
