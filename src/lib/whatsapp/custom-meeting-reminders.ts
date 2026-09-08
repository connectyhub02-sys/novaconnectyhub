import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {loadUazapiCredentials} from "./uazapi-credentials";
import {decryptCredentialValue} from "@/lib/security/credentials-crypto";
import {getContractAccess} from "@/lib/billing/contract-access";

export async function processCustomMeetingReminders(client:SupabaseClient){
 let sent=0;
 for(let i=0;i<5;i++){
  const claim=await client.rpc("claim_custom_meeting_notice");if(claim.error)throw new Error("Fila de lembretes indisponível.");const n=claim.data;if(!n)break;
  let dispatched=false;
  try{
   const request=await client.from("custom_software_requests").select("organization_id,lead_id,conversation_id,status,slot_id").eq("id",n.request_id).single();const r=request.data;if(request.error||!r)throw new Error("request_unavailable");
   const [slot,conversation,lead]=await Promise.all([
    client.from("custom_software_meeting_slots").select("starts_at,meeting_url,status").eq("id",n.slot_id).single(),
    client.from("conversations").select("whatsapp_instance_id,provider_chat_id").eq("id",r.conversation_id).eq("lead_id",r.lead_id).eq("organization_id",r.organization_id).single(),
    client.from("leads").select("phone_number,metadata").eq("id",r.lead_id).eq("organization_id",r.organization_id).single()]);
   if(slot.error||conversation.error||lead.error)throw new Error("context_unavailable");
   const s=slot.data,c=conversation.data;
   if(r.status!=="booked"||r.slot_id!==n.slot_id||s.status!=="booked"||Date.parse(s.starts_at)<=Date.now()||lead.data.metadata?.whatsapp_opt_out===true){await client.from("custom_software_meeting_notices").update({state:"cancelled",updated_at:new Date().toISOString()}).eq("id",n.id);continue;}
   const instance=await client.from("whatsapp_instances").select("id,instance_token_encrypted,status,metadata").eq("id",c.whatsapp_instance_id).eq("organization_id",r.organization_id).single();
   if(instance.error||instance.data.status!=="connected"||instance.data.metadata?.platform_whatsapp!==true||!instance.data.instance_token_encrypted||!(await getContractAccess(r.organization_id,client)).allowed)throw new Error("channel_unavailable");
   const credentials=await loadUazapiCredentials(client),token=decryptCredentialValue(instance.data.instance_token_encrypted);
   const when=new Date(s.starts_at).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
   const text=`Lembrete ConnectyHub: sua reunião sobre software personalizado está marcada para ${when} (Brasília).${s.meeting_url?`\nAcesse: ${s.meeting_url}`:" A equipe compartilhará os detalhes por aqui."}\nSe precisar remarcar, avise por esta conversa.`;
   const started=await client.from("custom_software_meeting_notices").update({state:"dispatching",message_text:text,updated_at:new Date().toISOString()}).eq("id",n.id).eq("state","claimed").select("id").maybeSingle();if(started.error||!started.data)continue;
   dispatched=true;
   const response=await fetch(`${credentials.baseUrl}/send/text`,{method:"POST",headers:{"Content-Type":"application/json",token},body:JSON.stringify({number:lead.data.phone_number,text,linkPreview:false,track_source:"connectyhub",track_id:`custom_meeting_${n.id}`}),signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw new Error("delivery_unconfirmed");
   const result=await response.json(),providerId=[result.messageid,result.id,result.key?.id].find(v=>typeof v==="string"&&v.length)??`custom_meeting_${n.id}`;
   const persisted=await client.from("conversation_messages").insert({organization_id:r.organization_id,conversation_id:r.conversation_id,lead_id:r.lead_id,whatsapp_instance_id:instance.data.id,provider:"uazapi",provider_message_id:providerId,provider_chat_id:c.provider_chat_id,direction:"outbound",message_type:"text",text_content:text,occurred_at:new Date().toISOString(),payload:{source:"custom_meeting_reminder",request_id:n.request_id,slot_id:n.slot_id,notice_id:n.id}});
   if(persisted.error&&persisted.error.code!=="23505")throw new Error("delivery_archive_pending");
   const saved=await client.from("custom_software_meeting_notices").update({state:"sent",provider_message_id:providerId,updated_at:new Date().toISOString(),error_code:null}).eq("id",n.id);if(saved.error)throw new Error("delivery_state_pending");sent++;
  }catch(error){await client.from("custom_software_meeting_notices").update({state:dispatched?"uncertain":"pending",due_at:new Date(Date.now()+15*60000).toISOString(),updated_at:new Date().toISOString(),error_code:error instanceof Error?error.message.slice(0,100):"reminder_failed"}).eq("id",n.id).not("state","in","(sent,cancelled)");}
 }
 return {sent};
}
