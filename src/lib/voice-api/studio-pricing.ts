import 'server-only';
import {resolveActiveBillingRates,calculateMeteredUsageCharge,type MeteredRate,type MeteredUsageUnits} from '@/lib/billing/metered-usage';
import type {VoiceAuth} from './auth';
import {VoiceError} from './contract';
import {studioDefinitions,type StudioInput} from './studio-contract';

export function confirmedStudioRates(rates:MeteredRate[],confirmed:unknown,operation:StudioInput['operation']){
 if(!Array.isArray(confirmed)||!rates.length)throw new VoiceError('pricing_unconfirmed',503,'Tarifa ainda não confirmada para esta operação.');
 const unit=studioDefinitions[operation].unit,required=unit==='token'?['input_token','output_token']:[unit];
 if(rates.length!==required.length||required.some(u=>!rates.some(r=>r.unit===u)))throw new VoiceError('pricing_unconfirmed',503,'Unidades de cobrança não confirmadas.');
 for(const r of rates){
  const match=confirmed.find((v:MeteredRate)=>v?.id===r.id&&v?.unit===r.unit);
  if(!r.id||!match||['providerCostPerUnit','connectyPricePerUnit','minimumChargeCredits'].some(k=>{
   const value=r[k as keyof MeteredRate];return typeof value!=='number'||!Number.isFinite(value)||value<0||value!==match[k];
  }))throw new VoiceError('pricing_unconfirmed',503,'A tarifa mudou e precisa de nova confirmação.');
 }
 if(operation!=='gemini_tts'&&Math.max(...rates.map(r=>r.minimumChargeCredits))<5)throw new VoiceError('pricing_unconfirmed',503,'Mínimo da nova operação não confirmado.');
 return rates;
}
export async function studioPrice(auth:VoiceAuth,input:StudioInput,units:MeteredUsageUnits){
 const d=studioDefinitions[input.operation];
 const {data:c,error}=await auth.client.from('studio_capabilities').select('*').eq('operation',input.operation).eq('model_id',input.model_id).maybeSingle();
 if(error)throw new VoiceError('service_unavailable',503,'Não foi possível conferir a disponibilidade.');
 if(!c?.enabled||!c.confirmed_at||!c.cost_evidence||c.provider!==d.provider||c.feature_code!==d.feature)throw new VoiceError('capability_unavailable',422,'Esta operação ainda não está disponível.');
 const {data:center,error:ce}=await auth.client.from('provider_cost_centers').select('enabled').eq('provider',d.provider).maybeSingle();
 if(ce||!center?.enabled)throw new VoiceError('capability_unavailable',422,'Serviço temporariamente indisponível.');
 const {data:model,error:me}=await auth.client.from('provider_models').select('id,provider_cost_centers!inner(provider)').eq('provider_model_id',input.model_id).eq('enabled',true).eq('provider_cost_centers.provider',d.provider).maybeSingle();
 if(me||!model)throw new VoiceError('capability_unavailable',422,'Modelo temporariamente indisponível.');
 const rates=confirmedStudioRates(await resolveActiveBillingRates(auth.client,{provider:d.provider,featureCode:d.feature,modelId:input.model_id,planCode:auth.planCode}),c.confirmed_rates,input.operation);
 const price=calculateMeteredUsageCharge({rates,units});
 if(!Number.isFinite(price.chargeCredits)||price.chargeCredits<0||!Number.isFinite(price.providerCost)||price.providerCost<0)throw new VoiceError('pricing_unconfirmed',503,'Tarifa indisponível.');
 return {rates,price};
}
