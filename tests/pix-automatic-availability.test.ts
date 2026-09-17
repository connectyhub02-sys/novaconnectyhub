import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as cardInput from "../src/lib/sales-catalog/card-input";
import * as guard from "../src/lib/security/public-request-guard";
import { pixAutomaticAvailability } from "../src/lib/billing/pix-automatic-availability";
const adapter = serverModuleHarness<typeof import("../src/lib/billing/asaas-pix-automatic-api")>("src/lib/billing/asaas-pix-automatic-api.ts", { "@/lib/sales-catalog/card-input":cardInput });
describe("Pix Automatic authenticated checkout route", () => {
 const subscriptionId=randomUUID(),organizationId=randomUUID(),actor=randomUUID();
 function route(role="owner"){
  const snapshot=vi.fn(async()=>({enabled:true,authorization:null}));
  const begin=vi.fn(async()=>({id:randomUUID(),state:"CREATED",active:false}));
  const api=serverModuleHarness<typeof import("../src/app/api/dashboard/billing/checkout/[subscriptionId]/pix-automatic/route")>("src/app/api/dashboard/billing/checkout/[subscriptionId]/pix-automatic/route.ts",{
   "next/server":{NextResponse},"@/lib/supabase/profile":{getCurrentWorkspace:async()=>role==="anonymous"?null:{user:{id:actor},organization:{id:organizationId,name:"Teste",role},profile:{fullName:"Pessoa Teste",email:"test@example.test",phone:"11999999999"}}},
   "@/lib/supabase/service":{createServiceClient:()=>({})},"@/lib/billing/pix-automatic":{pixCheckoutSnapshot:snapshot,beginPixCheckout:begin},"@/lib/billing/asaas-pix-automatic-api":adapter,
   "@/lib/account/signup-completion":{assertAccountComplete:async()=>{},loadAccountDocument:async()=>({number:"12345678909"})},"@/lib/security/public-request-guard":guard,"@/lib/sales-catalog/card-input":cardInput,
  });return{api,snapshot,begin};
 }
 const context={params:Promise.resolve({subscriptionId})};
 const request=(origin="https://example.test",body={})=>new NextRequest("https://example.test/api/pix-automatic",{method:"POST",headers:{origin,"Content-Type":"application/json","x-forwarded-for":randomUUID()},body:JSON.stringify(body)});
 it("uses session identities and stored account document",async()=>{
  const h=route();expect((await h.api.POST(request(undefined,{organizationId:randomUUID(),actorId:randomUUID()}),context)).status).toBe(200);
  expect(h.begin.mock.calls[0]).toMatchObject([{}, {organizationId,subscriptionId,actorId:actor},expect.any(Object),{cpfCnpj:"12345678909"}]);
 });
 it.each([["anonymous",401],["member",403]] as const)("denies %s before checkout access",async(role,status)=>{const h=route(role);expect((await h.api.POST(request(),context)).status).toBe(status);expect(h.begin).not.toHaveBeenCalled();});
 it("rejects cross-origin financial submissions",async()=>{const h=route();expect((await h.api.POST(request("https://attacker.test"),context)).status).toBe(403);expect(h.begin).not.toHaveBeenCalled();});
 it("reads capability without creating a mandate",async()=>{const h=route();expect((await h.api.GET(new NextRequest("https://example.test/api"),context)).status).toBe(200);expect(h.begin).not.toHaveBeenCalled();expect(h.snapshot).toHaveBeenCalledWith({},organizationId,subscriptionId,false);});
 it("continues to block replacement without initial payment",()=>{expect(pixAutomaticAvailability("replacement")).toMatchObject({enabled:false});expect(pixAutomaticAvailability("replacement").reason).toContain("primeiro pagamento");});
});
