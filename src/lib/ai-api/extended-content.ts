import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { AiApiError, authenticateAi, record, rpc } from "./gateway";
import { parseNativeAiInput } from "./native-input";
import { resolveAiFileParts, getOwnedAiResource } from "./files";
import { beginAiOperation, reserveAiOperation, settleAiOperation, failAiOperation, type AiAuth, type AiOperation } from "./operation-ledger";
import { aiProviderRequest } from "./provider-http";
import { measureAiContent, publicContentResponse } from "./content-metering";
import type { AiUnits } from "./operation-pricing";
import { resolveActiveBillingRates } from '@/lib/billing/metered-usage';

export async function prepareExtendedContent(client:SupabaseClient,auth:AiAuth,operation:AiOperation,raw:unknown) {
  if(/^(deep-research|antigravity)/.test(operation.model.providerId))throw new AiApiError('use_interactions',422,'Use /interactions para executar este modelo especializado.');
  const input=parseNativeAiInput(raw,operation.model.outputCapacity||65536);
  const body=record(input.providerBody);
  input.capabilities.push(...await resolveAiFileParts(client,auth,input.providerBody.contents));
  for(const capability of input.capabilities)if(!operation.model.capabilities.includes(capability)&&!(capability==='file_search'&&operation.model.family==='text'&&operation.prices.indexing_input)&&!(capability==='computer_use'&&operation.model.id.includes('computer-use')))
    throw new AiApiError('model_capability_unavailable',422,'O modelo da chave não oferece este recurso.');
  // Maps billing on current models is exposed as individual calls by Interactions.
  if(input.capabilities.includes('maps'))throw new AiApiError('use_interactions',422,'Use /interactions com a ferramenta maps para esta operação.');
  let cached=0;
  if(body.cachedContent) {
    const cache=await getOwnedAiResource(client,auth,String(body.cachedContent).slice(7),'cache');
    if(cache.model_id!==operation.model.id||cache.status!=='active'||Date.parse(cache.expires_at)<=Date.now())throw new AiApiError('cache_unavailable',422,'Este cache não está disponível para o modelo da chave.');
    cached=Number(record(cache.metadata).size);body.cachedContent=cache.provider_name;
  }
  for(const tool of Array.isArray(body.tools)?body.tools.map(record):[]) if(tool.fileSearch) {
    const search=record(tool.fileSearch);
    if(!Array.isArray(search.stores)||!search.stores.length||search.stores.length>10||Object.keys(search).some(k=>!['stores','metadataFilter','topK'].includes(k)))throw new AiApiError('invalid_store',422,'Informe as coleções deste projeto em fileSearch.stores.');
    const names=[];
    for(const id of search.stores) { const store=await getOwnedAiResource(client,auth,String(id).replace(/^stores\//,''),'store');
      if(store.status!=='active')throw new AiApiError('store_unavailable',422,'Coleção indisponível.');names.push(store.provider_name); }
    tool.fileSearch={fileSearchStoreNames:names,...(search.metadataFilter?{metadataFilter:search.metadataFilter}:{}),...(search.topK?{topK:search.topK}:{})};
  }
  const model=operation.model;
  const config=record(body.generationConfig);
  const modalities=Array.isArray(config.responseModalities)?config.responseModalities:[];
  if(model.family==='image'&&!modalities.length) config.responseModalities=['TEXT','IMAGE'];
  if(model.family==='voice'&&!modalities.length) config.responseModalities=['AUDIO'];
  if(!model.methods.includes('generateContent'))throw new AiApiError('model_capability_unavailable',422,'Use a operação correspondente à família deste modelo.');
  const countResponse=await aiProviderRequest(client,`/v1beta/models/${model.providerId}:countTokens`,'POST',{generateContentRequest:{model:`models/${model.providerId}`,...body}},20000);
  const count=Number(countResponse.totalTokens);
  if(!Number.isFinite(count)||count<=0||count>model.inputCapacity)throw new AiApiError('input_limit',422,'Conteúdo acima da capacidade deste modelo.');
  if(count>200000&&model.id.startsWith('pro-3.1')) {
    const rates=await resolveActiveBillingRates(client,{provider:'gemini',featureCode:'external_ai_long_context',modelId:model.providerId,planCode:auth.billing.planCode});
    for(const [meter,unit] of [['input','input_token'],['output','output_token']]) {
      const rate=rates.find(r=>r.unit===unit);if(!rate)throw new Error('Tarifa de contexto ausente.');
      operation.prices[meter]={id:rate.id??'long',cost:rate.providerCostPerUnit,credits:rate.connectyPricePerUnit};
      operation.prices['batch_'+meter]={id:rate.id??'long',cost:rate.providerCostPerUnit/2,credits:rate.connectyPricePerUnit/2};
    }
    if(operation.prices.cached_input)operation.prices.cached_input={...operation.prices.input,cost:operation.prices.input.cost/10,credits:operation.prices.input.credits/10};
  }
  const units:AiUnits={input:Math.max(0,count-cached),cached_input:cached,output:input.maxTokens};
  if(model.family==='image'||modalities.includes('IMAGE')) {units.image_output=input.maxTokens;units.output=input.maxTokens;}
  if(model.family==='voice'||modalities.includes('AUDIO')) {units.audio_output=input.maxTokens;units.output=0;}
  if(model.family==='transcription'&&operation.prices.audio_input){units.audio_input=count;units.input=0;}
  if(input.capabilities.includes('web_search'))units.search=10;
  if(input.capabilities.includes('maps'))units.maps=10;
  if(model.family==='image'&&!modalities.length) config.responseModalities=['TEXT','IMAGE'];
  if(model.family==='voice'&&!modalities.length) config.responseModalities=['AUDIO'];
  return {body,units,input};
}

export async function completeExtendedContent(request:Request,raw:unknown,client:SupabaseClient=createServiceClient()) {
  const auth=await authenticateAi(request,client);
  const operation=await beginAiOperation(client,request,auth,'generation',record(raw));
  if(operation.replay)return operation.replay;
  let dispatched=false;
  try {
    const {body,units}=await prepareExtendedContent(client,auth,operation,raw);
    await reserveAiOperation(client,operation,units);
    await rpc(client,'start_ai_request',{p_request:operation.id});dispatched=true;
    const result=await aiProviderRequest(client,`/v1beta/models/${operation.model.providerId}:generateContent`,'POST',body);
    return await settleAiOperation(client,operation,measureAiContent(result,operation.prices),publicContentResponse(result,operation.id,operation.model.id));
  }catch(error){await failAiOperation(client,operation,error,dispatched);throw error;}
}
