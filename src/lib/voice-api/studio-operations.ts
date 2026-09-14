import {resolveStudioDictionaries} from './studio-dictionaries';
import 'server-only';
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {inngest} from '@/lib/inngest/client';
import {calculateMeteredUsageCharge,type MeteredRate,type MeteredUsageUnits} from '@/lib/billing/metered-usage';
import {loadElevenLabsCredentials} from '@/lib/elevenlabs/credentials';
import {loadGeminiCredentials} from '@/lib/gemini/credentials';
import {voiceHash,voiceAccess,type VoiceAuth,type VoiceProject} from './auth';
import {VoiceError,voiceIdempotency,voiceBody} from './contract';
import {voiceCatalog} from './catalog';
import {ownedStudioAsset,studioAssetTicket} from './assets';
import {parseStudioInput,studioInputUnits,studioCreditCeiling,type StudioInput} from './studio-contract';
import {studioPrice} from './studio-pricing';
import {requestStudioAudio,readStudioAudioResult,type StudioAudioRequest} from './audio-provider';
import {requestStudioResource,studioDubReadUrl,type StudioResourceRequest} from './studio-resource-provider';
import {requestStudioGemini,readStudioGeminiResult,studioGeminiRequest} from './studio-gemini-provider';
import type {VoiceRow} from './generations';
import {studioSubtitles} from './studio-subtitles';

