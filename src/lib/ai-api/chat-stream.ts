import 'server-only';
import {completeAi,AiApiError,record} from './gateway';
import {publicAiErrorCode} from './public-response';

/** ready resolves only after authorization/reservation and upstream HTTP success. */
export async function streamChatAi(request:Request,body:unknown) {
  let controller:ReadableStreamDefaultController<Uint8Array>,detached=false;
  const encoder=new TextEncoder();
  const stream=new ReadableStream<Uint8Array>({start(value){controller=value;},cancel(){detached=true;}});
  const send=(value:unknown)=>{if(!detached)try{controller.enqueue(encoder.encode(`data: ${typeof value==='string'?value:JSON.stringify(value)}\n\n`));}catch{detached=true;}};
  let ready!:(value:{requestId:string;replayed:boolean})=>void,reject!:(error:unknown)=>void,opened=false;
  const gate=new Promise<{requestId:string;replayed:boolean}>((resolve,fail)=>{ready=v=>{opened=true;resolve(v);};reject=fail;});
  const completion=completeAi(request,body,undefined,'chat',{ready,chunk:send}).then(result=>{
    const response=record(result.response),choice=record((response.choices as unknown[])?.[0]);
    const base={id:response.id,object:'chat.completion.chunk',created:response.created,model:response.model};
    if(result.replayed) {
      ready({requestId:result.requestId,replayed:true});
      const message=record(choice.message),tools=message.tool_calls;
      send({...base,choices:[{index:0,delta:{role:'assistant',content:message.content,...(Array.isArray(tools)?{tool_calls:tools.map((tool,index)=>({...record(tool),index}))}:{})},finish_reason:null}]});
    }
    send({...base,choices:[{index:0,delta:{},finish_reason:choice.finish_reason}],connectyhub:response.connectyhub});
    if(record(record(body).stream_options).include_usage===true)send({...base,choices:[],usage:result.usage});
    send('[DONE]');return result.organizationId;
  }).catch(error=>{
    if(!opened)reject(error);
    else send({error:{code:error instanceof AiApiError?publicAiErrorCode(error.code):'result_pending',request_id:error instanceof AiApiError?error.requestId:undefined,message:'Consulte o estado desta solicitação antes de repetir.'}});
    return undefined;
  }).finally(()=>{if(!detached)try{controller.close();}catch{/* Already detached. */}});
  const info=await gate;
  return {response:new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Request-Id':info.requestId,'Idempotency-Replayed':String(info.replayed)}}),completion};
}
