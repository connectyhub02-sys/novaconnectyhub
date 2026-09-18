import { describe, expect, it, vi } from "vitest";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { serverModuleHarness } from "./helpers/server-module-harness";

const invoiceId="9d4c5cff-5608-4055-b588-f41e18cc9d44",org="11111111-1111-4111-8111-111111111111";
function fixture(status="past_due",found=true){
 const filters:unknown[][]=[];
 const getCurrentWorkspace=vi.fn(async()=>({user:{id:'owner'},profile:{isPlatformAdmin:false},organization:{id:org,name:'Fixture',status,role:'owner'}}));
 const from=vi.fn((table:string)=>{
  const q={select:()=>q,eq:(key:string,value:string)=>{filters.push([table,key,value]);return q;},order:()=>q,limit:()=>q,returns:async()=>({data:[],error:null}),maybeSingle:async()=>({error:null,data:found?{id:invoiceId,organization_id:org,subscription_id:null,cycle_id:null,status:'open',currency:'BRL',subtotal_brl:97,discount_brl:0,total_brl:97,due_at:'2026-09-17T00:00:00Z',paid_at:null,provider:'asaas',provider_invoice_id:null,provider_payment_id:null,created_at:'2026-09-01T00:00:00Z'}:null})};
  return q;
 });
 const page=serverModuleHarness<{default:(args:{params:Promise<{invoiceId:string}>})=>Promise<ReactNode>}>('src/app/dashboard/minha-conta/faturas/[invoiceId]/page.tsx',{
  'react/jsx-runtime':jsxRuntime,'next/server':{connection:async()=>{}},'next/navigation':{notFound:()=>{throw Error('NOT_FOUND');},redirect:()=>{throw Error('REDIRECT');}},
  '@/lib/supabase/profile':{getCurrentWorkspace},'@/lib/supabase/service':{createServiceClient:()=>({from})},
  '@/components/connectyhub-os/connecty-shell':{ConnectyShell:({children}:{children:ReactNode})=>children},'@/components/connectyhub-os/account-invoice-actions':{AccountInvoiceActions:()=>null},
 });
 return{page,from,filters,getCurrentWorkspace};
}
describe('invoice recovery page',()=>{
 it.each(['active','past_due'])('opens a real-format UUID for %s while scoping all reads',async status=>{
  const f=fixture(status);const html=renderToStaticMarkup(await f.page.default({params:Promise.resolve({invoiceId})}));
  expect(html).toContain('Fatura #9D4C5CFF');expect(f.getCurrentWorkspace).toHaveBeenCalledWith({allowRestricted:true});
  for(const table of ['billing_invoices','billing_invoice_items','billing_payments'])expect(f.filters).toContainEqual([table,'organization_id',org]);
 });
 it('rejects a malformed ID before reading account data',async()=>{
  const f=fixture();await expect(f.page.default({params:Promise.resolve({invoiceId:'bad-id'})})).rejects.toThrow('NOT_FOUND');expect(f.from).not.toHaveBeenCalled();
 });
 it('does not reveal an invoice absent from the authenticated organization',async()=>{
  const f=fixture('past_due',false);const html=renderToStaticMarkup(await f.page.default({params:Promise.resolve({invoiceId})}));expect(html).not.toContain('Fatura #9D4C5CFF');expect(f.filters).toContainEqual(['billing_invoices','organization_id',org]);
 });
});
