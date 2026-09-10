import {it,expect} from 'vitest';
import {serverModuleHarness} from './helpers/server-module-harness';
import {commerceDatabase} from './helpers/commerce-database';
import type * as Route from '../src/app/api/admin/billing/ai-rates/route';
import {positiveAiMeters,requiredAiMeters} from '../src/lib/ai-api/resource-capabilities';
const req=(body:unknown)=>new Request('https://app.invalid/api/admin/billing/ai-rates',{method:'POST',body:JSON.stringify(body)});
function fixture(authorized=true,priced=true) {
  const db=commerceDatabase({ai_public_models:[{id:'test',enabled:false}]});
  const route=serverModuleHarness<typeof Route>('src/app/api/admin/billing/ai-rates/route.ts',{
    'next/server':{NextResponse:Response},'@/lib/supabase/admin-auth':{requirePlatformAdmin:async()=>authorized?{userId:'admin'}:Response.json({error:'forbidden'},{status:403})},
    '@/lib/supabase/service':{createServiceClient:()=>db.client},'@/lib/ai-api/model-catalog':{aiModelDefinition:(id:string)=>id==='test'?{id,family:'image'}:undefined},
    '@/lib/ai-api/operation-pricing':{loadAiPriceCard:async()=>priced?Object.fromEntries(['input','output','image_output'].map(m=>[m,{credits:1,cost:.01}])):{}},
    '@/lib/ai-api/resource-capabilities':{positiveAiMeters,requiredAiMeters},
  });return {route,db};
}
it('allows only platform admins to inspect or change resource tariffs',async()=>{
  const f=fixture(false);for(const result of [await f.route.GET(),await f.route.POST(req({})),await f.route.PATCH(req({}))])expect(result.status).toBe(403);
  expect(f.db.tables.ai_operation_rates).toBeUndefined();
});
it('rejects missing/zero prices and appends valid versions with an audit entry',async()=>{
  const f=fixture();const body={model_id:'test',meter:'image_output',provider_cost:1,credit_price:0};
  expect((await f.route.POST(req(body))).status).toBe(400);
  expect((await f.route.POST(req({...body,credit_price:4}))).status).toBe(200);
  expect(f.db.tables.ai_operation_rates).toHaveLength(1);expect(f.db.tables.maintenance_audit_logs).toHaveLength(1);
});
it('does not activate a model without every required tariff',async()=>{
  const missing=fixture(true,false);expect((await missing.route.PATCH(req({model_id:'test',enabled:true}))).status).toBe(422);expect(missing.db.tables.ai_public_models[0].enabled).toBe(false);
  const ready=fixture();expect((await ready.route.PATCH(req({model_id:'test',enabled:true}))).status).toBe(200);expect(ready.db.tables.ai_public_models[0].enabled).toBe(true);
});
