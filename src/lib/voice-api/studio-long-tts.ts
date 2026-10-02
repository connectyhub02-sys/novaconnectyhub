import 'server-only';
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {loadElevenLabsCredentials} from '@/lib/elevenlabs/credentials';
import {calculateMeteredUsageCharge} from '@/lib/billing/metered-usage';
import {voiceAccess,type VoiceAuth,type VoiceProject} from './auth';
import {VoiceError} from './contract';
import {resolveStudioDictionaries} from './studio-dictionaries';
import {studioPrice} from './studio-pricing';
import type {StudioInput} from './studio-contract';
import {ownedStudioOperation,prefix,put,rpc,settleStored,studioBucket,validateResources,type Receipt,type ResultPart,type SavedResult} from './studio-operations';

// Long texts (e-books): the full quote is reserved before any audio is produced.
// Each part is generated once, stored, and the e-book is charged once, at the end,
// for the characters actually converted. Parts carry the neighbouring text so the
// voice continues naturally across boundaries.
export const longTextFormat='mp3_44100_64';
const contextChars=300;
const maxPartBytes=20_000_000;

export function longTextPartLimit(modelId:string){return modelId==='eleven_v3'?2400:4000;}

/** Paragraphs first, then sentences, then words: never cuts a word. Deterministic. */
export function splitLongText(text:string,limit:number){
 const pieces:string[]=[];
 const pushSentence=(sentence:string)=>{
  if(sentence.length<=limit){pieces.push(sentence);return;}
  let rest=sentence;
  while(rest.length>limit){const cut=rest.lastIndexOf(' ',limit);const at=cut>limit/2?cut:limit;pieces.push(rest.slice(0,at).trim());rest=rest.slice(at).trim();}
  if(rest)pieces.push(rest);
 };
 for(const paragraph of text.split(/\n{2,}/).map(p=>p.trim()).filter(Boolean)){
  if(paragraph.length<=limit){pieces.push(paragraph);continue;}
  for(const sentence of paragraph.match(/[^.!?…]+[.!?…]+["'”»)]*\s*|[^.!?…]+$/g)??[paragraph])pushSentence(sentence.trim());
 }
 const parts:string[]=[];
 for(const piece of pieces){
  const last=parts.length-1;
  if(last>=0&&parts[last].length+2+piece.length<=limit)parts[last]=`${parts[last]}\n\n${piece}`;
  else parts.push(piece);
 }
 return parts;
}

export function longTextRequestBody(input:StudioInput,parts:string[],index:number,dictionaries:unknown[]=[]){
 const stitched=input.model_id!=='eleven_v3';
 return {
  text:parts[index],model_id:input.model_id,
  ...(input.voice_settings&&Object.keys(input.voice_settings).length?{voice_settings:input.voice_settings}:{}),
  ...(input.language_code?{language_code:input.language_code}:{}),
  ...(stitched&&index>0?{previous_text:parts[index-1].slice(-contextChars)}:{}),
  ...(stitched&&index<parts.length-1?{next_text:parts[index+1].slice(0,contextChars)}:{}),
  ...(dictionaries.length?{pronunciation_dictionary_locators:dictionaries}:{}),
 };
}

/**
 * Each provider response is a complete MP3 with its own ID3 tags. Only the first
 * part keeps the leading tag; later parts drop tags so the joined file has no
 * metadata in the middle of the audio stream.
 */
export function stripId3(bytes:Buffer,keepLeading:boolean){
 let start=0,end=bytes.length;
 if(!keepLeading&&bytes.length>=10&&bytes.toString('latin1',0,3)==='ID3'){
  const size=((bytes[6]&0x7f)<<21)|((bytes[7]&0x7f)<<14)|((bytes[8]&0x7f)<<7)|(bytes[9]&0x7f);
  start=Math.min(bytes.length,10+size+((bytes[5]&0x10)?10:0));
 }
 if(end-start>=128&&bytes.toString('latin1',end-128,end-125)==='TAG')end-=128;
 return bytes.subarray(start,end);
}
const partPath=(r:Receipt,index:number)=>`${prefix(r)}/parts/${String(index).padStart(4,'0')}.mp3`;
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

async function load(client:SupabaseClient,id:string){
 const loaded=await client.from('voice_generations').select('*').eq('id',id).eq('operation','studio').maybeSingle<Receipt>();
 if(loaded.error||!loaded.data)throw new Error('Long text receipt unavailable');
 const project=await client.from('voice_projects').select('*').eq('id',loaded.data.project_id).single<VoiceProject>();
 if(project.error)throw new Error('Long text project unavailable');
 const auth:VoiceAuth={client,project:project.data,keyId:loaded.data.key_id,planCode:null,billingOrg:loaded.data.billing_organization_id,studio:false};
 const {s}=await ownedStudioOperation(auth,id);
 if(s.operation!=='long_tts')throw new Error('Not a long text operation');
 return {r:loaded.data,s,auth};
}

async function stop(client:SupabaseClient,id:string,dispatched:boolean,code:string){
 // A started part may have been charged by the provider: keep the hold for reconciliation.
 await rpc(client,'finish_studio_operation',{p_id:id,p_status:dispatched?'uncertain':'failed',p_error:code}).catch(()=>{});
 return {status:dispatched?'uncertain':'failed',error:code};
}

/** Claims the reserved receipt (or resumes a processing one) and returns the part count. */
export async function prepareLongText(client:SupabaseClient,id:string){
 let {r,s,auth}=await load(client,id);
 if(['completed','failed'].includes(r.status))return {status:r.status,parts:0};
 if(r.status==='uncertain')return {status:'uncertain',parts:0};
 if(r.status==='reserved'){
  try{auth=await voiceAccess(client,auth.project,r.key_id);}catch{const stopped=await rpc(client,'fail_reserved_studio_operation',{p_id:id,p_error:'access_inactive'});return {status:stopped.status,parts:0};}
  try{
   await validateResources(auth,s.input);
   const current=await studioPrice(auth,s.input,s.reserved_units);
   if(JSON.stringify(current.rates)!==JSON.stringify(r.rate_snapshot))throw new VoiceError('pricing_changed',409,'Tarifa alterada antes do processamento.');
   await rpc(client,'start_voice_generation',{p_id:id});
  }catch(error){
   if(error instanceof VoiceError&&error.code==='voice_dispatch_state')return {status:'processing',parts:splitLongText(s.input.text!,longTextPartLimit(s.input.model_id)).length};
   const stopped=await rpc(client,'fail_reserved_studio_operation',{p_id:id,p_error:error instanceof VoiceError?error.code:'prepare_failed'}).catch(()=>null);
   return {status:stopped?.status??'failed',parts:0};
  }
  ({r,s}=await load(client,id));
 }
 return {status:'processing',parts:splitLongText(s.input.text!,longTextPartLimit(s.input.model_id)).length};
}

/** Idempotent: an existing stored part is reused, never generated again. */
export async function generateLongTextPart(client:SupabaseClient,id:string,index:number):Promise<ResultPart|{error:string;status:string}>{
 const {r,s,auth}=await load(client,id);
 if(r.status!=='processing')return {status:r.status,error:'not_processing'};
 const path=partPath(r,index);
 const existing=await client.storage.from(studioBucket).download(path);
 if(!existing.error){const bytes=Buffer.from(await existing.data.arrayBuffer());return {path,bytes:bytes.length,sha256:sha(bytes)};}
 const parts=splitLongText(s.input.text!,longTextPartLimit(s.input.model_id));
 if(index<0||index>=parts.length)return stop(client,id,true,'part_out_of_range');
 // Heartbeat: the recovery sweeper only requeues receipts idle for 5 minutes.
 await client.from('voice_generations').update({updated_at:new Date().toISOString()}).eq('id',id).eq('status','processing');
 try{
  const dictionaries=await resolveStudioDictionaries(auth,s.input.dictionary_ids??[]);
  const {apiKey}=await loadElevenLabsCredentials(client);
  const response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(s.input.voice_id!)}?output_format=${longTextFormat}`,{
   method:'POST',headers:{'xi-api-key':apiKey,'Content-Type':'application/json',Accept:'audio/mpeg'},
   body:JSON.stringify(longTextRequestBody(s.input,parts,index,dictionaries)),
   signal:AbortSignal.timeout(180_000),redirect:'error',cache:'no-store',
  });
  if(!response.ok){
   await response.body?.cancel();
   // A rejected first part was not produced; later parts mean earlier audio was charged.
   return stop(client,id,index>0||![400,401,403,404,422].includes(response.status),'provider_rejected');
  }
  const bytes=stripId3(Buffer.from(await response.arrayBuffer()),index===0);
  if(!bytes.length||bytes.length>maxPartBytes)return stop(client,id,true,'provider_audio_invalid');
  await put(client,path,bytes,'audio/mpeg');
  return {path,bytes:bytes.length,sha256:sha(bytes)};
 }catch(error){
  return stop(client,id,true,error instanceof VoiceError?error.code:'provider_result_uncertain');
 }
}

/** Records the manifest of parts and settles once for the characters converted. */
export async function assembleLongText(client:SupabaseClient,id:string,parts:ResultPart[]){
 const {r,s,auth}=await load(client,id);
 if(r.status!=='processing')return {status:r.status};
 const expected=splitLongText(s.input.text!,longTextPartLimit(s.input.model_id)).length;
 if(parts.length!==expected)return stop(client,id,true,'parts_missing');
 const bytes=parts.reduce((total,part)=>total+part.bytes,0);
 if(bytes>s.storage_reserved_bytes)return stop(client,id,true,'result_limit');
 const units={characters:s.input.text!.length};
 const receipt:SavedResult={mime:'audio/mpeg',bytes,main_bytes:bytes,sha256:sha(Buffer.from(parts.map(part=>part.sha256).join(':'))),files:1,units,parts};
 const saved=await client.from('studio_operations').update({result_manifest:receipt}).eq('id',id);
 if(saved.error)throw new VoiceError('storage_pending',503,'Medição aguardando confirmação.');
 const final=await settleStored(auth,r,s,receipt);
 return {status:final.status,parts:parts.length,characters:units.characters,credits:calculateMeteredUsageCharge({rates:r.rate_snapshot,units}).chargeCredits};
}
