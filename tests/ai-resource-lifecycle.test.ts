import {describe,it,expect} from 'vitest';
import {serverModuleHarness} from './helpers/server-module-harness';
import {commerceDatabase} from './helpers/commerce-database';
import * as metering from '../src/lib/ai-api/content-metering';
import * as interactions from '../src/lib/ai-api/interaction-metering';
import type * as Resources from '../src/lib/ai-api/resources';
import type * as Embeddings from '../src/lib/ai-api/extended-embeddings';
import {parseEmbeddingInput} from '../src/lib/ai-api/embedding-input';
import {parseNativeAiInput} from '../src/lib/ai-api/native-input';
type Row=Record<string,unknown>;
const record=(value:unknown):Row=>value&&typeof value==='object'?value as Row:{};
class AiApiError extends Error{constructor(public code:string,public status:number,message:string){super(message);}}
class AiProviderFailure extends Error{constructor(public status:number,public uncertain:boolean){super('provider failure');}}
const pricing=serverModuleHarness<typeof import('../src/lib/ai-api/operation-pricing')>('src/lib/ai-api/operation-pricing.ts');
const rate={id:'price',cost:.001,credits:.1};
function fixture(kind:string,provider:Row,metadata:Row={}) {
  const id='00000000-0000-4000-8000-000000000001';
  const row={id,request_id:id,project_id:'project',key_id:'key',organization_id:'org',model_id:'flash-3.5',kind,status:'processing',provider_name:'batches/internal',created_at:new Date(Date.now()-3600000).toISOString(),
    metadata:{prices:{input:rate,output:rate,cache_hour:rate},plan_code:'starter',execution_kind:kind,...metadata}};
  const db=commerceDatabase({ai_resources:[row],ai_requests:[{id,status:'processing',result_snapshot:null}]}),settlements:Row[]=[],http:string[]=[];
  const client={...db.client,rpc:async()=>({data:true,error:null})};
  const rpc=async(_client:unknown,name:string,body:Row)=>{if(name==='settle_ai_operation'){settlements.push(body);return {response:body.p_response};}return {};};
  const api=serverModuleHarness<typeof Resources>('src/lib/ai-api/resources.ts',{
    './gateway':{record,AiApiError,rpc},'./model-catalog':{aiModelDefinition:()=>({id:'flash-3.5',family:'text'})},
    './provider-http':{AiProviderFailure,aiProviderRequest:async(_client:unknown,path:string)=>{http.push(path);return provider;}},
    './operation-ledger':{settleAiOperation:async(_client:unknown,_op:unknown,units:Row,result:Row)=>{settlements.push({units,result});return {...result,connectyhub:{credits:1}};}},
    './operation-pricing':pricing,'./content-metering':metering,'./interaction-metering':interactions,
  });
  return {api,client:client as never,db,row,settlements,http};
}
describe('Resource completion and recovery',()=>{
  it('does not debit or publish a running batch',async()=>{
    const f=fixture('batch',{done:false});expect(await f.api.refreshAiResource(f.client,f.row)).toMatchObject({status:'processing'});expect(f.settlements).toHaveLength(0);
  });
  it('preserves per-item tariffs when batch results arrive out of order',async()=>{
    const response={usageMetadata:{promptTokenCount:10,candidatesTokenCount:2},candidates:[]};
    const f=fixture('batch',{done:true,response:{inlinedResponses:{inlinedResponses:[{metadata:{index:'1',key:'b'},response},{metadata:{index:'0',key:'a'},response}]}}},
      {count:2,item_prices:[{input:rate,output:rate},{input:{...rate,credits:2},output:rate}]});
    const result=await f.api.refreshAiResource(f.client,f.row);expect(result.status).toBe('completed');
    expect(f.settlements[0].units).toEqual({item1_input:10,item1_output:2,item0_input:10,item0_output:2});
    expect(f.http).toEqual(['/v1beta/batches/internal']);
  });
  it('does not settle incomplete or duplicate batch entries',async()=>{
    const f=fixture('batch',{done:true,response:{inlinedResponses:{inlinedResponses:[{error:{}}]}}},{count:2});
    await expect(f.api.refreshAiResource(f.client,f.row)).rejects.toThrow('parcial');expect(f.settlements).toHaveLength(0);
  });
  it('can settle an entirely failed batch with zero confirmed generated items',async()=>{
    const f=fixture('batch',{done:true,metadata:{batchStats:{successfulRequestCount:'0',failedRequestCount:'2'},state:'BATCH_STATE_FAILED'}},{count:2});
    expect(await f.api.refreshAiResource(f.client,f.row)).toMatchObject({status:'completed'});expect(f.settlements[0].units).toEqual({});
  });
  it('retries a persisted settlement without querying or regenerating upstream',async()=>{
    const f=fixture('interaction',{});f.db.tables.ai_requests[0].result_snapshot={p_response:{id:f.row.id,status:'completed',connectyhub:{credits:42}}};
    expect(await f.api.refreshAiResource(f.client,f.row)).toMatchObject({status:'completed',result:{connectyhub:{credits:42}}});expect(f.http).toHaveLength(0);
  });
  it('uses the saved cache end time after a crash, without charging extra waiting time',async()=>{
    const end=new Date(Date.now()-1800000).toISOString();const f=fixture('cache',{}, {size:100,ended_at:end,settlement_status:'deleted'});
    const patch={status:'settling',expires_at:new Date(Date.now()-1000).toISOString()};Object.assign(f.row,patch);Object.assign(f.db.tables.ai_resources[0],patch);
    const result=await f.api.refreshAiResource(f.client,f.row);
    expect(result.status).toBe('deleted');expect(Number(record(f.settlements[0].units).cache_hour)).toBeCloseTo(50,1);
  });
  it('rewrites generated media references into authenticated project downloads',()=>{
    const media:Row[]=[];
    const result=interactions.publicInteraction({status:'completed',steps:[{type:'thought',content:[]},{type:'model_output',content:[{type:'video',uri:'https://generativelanguage.googleapis.com/v1beta/files/private'}]}]},'owned','omni-1.1-flash',media);
    expect(JSON.stringify(result)).not.toMatch(/googleapis|private|thought/);expect(JSON.stringify(result)).toContain('/interactions/owned/content?index=0');expect(media).toHaveLength(1);
  });
  it('reloads expiry under the worker lease before deciding to charge an old cache snapshot',async()=>{
    const f=fixture('cache',{}, {size:100});
    Object.assign(f.row,{status:'active',expires_at:new Date(Date.now()-1000).toISOString()});
    Object.assign(f.db.tables.ai_resources[0],{status:'active',expires_at:new Date(Date.now()+3600000).toISOString()});
    expect(await f.api.refreshAiResource(f.client,f.row)).toMatchObject({status:'active'});
    expect(f.settlements).toHaveLength(0);expect(f.http).toHaveLength(0);
  });
});
describe('Multimodal embeddings',()=>{
  function embeddingFixture(){
    const calls:Row[]=[];
    const api=serverModuleHarness<typeof Embeddings>('src/lib/ai-api/extended-embeddings.ts',{
      './gateway':{record,AiApiError},'./embedding-input':{parseEmbeddingInput},'./native-input':{parseNativeAiInput},'./files':{resolveAiFileParts:async()=>[]},
      './provider-http':{aiProviderRequest:async(_client:unknown,_path:unknown,_method:unknown,body:Row)=>{calls.push(body);return {totalTokens:10,promptTokensDetails:[{modality:'IMAGE',tokenCount:10}]};}},
      './content-metering':metering,'./operation-pricing':pricing,
    });
    const operation={model:{family:'embeddings',providerId:'internal',capabilities:['image_input'],inputCapacity:8192},prices:{input:rate,image_input:{...rate,credits:2}}};
    return {api,calls,operation};
  }
  it('rejects empty input before contacting the provider',async()=>{
    const f=embeddingFixture();await expect(f.api.prepareAiEmbedding({} as never,{} as never,f.operation as never,{})).rejects.toMatchObject({code:'invalid_embedding'});expect(f.calls).toHaveLength(0);
  });
  it('counts image input with its dedicated tariff and sends current configuration structure',async()=>{
    const f=embeddingFixture();const result=await f.api.prepareAiEmbedding({} as never,{} as never,f.operation as never,{content:{parts:[{inlineData:{mimeType:'image/png',data:'YQ=='}}]},dimensions:128});
    expect(result.units).toMatchObject({image_input:10,input:0});expect(result.body.embedContentConfig.outputDimensionality).toBe(128);
    expect(f.api.measureAiEmbedding({usageMetadata:{promptTokenCount:10,promptTokenDetails:[{modality:'IMAGE',tokenCount:10}]}},f.operation.prices)).toMatchObject({image_input:10});
  });
});
