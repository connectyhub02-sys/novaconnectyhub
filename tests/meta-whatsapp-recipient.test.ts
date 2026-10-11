import { describe,expect,it,vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { officialPhone } from "../src/lib/meta/whatsapp-policy";
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
