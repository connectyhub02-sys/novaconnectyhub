import {describe,it,expect} from 'vitest';
import {serverModuleHarness} from './helpers/server-module-harness';
import {geminiOpenApiSpec} from '../src/lib/ai-api/gemini-openapi';
import {nativeEmbeddingInput} from '../src/lib/ai-api/native-embedding';
import type * as Route from '../src/app/api/v1beta/[...resource]/route';
import * as contract from '../src/lib/ai-api/gemini-contract';
class AiApiError extends Error {constructor(public code:string,public status:number,message:string){super(message);}}
const record=(v:unknown)=>v&&typeof v==='object'?v as Record<string,unknown>:{};
function fixture(){
  const calls:Record<string,unknown>[]=[];
  const api=serverModuleHarness<typeof Route & {sdkRequest:(request:Request,preserveBody?:boolean)=>Request}>('src/app/api/v1beta/[...resource]/route.ts',{
    '@/lib/supabase/service':{createServiceClient:()=>({})},
    '@/lib/ai-api/gateway':{record,AiApiError,authenticateAi:async()=>({billing:{},key:{model_id:'public'}})},
    '@/lib/ai-api/model-catalog':{aiModelDefinition:(id:string)=>id==='public'?{id:'public',family:'text',methods:['generateContent'],inputCapacity:100,outputCapacity:10}:null,publicModelId:(id:string)=>id==='provider-model'?'public':'connectyhub-auto'},
    '@/lib/ai-api/model-service':{loadPublicAiModels:async()=>[{id:'public',name:'Model',available:true}]},
    '@/lib/ai-api/gemini-contract':contract,
    '@/lib/ai-api/gemini-resources':{geminiResourceCollections:['files','cachedContents']},
    '@/lib/ai-api/http':{readAiJson:async(req:Request)=>req.json(),aiHttpFailure:(error:AiApiError)=>Response.json({error:{message:error.message,code:error.code}},{status:error.status??503})},
    '@/lib/ai-api/count-tokens':{countAiTokens:async(request:Request,id:string,body:unknown)=>{calls.push({authorization:request.headers.get('authorization'),googleKey:request.headers.get('x-goog-api-key'),id,body});return {totalTokens:4};}},
    '@/lib/ai-api/native-embedding':{nativeEmbeddingInput},
    '@/lib/ai-api/extended-embeddings':{completeExtendedEmbedding:async(_c:unknown,_r:unknown,body:unknown)=>{calls.push({body});return {data:[{embedding:[.1,.2]}],usageMetadata:{promptTokenCount:3},connectyhub:{credits:1}};}},
  },['sdkRequest'],{Request,Headers});
  const post=(operation:string,body:unknown)=>api.POST(new Request(`https://app.invalid/api/v1beta/models/provider-model:${operation}`,{method:'POST',headers:{'x-goog-api-key':'fixture-connectyhub'},body:JSON.stringify(body)}),{params:Promise.resolve({resource:['models',`provider-model:${operation}`]})});
  return {api,calls,post};
}
describe('Gemini HTTP compatibility',()=>{
  it('adapts framework request proxies without losing streamed bodies or SDK authentication',async()=>{
    const f=fixture();
    for(const method of ['GET','POST','PATCH','DELETE']) {
      const original=new Request('https://app.invalid/api/v1beta/batches',{method,headers:{'x-goog-api-key':'fixture','Idempotency-Key':'stable'},...(['POST','PATCH'].includes(method)?{body:JSON.stringify({sample:'synthetic'})}:{})});
      const wrapped=new Proxy(original,{get:(target,key)=>{const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
      const adapted=f.api.sdkRequest(wrapped,true);
      expect(adapted.method).toBe(method);expect(adapted.headers.get('authorization')).toBe('Bearer fixture');
      expect(adapted.headers.get('x-goog-api-key')).toBeNull();expect(adapted.headers.get('Idempotency-Key')).toBe('stable');
      expect(await adapted.text()).toBe(['POST','PATCH'].includes(method)?JSON.stringify({sample:'synthetic'}):'');
    }
  });
  it('resolves all schema references in the separate contract',()=>{
    const spec=JSON.parse(JSON.stringify(geminiOpenApiSpec));
    const walk=(v:unknown)=>{if(!v||typeof v!=='object')return;for(const [key,value]of Object.entries(v)){if(key==='$ref')expect(String(value).slice(2).split('/').reduce((node,p)=>node?.[p],spec),String(value)).toBeDefined();else walk(value);}};
    walk(spec);
  });
  it('maps SDK auth and model aliases for count without calling generation',async()=>{
    const f=fixture(),response=await f.post('countTokens',{generateContentRequest:{model:'models/provider-model',contents:[{parts:[{text:'hi'}]}]}});
    expect(response.status).toBe(200);expect(await response.json()).toEqual({totalTokens:4});
    expect(f.calls).toEqual([{authorization:'Bearer fixture-connectyhub',googleKey:null,id:'public',body:{generateContentRequest:{model:'public',contents:[{parts:[{text:'hi'}]}]}}}]);
  });
  it('maps SDK embeddings and rejects a different bound model',async()=>{
    const f=fixture();expect(await (await f.post('embedContent',{content:{parts:[{text:'hi'}]},outputDimensionality:128})).json()).toMatchObject({embedding:{values:[.1,.2]},connectyhub:{credits:1}});
    expect(f.calls[0].body).toMatchObject({model:'public',dimensions:128});
    const response=await f.post('embedContent',{model:'models/other',content:{parts:[{text:'hi'}]}});
    expect(response.status).toBe(404);expect(f.calls).toHaveLength(1);
  });
  it('rejects invalid embedding configuration instead of dropping it',()=>{
    for(const embedContentConfig of ['invalid',[],{autoTruncate:true}])expect(()=>nativeEmbeddingInput({content:{parts:[{text:'hi'}]},embedContentConfig},'public')).toThrow();
  });
});
