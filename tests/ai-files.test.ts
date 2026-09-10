import {it,expect} from "vitest";
import {serverModuleHarness} from "./helpers/server-module-harness";
import {commerceDatabase} from "./helpers/commerce-database";
import type * as Files from "../src/lib/ai-api/files";
class AiApiError extends Error{constructor(public code:string,public status:number,message:string){super(message);}}
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"?v as Record<string,unknown>:{};
const id="00000000-0000-4000-8000-000000000003";
const auth={billingOrganizationId:"org",project:{id:"project"},key:{id:"key"}} as never;
function fixture(status="active",otherProject=false){
  const db=commerceDatabase({ai_resources:[{id,project_id:otherProject?"foreign":"project",kind:"file",status,provider_name:status==="preparing"?null:"files/internal",metadata:{uri:"https://generativelanguage.googleapis.com/v1beta/files/internal",mime_type:"application/pdf"}}]});
  let dispatched=0;
  const api=serverModuleHarness<typeof Files>("src/lib/ai-api/files.ts",{"./gateway":{AiApiError,record},"@/lib/gemini/credentials":{loadGeminiCredentials:async()=>({apiKey:"secret"})}},[],{fetch:async()=>{dispatched++;return Response.json({state:"ACTIVE"});}});
  return {api,client:db.client as never,db,http:()=>dispatched};
}
it("never resolves or deletes files owned by another project",async()=>{
  const f=fixture("active",true);
  for(const remove of [false,true])await expect(f.api.refreshAiFile(f.client,auth,id,remove)).rejects.toMatchObject({code:"resource_not_found"});
  await expect(f.api.resolveAiFileParts(f.client,auth,[{role:"user",parts:[{fileData:{fileUri:`files/${id}`}}]}])).rejects.toMatchObject({code:"resource_not_found"});
  expect(f.http()).toBe(0);
});
it("resolves only active project files and never exposes private URIs",async()=>{
  const f=fixture();const contents=[{role:"user",parts:[{fileData:{fileUri:`files/${id}`}}]}];
  expect(await f.api.resolveAiFileParts(f.client,auth,contents)).toEqual(["pdf_input"]);
  expect(contents[0].parts[0].fileData.fileUri).toContain("/v1beta/files/internal");
  expect(JSON.stringify(await f.api.refreshAiFile(f.client,auth,id))).not.toMatch(/internal|google|secret/);
  const waiting=fixture("processing");await expect(waiting.api.resolveAiFileParts(waiting.client,auth,[{role:"user",parts:[{fileData:{fileUri:`files/${id}`}}]}])).rejects.toMatchObject({code:"file_not_ready"});
});
it("cancels a pending upload locally and blocks subsequent reads",async()=>{
  const f=fixture("preparing");expect(await f.api.refreshAiFile(f.client,auth,id,true)).toMatchObject({status:"deleted"});
  expect(f.http()).toBe(0);
  await expect(f.api.refreshAiFile(f.client,auth,id)).rejects.toMatchObject({code:"resource_not_found"});
});
