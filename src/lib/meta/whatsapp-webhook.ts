import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { officialOptOut, officialPhone } from "./whatsapp-policy";
import { recordRecipientIdentity } from "./whatsapp-recipient";
import { officialInboundProfileName } from "./whatsapp-contact-profile";
import { coexistenceEchoes, coexistenceOffboarded, historySyncOutcome } from "./whatsapp-signup-mode";
import { statusPricing } from "./message-billing-policy";
import { recordOfficialMessagePricing } from "./message-billing";

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
      if (String(record(change).field) === "account_update" && coexistenceOffboarded(value)) {
        await offboardCoexistence(client, String(record(value.waba_info).waba_id ?? entry.id ?? ""));
        continue;
      }
      if (!phoneId) continue;
      const result = await client.from("meta_whatsapp_connections").select("organization_id,waba_id,coexistence").eq("phone_number_id",phoneId).eq("status","connected").maybeSingle();
      if (result.error) throw new Error("Falha ao localizar conexão WhatsApp.");
      if (!result.data || result.data.waba_id !== String(entry.id)) { unmapped++; continue; }
      const org = result.data.organization_id;
      if (result.data.coexistence === true) stored += await ingestCoexistenceRecords(client, org, phoneId, value);
      // Inbound messages are stored for the official inbox only. This pipeline never
      // starts an AI reply; for a coexistence number the QR attendance answers once.
      for (const messageValue of array(value.messages)) {
        const message = record(messageValue);
        if (typeof message.id !== "string" || typeof message.from !== "string") continue;
        let phone: string;
        try { phone = officialPhone(message.from); } catch { continue; }
        const type = String(message.type ?? "unknown");
        const text = String(record(message.text).body ?? record(record(message.interactive).button_reply).title ?? record(record(message.interactive).list_reply).title ?? record(message.button).text ?? `[${type}: recebido no WhatsApp oficial]`).slice(0,4096);
        const media=record(message[type]);
        const content=['image','video','audio','document'].includes(type)&&typeof media.id==='string'?{[type]:{id:media.id,mime_type:media.mime_type,filename:media.filename,caption:media.caption}}:{};
        const timestamp = Number(message.timestamp) * 1000;
        if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > Date.now()+60000) continue;
        const inserted = await client.from("meta_whatsapp_messages").upsert({organization_id:org,phone_number_id:phoneId,phone,direction:"inbound",message_type:type,text_content:typeof media.caption==="string"?media.caption.slice(0,1024):text,content,provider_message_id:message.id,status:"received",occurred_at:new Date(timestamp).toISOString()},{onConflict:"phone_number_id,provider_message_id",ignoreDuplicates:true}).select("id");
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
        const profileName = officialInboundProfileName(value.contacts, message.from);
        if (profileName) {
          // Preserve a name deliberately edited by the operator.
          const profile = await client.from("meta_whatsapp_threads").update({display_name:profileName})
            .eq("organization_id",org).eq("phone_number_id",phoneId).eq("phone",phone).is("display_name",null);
          if (profile.error) throw new Error("Falha ao salvar nome do contato WhatsApp.");
        }
        stored++;
      }
      for (const statusValue of array(value.statuses)) {
        const status = record(statusValue);
        if (typeof status.id !== "string" || !["sent","delivered","read","failed"].includes(String(status.status))) continue;
        const timestamp = Number(status.timestamp)*1000;
        if (!Number.isFinite(timestamp)) continue;
        const receipt = await client.from("meta_whatsapp_receipts").upsert({phone_number_id:phoneId,provider_message_id:status.id,status:status.status,occurred_at:new Date(timestamp).toISOString(),error_code:record(array(status.errors)[0]).code ? String(record(array(status.errors)[0]).code) : null,pricing:statusPricing(status.pricing)},{onConflict:"phone_number_id,provider_message_id,status",ignoreDuplicates:true});
        if (receipt.error) throw new Error("Falha ao registrar recibo WhatsApp.");
        const reconciled = await client.rpc("reconcile_meta_whatsapp_receipt",{p_phone:phoneId,p_message:status.id});
        if (reconciled.error) throw new Error("Falha ao atualizar entrega WhatsApp.");
        // Messages billed through the ConnectyHub credit line are charged once, on delivery,
        // at twice Meta's rate; what Meta does not charge stays free. Others are ignored.
        await recordOfficialMessagePricing(client,phoneId,status.id);
        const message = await client.from("meta_whatsapp_messages").select("id,phone").eq("organization_id",org).eq("phone_number_id",phoneId).eq("provider_message_id",status.id).eq("direction","outbound").maybeSingle();
        if (message.data) {
          if(status.status!=="failed" && typeof status.recipient_id==="string") await recordRecipientIdentity(client,org,phoneId,message.data.phone,[{input:message.data.phone,wa_id:status.recipient_id}]);
          const archive = await client.rpc("archive_meta_whatsapp_message",{p_id:message.data.id});
          if (archive.error) throw new Error("Falha ao sincronizar histórico WhatsApp.");
        }
        stored++;
      }
      const touched = await client.from("meta_whatsapp_connections").update({webhook_at:new Date().toISOString()}).eq("organization_id",org).eq("phone_number_id",phoneId);
      if (touched.error) throw new Error("Falha ao registrar diagnóstico do webhook.");
    }
  }
  return {stored,unmapped};
}

