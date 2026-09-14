import {createServiceClient} from '@/lib/supabase/service';
import {authenticateAi,AiApiError,record} from '@/lib/ai-api/gateway';
import {loadPublicAiModels} from '@/lib/ai-api/model-service';
import {aiModelDefinition,publicModelId} from '@/lib/ai-api/model-catalog';
import {completeExtendedContent} from '@/lib/ai-api/extended-content';
import {streamExtendedContent} from '@/lib/ai-api/streaming';
import {countAiTokens} from '@/lib/ai-api/count-tokens';
import {geminiContractVersion,unwrapGeminiResult,translateGeminiResources} from '@/lib/ai-api/gemini-contract';
import {readAiJson,aiHttpFailure} from '@/lib/ai-api/http';
import {nativeEmbeddingInput} from '@/lib/ai-api/native-embedding';
import {completeExtendedEmbedding} from '@/lib/ai-api/extended-embeddings';
import {geminiResourceApi,geminiResourceCollections} from '@/lib/ai-api/gemini-resources';
import {geminiBatchApi} from '@/lib/ai-api/gemini-batches';
import {geminiFileSearchApi} from '@/lib/ai-api/gemini-file-search';

export const runtime='nodejs';
export const maxDuration=120;
type Context={params:Promise<{resource:string[]}>};
const headers={'Cache-Control':'no-store','ConnectyHub-API-Version':geminiContractVersion};
function sdkRequest(request:Request,preserveBody=false) {
  const h=new Headers(request.headers);
  const sdkKey=h.get('x-goog-api-key');
  if(!h.has('authorization')&&sdkKey)h.set('authorization',`Bearer ${sdkKey}`);
  h.delete('x-goog-api-key');h.set('x-connectyhub-contract',geminiContractVersion);
  // Next wraps incoming requests in a proxy. Passing that proxy to the native
  // Request constructor fails Undici's private-field brand check.
  const init:RequestInit&{duplex?:'half'}={method:request.method,headers:h};
  if(preserveBody&&!['GET','HEAD'].includes(request.method)&&request.body){init.body=request.body;init.duplex='half';}
  return new Request(request.url,init);
}
function modelId(value:string) {return aiModelDefinition(value)?value:publicModelId(value);}
function modelName(value:string) {
  const id=modelId(value);
  if(id==='connectyhub-auto')throw new AiApiError('model_unavailable',404,'Modelo não encontrado.');
  return id;
}
export async function GET(request:Request,context:Context) {
  try {
    const {resource}=await context.params;
    if(resource[0]==='fileSearchStores')return Response.json(await geminiFileSearchApi(sdkRequest(request,true),resource),{headers});
    if(resource[0]==='batches')return Response.json(await geminiBatchApi(sdkRequest(request,true),resource),{headers});
    if(geminiResourceCollections.includes(resource[0] as never))return Response.json(await geminiResourceApi(sdkRequest(request,true),resource),{headers});
    if(resource[0]!=='models'||resource.length>2)throw new AiApiError('unsupported_method',404,'Método não disponível nesta versão. Consulte a matriz de compatibilidade.');
    const client=createServiceClient(),auth=await authenticateAi(sdkRequest(request),client);
    const catalog=await loadPublicAiModels(client,auth.billing.planCode);
    const models=catalog.filter(m=>m.available).map(m=>{
      const d=aiModelDefinition(m.id)!;
      return {name:`models/${m.id}`,displayName:m.name,description:m.profile,version:geminiContractVersion,
        inputTokenLimit:d.inputCapacity,outputTokenLimit:d.outputCapacity,
        supportedGenerationMethods:d.family==='embeddings'?['embedContent','batchEmbedContents','countTokens']:d.methods.includes('generateContent')?['generateContent','streamGenerateContent','countTokens']:[],
        connectyhub:{usable_with_key:!auth.key.model_id||auth.key.model_id===m.id}};
    });
    if(resource[1]) {
      const m=models.find(m=>m.name===`models/${modelName(resource[1])}`);
      if(!m)throw new AiApiError('model_unavailable',404,'Modelo não disponível.');
      return Response.json(m,{headers});
    }
    const url=new URL(request.url),size=Number(url.searchParams.get('pageSize')??50),offset=Number(url.searchParams.get('pageToken')??0);
    if(!Number.isInteger(size)||size<1||size>100||!Number.isInteger(offset)||offset<0)throw new AiApiError('invalid_pagination',400,'Paginação inválida.');
    return Response.json({models:models.slice(offset,offset+size),...(offset+size<models.length?{nextPageToken:String(offset+size)}:{})},{headers});
  }catch(error){return failure(error);}
}
export async function POST(request:Request,context:Context) {
  try {
    const {resource}=await context.params;
    if(resource[0]==='fileSearchStores')return Response.json(await geminiFileSearchApi(sdkRequest(request,true),resource),{headers});
    if(resource[0]==='batches'||resource[0]==='models'&&/:(batchGenerateContent|asyncBatchEmbedContent)$/.test(resource[1]??''))return Response.json(await geminiBatchApi(sdkRequest(request,true),resource),{headers});
    if(geminiResourceCollections.includes(resource[0] as never))return Response.json(await geminiResourceApi(sdkRequest(request,true),resource),{headers});
    const match=resource.length===2&&resource[0]==='models'?resource[1].match(/^([a-zA-Z0-9.-]+):(generateContent|streamGenerateContent|countTokens|embedContent|batchEmbedContents)$/):null;
    if(!match)throw new AiApiError('unsupported_method',404,'Método não disponível nesta versão. Consulte a matriz de compatibilidade.');
    const sdk=sdkRequest(request),id=modelName(match[1]),raw=record(await readAiJson(request,4_000_000));
    if(match[2]==='embedContent'||match[2]==='batchEmbedContents') {
      const batch=match[2]==='batchEmbedContents';
      if(batch&&(Object.keys(raw).some(k=>k!=='requests')||!Array.isArray(raw.requests)||!raw.requests.length||raw.requests.length>100))throw new AiApiError('invalid_embedding',422,'Informe de 1 a 100 requests.');
      const entries=batch?raw.requests as unknown[]:[raw];
      const inputs=entries.map(value=>{const item=record(value);if(item.model&&modelName(String(item.model).replace(/^models\//,''))!==id)throw new AiApiError('model_key_mismatch',422,'Modelo divergente.');return nativeEmbeddingInput(item,id);});
      const result=record(await completeExtendedEmbedding(createServiceClient(),sdk,batch?{model:id,requests:inputs}:inputs[0]));
      const embeddings=(result.data as unknown[]).map(value=>({values:record(value).embedding}));
      return Response.json({...batch?{embeddings}:{embedding:embeddings[0]},usageMetadata:result.usageMetadata,connectyhub:{...record(result.connectyhub),metering_basis:result.meteringBasis}},{headers});
    }
    translateGeminiResources(raw);
    if(match[2]==='countTokens') {
      if(raw.generateContentRequest){const g=record(raw.generateContentRequest);if(g.model)g.model=modelName(String(g.model).replace(/^models\//,''));translateGeminiResources(g);}
      return Response.json(await countAiTokens(sdk,id,raw),{headers});
    }
    if(raw.model&&modelName(String(raw.model).replace(/^models\//,''))!==id)throw new AiApiError('model_key_mismatch',422,'Modelo divergente.');
    if(match[2]==='streamGenerateContent')return streamExtendedContent(sdk,{...raw,model:id});
    const result=await completeExtendedContent(sdk,{...raw,model:id});
    return Response.json(unwrapGeminiResult(result),{headers});
  }catch(error){return failure(error);}
}
export async function DELETE(request:Request,context:Context){try{const {resource}=await context.params;const handler=resource[0]==='batches'?geminiBatchApi:resource[0]==='fileSearchStores'?geminiFileSearchApi:geminiResourceApi;return Response.json(await handler(sdkRequest(request),resource),{headers});}catch(error){return failure(error);}}
export async function PATCH(request:Request,context:Context){try{return Response.json(await geminiResourceApi(sdkRequest(request,true),(await context.params).resource),{headers});}catch(error){return failure(error);}}
function failure(error:unknown) {
  const response=aiHttpFailure(error);
  // Google SDKs understand numeric error.code; keep application codes in details.
  const status=({401:'UNAUTHENTICATED',402:'FAILED_PRECONDITION',403:'PERMISSION_DENIED',404:'NOT_FOUND',405:'UNIMPLEMENTED',409:'ABORTED',429:'RESOURCE_EXHAUSTED'} as Record<number,string>)[response.status]??(response.status>=500?'UNAVAILABLE':'INVALID_ARGUMENT');
  return response.json().then(body=>Response.json({error:{code:response.status,status,message:body.error.message,details:[{reason:body.error.code,request_id:body.error.request_id}]}},{status:response.status,headers:{...headers,...(response.headers.has('Retry-After')?{'Retry-After':response.headers.get('Retry-After')!}:{})}}));
}
