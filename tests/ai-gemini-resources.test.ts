import {describe,it,expect} from 'vitest';
import {serverModuleHarness} from './helpers/server-module-harness';
import type * as Resources from '../src/lib/ai-api/gemini-resources';
class AiApiError extends Error {constructor(public code:string,public status:number,message:string){super(message);}}
const record=(v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
function fixture() {
  const calls:Array<unknown[]>=[],row={id:'owned',model_id:'public',status:'active',metadata:{display_name:'Example',size_bytes:3,uri:'https://provider/private',file_response:{sha256Hash:'hash'}}};
  const query={select(){return this;},eq(...args:unknown[]){calls.push(['eq',...args]);return this;},neq(){return this;},order(){return this;},range:async(...args:unknown[])=>{calls.push(['range',...args]);return {data:[row,{...row,id:'next'}]};}};
  const api=serverModuleHarness<typeof Resources>('src/lib/ai-api/gemini-resources.ts',{
    '@/lib/supabase/service':{createServiceClient:()=>({from:()=>query})},
    './gateway':{record,AiApiError,authenticateAi:async()=>({project:{id:'project'},key:{model_id:'public'}})},
    './files':{getOwnedAiResource:async(_c:unknown,auth:{project:{id:string}},id:string,kind:string)=>{calls.push(['owned',auth.project.id,id,kind]);return row;},refreshAiFile:async(...args:unknown[])=>{calls.push(['file',args[2],args[3]]);}},
    './resources':{createAuthorizedAiResource:async(_c:unknown,_r:unknown,_a:unknown,kind:string,body:unknown)=>{calls.push(['create',kind,body]);return {id:'owned'};},refreshAiResource:async()=>{calls.push(['refresh']);}},
    './resource-management':{removeAiStoredResource:async()=>{calls.push(['remove']);}},
    './cache-management':{updateAiCache:async(_c:unknown,_r:unknown,body:unknown)=>{calls.push(['update',body]);}},
    './model-catalog':{aiModelDefinition:(id:string)=>id==='public'?{}:null,publicModelId:()=> 'public'},
    './http':{readAiJson:(r:Request)=>r.json()},
  },[],{Request});
  const run=(method:string,path:string,body?:unknown)=>api.geminiResourceApi(new Request(`https://example/api/v1beta/${path}`,{method,...(body?{body:JSON.stringify(body)}:{})}),path.split('?')[0].split('/'));
  return {api,calls,row,run};
}
describe('Native resource adapters',()=>{
  it('lists only the authorized project and exposes local resource identities',async()=>{
    const f=fixture();expect(await f.run('GET','files?pageSize=1')).toMatchObject({files:[{name:'files/owned',uri:'files/owned',sha256Hash:'hash'}],nextPageToken:'1'});
    expect(f.calls).toContainEqual(['eq','project_id','project']);expect(f.calls).toContainEqual(['eq','kind','file']);
    expect(JSON.stringify(f.api.geminiResourceObject(f.row,'files'))).not.toContain('provider/private');
  });
  it('routes file deletion through the existing ownership-aware lifecycle',async()=>{
    const f=fixture();expect(await f.run('DELETE','files/owned')).toEqual({});
    expect(f.calls).toEqual([['owned','project','owned','file'],['file','owned',true]]);
  });
  it('uses the existing paid cache creation and renewal rather than a parallel debit',async()=>{
    const f=fixture();await f.run('POST','cachedContents',{model:'models/public',contents:[],ttl:'60s',displayName:'Cache'});
    expect(f.calls[0]).toEqual(['create','caches',expect.objectContaining({model:'public',ttl_seconds:60,display_name:'Cache'})]);
    await f.run('PATCH','cachedContents/owned?updateMask=ttl',{ttl:'120s'});
    expect(f.calls).toContainEqual(['update',{ttl_seconds:120}]);
  });
  it('rejects mutations outside cache expiration, ambiguous expiration and invalid pagination',async()=>{
    const f=fixture();
    await expect(f.run('PATCH','cachedContents/owned',{ttl:'60s',model:'different'})).rejects.toThrow('Somente');
    await expect(f.run('PATCH','cachedContents/owned',{ttl:'60s',expireTime:'2030-01-01'})).rejects.toThrow('exclusivamente');
    await expect(f.run('GET','files?pageSize=101')).rejects.toThrow('Paginação');
    expect(f.calls.some(c=>c[0]==='update')).toBe(false);
  });
});
