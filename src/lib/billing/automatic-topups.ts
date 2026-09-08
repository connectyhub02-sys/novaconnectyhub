import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {decryptCredentialValue} from "@/lib/security/credentials-crypto";
import {loadAsaasPlatformBillingConfig} from "@/lib/sales-catalog/asaas";
import {AsaasDirectError,createManagedAsaasInvoice,payManagedAsaasInvoice} from "@/lib/sales-catalog/asaas-direct";
import {directPaymentState} from "@/lib/sales-catalog/transparent-checkout";
import {billingLocalDate} from "./commercial-terms";
import {finishNativeBilling,type Attempt} from "./native-card-checkout";
export async function processAutomaticTopups(client:SupabaseClient,organizationId?:string){
 let q=client.from("credit_topup_policies").select("organization_id").eq("enabled",true).order("last_checked_at",{nullsFirst:true}).limit(5);
 if(organizationId)q=q.eq("organization_id",organizationId);
 const policies=await q;if(policies.error)throw new Error("Não foi possível consultar as recargas autorizadas.");
 let attempted=0;
 for(const policy of policies.data??[]){
  const claim=await client.rpc("claim_credit_topup",{p_org:policy.organization_id});
  await client.from("credit_topup_policies").update({last_checked_at:new Date().toISOString()}).eq("organization_id",policy.organization_id);
  if(claim.error||!claim.data?.claimed)continue;
  let attempt=claim.data.attempt as Attempt;attempted++;
  let dispatched=false;
  try{
   const card=await client.from("billing_asaas_card_vault").select("customer_id,token_encrypted").eq("id",claim.data.method_id).eq("organization_id",policy.organization_id).eq("status","active").single();
   if(card.error||!card.data)throw new Error("Autorização de cartão indisponível.");
   const config=await loadAsaasPlatformBillingConfig({client});
   // Mark before the first provider mutation so crash recovery cannot retry it.
   const started=await client.from("billing_card_attempts").update({stage:"charging",updated_at:new Date().toISOString()}).eq("id",attempt.id).eq("state","processing").select("*").single();
   if(started.error)throw new Error("Não foi possível iniciar a recarga.");attempt=started.data as Attempt;dispatched=true;
   const invoice=await createManagedAsaasInvoice({...config,customerId:card.data.customer_id,amount:Number(attempt.amount),dueDate:billingLocalDate(new Date()),reference:attempt.external_reference,description:"Recarga de créditos ConnectyHub autorizada pelo titular"});
   if(!invoice.id)throw new Error("Cobrança em conferência.");
   const bound=await client.from("billing_card_attempts").update({provider_payment_id:invoice.id}).eq("id",attempt.id).select("*").single();
   if(bound.error)throw new Error("Cobrança em conferência.");attempt=bound.data as Attempt;
   const saved=await client.from("billing_payments").update({provider_payment_id:invoice.id}).eq("id",attempt.payment_id);if(saved.error)throw new Error("Cobrança em conferência.");
   const payment=await payManagedAsaasInvoice({...config,paymentId:invoice.id,reference:attempt.external_reference,customerId:card.data.customer_id,token:decryptCredentialValue(card.data.token_encrypted),amount:Number(attempt.amount)});
   await finishNativeBilling(client,attempt,directPaymentState(payment),payment);
  }catch(error){
   const definitive=!dispatched||(error instanceof AsaasDirectError&&error.definitive);
   await finishNativeBilling(client,attempt,definitive?(error instanceof AsaasDirectError&&error.declined?"rejected":"error"):"unknown").catch(()=>null);
   // A refusal needs customer action. Do not keep retrying their card each hour.
   if(definitive)await client.from("credit_topup_policies").update({enabled:false,updated_at:new Date().toISOString()}).eq("organization_id",policy.organization_id);
  }
 }
 return {attempted};
}
