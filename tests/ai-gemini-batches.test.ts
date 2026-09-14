import {describe,it,expect} from 'vitest';
import {serverModuleHarness} from './helpers/server-module-harness';
import {nativeEmbeddingInput} from '../src/lib/ai-api/native-embedding';
import {translateGeminiResources} from '../src/lib/ai-api/gemini-contract';
import type * as Batches from '../src/lib/ai-api/gemini-batches';
type Row=Record<string,unknown>;
class AiApiError extends Error {constructor(public code:string,public status:number,message:string){super(message);}}
const record=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const id='00000000-0000-4000-8000-000000000001';
function fixture() {
  const calls:unknown[][]=[],row:Row={id,request_id:id,project_id:'project',model_id:'public',status:'processing',metadata:{display_name:'Batch'}};
  const query={select(){return this;},eq(...args:unknown[]){calls.push(['eq',...args]);return this;},neq(){return this;},order(){return this;},range:async()=>({data:[row,{...row,id:'next'}]})};
  const api=serverModuleHarness<typeof Batches>('src/lib/ai-api/gemini-batches.ts',{
    '@/lib/supabase/service':{createServiceClient:()=>({from:()=>query})},
    './gateway':{record,AiApiError,authenticateAi:async()=>({project:{id:'project'},key:{model_id:'public'}})},
    './model-catalog':{aiModelDefinition:(name:string)=>['public','vector'].includes(name)?{family:name==='vector'?'embeddings':'text'}:null,publicModelId:(name:string)=>name==='provider-model'?'public':'connectyhub-auto'},
    './files':{getOwnedAiResource:async(_c:unknown,auth:{project:{id:string}},target:string,kind:string)=>{calls.push(['owned',auth.project.id,target,kind]);if(target!==id)throw new AiApiError('resource_not_found',404,'Not owned');return row;}},
    './resources':{createAuthorizedAiResource:async(_c:unknown,request:Request,_a:unknown,collection:string,body:unknown)=>{calls.push(['create',collection,body,request.headers.get('idempotency-key')]);return {id};},refreshAiResource:async(_c:unknown,_r:unknown,cancel:boolean)=>{calls.push(['refresh',!!cancel]);}},
    './resource-management':{removeAiStoredResource:async()=>{calls.push(['delete']);}},
    './native-embedding':{nativeEmbeddingInput},'./http':{readAiJson:(request:Request)=>request.json()},
    './gemini-contract':{translateGeminiResources},
  },[],{Request});
  const run=(method:string,path:string,body?:unknown)=>api.geminiBatchApi(new Request('https://example/api/v1beta/'+path,{method,headers:{'Idempotency-Key':'stable'},...(body?{body:JSON.stringify(body)}:{})}),path.split('?')[0].split('/'));
  return {api,calls,row,run};
}
const input={batch:{model:'models/public',displayName:'Example',inputConfig:{requests:{requests:[{request:{contents:[{role:'user',parts:[{text:'Hello'}]}]},metadata:{key:'customer',index:'their-index'}}]}}}};
describe('Native batch adapters',()=>{
  it('creates through the existing billing path and preserves identity and client metadata',async()=>{
    const f=fixture();await f.run('POST','models/provider-model:batchGenerateContent',input);
    expect(f.calls[0]).toEqual(['create','batches',expect.objectContaining({model:'public',native_batch:true,requests:[expect.objectContaining({key:'0',metadata:{key:'customer',index:'their-index'}})]}),'stable']);
    expect(f.calls[1]).toEqual(['owned','project',id,'batch']);
  });
  it('rejects file-backed batches, ignored configuration and mismatched item models before creation',()=>{
    const f=fixture();
    expect(()=>f.api.nativeBatchInput({batch:{...input.batch,inputConfig:{fileName:'files/foreign'}}},'public',false)).toThrow('arquivo');
    expect(()=>f.api.nativeBatchInput({batch:{...input.batch,priority:'1'}},'public',false)).toThrow('contrato');
    expect(()=>f.api.nativeBatchInput({batch:{...input.batch,inputConfig:{requests:{requests:[{request:{model:'models/vector',contents:[]}}]}}}},'public',false)).toThrow('divergente');
    expect(f.calls).toHaveLength(0);
  });
  it('translates native embedding configuration and rejects the wrong method family',async()=>{
    const f=fixture();
    const body={batch:{model:'models/vector',displayName:'Vectors',inputConfig:{requests:{requests:[{request:{content:{parts:[{text:'hi'}]},outputDimensionality:128}}]}}}};
    expect(f.api.nativeBatchInput(body,'vector',true).requests[0].request).toMatchObject({model:'vector',dimensions:128});
    await expect(f.run('POST','models/public:asyncBatchEmbedContent',body)).rejects.toThrow('compatível');
  });
  it('lists local project operations with pagination without contacting the provider or charging',async()=>{
    const f=fixture();expect(await f.run('GET','batches?pageSize=1')).toMatchObject({operations:[{name:`batches/${id}`,done:false}],nextPageToken:'1'});
    expect(f.calls).toEqual([['eq','project_id','project'],['eq','kind','batch']]);
    await expect(f.run('GET','batches?filter=all')).rejects.toThrow('Filtros');
  });
  it('checks ownership before refresh, cancel or deletion',async()=>{
    const f=fixture();const other='00000000-0000-4000-8000-000000000099';
    for(const [method,suffix]of [['GET',''],['POST',':cancel'],['DELETE','']])await expect(f.run(method,`batches/${other}${suffix}`)).rejects.toThrow('Not owned');
    expect(f.calls.every(c=>c[0]==='owned')).toBe(true);
    await f.run('POST',`batches/${id}:cancel`);expect(f.calls.at(-1)).toEqual(['refresh',true]);
    await f.run('DELETE',`batches/${id}`);expect(f.calls.at(-1)).toEqual(['delete']);
  });
  it('preserves native output signatures and client metadata without exposing upstream resource identity',()=>{
    const f=fixture();f.row.status='completed';f.row.metadata={client_metadata:[{key:'first'},{key:'second',index:'client-index'}],native_operation:{name:'batches/provider-secret',done:true,metadata:{model:'models/provider-model',state:'BATCH_STATE_SUCCEEDED'},response:{inlinedResponses:{inlinedResponses:[{metadata:{index:'1',key:'1'},response:{candidates:[{content:{parts:[{thoughtSignature:'opaque'}]}}],usageMetadata:{promptTokenCount:3}}}]}}},result:{connectyhub:{credits:2}}};
    const result=f.api.nativeBatchOperation(f.row);
    expect(result).toMatchObject({name:`batches/${id}`,done:true,connectyhub:{credits:2},response:{inlinedResponses:{inlinedResponses:[{metadata:{key:'second',index:'client-index'},response:{usageMetadata:{promptTokenCount:3}}}]}}});
    expect(JSON.stringify(result)).toContain('opaque');expect(JSON.stringify(result)).not.toContain('provider-secret');expect(JSON.stringify(result)).not.toContain('provider-model');
  });
  it('does not disguise cancellation or missing legacy native output as successful generation',()=>{
    const f=fixture();f.row.status='completed';f.row.metadata={native_operation:{done:true,metadata:{state:'BATCH_STATE_CANCELLED'}}};
    expect(f.api.nativeBatchOperation(f.row)).toMatchObject({done:true,error:{code:1}});
    f.row.metadata={};expect(f.api.nativeBatchOperation(f.row)).toMatchObject({done:false,connectyhub:{native_result_pending:true}});
  });
});
