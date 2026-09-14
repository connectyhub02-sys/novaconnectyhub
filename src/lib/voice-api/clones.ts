import 'server-only';
import {randomUUID} from 'node:crypto';
import {type VoiceAuth,voiceHash} from './auth';
import {VoiceError,voiceIdempotency,voiceBody} from './contract';
import {loadElevenLabsCredentials} from '@/lib/elevenlabs/credentials';
import {quoteClone} from './catalog';
import {boundedVoiceAudio} from './provider';
import {voiceRpc,publicVoiceGeneration,voiceGeneration,recoverVoice,generateVoice} from './generations';
const consentText='Confirmo que tenho direito e consentimento para clonar esta voz na ConnectyHub.';
type Clone={id:string;project_id:string;organization_id:string;provider_voice_id:string|null;name:string;status:string;generation_id:string;input_hash:string;error_code:string|null};
export function publicClone(c:Clone){return {id:c.id,voice_id:c.provider_voice_id,project_id:c.project_id,generation_id:c.generation_id,name:c.name,status:c.status,kind:'private',error:c.error_code?{code:c.error_code}:null};}
export async function ownedClone(auth:VoiceAuth,id:string){
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new VoiceError('not_found',404,'Voz não encontrada.');
 const q=auth.client.from('voice_clones').select('*').eq('organization_id',auth.project.organization_id).eq('project_id',auth.project.id).neq('status','deleted');
 const {data,error}=await (/^[a-f0-9-]{36}$/i.test(id)?q.eq('id',id):q.eq('provider_voice_id',id)).maybeSingle<Clone>();
 if(error)throw new VoiceError('service_unavailable',503,'Não foi possível conferir a voz.');
 if(!data)throw new VoiceError('not_found',404,'Voz não encontrada neste projeto.');
 return data;
}
export async function createPrivateClone(auth:VoiceAuth,request:Request){
 const idempotency=voiceIdempotency(request);
 const body=await voiceBody(request,3500000);
 const form=await new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')??''},body}).formData();
 if([...form.keys()].some(k=>!['name','consent_accepted','remove_background_noise','files'].includes(k)))throw new VoiceError('unsupported_parameter',422,'Parâmetro não suportado na clonagem.');
 const name=String(form.get('name')??'').replace(/\s+/g,' ').trim();
 if(name.length<2||name.length>80)throw new VoiceError('invalid_name',422,'Nome da voz: 2 a 80 caracteres.');
 if(form.get('consent_accepted')!=='true')throw new VoiceError('consent_required',422,consentText);
 const noise=form.get('remove_background_noise')==='true';
 const files=form.getAll('files');
 if(files.length<1||files.length>5||files.some(f=>typeof f==='string'||!f.size||(!f.type.startsWith('audio/') && f.type!=='video/mp4')))throw new VoiceError('invalid_samples',422,'Envie de 1 a 5 amostras de áudio.');
 const samples=files as File[];if(samples.reduce((n,f)=>n+f.size,0)>3*1024*1024)throw new VoiceError('samples_limit',413,'As amostras devem somar até 3 MB.');
 const fingerprints=[];for(const f of samples)fingerprints.push({type:f.type,hash:voiceHash(Buffer.from(await f.arrayBuffer()).toString('base64'))});
 const hash=voiceHash(JSON.stringify({name,noise,consentText,files:fingerprints}));
 const existing=await auth.client.from('voice_clones').select('*').eq('project_id',auth.project.id).eq('idempotency_key',idempotency).maybeSingle<Clone>();
 if(existing.error)throw new VoiceError('service_unavailable',503,'Não foi possível conferir a solicitação.');
 if(existing.data){if(existing.data.input_hash!==hash)throw new VoiceError('idempotency_conflict',409,'A chave já foi usada com outro clone.');const receipt=await recoverVoice(auth,await voiceGeneration(auth,existing.data.generation_id));return {clone:publicClone(existing.data),generation:publicVoiceGeneration(receipt,true),billing_organization_id:auth.billingOrg,replayed:true};}
 const {rates,price}=await quoteClone(auth);
 const credentials=await loadElevenLabsCredentials(auth.client);
 const id=randomUUID();
 const r=await voiceRpc(auth,'reserve_voice_generation',{p_project:auth.project.id,p_key:auth.keyId,p_idempotency:`clone:${voiceHash(idempotency)}`,p_hash:hash,p_voice:id,p_model:'instant_voice_clone',p_characters:1,p_charge:price.chargeCredits,p_cost:price.providerCost,p_rates:rates,p_operation:'voice_clone'});
 if(!r.claimed)return {generation:publicVoiceGeneration(r,true),replayed:true};
 let dispatched=false;
 try {
  const inserted=await auth.client.from('voice_clones').insert({id,project_id:auth.project.id,organization_id:auth.project.organization_id,name,status:'creating',consent_text:consentText,idempotency_key:idempotency,input_hash:hash,generation_id:r.id});
  if(inserted.error)throw new VoiceError('clone_save_pending',503,'Não foi possível preparar o clone.',r.id);
  await voiceRpc(auth,'start_voice_generation',{p_id:r.id});
  const payload=new FormData();payload.set('name',name);payload.set('remove_background_noise',String(noise));payload.set('description','Clone privado autorizado ConnectyHub.');payload.set('labels',JSON.stringify({source:'connectyhub',consent:'accepted',visibility:'project_only'}));
  samples.forEach((f,i)=>payload.append('files',f,`sample-${i+1}.${f.type==='audio/wav'?'wav':f.type==='audio/mpeg'?'mp3':'audio'}`));
  dispatched=true;
  const response=await fetch('https://api.elevenlabs.io/v1/voices/add',{method:'POST',headers:{'xi-api-key':credentials.apiKey},body:payload,signal:AbortSignal.timeout(90000),redirect:'error'});
  if(!response.ok){const definitive=[400,401,403,404,422,429].includes(response.status);await response.body?.cancel();if(definitive)dispatched=false;throw new VoiceError('clone_provider_rejected',502,'O provedor não concluiu a clonagem.',r.id);}
  const result=await response.json();
  if(typeof result.voice_id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(result.voice_id))throw new VoiceError('clone_result_uncertain',503,'Resultado de clonagem incerto.',r.id);
  const {data:saved,error}=await auth.client.from('voice_clones').update({provider_voice_id:result.voice_id,status:result.requires_verification?'verification_required':'ready',updated_at:new Date().toISOString()}).eq('id',id).select('*').single<Clone>();
  if(error)throw new VoiceError('clone_save_pending',503,'Clone aguarda conciliação.',r.id);
  const renamed=await auth.client.from('voice_generations').update({voice_id:result.voice_id}).eq('id',r.id);if(renamed.error)throw new VoiceError('clone_save_pending',503,'Clone aguarda conciliação.',r.id);
  const receipt=await voiceRpc(auth,'finish_voice_generation',{p_id:r.id,p_status:'completed'});
  return {clone:publicClone(saved),generation:publicVoiceGeneration(receipt),billing_organization_id:auth.billingOrg,replayed:false};
 }catch(error){
  await auth.client.from('voice_clones').update({status:dispatched?'uncertain':'failed',error_code:error instanceof VoiceError?error.code:'clone_result_uncertain'}).eq('id',id).eq('status','creating');
  await voiceRpc(auth,'finish_voice_generation',{p_id:r.id,p_status:dispatched?'uncertain':'failed',p_error:error instanceof VoiceError?error.code:'clone_result_uncertain'}).catch(()=>{});
  if(error instanceof VoiceError)throw error;throw new VoiceError('clone_result_uncertain',503,'Consulte o clone antes de repetir. A mesma chave não cria outro clone.',r.id);
 }
}
async function cloneProvider(auth:VoiceAuth,c:Clone,suffix='',method='GET',body?:FormData){
 if(!c.provider_voice_id)throw new VoiceError('clone_not_ready',409,'Clone ainda não disponível.');
 const credentials=await loadElevenLabsCredentials(auth.client);
 return fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(c.provider_voice_id)}${suffix}`,{method,headers:{'xi-api-key':credentials.apiKey},body,signal:AbortSignal.timeout(30000),redirect:'error',cache:'no-store'});
}
export async function editPrivateClone(auth:VoiceAuth,id:string,request:Request){
 const c=await ownedClone(auth,id);if(!['ready','verification_required'].includes(c.status))throw new VoiceError('clone_not_ready',409,'Clone não pode ser editado neste estado.');
 const b=await request.json();if(Object.keys(b).some(k=>k!=='name'))throw new VoiceError('unsupported_parameter',422,'A edição aceita somente name.');
 const name=typeof b.name==='string'?b.name.trim():'';if(name.length<2||name.length>80)throw new VoiceError('invalid_name',422,'Nome: 2 a 80 caracteres.');
 const form=new FormData();form.set('name',name);const response=await cloneProvider(auth,c,'/edit','POST',form);
 if(!response.ok)throw new VoiceError('clone_edit_failed',502,'Não foi possível editar a voz.');
 const {data,error}=await auth.client.from('voice_clones').update({name,updated_at:new Date().toISOString()}).eq('id',c.id).select('*').single<Clone>();if(error)throw new VoiceError('clone_edit_pending',503,'A edição aguarda atualização.');return publicClone(data);
}
export async function deletePrivateClone(auth:VoiceAuth,id:string){
 const c=await ownedClone(auth,id);if(!['ready','verification_required','deleting'].includes(c.status))throw new VoiceError('clone_not_ready',409,'Clone não pode ser excluído neste estado.');
 const marked=await auth.client.from('voice_clones').update({status:'deleting'}).eq('id',c.id);if(marked.error)throw new VoiceError('service_unavailable',503,'Não foi possível preparar a exclusão.');
 const response=await cloneProvider(auth,c,'','DELETE');if(!response.ok&&response.status!==404)throw new VoiceError('clone_delete_pending',503,'Exclusão pendente. A voz já está indisponível para novas gerações.');
 const saved=await auth.client.from('voice_clones').update({status:'deleted',updated_at:new Date().toISOString()}).eq('id',c.id);if(saved.error)throw new VoiceError('clone_delete_pending',503,'Exclusão aguarda confirmação.');return {deleted:true};
}
export async function cloneSamples(auth:VoiceAuth,id:string,sampleId?:string){
 const c=await ownedClone(auth,id);if(!['ready','verification_required'].includes(c.status))throw new VoiceError('clone_not_ready',409,'Amostras indisponíveis.');
 if(sampleId){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(sampleId))throw new VoiceError('not_found',404,'Amostra não encontrada.');
  const response=await cloneProvider(auth,c,`/samples/${sampleId}/audio`);if(!response.ok)throw new VoiceError('sample_unavailable',404,'Amostra não encontrada.');
  return new Response(await boundedVoiceAudio(response),{headers:{'Content-Type':response.headers.get('content-type')??'audio/mpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 const response=await cloneProvider(auth,c);if(!response.ok)throw new VoiceError('samples_unavailable',503,'Não foi possível consultar as amostras.');
 const data=await response.json();return {samples:(Array.isArray(data.samples)?data.samples:[]).map((s:{sample_id:string;file_name:string;mime_type:string})=>({id:s.sample_id,name:s.file_name,content_type:s.mime_type}))};
}
export async function previewPrivateClone(auth:VoiceAuth,id:string,request:Request){
 const clone=await ownedClone(auth,id);if(clone.status!=='ready'||!clone.provider_voice_id)throw new VoiceError('clone_not_ready',409,'Clone ainda não disponível.');
 const headers=new Headers(request.headers);headers.set('idempotency-key',`preview:${clone.id}`);
 const previewRequest=new Request(request.url,{method:'POST',headers});
 return generateVoice(auth,previewRequest,{voice_id:clone.provider_voice_id,model_id:'eleven_multilingual_v2',text:'Olá! Esta é uma prévia da minha voz na ConnectyHub. Estou aqui para ajudar você.'},true);
}
