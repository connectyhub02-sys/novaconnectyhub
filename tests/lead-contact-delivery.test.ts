import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { commerceDatabase } from "./helpers/commerce-database";
import * as messages from "../src/lib/automations/lead-contact-message";

const url="https://fixture.invalid/contato/preferencias/10000000-0000-4000-8000-000000000001";
function agenda(audience="lead") {
  const db=commerceDatabase({
    leads:[{id:"lead",organization_id:"org",phone_number:"5511999999999",status:"active",metadata:{}}],
    customer_agenda_bookings:[{id:"booking",organization_id:"org",lead_id:"lead",resource_id:"resource",agent_id:"agent",conversation_id:"conversation",status:"booked",version:1,confirmed_at:"confirmed",starts_at:new Date(Date.now()+3600000).toISOString()}],
    customer_agenda_resources:[{id:"resource",organization_id:"org"}],customer_agenda_settings:[{organization_id:"org",enabled:true}],
    agent_registry:[{id:"agent",organization_id:"org",name:"Ana"}],
    whatsapp_instances:[{id:"instance",organization_id:"org",status:"connected",instance_token_encrypted:"credential",metadata:{agent_id:"agent"}}],
    customer_agenda_notices:[{id:"notice",organization_id:"org",booking_id:"booking",booking_version:1,recipient_phone:"5511999999999",audience,kind:"reminder",status:"pending",attempts:0,due_at:new Date(Date.now()-60000).toISOString(),message_text:"Seu horário está marcado."}],
  });
  const prepare=vi.fn(async():Promise<string|null>=>url),fetch=vi.fn(async(...args:[string,RequestInit])=>{void args;return new Response('{"id":"delivered"}');});
  const service=serverModuleHarness<typeof import("../src/lib/automations/agenda-notifications")>("src/lib/automations/agenda-notifications.ts",{
    "node:crypto":{randomUUID},"./lead-contact-preferences":{prepareLeadContact:prepare},"./lead-contact-message":messages,
    "@/lib/agents/responsible-human":{normalizeBrazilianWhatsappPhone:(v:string)=>v,readAgentResponsibleHumans:()=>[{phone:"5511999999999",notifyOperational:true}]},
    "@/lib/whatsapp/conversation-sender":{resolveConversationSender:async()=>({whatsappInstanceId:"instance"})},
    "@/lib/whatsapp/uazapi-credentials":{loadUazapiCredentials:async()=>({baseUrl:"https://provider.invalid"})},
    "@/lib/security/credentials-crypto":{decryptCredentialValue:()=>"test"},"@/lib/billing/contract-access":{getContractAccess:async()=>({allowed:true})},
  },[],{fetch});
  return {db,prepare,fetch,run:()=>service.dispatchAgendaNotifications(db.client as never)};
}
it("includes and archives the unsubscribe action on lead reminders",async()=>{
  const f=agenda();expect(await f.run()).toEqual({sent:1});
  expect(f.fetch.mock.calls[0][0]).toMatch(/\/send\/menu$/);
  const body=JSON.parse(String(f.fetch.mock.calls[0][1].body));
  expect(body.choices).toEqual([`Sair da lista|${url}`]);
  expect(f.db.tables.conversation_messages[0].text_content).toBe(body.text);
});
it("does not send a reminder after the final consent check is denied",async()=>{
  const f=agenda();f.prepare.mockResolvedValue(null);expect(await f.run()).toEqual({sent:0});
  expect(f.fetch).not.toHaveBeenCalled();expect(f.db.tables.customer_agenda_notices[0]).toMatchObject({status:"skipped",reason:"lead_opted_out"});
});
it("does not attach a lead's unsubscribe link to responsible-human operational notices",async()=>{
  const f=agenda("responsible");expect(await f.run()).toEqual({sent:1});
  expect(f.prepare).not.toHaveBeenCalled();expect(String(f.fetch.mock.calls[0][1].body)).not.toContain("contato/preferencias");
});
it("respects cancellation of a processing reminder before the delivery claim",async()=>{
  const f=agenda();f.prepare.mockImplementation(async()=>{f.db.tables.customer_agenda_notices[0].status="skipped";return url;});
  expect(await f.run()).toEqual({sent:0});expect(f.fetch).not.toHaveBeenCalled();
});

