import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as address from "../src/lib/billing/billing-address";
import * as contact from "../src/lib/billing/billing-contact";
import * as cardInput from "../src/lib/sales-catalog/card-input";
import * as guard from "../src/lib/security/public-request-guard";
const organization=randomUUID(),actor=randomUUID(),subscription=randomUUID();
const valid={postalCode:'01001000',street:'Praça da Sé',number:'10',complement:'',neighborhood:'Sé',city:'São Paulo',state:'SP',country:'BR'};
function setup(role='owner'){
 const rpc=vi.fn(async():Promise<{data:Record<string,unknown>|null;error:{message:string}|null}>=>({data:{},error:null}));
 const api=serverModuleHarness<typeof import('../src/app/api/dashboard/billing/address/route')>('src/app/api/dashboard/billing/address/route.ts',{
  'next/server':{NextResponse},'@/lib/supabase/profile':{getCurrentWorkspace:async()=>role==='anonymous'?null:{organization:{id:organization,name:'Organization',role},user:{id:actor,email:'owner@example.test'},profile:{fullName:'Owner Name',email:'owner@example.test',phone:'11999999999'}}},
  '@/lib/supabase/service':{createServiceClient:()=>({rpc})},'@/lib/billing/billing-address':address,'@/lib/billing/billing-contact':contact,'@/lib/billing/billing-address-store':{loadBillingProfile:async()=>({address:valid,contact:null,updatedAt:null,suggestion:null})},'@/lib/security/public-request-guard':guard,'@/lib/account/signup-completion':{loadAccountDocument:async()=>({number:'12345678909'})},'@/lib/sales-catalog/card-input':cardInput,
 });
 return{api,rpc};
}
const request=(body:unknown,origin='https://example.test')=>new NextRequest('https://example.test/api/dashboard/billing/address',{method:'PATCH',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
describe('billing address boundary',()=>{
 it('uses authenticated organization, ignoring injected identities and card data',async()=>{
  const h=setup();expect((await h.api.PATCH(request({...valid,subscriptionId:subscription,organizationId:randomUUID(),leadId:randomUUID(),card:{number:'secret'},ccv:'123'}))).status).toBe(200);
  expect(h.rpc).toHaveBeenCalledWith('confirm_organization_billing_profile',expect.objectContaining({p_org:organization,p_actor:actor,p_subscription:subscription,p_address:valid,p_contact:null,p_expected_updated_at:null}));
  const sent=JSON.stringify(h.rpc.mock.calls);expect(sent).not.toContain('12345678909');expect(sent).not.toContain('ccv');expect(sent).not.toContain('secret');
 });
 it.each([['anonymous',401],['member',403]] as const)('denies %s',async(role,status)=>{const h=setup(role);expect((await h.api.PATCH(request(valid))).status).toBe(status);expect(h.rpc).not.toHaveBeenCalled();});
 it.each([['anonymous',401],['member',403],['owner',200],['admin',200]] as const)('scopes profile reads for %s',async(role,status)=>{const h=setup(role);const response=await h.api.GET();expect(response.status).toBe(status);expect(response.headers.get('cache-control')).toContain('no-store');});
 it('returns a conflict for stale data without retrying or overwriting',async()=>{
  const h=setup();h.rpc.mockResolvedValueOnce({data:null,error:{message:'BILLING_PROFILE_CHANGED'}});
  const response=await h.api.PATCH(request({...valid,expectedUpdatedAt:'2026-09-18T10:00:00.123456Z'}));
  expect(response.status).toBe(409);expect(await response.json()).toMatchObject({code:'billing_profile_changed'});expect(h.rpc).toHaveBeenCalledTimes(1);
 });
 it('rejects cross-origin and incomplete address before storage',async()=>{const h=setup();expect((await h.api.PATCH(request(valid,'https://other.test'))).status).toBe(403);expect((await h.api.PATCH(request({...valid,street:''}))).status).toBe(422);expect(h.rpc).not.toHaveBeenCalled();});
});
