import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {loadGeminiCredentials} from '@/lib/gemini/credentials';
import {AiApiError,record} from './gateway';
import {aiProviderOrigin,aiProviderRequest,AiProviderFailure} from './provider-http';
import {publicAiResource,refreshAiResource} from './resources';

export async function readAiEnvironmentFiles(client:SupabaseClient,row:Record<string,unknown>,request:Request) {
  if(row.kind!=='environment'||row.status!=='active')throw new AiApiError('resource_not_ready',409,'Ambiente indisponível.');
  const query=new URL(request.url).searchParams,path=query.get('path')??'';
  if(path.includes('..')||path.startsWith('/')||!/^[A-Za-z0-9_./ -]*$/.test(path))throw new AiApiError('invalid_path',422,'Use um caminho relativo do ambiente.');
  const endpoint=`/v1beta/environments/${row.provider_name}/files/${path.split('/').map(encodeURIComponent).join('/')}`;
  if(query.get('download')==='true')return downloadAiMedia(client,{...row,status:'completed',metadata:{media:[{uri:aiProviderOrigin+endpoint+'?alt=media'}]}},new Request(request.url.split('?')[0]));
  const params=new URLSearchParams({recursive:query.get('recursive')==='true'?'true':'false',page_size:'100'});
  if(query.get('cursor'))params.set('page_token',query.get('cursor')!);
  const response=await aiProviderRequest(client,endpoint+'?'+params.toString());
  const files=Array.isArray(response.files)?response.files.map(value=>{const file=record(value);return Object.fromEntries(['name','path','type','mime_type','size_bytes','created','modified'].filter(k=>file[k]!==undefined).map(k=>[k,file[k]]));}):[];
  return Response.json({object:'list',data:files,next_cursor:response.next_page_token??null},{headers:{'Cache-Control':'no-store'}});
}

export async function removeAiStoredResource(client:SupabaseClient,row:Record<string,unknown>) {
  if(row.kind==='cache')return refreshAiResource(client,row,true);
  if(row.kind==='store') {
    const active=await client.from('ai_resources').select('id').eq('project_id',row.project_id).eq('kind','document').eq('metadata->>store_id',row.id).in('status',['preparing','processing','uncertain','settling']).limit(1);
    if(active.error||active.data?.length)throw new AiApiError('resource_in_use',409,'Aguarde a indexação dos arquivos antes de remover a coleção.');
  }else if(!['agent','environment'].includes(String(row.kind))&&!['completed','requires_action','failed'].includes(String(row.status)))throw new AiApiError('resource_in_use',409,'Aguarde a conclusão ou cancele a operação antes de remover.');
  const name=row.kind==='document'?record(row.metadata).document_name:row.provider_name;
  if(name && ['store','document','interaction','batch','agent','environment'].includes(String(row.kind))) {
    const prefix=({interaction:'interactions/',agent:'agents/',environment:'environments/'} as Record<string,string>)[String(row.kind)]??'';
    try {await aiProviderRequest(client,`/v1beta/${prefix}${name}${row.kind==='store'?'?force=true':''}`,'DELETE');}
    catch(error){if(!(error instanceof AiProviderFailure&&error.status===404))throw error;}
  }
  const update=await client.from('ai_resources').update({status:'deleted',updated_at:new Date().toISOString()}).eq('id',row.id);
  if(update.error)throw new Error('Não foi possível remover o recurso.');return publicAiResource({...row,status:'deleted'});
}

export async function downloadAiMedia(client:SupabaseClient,row:Record<string,unknown>,request:Request) {
  if(row.status!=='completed')throw new AiApiError('resource_not_ready',409,'A mídia ainda não está disponível.');
  const index=Number(new URL(request.url).searchParams.get('index')??0), media=record(row.metadata).media;
  if(!Number.isInteger(index)||index<0||!Array.isArray(media)||!media[index])throw new AiApiError('resource_not_found',404,'Mídia não encontrada.');
  const uri=record(media[index]).uri;
  if(typeof uri!=='string')throw new Error('Download indisponível.');
  const url=new URL(uri);
  if(url.origin!==aiProviderOrigin||!/^\/(?:v1beta|download)\//.test(url.pathname)||url.username||url.password)throw new Error('Origem de mídia inválida.');
  const {apiKey}=await loadGeminiCredentials(client);
  const response=await fetch(url,{headers:{'x-goog-api-key':apiKey},redirect:'manual',signal:AbortSignal.timeout(90000)});
  let download=response;
  // Redirected signed storage URLs receive no API credential.
  if([301,302,303,307,308].includes(response.status)) {
    const location=new URL(response.headers.get('location')??'',url);
    if(location.protocol!=='https:'||!/(^|\.)(googleusercontent\.com|googleapis\.com)$/.test(location.hostname))throw new Error('Destino de mídia inválido.');
    download=await fetch(location,{redirect:'error',signal:AbortSignal.timeout(90000)});
  }
  if(!download.ok||!download.body)throw new Error('Download indisponível.');
  const mime=download.headers.get('content-type')??'application/octet-stream';
  const extension=({'video/mp4':'mp4','audio/mpeg':'mp3','image/png':'png','image/jpeg':'jpg'} as Record<string,string>)[mime]??'bin';
  return new Response(download.body,{headers:{'Content-Type':mime,'Cache-Control':'private, no-store','Content-Disposition':`attachment; filename="${row.id}.${extension}"`}});
}
