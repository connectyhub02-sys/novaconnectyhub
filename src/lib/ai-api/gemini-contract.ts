type Json = Record<string, unknown>;
const object = (value:unknown):Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
export const geminiContractVersion = 'gemini-v1beta-2026-09-14';
export const isGeminiContract = (request:Request) => request.headers.get('x-connectyhub-contract') === geminiContractVersion;
const pick = (raw:Json, fields:string[]) => Object.fromEntries(fields.filter(k=>raw[k]!==undefined).map(k=>[k,raw[k]]));

/** Preserve documented inference metadata, not arbitrary transport/configuration
 * fields. Thought summaries/signatures are model output, not hidden prompts. */
export function geminiResponse(value:unknown) {
  const raw=object(value);
  return {
    ...pick(raw,['usageMetadata','promptFeedback','modelVersion','responseId','serviceTier','modelStatus']),
    ...(Array.isArray(raw.candidates)?{candidates:raw.candidates.map(value=>{
      const candidate=object(value),content=object(candidate.content);
      return {...pick(candidate,['index','finishReason','finishMessage','safetyRatings','citationMetadata','groundingMetadata','avgLogprobs','logprobsResult','tokenCount','urlContextMetadata']),
        ...(candidate.content?{content:{role:content.role??'model',parts:(Array.isArray(content.parts)?content.parts:[]).map(part=>pick(object(part),['text','inlineData','fileData','functionCall','functionResponse','executableCode','codeExecutionResult','thought','thoughtSignature','videoMetadata']))}}:{})};
    })}:{}),
  };
}

export function unwrapGeminiResult(value:unknown) {
  const raw=object(value);
  // Additional vendor-neutral accounting extension is ignored by SDKs but useful
  // to an integrator. The provider metadata remains available for token reporting.
  return {...geminiResponse(raw),...(raw.connectyhub?{connectyhub:raw.connectyhub}:{})};
}
