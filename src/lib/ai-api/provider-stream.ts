type Json=Record<string,unknown>;
const rec=(v:unknown):Json=>v&&typeof v==='object'&&!Array.isArray(v)?v as Json:{};
/** Consume upstream once, retaining the final usage even after the caller detaches. */
export async function collectGeminiStream(body:ReadableStream<Uint8Array>,onChunk:(chunk:Json)=>void):Promise<Json> {
  const reader=body.getReader(),decoder=new TextDecoder(),aggregate:Json={};
  const candidates=new Map<number,Json>();let buffer='',bytes=0;
  const consume=(frame:string)=>{
    const payload=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');
    if(!payload||payload==='[DONE]')return;
    const chunk=rec(JSON.parse(payload));if(chunk.error)throw new Error('Provider stream failed');
    for(const key of ['usageMetadata','promptFeedback','modelVersion','responseId'])if(chunk[key]!==undefined)aggregate[key]=chunk[key];
    for(const value of Array.isArray(chunk.candidates)?chunk.candidates:[]) {
      const item=rec(value),index=Number(item.index??0),prior=candidates.get(index),content=rec(item.content);
      candidates.set(index,{...prior,...item,content:{role:'model',parts:[...(rec(prior?.content).parts as unknown[]??[]),...(content.parts as unknown[]??[])]}});
    }
    onChunk(chunk);
  };
  try {
    while(true) {
      const part=await reader.read();if(part.done)break;
      bytes+=part.value.byteLength;if(bytes>64_000_000)throw new Error('Provider stream too large');
      buffer+=decoder.decode(part.value,{stream:true});
      let match;while((match=/\r?\n\r?\n/.exec(buffer))) {consume(buffer.slice(0,match.index).replace(/\r\n/g,'\n'));buffer=buffer.slice(match.index+match[0].length);}
    }
    buffer+=decoder.decode();if(buffer.trim())consume(buffer.replace(/\r\n/g,'\n'));
    return {...aggregate,candidates:[...candidates.values()]};
  } finally {reader.releaseLock();}
}

export function chatStreamDeltas(requestId:string,model:string,created:number) {
  let toolIndex=0,started=false;
  const base={id:`chatcmpl-${requestId}`,object:'chat.completion.chunk',created,model};
  return (chunk:Json)=>{
    const candidate=rec((chunk.candidates as unknown[]|undefined)?.[0]),parts=rec(candidate.content).parts;
    const frames:Json[]=[];
    if(!started){started=true;frames.push({...base,choices:[{index:0,delta:{role:'assistant',content:''},finish_reason:null}]});}
    for(const value of Array.isArray(parts)?parts:[]) {
      const part=rec(value);if(part.thought===true)continue;
      if(typeof part.text==='string')frames.push({...base,choices:[{index:0,delta:{content:part.text},finish_reason:null}]});
      if(part.functionCall) {
        const call=rec(part.functionCall),index=toolIndex++;
        frames.push({...base,choices:[{index:0,delta:{tool_calls:[{index,id:typeof call.id==='string'?call.id:`call_${requestId}_${index}`,type:'function',function:{name:call.name,arguments:JSON.stringify(call.args??{})},...(typeof part.thoughtSignature==='string'?{context:part.thoughtSignature}:{})}]},finish_reason:null}]});
      }
    }
    return frames;
  };
}
