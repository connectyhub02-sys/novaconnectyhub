import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {resolveActiveBillingRates} from '@/lib/billing/metered-usage';
import {voiceHash} from './auth';
import {VoiceError} from './contract';
import {studioDefinitions,type StudioOperation} from './studio-contract';
import {confirmedStudioRates} from './studio-pricing';
export async function studioAdminCatalog(client:SupabaseClient){
 const rows=await client.from('studio_capabilities').select('*').order('operation').order('model_id');
 if(rows.error)throw new VoiceError('service_unavailable',503,'O cadastro do Estúdio ainda não está disponível.');
 const capabilities=[];
 for(const row of rows.data??[]){
  const d=studioDefinitions[row.operation as StudioOperation];if(!d)continue;
  const rates=await resolveActiveBillingRates(client,{provider:d.provider,featureCode:d.feature,modelId:row.model_id,planCode:null});
  let ready=false;try{confirmedStudioRates(rates,rates,row.operation);ready=true;}catch{}
  capabilities.push({operation:row.operation,model_id:row.model_id,name:d.name,enabled:row.enabled,confirmed_at:row.confirmed_at,cost_evidence:row.cost_evidence,rates,ready,rate_hash:voiceHash(JSON.stringify(rates))});
 }
 return {capabilities,runtime_enabled:process.env.STUDIO_OPERATIONS_ENABLED==='true',uploads_enabled:process.env.STUDIO_ASSETS_ENABLED==='true'};
}
export async function updateStudioCapability(client:SupabaseClient,raw:unknown,actor:string){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new VoiceError('invalid_input',422,'Envie a configuração da modalidade.');
 const b=raw as Record<string,unknown>;
 if(Object.keys(b).some(k=>!['operation','model_id','enabled','cost_evidence','rate_hash'].includes(k))||typeof b.operation!=='string'||!Object.hasOwn(studioDefinitions,b.operation)||typeof b.model_id!=='string'||typeof b.enabled!=='boolean')throw new VoiceError('invalid_input',422,'Configuração inválida.');
 const d=studioDefinitions[b.operation as StudioOperation];
 const old=await client.from('studio_capabilities').select('operation').eq('operation',b.operation).eq('model_id',b.model_id).maybeSingle();
 if(old.error||!old.data)throw new VoiceError('not_found',404,'Modalidade não encontrada.');
 let values:Record<string,unknown>={enabled:false,updated_at:new Date().toISOString(),updated_by:actor};
 if(b.enabled){
  if(typeof b.cost_evidence!=='string'||b.cost_evidence.trim().length<20||b.cost_evidence.length>2000)throw new VoiceError('cost_evidence_required',422,'Informe a referência da tabela ou contrato efetivamente conferido (20 a 2.000 caracteres).');
  const rates=await resolveActiveBillingRates(client,{provider:d.provider,featureCode:d.feature,modelId:b.model_id,planCode:null});
  if(voiceHash(JSON.stringify(rates))!==b.rate_hash)throw new VoiceError('pricing_changed',409,'As tarifas mudaram. Atualize e confira novamente.');
  confirmedStudioRates(rates,rates,b.operation as StudioOperation);
  const model=await client.from('provider_models').select('id,provider_cost_centers!inner(provider,enabled)').eq('provider_model_id',b.model_id).eq('enabled',true).eq('provider_cost_centers.provider',d.provider).eq('provider_cost_centers.enabled',true).maybeSingle();
  if(model.error||!model.data)throw new VoiceError('model_unavailable',422,'Ative o modelo e o serviço no catálogo financeiro antes de liberar esta modalidade.');
  values={...values,enabled:true,confirmed_at:new Date().toISOString(),cost_evidence:b.cost_evidence.trim(),confirmed_rates:rates};
 }
 const saved=await client.from('studio_capabilities').update(values).eq('operation',b.operation).eq('model_id',b.model_id);
 if(saved.error)throw new VoiceError('save_failed',503,'Não foi possível salvar a modalidade.');
 return {ok:true};
}
