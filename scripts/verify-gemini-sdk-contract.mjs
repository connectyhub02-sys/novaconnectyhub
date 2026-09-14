// Offline SDK contract probe. Install @google/genai in an isolated directory and
// set CONNECTYHUB_SDK_TEST_ROOT to that directory. No external request is allowed.
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';

const sdkRoot=process.env.CONNECTYHUB_SDK_TEST_ROOT;
if(!sdkRoot)throw new Error('Set CONNECTYHUB_SDK_TEST_ROOT to the isolated SDK install directory.');
const sdkRequire=createRequire(resolve(sdkRoot,'package.json'));
const {GoogleGenAI}=sdkRequire('@google/genai');
const record=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
class AiApiError extends Error {}
function load(file,imports={}) {
  const exports={};
  const js=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(js,{exports,require:name=>imports[name]??{},URL,Date,Buffer,Request,Response});
  return exports;
}
const {nativeEmbeddingInput}=load('src/lib/ai-api/native-embedding.ts',{'./advanced-input':{AiInputError:AiApiError}});
const batches=load('src/lib/ai-api/gemini-batches.ts',{
  './gateway':{record,AiApiError},'./model-catalog':{aiModelDefinition:id=>['flash-3.5','embedding-2'].includes(id)?{family:id==='embedding-2'?'embeddings':'text'}:null,publicModelId:()=> 'connectyhub-auto'},
  './native-embedding':{nativeEmbeddingInput},
  './gemini-contract':load('src/lib/ai-api/gemini-contract.ts'),
});
const id='00000000-0000-4000-8000-000000000001',calls=[];
const contract=load('src/lib/ai-api/gemini-contract.ts');
const search=load('src/lib/ai-api/gemini-file-search.ts',{'./gateway':{record,AiApiError}});
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url);
  assert.equal(url.origin,'https://offline.invalid','Network access prohibited in SDK probe');
  assert.equal(request.headers.get('x-goog-api-key'),'connectyhub-fixture');
  const raw=await request.text(),body=raw?JSON.parse(raw):{};
  calls.push({path:url.pathname,method:request.method});
  let response;
  if(url.pathname.endsWith(':batchGenerateContent')||url.pathname.endsWith(':asyncBatchEmbedContent')) {
    const embedding=url.pathname.endsWith(':asyncBatchEmbedContent'),model=embedding?'embedding-2':'flash-3.5';
    const parsed=batches.nativeBatchInput(body,model,embedding);
    assert.equal(parsed.requests.length,1);
    response=batches.nativeBatchOperation({id,model_id:model,status:'processing',metadata:{display_name:parsed.display_name}});
  }else if(url.pathname===`/api/v1beta/batches/${id}`) {
    response=batches.nativeBatchOperation({id,model_id:'flash-3.5',status:'completed',metadata:{native_operation:{done:true,metadata:{state:'BATCH_STATE_SUCCEEDED'},response:{inlinedResponses:{inlinedResponses:[{response:{candidates:[{content:{role:'model',parts:[{text:'offline result',thoughtSignature:'opaque'}]}}],usageMetadata:{promptTokenCount:2,candidatesTokenCount:2}}}]}}}}});
  }else if(url.pathname===`/api/v1beta/fileSearchStores/${id}:importFile`) {
    assert.equal(search.nativeSearchImport(body).file,id);
    response=search.nativeSearchOperation({id,status:'processing'},id);
  }else if(url.pathname===`/api/v1beta/fileSearchStores/${id}/operations/${id}`) {
    response=search.nativeSearchOperation({id,status:'completed'},id);
  }else if(url.pathname===`/api/v1beta/fileSearchStores`||url.pathname===`/api/v1beta/fileSearchStores/${id}`) {
    response=search.nativeSearchObject({id,status:'active',metadata:{display_name:'Offline store'}});
  }else if(url.pathname.endsWith(':countTokens'))response={totalTokens:2};
  else if(url.pathname.endsWith(':generateContent')) {
    if(body.tools)assert.equal(contract.translateGeminiResources(body).tools[0].fileSearch.stores[0],`stores/${id}`);
    response={candidates:[{content:{role:'model',parts:[{text:'offline result',thoughtSignature:'opaque'}]}}],usageMetadata:{promptTokenCount:2,candidatesTokenCount:2},connectyhub:{credits:1}};
  }
  else throw new Error(`Unexpected SDK method ${request.method} ${url.pathname}`);
  return Response.json(response);
};
try {
  const ai=new GoogleGenAI({apiKey:'connectyhub-fixture',httpOptions:{baseUrl:'https://offline.invalid/api',apiVersion:'v1beta',headers:{'Idempotency-Key':'offline-fixture'},retryOptions:{attempts:1}}});
  const result=await ai.models.generateContent({model:'flash-3.5',contents:'synthetic input'});
  assert.equal(result.text,'offline result');assert.equal(result.candidates[0].content.parts[0].thoughtSignature,'opaque');
  assert.equal((await ai.models.countTokens({model:'flash-3.5',contents:'synthetic input'})).totalTokens,2);
  const batch=await ai.batches.create({model:'flash-3.5',src:[{contents:'synthetic input',metadata:{key:'one'}}],config:{displayName:'Offline batch'}});
  assert.equal(batch.name,`batches/${id}`);
  const fetched=await ai.batches.get({name:batch.name});
  assert.equal(fetched.state,'JOB_STATE_SUCCEEDED');
  assert.equal(fetched.dest.inlinedResponses[0].response.candidates[0].content.parts[0].text,'offline result');
  const embedding=await ai.batches.createEmbeddings({model:'embedding-2',src:{inlinedRequests:{contents:['synthetic input'],config:{outputDimensionality:128}}},config:{displayName:'Offline vectors'}});
  assert.equal(embedding.name,`batches/${id}`);
  const store=await ai.fileSearchStores.create({config:{displayName:'Offline store'}});
  assert.equal(store.name,`fileSearchStores/${id}`);
  assert.equal((await ai.fileSearchStores.get({name:store.name})).displayName,'Offline store');
  const imported=await ai.fileSearchStores.importFile({fileSearchStoreName:store.name,fileName:`files/${id}`,config:{customMetadata:[{key:'category',stringValue:'synthetic'}]}});
  assert.equal(imported.done,false);
  const indexed=await ai.operations.get({operation:imported});
  assert.equal(indexed.done,true);assert.equal(indexed.response.parent,store.name);
  assert.equal(indexed.response.documentName,`${store.name}/documents/${id}`);
  assert.equal((await ai.models.generateContent({model:'flash-3.5',contents:'synthetic query',config:{tools:[{fileSearch:{fileSearchStoreNames:[store.name]}}]}})).text,'offline result');
  console.log(JSON.stringify({ok:true,sdk:'@google/genai',calls,external_requests:0}));
}finally{globalThis.fetch=originalFetch;}
