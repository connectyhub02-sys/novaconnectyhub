import 'server-only';
import {randomBytes} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {loadGeminiCredentials} from '@/lib/gemini/credentials';
import {AiApiError,authenticateAi,authorizeAiKey,hashAiSecret,record,rpc} from './gateway';
import {publicAiFile,aiFileMetadata} from './files';
import {aiProviderRequest} from './provider-http';

export const uploadMaximumBytes=20_000_000;
export function validateUploadMetadata(raw:unknown) {
  const body=record(raw),size=body.size_bytes,mime=String(body.mime_type??'');
  if(Object.keys(body).some(k=>!['size_bytes','mime_type','display_name'].includes(k)))throw new AiApiError('invalid_file',422,'Campo de arquivo inválido.');
  if(typeof size!=='number'||!Number.isSafeInteger(size)||size<1||size>uploadMaximumBytes)throw new AiApiError('invalid_file',422,'Envie de 1 a 20.000.000 bytes.');
  if(!/^(image\/(png|jpeg|webp)|audio\/(mpeg|mp4|wav|aac|ogg|flac)|video\/(mp4|webm|quicktime)|application\/pdf|text\/plain)$/.test(mime))throw new AiApiError('invalid_file',422,'Tipo de arquivo não suportado.');
  return {size_bytes:size,mime_type:mime,display_name:String(body.display_name??'Arquivo').slice(0,200)};
}
export async function createAiUpload(client:SupabaseClient,request:Request,raw:unknown) {
  const auth=await authenticateAi(request,client),metadata=validateUploadMetadata(raw);
  const relay=process.env.AI_RELAY_PUBLIC_URL;
  if(process.env.AI_UPLOAD_RELAY_ENABLED!=='true'||!relay||!relay.startsWith('wss://')||!process.env.AI_RELAY_SECRET)throw new AiApiError('upload_unavailable',503,'Transporte de arquivos indisponível.');
  const ticket=randomBytes(32).toString('hex'),expires=new Date(Date.now()+120000).toISOString();
  const saved=await client.from('ai_resources').insert({organization_id:auth.billingOrganizationId,project_id:auth.project.id,key_id:auth.key.id,
    kind:'file',status:'preparing',expires_at:expires,metadata:{...metadata,ticket_hash:hashAiSecret(ticket),transport:'relay-v1'}}).select('*').single();
  if(saved.error||!saved.data)throw new AiApiError('service_unavailable',503,'Não foi possível preparar o envio.');
  const url=new URL(`/uploads/${saved.data.id}`,relay.replace(/^wss:/,'https:'));
  return {id:saved.data.id,upload_url:url.toString(),access_key:ticket,expires_at:expires,method:'PUT',max_size_bytes:uploadMaximumBytes};
}
export async function aiUploadCommand(client:SupabaseClient,raw:unknown) {
  const body=record(raw),id=String(body.id??'');
  if(!/^[a-f0-9-]{36}$/i.test(id))throw new AiApiError('invalid_file',422,'Identidade de arquivo inválida.');
  if(body.action==='upload.connect') {
    if(typeof body.access_key!=='string'||!/^[a-f0-9]{64}$/.test(body.access_key))throw new AiApiError('invalid_upload_ticket',401,'Acesso de upload inválido.');
    const row=await rpc(client,'consume_ai_upload_ticket',{p_id:id,p_hash:hashAiSecret(body.access_key)});
    const key=await client.from('ai_api_keys').select('id,project_id,status,model_id').eq('id',row.key_id).maybeSingle();
    if(key.error)throw new AiApiError('service_unavailable',503,'Não foi possível conferir o acesso.');
    await authorizeAiKey(client,key.data);
    const {apiKey}=await loadGeminiCredentials(client);
    return {id,organization_id:row.organization_id,api_key:apiKey,...validateUploadMetadata(Object.fromEntries(['size_bytes','mime_type','display_name'].map(k=>[k,record(row.metadata)[k]])))};
  }
  if(!['upload.complete','upload.fail'].includes(String(body.action)))throw new AiApiError('invalid_action',422,'Operação inválida.');
  const loaded=await client.from('ai_resources').select('*').eq('id',id).eq('kind','file').single();
  if(loaded.error||!loaded.data)throw new AiApiError('resource_not_found',404,'Arquivo não encontrado.');
  const row=loaded.data;
  if(body.action==='upload.fail') {
    await client.from('ai_resources').update({status:'failed',updated_at:new Date().toISOString()}).eq('id',id).eq('status','processing');
    return {ok:true};
  }
  const name=String(body.name??'');
  if(!/^files\/[a-zA-Z0-9_-]+$/.test(name))throw new AiApiError('invalid_file',422,'Arquivo inválido.');
  if(row.provider_name===name&&['active','processing'].includes(row.status))return publicAiFile(row);
  if(row.provider_name||row.status!=='processing')throw new AiApiError('file_state_conflict',409,'Envio já encerrado.');
  const file=await aiProviderRequest(client,`/v1beta/${name}`);
  if(Number(file.sizeBytes)!==Number(record(row.metadata).size_bytes)||file.mimeType!==record(row.metadata).mime_type)
    throw new AiApiError('invalid_file',422,'O arquivo recebido diverge do envio autorizado.');
  const update={provider_name:name,status:file.state==='ACTIVE'?'active':file.state==='FAILED'?'failed':'processing',expires_at:file.expirationTime??null,
    metadata:{...record(row.metadata),uri:file.uri,file_response:aiFileMetadata(file)},updated_at:new Date().toISOString()};
  const saved=await client.from('ai_resources').update(update).eq('id',id).is('provider_name',null).eq('status','processing').select('*').maybeSingle();
  if(saved.error||!saved.data)throw new AiApiError('service_unavailable',503,'A confirmação do arquivo precisa ser repetida.');
  return publicAiFile(saved.data);
}