export const studioBucket='connectyhub-studio';
type Operation={id:string;operation:StudioInput['operation'];model_id:string;provider:'gemini'|'elevenlabs';feature_code:string;input:StudioInput;reserved_units:MeteredUsageUnits;actual_units:MeteredUsageUnits|null;provider_receipt:string|null;result_mime:string|null;result_manifest:SavedResult|null;result_state?:string;storage_reserved_bytes:number;storage_reserved_files:number};
type Receipt=VoiceRow&{rate_snapshot:MeteredRate[];key_id:string|null};
type Resource={id:string;project_id:string;organization_id:string;operation_id:string;kind:string;provider_id:string;provider_version:string|null;name:string;object_path:string|null;metadata:Record<string,unknown>;status:string};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const providerId=(v:unknown)=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{1,150}$/.test(v))throw new VoiceError('provider_result_invalid',502,'Identificador de resultado inválido.');return v;};
async function rpc(client:SupabaseClient,name:string,args:Record<string,unknown>):Promise<Receipt>{
 const {data,error}=await client.rpc(name,args);if(error){const code=error.message.match(/voice_[a-z_]+/)?.[0]??'service_unavailable';throw new VoiceError(code,code.includes('insufficient')?402:code.includes('limit')?429:code.includes('conflict')?409:503,'Não foi possível concluir a operação do Estúdio.');}return data as Receipt;
}
export async function ownedStudioOperation(auth:VoiceAuth,id:string){
 if(!uuid.test(id))throw new VoiceError('not_found',404,'Operação não encontrada.');
 const {data:r,error}=await auth.client.from('voice_generations').select('*').eq('id',id).eq('project_id',auth.project.id).eq('organization_id',auth.project.organization_id).eq('operation','studio').maybeSingle<Receipt>();
 if(error)throw new VoiceError('service_unavailable',503,'Não foi possível consultar a operação.');if(!r)throw new VoiceError('not_found',404,'Operação não encontrada.');
 const {data:s,error:se}=await auth.client.from('studio_operations').select('*').eq('id',id).single<Operation>();
 if(se||!s)throw new VoiceError('service_unavailable',503,'Registro da operação indisponível.');return {r,s};
}
export function publicStudioOperation(r:Receipt,s:Operation){return {id:r.id,project_id:r.project_id,billing_organization_id:r.billing_organization_id,operation:s.operation,model_id:r.model_id,status:r.status,usage:{credits:Number(r.charged_credits),reserved_credits:Number(r.reserved_credits),quoted_credits:Number(r.quoted_credits),units:s.actual_units},result:r.status==='completed'&&s.result_state!=='deleted'&&s.result_state!=='deleting'?{path:`/api/v1/voice/operations/${r.id}/result`,content_type:s.result_mime}:null,result_state:s.result_state??'available',error:r.error_code?{code:r.error_code}:null,created_at:r.created_at};}
export async function ownedStudioResource(auth:VoiceAuth,id:string,kind?:string){
 if(!uuid.test(id))throw new VoiceError('not_found',404,'Recurso não encontrado.');
 const {data,error}=await auth.client.from('studio_resources').select('*').eq('id',id).eq('project_id',auth.project.id).eq('organization_id',auth.project.organization_id).eq('status','ready').maybeSingle<Resource>();
 if(error)throw new VoiceError('service_unavailable',503,'Não foi possível consultar o recurso.');
 if(!data||kind&&data.kind!==kind)throw new VoiceError('not_found',404,'Recurso não encontrado.');
 const {r}=await ownedStudioOperation(auth,data.operation_id);if(r.status!=='completed')throw new VoiceError('resource_pending',409,'Recurso ainda em processamento.');return data;
}
async function validateResources(auth:VoiceAuth,input:StudioInput){
 let duration:number|undefined;
 if(input.asset_id){const a=await ownedStudioAsset(auth,input.asset_id);if(a.status!=='ready'||a.duration_seconds===null)throw new VoiceError('asset_pending',409,'Espere o áudio terminar de processar.');duration=Number(a.duration_seconds);}
 if(input.operation==='gemini_tts')studioGeminiRequest({text:input.text!,voiceId:input.voice_id!,modelId:input.model_id});
 else if(input.voice_id||input.turns){const voices=(await voiceCatalog(auth)).voices;for(const id of input.turns?.map(t=>t.voice_id)??[input.voice_id!])if(!voices.some(v=>v.voice_id===id&&v.status==='ready'))throw new VoiceError('voice_unavailable',404,'Voz não disponível neste projeto.');}
 if(input.preview_id)await ownedStudioResource(auth,input.preview_id,'voice_preview');
 if(input.parent_dictionary_id)await ownedStudioResource(auth,input.parent_dictionary_id,'dictionary');
 await resolveStudioDictionaries(auth,input.dictionary_ids??[]);
 return duration;
}
export async function createStudioOperation(auth:VoiceAuth,request:Request,raw:unknown){
 const input=parseStudioInput(raw),idempotency=voiceIdempotency(request),hash=voiceHash(JSON.stringify(input));
 const {data:old,error}=await auth.client.from('voice_generations').select('id,input_hash,operation').eq('project_id',auth.project.id).eq('idempotency_key',idempotency).maybeSingle();
 if(error)throw new VoiceError('service_unavailable',503,'Não foi possível conferir a solicitação.');
 if(old){if(old.input_hash!==hash||old.operation!=='studio')throw new VoiceError('idempotency_conflict',409,'Chave já utilizada com outro conteúdo.');const existing=await ownedStudioOperation(auth,old.id);return {...publicStudioOperation(existing.r,existing.s),replayed:true};}
 if(process.env.STUDIO_OPERATIONS_ENABLED!=='true')throw new VoiceError('capability_unavailable',422,'Operações do Estúdio ainda indisponíveis.');
 const duration=await validateResources(auth,input),units=studioInputUnits(input,duration),{rates,price}=await studioPrice(auth,input,units);
 studioCreditCeiling(request,price.chargeCredits);
 const jsonOnly=['transcription','forced_alignment','dictionary_create','voice_design_save'].includes(input.operation);
 const r=await rpc(auth.client,'reserve_studio_operation',{p_project:auth.project.id,p_key:auth.keyId,p_idempotency:idempotency,p_hash:hash,p_operation:input.operation,p_model:input.model_id,p_voice:input.voice_id??'studio',p_characters:Math.max(1,input.text?.length??input.sample_text?.length??input.turns?.reduce((n,t)=>n+t.text.length,0)??1),p_charge:price.chargeCredits,p_cost:price.providerCost,p_rates:rates,p_input:input,p_units:units,p_storage_bytes:jsonOnly?4_000_000:20_000_000,p_storage_files:input.operation==='voice_design'?4:1});
 // A lost queue acknowledgment is safe: the sweeper finds this reserved receipt.
 await inngest.send({name:'connectyhub/studio.operation',data:{operationId:r.id}}).catch(()=>{});
 const current=await ownedStudioOperation(auth,r.id);return {...publicStudioOperation(current.r,current.s),replayed:!r.claimed};
}
export async function quoteStudioOperation(auth:VoiceAuth,raw:unknown){
 if(process.env.STUDIO_OPERATIONS_ENABLED!=='true')throw new VoiceError('capability_unavailable',422,'Operações do Estúdio ainda indisponíveis.');
 const input=parseStudioInput(raw),duration=await validateResources(auth,input),units=studioInputUnits(input,duration),{price}=await studioPrice(auth,input,units);
 return {operation:input.operation,model_id:input.model_id,credits:price.chargeCredits,units,reservation_only:input.operation==='gemini_tts',duration_seconds:duration??null};
}
export async function listStudioOperations(auth:VoiceAuth){
 if(process.env.STUDIO_OPERATIONS_ENABLED!=='true')return {operations:[],limit:50};
 const {data,error}=await auth.client.from('voice_generations').select('id').eq('project_id',auth.project.id).eq('organization_id',auth.project.organization_id).eq('operation','studio').order('created_at',{ascending:false}).limit(50);
 if(error)throw new VoiceError('service_unavailable',503,'Histórico indisponível.');
 const operations=[];for(const item of data??[]){const {r,s}=await ownedStudioOperation(auth,item.id);operations.push(publicStudioOperation(r,s));}return {operations,limit:50};
}
const prefix=(r:Receipt)=>`${r.organization_id}/${r.project_id}/${r.id}`;
async function put(client:SupabaseClient,path:string,bytes:Buffer,mime:string){
 const result=await client.storage.from(studioBucket).upload(path,bytes,{contentType:mime,upsert:false});
 if(result.error){const old=await client.storage.from(studioBucket).download(path);if(old.error||old.data.size!==bytes.length||createHash('sha256').update(Buffer.from(await old.data.arrayBuffer())).digest('hex')!==createHash('sha256').update(bytes).digest('hex'))throw new VoiceError('storage_pending',503,'Resultado aguardando recuperação.');}
}
type Output={bytes:Buffer;mime:string;units:MeteredUsageUnits|null;extraBytes?:number;extraFiles?:number};
type SavedResult={mime:string;bytes:number;main_bytes:number;sha256:string;files:number;units:MeteredUsageUnits|null};
async function settleStored(auth:VoiceAuth,r:Receipt,s:Operation,result:SavedResult){
 const updated=await auth.client.from('voice_generations').update({object_path:`${prefix(r)}/result`,bytes_size:result.bytes}).eq('id',r.id).in('status',['processing','uncertain']);
 const op=await auth.client.from('studio_operations').update({result_mime:result.mime,result_file_count:result.files}).eq('id',r.id);
 if(updated.error||op.error)throw new VoiceError('storage_pending',503,'Resultado aguardando confirmação.');
 if(!result.units)return rpc(auth.client,'finish_studio_operation',{p_id:r.id,p_status:'uncertain',p_error:'provider_usage_missing'});
 const price=calculateMeteredUsageCharge({rates:r.rate_snapshot,units:result.units});
 return rpc(auth.client,'finish_studio_operation',{p_id:r.id,p_status:'completed',p_charge:price.chargeCredits,p_cost:price.providerCost,p_units:result.units});
}
async function persist(auth:VoiceAuth,r:Receipt,s:Operation,output:Output){
 const bytes=output.bytes.length+(output.extraBytes??0),files=1+(output.extraFiles??0);
 if(bytes>s.storage_reserved_bytes||files>s.storage_reserved_files)throw new VoiceError('result_limit',502,'Resultado acima do limite.');
 const receipt:SavedResult={mime:output.mime,bytes,main_bytes:output.bytes.length,sha256:createHash('sha256').update(output.bytes).digest('hex'),files,units:output.units};
 // Persist metering before the object. Recovery requires the actual object with
 // matching size/hash; a manifest alone can never authorize a customer debit.
 const saved=await auth.client.from('studio_operations').update({result_manifest:receipt}).eq('id',r.id);
 if(saved.error)throw new VoiceError('storage_pending',503,'Medição aguardando confirmação.');
 await put(auth.client,`${prefix(r)}/result`,output.bytes,output.mime);
 return settleStored(auth,r,s,receipt);
}
async function recoverStored(auth:VoiceAuth,r:Receipt,s:Operation){
 const receipt=s.result_manifest;if(!receipt)return null;
 if(!['audio/mpeg','audio/wav','application/json','text/plain'].includes(receipt.mime)||!Number.isSafeInteger(receipt.bytes)||receipt.bytes<1||receipt.bytes>s.storage_reserved_bytes||!Number.isSafeInteger(receipt.files)||receipt.files<1||receipt.files>s.storage_reserved_files)throw new VoiceError('result_invalid',503,'Recibo de resultado inválido.');
 const saved=await auth.client.storage.from(studioBucket).download(`${prefix(r)}/result`);if(saved.error)return null;
 if(saved.data.size!==receipt.main_bytes||createHash('sha256').update(Buffer.from(await saved.data.arrayBuffer())).digest('hex')!==receipt.sha256)throw new VoiceError('result_invalid',503,'Integridade do resultado inválida.');
 if(receipt.files>1){
  const extras=await auth.client.from('studio_resources').select('object_path,metadata').eq('operation_id',r.id).eq('project_id',r.project_id).eq('kind','voice_preview');
  if(extras.error||extras.data.length!==receipt.files-1)return null;let total=saved.data.size;
  for(const resource of extras.data){const file=await auth.client.storage.from(studioBucket).download(resource.object_path);if(file.error||createHash('sha256').update(Buffer.from(await file.data.arrayBuffer())).digest('hex')!==resource.metadata.sha256)return null;total+=file.data.size;}
  if(total!==receipt.bytes)return null;
 }
 return settleStored(auth,r,s,receipt);
}
async function fetchInput(auth:VoiceAuth,input:StudioInput){
 const a=await ownedStudioAsset(auth,input.asset_id!),ticket=await studioAssetTicket(auth,a.id,'download');
 const response=await fetch(ticket.url,{headers:{Authorization:`Bearer ${ticket.access_key}`},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(60000)});
 if(!response.ok){await response.body?.cancel();throw new VoiceError('asset_unavailable',503,'Áudio de entrada indisponível.');}
 const bytes=Buffer.from(await voiceBody(response,20_000_000));
 if(bytes.length!==a.size_bytes||createHash('sha256').update(bytes).digest('hex')!==a.sha256)throw new VoiceError('asset_integrity',503,'O áudio não passou na verificação de integridade.');
 return new Blob([bytes],{type:a.mime_type});
}
async function saveResource(auth:VoiceAuth,r:Receipt,values:Partial<Resource>){
 const {data,error}=await auth.client.from('studio_resources').upsert({project_id:r.project_id,organization_id:r.organization_id,operation_id:r.id,...values},{onConflict:'operation_id,provider_id',ignoreDuplicates:true}).select('*').maybeSingle<Resource>();
 if(error)throw new VoiceError('resource_pending',503,'Recurso aguardando confirmação.');
 if(data)return data;
 const old=await auth.client.from('studio_resources').select('*').eq('operation_id',r.id).eq('provider_id',values.provider_id!).single<Resource>();
 if(old.error)throw new VoiceError('resource_pending',503,'Recurso aguardando confirmação.');return old.data;
}
async function checkResponse(response:Response){
 if(response.ok)return;
 const definitive=[400,401,403,404,422,429].includes(response.status);await response.body?.cancel();
 throw new VoiceError(definitive?'provider_rejected':'provider_uncertain',502,'O serviço não concluiu a operação.');
}
async function resourceOutput(auth:VoiceAuth,r:Receipt,s:Operation,response:Response):Promise<Output>{
 const input=s.input;
 if(input.operation==='dialogue'){const result=await readStudioAudioResult(response,true);return {bytes:result.bytes,mime:result.contentType,units:s.reserved_units};}
 const raw=JSON.parse(new TextDecoder().decode(await voiceBody(response,input.operation==='voice_design'?28_000_000:4_000_000)));
 if(input.operation==='dictionary_create'){
  const resource=await saveResource(auth,r,{kind:'dictionary',name:input.name!,provider_id:providerId(raw.id),provider_version:providerId(raw.version_id),metadata:{rules:input.rules,parent_dictionary_id:input.parent_dictionary_id??null}});
  return {bytes:Buffer.from(JSON.stringify({id:resource.id,name:resource.name,rules:input.rules})),mime:'application/json',units:s.reserved_units};
 }
 if(input.operation==='voice_design_save'){
  const resource=await saveResource(auth,r,{kind:'voice',name:input.name!,provider_id:providerId(raw.voice_id),metadata:{description:input.description,preview_id:input.preview_id}});
  return {bytes:Buffer.from(JSON.stringify({id:resource.id,name:resource.name,voice_id:resource.provider_id})),mime:'application/json',units:s.reserved_units};
 }
 if(input.operation==='voice_design'){
  if(!Array.isArray(raw.previews)||raw.previews.length<1||raw.previews.length>3)throw new VoiceError('provider_result_invalid',502,'Prévias indisponíveis.');
  let extraBytes=0;const previews=[];
  for(let index=0;index<raw.previews.length;index++){
   const item=raw.previews[index],encoded=item.audio_base_64;
   if(typeof encoded!=='string'||encoded.length>10_000_000||encoded.length%4||!/^[a-zA-Z0-9+/]*={0,2}$/.test(encoded))throw new VoiceError('provider_result_invalid',502,'Prévia inválida.');
   const bytes=Buffer.from(encoded,'base64');if(!bytes.length||bytes.toString('base64')!==encoded)throw new VoiceError('provider_result_invalid',502,'Prévia inválida.');
   extraBytes+=bytes.length;if(extraBytes>19_900_000)throw new VoiceError('result_limit',502,'Prévias acima do limite.');
   const path=`${prefix(r)}/preview-${index}.mp3`;await put(auth.client,path,bytes,'audio/mpeg');
   const resource=await saveResource(auth,r,{kind:'voice_preview',name:`Prévia ${index+1}`,provider_id:providerId(item.generated_voice_id),object_path:path,metadata:{description:input.description,sha256:createHash('sha256').update(bytes).digest('hex')}});
   previews.push({id:resource.id,name:resource.name,path:`/api/v1/voice/resources/${resource.id}/audio`});
  }
  return {bytes:Buffer.from(JSON.stringify({previews})),mime:'application/json',units:s.reserved_units,extraBytes,extraFiles:previews.length};
 }
 throw new VoiceError('provider_result_invalid',502,'Resultado inesperado.');
}
async function pollDub(auth:VoiceAuth,r:Receipt,s:Operation,apiKey:string){
 const response=await fetch(studioDubReadUrl(s.provider_receipt!),{headers:{'xi-api-key':apiKey},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
 await checkResponse(response);const info=JSON.parse(new TextDecoder().decode(await voiceBody(response,100000)));
 if(['failed','error'].includes(info.status))return rpc(auth.client,'finish_studio_operation',{p_id:r.id,p_status:'failed',p_error:'provider_dubbing_failed'});
 if(info.status!=='dubbed')return null;
 const audio=await fetch(studioDubReadUrl(s.provider_receipt!,s.input.target_language),{headers:{'xi-api-key':apiKey},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(60000)});
 await checkResponse(audio);const output=await readStudioAudioResult(audio,true);
 return persist(auth,r,s,{bytes:output.bytes,mime:output.contentType,units:s.reserved_units});
}
export async function runStudioOperation(client:SupabaseClient,id:string){
 if(process.env.STUDIO_OPERATIONS_ENABLED!=='true'||!uuid.test(id))return {status:'disabled'};
 const loaded=await client.from('voice_generations').select('*').eq('id',id).eq('operation','studio').maybeSingle<Receipt>();
 if(loaded.error)throw new Error('Studio receipt unavailable');if(!loaded.data)return {status:'not_found'};
 const r=loaded.data;if(['completed','failed'].includes(r.status))return {status:r.status};
 const project=await client.from('voice_projects').select('*').eq('id',r.project_id).single<VoiceProject>();
 if(project.error)throw new Error('Studio project unavailable');
 let auth:VoiceAuth={client,project:project.data,keyId:r.key_id,planCode:null,billingOrg:r.billing_organization_id,studio:false};
 if(r.status==='reserved'){
  try{auth=await voiceAccess(client,project.data,r.key_id);}catch{const stopped=await rpc(client,'fail_reserved_studio_operation',{p_id:id,p_error:'access_inactive'});return {status:stopped.status};}
 }
 const {s}=await ownedStudioOperation(auth,id);
 if(r.status!=='reserved'){
  const recovered=await recoverStored(auth,r,s);if(recovered)return {status:recovered.status};
  if(s.operation==='dubbing'&&s.provider_receipt){const {apiKey}=await loadElevenLabsCredentials(client);const polled=await pollDub(auth,r,s,apiKey);return {status:polled?.status??'processing'};}
  return {status:r.status};
 }
 let dispatched=false,claimed=false;
 try{
  // Claim before preparing inputs: duplicate events cannot invalidate a receipt
  // currently owned by another worker or rotate its download ticket.
  await rpc(client,'start_voice_generation',{p_id:id});claimed=true;
  await validateResources(auth,s.input);
  const current=await studioPrice(auth,s.input,s.reserved_units);
  if(JSON.stringify(current.rates)!==JSON.stringify(r.rate_snapshot))throw new VoiceError('pricing_changed',409,'Tarifa alterada antes do processamento.');
  const audio=s.input.asset_id?await fetchInput(auth,s.input):undefined;
  const apiKey=s.provider==='gemini'?(await loadGeminiCredentials(client)).apiKey:(await loadElevenLabsCredentials(client)).apiKey;
  // Exactly one process may advance reserved -> processing. A duplicate event
  // cannot repeat the provider POST, even if Inngest retries its HTTP handler.
  const input=s.input;
  if(input.operation==='gemini_tts'){
   dispatched=true;const response=await requestStudioGemini(apiKey,{text:input.text!,voiceId:input.voice_id!,modelId:input.model_id});await checkResponse(response);
   const result=await readStudioGeminiResult(response);const final=await persist(auth,r,s,{bytes:result.bytes,mime:result.contentType,units:result.usage});return {status:final.status};
  }
  if(['transcription','audio_isolation','voice_change','forced_alignment'].includes(input.operation)){
   const request={operation:input.operation,audio:audio!,language:input.language,diarize:input.diarize??false,voiceId:input.voice_id,text:input.text} as StudioAudioRequest;
   dispatched=true;const response=await requestStudioAudio(apiKey,request);await checkResponse(response);
   const result=await readStudioAudioResult(response,['audio_isolation','voice_change'].includes(input.operation));
   const final=await persist(auth,r,s,{bytes:result.bytes,mime:result.contentType,units:s.reserved_units});return {status:final.status};
  }
  let request:StudioResourceRequest;
  if(input.operation==='dialogue')request={operation:'dialogue',turns:input.turns!.map(t=>({text:t.text,voiceId:t.voice_id})),dictionaries:await resolveStudioDictionaries(auth,input.dictionary_ids??[])};
  else if(input.operation==='voice_design')request={operation:'voice_design',description:input.description!,sampleText:input.sample_text!};
  else if(input.operation==='voice_design_save')request={operation:'voice_design_save',name:input.name!,description:input.description!,previewId:(await ownedStudioResource(auth,input.preview_id!,'voice_preview')).provider_id};
  else if(input.operation==='dictionary_create')request={operation:'dictionary_create',name:input.name!,rules:input.rules!.map(rule=>rule.type==='alias'?{type:'alias',stringToReplace:rule.string_to_replace,alias:rule.alias}:{type:'phoneme',stringToReplace:rule.string_to_replace,phoneme:rule.phoneme,alphabet:rule.alphabet})};
  else request={operation:'dubbing',audio:audio!,targetLanguage:input.target_language!};
  dispatched=true;const response=await requestStudioResource(apiKey,request);await checkResponse(response);
  if(input.operation==='dubbing'){
   const result=JSON.parse(new TextDecoder().decode(await voiceBody(response,100000))),dub=providerId(result.dubbing_id);
   const saved=await client.from('studio_operations').update({provider_receipt:dub}).eq('id',id);if(saved.error)throw new VoiceError('resource_pending',503,'Dublagem aguardando confirmação.');
   return {status:'processing'};
  }
  return {status:(await persist(auth,r,s,await resourceOutput(auth,r,s,response))).status};
 }catch(error){
  // Losing the claim is not permission to fail another worker's live receipt.
  if(error instanceof VoiceError&&error.code==='voice_dispatch_state')return {status:'already_claimed'};
  const code=error instanceof VoiceError?error.code:'processing_failed';
  if(claimed)await rpc(client,'finish_studio_operation',{p_id:id,p_status:!dispatched||code==='provider_rejected'?'failed':'uncertain',p_error:code});
  else {const stopped=await rpc(client,'fail_reserved_studio_operation',{p_id:id,p_error:code});return {status:stopped.status,error:code};}
  return {status:dispatched&&code!=='provider_rejected'?'uncertain':'failed',error:code};
 }
}
export async function sweepStudioOperations(client:SupabaseClient){
 if(process.env.STUDIO_OPERATIONS_ENABLED!=='true')return {processed:0};
 const {data,error}=await client.from('voice_generations').select('id').eq('operation','studio').in('status',['reserved','processing','uncertain']).lt('updated_at',new Date(Date.now()-300000).toISOString()).order('updated_at').limit(8);
 if(error)throw new Error('Studio queue unavailable');const results=[];
 for(const r of data??[]){
  // Rotate attempted receipts so one unrecoverable batch cannot starve newer work.
  const touched=await client.from('voice_generations').update({updated_at:new Date().toISOString()}).eq('id',r.id).in('status',['reserved','processing','uncertain']);
  if(touched.error){results.push({id:r.id,status:'reconciliation_pending'});continue;}
  try{results.push({id:r.id,...await runStudioOperation(client,r.id)});}catch{results.push({id:r.id,status:'reconciliation_pending'});}
 }
 return {processed:results.length,results};
}
export async function downloadStudioResult(auth:VoiceAuth,id:string,format?:string|null){
 const {r,s}=await ownedStudioOperation(auth,id);if(r.status!=='completed'||!r.object_path||s.result_state==='deleted'||s.result_state==='deleting')throw new VoiceError('result_pending',409,'Resultado ainda indisponível.');
 const result=await auth.client.storage.from(studioBucket).download(r.object_path);if(result.error)throw new VoiceError('result_unavailable',503,'Resultado indisponível.');
 if(format){
  if(!['srt','vtt'].includes(format)||!['transcription','forced_alignment'].includes(s.operation))throw new VoiceError('invalid_format',422,'Formato não disponível para esta operação.');
  const content=studioSubtitles(JSON.parse(await result.data.text()),format as 'srt'|'vtt');
  return new Response(content,{headers:{'Content-Type':format==='vtt'?'text/vtt; charset=utf-8':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="legendas.${format}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 return new Response(result.data,{headers:{'Content-Type':s.result_mime??'application/octet-stream','Content-Disposition':'attachment; filename="resultado"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
export async function downloadStudioPreview(auth:VoiceAuth,id:string){
 const resource=await ownedStudioResource(auth,id,'voice_preview');if(!resource.object_path)throw new VoiceError('not_found',404,'Prévia não encontrada.');
 const result=await auth.client.storage.from(studioBucket).download(resource.object_path);if(result.error)throw new VoiceError('result_unavailable',503,'Prévia indisponível.');
 return new Response(result.data,{headers:{'Content-Type':'audio/mpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
export async function deleteStudioResult(auth:VoiceAuth,id:string){
 const {r}=await ownedStudioOperation(auth,id);
 const prepared=await auth.client.rpc('prepare_studio_result_delete',{p_id:id});
 if(prepared.error)throw new VoiceError('result_in_use',409,'Aguarde a conclusão das operações que usam este resultado.');
 const data=prepared.data as {state:string;paths:string[]};
 if(data.state==='deleted')return {id,result_state:'deleted'};
 if(!Array.isArray(data.paths)||data.paths.length>4||data.paths.some(path=>typeof path!=='string'||!path.startsWith(`${prefix(r)}/`)||path.includes('..')))
  throw new VoiceError('result_invalid',503,'A exclusão precisa de conferência.');
 // Storage removal is idempotent. A timeout keeps capacity reserved and the
 // same DELETE can safely finish without affecting billing or regenerating.
 if(data.paths.length){const removed=await auth.client.storage.from(studioBucket).remove(data.paths);if(removed.error)throw new VoiceError('delete_pending',503,'Exclusão ainda pendente. Tente novamente com o mesmo resultado.');}
 const finished=await auth.client.rpc('finish_studio_result_delete',{p_id:id});
 if(finished.error)throw new VoiceError('delete_pending',503,'Arquivos removidos; liberação da capacidade ainda pendente. Repita a exclusão.');
 return {id,result_state:'deleted'};
}
