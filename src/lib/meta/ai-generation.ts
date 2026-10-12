import "server-only";
import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {assertContractAccess} from "@/lib/billing/contract-access";
import {resolveActiveBillingRates,calculateMeteredUsageCharge,extractGeminiUsageMetadata,billableGeminiUnits,type MeteredRate} from "@/lib/billing/metered-usage";
import {GEMINI_CACHED_INPUT_PRICE_RATIO} from "@/lib/billing/credit-economics";

type Input={client:SupabaseClient;org:string;user:string;id:string;feature:string;model:string;apiKey:string;body:Record<string,unknown>;inputTokens:number;maxOutput:number;identity:unknown};
export async function metaAiTariffs(client:SupabaseClient,org:string,model:string,feature="ai_traffic_manager") {
 const access=await assertContractAccess(org,client);
 const rates=await resolveActiveBillingRates(client,{provider:"gemini",featureCode:feature,modelId:model,planCode:access.plan_code});
 if(!["input_token","output_token"].every(unit=>rates.some(r=>r.unit===unit&&r.connectyPricePerUnit>0)))throw Error("Tarifa de IA indisponível; geração bloqueada.");
 return {access,rates};
}
export async function runMeteredMetaGeneration(i:Input) {
 const {client,org,id}=i;
 const {access,rates}=await metaAiTariffs(client,org,i.model,i.feature);
 const hash=createHash("sha256").update(JSON.stringify(i.identity)).digest("hex");
 const old=await client.from("meta_ai_charges").select("*").eq("organization_id",org).eq("id",id).maybeSingle();
 if(old.error)throw Error("Registro de consumo indisponível.");
 let data:Record<string,unknown>|null=null,priceRates:MeteredRate[]=rates;
 if(old.data) {
   if(old.data.input_hash!==hash)throw Error("Solicitação de IA já usada com outro conteúdo.");
   if(old.data.status==="completed")return {data:old.data.provider_response,chargeCredits:Number(old.data.charge_credits),usageEventId:String(old.data.usage_event_id)};
   if(!old.data.provider_response)throw Error("Consumo anterior em conferência. Não será gerada uma nova resposta.");
   data=old.data.provider_response;priceRates=old.data.prices;
 } else {
   const inserted=await client.from("meta_ai_charges").insert({id,organization_id:org,billing_organization_id:access.billing_organization_id,user_id:i.user,feature_code:i.feature,input_hash:hash,brief:i.identity,model:i.model,prices:rates});
   if(inserted.error)throw Error("Há uma operação de IA em andamento ou em conferência nesta empresa. Confira o histórico.");
 }
 const update=async(values:Record<string,unknown>)=>{const r=await client.from("meta_ai_charges").update({...values,updated_at:new Date().toISOString()}).eq("organization_id",org).eq("id",id).neq("status","completed");if(r.error)throw Error("Não foi possível preservar o consumo de IA.");};
 let dispatched=Boolean(data);
 try {
   if(!data) {
     const quote=calculateMeteredUsageCharge({rates,units:{inputTokens:i.inputTokens,outputTokens:i.maxOutput}});
     const held=await client.rpc("reserve_meta_ai",{p_id:id,p_amount:quote.chargeCredits});
     if(held.error){const reason=String(held.error.message||"");throw Error(reason.includes("monthly_limit")?"Seu limite mensal de consumo de IA foi atingido. Confira os limites em Créditos e recargas; não houve geração.":reason.includes("daily_limit")?"Seu limite diário de consumo de IA foi atingido. Confira os limites em Créditos e recargas; não houve geração.":"Saldo ou acesso insuficiente para reservar esta análise. Confira créditos e contrato.");}
     dispatched=true;
     const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(i.model)}:generateContent`,{method:"POST",redirect:"error",signal:AbortSignal.timeout(120000),headers:{"Content-Type":"application/json","x-goog-api-key":i.apiKey},body:JSON.stringify(i.body)});
     if(!response.ok){if([400,401,403,404,429].includes(response.status))dispatched=false;throw Error(`A IA recusou a geração (HTTP ${response.status}).`);}
     data=await response.json();await update({status:"generated",provider_response:data});
   }
   const usage=extractGeminiUsageMetadata(data);if(!usage)throw Error("Resposta recebida; consumo do provedor em conferência.");
   const units=billableGeminiUnits(usage),billableInput=Math.max(0,units.inputTokens-usage.cachedTokens)+usage.cachedTokens*GEMINI_CACHED_INPUT_PRICE_RATIO;
   const price=calculateMeteredUsageCharge({rates:priceRates,units:{inputTokens:billableInput,outputTokens:units.outputTokens}});
   const charge=access.plan_code==="internal"?0:price.chargeCredits;
   await update({settlement:{input:units.inputTokens,output:units.outputTokens,cost:price.providerCost,charge,billingMode:access.plan_code==="internal"?"internal_shadow":access.plan_code==="trial"?"trial_billable":"customer_billable",metering:{usage,rates:price.matchedRates}},result:{received:true}});
   const finished=await client.rpc("finish_meta_ai",{p_id:id});if(finished.error)throw Error("Consumo em conferência. O resultado está preservado e não será gerado novamente.");
   const receipt=await client.from("meta_ai_charges").select("charge_credits,usage_event_id").eq("id",id).eq("organization_id",org).single();
   if(receipt.error)throw Error("Recibo de consumo em conferência.");
   return {data,chargeCredits:Number(receipt.data.charge_credits),usageEventId:String(receipt.data.usage_event_id)};
 }catch(e){
   if(dispatched)await update({status:"uncertain",error_message:e instanceof Error?e.message:"Consumo em conferência."});
   else {await update({error_message:e instanceof Error?e.message:"Geração não iniciada."});const released=await client.rpc("finish_meta_ai",{p_id:id,p_failed:true});if(released.error)throw Error("Reserva de créditos em conferência.");}
   throw e;
 }
}
