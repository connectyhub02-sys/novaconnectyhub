import 'server-only';
import {geminiTtsVoices} from '@/lib/gemini/tts';
import type {VoiceAuth} from './auth';
import {VoiceError} from './contract';
import {studioDefinitions,type StudioInput} from './studio-contract';
import {studioPrice} from './studio-pricing';
export async function studioCatalog(auth:VoiceAuth){
 const capabilities=[];
 for(const [operation,d] of Object.entries(studioDefinitions)){
  const models=operation==='gemini_tts'?['gemini-3.1-flash-tts-preview','gemini-2.5-flash-preview-tts','gemini-2.5-pro-preview-tts']:[d.model];
  for(const model of models){
   const item={operation,name:d.name,model_id:model,unit:d.unit,requires_audio:d.audio,available:false,reason:'Em preparação',rates:[] as Array<{unit:string;credits_per_unit:number;minimum_credits:number}>};
   if(process.env.STUDIO_OPERATIONS_ENABLED==='true')try{
    const {rates}=await studioPrice(auth,{operation,model_id:model} as StudioInput,d.unit==='token'?{inputTokens:1,outputTokens:1}:d.unit==='minute'?{minutes:1}:d.unit==='character'?{characters:1}:{requests:1});
    item.available=true;item.reason='';item.rates=rates.map(r=>({unit:String(r.unit),credits_per_unit:r.connectyPricePerUnit,minimum_credits:r.minimumChargeCredits}));
   }catch(error){if(!(error instanceof VoiceError))throw error;item.reason=error.code==='pricing_unconfirmed'?'Tarifa em conferência':'Ainda indisponível';}
   capabilities.push(item);
  }
 }
 return {capabilities,gemini_voices:geminiTtsVoices.map(v=>({voice_id:v.voiceId,name:v.displayName,tone:v.tone})),limits:{input_bytes:20_000_000,duration_seconds:1800,output_bytes:20_000_000},uploads_available:process.env.STUDIO_ASSETS_ENABLED==='true'};
}
export async function studioResources(auth:VoiceAuth){
 if(process.env.STUDIO_OPERATIONS_ENABLED!=='true')return {resources:[]};
 const {data,error}=await auth.client.from('studio_resources').select('id,kind,name,provider_id,metadata,created_at,studio_operations!inner(voice_generations!inner(status))').eq('project_id',auth.project.id).eq('organization_id',auth.project.organization_id).eq('status','ready').eq('studio_operations.voice_generations.status','completed').order('created_at',{ascending:false}).limit(100);
 if(error)throw new VoiceError('service_unavailable',503,'Não foi possível consultar os recursos.');
 return {resources:(data??[]).map(r=>({id:r.id,kind:r.kind,name:r.name,voice_id:r.kind==='voice'?r.provider_id:undefined,rules:r.kind==='dictionary'?r.metadata?.rules:undefined,description:r.metadata?.description,created_at:r.created_at})),limit:100};
}
