import 'server-only';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {AiApiError,authenticateAi,hashAiSecret,record,rpc} from './gateway';
import {loadGeminiCredentials} from '@/lib/gemini/credentials';
import {aiModelDefinition} from './model-catalog';
import {beginAiOperation,failAiOperation,reserveAiOperation,saveAiResource,settleAiOperation,type AiAuth,type AiOperation} from './operation-ledger';
import {addAiUnits,priceAiUnits,type AiPriceCard,type AiUnits} from './operation-pricing';
import {measureAiContent} from './content-metering';

export function assertAiRelay(request:Request) {
  const expected=process.env.AI_RELAY_SECRET??'',provided=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
  if(expected.length<32||Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(expected),Buffer.from(provided)))throw new AiApiError('invalid_api_key',401,'Acesso inválido.');
}
function liveBudget(operation:AiOperation):AiUnits {
  if(operation.model.id==='music-realtime-exp')return {audio_second:60};
  const input=operation.model.inputCapacity,output=Math.min(8192,operation.model.outputCapacity);
  const units:AiUnits={};
  // Price each possible modality; this is a held budget, not a customer debit.
  for(const meter of ['input','audio_input','video_input','image_input'])if(operation.prices[meter])units[meter]=input;
  for(const meter of ['output','audio_output'])if(operation.prices[meter])units[meter]=output;
  return units;
}
export async function createAiLive(client:SupabaseClient,request:Request,raw:unknown) {
  const url=process.env.AI_RELAY_PUBLIC_URL;
  if(!url||!/^wss:\/\//.test(url)||!process.env.AI_RELAY_SECRET)throw new AiApiError('live_unavailable',503,'O serviço em tempo real está temporariamente indisponível.');
  const auth=await authenticateAi(request,client),body=record(raw),operation=await beginAiOperation(client,request,auth,'live',body);
  if(operation.replay)throw new AiApiError('session_already_created',409,'Crie uma nova identidade para abrir outra sessão.');
  try {
    if(operation.model.family!=='live')throw new AiApiError('model_capability_unavailable',422,'Selecione um modelo em tempo real.');
    const secret=randomBytes(32).toString('hex'),config=record(body.config);
    const allowed=['generationConfig','systemInstruction','tools','realtimeInputConfig','inputAudioTranscription','outputAudioTranscription','contextWindowCompression','proactivity'];
    if(Object.keys(config).some(k=>!allowed.includes(k)))throw new AiApiError('invalid_configuration',422,'Configuração de sessão não suportada.');
    const tools=Array.isArray(config.tools)?config.tools.map(record):[];
    // Function execution occurs in the integrator; built-in tools need usage metadata.
    if(tools.some(t=>Object.keys(t).some(k=>!['functionDeclarations'].includes(k))))throw new AiApiError('invalid_tool',422,'Use funções locais nesta sessão. Pesquisa está disponível em Interações.');
    const generation=record(config.generationConfig),output=Number(generation.maxOutputTokens??Math.min(8192,operation.model.outputCapacity));
    if(!Number.isInteger(output)||output<1||output>Math.min(8192,operation.model.outputCapacity))throw new AiApiError('invalid_configuration',422,'Configuração de resposta inválida.');
    const setup=operation.model.id==='music-realtime-exp'?{model:`models/${operation.model.providerId}`}:{...config,model:`models/${operation.model.providerId}`,generationConfig:{...generation,maxOutputTokens:output}};
    const expires=new Date(Date.now()+60000).toISOString();
    await reserveAiOperation(client,operation,liveBudget(operation));
    await saveAiResource(client,operation,'live',{ticket_hash:hashAiSecret(secret),setup,sequence:0,completed_units:{},turn_units:{},turn:0});
    const saved=await client.from('ai_resources').update({expires_at:expires}).eq('id',operation.id);
    if(saved.error)throw new Error('Não foi possível criar a sessão.');
    return {id:operation.id,object:'live.session',url,access_key:secret,expires_at:expires,model:operation.model.id};
  }catch(error){await failAiOperation(client,operation,error,false);throw error;}
}

export function measureLiveUsage(usage:Record<string,unknown>,prices:AiPriceCard) {
  return measureAiContent({usageMetadata:{...usage,candidatesTokenCount:usage.responseTokenCount,candidatesTokensDetails:usage.responseTokensDetails},candidates:[]},prices);
}

export async function aiRelayCommand(client:SupabaseClient,raw:unknown) {
  const body=record(raw),id=String(body.id??'');
  if(!['connect','checkpoint','close'].includes(String(body.action)))throw new AiApiError('invalid_action',422,'Ação inválida.');
  if(!/^[a-f0-9-]{36}$/i.test(id))throw new AiApiError('invalid_session',422,'Sessão inválida.');
  if(body.action==='connect') {
    if(typeof body.access_key!=='string'||!/^[a-f0-9]{64}$/.test(body.access_key))throw new AiApiError('invalid_session',401,'Sessão inválida.');
    const row=await rpc(client,'consume_ai_live_ticket',{p_id:id,p_hash:hashAiSecret(body.access_key)});
    const {apiKey}=await loadGeminiCredentials(client),metadata=record(row.metadata);
    return {id,api_key:apiKey,setup:metadata.setup,music:String(row.model_id)==='music-realtime-exp'};
  }
  const loaded=await client.from('ai_resources').select('*').eq('id',id).eq('kind','live').single();
  if(loaded.error||!loaded.data)throw new AiApiError('invalid_session',404,'Sessão não encontrada.');
  const row=loaded.data,metadata=record(row.metadata),model=aiModelDefinition(row.model_id);
  if(!model)throw new Error('Modelo indisponível.');
  const operation:AiOperation={id,kind:'live',model,prices:metadata.prices as AiPriceCard,
    auth:{project:{id:row.project_id},key:{id:row.key_id},billingOrganizationId:row.organization_id,billing:{planCode:metadata.plan_code}} as AiAuth};
  if(row.status==='completed')return {ok:true,result:metadata.result};
  if(row.status!=='processing')throw new AiApiError('invalid_session',409,'Sessão encerrada.');
  const sequence=Number(body.sequence);
  if(!Number.isSafeInteger(sequence)||sequence<1)throw new AiApiError('invalid_sequence',422,'Sequência inválida.');
  if(sequence<=Number(metadata.sequence)){
    const held=priceAiUnits(operation.prices,addAiUnits(record(metadata.completed_units) as AiUnits,record(metadata.turn_units) as AiUnits,liveBudget(operation)));
    await rpc(client,'extend_ai_reservation',{p_request:id,p_amount:metadata.plan_code==='internal'?0:held.credits});
    return {ok:true};
  }
  if(sequence!==Number(metadata.sequence)+1)throw new AiApiError('invalid_sequence',409,'Sequência fora de ordem.');
  let completed=record(metadata.completed_units) as AiUnits,turnUnits=record(metadata.turn_units) as AiUnits;
  const turn=Number(body.turn??metadata.turn);
  if(!Number.isSafeInteger(turn)||turn<Number(metadata.turn))throw new AiApiError('invalid_sequence',409,'Turno inválido.');
  if(turn!==Number(metadata.turn)){completed=addAiUnits(completed,turnUnits);turnUnits={};}
  if(body.usage)turnUnits=measureLiveUsage(record(body.usage),operation.prices);
  if(body.audio_seconds!==undefined) {
    const seconds=Number(body.audio_seconds);
    if(!Number.isFinite(seconds)||seconds<0)throw new Error('Duração inválida.');
    turnUnits={audio_second:seconds};
  }
  const units=addAiUnits(completed,turnUnits),next={...metadata,sequence,turn,turn_units:turnUnits,completed_units:completed};
  const actual=priceAiUnits(operation.prices,units);
  // Persist measured work before attempting to obtain more funds.
  const saved=await client.from('ai_resources').update({metadata:next,updated_at:new Date().toISOString()}).eq('id',id).eq('metadata->>sequence',String(metadata.sequence)).select('id').maybeSingle();
  if(saved.error||!saved.data)throw new AiApiError('invalid_sequence',409,'Atualização simultânea.');
  if(body.action==='close') {
    if((body.incomplete===true||!Object.keys(units).length) && body.dispatched===true) {
      await failAiOperation(client,operation,new Error('Consumo final ausente.'),true);
      await client.from('ai_resources').update({status:'uncertain'}).eq('id',id);return {ok:true,status:'uncertain'};
    }
    await client.from('ai_resources').update({status:'settling'}).eq('id',id);
    const result=await settleAiOperation(client,operation,units,{id,object:'live.session',status:'completed'});
    await client.from('ai_resources').update({status:'completed',metadata:{...next,result}}).eq('id',id);
    return {ok:true,result};
  }
  if(body.action!=='checkpoint')throw new AiApiError('invalid_action',422,'Ação inválida.');
  const budget=priceAiUnits(operation.prices,addAiUnits(units,liveBudget(operation)));
  await rpc(client,'extend_ai_reservation',{p_request:id,p_amount:metadata.plan_code==='internal'?0:budget.credits});
  return {ok:true,credits:actual.credits};
}

/** Recovery never assumes that a disconnected upstream stopped generating. */
export async function reconcileAiLive(client:SupabaseClient) {
  const stale=new Date(Date.now()-5*60000).toISOString();
  const result=await client.from('ai_resources').select('*').eq('kind','live')
    .in('status',['preparing','processing','settling']).lt('updated_at',stale).order('updated_at').limit(50);
  if(result.error)throw new Error('Não foi possível conferir as sessões.');
  let checked=0,pending=0;
  for(const row of result.data??[])try {
    if(row.status==='preparing') {
      // SQL locks the ticket and rechecks its state against a concurrent connection.
      await rpc(client,'expire_ai_live_ticket',{p_id:row.id});checked++;continue;
    }
    if(row.status==='processing') {
      const updated=await client.from('ai_resources').update({status:'uncertain'}).eq('id',row.id).eq('status','processing').eq('updated_at',row.updated_at).select('id').maybeSingle();
      if(updated.error)throw updated.error;
      if(updated.data)await rpc(client,'finish_ai_request',{p_request:row.request_id,p_status:'uncertain',p_error:'live_connection_interrupted'});
      pending++;continue;
    }
    const metadata=record(row.metadata),model=aiModelDefinition(row.model_id);
    if(!model)throw new Error('Modelo indisponível.');
    const operation:AiOperation={id:row.request_id,kind:'live',model,prices:metadata.prices as AiPriceCard,
      auth:{project:{id:row.project_id},key:{id:row.key_id},billingOrganizationId:row.organization_id,billing:{planCode:metadata.plan_code}} as AiAuth};
    const settled=await settleAiOperation(client,operation,addAiUnits(record(metadata.completed_units) as AiUnits,record(metadata.turn_units) as AiUnits),{id:row.id,object:'live.session',status:'completed'});
    const saved=await client.from('ai_resources').update({status:'completed',metadata:{...metadata,result:settled}}).eq('id',row.id);
    if(saved.error)throw saved.error;checked++;
  }catch{pending++;}
  return {checked,pending};
}
