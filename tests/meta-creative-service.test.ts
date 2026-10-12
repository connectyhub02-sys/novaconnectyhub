import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({credentials:vi.fn(),meter:vi.fn()}));
vi.mock("@/lib/gemini/credentials",()=>({loadGeminiCredentials:mocks.credentials}));
vi.mock("@/lib/billing/contract-access",()=>({assertContractAccess:vi.fn().mockResolvedValue({plan_code:"internal"})}));
vi.mock("@/lib/billing/gemini-metering",()=>({meterGeminiGenerationUsage:mocks.meter}));
vi.mock("@/lib/storage/r2",()=>({loadR2Config:vi.fn(),buildPublicObjectUrl:vi.fn()}));
vi.mock("@/lib/billing/metered-usage",()=>({resolveActiveBillingRates:vi.fn(),calculateMeteredUsageCharge:vi.fn()}));
import { runCreativeJob } from "@/lib/meta/creative-studio";
import { parseCreativeBrief } from "@/lib/meta/creative-policy";
const brief=parseCreativeBrief({mode:"analysis",mediaId:"11111111-1111-4111-8111-111111111111"});
function client(existing:unknown=null) {
 const calls:unknown[][]=[];
 const from=vi.fn((table:string)=>{
  const q:Record<string,unknown>={};
  for(const method of ["select","eq","in","lt","order","limit","insert","update"])
   q[method]=(...args:unknown[])=>{calls.push([table,method,...args]);return q;};
  q.maybeSingle=async()=>({data:existing,error:null});
  q.single=async()=>({data:null,error:{message:"not found"}});
  q.then=(resolve:(v:unknown)=>void)=>resolve({data:[],error:null});
  return q;
 });
 return {db:{from} as unknown as SupabaseClient,calls};
}
beforeEach(()=>{vi.clearAllMocks();mocks.credentials.mockResolvedValue({apiKey:"test-only",model:"test-model"});});
it("replays a request without reading provider credentials or billing again",async()=>{
 const {db}=client({input_hash:createHash("sha256").update(JSON.stringify(brief)).digest("hex")});
 await runCreativeJob(db,"org","user","request",brief);
 expect(mocks.credentials).not.toHaveBeenCalled();expect(mocks.meter).not.toHaveBeenCalled();
});
it("rejects reusing an identity for different input",async()=>{
 const {db}=client({input_hash:"different"});
 await expect(runCreativeJob(db,"org","user","request",brief)).rejects.toThrow(/outro conteúdo/);
 expect(mocks.credentials).not.toHaveBeenCalled();
});
it("checks file ownership and type before accessing the provider",async()=>{
 const {db,calls}=client();
 await expect(runCreativeJob(db,"org","user","request",brief)).rejects.toThrow(/biblioteca desta empresa/);
 expect(calls).toContainEqual(["content_pipeline_items","eq","organization_id","org"]);
 expect(calls).toContainEqual(["content_pipeline_items","eq","scope","organization"]);
 expect(calls).toContainEqual(["content_pipeline_items","eq","content_type","meta_organic_media"]);
 expect(mocks.meter).not.toHaveBeenCalled();
 expect(calls.some(c=>c[0]==="meta_creative_jobs"&&c[1]==="update"&&(c[2] as {status:string}).status==="failed")).toBe(true);
});
