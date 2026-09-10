import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AiApiError, authenticateAi, record, rpc } from './gateway';
import { aiModelDefinition } from './model-catalog';
import { getOwnedAiResource } from './files';
import { aiProviderRequest, AiProviderFailure } from './provider-http';
import { beginAiOperation, reserveAiOperation, saveAiResource, settleAiOperation, failAiOperation, type AiAuth, type AiOperation } from './operation-ledger';
import { addAiUnits, batchAiPrices, type AiPriceCard, type AiUnits } from './operation-pricing';
import { prepareExtendedContent } from './extended-content';
import { measureAiContent, publicContentResponse } from './content-metering';
import { measureAiInteraction, publicInteraction } from './interaction-metering';
import {createManagedAiResource} from './managed';
import {prepareAiEmbedding,measureAiEmbedding,embeddingValues} from './extended-embeddings';

type Row=Record<string,unknown>;
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.map(record):[];
const positive=(v:unknown,max:number)=>{const n=Number(v);if(!Number.isFinite(n)||n<=0||n>max)throw new AiApiError('invalid_configuration',422,'Configuração inválida para esta operação.');return n;};
export const resourceKinds:Record<string,string>={caches:'cache',batches:'batch',videos:'operation',stores:'store',documents:'document',interactions:'interaction',agents:'agent',environments:'environment'};
export function publicAiResource(row:Row) {
  const meta=record(row.metadata);
  return {id:row.id,object:'ai.resource',kind:row.kind,model:row.model_id,status:row.status,created_at:row.created_at,expires_at:row.expires_at,
    display_name:meta.display_name,request_id:row.request_id,...(row.status==='completed'||row.status==='requires_action'?{result:meta.result}:{})};
}
async function updateResource(client:SupabaseClient,id:unknown,patch:Row) {
  const result=await client.from('ai_resources').update({...patch,updated_at:new Date().toISOString()}).eq('id',id).select('*').single();
  if(result.error||!result.data)throw new Error('Não foi possível salvar o recurso.');return result.data as Row;
}
function resourceOperation(row:Row):AiOperation {
  const meta=record(row.metadata), model=aiModelDefinition(String(row.model_id));if(!model)throw new Error('Modelo ausente.');
  return {id:String(row.request_id),kind:String(meta.execution_kind),model,prices:meta.prices as AiPriceCard,
    auth:{key:{id:row.key_id},project:{id:row.project_id},billingOrganizationId:row.organization_id,billing:{planCode:meta.plan_code}} as AiAuth};
}
async function dispatchResource(client:SupabaseClient,operation:AiOperation,kind:string,metadata:Row,units:AiUnits,path:string,body:Row) {
  let dispatched=false;
  const resource=await saveAiResource(client,operation,kind,metadata);
  try {
    await reserveAiOperation(client,operation,units);
    await rpc(client,'start_ai_request',{p_request:operation.id});dispatched=true;
    const result=await aiProviderRequest(client,path,'POST',body);
    const name=String(result.name??result.id??'');
    if(!/^[A-Za-z0-9_./-]+$/.test(name)||name.includes('..'))throw new Error('Identidade de recurso ausente.');
    const meta={...record(resource.metadata),initial_result:result,...(kind==='cache'?{size:positive(record(result.usageMetadata).totalTokenCount,Number.MAX_SAFE_INTEGER)}:{})};
    const saved=await updateResource(client,resource.id,{provider_name:name,status:kind==='cache'?'active':'processing',metadata:meta,
      ...(kind==='cache'?{expires_at:result.expireTime??new Date(Date.now()+Number(metadata.ttl_seconds)*1000).toISOString()}:{}),});
    return publicAiResource(saved);
  }catch(error){
    await failAiOperation(client,operation,error,dispatched);
    await updateResource(client,resource.id,{status:dispatched&&(!(error instanceof AiProviderFailure)||error.uncertain)?'uncertain':'failed'}).catch(()=>undefined);
    throw error;
  }
}

