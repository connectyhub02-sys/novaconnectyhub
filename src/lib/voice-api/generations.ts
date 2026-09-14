import 'server-only';
import {voiceHash,type VoiceAuth} from './auth';
import {parseVoiceInput,voiceIdempotency,VoiceError,voiceLimits} from './contract';
import {voiceCatalog,quoteVoice} from './catalog';
import {loadElevenLabsCredentials} from '@/lib/elevenlabs/credentials';
import {assertStorageUploadAllowed} from '@/lib/storage/quotas';
import {requestVoiceAudio,retrieveVoiceAudio,boundedVoiceAudio} from './provider';
export const voiceBucket='connectyhub-voice';
export type VoiceRow={id:string;project_id:string;organization_id:string;billing_organization_id:string;operation:string;status:string;voice_id:string;model_id:string;characters:number;quoted_credits:number;reserved_credits:number;charged_credits:number;error_code:string|null;provider_history_id:string|null;object_path:string|null;bytes_size:number|null;input_hash:string;created_at:string;updated_at:string;claimed?:boolean};
type Row=VoiceRow;
export function publicVoiceGeneration(r:Row,replayed=false) {
  return {id:r.id,project_id:r.project_id,billing_organization_id:r.billing_organization_id,status:r.status,operation:r.operation,voice_id:r.voice_id,model_id:r.model_id,
    usage:{characters:r.characters,credits:Number(r.charged_credits),reserved_credits:Number(r.reserved_credits),quoted_credits:Number(r.quoted_credits)},
    audio:r.status==='completed'&&r.operation!=='voice_clone'?{path:`/api/v1/voice/generations/${r.id}/audio`,content_type:'audio/mpeg',bytes:r.bytes_size}:null,
    error:r.error_code?{code:r.error_code}:null,replayed,created_at:r.created_at};
}
export async function voiceRpc(auth:VoiceAuth,name:string,args:Record<string,unknown>):Promise<Row> {
  const {data,error}=await auth.client.rpc(name,args);
  if(error) {
    const code=error.message.match(/voice_[a-z_]+/)?.[0]??'service_unavailable';
    const status=code.includes('insufficient')?402:code.includes('limit')?429:code.includes('conflict')?409:503;
    throw new VoiceError(code,status,code==='voice_insufficient_credits'?'Saldo disponível insuficiente.':'Não foi possível concluir a operação de Voz.');
  }
  return data as Row;
}
export async function voiceGeneration(auth:VoiceAuth,id:string) {
  if(!/^[a-f0-9-]{36}$/i.test(id)) throw new VoiceError('not_found',404,'Solicitação não encontrada.');
  const {data,error}=await auth.client.from('voice_generations').select('*').eq('id',id).eq('project_id',auth.project.id).eq('organization_id',auth.project.organization_id).maybeSingle<Row>();
  if(error)throw new VoiceError('service_unavailable',503,'Não foi possível consultar a solicitação.');
  if(!data)throw new VoiceError('not_found',404,'Solicitação não encontrada.');
  return data;
}
async function persistAudio(auth:VoiceAuth,r:Row,bytes:Buffer) {
  const path=`${r.organization_id}/${r.project_id}/${r.id}.mp3`;
  const upload=await auth.client.storage.from(voiceBucket).upload(path,bytes,{contentType:'audio/mpeg',upsert:false});
  if(upload.error) {
    const existing=await auth.client.storage.from(voiceBucket).download(path);
    if(existing.error || existing.data.size!==bytes.length)throw new VoiceError('storage_pending',503,'O áudio aguarda recuperação.',r.id);
  }
  const saved=await auth.client.from('voice_generations').update({object_path:path,bytes_size:bytes.length,updated_at:new Date().toISOString()}).eq('id',r.id).in('status',['processing','uncertain']);
  if(saved.error)throw new VoiceError('storage_pending',503,'O registro do áudio aguarda recuperação.',r.id);
  return voiceRpc(auth,'finish_voice_generation',{p_id:r.id,p_status:'completed'});
}
export async function recoverVoice(auth:VoiceAuth,r:Row):Promise<Row> {
  if(['completed','failed'].includes(r.status) || Date.now()-Date.parse(r.updated_at)<120000)return r;
  if(r.status==='reserved')return voiceRpc(auth,'finish_voice_generation',{p_id:r.id,p_status:'failed',p_error:'dispatch_expired'});
  if(r.operation==='voice_clone'){
    const clone=await auth.client.from('voice_clones').select('provider_voice_id').eq('generation_id',r.id).eq('project_id',auth.project.id).in('status',['ready','verification_required']).maybeSingle();
    if(clone.error||!clone.data?.provider_voice_id)return r;
    const saved=await auth.client.from('voice_generations').update({voice_id:clone.data.provider_voice_id}).eq('id',r.id);
    if(saved.error)return r;
    return voiceRpc(auth,'finish_voice_generation',{p_id:r.id,p_status:'completed'});
  }
  const path=`${r.organization_id}/${r.project_id}/${r.id}.mp3`;
  const stored=await auth.client.storage.from(voiceBucket).download(path);
  if(!stored.error && stored.data.size>0 && stored.data.size<=voiceLimits.audioBytes) return persistAudio(auth,r,Buffer.from(await stored.data.arrayBuffer()));
  if(!r.provider_history_id)return r;
  const credentials=await loadElevenLabsCredentials(auth.client);
  const result=await retrieveVoiceAudio(credentials.apiKey,r.provider_history_id);
  if(!result.ok)return r;
  return persistAudio(auth,r,await boundedVoiceAudio(result));
}
export async function generateVoice(auth:VoiceAuth,request:Request,raw:unknown,includedPreview=false) {
  const input=parseVoiceInput(raw),idempotency=voiceIdempotency(request),hash=voiceHash(JSON.stringify({operation:includedPreview?'voice_clone_preview':'text_to_speech',...input}));
  const existing=await auth.client.from('voice_generations').select('*').eq('project_id',auth.project.id).eq('idempotency_key',idempotency).maybeSingle<Row>();
  if(existing.error)throw new VoiceError('service_unavailable',503,'Não foi possível conferir a solicitação.');
  if(existing.data){if(existing.data.input_hash!==hash)throw new VoiceError('idempotency_conflict',409,'Esta chave já foi usada com outro conteúdo.');return publicVoiceGeneration(await recoverVoice(auth,existing.data),true);}
  const catalog=await voiceCatalog(auth);
  if(!catalog.voices.some(v=>v.voice_id===input.voice_id && v.status==='ready'))throw new VoiceError('voice_unavailable',404,'Voz não disponível neste projeto.');
  const {rates,price}=await quoteVoice(auth,input.model_id,input.text.length);
  await assertStorageUploadAllowed({client:auth.client,organizationId:auth.project.organization_id,category:'generated_media',files:[{fileName:'voz.mp3',contentType:'audio/mpeg',sizeBytes:voiceLimits.audioBytes}]});
  const credentials=await loadElevenLabsCredentials(auth.client);
  const r=await voiceRpc(auth,'reserve_voice_generation',{p_project:auth.project.id,p_key:auth.keyId,p_idempotency:idempotency,p_hash:hash,p_voice:input.voice_id,p_model:input.model_id,p_characters:input.text.length,p_charge:includedPreview?0:price.chargeCredits,p_cost:price.providerCost,p_rates:rates,p_operation:includedPreview?'voice_clone_preview':'text_to_speech'});
  if(!r.claimed)return publicVoiceGeneration(await recoverVoice(auth,r),true);
  let dispatched=false;
  try {
    await voiceRpc(auth,'start_voice_generation',{p_id:r.id});
    dispatched=true;
    const response=await requestVoiceAudio(credentials.apiKey,input);
    if(!response.ok) {
      const definitive=[400,401,403,404,422,429].includes(response.status);
      await response.body?.cancel();
      await voiceRpc(auth,'finish_voice_generation',{p_id:r.id,p_status:definitive?'failed':'uncertain',p_error:'provider_rejected'});
      throw new VoiceError('provider_rejected',502,'O serviço de voz não concluiu a geração. Consulte o estado da solicitação.',r.id);
    }
    const historyId=response.headers.get('history-item-id');
    if(historyId){const saved=await auth.client.from('voice_generations').update({provider_history_id:historyId}).eq('id',r.id);if(saved.error){await response.body?.cancel();throw new VoiceError('receipt_pending',503,'Recibo do provedor pendente.',r.id);}}
    const bytes=await boundedVoiceAudio(response);
    return publicVoiceGeneration(await persistAudio(auth,r,bytes));
  } catch(error) {
    await voiceRpc(auth,'finish_voice_generation',{p_id:r.id,p_status:dispatched?'uncertain':'failed',p_error:error instanceof VoiceError?error.code:'provider_result_uncertain'}).catch(()=>{});
    if(error instanceof VoiceError)throw error;
    throw new VoiceError('provider_result_uncertain',503,'Resultado incerto. Reutilize a mesma Idempotency-Key; não será gerado outro áudio automaticamente.',r.id);
  }
}
export async function downloadVoice(auth:VoiceAuth,id:string) {
  const r=await voiceGeneration(auth,id);
  if(r.status!=='completed'||!r.object_path)throw new VoiceError('audio_not_ready',409,'O áudio ainda não está disponível.',r.id);
  const {data,error}=await auth.client.storage.from(voiceBucket).download(r.object_path);
  if(error)throw new VoiceError('audio_unavailable',503,'Não foi possível recuperar o áudio.',r.id);
  return new Response(data,{headers:{'Content-Type':'audio/mpeg','Content-Disposition':`inline; filename="voz-${r.id}.mp3"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
