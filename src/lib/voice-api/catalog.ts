import 'server-only';
import type {VoiceAuth} from './auth';
import {listWhatsappAudioVoices} from '@/lib/elevenlabs/voices';
import {resolveActiveBillingRates,calculateMeteredUsageCharge} from '@/lib/billing/metered-usage';
import {VoiceError} from './contract';
// A shared provider credential is never an authorization to use its private
// catalog. Only premade voices and locally owned project clones are returned.
export async function voiceCatalog(auth:VoiceAuth) {
  const state=await listWhatsappAudioVoices({client:auth.client,organizationId:auth.project.organization_id});
  const {data:clones,error}=await auth.client.from('voice_clones').select('id,provider_voice_id,name,status,origin,voice_generations(status)').eq('organization_id',auth.project.organization_id).eq('project_id',auth.project.id).neq('status','deleted').not('provider_voice_id','is',null);
  if(error) throw new VoiceError('catalog_unavailable',503,'Não foi possível conferir a propriedade das vozes.');
  return {project_id:auth.project.id,billing_organization_id:auth.billingOrg,configured:state.configured,voices:[
    ...state.voices.filter(v=>v.category==='premade' && ['platform','elevenlabs'].includes(v.source)).map(v=>({voice_id:v.voiceId,name:v.name,kind:'common',status:'ready',preview_url:v.previewUrl,language:v.language})),
    ...(clones??[]).filter(v=>v.origin==='verified_import'||(v.voice_generations as unknown as {status:string}|null)?.status==='completed').map(v=>({voice_id:v.provider_voice_id,name:v.name,kind:'private',status:v.status,preview_url:null,language:null})),
  ],partial:!!state.errorMessage};
}
export async function voiceRates(auth:VoiceAuth,model:string) {
  const {data:enabled,error}=await auth.client.from('provider_models').select('id,provider_cost_centers!inner(provider,enabled)').eq('provider_model_id',model).eq('enabled',true).eq('provider_cost_centers.provider','elevenlabs').eq('provider_cost_centers.enabled',true).maybeSingle();
  if(error || !enabled) throw new VoiceError('model_unavailable',422,'Modelo não disponível. Consulte o catálogo.');
  const rates=await resolveActiveBillingRates(auth.client,{provider:'elevenlabs',featureCode:'text_to_speech',modelId:model,planCode:auth.planCode});
  if(!rates.some(r=>r.unit==='character' && r.connectyPricePerUnit>0)) throw new VoiceError('pricing_unavailable',503,'Tarifa de geração avulsa indisponível para este modelo.');
  return rates;
}
export async function voiceModels(auth:VoiceAuth) {
  const {data,error}=await auth.client.from('provider_models').select('provider_model_id,display_name,provider_cost_centers!inner(provider,enabled)').eq('enabled',true).eq('provider_cost_centers.provider','elevenlabs').eq('provider_cost_centers.enabled',true);
  if(error) throw new VoiceError('models_unavailable',503,'Não foi possível consultar os modelos.');
  const models=[];
  for(const row of data??[]) {
    try {const rates=await voiceRates(auth,row.provider_model_id);const rate=rates.find(r=>r.unit==='character')!;
      models.push({model_id:row.provider_model_id,name:row.display_name,available:true,credits_per_character:rate.connectyPricePerUnit,minimum_credits:rate.minimumChargeCredits});
    } catch(e) {if(!(e instanceof VoiceError) || e.code!=='pricing_unavailable') throw e;models.push({model_id:row.provider_model_id,name:row.display_name,available:false,reason:e.code});}
  }
  let cloning:{available:boolean;credits?:number;preview_included?:boolean}={available:false};
  try {const {price}=await quoteClone(auth);cloning={available:true,credits:price.chargeCredits,preview_included:true};}catch(e){if(!(e instanceof VoiceError))throw e;}
  return {project_id:auth.project.id,billing_organization_id:auth.billingOrg,models,cloning};
}
export async function quoteClone(auth:VoiceAuth) {
  const rates=await resolveActiveBillingRates(auth.client,{provider:'elevenlabs',featureCode:'voice_clone',modelId:null,planCode:auth.planCode});
  if(!rates.some(r=>r.id&&r.unit==='request'))throw new VoiceError('pricing_unavailable',503,'Tarifa de clonagem indisponível.');
  const price=calculateMeteredUsageCharge({rates,units:{requests:1,quantity:1}});
  if(!Number.isFinite(price.chargeCredits)||price.chargeCredits<0)throw new VoiceError('pricing_unavailable',503,'Tarifa de clonagem inválida.');
  return {rates,price};
}
export async function quoteVoice(auth:VoiceAuth,model:string,characters:number) {
  const rates=await voiceRates(auth,model);
  const price=calculateMeteredUsageCharge({rates,units:{characters}});
  if(price.chargeCredits<=0 || !Number.isFinite(price.chargeCredits)) throw new VoiceError('pricing_unavailable',503,'Tarifa indisponível.');
  return {rates,price};
}