// Echoes are messages already sent from the WhatsApp Business app or a companion
// (including the QR attendance session). They are kept for the official inbox, without
// CRM archive (the QR channel already records them), opt-out parsing or AI.
async function ingestCoexistenceRecords(client: SupabaseClient, org: string, phoneId: string, value: RecordValue) {
  let stored = 0;
  for (const echo of coexistenceEchoes(value)) {
    if (echo.timestamp > Date.now()+60000) continue;
    let phone: string;
    try { phone = officialPhone(echo.to); } catch { continue; }
    const saved = await client.from("meta_whatsapp_messages").upsert({organization_id:org,phone_number_id:phoneId,phone,direction:"outbound",message_type:echo.type,text_content:echo.text,content:{source:"business_app_echo"},provider_message_id:echo.id,status:"sent",occurred_at:new Date(echo.timestamp).toISOString()},{onConflict:"phone_number_id,provider_message_id",ignoreDuplicates:true});
    if (saved.error) throw new Error("Falha ao registrar mensagem enviada pelo app WhatsApp Business.");
    stored++;
  }
  const history = historySyncOutcome(value);
  if (history) {
    const saved = await client.from("meta_whatsapp_connections").update({history_sync_state:history}).eq("phone_number_id",phoneId).eq("coexistence",true);
    if (saved.error) throw new Error("Falha ao registrar sincronização do histórico.");
  }
  if (array(value.state_sync).length) {
    const saved = await client.from("meta_whatsapp_connections").update({contacts_sync_state:"received"}).eq("phone_number_id",phoneId).eq("coexistence",true);
    if (saved.error) throw new Error("Falha ao registrar sincronização de contatos.");
  }
  return stored;
}

// The business removed the partner or left coexistence in the app: stop campaigns and
// show the number as disconnected. History is preserved.
async function offboardCoexistence(client: SupabaseClient, wabaId: string) {
  if (!/^\d{5,30}$/.test(wabaId)) return;
  const changed = await client.from("meta_whatsapp_connections").update({status:"disconnected",webhook_subscribed:false}).eq("waba_id",wabaId).eq("coexistence",true).eq("status","connected").select("organization_id,phone_number_id");
  if (changed.error) throw new Error("Falha ao registrar desconexão da coexistência.");
  for (const row of changed.data ?? []) {
    const paused = await client.from("meta_whatsapp_campaigns").update({status:"paused",updated_at:new Date().toISOString()}).eq("organization_id",row.organization_id).eq("phone_number_id",row.phone_number_id).eq("status","running");
    if (paused.error) throw new Error("Falha ao pausar campanhas do número desconectado.");
  }
}
