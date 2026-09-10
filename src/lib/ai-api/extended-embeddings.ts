import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {AiApiError,authenticateAi,record,rpc} from './gateway';
import {parseEmbeddingInput} from './embedding-input';
import {parseNativeAiInput} from './native-input';
import {resolveAiFileParts} from './files';
import {beginAiOperation,reserveAiOperation,settleAiOperation,failAiOperation,type AiOperation,type AiAuth} from './operation-ledger';
import {aiProviderRequest} from './provider-http';
import {measureAiContent} from './content-metering';
import {addAiUnits,type AiUnits,type AiPriceCard} from './operation-pricing';

export function measureAiEmbedding(raw:unknown,prices:AiPriceCard,fallback?:Record<string,unknown>) {
  const metadata=record(record(raw).usageMetadata),count=metadata.promptTokenCount??fallback?.totalTokens;
  if(!Number.isFinite(Number(count))||Number(count)<=0)throw new Error('Consumo do vetor indisponível.');
  return measureAiContent({usageMetadata:{promptTokenCount:count,promptTokensDetails:metadata.promptTokenDetails??fallback?.promptTokensDetails},candidates:[]},prices);
}
export async function prepareAiEmbedding(client:SupabaseClient,auth:AiAuth,operation:AiOperation,raw:unknown) {
  const body=record(raw);
  if(operation.model.family!=='embeddings')throw new AiApiError('model_capability_unavailable',422,'Use uma chave de modelo Embedding.');
  if(body.content!==undefined&&body.input!==undefined)throw new AiApiError('invalid_embedding',422,'Informe input ou content.');
  if(body.content===undefined&&(typeof body.input!=='string'||!body.input.trim()))throw new AiApiError('invalid_embedding',422,'Informe um conteúdo não vazio.');
  const configInput:Record<string,unknown>={...body,input:typeof body.input==='string'?body.input:'validation'};delete configInput.content;
  const documentOcr=configInput.document_ocr,audioTrack=configInput.audio_track_extraction;delete configInput.document_ocr;delete configInput.audio_track_extraction;
  const parsed=parseEmbeddingInput(configInput);
  let content:Record<string,unknown>=parsed.providerBody.contents[0];
  if(body.content) {
    const parsedContent=parseNativeAiInput({contents:[body.content]},1);
    const requested=[...parsedContent.capabilities,...await resolveAiFileParts(client,auth,parsedContent.providerBody.contents)];
    if(requested.some(c=>!operation.model.capabilities.includes(c)))throw new AiApiError('model_capability_unavailable',422,'O modelo não aceita este conteúdo.');
    content=parsedContent.providerBody.contents[0];
  }
  const config={...parsed.providerBody.embedContentConfig,...(documentOcr!==undefined?{documentOcr:!!documentOcr}:{}),...(audioTrack!==undefined?{audioTrackExtraction:!!audioTrack}:{})};
  const count=await aiProviderRequest(client,`/v1beta/models/${operation.model.providerId}:countTokens`,'POST',{contents:[content]},20000);
  if(Number(count.totalTokens)>operation.model.inputCapacity)throw new AiApiError('input_limit',422,'Conteúdo acima da capacidade do modelo.');
  const units=measureAiEmbedding({},operation.prices,count);
  return {body:{model:`models/${operation.model.providerId}`,content,embedContentConfig:config},units,count};
}
export function embeddingValues(raw:unknown) {
  const values=record(record(raw).embedding).values;
  if(!Array.isArray(values)||!values.length||values.some(n=>typeof n!=='number'||!Number.isFinite(n)))throw new Error('Vetor inválido.');return values;
}
export async function completeExtendedEmbedding(client:SupabaseClient,request:Request,raw:unknown) {
  const auth=await authenticateAi(request,client),body=record(raw),operation=await beginAiOperation(client,request,auth,'generation',body);
  if(operation.replay)return operation.replay;
  let dispatched=false;
  try {
    const inputs=Array.isArray(body.input)?body.input.map(input=>({...body,input})):[body];
    if(!inputs.length||inputs.length>100)throw new AiApiError('invalid_embedding',422,'Envie de 1 a 100 entradas.');
    const prepared=[];let budget:AiUnits={};
    for(const input of inputs){const item=await prepareAiEmbedding(client,auth,operation,input);prepared.push(item);budget=addAiUnits(budget,item.units);}
    await reserveAiOperation(client,operation,budget);await rpc(client,'start_ai_request',{p_request:operation.id});dispatched=true;
    const multiple=prepared.length>1;
    const result=await aiProviderRequest(client,`/v1beta/models/${operation.model.providerId}:${multiple?'batchEmbedContents':'embedContent'}`,'POST',multiple?{requests:prepared.map(p=>p.body)}:prepared[0].body);
    const results=multiple?(Array.isArray(result.embeddings)?result.embeddings.map(embedding=>({embedding})):[]):[result];
    if(results.length!==prepared.length)throw new Error('Resultado incompleto.');
    const units=measureAiEmbedding(result,operation.prices);
    return await settleAiOperation(client,operation,units,{id:operation.id,object:'embedding.list',model:operation.model.id,data:results.map((r,index)=>({object:'embedding',index,embedding:embeddingValues(r)}))});
  }catch(error){await failAiOperation(client,operation,error,dispatched);throw error;}
}
