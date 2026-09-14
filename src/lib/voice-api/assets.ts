import 'server-only';
import {randomBytes} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {voiceHash,type VoiceAuth} from './auth';
import {VoiceError,voiceBody} from './contract';

type Asset={id:string;project_id:string;organization_id:string;billing_organization_id:string;key_id:string|null;display_name:string;size_bytes:number;mime_type:string;status:string;duration_seconds:number|null;ticket_expires_at:string|null;sha256:string|null;created_at:string};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function publicStudioAsset(a:Asset){return {id:a.id,project_id:a.project_id,name:a.display_name,size_bytes:a.size_bytes,mime_type:a.mime_type,status:a.status,duration_seconds:a.duration_seconds===null?null:Number(a.duration_seconds),created_at:a.created_at};}
export function studioAssetMetadata(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new VoiceError('invalid_asset',422,'Envie os metadados do áudio.');
 const b=raw as Record<string,unknown>;
 if(Object.keys(b).some(k=>!['size_bytes','mime_type','name'].includes(k)))throw new VoiceError('invalid_asset',422,'Campo de arquivo inválido.');
 if(typeof b.size_bytes!=='number'||!Number.isSafeInteger(b.size_bytes)||b.size_bytes<1||b.size_bytes>20_000_000)throw new VoiceError('asset_size_limit',422,'Envie áudio de até 20 MB.');
 if(typeof b.mime_type!=='string'||!/^audio\/(wav|mpeg|mp4|aac|ogg|flac|webm)$/.test(b.mime_type))throw new VoiceError('invalid_asset',422,'Formato de áudio não suportado.');
 if(typeof b.name!=='string'||!b.name.trim()||b.name.length>100||/[\x00-\x1f\x7f]/.test(b.name))throw new VoiceError('invalid_asset',422,'Informe um nome com até 100 caracteres.');
 return {size_bytes:b.size_bytes,mime_type:b.mime_type,name:b.name.trim()};
}
function relayUrl(id:string){
 const base=process.env.AI_RELAY_PUBLIC_URL;
 if(process.env.STUDIO_ASSETS_ENABLED!=='true'||!base||!process.env.AI_RELAY_SECRET)throw new VoiceError('assets_unavailable',503,'Envio de áudio ainda indisponível.');
 const parsed=new URL(base.replace(/^wss:/,'https:'));
 if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw new VoiceError('assets_unavailable',503,'Envio de áudio indisponível.');
 return new URL(`/studio-assets/${id}`,parsed).toString();
}
async function assetRpc(client:SupabaseClient,name:string,args:Record<string,unknown>):Promise<Asset>{
 const {data,error}=await client.rpc(name,args);
 if(error){const code=error.message.match(/voice_[a-z_]+/)?.[0]??'service_unavailable';throw new VoiceError(code,code.includes('ticket')?401:code.includes('limit')?429:code.includes('state')?409:503,'Não foi possível concluir a operação do arquivo.');}
 return data as Asset;
}
export async function ownedStudioAsset(auth:VoiceAuth,id:string){
 if(!uuid.test(id))throw new VoiceError('not_found',404,'Arquivo não encontrado.');
 const {data,error}=await auth.client.from('studio_assets').select('*').eq('id',id).eq('project_id',auth.project.id).eq('organization_id',auth.project.organization_id).maybeSingle<Asset>();
 if(error)throw new VoiceError('service_unavailable',503,'Não foi possível consultar o arquivo.');
 if(!data)throw new VoiceError('not_found',404,'Arquivo não encontrado.');
 if(data.status==='pending'&&data.ticket_expires_at&&Date.parse(data.ticket_expires_at)<=Date.now())return assetRpc(auth.client,'finish_studio_asset',{p_id:id,p_status:'failed'});
 return data;
}
export async function createStudioAsset(auth:VoiceAuth,raw:unknown){
 const b=studioAssetMetadata(raw);relayUrl('availability-check');
 const ticket=randomBytes(32).toString('hex');
 const a=await assetRpc(auth.client,'create_studio_asset',{p_project:auth.project.id,p_key:auth.keyId,p_name:b.name,p_size:b.size_bytes,p_mime:b.mime_type,p_hash:voiceHash(ticket)});
 return {...publicStudioAsset(a),upload:{url:relayUrl(a.id),method:'PUT',access_key:ticket,expires_at:a.ticket_expires_at}};
}
export async function studioAssetTicket(auth:VoiceAuth,id:string,purpose:'download'|'delete'){
 const a=await ownedStudioAsset(auth,id),url=relayUrl(id);
 if(purpose==='download'&&a.status!=='ready'||purpose==='delete'&&!['ready','pending','failed','deleting'].includes(a.status))throw new VoiceError('asset_state',409,'Arquivo ainda indisponível para esta operação.');
 const ticket=randomBytes(32).toString('hex'),expires=new Date(Date.now()+60000).toISOString();
 const {data,error}=await auth.client.from('studio_assets').update({key_id:auth.keyId,ticket_hash:voiceHash(ticket),ticket_purpose:purpose,ticket_expires_at:expires}).eq('id',id).eq('project_id',auth.project.id).eq('organization_id',auth.project.organization_id).eq('status',a.status).select('id').maybeSingle();
 if(error||!data)throw new VoiceError('asset_state',409,'Arquivo alterado durante a operação; consulte novamente.');
 return {id,url,method:purpose==='download'?'GET':'DELETE',access_key:ticket,expires_at:expires};
}
export async function deleteStudioAsset(auth:VoiceAuth,id:string){
 const a=await ownedStudioAsset(auth,id);if(a.status==='deleted')return publicStudioAsset(a);
 const ticket=await studioAssetTicket(auth,id,'delete');
 const response=await fetch(ticket.url,{method:'DELETE',headers:{Authorization:`Bearer ${ticket.access_key}`},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});
 if(!response.ok){await response.body?.cancel();throw new VoiceError('asset_delete_pending',503,'Exclusão pendente; consulte o arquivo antes de repetir.');}
 await response.body?.cancel();return publicStudioAsset(await ownedStudioAsset(auth,id));
}
export async function listStudioAssets(auth:VoiceAuth){
 const {data,error}=await auth.client.from('studio_assets').select('*').eq('project_id',auth.project.id).eq('organization_id',auth.project.organization_id).order('created_at',{ascending:false}).limit(50);
 if(error)throw new VoiceError('service_unavailable',503,'Não foi possível consultar os arquivos.');
 return {assets:(data??[]).map(publicStudioAsset),limit:50};
}
export async function studioAssetCommand(client:SupabaseClient,raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new VoiceError('invalid_asset',422,'Comando inválido.');
 const b=raw as Record<string,unknown>,id=b.id;
 if(b.action==='asset.stale'){
  const {data,error}=await client.from('studio_assets').select('id').eq('status','processing').lt('updated_at',new Date(Date.now()-600000).toISOString()).order('updated_at').limit(20);
  if(error)throw new VoiceError('service_unavailable',503,'Não foi possível conferir uploads pendentes.');
  return {ids:(data??[]).map(a=>a.id)};
 }
 if(typeof id!=='string'||!uuid.test(id))throw new VoiceError('invalid_asset',422,'Arquivo inválido.');
 if(b.action==='asset.fail_stale')return publicStudioAsset(await assetRpc(client,'fail_stale_studio_asset',{p_id:id}));
 if(b.action==='asset.connect'){
  if(typeof b.access_key!=='string'||!/^[a-f0-9]{64}$/.test(b.access_key)||!['upload','download','delete'].includes(String(b.purpose)))throw new VoiceError('invalid_ticket',401,'Acesso inválido.');
  const a=await assetRpc(client,'consume_studio_asset_ticket',{p_id:id,p_hash:voiceHash(b.access_key),p_purpose:b.purpose});
  return {id:a.id,organization_id:a.organization_id,size_bytes:a.size_bytes,mime_type:a.mime_type,sha256:a.sha256};
 }
 if(b.action==='asset.fail')return publicStudioAsset(await assetRpc(client,'finish_studio_asset',{p_id:id,p_status:'failed'}));
 if(b.action!=='asset.complete'||!['ready','deleted'].includes(String(b.status)))throw new VoiceError('invalid_asset',422,'Comando inválido.');
 if(b.status==='ready'&&(typeof b.duration_seconds!=='number'||!Number.isFinite(b.duration_seconds)||b.duration_seconds<=0||b.duration_seconds>1800||typeof b.sha256!=='string'||!/^[a-f0-9]{64}$/.test(b.sha256)))throw new VoiceError('invalid_asset',422,'Medição inválida.');
 return publicStudioAsset(await assetRpc(client,'finish_studio_asset',{p_id:id,p_status:b.status,p_duration:b.status==='ready'?Number(Number(b.duration_seconds).toFixed(6)):null,p_sha256:b.status==='ready'?b.sha256:null}));
}
export async function readStudioJson(request:Request){try{return JSON.parse(new TextDecoder().decode(await voiceBody(request,40000)));}catch(error){if(error instanceof VoiceError)throw error;throw new VoiceError('invalid_json',422,'JSON inválido.');}}
