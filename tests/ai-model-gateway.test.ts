import {describe,it,expect} from "vitest";
import * as crypto from "node:crypto";
import * as advanced from "../src/lib/ai-api/advanced-input";
import * as native from "../src/lib/ai-api/native-input";
import * as embedding from "../src/lib/ai-api/embedding-input";
import * as catalog from "../src/lib/ai-api/model-catalog";
import * as capabilities from "../src/lib/ai-api/capabilities";
import * as publicResponse from "../src/lib/ai-api/public-response";
import {serverModuleHarness} from "./helpers/server-module-harness";
import {commerceDatabase} from "./helpers/commerce-database";
import type {completeAi} from "../src/lib/ai-api/gateway";
const metering=serverModuleHarness<typeof import("../src/lib/billing/metered-usage")>("src/lib/billing/metered-usage.ts");
function fixture(model="flash-3.5",count=12,output?:Record<string,unknown>){
  const providerId=catalog.aiModelDefinition(model)!.providerId;
  const secret=`chy_ai_${"a".repeat(64)}`;
  const db=commerceDatabase({ai_api_keys:[{id:"key",project_id:"project",key_hash:crypto.createHash("sha256").update(secret).digest("hex"),status:"active",model_id:model}],ai_projects:[{id:"project",organization_id:"org",status:"active"}],ai_public_models:[{id:model,enabled:true}],provider_models:[{provider_model_id:providerId,enabled:true,metadata:{external_ai_available:true},"provider_cost_centers.enabled":true,"provider_cost_centers.provider":"gemini"}],ai_requests:[{id:"request",status:"processing"}]});
  const calls:Array<{name:string;args:Record<string,unknown>}>=[];
  const http:Array<{url:string;body:Record<string,unknown>}>=[];
  let claimedHash:string|undefined,completed:unknown;
  const client=Object.assign(db.client,{rpc:async(name:string,args:Record<string,unknown>)=>{
    calls.push({name,args});
    if(name==="claim_ai_request"){
      if(claimedHash&&claimedHash!==args.p_hash)return {error:{message:"ai_idempotency_conflict"}};
      const replay=!!claimedHash;claimedHash=String(args.p_hash);
      return {data:{id:"request",claimed:!replay,status:replay?"completed":"preparing",response:completed}};
    }
    if(name==="settle_ai_operation"&&args.p_status==="completed")completed=args.p_response;
    return {data:{response:args.p_response}};
  }});
  const files:Record<string,unknown>={resolveAiFileParts:async()=>[]};
  const api=serverModuleHarness<{completeAi:typeof completeAi}>("src/lib/ai-api/gateway.ts",{
    "node:crypto":crypto,"./advanced-input":advanced,"./native-input":native,"./embedding-input":embedding,"./model-catalog":catalog,"./capabilities":capabilities,"./public-response":publicResponse,"./files":files,
    "@/lib/billing/credit-economics":{CONNECTY_CREDIT_UNIT_BRL:.01},
    "@/lib/billing/access-control":{assertOrganizationOperationalAccess:async()=>({planCode:"scale"}),assertOrganizationFeatureAccess:async()=>({})},
    "@/lib/billing/contract-access":{assertContractAccess:async()=>({billing_organization_id:"org"})},
    "@/lib/gemini/credentials":{loadGeminiCredentials:async()=>({apiKey:"server-secret",model:providerId})},
    "@/lib/billing/metered-usage":{...metering,resolveActiveBillingRates:async(_client:unknown,input:{featureCode:string})=>{
      const factor=input.featureCode.endsWith("long_context")?2:1;
      return [{unit:"input_token",providerCostPerUnit:.000001*factor,connectyPricePerUnit:.001*factor,minimumChargeCredits:1},...(model.startsWith("embedding")?[]:[{unit:"output_token",providerCostPerUnit:.000002*factor,connectyPricePerUnit:.002*factor,minimumChargeCredits:1}])];
    }},
  },[],{fetch:async(url:string,init:RequestInit)=>{
    http.push({url,body:JSON.parse(String(init.body))});
    if(url.endsWith(":countTokens"))return Response.json({totalTokens:count});
    return Response.json(output??{candidates:[{content:{parts:[{text:"Olá"}]},finishReason:"STOP"}],usageMetadata:{promptTokenCount:count,candidatesTokenCount:3,thoughtsTokenCount:2},modelVersion:providerId});
  }});
  const request=()=>new Request("https://local.invalid/api/v1/ai/chat/completions",{headers:{authorization:`Bearer ${secret}`,"Idempotency-Key":"same-operation"}});
  return {run:(body:unknown,format:"chat"|"native"|"embedding"="chat")=>api.completeAi(request(),body,client as never,format),calls,http};
}
describe("Model binding, metering and replay",()=>{
  it("rejects changing the bound model before an idempotency claim or provider dispatch",async()=>{
    const f=fixture();await expect(f.run({model:"flash-3.6",messages:[{role:"user",content:"Oi"}]})).rejects.toMatchObject({code:"model_key_mismatch"});
    expect(f.calls).toHaveLength(0);expect(f.http).toHaveLength(0);
  });
  it("uses the key model and returns a replay without spending or dispatching twice",async()=>{
    const f=fixture();const body={messages:[{role:"user",content:"Oi"}]};
    const first=await f.run(body),again=await f.run(body);
    expect(first.response).toMatchObject({model:"flash-3.5",connectyhub:{credits:1}});expect(again.response).toEqual(first.response);expect(again.replayed).toBe(true);
    expect(f.http).toHaveLength(2);expect(f.http[1].url).toContain("gemini-3.5-flash:generateContent");
    expect(f.calls.filter(call=>call.name==="reserve_ai_credits")).toHaveLength(1);
    expect(JSON.stringify(first.response)).not.toMatch(/server-secret|provider|tokens|gemini/);
    await expect(f.run({...body,model:"flash-3.8"})).rejects.toMatchObject({code:"model_key_mismatch"});
  });
  it("does not dispatch unimplemented resource capabilities",async()=>{
    const f=fixture();await expect(f.run({contents:[{parts:[{text:"Oi"}]}],cachedContent:"caches/00000000-0000-4000-8000-000000000001"},"native")).rejects.toMatchObject({code:"capability_not_released"});
    expect(f.http).toHaveLength(0);expect(f.calls.at(-1)?.args.p_status).toBe("failed");
  });
  it("meters an embedding once, with no generated-output fee",async()=>{
    const f=fixture("embedding-2",1200,{embedding:{values:[.1,.2,.3]},usageMetadata:{promptTokenCount:1200}});
    const result=await f.run({input:"produto",dimensions:3},"embedding");
    expect(result.response).toMatchObject({object:"embedding.list",data:[{embedding:[.1,.2,.3]}],connectyhub:{credits:1.2}});
    expect(f.http[1].url).toContain(":embedContent");expect(f.http[1].body).toMatchObject({content:{parts:[{text:"produto"}]},embedContentConfig:{autoTruncate:false,outputDimensionality:3}});
    expect(f.calls.at(-1)?.args.p_usage).toMatchObject({input:1200,output:0,charge:1.2});
  });
  it("uses the long-context tariff for Pro before reservation and settlement",async()=>{
    const f=fixture("pro-3.1-preview",200001);
    const result=await f.run({contents:[{parts:[{text:"contexto"}]}]},"native");
    expect(result.response.connectyhub.credits).toBeCloseTo(400.022,6);
    const reserve=f.calls.find(call=>call.name==="reserve_ai_credits")!;
    expect(Number(reserve.args.p_amount)).toBeGreaterThan(400.022);
    expect(reserve.args.p_rates).toMatchObject([{connectyPricePerUnit:.002},{connectyPricePerUnit:.004}]);
  });
  it("records all tool input costs, including consumption above the initial reservation",async()=>{
    const f=fixture("flash-3.5",20,{candidates:[{content:{parts:[{text:"Resultado"}]}}],usageMetadata:{promptTokenCount:20,candidatesTokenCount:3,toolUsePromptTokenCount:10000}});
    await f.run({messages:[{role:"user",content:"Calcule"}],tools:[{type:"code_execution"}]});
    const reserve=f.calls.find(call=>call.name==="reserve_ai_credits")!;
    expect(f.calls.at(-1)?.name).toBe('settle_ai_operation');
    expect(f.calls.at(-1)?.args.p_usage).toMatchObject({input:10020,charge:10.026,metering:{toolInput:10000}});
    expect(Number(reserve.args.p_amount)).toBeLessThan(10.026);
  });
});
