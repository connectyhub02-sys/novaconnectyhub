import * as trackingOrigin from "../src/lib/whatsapp/tracking-origin";
import * as billingMessages from "../src/lib/billing/platform-billing-messages";
import * as noticeActions from "../src/lib/billing/account-notice-actions";
import { createHash, randomUUID } from "node:crypto";
import { afterEach,expect,it,vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { commerceDatabase } from "./helpers/commerce-database";
import * as links from "../src/lib/whatsapp/outbound-links";
afterEach(()=>vi.unstubAllEnvs());
it("transports native API links unchanged without CH CRM or tracking and replays once",async()=>{
 vi.stubEnv("WHATSAPP_NATIVE_LINK_ORIGINS_JSON",JSON.stringify({org:"https://betel.example"}));
 const f=fixture();
 const body={number:"phone",text:"Veja https://betel.example/w/native",file:"https://media.example/audio.mp3",type:"audio",track_id:"native-one",choices:["Abrir|https://betel.example/w/native"]};
 expect((await f.send("/send/media",body,{apiOrganizationId:"org"})).status).toBe(200);
 expect(JSON.parse(String(f.fetch.mock.calls[0][1].body))).toEqual(body);
 expect(String(f.fetch.mock.calls[0][0])).toBe("https://provider.invalid/api/send/media");
 await f.send("/send/media",body,{apiOrganizationId:"org"});
 expect(f.fetch).toHaveBeenCalledTimes(1);
 expect(f.db.tables.whatsapp_outbound_deliveries??[]).toHaveLength(0);
 expect(f.db.tables.whatsapp_outbound_links??[]).toHaveLength(0);
 expect(f.rpc.mock.calls.every(([name])=>name==="claim_whatsapp_outbound_operation")).toBe(true);
 expect(f.db.tables.whatsapp_outbound_operations[0]).toMatchObject({status:"sent",delivery_ids:[]});
});
it("blocks untrusted navigation and missing stable keys before native dispatch",async()=>{
 vi.stubEnv("WHATSAPP_NATIVE_LINK_ORIGINS_JSON",JSON.stringify({org:"https://betel.example"}));
 const f=fixture();
 expect((await f.send("/send/text",{number:"phone",text:"https://evil.example",track_id:"native-block"},{apiOrganizationId:"org"})).status).toBe(422);
 expect((await f.send("/send/menu",{number:"phone",choices:["Abrir|https://user:password@betel.example/w/id"],track_id:"native-credentials"},{apiOrganizationId:"org"})).status).toBe(422);
 expect((await f.send("/send/menu",{number:"phone",choices:["Abrir|url:javascript:alert(1)"],track_id:"native-script"},{apiOrganizationId:"org"})).status).toBe(422);
 expect((await f.send("/send/text",{number:"phone",text:"https://betel.example/w/id"},{apiOrganizationId:"org"})).status).toBe(422);
 expect(f.fetch).not.toHaveBeenCalled();
 expect(f.db.tables.whatsapp_outbound_operations.every(row=>row.status==="failed")).toBe(true);
 expect(f.db.tables.whatsapp_outbound_deliveries??[]).toHaveLength(0);
});
it("replays legacy archived receipts after native mode activation without new sends",async()=>{
 const f=fixture();
 const body={number:"phone",text:"https://shop.invalid/old",track_id:"before-native"};
 await f.send("/send/text",body,{apiOrganizationId:"org"});
 const archived=f.db.tables.whatsapp_outbound_deliveries.length;
 vi.stubEnv("WHATSAPP_NATIVE_LINK_ORIGINS_JSON",JSON.stringify({org:"https://betel.example"}));
 expect((await f.send("/send/text",body,{apiOrganizationId:"org"})).status).toBe(200);
 expect(f.fetch).toHaveBeenCalledTimes(1);
 expect(f.db.tables.whatsapp_outbound_deliveries).toHaveLength(archived);
});
it("cannot enable native mode from payload or another organization's configuration",async()=>{
 vi.stubEnv("WHATSAPP_NATIVE_LINK_ORIGINS_JSON",JSON.stringify({other:"https://betel.example"}));
 const f=fixture();
 await f.send("/send/text",{number:"phone",text:"https://betel.example/w/id",apiOrganizationId:"other",native_links:true},{apiOrganizationId:"org"});
 expect(f.db.tables.whatsapp_outbound_deliveries.length).toBeGreaterThan(0);
 expect(f.db.tables.whatsapp_outbound_links).toHaveLength(1);
 expect(String(f.fetch.mock.calls[0][1].body)).toContain("https://app.invalid/w/");
});
it("preserves an uncertain native receipt without automatically sending again",async()=>{
 vi.stubEnv("WHATSAPP_NATIVE_LINK_ORIGINS_JSON",JSON.stringify({org:"https://betel.example"}));
 const f=fixture();f.fetch.mockRejectedValue(Error("timeout"));
 const body={number:"phone",text:"https://betel.example/w/id",track_id:"native-timeout"};
 expect((await f.send("/send/text",body,{apiOrganizationId:"org"})).status).toBe(502);
 expect((await f.send("/send/text",body,{apiOrganizationId:"org"})).status).toBe(503);
 expect(f.fetch).toHaveBeenCalledTimes(1);
 expect(f.db.tables.whatsapp_outbound_operations[0].status).toBe("uncertain");
 expect(f.db.tables.whatsapp_outbound_deliveries??[]).toHaveLength(0);
});
it("uses the reserved organization origin and ignores payload origin",async()=>{
 vi.stubEnv("WHATSAPP_TRACKING_ORIGINS_JSON",JSON.stringify({org:"https://betel.example"}));
 const f=fixture();
 await f.send("/send/text",{number:"phone",text:"https://shop.invalid/item",origin:"https://untrusted.invalid"});
 const saved=f.db.tables.whatsapp_outbound_links[0];
 const wire=String(f.fetch.mock.calls[0][1].body);
 expect(wire).toContain(`https://betel.example/w/${saved.id}`);
 expect(saved).toMatchObject({organization_id:"org",target_url:"https://shop.invalid/item"});
});
function fixture(){
 const db=commerceDatabase();
 const rpc=vi.fn(async(_name:string,args:Record<string,unknown>)=>{
  if(_name==="claim_whatsapp_outbound_operation") {
    const rows=db.tables.whatsapp_outbound_operations??=[];
    let op=rows.find(r=>r.whatsapp_instance_id===args.p_instance && r.operation_key===args.p_key);
    if(op && op.request_hash!==args.p_hash)return {data:null,error:{message:"OUTBOUND_KEY_CONFLICT"}};
    const claimed=!op || op.status==="failed";
    if(!op){op={id:randomUUID(),whatsapp_instance_id:args.p_instance,operation_key:args.p_key,request_hash:args.p_hash,status:"preparing",delivery_ids:[]};rows.push(op);}
    if(claimed){op.claim_token=args.p_claim;op.status="preparing";}
    return {data:{...op,claimed},error:null};
  }
  (db.tables.whatsapp_outbound_deliveries??=[]).push({id:args.p_id,whatsapp_instance_id:args.p_instance,lead_id:String(args.p_target),path:args.p_path,status:"prepared",payload:args.p_payload});return{data:{organization_id:"org",lead_id:String(args.p_target),conversation_id:null},error:null};});
 const client={...db.client,rpc};
 const fetch=vi.fn(async(...args:[URL,RequestInit])=>{void args;return new Response('{"id":"receipt"}',{status:200});});
 const service=serverModuleHarness<typeof import("../src/lib/whatsapp/outbound-delivery")>("src/lib/whatsapp/outbound-delivery.ts",{
  "node:crypto":{randomUUID,createHash},"@/lib/supabase/service":{createServiceClient:()=>client},"@/lib/sales-catalog/mercado-pago":{getAppBaseUrl:()=>"https://app.invalid"},"./outbound-links":links,"./tracking-origin":trackingOrigin,
 },[],{fetch});
 return{db,rpc,fetch,service,send:(path:string,body:unknown,extra={})=>service.fetchWhatsappOutbound(`https://provider.invalid/api${path}`,{method:"POST",body:JSON.stringify(body)},{instanceId:"instance",client:client as never,...extra})};
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
 expect((await f.send("/send/text",{number:"phone",text:"Oi"})).status).toBe(502);expect(f.fetch).toHaveBeenCalledTimes(1);expect(f.db.tables.whatsapp_outbound_deliveries[0].status).toBe("uncertain");
});
it("does not repeat the original message if a companion fails",async()=>{
 const f=fixture();f.fetch.mockResolvedValueOnce(new Response('{"id":"asset"}')).mockRejectedValueOnce(new Error("timeout"));
 const response=await f.send("/send/media",{number:"phone",type:"image",file:"https://assets.invalid/image",text:"https://shop.invalid"});
 expect(response.status).toBe(502);expect(await response.json()).toMatchObject({partial:true});expect(f.db.tables.whatsapp_outbound_deliveries.map(r=>r.status)).toEqual(["sent","uncertain"]);expect(f.fetch).toHaveBeenCalledTimes(2);
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

it("retries only the definitively rejected companion with a stable caller key",async()=>{
 const f=fixture();f.fetch.mockResolvedValueOnce(Response.json({id:"image"})).mockResolvedValueOnce(Response.json({error:"rejected"},{status:400}));
 const body={number:"phone",type:"image",file:"https://assets.invalid/a",text:"https://shop.invalid",track_id:"event-123"};
 expect((await f.send("/send/media",body)).status).toBe(502);
 const resumed=await f.send("/send/media",body);
 expect(resumed.ok).toBe(true);expect(await resumed.json()).toMatchObject({id:"image"});
 expect(f.fetch.mock.calls.map(x=>String(x[0]).split("/api")[1])).toEqual(["/send/media","/send/menu","/send/menu"]);
 expect((await f.send("/send/media",body)).ok).toBe(true);expect(f.fetch).toHaveBeenCalledTimes(3);
});
it("does not restart an uncertain part or let a reused key change its message",async()=>{
 const f=fixture();f.fetch.mockResolvedValueOnce(Response.json({id:"image"})).mockRejectedValueOnce(new Error("timeout"));
 const body={number:"phone",type:"image",file:"https://assets.invalid/a",text:"https://shop.invalid",track_id:"event-123"};
 await f.send("/send/media",body);expect((await f.send("/send/media",body)).status).toBe(503);expect(f.fetch).toHaveBeenCalledTimes(2);
 await expect(f.send("/send/media",{...body,text:"different"})).rejects.toThrow("operação");expect(f.fetch).toHaveBeenCalledTimes(2);
});
it("serializes concurrent attempts at the common delivery boundary",async()=>{
 const f=fixture();let release:()=>void=()=>{};const gate=new Promise<void>(r=>{release=r;});
 f.fetch.mockImplementation(async()=>{await gate;return Response.json({id:"sent"});});
 const body={number:"phone",text:"https://shop.invalid",track_id:"same-event"};
 const first=f.send("/send/text",body);await vi.waitFor(()=>expect(f.fetch).toHaveBeenCalledTimes(1));
 expect((await f.send("/send/text",body)).status).toBe(503);release();expect((await first).ok).toBe(true);expect(f.fetch).toHaveBeenCalledTimes(1);
});
it("preserves the alternate URL button encoding without duplicating its destination",async()=>{
 const f=fixture();await f.send("/send/menu",{number:"phone",type:"button",text:"Pagamento",choices:["Pagar|url:https://shop.invalid/pay"],track_id:"alternative_url"});
 expect(f.fetch).toHaveBeenCalledTimes(1);
 const body=JSON.parse(String(f.fetch.mock.calls[0][1].body));
 expect(body.choices).toHaveLength(1);expect(body.choices[0]).toMatch(/^Pagar\|url:https:\/\/app.invalid\/w\//);
});

it.each(["account","agent_responsible"])("delivers the Eliane renewal notice to %s without raw URLs and preserves payment/exit destinations",async audience=>{
 const f=fixture();
 const billing=serverModuleHarness<{sendBillingWhatsappNotice:(input:Record<string,unknown>)=>Promise<unknown>}>("src/lib/billing/platform-billing-webhook.ts",{
  "./account-notice-actions":noticeActions,
  "@/lib/billing/platform-billing-messages":billingMessages,
  "@/lib/whatsapp/outbound-delivery":f.service,
 },["sendBillingWhatsappNotice"]);
 const pay="https://platform.invalid/dashboard/planos/checkout/synthetic",exit="https://platform.invalid/avisos/synthetic";
 await billing.sendBillingWhatsappNotice({outbound:{instanceId:"instance",client:{...f.db.client,rpc:f.rpc}},credentials:{baseUrl:"https://provider.invalid"},token:"test",phone:"5511999999999",
  message:`Seu plano vencerá em breve. Finalizar pagamento: ${pay}\nSair da lista: ${exit}`,button:{label:"Finalizar pagamento",url:pay},actions:{unsubscribeUrl:exit},trackId:`renewal-${audience}`});
 expect(f.fetch).toHaveBeenCalledTimes(1);
 const wire=JSON.parse(String(f.fetch.mock.calls[0][1].body));
 expect(wire.text).not.toMatch(/https?:\/\//);expect(wire.footerText).not.toMatch(/https?:\/\//);
 expect(wire.choices.map((c:string)=>c.split("|")[0])).toEqual(["Finalizar pagamento","Sair da lista"]);
 expect(f.db.tables.whatsapp_outbound_links.map(r=>r.target_url)).toEqual([pay,exit]);
 expect(f.db.tables.whatsapp_outbound_deliveries[0].text_content).toBe(wire.text);
});
it("removes URLs from all visible nested fields, preserving media and every action",async()=>{
 const f=fixture();await f.send("/send/carousel",{number:"phone",text:"Confira https://shop.invalid/a",footer:"https://shop.invalid/b",cards:[{title:"https://shop.invalid/c",description:"https://shop.invalid/d",image:"https://assets.invalid/a",buttons:[{text:"Abrir https://shop.invalid/e",url:"https://shop.invalid/f"}]}]});
 const primary=JSON.parse(String(f.fetch.mock.calls[0][1].body));
 expect(primary.text+primary.footer+primary.cards[0].title+primary.cards[0].description+primary.cards[0].buttons[0].text).not.toMatch(/https?:\/\//);
 expect(primary.cards[0].image).toBe("https://assets.invalid/a");
 expect(f.db.tables.whatsapp_outbound_links).toHaveLength(6);
 const allWire=f.fetch.mock.calls.map(c=>JSON.parse(String(c[1].body)));
 for(const row of f.db.tables.whatsapp_outbound_links) expect(JSON.stringify(allWire)).toContain(`/w/${row.id}`);
});
