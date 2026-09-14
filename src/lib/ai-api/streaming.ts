import 'server-only';
import {after} from 'next/server';
import {createServiceClient} from '@/lib/supabase/service';
import {loadGeminiCredentials} from '@/lib/gemini/credentials';
import {authenticateAi,record,rpc} from './gateway';
import {beginAiOperation,reserveAiOperation,settleAiOperation,failAiOperation} from './operation-ledger';
import {prepareExtendedContent} from './extended-content';
import {AiProviderFailure,aiProviderOrigin} from './provider-http';
import {measureAiContent,publicContentResponse} from './content-metering';
import {isGeminiContract,unwrapGeminiResult,geminiContractVersion} from './gemini-contract';

export async function streamExtendedContent(request:Request,raw:unknown) {
  const client=createServiceClient(),auth=await authenticateAi(request,client);
  const nativeContract=isGeminiContract(request);
  const operation=await beginAiOperation(client,request,auth,'generation',record(raw));
  const headers={'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Request-Id':operation.id,...(nativeContract?{'ConnectyHub-API-Version':geminiContractVersion}: {})};
  if(operation.replay)return new Response(`data: ${JSON.stringify(nativeContract?unwrapGeminiResult(operation.replay):operation.replay)}\n\n${nativeContract?'':'data: [DONE]\n\n'}`,{headers});
  let dispatched=false;
  try {
    const {body,units}=await prepareExtendedContent(client,auth,operation,raw);
    await reserveAiOperation(client,operation,units);
    const {apiKey}=await loadGeminiCredentials(client);
    await rpc(client,'start_ai_request',{p_request:operation.id});dispatched=true;
    const response=await fetch(`${aiProviderOrigin}/v1beta/models/${operation.model.providerId}:streamGenerateContent?alt=sse`,{method:'POST',redirect:'error',
      headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(110000)});
    if(!response.ok||!response.body)throw new AiProviderFailure(response.status,![400,401,403,404,413,422,429].includes(response.status));
    const reader=response.body.getReader(),encoder=new TextEncoder(),decoder=new TextDecoder();let detached=false;
    let completion!:Promise<void>;
    const stream=new ReadableStream<Uint8Array>({
      start(controller) {
        completion=(async()=>{
        const send=(value:unknown)=>{if(!detached)try{controller.enqueue(encoder.encode(`data: ${typeof value==='string'?value:JSON.stringify(value)}\n\n`));}catch{detached=true;}};
        let buffer='',bytes=0;const aggregate:Record<string,unknown>={candidates:[]};
        const candidates=new Map<number,Record<string,unknown>>();
        const consume=(frame:string)=>{
          const payload=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');
          if(!payload||payload==='[DONE]')return;
          const chunk=record(JSON.parse(payload));if(chunk.error)throw new Error('Geração interrompida.');
          for(const field of ['usageMetadata','promptFeedback','modelVersion','responseId','serviceTier','modelStatus'])if(chunk[field]!==undefined)aggregate[field]=chunk[field];
          for(const value of Array.isArray(chunk.candidates)?chunk.candidates:[]) {
            const item=record(value),index=Number(item.index??0),prior=candidates.get(index);
            const parts=[...(Array.isArray(record(prior?.content).parts)?record(prior?.content).parts as unknown[]:[]),...(Array.isArray(record(item.content).parts)?record(item.content).parts as unknown[]:[])];
            candidates.set(index,{...prior,...item,content:{role:'model',parts}});
          }
          const outward=publicContentResponse(chunk,operation.id,operation.model.id,nativeContract);
          send(nativeContract?unwrapGeminiResult(outward):outward);
        };
        try {
          while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>64_000_000)throw new Error('Resposta excede a capacidade de entrega.');
            buffer=(buffer+decoder.decode(next.value,{stream:true})).replace(/\r\n/g,'\n');let boundary;
            while((boundary=buffer.indexOf('\n\n'))!==-1){consume(buffer.slice(0,boundary));buffer=buffer.slice(boundary+2);}
          }
          buffer+=decoder.decode();if(buffer.trim())consume(buffer);
          aggregate.candidates=[...candidates.values()];
          const settled=await settleAiOperation(client,operation,measureAiContent(aggregate,operation.prices),publicContentResponse(aggregate,operation.id,operation.model.id,nativeContract));
          send(nativeContract?{candidates:[],connectyhub:settled.connectyhub}:{object:'content.completed',connectyhub:settled.connectyhub});
          if(!nativeContract)send('[DONE]');
        }catch(error){await failAiOperation(client,operation,error,true);send({error:{code:'result_pending',request_id:operation.id,message:'Consulte o histórico para acompanhar esta solicitação.'}});}
        finally{reader.releaseLock();if(!detached)try{controller.close();}catch{/* Client already disconnected. */}}
        })();
      },cancel(){detached=true;},
    });
    after(async()=>{await completion;});
    return new Response(stream,{headers});
  }catch(error){await failAiOperation(client,operation,error,dispatched);throw error;}
}
