import 'server-only';
import {createServiceClient} from '@/lib/supabase/service';
import {AiApiError,authenticateAi,record} from './gateway';
import {getOwnedAiResource} from './files';
import {createAuthorizedAiResource,refreshAiResource} from './resources';
import {removeAiStoredResource} from './resource-management';
import {aiProviderRequest} from './provider-http';
import {readAiJson} from './http';

type Row=Record<string,unknown>;
const fields=(row:Row,keys:string[])=>Object.fromEntries(keys.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
const identity=(value:unknown)=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);
export function nativeSearchObject(row:Row,storeId?:string) {
  const meta=record(row.metadata),snapshot=record(meta.native_document??meta.store_response);
  return {...fields(snapshot,['createTime','updateTime','activeDocumentsCount','pendingDocumentsCount','failedDocumentsCount','sizeBytes','mimeType','customMetadata']),
    name:storeId?`fileSearchStores/${storeId}/documents/${row.id}`:`fileSearchStores/${row.id}`,
    displayName:snapshot.displayName??meta.display_name,createTime:snapshot.createTime??row.created_at,updateTime:snapshot.updateTime??row.updated_at,
    ...(storeId?{customMetadata:snapshot.customMetadata??meta.custom_metadata,state:snapshot.state??(['completed','active'].includes(String(row.status))?'STATE_ACTIVE':row.status==='failed'?'STATE_FAILED':'STATE_PENDING')}:{})};
}
export function nativeSearchOperation(row:Row,storeId:string) {
  const meta=record(row.metadata),native=record(meta.native_operation??meta.initial_result),done=['completed','failed'].includes(String(row.status));
  return {name:`fileSearchStores/${storeId}/operations/${row.id}`,done,
    ...(done?row.status==='failed'?{error:{code:13,message:'Não foi possível concluir a indexação.'}}:{response:{...fields(record(native.response),['@type']),documentName:`fileSearchStores/${storeId}/documents/${row.id}`,parent:`fileSearchStores/${storeId}`}}:{}),
    connectyhub:{request_id:row.request_id,status:row.status,...record(record(meta.result).connectyhub)}};
}
export function nativeSearchImport(raw:unknown) {
  const body=record(raw),file=typeof body.fileName==='string'?body.fileName.match(/^files\/([a-f0-9-]{36})$/i):null;
  if(!file||Object.keys(body).some(k=>!['fileName','customMetadata','chunkingConfig'].includes(k)))throw new AiApiError('invalid_file',422,'Informe fileName pertencente ao projeto e parâmetros de indexação válidos.');
  if(body.customMetadata!==undefined) {
    if(!Array.isArray(body.customMetadata)||body.customMetadata.length>20)throw new AiApiError('invalid_metadata',422,'Use até 20 metadados.');
    const used=new Set<string>();
    for(const value of body.customMetadata) {
      const item=record(value),variants=['stringValue','numericValue','stringListValue'].filter(k=>item[k]!==undefined);
      if(typeof item.key!=='string'||!item.key||used.has(item.key)||variants.length!==1||Object.keys(item).some(k=>!['key',...variants].includes(k)))throw new AiApiError('invalid_metadata',422,'Cada metadado requer chave única e um valor.');
      used.add(item.key);
      if(item.stringValue!==undefined&&typeof item.stringValue!=='string'||item.numericValue!==undefined&&(typeof item.numericValue!=='number'||!Number.isFinite(item.numericValue)))throw new AiApiError('invalid_metadata',422,'Valor de metadado inválido.');
      if(item.stringListValue!==undefined) {
        const list=record(item.stringListValue);
        if(Object.keys(list).some(k=>k!=='values')||!Array.isArray(list.values)||list.values.some(v=>typeof v!=='string'))throw new AiApiError('invalid_metadata',422,'stringListValue requer values com textos.');
      }
    }
  }
  if(body.chunkingConfig!==undefined) {
    const config=record(body.chunkingConfig),space=record(config.whiteSpaceConfig),size=space.maxTokensPerChunk,overlap=space.maxOverlapTokens??0;
    if(Object.keys(config).some(k=>k!=='whiteSpaceConfig')||Object.keys(space).some(k=>!['maxTokensPerChunk','maxOverlapTokens'].includes(k))||typeof size!=='number'||!Number.isInteger(size)||size<1||size>512||typeof overlap!=='number'||!Number.isInteger(overlap)||overlap<0||overlap>=size)throw new AiApiError('invalid_chunking',422,'Use chunks de 1 a 512 palavras e sobreposição menor que o chunk.');
  }
  return {file:file[1],custom_metadata:body.customMetadata,chunking_config:body.chunkingConfig};
}

