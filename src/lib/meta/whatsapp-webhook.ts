import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { officialOptOut, officialPhone } from "./whatsapp-policy";
import { recordRecipientIdentity } from "./whatsapp-recipient";

type RecordValue = Record<string,unknown>;
const record = (value:unknown):RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const array = (value:unknown):unknown[] => Array.isArray(value) ? value : [];
export async function ingestOfficialWhatsApp(payload: unknown, client: SupabaseClient = createServiceClient()) {
  let stored = 0, unmapped = 0;
  for (const entryValue of array(record(payload).entry)) {
    const entry = record(entryValue);
    for (const change of array(entry.changes)) {
      const value = record(record(change).value);
      const phoneId = String(record(value.metadata).phone_number_id ?? "");
      if (!phoneId) continue;
      const result = await client.from("meta_whatsapp_connections").select("organization_id,waba_id").eq("phone_number_id",phoneId).eq("status","connected").maybeSingle();
      if (result.error) throw new Error("Falha ao localizar conexão WhatsApp.");
      if (!result.data || result.data.waba_id !== String(entry.id)) { unmapped++; continue; }
      const org = result.data.organization_id;
      for (const messageValue of array(value.messages)) {
        const message = record(messageValue);
        if (typeof message.id !== "string" || typeof message.from !== "string") continue;
        let phone: string;
        try { phone = officialPhone(message.from); } catch { continue; }
        const type = String(message.type ?? "unknown");
        const text = String(record(message.text).body ?? record(record(message.interactive).button_reply).title ?? record(message.button).text ?? `[${type}: recebido no WhatsApp oficial]`).slice(0,4096);
        const timestamp = Number(message.timestamp) * 1000;
        if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > Date.now()+60000) continue;
        const inserted = await client.from("meta_whatsapp_messages").upsert({organization_id:org,phone_number_id:phoneId,phone,direction:"inbound",message_type:type,text_content:text,provider_message_id:message.id,status:"received",occurred_at:new Date(timestamp).toISOString()},{onConflict:"phone_number_id,provider_message_id",ignoreDuplicates:true}).select("id");
        if (inserted.error) throw new Error("Falha ao persistir mensagem WhatsApp.");
        // Reprocess duplicates so a previous archive failure can recover on Meta retry.
        const row = inserted.data?.[0] ?? (await client.from("meta_whatsapp_messages").select("id").eq("phone_number_id",phoneId).eq("provider_message_id",message.id).single()).data;
        if (!row) throw new Error("Mensagem recebida sem registro.");
        const archive = await client.rpc("archive_meta_whatsapp_message",{p_id:row.id});
        if (archive.error) throw new Error("Falha ao arquivar mensagem WhatsApp no CRM.");
        if (officialOptOut(text)) {
          const opt = await client.from("meta_whatsapp_contacts").update({opted_out:true}).eq("organization_id",org).eq("lead_id",archive.data);
          const crm = await client.rpc("opt_out_lead_contact",{p_org:org,p_lead:archive.data,p_source:"meta_whatsapp"});
          if (opt.error || crm.error) throw new Error("Falha ao registrar opt-out WhatsApp.");
        }
        stored++;
      }
      for (const statusValue of array(value.statuses)) {
        const status = record(statusValue);
        if (typeof status.id !== "string" || !["sent","delivered","read","failed"].includes(String(status.status))) continue;
        const timestamp = Number(status.timestamp)*1000;
        if (!Number.isFinite(timestamp)) continue;
        const receipt = await client.from("meta_whatsapp_receipts").upsert({phone_number_id:phoneId,provider_message_id:status.id,status:status.status,occurred_at:new Date(timestamp).toISOString(),error_code:record(array(status.errors)[0]).code ? String(record(array(status.errors)[0]).code) : null},{onConflict:"phone_number_id,provider_message_id,status",ignoreDuplicates:true});
        if (receipt.error) throw new Error("Falha ao registrar recibo WhatsApp.");
        const reconciled = await client.rpc("reconcile_meta_whatsapp_receipt",{p_phone:phoneId,p_message:status.id});
        if (reconciled.error) throw new Error("Falha ao atualizar entrega WhatsApp.");
        const message = await client.from("meta_whatsapp_messages").select("id,phone").eq("organization_id",org).eq("phone_number_id",phoneId).eq("provider_message_id",status.id).eq("direction","outbound").maybeSingle();
        if (message.data) {
          if(status.status!=="failed" && typeof status.recipient_id==="string") await recordRecipientIdentity(client,org,phoneId,message.data.phone,[{input:message.data.phone,wa_id:status.recipient_id}]);
          const archive = await client.rpc("archive_meta_whatsapp_message",{p_id:message.data.id});
          if (archive.error) throw new Error("Falha ao sincronizar histórico WhatsApp.");
        }
        stored++;
      }
      const touched = await client.from("meta_whatsapp_connections").update({webhook_at:new Date().toISOString()}).eq("organization_id",org);
      if (touched.error) throw new Error("Falha ao registrar diagnóstico do webhook.");
    }
  }
  return {stored,unmapped};
}
