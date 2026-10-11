import { describe,expect,it,vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as crypto from "node:crypto";
import { officialPhone,serviceWindowOpen } from "../src/lib/meta/whatsapp-policy";
const recipientModule=serverModuleHarness<typeof import("../src/lib/meta/whatsapp-recipient")>("src/lib/meta/whatsapp-recipient.ts",{"./whatsapp-policy":{officialPhone}});
const input="5511987654321",waId="551187654321";
describe("provider-confirmed WhatsApp identity",()=>{
 it("never guesses that the Brazilian ninth digit denotes the same recipient",()=>{
  expect(recipientModule.recipientIdentity(waId,[])).toEqual({waId,phone:waId,phones:[waId]});
 });
 it("resolves both phone formats to the confirmed send address and all preference records",()=>{
  const aliases=[{input_phone:input,wa_id:waId}];
  for(const phone of [input,waId]) {
   const result=recipientModule.recipientIdentity(phone,aliases);
   expect(result.phone).toBe(input);expect(result.waId).toBe(waId);
   expect(result.phones.sort()).toEqual([input,waId].sort());
  }
 });
 it("does not discard another proven alias when checking consent and opt-out",()=>{
  const other="5511976543210";
  expect(recipientModule.recipientIdentity(input,[{input_phone:input,wa_id:waId},{input_phone:other,wa_id:waId}]).phones).toContain(other);
 });
 it("fails closed when a number would resolve to two identities",()=>{
  expect(()=>recipientModule.recipientIdentity(waId,[{input_phone:input,wa_id:waId},{input_phone:waId,wa_id:"551111111111"}])).toThrow(/conflitante/);
 });
 it("only records the contact corresponding to the successful send input",async()=>{
  const upsert=vi.fn(async(row:Record<string,unknown>)=>{void row;return {error:null};});const client={from:vi.fn(()=>({upsert}))};
  await recipientModule.recordRecipientIdentity(client as never,"org-a","sender-a",input,[{input:"551111111111",wa_id:waId},{input,wa_id:waId}]);
  expect(upsert).toHaveBeenCalledTimes(1);
  expect(upsert.mock.calls[0][0]).toMatchObject({organization_id:"org-a",phone_number_id:"sender-a",input_phone:input,wa_id:waId});
 });
});

describe("send with a verified recipient alias",()=>{
 function fixture(blockedPhone?:string,inboundAt=new Date().toISOString()) {
  const fetch=vi.fn(async()=>Response.json({messages:[{id:"wamid.test"}],contacts:[{input,wa_id:waId}]}));
  const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>({data:name==="meta_whatsapp_contact_allowed" ? args.p_phone!==blockedPhone : null,error:null}));
  const client={rpc,from:(table:string)=>{
   let operation="select",selected="";
   const result=()=>({error:null,data:table==="meta_whatsapp_messages"&&selected==="occurred_at"?{occurred_at:inboundAt}:table==="meta_whatsapp_contacts"?[{phone:waId,last_inbound_at:inboundAt,opted_out:false}]:table==="integration_credentials"?[]:operation==="insert"?{id:"local-message",status:"sending"}:null});
   const q={select:(s:string)=>{selected=s;return q;},order:()=>q,limit:()=>q,eq:()=>q,is:()=>q,in:()=>q,insert:()=>{operation="insert";return q;},update:()=>q,maybeSingle:async()=>result(),single:async()=>result(),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};return q;
  }};
  const cloud=serverModuleHarness<typeof import("../src/lib/meta/whatsapp-cloud")>("src/lib/meta/whatsapp-cloud.ts",{
   "node:crypto":crypto,"./whatsapp-policy":{officialPhone,serviceWindowOpen},
   "./whatsapp-recipient":{recipientIdentity:recipientModule.recipientIdentity,recipientAliases:async()=>[{input_phone:input,wa_id:waId}],recordRecipientIdentity:async()=>{}},
   "@/lib/client-os/guided-oauth":{loadMetaGuidedOAuthConfig:async()=>({graphVersion:"v25.0",appSecret:"test"})},
   "@/lib/security/credentials-crypto":{decryptCredentialValue:()=>"test-token"},
   "@/lib/whatsapp/outbound-links":{collectOutboundLinks:()=>[]},
  },[],{fetch});
  const send=()=>cloud.sendOfficialMessage(client as never,{organization_id:"org-a",phone_number_id:"123456",webhook_subscribed:true,encrypted_token:"encrypted"} as never,"actor",{phone:waId,type:"text",text:"Resposta",requestKey:"00000000-0000-0000-0000-000000000001"});
  return {send,fetch,rpc};
 }
 it("uses the allowed input while accepting the actual inbound window on wa_id",async()=>{
  const f=fixture();await f.send();
  const options=f.fetch.mock.calls[0] as unknown as [URL,RequestInit];
  expect(JSON.parse(options[1].body as string).to).toBe(input);
  expect(f.rpc.mock.calls.filter(c=>c[0]==="meta_whatsapp_contact_allowed").map(c=>c[1].p_phone).sort()).toEqual([input,waId].sort());
 });
 it("blocks either identity's CRM opt-out before any external send",async()=>{
  for(const phone of [input,waId]) {const f=fixture(phone);await expect(f.send()).rejects.toThrow(/desativado/);expect(f.fetch).not.toHaveBeenCalled();}
 });
 it("does not extend the 24-hour window from an identity association",async()=>{
  const f=fixture(undefined,new Date(Date.now()-25*3600000).toISOString());await expect(f.send()).rejects.toThrow(/24 horas/);expect(f.fetch).not.toHaveBeenCalled();
 });
});