export async function geminiFileSearchApi(request:Request,parts:string[],client=createServiceClient()) {
  if(parts[0]!=='fileSearchStores'||parts.length>4)throw new AiApiError('unsupported_method',404,'Método não disponível.');
  const auth=await authenticateAi(request,client),url=new URL(request.url);
  const list=async(kind:string,storeId?:string)=>{
    const size=Number(url.searchParams.get('pageSize')??10),offset=Number(url.searchParams.get('pageToken')??0),max=20;
    if(!Number.isInteger(size)||size<1||size>max||!Number.isInteger(offset)||offset<0||offset>1_000_000)throw new AiApiError('invalid_pagination',400,'Paginação inválida.');
    if(url.searchParams.get('filter'))throw new AiApiError('unsupported_parameter',422,'Filtro de listagem ainda não suportado.');
    let query=client.from('ai_resources').select('*').eq('project_id',auth.project.id).eq('kind',kind).neq('status','deleted');
    if(storeId)query=query.eq('metadata->>store_id',storeId);
    const result=await query.order('created_at',{ascending:true}).order('id').range(offset,offset+size);
    if(result.error)throw new AiApiError('service_unavailable',503,'Não foi possível listar os recursos.');
    const rows=result.data??[];
    return {[storeId?'documents':'fileSearchStores']:rows.slice(0,size).map(row=>nativeSearchObject(row,storeId)),...(rows.length>size?{nextPageToken:String(offset+size)}:{})};
  };
  if(parts.length===1) {
    if(request.method==='GET')return list('store');
    if(request.method==='POST') {
      const body=record(await readAiJson(request));
      if(Object.keys(body).some(k=>k!=='displayName')||body.displayName!==undefined&&(typeof body.displayName!=='string'||body.displayName.length>200))throw new AiApiError('unsupported_parameter',422,'Use displayName com até 200 caracteres. Seleção de embeddingModel ainda não suportada.');
      const created=record(await createAuthorizedAiResource(client,request,auth,'stores',{display_name:body.displayName}));
      return nativeSearchObject(await getOwnedAiResource(client,auth,String(created.id),'store'));
    }
    throw new AiApiError('unsupported_method',405,'Método não disponível.');
  }
  const importId=parts.length===2?parts[1].match(/^([a-f0-9-]{36}):importFile$/i):null;
  const storeId=importId?.[1]??parts[1];
  if(!identity(storeId))throw new AiApiError('resource_not_found',404,'Coleção não encontrada.');
  const store=await getOwnedAiResource(client,auth,storeId,'store');
  if(importId) {
    if(request.method!=='POST')throw new AiApiError('unsupported_method',405,'Método não disponível.');
    const body=nativeSearchImport(await readAiJson(request));
    const created=record(await createAuthorizedAiResource(client,request,auth,'documents',{...body,store:storeId}));
    return nativeSearchOperation(await getOwnedAiResource(client,auth,String(created.id),'document'),storeId);
  }
  if(parts.length===3&&parts[2]==='documents'&&request.method==='GET')return list('document',storeId);
  if(parts.length===4&&['documents','operations'].includes(parts[2])&&identity(parts[3])) {
    let document=await getOwnedAiResource(client,auth,parts[3],'document');
    if(record(document.metadata).store_id!==storeId)throw new AiApiError('resource_not_found',404,'Documento não encontrado nesta coleção.');
    if(request.method==='GET') {
      await refreshAiResource(client,document);
      document=await getOwnedAiResource(client,auth,parts[3],'document');
      if(parts[2]==='operations')return nativeSearchOperation(document,storeId);
      const metadata=record(document.metadata),name=metadata.document_name;
      if(typeof name==='string'&&name.startsWith(`${store.provider_name}/documents/`)) {
        const native=await aiProviderRequest(client,`/v1beta/${name}`);
        return nativeSearchObject({...document,metadata:{...metadata,native_document:native}},storeId);
      }
      return nativeSearchObject(document,storeId);
    }
    if(request.method==='DELETE'&&parts[2]==='documents'){
      const force=url.searchParams.get('force');
      if(force!==null&&!['true','false'].includes(force))throw new AiApiError('invalid_configuration',422,'force deve ser true ou false.');
      await removeAiStoredResource(client,document,{force:force==='true'});return {};
    }
    throw new AiApiError('unsupported_method',405,'Método não disponível.');
  }
  if(parts.length!==2)throw new AiApiError('unsupported_method',404,'Método não disponível.');
  if(request.method==='GET') {
    if(!store.provider_name)return nativeSearchObject(store);
    const native=await aiProviderRequest(client,`/v1beta/${store.provider_name}`);
    return nativeSearchObject({...store,metadata:{...record(store.metadata),store_response:native}});
  }
  if(request.method==='DELETE') {
    const force=url.searchParams.get('force');
    if(force!==null&&!['true','false'].includes(force))throw new AiApiError('invalid_configuration',422,'force deve ser true ou false.');
    if(force!=='true') {
      const children=await client.from('ai_resources').select('id').eq('project_id',auth.project.id).eq('kind','document').eq('metadata->>store_id',storeId).neq('status','deleted').limit(1);
      if(children.error)throw new AiApiError('service_unavailable',503,'Não foi possível conferir a coleção.');
      if(children.data?.length)throw new AiApiError('resource_in_use',409,'A coleção contém documentos; use force=true para removê-los.');
    }
    await removeAiStoredResource(client,store,{force:force==='true'});
    return {};
  }
  throw new AiApiError('unsupported_method',405,'Método não disponível.');
}
