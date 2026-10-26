import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, expect, it, vi } from 'vitest';
import { serverModuleHarness } from './helpers/server-module-harness';
import * as guard from '../src/lib/security/public-request-guard';
import * as sameOrigin from '../src/lib/security/same-origin-request';
import * as cardInput from '../src/lib/sales-catalog/card-input';
afterEach(()=>vi.unstubAllEnvs());
function setup(role='owner'){
 const begin=vi.fn(async()=>({state:'CREATED'}));class CheckoutError extends Error{};class PixAutomaticError extends Error{constructor(public code:string,public status:number){super(code);}}
 const api=serverModuleHarness<typeof import('../src/app/api/dashboard/billing/checkout/[subscriptionId]/pix-automatic/route')>('src/app/api/dashboard/billing/checkout/[subscriptionId]/pix-automatic/route.ts',{
  'next/server':{NextResponse},'@/lib/supabase/profile':{getCurrentWorkspace:async()=>role==='anonymous'?null:({organization:{id:'session-org',name:'Fixture',role},user:{id:'actor'},profile:{}})},
  '@/lib/supabase/service':{createServiceClient:()=>({})},'@/lib/billing/pix-automatic':{beginPixCheckout:begin,loadPixMandate:async()=>null},
  '@/lib/billing/billing-address-store':{requireBillingAddress:async()=>{}},'@/lib/sales-catalog/transparent-checkout':{CheckoutError},'@/lib/billing/asaas-pix-automatic-api':{PixAutomaticError},
  '@/lib/account/signup-completion':{assertAccountComplete:async()=>{},loadAccountDocument:async()=>({})},'@/lib/security/public-request-guard':guard,'@/lib/security/same-origin-request':sameOrigin,'@/lib/sales-catalog/card-input':cardInput,
 });
 const call=(origin:string|null)=>api.POST(new NextRequest('http://0.0.0.0:3000/api/dashboard/billing/checkout/'+randomUUID()+'/pix-automatic',{method:'POST',headers:{...(origin?{origin}:{}),'content-type':'application/json','x-forwarded-host':'evil.example','x-forwarded-proto':'https'},body:'{}'}),{params:Promise.resolve({subscriptionId:randomUUID()})});
 return {begin,call};
}
it('accepts the configured public origin behind the VPS proxy',async()=>{vi.stubEnv('NEXT_PUBLIC_APP_URL','https://www.connectyhub.com.br');const h=setup();const r=await h.call('https://www.connectyhub.com.br');expect(r.status).toBe(200);expect(r.headers.get('Cache-Control')).toBe('no-store');expect(h.begin).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({organizationId:'session-org',actorId:'actor'}),expect.anything(),expect.anything());});
it.each(['https://evil.example',null])('rejects %s regardless of forwarded headers before creating a mandate',async origin=>{vi.stubEnv('NEXT_PUBLIC_APP_URL','https://www.connectyhub.com.br');const h=setup();expect((await h.call(origin)).status).toBe(403);expect(h.begin).not.toHaveBeenCalled();});
it.each([['anonymous',401],['member',403]] as const)('rejects %s before financial writes',async(role,status)=>{vi.stubEnv('NEXT_PUBLIC_APP_URL','https://www.connectyhub.com.br');const h=setup(role);expect((await h.call('https://www.connectyhub.com.br')).status).toBe(status);expect(h.begin).not.toHaveBeenCalled();});
