import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { officialPhone } from "./whatsapp-policy";

export type RecipientAlias = { input_phone:string; wa_id:string };
export function recipientIdentity(phone:string, aliases:RecipientAlias[]) {
  const direct=aliases.filter(a=>a.input_phone===phone || a.wa_id===phone);
  const identities=[...new Set(direct.map(a=>a.wa_id))];
  if(identities.length>1) throw new Error("Identidade WhatsApp conflitante. Reconecte o contato antes de enviar.");
  const waId=identities[0] ?? phone;
  const group=aliases.filter(a=>a.wa_id===waId);
  return {waId,phone:group.find(a=>a.input_phone!==waId)?.input_phone ?? phone,phones:[...new Set([phone,waId,...group.map(a=>a.input_phone)])]};
}
export async function recipientAliases(client:SupabaseClient,org:string,sender:string,phones:string[]) {
  if(!phones.length) return [];
  const ids=[...new Set(phones.map(officialPhone))].join(",");
  const result=await client.from("meta_whatsapp_recipient_aliases").select("input_phone,wa_id").eq("organization_id",org).eq("phone_number_id",sender).or(`input_phone.in.(${ids}),wa_id.in.(${ids})`).limit(1000);
  if(result.error) throw new Error("Não foi possível conferir a identidade WhatsApp.");
  if(result.data?.length===1000) throw new Error("Excesso de associações para este contato.");
  const canonical=[...new Set((result.data ?? []).map(a=>a.wa_id))];
  if(!canonical.length) return [];
  const group=await client.from("meta_whatsapp_recipient_aliases").select("input_phone,wa_id").eq("organization_id",org).eq("phone_number_id",sender).in("wa_id",canonical).order("confirmed_at",{ascending:false}).limit(1000);
  if(group.error || group.data?.length===1000) throw new Error("Não foi possível conferir todas as associações do contato.");
  return (group.data ?? []) as RecipientAlias[];
}
export async function recordRecipientIdentity(client:SupabaseClient,org:string,sender:string,phone:string,contacts:unknown) {
  if(!Array.isArray(contacts)) return;
  for(const value of contacts) {
    if(!value || typeof value!=="object" || typeof value.input!=="string" || typeof value.wa_id!=="string") continue;
    const input=officialPhone(value.input),waId=officialPhone(value.wa_id);
    if(input!==phone) continue;
    // Preserve the first proven association. Conflicting identities must not silently move consent.
    const saved=await client.from("meta_whatsapp_recipient_aliases").upsert({organization_id:org,phone_number_id:sender,input_phone:input,wa_id:waId},{onConflict:"organization_id,phone_number_id,input_phone",ignoreDuplicates:true});
    if(saved.error) throw new Error("Não foi possível registrar a identidade confirmada pela Meta.");
  }
}