export async function createAiResource(client:SupabaseClient,request:Request,collection:string,input:unknown) {
  return createAuthorizedAiResource(client,request,await authenticateAi(request,client),collection,input);
}
export async function createAuthorizedAiResource(client:SupabaseClient,request:Request,auth:AiAuth,collection:string,input:unknown) {
  const body=record(input);
  if(['agents','environments'].includes(collection))return createManagedAiResource(client,auth,collection,body);
  if(collection==='stores') {
    const saved=await client.from('ai_resources').insert({organization_id:auth.billingOrganizationId,project_id:auth.project.id,key_id:auth.key.id,
      kind:'store',metadata:{display_name:String(body.display_name??'Coleção').slice(0,200)}}).select('*').single();
    if(saved.error||!saved.data)throw new Error('Não foi possível criar a coleção.');
    try {const result=await aiProviderRequest(client,'/v1beta/fileSearchStores','POST',{displayName:record(saved.data.metadata).display_name});
      return publicAiResource(await updateResource(client,saved.data.id,{provider_name:result.name,status:'active'}));
    }catch(error){await updateResource(client,saved.data.id,{status:'failed'});throw error;}
  }
  const kind=resourceKinds[collection];if(!kind)throw new AiApiError('resource_not_found',404,'Operação não encontrada.');
  const operation=await beginAiOperation(client,request,auth,collection==='documents'?'indexing':collection==='videos'?'video':kind,body);
  if(operation.replay)return operation.replay;
  try {
    if(collection==='caches') {
      if(!operation.model.capabilities.includes('cache'))throw new AiApiError('model_capability_unavailable',422,'Este modelo não oferece cache.');
      const ttl=positive(body.ttl_seconds??3600,86400*7);
      const prepared=await prepareExtendedContent(client,auth,operation,{contents:body.contents,systemInstruction:body.systemInstruction,tools:body.tools});
      const size=prepared.units.input; const cacheBody={...prepared.body};delete cacheBody.generationConfig;
      return await dispatchResource(client,operation,'cache',{size,ttl_seconds:ttl,display_name:body.display_name},{cache_hour:size*ttl/3600},'/v1beta/cachedContents',
        {...cacheBody,model:`models/${operation.model.providerId}`,ttl:`${ttl}s`,displayName:String(body.display_name??'Contexto').slice(0,200)});
    }
    if(collection==='batches') {
      if(!Array.isArray(body.requests)||!body.requests.length||body.requests.length>100)throw new AiApiError('invalid_batch',422,'Envie entre 1 e 100 solicitações por lote.');
      const items=[],itemPrices:AiPriceCard[]=[];let total:AiUnits={};const base={...operation.prices},combined:AiPriceCard={};
      for(const [index,item] of body.requests.entries()) {
        operation.prices={...base};
        const entry=record(item), prepared=operation.model.family==='embeddings'?await prepareAiEmbedding(client,auth,operation,entry.request??entry):await prepareExtendedContent(client,auth,operation,entry.request??entry);
        const prices=batchAiPrices(operation.prices);itemPrices.push(prices);
        for(const [meter,price] of Object.entries(prices))combined[`item${index}_${meter}`]=price;
        total=addAiUnits(total,Object.fromEntries(Object.entries(prepared.units).map(([meter,quantity])=>[`item${index}_${meter}`,quantity])));
        items.push({request:{...prepared.body,model:`models/${operation.model.providerId}`},metadata:{key:String(entry.key??index),index:String(index)}});
      }
      operation.prices=combined;
      return await dispatchResource(client,operation,'batch',{count:items.length,item_prices:itemPrices,display_name:body.display_name},total,
        `/v1beta/models/${operation.model.providerId}:${operation.model.family==='embeddings'?'asyncBatchEmbedContent':'batchGenerateContent'}`,{batch:{displayName:String(body.display_name??'Lote').slice(0,200),inputConfig:{requests:{requests:items}}}});
    }
    if(collection==='documents') {
      const store=await getOwnedAiResource(client,auth,String(body.store).replace(/^stores\//,''),'store');
      const file=await getOwnedAiResource(client,auth,String(body.file).replace(/^files\//,''),'file');
      if(store.status!=='active'||file.status!=='active')throw new AiApiError('resource_not_ready',422,'O arquivo e a coleção precisam estar prontos.');
      const prepared=await prepareExtendedContent(client,auth,operation,{contents:[{parts:[{fileData:{fileUri:`files/${file.id}`}}]}]});
      return await dispatchResource(client,operation,'document',{store_id:store.id,size:prepared.units.input,display_name:record(file.metadata).display_name},
        {indexing_input:prepared.units.input},`/v1beta/${store.provider_name}:importFile`,{fileName:file.provider_name,
          ...(body.custom_metadata?{customMetadata:body.custom_metadata}:{}),...(body.chunking_config?{chunkingConfig:body.chunking_config}:{})});
    }
    if(collection==='videos') {
      if(!operation.model.providerId.startsWith('veo-'))throw new AiApiError('model_capability_unavailable',422,'Use Interações para este modelo de mídia.');
      const seconds=positive(body.duration_seconds??8,8), resolution=String(body.resolution??'720p');
      if(![4,6,8].includes(seconds)||!['720p','1080p','4k'].includes(resolution))throw new AiApiError('invalid_video',422,'Duração ou resolução inválida.');
      const instance:Row={prompt:String(body.prompt??'')};
      const inlineImage=(value:unknown)=>{const image=record(value);if(typeof image.bytesBase64Encoded!=='string'||!image.bytesBase64Encoded||!['image/png','image/jpeg'].includes(String(image.mimeType))||Object.keys(image).some(k=>!['bytesBase64Encoded','mimeType'].includes(k)))throw new AiApiError('invalid_image',422,'Envie a imagem incorporada com bytesBase64Encoded e mimeType.');return image;};
      for(const key of ['image','lastFrame'])if(body[key])instance[key]=inlineImage(body[key]);
      if(body.referenceImages){if(!Array.isArray(body.referenceImages)||body.referenceImages.length>3)throw new AiApiError('invalid_image',422,'Envie até três referências.');instance.referenceImages=body.referenceImages.map(item=>({image:inlineImage(record(item).image),referenceType:record(item).referenceType??'asset'}));}
      // Extension only accepts a completed video from this project.
      if(body.video) {if(resolution!=='720p')throw new AiApiError('invalid_video',422,'A extensão utiliza resolução 720p.');const prior=await getOwnedAiResource(client,auth,String(body.video).replace(/^videos\//,''),'operation');
        if(prior.status!=='completed')throw new AiApiError('resource_not_ready',422,'Vídeo ainda indisponível.');
        instance.video={uri:rows(record(prior.metadata).media)[0]?.uri};}
      const meter=`video_${resolution}`;
      return await dispatchResource(client,operation,'operation',{seconds,meter,extension:!!body.video}, {[meter]:body.video?7:seconds},
        `/v1beta/models/${operation.model.providerId}:predictLongRunning`,{instances:[instance],parameters:{sampleCount:1,durationSeconds:seconds,resolution,
          aspectRatio:body.aspect_ratio??'16:9',...(body.negative_prompt?{negativePrompt:body.negative_prompt}:{}),...(body.seed!==undefined?{seed:body.seed}:{}),...(body.person_generation?{personGeneration:body.person_generation}:{})}});
    }
    if(collection==='interactions')return await createInteraction(client,auth,operation,body);
    throw new AiApiError('resource_not_found',404,'Operação não encontrada.');
  }catch(error){
    // Dispatch owns its failure transition. Never release an uncertain paid call here.
    const state=await client.from('ai_requests').select('status').eq('id',operation.id).single();
    if(['preparing','reserved'].includes(String(state.data?.status)))await failAiOperation(client,operation,error,false);
    throw error;
  }
}

async function createInteraction(client:SupabaseClient,auth:AiAuth,operation:AiOperation,body:Row) {
  const accepted=['model','input','system_instruction','response_format','agent_config','generation_config','previous_interaction_id','agent_id','environment_id','tools'];
  if(Object.keys(body).some(key=>!accepted.includes(key)))throw new AiApiError('unsupported_parameter',422,'Campo não suportado em Interações. Consulte a referência desta operação.');
  // Client-controlled routing and service tiers must never bypass the bound model's tariff.
  if(Object.keys(record(body.agent_config)).some(key=>!['collaborative_planning','visualization','thinking_summaries'].includes(key)))throw new AiApiError('invalid_configuration',422,'Configuração do agente não suportada.');
  if(body.tools!==undefined&&!Array.isArray(body.tools))throw new AiApiError('invalid_tool',422,'tools deve ser uma lista.');
  if(['embeddings','live'].includes(operation.model.family)||operation.model.providerId.startsWith('veo-'))throw new AiApiError('model_capability_unavailable',422,'Use a operação específica deste modelo.');
  if(!body.input)throw new AiApiError('invalid_input',422,'Informe input.');
  const provider:Row={input:structuredClone(body.input),store:true,background:true};
  for(const field of ['system_instruction','response_format'])if(body[field]!==undefined)provider[field]=body[field];
  if(body.agent_config!==undefined) {
    const config=record(body.agent_config);
    if(!operation.model.providerId.startsWith('deep-research')||body.agent_id||
      (config.collaborative_planning!==undefined&&typeof config.collaborative_planning!=='boolean')||
      (config.visualization!==undefined&&!['off','auto'].includes(String(config.visualization)))||
      (config.thinking_summaries!==undefined&&!['none','auto'].includes(String(config.thinking_summaries))))
      throw new AiApiError('invalid_configuration',422,'Estas opções exigem um modelo de pesquisa compatível.');
    provider.agent_config={...config,type:'deep-research'};
  }
  let agent=/^(deep-research|antigravity)/.test(operation.model.providerId);
  provider[agent?'agent':'model']=operation.model.providerId;
  if(body.agent_id) {
    const owned=await getOwnedAiResource(client,auth,String(body.agent_id),'agent');
    if(owned.status!=='active'||owned.model_id!==operation.model.id)throw new AiApiError('model_key_mismatch',422,'Use a chave com o modelo deste agente.');
    agent=true;delete provider.model;provider.agent=owned.provider_name;
    provider.agent_config={type:'antigravity',model:operation.model.providerId,max_total_tokens:String(operation.model.inputCapacity)};
  }
  if(body.environment_id){const owned=await getOwnedAiResource(client,auth,String(body.environment_id),'environment');if(owned.status!=='active')throw new AiApiError('resource_not_ready',422,'Ambiente indisponível.');provider.environment=owned.provider_name;}
  const output=positive(record(body.generation_config).max_output_tokens??Math.min(8192,operation.model.outputCapacity),operation.model.outputCapacity);
  if(!agent)provider.generation_config={...record(body.generation_config),max_output_tokens:output};
  else if(operation.model.providerId.startsWith('antigravity')&&record(provider.agent_config).model)throw new AiApiError('invalid_configuration',422,'Crie um agente com a chave do modelo escolhido para personalizar sua inteligência.');
  if(body.previous_interaction_id) {const previous=await getOwnedAiResource(client,auth,String(body.previous_interaction_id),'interaction');
    if(!['completed','requires_action'].includes(String(previous.status)))throw new AiApiError('resource_not_ready',422,'A interação anterior ainda não terminou.');
    provider.previous_interaction_id=previous.provider_name;}
  const translateInput=async(value:unknown):Promise<void>=>{
    if(Array.isArray(value)){for(const item of value)await translateInput(item);return;}
    const item=record(value);
    // Resource URIs cannot address another customer's files. Ordinary URLs are input content.
    if(typeof item.uri==='string') {
      const file=await getOwnedAiResource(client,auth,item.uri.replace(/^files\//,''),'file');
      if(file.status!=='active')throw new AiApiError('file_not_ready',422,'Arquivo indisponível.');item.uri=record(file.metadata).uri;
    }
    for(const key of ['content','result'])if(item[key])await translateInput(item[key]);
  };
  await translateInput(provider.input);
  const tools=[];const aliases:Record<string,string>={web_search:'google_search',maps:'google_maps',function:'function',code_execution:'code_execution',url_context:'url_context',computer_use:'computer_use',file_search:'file_search',mcp_server:'mcp_server'};
  for(const tool of rows(body.tools)) {
    const type=aliases[String(tool.type)];if(!type)throw new AiApiError('invalid_tool',422,'Ferramenta não suportada.');
    const translated:Row={...tool,type};
    if(type==='file_search') {
      if(!Array.isArray(tool.stores)||!tool.stores.length)throw new AiApiError('invalid_store',422,'Informe as coleções em stores.');
      const names=[];for(const id of tool.stores){const store=await getOwnedAiResource(client,auth,String(id).replace(/^stores\//,''),'store');if(store.status!=='active')throw new AiApiError('resource_not_ready',422,'Coleção indisponível.');names.push(store.provider_name);}
      delete translated.stores;translated.file_search_store_names=names;
    }
    tools.push(translated);
  }
  provider.tools=tools;
  // Reserve the entire supported context for background/continuation work, including
  // tool expansion. Actual reported consumption replaces this estimate at completion.
  const units:AiUnits=operation.prices.song?{song:1}:{input:operation.model.inputCapacity,output:agent?operation.model.inputCapacity:output};
  if(!operation.prices.song)for(const meter of ['audio_input','video_input','image_input','document_input'])if(operation.prices[meter])units[meter]=operation.model.inputCapacity;
  if(operation.model.family==='voice'){units.audio_output=output;units.output=0;}
  if(operation.model.family==='image')units.image_output=output;
  if(operation.model.family==='video'){units.video_output=operation.model.outputCapacity;units.output=output;}
  if(operation.model.family==='transcription'){units.audio_input=operation.model.inputCapacity;units.input=0;}
  if(tools.some(t=>t.type==='google_search')||agent)units.search=agent?100:10;
  if(tools.some(t=>t.type==='google_maps'))units.maps=10;
  if(operation.model.id.startsWith('pro-3.1'))for(const meter of ['input','output'])if(units[meter]){units['long_'+meter]=units[meter];delete units[meter];}
  return dispatchResource(client,operation,'interaction',{},units,'/v1beta/interactions',provider);
}

export async function refreshAiResource(client:SupabaseClient,row:Row,remove=false):Promise<Row> {
  if(!row.request_id)return publicAiResource(row);
  if(['completed','requires_action','failed','expired','deleted'].includes(String(row.status)))return publicAiResource(row);
  if(!row.provider_name)return publicAiResource(row);
  const claim=await client.rpc('claim_ai_resource_worker',{p_id:row.id});
  if(claim.error)throw new Error('Não foi possível conferir a operação.');
  if(!claim.data)return publicAiResource(row);
  try {
    const current=await client.from('ai_resources').select('*').eq('id',row.id).single();
    if(current.error||!current.data)throw new Error('Não foi possível consultar o recurso.');
    row=current.data;
    const metadata=record(row.metadata),operation=resourceOperation(row);
    const requestState=await client.from('ai_requests').select('status,response,result_snapshot').eq('id',operation.id).single();
    if(requestState.error)throw new Error('Não foi possível consultar o consumo.');
    if(requestState.data?.result_snapshot) {
      const settled=await rpc(client,'settle_ai_operation',record(requestState.data.result_snapshot));
      const response=record(settled.response),finalStatus=String(metadata.settlement_status??(response.status==='requires_action'?'requires_action':'completed'));
      return publicAiResource(await updateResource(client,row.id,{status:finalStatus,metadata:{...metadata,result:response}}));
    }
    const path=`/v1beta/${row.kind==='interaction'?'interactions/':''}${row.provider_name}`;
    if(row.kind==='cache') {
      if(metadata.pending_expire_at) {
        const current=await aiProviderRequest(client,path);
        if(!Number.isFinite(Date.parse(String(current.expireTime))))throw new Error('Validade do cache em conferência.');
        delete metadata.pending_expire_at;
        row=await updateResource(client,row.id,{metadata,expires_at:current.expireTime});
      }
      if(!remove&&Date.parse(String(row.expires_at))>Date.now())return publicAiResource(row);
      if(remove)try {await aiProviderRequest(client,path,'DELETE');}catch(error){if(!(error instanceof AiProviderFailure&&error.status===404))throw error;}
      const start=Date.parse(String(record(metadata.initial_result).createTime??row.created_at));
      const end=metadata.ended_at?Date.parse(String(metadata.ended_at)):Math.min(Date.now(),Date.parse(String(row.expires_at)));
      remove=metadata.settlement_status==='deleted'||remove;
      const units={cache_hour:Number(metadata.size)*Math.max(0,end-start)/3600000};
      await updateResource(client,row.id,{status:'settling',metadata:{...metadata,settlement_status:remove?'deleted':'expired',ended_at:new Date(end).toISOString()}});
      const result=await settleAiOperation(client,operation,units,{id:row.id,object:'cache',status:remove?'deleted':'expired'});
      return publicAiResource(await updateResource(client,row.id,{status:remove?'deleted':'expired',metadata:{...metadata,result}}));
    }
    if(remove&&!['batch','interaction'].includes(String(row.kind)))throw new AiApiError('cancel_unavailable',422,'Esta execução já foi enviada. Aguarde a conclusão.');
    if(remove&&row.status!=='cancelling') {await aiProviderRequest(client,path+(row.kind==='batch'?':cancel':'/cancel'),'POST',{});row=await updateResource(client,row.id,{status:'cancelling'});}
    const result=await aiProviderRequest(client,path);
    let units:AiUnits={},output:Row={},status='completed',media:Row[]=[];
    if(row.kind==='batch') {
      const batch=record(record(result.metadata).batch??result.metadata??result), value=record(result.response??batch);
      const terminal=result.done===true||['BATCH_STATE_SUCCEEDED','BATCH_STATE_FAILED','BATCH_STATE_CANCELLED','BATCH_STATE_EXPIRED'].includes(String(batch.state??result.state));
      if(!terminal)return publicAiResource(row);
      const destination=record(value.output??value),items=rows(record(destination.inlinedResponses).inlinedResponses);
      const stats=record(batch.batchStats??value.batchStats);
      if(!items.length&&!(Number(stats.successfulRequestCount)===0&&Number(stats.pendingRequestCount??0)===0&&Number(stats.failedRequestCount)===Number(metadata.count)))throw new Error('Resultado do lote ainda não disponível para conferência.');
      if(items.length&&items.length!==Number(metadata.count))throw new Error('Resultado parcial do lote.');
      const outputs=[];
      const seen=new Set<number>();
      for(const [position,item] of items.entries()) {
        const index=Number(record(item.metadata).index??position);
        if(!Number.isInteger(index)||index<0||index>=Number(metadata.count)||seen.has(index))throw new Error('Identidade do item inválida.');
        seen.add(index);
        if(item.response){
          const prices=Array.isArray(metadata.item_prices)?metadata.item_prices[index] as AiPriceCard:operation.prices;
          const measured=operation.model.family==='embeddings'?measureAiEmbedding(item.response,prices):measureAiContent(item.response,prices);
          units=addAiUnits(units,Object.fromEntries(Object.entries(measured).map(([meter,quantity])=>[`item${index}_${meter}`,quantity])));
          outputs.push({key:record(item.metadata).key??index,response:operation.model.family==='embeddings'?{object:'embedding',embedding:embeddingValues(item.response)}:publicContentResponse(item.response,operation.id,operation.model.id)});}
        else outputs.push({key:record(item.metadata).key??index,error:{code:'generation_failed',message:'Não foi possível gerar este item.'}});
      }
      output={id:row.id,object:'batch',results:outputs};
    }else if(row.kind==='operation') {
      if(result.done!==true)return publicAiResource(row);
      if(result.error){await failAiOperation(client,operation,new AiProviderFailure(400,false),true);return publicAiResource(await updateResource(client,row.id,{status:'failed'}));}
      media=rows(record(record(result.response).generateVideoResponse).generatedSamples).map(s=>record(s.video));
      units={[String(metadata.meter)]:media.length*(metadata.extension?7:Number(metadata.seconds))};
      output={id:row.id,object:'video',videos:media.map((_,i)=>({url:`/api/v1/ai/videos/${row.id}/content?index=${i}`,mime_type:'video/mp4'}))};
    }else if(row.kind==='document') {
      if(result.done!==true)return publicAiResource(row);
      if(result.error){await failAiOperation(client,operation,new AiProviderFailure(400,false),true);return publicAiResource(await updateResource(client,row.id,{status:'failed'}));}
      units={indexing_input:Number(metadata.size)};metadata.document_name=record(result.response).documentName;
      output={id:row.id,object:'document',store:metadata.store_id,status:'active'};
    }else if(row.kind==='interaction') {
      if(!['completed','requires_action','failed','cancelled'].includes(String(result.status)))return publicAiResource(row);
      units=measureAiInteraction(result,operation.prices);output=publicInteraction(result,String(row.id),String(row.model_id),media);
      status=result.status==='requires_action'?'requires_action':'completed';
    }else return publicAiResource(row);
    // Persist the result before settlement: a worker crash cannot cause regeneration.
    await updateResource(client,row.id,{status:'settling',metadata:{...metadata,media,settlement_status:status}});
    const response=await settleAiOperation(client,operation,units,output);
    return publicAiResource(await updateResource(client,row.id,{status,metadata:{...metadata,media,result:response}}));
  }finally {await client.from('ai_resources').update({worker_lease_until:null,updated_at:new Date().toISOString()}).eq('id',row.id);}
}

export async function reconcileAiResources(client:SupabaseClient) {
  const result=await client.from('ai_resources').select('*').or(`and(kind.neq.live,status.in.(processing,cancelling,settling,uncertain)),and(kind.eq.cache,status.eq.active,expires_at.lte.${new Date().toISOString()}),and(kind.eq.cache,status.eq.active,metadata->>pending_expire_at.not.is.null)`).not('request_id','is',null).not('provider_name','is',null).order('updated_at').limit(30);
  if(result.error)throw new Error('Não foi possível consultar recursos em execução.');
  let checked=0,pending=0;
  for(const row of result.data??[]) {try{await refreshAiResource(client,row);checked++;}catch{pending++;}}
  return {checked,pending};
}

export async function listAiResources(client:SupabaseClient,auth:AiAuth,collection:string) {
  const kind=resourceKinds[collection];if(!kind)throw new AiApiError('resource_not_found',404,'Recurso não encontrado.');
  const result=await client.from('ai_resources').select('*').eq('project_id',auth.project.id).eq('kind',kind).neq('status','deleted').order('created_at',{ascending:false}).limit(100);
  if(result.error)throw new Error('Não foi possível listar os recursos.');return {object:'list',data:(result.data??[]).map(publicAiResource)};
}
