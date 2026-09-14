import 'server-only';
import {createServiceClient} from '@/lib/supabase/service';
import {AiApiError,authenticateAi,record} from './gateway';
import {getOwnedAiResource,refreshAiFile} from './files';
import {createAuthorizedAiResource,refreshAiResource} from './resources';
import {removeAiStoredResource} from './resource-management';
import {updateAiCache} from './cache-management';
import {aiModelDefinition,publicModelId} from './model-catalog';
import {readAiJson} from './http';
import {translateGeminiResources} from './gemini-contract';

type Row=Record<string,unknown>;
export const geminiResourceCollections=['files','cachedContents'] as const;
function seconds(body:Row,required=false) {
  if(body.ttl!==undefined&&body.expireTime!==undefined)throw new AiApiError('invalid_configuration',422,'Informe ttl ou expireTime, exclusivamente.');
  if(body.ttl===undefined&&body.expireTime===undefined){if(required)throw new AiApiError('invalid_configuration',422,'Informe uma expiração.');return 3600;}
  const duration=typeof body.ttl==='string'&&/^\d+(?:\.\d{1,9})?s$/.test(body.ttl)?Number(body.ttl.slice(0,-1)):body.ttl===undefined&&typeof body.expireTime==='string'?Math.floor((Date.parse(body.expireTime)-Date.now())/1000):NaN;
  if(!Number.isFinite(duration)||duration<1||duration>604800)throw new AiApiError('invalid_configuration',422,'Validade entre 1 segundo e 7 dias.');
  return Math.ceil(duration);
}
export function geminiResourceObject(row:Row,collection:string) {
  const meta=record(row.metadata),initial=record(meta.initial_result);
  if(collection==='files') {
    const file=record(meta.file_response);
    return {name:`files/${row.id}`,uri:`files/${row.id}`,displayName:meta.display_name,mimeType:meta.mime_type,sizeBytes:String(meta.size_bytes??0),createTime:file.createTime??row.created_at,updateTime:row.updated_at,expirationTime:row.expires_at,
      state:row.status==='active'?'ACTIVE':['failed','expired','deleted'].includes(String(row.status))?'FAILED':'PROCESSING',
      ...(file.sha256Hash?{sha256Hash:file.sha256Hash}:{}),...(file.videoMetadata?{videoMetadata:file.videoMetadata}:{}),...(file.error?{error:file.error}:{}),source:'UPLOADED'};
  }
  return {name:`cachedContents/${row.id}`,model:`models/${row.model_id}`,displayName:meta.display_name,createTime:initial.createTime??row.created_at,updateTime:row.updated_at,expireTime:row.expires_at,usageMetadata:initial.usageMetadata??{totalTokenCount:meta.size},connectyhub:{request_id:row.request_id,status:row.status}};
}
export async function geminiResourceApi(request:Request,parts:string[],client=createServiceClient()) {
  const [collection,id]=parts,kind=collection==='files'?'file':'cache';
  if(!geminiResourceCollections.includes(collection as never)||parts.length>2)throw new AiApiError('unsupported_method',404,'Método não disponível.');
  const auth=await authenticateAi(request,client),url=new URL(request.url);
  if(request.method==='GET'&&!id) {
    const size=Number(url.searchParams.get('pageSize')??10),offset=Number(url.searchParams.get('pageToken')??0),max=collection==='files'?100:1000;
    if(!Number.isInteger(size)||size<1||size>max||!Number.isInteger(offset)||offset<0||offset>1_000_000)throw new AiApiError('invalid_pagination',400,'Paginação inválida.');
    const result=await client.from('ai_resources').select('*').eq('project_id',auth.project.id).eq('kind',kind).neq('status','deleted').order('created_at',{ascending:false}).order('id').range(offset,offset+size);
    if(result.error)throw new AiApiError('service_unavailable',503,'Não foi possível listar recursos.');
    const rows=result.data??[];
    return {[collection]:rows.slice(0,size).map(row=>geminiResourceObject(row,collection)),...(rows.length>size?{nextPageToken:String(offset+size)}:{})};
  }
  if(request.method==='POST'&&!id&&collection==='cachedContents') {
    const body=translateGeminiResources(record(await readAiJson(request)));
    if(Object.keys(body).some(k=>!['model','contents','systemInstruction','tools','toolConfig','displayName','ttl','expireTime'].includes(k)))throw new AiApiError('unsupported_parameter',422,'Campo de cache não suportado.');
    const supplied=String(body.model??auth.key.model_id??'').replace(/^models\//,''),model=aiModelDefinition(supplied)?supplied:publicModelId(supplied);
    if(model==='connectyhub-auto')throw new AiApiError('model_unavailable',404,'Modelo não disponível.');
    const created=record(await createAuthorizedAiResource(client,request,auth,'caches',{model,contents:body.contents,systemInstruction:body.systemInstruction,tools:body.tools,toolConfig:body.toolConfig,display_name:body.displayName,ttl_seconds:seconds(body)}));
    const row=await getOwnedAiResource(client,auth,String(created.id),'cache');
    return geminiResourceObject(row,collection);
  }
  if(!id)throw new AiApiError('unsupported_method',405,'Método não disponível nesta coleção.');
  const row=await getOwnedAiResource(client,auth,id,kind);
  if(request.method==='GET') {
    if(kind==='file')await refreshAiFile(client,auth,id);else await refreshAiResource(client,row);
    return geminiResourceObject(await getOwnedAiResource(client,auth,id,kind),collection);
  }
  if(request.method==='DELETE') {
    if(kind==='file')await refreshAiFile(client,auth,id,true);else await removeAiStoredResource(client,row);
    return {};
  }
  if(request.method==='PATCH'&&collection==='cachedContents') {
    const body=record(await readAiJson(request)),mask=url.searchParams.get('updateMask');
    if(Object.keys(body).some(k=>!['ttl','expireTime','name'].includes(k))||body.name!==undefined&&body.name!==`cachedContents/${id}`||mask&&mask.split(',').some(k=>!['ttl','expireTime','expire_time'].includes(k)))throw new AiApiError('unsupported_parameter',422,'Somente a expiração do cache pode mudar.');
    await updateAiCache(client,row,{ttl_seconds:seconds(body,true)});
    return geminiResourceObject(await getOwnedAiResource(client,auth,id,kind),collection);
  }
  throw new AiApiError('unsupported_method',405,'Método não disponível.');
}
