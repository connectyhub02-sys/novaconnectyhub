import {describe,it,expect} from 'vitest';
import {serverModuleHarness} from './helpers/server-module-harness';
import {translateGeminiResources} from '../src/lib/ai-api/gemini-contract';
import type * as Search from '../src/lib/ai-api/gemini-file-search';
type Row=Record<string,unknown>;
class AiApiError extends Error {constructor(public code:string,public status:number,message:string){super(message);}}
const record=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const storeId='00000000-0000-4000-8000-000000000001',docId='00000000-0000-4000-8000-000000000002',fileId='00000000-0000-4000-8000-000000000003';
function fixture() {
  const calls:unknown[][]=[],store:Row={id:storeId,kind:'store',status:'active',provider_name:'fileSearchStores/private',metadata:{display_name:'Store'}};
  const document:Row={id:docId,kind:'document',status:'completed',metadata:{store_id:storeId,document_name:'fileSearchStores/private/documents/private-doc',display_name:'Document'}};
  let children:Row[]=[];
  const query={select(){return this;},eq(...args:unknown[]){calls.push(['eq',...args]);return this;},neq(){return this;},order(){return this;},range:async()=>({data:[store]}),limit:async()=>({data:children})};
  const api=serverModuleHarness<typeof Search>('src/lib/ai-api/gemini-file-search.ts',{
    '@/lib/supabase/service':{createServiceClient:()=>({from:()=>query})},'./gateway':{record,AiApiError,authenticateAi:async()=>({project:{id:'project'}})},
    './files':{getOwnedAiResource:async(_c:unknown,auth:{project:{id:string}},id:string,kind:string)=>{calls.push(['owned',auth.project.id,id,kind]);const row=kind==='store'&&id===storeId?store:kind==='document'&&id===docId?document:null;if(!row)throw new AiApiError('resource_not_found',404,'Not owned');return row;}},
    './resources':{createAuthorizedAiResource:async(_c:unknown,request:Request,_a:unknown,kind:string,body:unknown)=>{calls.push(['create',kind,body,request.headers.get('Idempotency-Key')]);return {id:kind==='stores'?storeId:docId};},refreshAiResource:async()=>{calls.push(['refresh']);}},
    './resource-management':{removeAiStoredResource:async(_c:unknown,row:Row,options:unknown)=>{calls.push(['remove',row.id,options]);}},
    './provider-http':{aiProviderRequest:async(_c:unknown,path:string)=>{calls.push(['provider',path]);return {name:'fileSearchStores/private',activeDocumentsCount:'2',mimeType:'text/plain',state:'STATE_ACTIVE',displayName:'Native'};}},
    './http':{readAiJson:(request:Request)=>request.json()},
  },[],{Request});
  const run=(method:string,path:string,body?:unknown)=>api.geminiFileSearchApi(new Request(`https://example/api/v1beta/${path}`,{method,headers:{'Idempotency-Key':'stable'},...(body?{body:JSON.stringify(body)}:{})}),path.split('?')[0].split('/'));
  return {api,calls,store,document,run,setChildren:(rows:Row[])=>{children=rows;}};
}
describe('Native File Search',()=>{
  it('lists only the project and sanitizes provider identifiers from the SDK object',async()=>{
    const f=fixture();const result=await f.run('GET','fileSearchStores');
    expect(result).toMatchObject({fileSearchStores:[{name:`fileSearchStores/${storeId}`} ]});
    expect(f.calls).toContainEqual(['eq','project_id','project']);
    expect(JSON.stringify(result)).not.toContain('private');
    expect(await f.run('GET',`fileSearchStores/${storeId}`)).toMatchObject({name:`fileSearchStores/${storeId}`,activeDocumentsCount:'2'});
  });
  it('imports through the existing metered operation with the caller identity',async()=>{
    const f=fixture();await f.run('POST',`fileSearchStores/${storeId}:importFile`,{fileName:`files/${fileId}`,customMetadata:[{key:'category',stringValue:'sample'}]});
    expect(f.calls).toContainEqual(['create','documents',expect.objectContaining({store:storeId,file:fileId,custom_metadata:[{key:'category',stringValue:'sample'}]}),'stable']);
  });
  it('rejects a document from a different collection before provider calls or removal',async()=>{
    const f=fixture();f.document.metadata={store_id:'other',document_name:'fileSearchStores/other/documents/private'};
    for(const method of ['GET','DELETE'])await expect(f.run(method,`fileSearchStores/${storeId}/documents/${docId}`)).rejects.toThrow('coleção');
    expect(f.calls.some(c=>['provider','remove','refresh'].includes(String(c[0])))).toBe(false);
  });
  it('does not force-delete a nonempty collection by default or bypass the lifecycle guard',async()=>{
    const f=fixture();f.setChildren([f.document]);
    await expect(f.run('DELETE',`fileSearchStores/${storeId}`)).rejects.toThrow('force=true');
    expect(f.calls.some(c=>c[0]==='remove')).toBe(false);
    await f.run('DELETE',`fileSearchStores/${storeId}?force=true`);
    expect(f.calls.at(-1)).toEqual(['remove',storeId,{force:true}]);
    f.setChildren([]);await f.run('DELETE',`fileSearchStores/${storeId}`);
    expect(f.calls.at(-1)).toEqual(['remove',storeId,{force:false}]);
  });
  it('returns local names for document and operation results after refresh',async()=>{
    const f=fixture();
    const document=await f.run('GET',`fileSearchStores/${storeId}/documents/${docId}`);
    expect(document).toMatchObject({name:`fileSearchStores/${storeId}/documents/${docId}`,mimeType:'text/plain'});
    const operation=await f.run('GET',`fileSearchStores/${storeId}/operations/${docId}`);
    expect(operation).toMatchObject({name:`fileSearchStores/${storeId}/operations/${docId}`,done:true,response:{documentName:`fileSearchStores/${storeId}/documents/${docId}`}});
    expect(JSON.stringify([document,operation])).not.toContain('private');
  });
  it('passes explicit document force and refuses invalid options without deleting',async()=>{
    const f=fixture(),path=`fileSearchStores/${storeId}/documents/${docId}`;
    await f.run('DELETE',path);expect(f.calls.at(-1)).toEqual(['remove',docId,{force:false}]);
    await f.run('DELETE',path+'?force=true');expect(f.calls.at(-1)).toEqual(['remove',docId,{force:true}]);
    const before=f.calls.filter(c=>c[0]==='remove').length;
    await expect(f.run('DELETE',path+'?force=yes')).rejects.toThrow('force');
    expect(f.calls.filter(c=>c[0]==='remove')).toHaveLength(before);
    await expect(f.run('GET',`fileSearchStores/${storeId}/documents?pageSize=21`)).rejects.toThrow('Paginação');
  });
  it('validates custom metadata and chunk overlap before indexing',()=>{
    const f=fixture(),base={fileName:`files/${fileId}`};
    for(const customMetadata of [[{key:'k',numericValue:1,stringValue:'ambiguous'}],[{key:'k',stringListValue:{values:[7]}}],[{key:'k',numericValue:NaN}]])expect(()=>f.api.nativeSearchImport({...base,customMetadata})).toThrow();
    expect(()=>f.api.nativeSearchImport({...base,chunkingConfig:{whiteSpaceConfig:{maxTokensPerChunk:100,maxOverlapTokens:100}}})).toThrow('chunks');
    expect(f.api.nativeSearchImport({...base,chunkingConfig:{whiteSpaceConfig:{maxTokensPerChunk:100,maxOverlapTokens:10}}})).toMatchObject({file:fileId});
  });
  it('maps SDK names into ownership-checked references while preserving opaque signatures',()=>{
    const body={cachedContent:`cachedContents/${docId}`,tools:[{fileSearch:{fileSearchStoreNames:[`fileSearchStores/${storeId}`]}}],contents:[{parts:[{thoughtSignature:'opaque'}]}]};
    expect(translateGeminiResources(body)).toMatchObject({cachedContent:`caches/${docId}`,tools:[{fileSearch:{stores:[`stores/${storeId}`]}}],contents:[{parts:[{thoughtSignature:'opaque'}]}]});
  });
});
