import { randomUUID } from "node:crypto";
import { expect,it,vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { commerceDatabase } from "./helpers/commerce-database";
import * as links from "../src/lib/whatsapp/outbound-links";
function fixture(){
 const db=commerceDatabase();
 const rpc=vi.fn(async(_name:string,args:Record<string,unknown>)=>{(db.tables.whatsapp_outbound_deliveries??=[]).push({id:args.p_id,status:"prepared",payload:args.p_payload});return{data:{organization_id:"org",lead_id:String(args.p_target),conversation_id:null},error:null};});
 const client={...db.client,rpc};
 const fetch=vi.fn(async(...args:[URL,RequestInit])=>{void args;return new Response('{"id":"receipt"}',{status:200});});
 const service=serverModuleHarness<typeof import("../src/lib/whatsapp/outbound-delivery")>("src/lib/whatsapp/outbound-delivery.ts",{
  "node:crypto":{randomUUID},"@/lib/supabase/service":{createServiceClient:()=>client},"@/lib/sales-catalog/mercado-pago":{getAppBaseUrl:()=>"https://app.invalid"},"./outbound-links":links,
 },[],{fetch});
 return{db,rpc,fetch,send:(path:string,body:unknown,extra={})=>service.fetchWhatsappOutbound(`https://provider.invalid/api${path}`,{method:"POST",body:JSON.stringify(body)},{instanceId:"instance",client:client as never,...extra})};
}
it("saves before HTTP, rewrites visible links and archives the exact wire body",async()=>{
 const f=fixture();f.fetch.mockImplementation(async(_url,init)=>{expect(f.db.tables.whatsapp_outbound_deliveries[0].status).toBe("sending");expect(f.db.tables.whatsapp_outbound_links).toHaveLength(1);const wire=JSON.parse(String(init.body));expect(wire.text).not.toContain("checkout.invalid");expect(wire.choices[0]).toContain("https://app.invalid/w/");return new Response('{"id":"receipt"}');});
 await f.send("/send/text",{number:"5511999999999",text:"https://checkout.invalid/pay?sig=exact"});
 expect(String(f.fetch.mock.calls[0][0])).toBe("https://provider.invalid/api/send/menu");expect(f.db.tables.whatsapp_outbound_deliveries[0]).toMatchObject({status:"sent",provider_message_id:"receipt"});
 expect(f.db.tables.whatsapp_outbound_links[0].target_url).toBe("https://checkout.invalid/pay?sig=exact");
});
it("does not send when archiving fails",async()=>{
 const f=fixture();f.rpc.mockResolvedValue({data:null,error:{code:"fail"}} as never);
 await expect(f.send("/send/text",{number:"phone",text:"Oi"})).rejects.toThrow("arquivo");expect(f.fetch).not.toHaveBeenCalled();
});
it("records ambiguous delivery without retry",async()=>{
 const f=fixture();f.fetch.mockRejectedValue(new Error("timeout"));
 await expect(f.send("/send/text",{number:"phone",text:"Oi"})).rejects.toThrow("timeout");expect(f.fetch).toHaveBeenCalledTimes(1);expect(f.db.tables.whatsapp_outbound_deliveries[0].status).toBe("uncertain");
});
it("does not repeat the original message if a companion fails",async()=>{
 const f=fixture();f.fetch.mockResolvedValueOnce(new Response('{"id":"asset"}')).mockRejectedValueOnce(new Error("timeout"));
 const response=await f.send("/send/media",{number:"phone",type:"image",file:"https://assets.invalid/image",text:"https://shop.invalid"});
 expect(response.ok).toBe(true);expect(f.db.tables.whatsapp_outbound_deliveries.map(r=>r.status)).toEqual(["sent","uncertain"]);expect(f.fetch).toHaveBeenCalledTimes(2);
});
it("creates per-recipient campaign links and preserves scheduling in one batch",async()=>{
 const f=fixture();await f.send("/sender/simple",{numbers:["5511999999999","5511888888888"],type:"text",text:"https://shop.invalid",scheduled_for:123456,delayMin:10,delayMax:30});
 expect(f.fetch).toHaveBeenCalledTimes(1);
 expect(String(f.fetch.mock.calls[0][0])).toBe("https://provider.invalid/api/sender/advanced");
 const wire=JSON.parse(String(f.fetch.mock.calls[0][1].body));expect(wire).toMatchObject({scheduled_for:123456,delayMin:10,delayMax:30});expect(wire.messages).toHaveLength(2);expect(wire.messages[0].choices[0]).not.toBe(wire.messages[1].choices[0]);
 expect(f.db.tables.whatsapp_outbound_deliveries.map(r=>r.status)).toEqual(["queued","queued"]);
});
it("archives verification activity without storing the code",async()=>{
 const f=fixture();await f.send("/send/text",{number:"phone",text:"Seu codigo ConnectyHub: 123456"},{sensitive:true});
 expect(JSON.stringify(f.db.tables.whatsapp_outbound_deliveries)).not.toContain("123456");expect(String(f.fetch.mock.calls[0][1].body)).toContain("123456");
});
it("does not degrade required buttons to a text-only status publication",async()=>{
 const f=fixture();await expect(f.send("/send/status",{type:"text",text:"https://shop.invalid"})).rejects.toThrow("não aceita botões");expect(f.fetch).not.toHaveBeenCalled();
});
