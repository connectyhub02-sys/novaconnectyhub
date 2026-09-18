import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as address from "../src/lib/billing/billing-address";
import * as cardInput from "../src/lib/sales-catalog/card-input";
import * as guard from "../src/lib/security/public-request-guard";
const organization=randomUUID(),actor=randomUUID(),subscription=randomUUID();
const valid={postalCode:'01001000',street:'Praça da Sé',number:'10',complement:'',neighborhood:'Sé',city:'São Paulo',state:'SP',country:'BR'};
function setup(role='owner'){
 const rpc=vi.fn(async()=>({data:{},error:null}));
 const api=serverModuleHarness<typeof import('../src/app/api/dashboard/billing/address/route')>('src/app/api/dashboard/billing/address/route.ts',{
  'next/server':{NextResponse},'@/lib/supabase/profile':{getCurrentWorkspace:async()=>role==='anonymous'?null:{organization:{id:organization,name:'Organization',role},user:{id:actor,email:'owner@example.test'},profile:{fullName:'Owner Name',email:'owner@example.test',phone:'11999999999'}}},
  '@/lib/supabase/service':{createServiceClient:()=>({rpc})},'@/lib/billing/billing-address':address,'@/lib/billing/billing-address-store':{loadBillingAddress:async()=>valid},'@/lib/security/public-request-guard':guard,'@/lib/account/signup-completion':{loadAccountDocument:async()=>({number:'12345678909'})},'@/lib/sales-catalog/card-input':cardInput,
 });
 return{api,rpc};
}
const request=(body:unknown,origin='https://example.test')=>new NextRequest('https://example.test/api/dashboard/billing/address',{method:'PATCH',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
describe('billing address boundary',()=>{
 it('uses authenticated organization and masked contact, ignoring injected identities and card data',async()=>{
  const h=setup();expect((await h.api.PATCH(request({...valid,subscriptionId:subscription,organizationId:randomUUID(),leadId:randomUUID(),card:{number:'secret'},ccv:'123'}))).status).toBe(200);
  expect(h.rpc).toHaveBeenCalledWith('save_organization_billing_address',expect.objectContaining({p_org:organization,p_actor:actor,p_subscription:subscription,p_address:valid,p_contact:expect.objectContaining({documentPreview:'***8909'})}));
  const sent=JSON.stringify(h.rpc.mock.calls);expect(sent).not.toContain('12345678909');expect(sent).not.toContain('ccv');expect(sent).not.toContain('secret');
 });
 it.each([['anonymous',401],['member',403]] as const)('denies %s',async(role,status)=>{const h=setup(role);expect((await h.api.PATCH(request(valid))).status).toBe(status);expect(h.rpc).not.toHaveBeenCalled();});
 it('rejects cross-origin and incomplete address before storage',async()=>{const h=setup();expect((await h.api.PATCH(request(valid,'https://other.test'))).status).toBe(403);expect((await h.api.PATCH(request({...valid,street:''}))).status).toBe(422);expect(h.rpc).not.toHaveBeenCalled();});
});
