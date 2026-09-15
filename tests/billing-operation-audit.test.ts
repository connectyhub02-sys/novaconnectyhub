import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {serverModuleHarness} from './helpers/server-module-harness';
import {commerceDatabase} from './helpers/commerce-database';
import type * as Audit from '../src/lib/billing/operation-audit';
import type * as Metering from '../src/lib/billing/metered-usage';
const audit=()=>serverModuleHarness<typeof Audit>('src/lib/billing/operation-audit.ts');
describe('admin operation audit',()=>{
 it('uses linked debits/refunds, keeps token directions separate and excludes private metadata',()=>{
  const r=audit().projectAuditOperation({id:'event',organization_id:'wallet',provider:'gemini',feature_code:'voice_generation_audio',model_id:'gemini',provider_cost:.6,input_tokens:10,output_tokens:100,metadata:{organization_id:'org',apiKey:'secret',prompt:'private',metering:{matchedRates:[{id:'in',unit:'input_token',units:10,providerCostPerUnit:.000003},{id:'out',unit:'output_token',units:100,providerCostPerUnit:.00006}]}},connecty_charge_credits:999},undefined,[{transaction_type:'debit',amount_credits:-240},{transaction_type:'refund',amount_credits:20}],new Map([['org','Cliente']]),new Map());
  expect(r).toMatchObject({organization:'Cliente',debit:240,refund:20,nominalRevenue:2.2,margin:1.6});
  expect(r.units.map(u=>u.unit)).toEqual(['input_token','output_token']);
  expect(r.units[0].costPerThousand).toBe(.003);
  expect(JSON.stringify(r)).not.toContain('secret');expect(JSON.stringify(r)).not.toContain('private');
 });
 it('does not recognize revenue from a usage estimate without a debit or mix pending reserves into cost',()=>{
  const r=audit().projectAuditOperation({id:'pending',pending_receipt:true,connecty_charge_credits:50,metadata:{}},{reserved_credits:50,quoted_credits:50,charged_credits:0},[],new Map(),new Map());
  expect(r).toMatchObject({cost:null,nominalRevenue:0,margin:null,reserved:50,released:0,ledgerLinked:false});
 });
 it('reads real ledger linkage once and keeps pending receipts separate',async()=>{
  const now=new Date().toISOString(),db=commerceDatabase({usage_events:[{id:'u',occurred_at:now,organization_id:'o',provider:'elevenlabs',provider_cost:.6,metadata:{source:'voice_api'},status:'completed'}],voice_generations:[{id:'v',usage_event_id:'u',project_id:'p',organization_id:'o',status:'completed',quoted_credits:300,charged_credits:240,reserved_credits:0},{id:'pnd',usage_event_id:null,project_id:'p',organization_id:'o',created_at:now,status:'processing',model_id:'gemini-tts',quoted_credits:100,reserved_credits:100}],credit_transactions:[{usage_event_id:'u',transaction_type:'debit',amount_credits:-240}],organizations:[{id:'o',name:'Cliente'}],voice_projects:[{id:'p',name:'Projeto'}],billing_credit_packs:[{status:'active',price_brl:497,credit_amount:60000}]});
  const result=await audit().getOperationAudit(db.client as never);
  expect(result.rows).toHaveLength(2);expect(result.rows[0]).toMatchObject({debit:240,released:60,project:'Projeto',cost:.6});expect(result.rows[1]).toMatchObject({pending:true,reserved:100,cost:null});
  expect(result.creditPackRange?.min).toBeCloseTo(497/60000);
 });
 it('keeps the service query behind the existing admin authorization',()=>{
  const page=readFileSync('src/app/admin/financeiro/page.tsx','utf8');expect(page.indexOf('if (!workspace?.profile.isPlatformAdmin)')).toBeLessThan(page.indexOf('getOperationAudit(createServiceClient()'));
 });
 it('protects shared cost when editing a commercial rate and blocks disabling its source',async()=>{
  class JsonResponse extends Response {static json(body:unknown,init?:ResponseInit){return new JsonResponse(JSON.stringify(body),init);}}
  const source={id:'source',cost_center_id:'c',model_id:'m',unit:'character',provider_cost_per_unit:.0006,active:true},linked={...source,id:'api',metadata:{provider_cost_source_rate_id:'source'}};
  const db=commerceDatabase({billing_rates:[source,linked]});
  const metering=serverModuleHarness<typeof Metering>('src/lib/billing/metered-usage.ts');
  const route=serverModuleHarness<{PATCH:(r:Request)=>Promise<Response>}>('src/app/api/admin/billing/rates/route.ts',{'next/server':{NextResponse:JsonResponse},'@/lib/supabase/admin-auth':{requirePlatformAdmin:async()=>({supabase:db.client,userId:'admin'})},'@/lib/billing/metered-usage':metering});
  const request=(rateId:string,active=true)=>new Request('https://local.test',{method:'PATCH',body:JSON.stringify({rateId,active,providerCostPerUnit:0,connectyPricePerUnit:.24,minimumChargeCredits:5})});
  expect((await route.PATCH(request('api'))).status).toBe(200);expect(db.tables.billing_rates.find(r=>r.id==='api')?.provider_cost_per_unit).toBe(.0006);
  expect((await route.PATCH(request('source',false))).status).toBe(409);
 });
});
