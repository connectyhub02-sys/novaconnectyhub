import { describe,expect,it,vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { aiUsagePeriod,aiUsageStart } from "../src/lib/ai-api/usage";

function fixture(role="owner") {
  const selections:string[]=[];
  const builder:Record<string,unknown>={};
  for(const method of ["eq","order","limit","gte"]) builder[method]=vi.fn(()=>builder);
  builder.select=vi.fn((fields:string)=>{selections.push(fields);return builder;});
  builder.maybeSingle=vi.fn(async()=>({data:{role},error:null}));
  builder.then=(resolve:(value:unknown)=>void)=>Promise.resolve({data:[],error:null}).then(resolve);
  const rpc=vi.fn(async(name:string)=>({data:name==="create_ai_project_with_key"?"project-id":{totals:{requests:0}},error:null}));
  const client={from:vi.fn(()=>builder),rpc};
  const route=serverModuleHarness<{GET:(request:Request)=>Promise<Response>;POST:(request:Request)=>Promise<Response>}>("src/app/api/dashboard/ai/route.ts",{
    "next/server":{NextResponse:{json:Response.json.bind(Response)}},
    "@/lib/supabase/profile":{getCurrentWorkspace:async()=>({organization:{id:"child-org"},user:{id:"user"},profile:{isPlatformAdmin:false}})},
    "@/lib/supabase/service":{createServiceClient:()=>client},
    "@/lib/billing/contract-access":{getContractAccess:async()=>({billing_organization_id:"account-org"})},
    "@/lib/billing/access-control":{assertOrganizationOperationalAccess:async()=>({})},
    "@/lib/ai-api/gateway":{record:(value:unknown)=>value,createAiSecret:()=>({secret:"fake-secret",key_hash:"hash",key_prefix:"prefix"})},
    "@/lib/ai-api/usage":{aiUsagePeriod,aiUsageStart},
  });
  return {route,rpc,selections};
}
describe("Simple AI dashboard boundary",()=>{
  it("creates from just a name and resolves the billing account on the server",async()=>{
    const f=fixture();const response=await f.route.POST(new Request("https://example.test/api/dashboard/ai",{method:"POST",body:JSON.stringify({action:"create_project",name:"My app",organization_id:"attacker",requests_per_minute:1})}));
    expect(response.status).toBe(200);expect(await response.json()).toEqual({project:{id:"project-id"},secret:"fake-secret"});
    expect(f.rpc).toHaveBeenCalledWith("create_ai_project_with_key",{p_org:"account-org",p_name:"My app",p_hash:"hash",p_prefix:"prefix"});
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("denies key creation to a non-administrator",async()=>{
    const f=fixture("member");const response=await f.route.POST(new Request("https://example.test/api/dashboard/ai",{method:"POST",body:JSON.stringify({action:"create_project",name:"My app"})}));
    expect(response.status).toBe(403);expect(f.rpc).not.toHaveBeenCalled();
  });
  it("aggregates by the authenticated account and does not select internal usage fields",async()=>{
    const f=fixture();const response=await f.route.GET(new Request("https://example.test/api/dashboard/ai?days=7&organization_id=other"));
    expect(response.status).toBe(200);expect(f.rpc).toHaveBeenCalledWith("ai_usage_summary",{p_org:"account-org",p_days:7,p_project:null});
    expect(f.selections.join(" ")).not.toMatch(/\*|model|token|provider|metadata|key_hash|limit/);
  });
});
