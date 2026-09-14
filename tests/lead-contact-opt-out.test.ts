import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as page from "../src/lib/automations/lead-contact-page";
import { accountNoticePageHeaders } from "../src/lib/billing/account-notice-page";
import { leadContactMessage, sendLeadContactMessage, isExplicitLeadOptOut, leadOptOutButtonReply } from "../src/lib/automations/lead-contact-message";

const key = "10000000-0000-4000-8000-000000000001", url = `https://fixture.invalid/contato/preferencias/${key}`;
function fixture() {
  const load = vi.fn(async () => ({ enabled: true, phone: "5511999999999" })), optOut = vi.fn(async () => true);
  const route = serverModuleHarness<typeof import("../src/app/contato/preferencias/[key]/route")>("src/app/contato/preferencias/[key]/route.ts", {
    "@/lib/supabase/service": { createServiceClient: () => "service" },
    "@/lib/automations/lead-contact-preferences": { loadLeadContactLink: load, optOutLeadContactByKey: optOut, validLeadContactKey: (v: string) => v === key },
    "@/lib/automations/lead-contact-page": page,
    "@/lib/billing/account-notice-page": { accountNoticePageHeaders },
  }, [], { Response });
  return { route, load, optOut, context: { params: Promise.resolve({ key }) } };
}
it("keeps previews read-only, private and free of lead identity", async () => {
  const f=fixture(), response=await f.route.GET(new Request(url),f.context), text=await response.text();
  expect(text).toContain('method="post"'); expect(text).not.toContain("5511999999999");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer"); expect(f.optOut).not.toHaveBeenCalled();
});
it("records only explicit POST confirmation and never accepts public reactivation", async () => {
  const f=fixture();
  for(const action of ["subscribe","", "unsubscribe"]){
    const response=await f.route.POST(new Request(url,{method:"POST",body:new URLSearchParams({action})}),f.context);
    expect(response.status).toBe(action==="unsubscribe"?200:422);
  }
  expect(f.optOut).toHaveBeenCalledExactlyOnceWith("service",key);
});
it("rejects invalid and foreign-origin requests and permits the private browser form", async () => {
  const f=fixture();
  expect((await f.route.GET(new Request(url),{params:Promise.resolve({key:"bad"})})).status).toBe(404);
  expect(f.load).not.toHaveBeenCalled();
  for(const [origin,site,status] of [["https://foreign.invalid","cross-site",403],["null","cross-site",403],["null","same-origin",200]] as const){
    expect((await f.route.POST(new Request(url,{method:"POST",headers:{origin,"sec-fetch-site":site},body:new URLSearchParams({action:"unsubscribe"})}),f.context)).status).toBe(status);
  }
  expect(f.optOut).toHaveBeenCalledTimes(1);
});
it("does not claim success when the preference database fails",async()=>{
  const f=fixture();f.optOut.mockRejectedValue(new Error("offline"));
  const response=await f.route.POST(new Request(url,{method:"POST",body:new URLSearchParams({action:"unsubscribe"})}),f.context);
  expect(response.status).toBe(503);expect(await response.text()).toContain("Sua escolha não foi confirmada");
});
it("preserves every agenda action without mixing URL and quick reply buttons",async()=>{
  const delivery=leadContactMessage("Seu horário",url,["Confirmar|agenda-action:a","Remarcar|agenda-action:b","Cancelar|agenda-action:c"]);
  const send=vi.fn(async()=>({ok:true,status:200}));
  await sendLeadContactMessage(send,delivery,async()=>true);
  expect(send.mock.calls[0]).toEqual(["/send/menu",{...delivery,type:"button"}]);
  expect(delivery.choices).toHaveLength(4);expect(delivery.choices.at(-1)).toBe(`Sair da lista|${url}`);expect(delivery.text).not.toContain(url);
});
it.each([400,404,405,422])("preserves required actions and returns a definitive rejection %i without text fallback",async status=>{
  const send=vi.fn().mockResolvedValueOnce({ok:false,status}).mockResolvedValueOnce({ok:true,status:200});
  await sendLeadContactMessage(send,leadContactMessage("Mensagem",url),async()=>true);
  expect(send).toHaveBeenCalledTimes(1);expect(send.mock.calls[0][1].choices).toContain(`Sair da lista|${url}`);
});
it.each([0,408,429,500,503])("does not duplicate ambiguous or retry-later delivery %i",async status=>{
  const send=vi.fn(async()=>({ok:false,status}));
  await sendLeadContactMessage(send,leadContactMessage("Mensagem",url),async()=>true);
  expect(send).toHaveBeenCalledTimes(1);
});
it("checks consent before sending required actions",async()=>{
  const send=vi.fn(async()=>({ok:false,status:400}));
  await expect(sendLeadContactMessage(send,leadContactMessage("Mensagem",url),async()=>false)).rejects.toThrow("não autorizado");
  expect(send).not.toHaveBeenCalled();
});
it("recognizes actual exit replies without treating quoted buttons or appointment cancellation as unsubscribe",()=>{
  expect(isExplicitLeadOptOut("Sair da lista")).toBe(true);expect(isExplicitLeadOptOut("sair_da_lista")).toBe(true);
  expect(isExplicitLeadOptOut("cancelar")).toBe(false);expect(isExplicitLeadOptOut("Não quero sair da lista")).toBe(false);
  expect(leadOptOutButtonReply({content:{listResponseMessage:{singleSelectReply:{selectedRowId:"sair_da_lista"}}}})).toBe("sair_da_lista");
  expect(leadOptOutButtonReply({message:{buttonsResponseMessage:{selectedButtonId:"sair_da_lista"}}})).toBe("sair_da_lista");
  expect(leadOptOutButtonReply({interactiveResponseMessage:{nativeFlowResponseMessage:{paramsJson:'{"id":"sair_da_lista"}'}}})).toBe("sair_da_lista");
  expect(leadOptOutButtonReply({contextInfo:{quotedMessage:{buttonsResponseMessage:{selectedButtonId:"sair_da_lista"}}}})).toBeNull();
});
