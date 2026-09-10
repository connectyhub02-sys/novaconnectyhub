import { publicAiModelDefinitions } from "./public-models";
type Json = Record<string, unknown>;
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
export const publicAiModel = "connectyhub-auto";

// Whitelist public fields, including when replaying historical provider-shaped snapshots.
export function publicAiCompletion(value: unknown) {
  const raw = object(value), credits = object(raw.connectyhub);
  return {
    id: raw.id, object: raw.object, created: raw.created, model: publicAiModelDefinitions.some(model => model.id === raw.model) ? raw.model : publicAiModel,
    choices: (Array.isArray(raw.choices) ? raw.choices : []).map(value => {
      const choice = object(value), message = object(choice.message);
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls.map(item => {
        const call=object(item),fn=object(call.function);
        return {id:call.id,type:"function",function:{name:fn.name,arguments:fn.arguments},...(typeof call.context==="string"?{context:call.context}:{})};
      }) : [];
      return { index: choice.index, message: { role: "assistant", content: message.content, ...(toolCalls.length?{tool_calls:toolCalls}:{}) }, finish_reason: choice.finish_reason };
    }),
    connectyhub: { request_id: credits.request_id, project_id: credits.project_id, credits: Number(credits.credits ?? 0) },
  };
}

export function publicAiErrorCode(code: string | null) {
  if (!code) return null;
  return /provider|token|pricing|usage_unavailable/.test(code) ? "service_unavailable" : code;
}

export function publicAiRequest(value: unknown) {
  const raw = object(value);
  return { id: raw.id, status: raw.status, charged_credits: Number(raw.charged_credits ?? 0), reserved_credits: Number(raw.reserved_credits ?? 0), response: raw.response ? publicAiResult(raw.response) : null, error_code: publicAiErrorCode(typeof raw.error_code === "string" ? raw.error_code : null), created_at: raw.created_at };
}

export function publicAiResult(value: unknown) {
  const raw=object(value);
  if(['interaction','video','batch','document','cache','live.session'].includes(String(raw.object))) {
    const safe:Json={};for(const key of ['id','object','model','status','steps','videos','results','store'])if(raw[key]!==undefined)safe[key]=raw[key];
    const credits=object(raw.connectyhub);return {...safe,connectyhub:{request_id:credits.request_id,project_id:credits.project_id,credits:Number(credits.credits??0)}};
  }
  if(raw.object==="embedding.list") {
    const credits=object(raw.connectyhub);
    return {id:raw.id,object:"embedding.list",model:publicAiModelDefinitions.some(model=>model.id===raw.model)?raw.model:publicAiModel,
      data:(Array.isArray(raw.data)?raw.data:[]).map(item=>{const entry=object(item);return {object:"embedding",index:entry.index,embedding:entry.embedding};}),
      connectyhub:{request_id:credits.request_id,project_id:credits.project_id,credits:Number(credits.credits??0)}};
  }
  if(raw.object!=="content.response") return publicAiCompletion(value);
  const credits=object(raw.connectyhub);
  return {id:raw.id,object:"content.response",created:raw.created,
    model:publicAiModelDefinitions.some(model=>model.id===raw.model)?raw.model:publicAiModel,
    candidates:(Array.isArray(raw.candidates)?raw.candidates:[]).map(item=>{
      const candidate=object(item),content=object(candidate.content);
      return {index:candidate.index??0,finishReason:candidate.finishReason,...(candidate.grounding?{grounding:candidate.grounding}:{}),
        content:{role:"model",parts:(Array.isArray(content.parts)?content.parts:[]).map(object).filter(part=>part.thought!==true).map(part=>{
          const safe:Json={};
          for(const field of ["text","inlineData","functionCall","functionResponse","executableCode","codeExecutionResult","thoughtSignature"]) if(part[field]!==undefined)safe[field]=part[field];
          return safe;
        })},
        ...(candidate.groundingMetadata?{sources:(Array.isArray(object(candidate.groundingMetadata).groundingChunks)?object(candidate.groundingMetadata).groundingChunks as unknown[]:[]).map(chunk=>{const web=object(object(chunk).web);return {url:web.uri,title:web.title};}).filter(source=>typeof source.url==="string"&&/^https?:\/\//.test(source.url))}:{}),
      };
    }),connectyhub:{request_id:credits.request_id,project_id:credits.project_id,credits:Number(credits.credits??0)},
  };
}
