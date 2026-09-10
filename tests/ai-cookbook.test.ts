import {describe,it,expect} from 'vitest';
import {aiRecipes,recipeJavascript} from '../src/lib/ai-api/cookbook';
import {parseNativeAiInput} from '../src/lib/ai-api/native-input';
import {parseEmbeddingInput} from '../src/lib/ai-api/embedding-input';
import {aiHttpReferencePages} from '../src/lib/ai-api/api-reference';
import {aiOpenApiSpec} from '../src/lib/ai-api/openapi';
import {aiIntegrationGuides} from '../src/lib/ai-api/integration-guides';
import {runInNewContext} from 'node:vm';
import * as crypto from 'node:crypto';
describe('Executable integration recipes',()=>{
  it('covers each HTTP operation and renders parameter tables from the contract',()=>{
    const operations=Object.values(aiOpenApiSpec.paths).flatMap(p=>Object.keys(p as object).filter(k=>['get','post','patch','delete'].includes(k)));
    expect(aiHttpReferencePages()).toHaveLength(operations.length);
    const page=aiHttpReferencePages().find(p=>p.path==='/interactions'&&p.method==='POST')!;
    expect(JSON.stringify(page)).toContain('generation_config.thinking_level');expect(JSON.stringify(page)).toContain('previous_interaction_id');
  });
  it('runs every Node.js recipe through a mocked HTTP lifecycle without duplicate POSTs',async()=>{
    const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
    for(const recipe of aiRecipes){
      if(recipe.path.includes(':generateContent'))expect(()=>parseNativeAiInput(recipe.body,65536)).not.toThrow();
      if(recipe.path==='/embeddings')for(const input of Array.isArray(recipe.body.input)?recipe.body.input:[recipe.body.input])expect(()=>parseEmbeddingInput({...recipe.body,input})).not.toThrow();
      const calls:Array<{method:string;identity:string;url:string}>=[];
      const execute=new AsyncFunction('process','fetch','console','AbortSignal','setTimeout',recipeJavascript(recipe));
      await execute({env:{CONNECTYHUB_AI_API_KEY:'test',CONNECTYHUB_OPERATION_ID:'persisted-op'}},async(url:string,init:RequestInit)=>{
        calls.push({url,method:String(init.method),identity:new Headers(init.headers).get('Idempotency-Key')!});
        return Response.json({id:'resource',status:recipe.poll&&calls.length===1?'processing':'completed',result:{connectyhub:{credits:2}}});
      },{log:()=>{},error:()=>{}},AbortSignal,(callback:()=>void)=>callback());
      expect(calls.filter(c=>c.method==='POST')).toHaveLength(1);expect(calls.every(c=>c.identity==='persisted-op')).toBe(true);
      if(recipe.poll)expect(calls[1].url).toBe('https://www.connectyhub.com.br/api/v1/ai'+recipe.poll+'resource');
    }
  });
  it('the published receiver verifies the raw body, rejects tampering and expired signatures',()=>{
    const code=aiIntegrationGuides.find(p=>p.id==='ia-webhooks')!.blocks.find(b=>b.kind==='code'&&b.language==='javascript');
    if(code?.kind!=='code')throw new Error('Receiver missing');
    const source=code.code.replace("import { createHmac, timingSafeEqual } from 'node:crypto';",'').replace('export function','function')+'\n; validSignature';
    const validate=runInNewContext(source,{...crypto,Buffer,Date}) as (b:string,h:Headers,s:string,n:number)=>boolean;
    const raw='{"id":"event"}',timestamp='1000';
    const sig=crypto.createHmac('sha256','secret').update('event.'+timestamp+'.'+raw).digest('hex');
    const headers=new Headers({'x-connectyhub-event-id':'event','x-connectyhub-timestamp':timestamp,'x-connectyhub-signature':'v1='+sig});
    expect(validate(raw,headers,'secret',1000000)).toBe(true);expect(validate(raw+' ',headers,'secret',1000000)).toBe(false);expect(validate(raw,headers,'secret',1400000)).toBe(false);
  });
});
