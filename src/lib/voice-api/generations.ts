import {resolveStudioDictionaries,type DictionaryLocator} from './studio-dictionaries';
import 'server-only';
import {voiceHash,type VoiceAuth} from './auth';
import {parseVoiceInput,voiceFormats,voiceIdempotency,VoiceError,voiceLimits,isVoiceFormat,type VoiceFormat,type VoiceInput} from './contract';
import {voiceCatalog,quoteVoice} from './catalog';
import {loadElevenLabsCredentials} from '@/lib/elevenlabs/credentials';
import {assertStorageUploadAllowed} from '@/lib/storage/quotas';
import {requestVoiceAudio,retrieveVoiceAudio,boundedVoiceAudio,streamVoiceAudio,timestampedVoiceAudio} from './provider';
export const voiceBucket='connectyhub-voice';
export type VoiceRow={id:string;project_id:string;organization_id:string;billing_organization_id:string;operation:string;status:string;voice_id:string;model_id:string;characters:number;quoted_credits:number;reserved_credits:number;charged_credits:number;error_code:string|null;provider_history_id:string|null;object_path:string|null;bytes_size:number|null;input_hash:string;created_at:string;updated_at:string;claimed?:boolean;output_format?:string|null;alignment_path?:string|null};
type Row=VoiceRow;
const formatOf=(r:Row):VoiceFormat=>isVoiceFormat(r.output_format)?r.output_format:'mp3_44100_128';
const audioPath=(r:Row)=>`${r.organization_id}/${r.project_id}/${r.id}.${voiceFormats[formatOf(r)].ext}`;
export function publicVoiceGeneration(r:Row,replayed=false) {
  const format=formatOf(r);
  return {id:r.id,project_id:r.project_id,billing_organization_id:r.billing_organization_id,status:r.status,operation:r.operation,voice_id:r.voice_id,model_id:r.model_id,
    usage:{characters:r.characters,credits:Number(r.charged_credits),reserved_credits:Number(r.reserved_credits),quoted_credits:Number(r.quoted_credits)},
    audio:r.status==='completed'&&r.operation!=='voice_clone'?{path:`/api/v1/voice/generations/${r.id}/audio`,content_type:voiceFormats[format].mime,output_format:format,bytes:r.bytes_size}:null,
    alignment:r.status==='completed'&&r.alignment_path?{path:`/api/v1/voice/generations/${r.id}/alignment`}:null,
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
  const {data,error}=await auth.client.from('voice_generations').select('*').eq('id',id).eq('project_id',auth.project.id).eq('organization_id',auth.project.organization_id).neq('operation','studio').maybeSingle<Row>();
  if(error)throw new VoiceError('service_unavailable',503,'Não foi possível consultar a solicitação.');
  if(!data)throw new VoiceError('not_found',404,'Solicitação não encontrada.');
  return data;
}
async function persistAudio(auth:VoiceAuth,r:Row,bytes:Buffer,alignment?:unknown) {
  const path=audioPath(r),mime=voiceFormats[formatOf(r)].mime;
  const upload=await auth.client.storage.from(voiceBucket).upload(path,bytes,{contentType:mime,upsert:false});
  if(upload.error) {
    const existing=await auth.client.storage.from(voiceBucket).download(path);
    if(existing.error || existing.data.size!==bytes.length)throw new VoiceError('storage_pending',503,'O áudio aguarda recuperação.',r.id);
  }
  let alignmentPath:string|undefined;
  if(alignment){
    // Timestamps are part of the same paid generation; stored next to the audio.
    alignmentPath=`${r.organization_id}/${r.project_id}/${r.id}.alignment.json`;
    const saved=await auth.client.storage.from(voiceBucket).upload(alignmentPath,Buffer.from(JSON.stringify(alignment)),{contentType:'application/json',upsert:true});
    if(saved.error)throw new VoiceError('storage_pending',503,'A marcação de tempo aguarda recuperação.',r.id);
  }
  const saved=await auth.client.from('voice_generations').update({object_path:path,bytes_size:bytes.length,...(alignmentPath?{alignment_path:alignmentPath}:{}),updated_at:new Date().toISOString()}).eq('id',r.id).in('status',['processing','uncertain']);
  if(saved.error)throw new VoiceError('storage_pending',503,'O registro do áudio aguarda recuperação.',r.id);
  return voiceRpc(auth,'finish_voice_generation',{p_id:r.id,p_status:'completed'});
}
export async function recoverVoice(auth:VoiceAuth,r:Row):Promise<Row> {
  if(r.operation==='studio')throw new VoiceError('operation_route',409,'Consulte esta solicitação em /operations.');
  if(['completed','failed'].includes(r.status) || Date.now()-Date.parse(r.updated_at)<120000)return r;
  if(r.status==='reserved')return voiceRpc(auth,'finish_voice_generation',{p_id:r.id,p_status:'failed',p_error:'dispatch_expired'});
  if(r.operation==='voice_clone'){
    const clone=await auth.client.from('voice_clones').select('provider_voice_id').eq('generation_id',r.id).eq('project_id',auth.project.id).in('status',['ready','verification_required']).maybeSingle();
    if(clone.error||!clone.data?.provider_voice_id)return r;
    const saved=await auth.client.from('voice_generations').update({voice_id:clone.data.provider_voice_id}).eq('id',r.id);
    if(saved.error)return r;
    return voiceRpc(auth,'finish_voice_generation',{p_id:r.id,p_status:'completed'});
  }
  const stored=await auth.client.storage.from(voiceBucket).download(audioPath(r));
  if(!stored.error && stored.data.size>0 && stored.data.size<=voiceLimits.audioBytes) return persistAudio(auth,r,Buffer.from(await stored.data.arrayBuffer()));
  // The provider history keeps MP3 only; other formats stay under reconciliation.
  if(!r.provider_history_id||!formatOf(r).startsWith('mp3_'))return r;
  const credentials=await loadElevenLabsCredentials(auth.client);
  const result=await retrieveVoiceAudio(credentials.apiKey,r.provider_history_id);
  if(!result.ok)return r;
  return persistAudio(auth,r,await boundedVoiceAudio(result));
}

type Reserved={kind:'replay';row:Row}|{kind:'claimed';row:Row;input:VoiceInput;apiKey:string;dictionaries:DictionaryLocator[]};
/** Quote, balance check and hold, shared by the single and the streaming generation. */
async function reserveVoice(auth:VoiceAuth,request:Request,raw:unknown,includedPreview:boolean,stream:boolean):Promise<Reserved>{
  const input=parseVoiceInput(raw),idempotency=voiceIdempotency(request);
  if(stream&&input.with_timestamps)throw new VoiceError('invalid_timestamps',422,'Marcação de tempo não está disponível no streaming; use POST /generations.');
  const hash=voiceHash(JSON.stringify({operation:includedPreview?'voice_clone_preview':'text_to_speech',...input,...(stream?{stream:true}:{})}));
  const existing=await auth.client.from('voice_generations').select('*').eq('project_id',auth.project.id).eq('idempotency_key',idempotency).maybeSingle<Row>();
  if(existing.error)throw new VoiceError('service_unavailable',503,'Não foi possível conferir a solicitação.');
  if(existing.data){if(existing.data.input_hash!==hash||existing.data.operation==='studio')throw new VoiceError('idempotency_conflict',409,'Esta chave já foi usada com outro conteúdo.');return {kind:'replay',row:await recoverVoice(auth,existing.data)};}
  const catalog=await voiceCatalog(auth);
  if(!catalog.voices.some(v=>v.voice_id===input.voice_id && v.status==='ready'))throw new VoiceError('voice_unavailable',404,'Voz não disponível neste projeto.');
  const dictionaries=await resolveStudioDictionaries(auth,input.dictionary_ids??[]);
  const {rates,price}=await quoteVoice(auth,input.model_id,input.text.length);
  const {mime,ext}=voiceFormats[input.output_format];
  await assertStorageUploadAllowed({client:auth.client,organizationId:auth.project.organization_id,category:'generated_media',files:[{fileName:`voz.${ext}`,contentType:mime,sizeBytes:voiceLimits.audioBytes}]});
  const credentials=await loadElevenLabsCredentials(auth.client);
  const r=await voiceRpc(auth,'reserve_voice_generation',{p_project:auth.project.id,p_key:auth.keyId,p_idempotency:idempotency,p_hash:hash,p_voice:input.voice_id,p_model:input.model_id,p_characters:input.text.length,p_charge:includedPreview?0:price.chargeCredits,p_cost:price.providerCost,p_rates:rates,p_operation:includedPreview?'voice_clone_preview':'text_to_speech'});
  if(!r.claimed)return {kind:'replay',row:await recoverVoice(auth,r)};
  if(input.output_format!=='mp3_44100_128'){
    const saved=await auth.client.from('voice_generations').update({output_format:input.output_format}).eq('id',r.id).eq('status','reserved');
    if(saved.error){await voiceRpc(auth,'finish_voice_generation',{p_id:r.id,p_status:'failed',p_error:'format_pending'}).catch(()=>{});throw new VoiceError('service_unavailable',503,'Não foi possível registrar o formato.',r.id);}
    r.output_format=input.output_format;
  }
  return {kind:'claimed',row:r,input,apiKey:credentials.apiKey,dictionaries};
}

async function rejected(auth:VoiceAuth,r:Row,response:Response){
  const definitive=[400,401,403,404,422,429].includes(response.status);
  await response.body?.cancel();
  await voiceRpc(auth,'finish_voice_generation',{p_id:r.id,p_status:definitive?'failed':'uncertain',p_error:'provider_rejected'});
  return new VoiceError('provider_rejected',502,'O serviço de voz não concluiu a geração. Consulte o estado da solicitação.',r.id);
}

export async function generateVoice(auth:VoiceAuth,request:Request,raw:unknown,includedPreview=false) {
  const reserved=await reserveVoice(auth,request,raw,includedPreview,false);
  if(reserved.kind==='replay')return publicVoiceGeneration(reserved.row,true);
  const {row:r,input,apiKey,dictionaries}=reserved;
  let dispatched=false;
  try {
    await voiceRpc(auth,'start_voice_generation',{p_id:r.id});
    dispatched=true;
    const response=await requestVoiceAudio(apiKey,input,dictionaries);
    if(!response.ok)throw await rejected(auth,r,response);
    const historyId=response.headers.get('history-item-id');
    if(historyId){const saved=await auth.client.from('voice_generations').update({provider_history_id:historyId}).eq('id',r.id);if(saved.error){await response.body?.cancel();throw new VoiceError('receipt_pending',503,'Recibo do provedor pendente.',r.id);}}
    if(input.with_timestamps){const result=await timestampedVoiceAudio(response);return publicVoiceGeneration(await persistAudio(auth,r,result.bytes,result.alignment));}
    const bytes=await boundedVoiceAudio(response);
    return publicVoiceGeneration(await persistAudio(auth,r,bytes));
  } catch(error) {
    if(!(error instanceof VoiceError&&error.code==='provider_rejected'))await voiceRpc(auth,'finish_voice_generation',{p_id:r.id,p_status:dispatched?'uncertain':'failed',p_error:error instanceof VoiceError?error.code:'provider_result_uncertain'}).catch(()=>{});
    if(error instanceof VoiceError)throw error;
    throw new VoiceError('provider_result_uncertain',503,'Resultado incerto. Reutilize a mesma Idempotency-Key; não será gerado outro áudio automaticamente.',r.id);
  }
}

/**
 * Streaming: the client hears audio while it is generated. The same chunks are
 * kept and stored when the provider finishes, and the hold is settled once. If
 * the client disconnects, the rest is still read and settled (the provider bills it).
 */
export async function generateVoiceStream(auth:VoiceAuth,request:Request,raw:unknown):Promise<Response> {
  const reserved=await reserveVoice(auth,request,raw,false,true);
  if(reserved.kind==='replay'){
    if(reserved.row.status!=='completed')throw new VoiceError('generation_pending',409,'Esta solicitação ainda está em andamento. Consulte GET /generations/{id}.',reserved.row.id);
    const replay=await downloadVoice(auth,reserved.row.id);
    replay.headers.set('X-Generation-Id',reserved.row.id);replay.headers.set('X-Replayed','true');
    return replay;
  }
  const {row:r,input,apiKey,dictionaries}=reserved;
  let dispatched=false,response:Response;
  try{
    await voiceRpc(auth,'start_voice_generation',{p_id:r.id});
    dispatched=true;
    response=await streamVoiceAudio(apiKey,input,dictionaries);
    if(!response.ok)throw await rejected(auth,r,response);
    if(!response.body)throw new VoiceError('provider_audio_invalid',502,'O provedor não devolveu um áudio válido.',r.id);
  }catch(error){
    if(!(error instanceof VoiceError&&error.code==='provider_rejected'))await voiceRpc(auth,'finish_voice_generation',{p_id:r.id,p_status:dispatched?'uncertain':'failed',p_error:error instanceof VoiceError?error.code:'provider_result_uncertain'}).catch(()=>{});
    throw error;
  }
  const reader=response.body!.getReader(),chunks:Uint8Array[]=[];let size=0,clientGone=false,settled:Promise<void>|null=null;
  const settle=()=>settled??=(async()=>{
    try{
      if(!size)throw new VoiceError('provider_audio_empty',502,'O provedor retornou áudio vazio.');
      await persistAudio(auth,r,Buffer.concat(chunks,size));
    }catch(error){await voiceRpc(auth,'finish_voice_generation',{p_id:r.id,p_status:'uncertain',p_error:error instanceof VoiceError?error.code:'stream_settlement_pending'}).catch(()=>{});}
  })();
  const drain=async()=>{try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>voiceLimits.audioBytes)throw new Error('limit');chunks.push(value);}}catch{size=0;}await settle();};
  const body=new ReadableStream<Uint8Array>({
    async pull(controller){
      try{
        const {done,value}=await reader.read();
        if(done){await settle();controller.close();return;}
        size+=value.length;
        if(size>voiceLimits.audioBytes)throw new VoiceError('audio_limit',502,'Áudio acima do limite de armazenamento.');
        chunks.push(value);
        if(!clientGone)controller.enqueue(value);
      }catch(error){await reader.cancel().catch(()=>{});size=0;await settle();controller.error(error);}
    },
    cancel(){clientGone=true;void drain();},
  });
  return new Response(body,{headers:{'Content-Type':voiceFormats[input.output_format].mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Generation-Id':r.id}});
}

export async function downloadVoice(auth:VoiceAuth,id:string) {
  const r=await voiceGeneration(auth,id);
  if(r.status!=='completed'||!r.object_path)throw new VoiceError('audio_not_ready',409,'O áudio ainda não está disponível.',r.id);
  const {data,error}=await auth.client.storage.from(voiceBucket).download(r.object_path);
  if(error)throw new VoiceError('audio_unavailable',503,'Não foi possível recuperar o áudio.',r.id);
  const {mime,ext}=voiceFormats[formatOf(r)];
  return new Response(data,{headers:{'Content-Type':mime,'Content-Disposition':`inline; filename="voz-${r.id}.${ext}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}

export async function downloadVoiceAlignment(auth:VoiceAuth,id:string) {
  const r=await voiceGeneration(auth,id);
  if(r.status!=='completed'||!r.alignment_path)throw new VoiceError('alignment_unavailable',404,'Esta geração não tem marcação de tempo. Use with_timestamps: true.',r.id);
  const {data,error}=await auth.client.storage.from(voiceBucket).download(r.alignment_path);
  if(error)throw new VoiceError('alignment_unavailable',503,'Não foi possível recuperar a marcação de tempo.',r.id);
  return new Response(data,{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
