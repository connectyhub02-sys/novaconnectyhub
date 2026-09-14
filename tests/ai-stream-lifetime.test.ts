import {describe,it,expect} from 'vitest';
import {serverModuleHarness} from './helpers/server-module-harness';
import {collectGeminiStream} from '../src/lib/ai-api/provider-stream';
import type * as Streaming from '../src/lib/ai-api/streaming';
import type * as Chat from '../src/lib/ai-api/chat-stream';

const record=(value:unknown)=>value&&typeof value==='object'?value as Record<string,unknown>:{};
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
describe('Incremental stream lifetime and metering',()=>{
  it('preserves frames split inside CRLF and final usage',async()=>{
    const wire='data: {"candidates":[{"content":{"parts":[{"text":"Olá"}]}}]}\r\n\r\ndata: {"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":1}}\r\n\r\n';
    const bytes=new TextEncoder().encode(wire),seen:unknown[]=[];
    const stream=new ReadableStream<Uint8Array>({start(c){for(const byte of bytes)c.enqueue(new Uint8Array([byte]));c.close();}});
    expect(await collectGeminiStream(stream,chunk=>seen.push(chunk))).toMatchObject({usageMetadata:{promptTokenCount:3},candidates:[{content:{parts:[{text:'Olá'}]}}]});
    expect(seen).toHaveLength(2);
  });
  it('continues native accounting after the response reader cancels',async()=>{
    let upstream!:ReadableStreamDefaultController<Uint8Array>,afterWork!:()=>Promise<void>;
    const settlements:unknown[]=[];
    const source=new ReadableStream<Uint8Array>({start(c){upstream=c;}});
    const api=serverModuleHarness<typeof Streaming>('src/lib/ai-api/streaming.ts',{
      'next/server':{after:(callback:()=>Promise<void>)=>{afterWork=callback;}},
      '@/lib/supabase/service':{createServiceClient:()=>({})},
      '@/lib/gemini/credentials':{loadGeminiCredentials:async()=>({apiKey:'fixture'})},
      './gateway':{authenticateAi:async()=>({}),record,rpc:async()=>({})},
      './operation-ledger':{beginAiOperation:async()=>({id:'request',model:{id:'public',providerId:'fixture'},prices:{}}),reserveAiOperation:async()=>{},settleAiOperation:async(_c:unknown,_o:unknown,units:unknown)=>{settlements.push(units);return {connectyhub:{credits:1}};},failAiOperation:async()=>{throw new Error('unexpected failure');}},
      './extended-content':{prepareExtendedContent:async()=>({body:{},units:{}})},
      './provider-http':{aiProviderOrigin:'https://provider.invalid'},
      './content-metering':{measureAiContent:(data:unknown)=>record(data).usageMetadata,publicContentResponse:(data:unknown)=>data},
      './gemini-contract':{isGeminiContract:()=>true,unwrapGeminiResult:(data:unknown)=>data,geminiContractVersion:'fixture'},
    },[],{fetch:async()=>new Response(source),ReadableStream,TextEncoder,TextDecoder});
    const response=await api.streamExtendedContent(new Request('https://app.invalid'),{});
    const reader=response.body!.getReader();
    upstream.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"first"}]}}]}\n\n'));
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('first');
    expect(settlements).toHaveLength(0);
    await reader.cancel();
    upstream.enqueue(new TextEncoder().encode('data: {"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":2}}\n\n'));upstream.close();
    await afterWork();
    expect(settlements).toEqual([{promptTokenCount:4,candidatesTokenCount:2}]);
    expect(response.headers.get('ConnectyHub-API-Version')).toBe('fixture');
  });
  it('keeps the Chat settlement alive after cancellation and rejects pre-stream errors as HTTP errors',async()=>{
    let finish!:(result:unknown)=>void;
    const api=serverModuleHarness<typeof Chat>('src/lib/ai-api/chat-stream.ts',{
      './gateway':{record,completeAi:async(_req:unknown,_body:unknown,_client:unknown,_kind:unknown,hooks:{ready:(v:unknown)=>void;chunk:(v:unknown)=>void})=>{
        hooks.ready({requestId:'r',replayed:false});hooks.chunk({choices:[{delta:{content:'first'}}]});
        return new Promise(resolve=>{finish=resolve;});
      }},
    },[],{ReadableStream,TextEncoder});
    const result=await api.streamChatAi(new Request('https://app.invalid'),{stream:true});
    const reader=result.response.body!.getReader();await reader.read();await reader.cancel();
    finish({organizationId:'org',response:{choices:[{finish_reason:'stop'}]}});
    expect(await result.completion).toBe('org');
    await flush();
    const bad=serverModuleHarness<typeof Chat>('src/lib/ai-api/chat-stream.ts',{'./gateway':{record,completeAi:async()=>{throw new Error('denied');}}},[],{ReadableStream,TextEncoder});
    await expect(bad.streamChatAi(new Request('https://app.invalid'),{})).rejects.toThrow('denied');
  });
});
