import {it,expect} from 'vitest';
import {serverModuleHarness} from './helpers/server-module-harness';
import {commerceDatabase} from './helpers/commerce-database';
import type * as Management from '../src/lib/ai-api/resource-management';
type Row=Record<string,unknown>;
const record=(v:unknown):Row=>v&&typeof v==='object'?v as Row:{};
class AiProviderFailure extends Error {constructor(public status:number){super('provider refusal');}}
function fixture(refuse=false) {
  const row={id:'document',project_id:'project',kind:'document',status:'completed',metadata:{document_name:'fileSearchStores/store/documents/document'}};
  const db=commerceDatabase({ai_resources:[row]}),calls:string[]=[];
  const api=serverModuleHarness<typeof Management>('src/lib/ai-api/resource-management.ts',{
    './gateway':{record,AiApiError:Error},'./resources':{publicAiResource:(v:unknown)=>v},
    './provider-http':{AiProviderFailure,aiProviderRequest:async(_c:unknown,path:string)=>{calls.push(path);if(refuse)throw new AiProviderFailure(400);return {};}},
  });
  return {api,db,row,calls};
}
it('forwards native force without changing legacy document deletion defaults',async()=>{
  for(const force of [undefined,false,true]) {
    const f=fixture();await f.api.removeAiStoredResource(f.db.client as never,f.row,{force});
    expect(f.calls).toEqual([`/v1beta/fileSearchStores/store/documents/document${force===undefined?'':`?force=${force}`}`]);
    expect(f.db.tables.ai_resources[0].status).toBe('deleted');
  }
});
it('does not mark a document deleted when the provider refuses deletion',async()=>{
  const f=fixture(true);
  await expect(f.api.removeAiStoredResource(f.db.client as never,f.row,{force:false})).rejects.toThrow('provider refusal');
  expect(f.db.tables.ai_resources[0].status).toBe('completed');
});
