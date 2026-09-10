import {it,expect} from 'vitest';
import {serverModuleHarness} from './helpers/server-module-harness';
import {commerceDatabase} from './helpers/commerce-database';
import type * as Cache from '../src/lib/ai-api/cache-management';
class AiApiError extends Error{constructor(public code:string,public status:number,message:string){super(message);}}
class AiProviderFailure extends Error{constructor(public status:number,public uncertain:boolean){super('provider failure');}}
const record=(v:unknown)=>v&&typeof v==='object'?v:{};
const pricing=serverModuleHarness<typeof import('../src/lib/ai-api/operation-pricing')>('src/lib/ai-api/operation-pricing.ts');
function fixture(failReserve=false,uncertain=false){
  const row={id:'cache',request_id:'request',kind:'cache',status:'active',provider_name:'cachedContents/private',expires_at:new Date(Date.now()+3600000).toISOString(),created_at:new Date(Date.now()-1000).toISOString(),metadata:{size:100,plan_code:'starter',prices:{cache_hour:{id:'rate',credits:1,cost:.1}}}};
  const db=commerceDatabase({ai_resources:[row]}),calls:string[]=[];
  const api=serverModuleHarness<typeof Cache>('src/lib/ai-api/cache-management.ts',{
    './gateway':{record,AiApiError,rpc:async()=>{calls.push('reserve');if(failReserve)throw Error('insufficient credits');}},
    './operation-pricing':pricing,'./resources':{publicAiResource:(v:unknown)=>v},
    './provider-http':{AiProviderFailure,aiProviderRequest:async()=>{calls.push('provider');if(uncertain)throw new AiProviderFailure(502,true);return {expireTime:new Date(Date.now()+7200000).toISOString()};}},
  });return {api,row,db,calls,client:{...db.client,rpc:async()=>({data:true,error:null})} as never};
}
it('reserves extra storage before extending the cache',async()=>{
  const f=fixture();await f.api.updateAiCache(f.client,f.row,{ttl_seconds:7200});expect(f.calls).toEqual(['reserve','provider']);
  const insufficient=fixture(true);await expect(insufficient.api.updateAiCache(insufficient.client,insufficient.row,{ttl_seconds:7200})).rejects.toThrow('insufficient');expect(insufficient.calls).toEqual(['reserve']);
});
it('keeps an uncertain expiry update for reconciliation instead of retrying the mutation',async()=>{
  const f=fixture(false,true);await expect(f.api.updateAiCache(f.client,f.row,{ttl_seconds:7200})).rejects.toThrow();
  expect(f.db.tables.ai_resources[0].metadata).toHaveProperty('pending_expire_at');
  await expect(f.api.updateAiCache(f.client,f.row,{ttl_seconds:7200})).rejects.toMatchObject({code:'cache_unavailable'});expect(f.calls).toEqual(['reserve','provider']);
});
