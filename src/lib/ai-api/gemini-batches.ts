import 'server-only';
import {createServiceClient} from '@/lib/supabase/service';
import {AiApiError,authenticateAi,record} from './gateway';
import {aiModelDefinition,publicModelId} from './model-catalog';
import {getOwnedAiResource} from './files';
import {createAuthorizedAiResource,refreshAiResource} from './resources';
import {removeAiStoredResource} from './resource-management';
import {nativeEmbeddingInput} from './native-embedding';
import {readAiJson} from './http';
import {translateGeminiResources} from './gemini-contract';

type Row=Record<string,unknown>;
function knownModel(name:unknown) {
  const value=String(name??'').replace(/^models\//,'');
  const id=aiModelDefinition(value)?value:publicModelId(value);
  if(id==='connectyhub-auto')throw new AiApiError('model_unavailable',404,'Modelo não disponível.');
  return id;
}
export function nativeBatchInput(raw:unknown,model:string,embedding:boolean) {
  const body=record(raw),batch=record(body.batch),input=record(batch.inputConfig),inline=record(input.requests);
  if(Object.keys(body).some(k=>k!=='batch')||Object.keys(batch).some(k=>!['model','displayName','inputConfig'].includes(k)))
    throw new AiApiError('unsupported_parameter',422,'Este contrato aceita model, displayName e inputConfig.');
  if(batch.model!==undefined&&knownModel(batch.model)!==model)throw new AiApiError('model_key_mismatch',422,'Modelo divergente no lote.');
  if(typeof batch.displayName!=='string'||!batch.displayName.trim()||batch.displayName.length>200)throw new AiApiError('invalid_batch',422,'Informe displayName com até 200 caracteres.');
  if(Object.keys(input).some(k=>k!=='requests')||Object.keys(inline).some(k=>k!=='requests')||!Array.isArray(inline.requests)||!inline.requests.length||inline.requests.length>100)
    throw new AiApiError('invalid_batch',422,'Use inputConfig.requests.requests com 1 a 100 itens; lotes por arquivo ainda não são suportados.');
  const requests=inline.requests.map((value,index)=>{
    const entry=record(value),request=record(entry.request),metadata=record(entry.metadata);
    if(Object.keys(entry).some(k=>!['request','metadata'].includes(k))||!Object.keys(request).length||entry.metadata!==undefined&&(typeof entry.metadata!=='object'||entry.metadata===null||Array.isArray(entry.metadata))||Object.values(metadata).some(v=>typeof v!=='string'))
      throw new AiApiError('invalid_batch',422,'Cada item requer request e metadata opcional com valores de texto.');
    if(request.model!==undefined&&knownModel(request.model)!==model)throw new AiApiError('model_key_mismatch',422,'Modelo divergente no item.');
    const translated:Row=embedding?nativeEmbeddingInput(request,model):{...request,model};
    translateGeminiResources(translated);
    return {key:String(index),request:translated,metadata};
  });
  return {model,display_name:batch.displayName,requests,native_batch:true};
}

// Provider names and internal accounting fields never become SDK resource names.
export function nativeBatchOperation(row:Row) {
  const meta=record(row.metadata),raw=record(meta.native_operation??meta.initial_result),providerMeta=record(raw.metadata),batch=record(providerMeta.batch??providerMeta);
  const state=String(batch.state??({preparing:'BATCH_STATE_PENDING',processing:'BATCH_STATE_RUNNING',completed:'BATCH_STATE_SUCCEEDED',failed:'BATCH_STATE_FAILED',expired:'BATCH_STATE_EXPIRED'} as Row)[String(row.status)]??'BATCH_STATE_UNSPECIFIED');
  const done=raw.done===true||['BATCH_STATE_SUCCEEDED','BATCH_STATE_FAILED','BATCH_STATE_CANCELLED','BATCH_STATE_EXPIRED'].includes(state);
  const metadata:Row={...Object.fromEntries(['@type','createTime','endTime','updateTime','batchStats','priority'].filter(k=>batch[k]!==undefined).map(k=>[k,batch[k]])),name:`batches/${row.id}`,model:`models/${row.model_id}`,displayName:meta.display_name,state};
  const result:Row={name:`batches/${row.id}`,metadata,done,connectyhub:{request_id:row.request_id,status:row.status,...record(record(meta.result).connectyhub)}};
  if(!done)return result;
  if(raw.error){result.error=raw.error;return result;}
  const response=record(raw.response),output=record(response.output??batch.output??response),entries=record(output.inlinedResponses).inlinedResponses;
  if(Array.isArray(entries)) {
    const clientMetadata=Array.isArray(meta.client_metadata)?meta.client_metadata:[];
    const responses=entries.map((value,position)=>{
      const item=record(value),index=Number(record(item.metadata).index??position);
      return {...(item.response?{response:item.response}:{}),...(item.error?{error:item.error}:{}),metadata:record(clientMetadata[index])};
    });
    result.response={...(response['@type']?{'@type':response['@type']}:{}),inlinedResponses:{inlinedResponses:responses}};
    metadata.output={inlinedResponses:{inlinedResponses:responses}};
  }else if(['BATCH_STATE_FAILED','BATCH_STATE_CANCELLED','BATCH_STATE_EXPIRED'].includes(state)) {
    result.error={code:state==='BATCH_STATE_CANCELLED'?1:state==='BATCH_STATE_EXPIRED'?4:13,message:'O lote não foi concluído com sucesso.'};
  }else {
    // Older resources may not contain native metadata. Do not invent a successful result.
    result.done=false;result.connectyhub={...record(result.connectyhub),native_result_pending:true};
  }
  return result;
}

export async function geminiBatchApi(request:Request,parts:string[],client=createServiceClient()) {
  const auth=await authenticateAi(request,client),url=new URL(request.url);
  const creation=parts.length===2&&parts[0]==='models'?parts[1].match(/^([a-zA-Z0-9.-]+):(batchGenerateContent|asyncBatchEmbedContent)$/):null;
  if(creation&&request.method==='POST') {
    const model=knownModel(creation[1]),embedding=creation[2]==='asyncBatchEmbedContent';
    if((aiModelDefinition(model)?.family==='embeddings')!==embedding)throw new AiApiError('model_capability_unavailable',422,'Use o método compatível com o modelo.');
    const body=nativeBatchInput(await readAiJson(request),model,embedding);
    const created=record(await createAuthorizedAiResource(client,request,auth,'batches',body));
    return nativeBatchOperation(await getOwnedAiResource(client,auth,String(created.id),'batch'));
  }
  if(parts[0]!=='batches'||parts.length>2)throw new AiApiError('unsupported_method',404,'Método de lote não disponível.');
  if(request.method==='GET'&&parts.length===1) {
    const size=Number(url.searchParams.get('pageSize')??20),offset=Number(url.searchParams.get('pageToken')??0);
    if(!Number.isInteger(size)||size<1||size>100||!Number.isInteger(offset)||offset<0||offset>1_000_000)throw new AiApiError('invalid_pagination',400,'Paginação inválida.');
    if(url.searchParams.get('filter')||url.searchParams.get('returnPartialSuccess')==='true')throw new AiApiError('unsupported_parameter',422,'Filtros e coleções parciais ainda não são suportados.');
    const found=await client.from('ai_resources').select('*').eq('project_id',auth.project.id).eq('kind','batch').neq('status','deleted').order('created_at',{ascending:false}).order('id').range(offset,offset+size);
    if(found.error)throw new AiApiError('service_unavailable',503,'Não foi possível consultar os lotes.');
    const rows=found.data??[];
    return {operations:rows.slice(0,size).map(nativeBatchOperation),...(rows.length>size?{nextPageToken:String(offset+size)}:{})};
  }
  const match=parts[1]?.match(/^([a-f0-9-]{36})(:cancel)?$/i);
  if(!match)throw new AiApiError('resource_not_found',404,'Lote não encontrado.');
  const row=await getOwnedAiResource(client,auth,match[1],'batch');
  if(request.method==='POST'&&match[2]) {await refreshAiResource(client,row,true);return {};}
  if(match[2])throw new AiApiError('unsupported_method',405,'Método não disponível.');
  if(request.method==='GET') {
    await refreshAiResource(client,row);
    return nativeBatchOperation(await getOwnedAiResource(client,auth,match[1],'batch'));
  }
  if(request.method==='DELETE'){await removeAiStoredResource(client,row);return {};}
  throw new AiApiError('unsupported_method',405,'Método não disponível.');
}
