import * as crypto from "node:crypto";
import { describe,expect,it,vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { officialPhone,serviceWindowOpen,officialOptOut,templateInput } from "../src/lib/meta/whatsapp-policy";
import { NextRequest } from "next/server";

describe("official WhatsApp policy",()=>{
  it("enforces an actual inbound 24h window",()=>{
    const now=Date.parse("2026-10-11T07:00:00Z");
    expect(serviceWindowOpen(null,now)).toBe(false);
    expect(serviceWindowOpen("2026-10-10T07:00:00Z",now)).toBe(false);
    expect(serviceWindowOpen("2026-10-10T07:00:01Z",now)).toBe(true);
    expect(serviceWindowOpen("2026-10-12T07:00:00Z",now)).toBe(false);
  });
  it("normalizes phones and rejects arbitrary provider recipients",()=>{
    expect(officialPhone("+55 (11) 99999-9999")).toBe("5511999999999");
    expect(()=>officialPhone("123@g.us")).toThrow();
    expect(()=>officialPhone("123/../../messages")).toThrow();
  });
  it("preserves explicit opt-out decisions",()=>{
    expect(officialOptOut("Não quero receber mais mensagens.")).toBe(true);
    expect(officialOptOut("STOP")).toBe(true);
    expect(officialOptOut("Vou sair agora, respondo depois")).toBe(false);
  });
  it("rejects unsupported template variables and categories",()=>{
    expect(()=>templateInput({name:"demo_test",text:"Olá {{1}}"})).toThrow();
    expect(()=>templateInput({name:"demo_test",text:"Olá",category:"AUTHENTICATION"})).toThrow();
    expect(templateInput({name:"demo_test",text:"Olá"}).category).toBe("MARKETING");
  });
});

describe("official Graph boundary",()=>{
  const config={graphVersion:"v25.0",appSecret:"private-app-secret"};
  function fixture(fetch:ReturnType<typeof vi.fn>){return serverModuleHarness<typeof import("../src/lib/meta/whatsapp-cloud")>("src/lib/meta/whatsapp-cloud.ts",{"node:crypto":crypto},[],{fetch});}
  it("never follows arbitrary API paths",async()=>{
    const fetch=vi.fn(); await expect(fixture(fetch).cloudRequest(config,"token","https://evil.test")).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
  });
  it("does not expose provider errors containing credentials",async()=>{
    const fetch=vi.fn(async()=>Response.json({error:{code:190,message:"private-token"}},{status:400}));
    await expect(fixture(fetch).cloudRequest(config,"token","123456/messages",{})).rejects.toThrow("190");
    try{await fixture(fetch).cloudRequest(config,"token","123456/messages",{});}catch(e){expect(String(e)).not.toContain("private-token");}
  });
  it("treats timeouts and server failures as uncertain to prevent resends",async()=>{
    const timeout=fixture(vi.fn(async()=>{throw new Error("timeout");}));
    await expect(timeout.cloudRequest(config,"token","123456/messages",{})).rejects.toMatchObject({uncertain:true});
    const server=fixture(vi.fn(async()=>Response.json({error:{code:2}},{status:503})));
    await expect(server.cloudRequest(config,"token","123456/messages",{})).rejects.toMatchObject({uncertain:true});
  });
  it("uses bearer and appsecret proof without token in message URL",async()=>{
    const fetch=vi.fn(async()=>Response.json({messages:[{id:"wamid.1"}]}));
    await fixture(fetch).cloudRequest(config,"private-token","123456/messages",{to:"5511999999999"});
    const [url,options]=fetch.mock.calls[0] as unknown as [URL,RequestInit];
    expect(url.hostname).toBe("graph.facebook.com");expect(url.href).not.toContain("private-token");expect(options.headers).toMatchObject({Authorization:"Bearer private-token"});
  });
});

describe("official route authorization",()=>{
  function fixture(workspace:unknown, role="owner"){
    const client={from:vi.fn(()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{id:"internal-company"}})};return q;})};
    const access=serverModuleHarness<typeof import("../src/lib/meta/whatsapp-auth")>("src/lib/meta/whatsapp-auth.ts",{
      "@/lib/supabase/profile":{getCurrentWorkspace:async()=>workspace},"@/lib/supabase/service":{createServiceClient:()=>client},
      "@/lib/client-os/companies":{requireClientCompanyAccess:async()=>({role})},"@/lib/billing/trial":{assertBillableAccess:async()=>{}},
    },[],{process:{env:{NEXT_PUBLIC_APP_URL:"https://www.connectyhub.com.br"}}});return {access,client};
  }
  const workspace={user:{id:"owner"},profile:{isPlatformAdmin:false},organization:{id:"company-a"}};
  it("rejects unauthenticated access",async()=>{await expect(fixture(null).access.officialAccess(new Request("https://www.connectyhub.com.br/api"))).rejects.toMatchObject({status:401});});
  it("rejects admin scope requested by a normal customer",async()=>{await expect(fixture(workspace).access.officialAccess(new Request("https://www.connectyhub.com.br/api?admin=1"))).rejects.toMatchObject({status:403});});
  it("rejects viewer mutations and cross-site requests",async()=>{
    await expect(fixture(workspace,"viewer").access.officialAccess(new Request("https://www.connectyhub.com.br/api"))).rejects.toMatchObject({status:403});
    await expect(fixture(workspace).access.officialAccess(new Request("https://www.connectyhub.com.br/api",{method:"POST",headers:{origin:"https://attacker.test"}}))).rejects.toMatchObject({status:403});
  });
  it("does not accept a caller's tenant override",async()=>{
    const result=await fixture(workspace).access.officialAccess(new Request("https://www.connectyhub.com.br/api?companyId=company-b"));expect(result.organizationId).toBe("company-a");
  });
});

it("auth callback retains public origin behind a container proxy",async()=>{
  const {NextResponse}=await import("next/server");
  const route=serverModuleHarness<{GET(r:NextRequest):Promise<Response>}>("src/app/auth/callback/route.ts",{
    "next/server":{NextResponse},"@/lib/auth/route-destinations":{resolveAuthenticatedEntryPath:({nextPath}:{nextPath:string})=>nextPath},
    "@/lib/supabase/profile":{getCurrentWorkspace:async()=>({profile:{isPlatformAdmin:true}}),ensureStarterOrganization:async()=>{}},
    "@/lib/supabase/server":{createClient:async()=>({auth:{exchangeCodeForSession:async()=>({})}})},
  });
  const result=await route.GET(new NextRequest("https://0.0.0.0:3000/auth/callback?code=test&next=/admin/maintenance"));
  expect(result.status).toBe(303);expect(result.headers.get("location")).toBe("/admin/maintenance");
  const unsafe=await route.GET(new NextRequest("https://0.0.0.0:3000/auth/callback?next=/%5cevil.test"));expect(unsafe.headers.get("location")).toBe("/dashboard");
});
