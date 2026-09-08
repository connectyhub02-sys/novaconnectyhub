import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateLeadMetadata } from "@/lib/leads/metadata-update";
export const customSoftwareInstruction=[
  "SERVIÇO DE DESENVOLVIMENTO PERSONALIZADO CONNECTYHUB",
  "Neste fluxo a ConnectyHub desenvolve o software com o cliente: plataformas, aplicativos, sistemas internos, integrações e IA. É um serviço diferente do autoatendimento dos planos públicos.",
  "Objetivo: agendar uma reunião. Reaproveite cadastro e contexto, entenda brevemente nome, empresa e ideia. Uma pergunta por vez. Não peça orçamento.",
  "Não apresente valores, faixas, mensalidades, descontos, pacotes ou prazos prometidos de desenvolvimento. Se perguntarem preço: 'Vamos entender sua ideia e o que o sistema precisa fazer em uma reunião. Posso te ajudar a agendar?'.",
  "Só ofereça horários listados no contexto de agenda. Para reservar, peça ao lead a confirmação exata 'CONFIRMAR REUNIÃO código' do horário escolhido. Nunca afirme reserva sem status booked retornado pelo sistema.",
  "Sem horários disponíveis, registre uma preferência e diga que a equipe vai combinar o horário. Não invente reunião, link de videochamada ou envio de convite.",
  "Não publique nomes de clientes nem invente cases. Caso o cliente mude para suporte, cobrança ou recarga de um contrato existente, trate esse assunto com os dados financeiros verificados; a restrição de preços é da captação de desenvolvimento personalizado.",
].join("\n");
export function isCustomSoftwareIntent(text:string){return /\[CHS:[a-f0-9-]{36}\]|solu[cç][oõ]es personalizadas|(?:desenvolv|constru|criar).{0,50}(?:software|plataforma|aplicativo|sistema).{0,50}(?:empresa|personaliz|sob medida)|software sob medida/i.test(text);}
export function meetingConfirmation(text:string){return text.trim().match(/^confirmar reuni[aã]o\s+([a-f0-9]{8})[.!]?$/i)?.[1]?.toLowerCase()??null;}
const label=(s:string)=>new Date(s).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",weekday:"short",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})+" (Brasília)";
export async function customSoftwareContext(client:SupabaseClient,input:{organizationId:string;leadId:string;conversationId:string;text:string}){
  const existing=await client.from("custom_software_requests").select("*").eq("lead_id",input.leadId).maybeSingle();
  if(existing.error)throw new Error("Agenda indisponível.");
  if(!existing.data&&!isCustomSoftwareIntent(input.text))return null;
  let r=existing.data;
  if(!r){
    const visitId=input.text.match(/\[CHS:([a-f0-9-]{36})\]/i)?.[1];
    const visit=visitId?await client.from("custom_software_visits").select("id,campaign,lead_id").eq("id",visitId).gte("created_at",new Date(Date.now()-30*86400000).toISOString()).maybeSingle():null;
    const validVisit=visit?.data&&(!visit.data.lead_id||visit.data.lead_id===input.leadId)?visit.data:null;
    const saved=await client.from("custom_software_requests").upsert({organization_id:input.organizationId,lead_id:input.leadId,conversation_id:input.conversationId,visit_id:validVisit?.id??null,idea:input.text.slice(0,4000)}, {onConflict:"lead_id",ignoreDuplicates:true});
    if(saved.error)throw new Error("Não foi possível registrar o interesse.");
    const loaded=await client.from("custom_software_requests").select("*").eq("lead_id",input.leadId).single();r=loaded.data;
    await updateLeadMetadata({client,organizationId:input.organizationId,leadId:input.leadId,buildUpdate:m=>({metadata:{...m,custom_software:{interest:true,source:validVisit?.campaign??{source_page:"whatsapp"},request_id:r?.id}}})});
    if(validVisit)await client.from("custom_software_visits").update({lead_id:input.leadId}).eq("id",validVisit.id).is("lead_id",null);
  }
  if(!r)throw new Error("Interesse não encontrado.");
  if(!isCustomSoftwareIntent(input.text)&&!meetingConfirmation(input.text)&&input.text.trim().length>15&&r.status!=="booked"){
    const idea=[r.idea,input.text.slice(0,1500)].filter(Boolean).join("\n").slice(-6000);
    if(!String(r.idea??"").endsWith(input.text.slice(0,1500)))await client.from("custom_software_requests").update({idea,updated_at:new Date().toISOString()}).eq("id",r.id);
  }
  const code=meetingConfirmation(input.text);
  if(code){
    const slot=(r.offered_slots as string[]).find(id=>id.startsWith(code));
    if(slot){const booked=await client.rpc("book_custom_software_meeting",{p_lead:input.leadId,p_slot:slot});
      if(!booked.error&&booked.data){const s=booked.data;return {instruction:customSoftwareInstruction+`\nReunião confirmada: ${label(s.starts_at)}. Link: ${s.meeting_url??"a equipe compartilhará os detalhes"}.`,reply:`Sua reunião está confirmada para ${label(s.starts_at)}.${s.meeting_url?`\nLink da reunião: ${s.meeting_url}`:" A equipe compartilhará os detalhes por aqui."}`};}
      return {instruction:customSoftwareInstruction+"\nO horário escolhido ficou indisponível. Consulte novas opções; nenhuma reserva foi confirmada.",reply:null};
    }
  }
  if(r.status==="booked"){
    const s=await client.from("custom_software_meeting_slots").select("starts_at,meeting_url,status").eq("id",r.slot_id).maybeSingle();
    return {instruction:customSoftwareInstruction+`\nReunião existente: ${JSON.stringify(s.data)}. Não crie outra reserva. Para remarcar ou cancelar, encaminhe à equipe.`,reply:null};
  }
  const slots=await client.from("custom_software_meeting_slots").select("id,starts_at,ends_at").eq("status","available").gte("starts_at",new Date(Date.now()+3600000).toISOString()).order("starts_at").limit(3);
  if(slots.error)throw new Error("Não foi possível consultar a agenda.");
  const available=slots.data??[];
  await client.from("custom_software_requests").update({status:"awaiting_schedule",offered_slots:available.map(s=>s.id),updated_at:new Date().toISOString()}).eq("id",r.id).neq("status","booked");
  const agenda=available.length?available.map(s=>`${label(s.starts_at)} — confirmar com: CONFIRMAR REUNIÃO ${s.id.slice(0,8)}`).join("\n"):"Nenhum horário disponível na agenda. Solicite uma preferência; a solicitação está na fila da equipe em Soluções personalizadas > Reuniões. Não confirme data.";
  return {instruction:customSoftwareInstruction+"\nAGENDA CONSULTADA AGORA:\n"+agenda,reply:null};
}