it("records exit even on duplicate webhooks, scoped to the sending lead and independent of an agent",async()=>{
  const base=commerceDatabase({leads:[{id:"lead",organization_id:"org",phone_number:"5511999999999"},{id:"other",organization_id:"foreign",phone_number:"5511999999999"}],whatsapp_instances:[{id:"instance",organization_id:"org",provider_instance_id:"provider",provider:"uazapi",status:"connected"}],whatsapp_webhook_events:[{id:"event",provider:"uazapi",provider_message_id:"reply"}]});
  const client={from:(table:string)=>{
    const q=base.client.from(table);
    if(table==="whatsapp_webhook_events")q.insert=()=>({select:()=>({single:async()=>({error:{code:"23505"},data:null})})}) as never;
    return q;
  }};
  const optOut=vi.fn(async()=>{});
  const service=serverModuleHarness<typeof import("../src/lib/whatsapp/webhook-ingest")>("src/lib/whatsapp/webhook-ingest.ts",{
    "node:crypto":{createHash},"@/lib/automations/lead-contact-preferences":{optOutLeadContact:optOut},"@/lib/automations/lead-contact-message":messages,
    "./lead-avatar-sync":{readLeadProfileImageUrl:()=>null},
  });
  const input={client:client as never,eventType:"messages",requestUrl:"https://fixture.invalid/webhook?instanceId=provider",headers:new Headers(),payload:{message:{id:"reply",fromMe:false,chatid:"5511999999999@s.whatsapp.net",text:"sair_da_lista"}}};
  const result=await service.ingestUazapiWebhook(input);
  expect(result.status).toBe("duplicate");expect(optOut).toHaveBeenCalledExactlyOnceWith(client,"org","lead","whatsapp_agent");
  optOut.mockRejectedValue(new Error("database offline"));
  await expect(service.ingestUazapiWebhook(input)).rejects.toThrow("database offline");
});

function meeting(metadata:Record<string,unknown>={}) {
  const db=commerceDatabase({
    leads:[{id:"lead",organization_id:"org",phone_number:"5511999999999",status:"active",metadata}],
    custom_software_requests:[{id:"request",organization_id:"org",lead_id:"lead",conversation_id:"conversation",slot_id:"slot",status:"booked"}],
    custom_software_meeting_slots:[{id:"slot",status:"booked",starts_at:new Date(Date.now()+3600000).toISOString()}],
    conversations:[{id:"conversation",organization_id:"org",lead_id:"lead",whatsapp_instance_id:"instance"}],
    whatsapp_instances:[{id:"instance",organization_id:"org",status:"connected",instance_token_encrypted:"credential",metadata:{platform_whatsapp:true}}],
    custom_software_meeting_notices:[{id:"notice",request_id:"request",slot_id:"slot",state:"claimed"}],
  });
  let claimed=false;
  const client={...db.client,rpc:async()=>{const data=claimed?null:db.tables.custom_software_meeting_notices[0];claimed=true;return{error:null,data};}};
  const prepare=vi.fn(async():Promise<string|null>=>url),fetch=vi.fn(async(...args:[string,RequestInit])=>{void args;return new Response('{"id":"delivered"}');});
  const service=serverModuleHarness<typeof import("../src/lib/whatsapp/custom-meeting-reminders")>("src/lib/whatsapp/custom-meeting-reminders.ts",{
    "@/lib/automations/lead-contact-preferences":{prepareLeadContact:prepare},"@/lib/automations/lead-contact-message":messages,
    "./uazapi-credentials":{loadUazapiCredentials:async()=>({baseUrl:"https://provider.invalid"})},
    "@/lib/security/credentials-crypto":{decryptCredentialValue:()=>"test"},"@/lib/billing/contract-access":{getContractAccess:async()=>({allowed:true})},
  },[],{fetch});
  return {db,prepare,fetch,run:()=>service.processCustomMeetingReminders(client as never)};
}
it("includes the exit link and button in custom meeting reminders",async()=>{
  const f=meeting();expect(await f.run()).toEqual({sent:1});
  const body=JSON.parse(String(f.fetch.mock.calls[0][1].body));expect(body.choices).toEqual([`Sair da lista|${url}`]);
  expect(f.db.tables.conversation_messages[0].text_content).toBe(body.text);
});
it("honors legacy nested opt-out on custom meetings",async()=>{
  const f=meeting({opt_out:{requested_at:new Date().toISOString()}});
  expect(await f.run()).toEqual({sent:0});expect(f.fetch).not.toHaveBeenCalled();
  expect(f.db.tables.custom_software_meeting_notices[0].state).toBe("cancelled");
});
it("honors the final shared preference on custom meetings",async()=>{
  const f=meeting();f.prepare.mockResolvedValue(null);
  expect(await f.run()).toEqual({sent:0});expect(f.fetch).not.toHaveBeenCalled();
  expect(f.db.tables.custom_software_meeting_notices[0].state).toBe("cancelled");
});
