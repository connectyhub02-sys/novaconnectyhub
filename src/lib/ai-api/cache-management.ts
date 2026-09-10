import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {AiApiError,record,rpc} from './gateway';
import {aiProviderRequest,AiProviderFailure} from './provider-http';
import {priceAiUnits,type AiPriceCard} from './operation-pricing';
import {publicAiResource} from './resources';

export async function updateAiCache(client:SupabaseClient,owned:Record<string,unknown>,raw:unknown) {
  const body=record(raw),ttl=Number(body.ttl_seconds);
  if(Object.keys(body).some(k=>k!=='ttl_seconds')||!Number.isInteger(ttl)||ttl<1||ttl>604800)throw new AiApiError('invalid_configuration',422,'Informe ttl_seconds entre 1 e 604800.');
  if(owned.kind!=='cache')throw new AiApiError('resource_not_found',404,'Cache não encontrado.');
  const claim=await client.rpc('claim_ai_resource_worker',{p_id:owned.id});
  if(claim.error||!claim.data)throw new AiApiError('resource_in_use',409,'O cache está sendo atualizado.');
  try {
    const loaded=await client.from('ai_resources').select('*').eq('id',owned.id).single();
    if(loaded.error||!loaded.data)throw new Error('Cache indisponível.');
    const row=loaded.data,metadata=record(row.metadata);
    if(row.status!=='active'||Date.parse(row.expires_at)<=Date.now()||metadata.pending_expire_at)throw new AiApiError('cache_unavailable',409,'Consulte o cache antes de alterar sua validade.');
    const end=new Date(Date.now()+ttl*1000),start=Date.parse(String(record(metadata.initial_result).createTime??row.created_at));
    const quote=priceAiUnits(metadata.prices as AiPriceCard,{cache_hour:Number(metadata.size)*(end.getTime()-start)/3600000});
    await rpc(client,'extend_ai_reservation',{p_request:row.request_id,p_amount:metadata.plan_code==='internal'?0:quote.credits});
    const intent={...metadata,pending_expire_at:end.toISOString()};
    const saved=await client.from('ai_resources').update({metadata:intent,updated_at:new Date().toISOString()}).eq('id',row.id);
    if(saved.error)throw new Error('Não foi possível registrar a atualização.');
    try {
      const result=await aiProviderRequest(client,`/v1beta/${row.provider_name}?updateMask=ttl`,'PATCH',{ttl:`${ttl}s`});
      if(!Number.isFinite(Date.parse(String(result.expireTime))))throw new Error('Validade ainda não confirmada.');
      const updated=await client.from('ai_resources').update({metadata,expires_at:result.expireTime,updated_at:new Date().toISOString()}).eq('id',row.id).select('*').single();
      if(updated.error)throw new Error('Atualização em conferência.');return publicAiResource(updated.data);
    }catch(error){
      // Keep uncertain updates for GET/worker reconciliation. No repeated PATCH.
      if(error instanceof AiProviderFailure&&!error.uncertain)await client.from('ai_resources').update({metadata}).eq('id',row.id);
      throw error;
    }
  }finally{await client.from('ai_resources').update({worker_lease_until:null}).eq('id',owned.id);}
}
