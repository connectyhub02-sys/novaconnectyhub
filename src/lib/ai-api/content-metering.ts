import type { AiUnits, AiPriceCard } from "./operation-pricing";
const obj = (v: unknown): Record<string,unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string,unknown> : {};
const list = (v: unknown) => Array.isArray(v) ? v : [];
function count(v: unknown) { const n=Number(v??0); if(!Number.isFinite(n)||n<0)throw new Error("Medição inválida.");return n; }

export function measureAiContent(data: unknown, prices: AiPriceCard): AiUnits {
  const raw=obj(data), usage=obj(raw.usageMetadata);
  if (!Object.keys(usage).length) throw new Error("Medição de geração ausente.");
  if(usage.promptTokenCount===undefined)throw new Error('Medição de entrada ausente.');
  const units:AiUnits={};
  const prompt=count(usage.promptTokenCount), cached=count(usage.cachedContentTokenCount), tools=count(usage.toolUsePromptTokenCount);
  const details=list(usage.promptTokensDetails).map(obj);
  let special=0;
  if(cached && details.some(d=>prices[String(d.modality).toLowerCase()+"_input"]))throw new Error("Medição de cache por modalidade ainda indisponível.");
  for(const detail of details) {
    const meter=String(detail.modality).toLowerCase()+"_input";
    if(prices[meter]) { const n=count(detail.tokenCount);units[meter]=(units[meter]??0)+n;special+=n; }
  }
  if(cached>prompt||special>prompt)throw new Error("Medição de entrada inconsistente.");
  units.input=Math.max(0,prompt-special-(prices.cached_input?cached:0))+tools;
  if(prices.cached_input)units.cached_input=cached;
  const candidates=count(usage.candidatesTokenCount), thinking=count(usage.thoughtsTokenCount);
  const outputDetails=list(usage.candidatesTokensDetails).map(obj);
  let media=0;
  for(const detail of outputDetails) {
    const meter=String(detail.modality).toLowerCase()+"_output";
    if(meter!=="text_output") {const n=count(detail.tokenCount);units[meter]=(units[meter]??0)+n;media+=n;}
  }
  const parts=list(raw.candidates).flatMap(c=>list(obj(obj(c).content).parts)).map(obj);
  if(!outputDetails.length) {
    const modalities=new Set(parts.filter(p=>p.inlineData).map(p=>String(obj(p.inlineData).mimeType).split('/')[0]));
    if(modalities.size>1 || (modalities.size && parts.some(p=>typeof p.text==='string'&&p.text&&p.thought!==true)))
      throw new Error("Medição por modalidade ausente para saída mista.");
    if(modalities.size===1) { const meter=[...modalities][0]+"_output";units[meter]=candidates;media=candidates; }
  }
  if(media>candidates)throw new Error("Medição de saída inconsistente.");
  units.output=candidates-media+thinking;
  const grounding=list(raw.candidates).map(c=>obj(obj(c).groundingMetadata));
  const searches=grounding.flatMap(g=>[...list(g.webSearchQueries),...list(g.imageSearchQueries)]);
  if(searches.length)units.search=searches.length;
  // Never infer tool invocations from citation count: several places can come from one query.
  if(grounding.some(g=>list(g.groundingChunks).some(c=>obj(c).maps)))
    throw new Error("Quantidade de consultas de mapas ausente.");
  if(!searches.length&&grounding.some(g=>list(g.groundingChunks).some(c=>obj(c).web)))throw new Error('Quantidade de consultas de pesquisa ausente.');
  return units;
}

export function publicGrounding(value: unknown) {
  const g=obj(value);
  return {
    sources:list(g.groundingChunks).map(c=>{
      const chunk=obj(c), source=obj(chunk.web??chunk.maps??chunk.retrievedContext);
      return {url:source.uri,title:source.title,text:source.text,place_id:source.placeId};
    }),
    supports:list(g.groundingSupports),
    // Required attribution is returned intact; integrators must render it safely.
    attribution:typeof obj(g.searchEntryPoint).renderedContent==='string'?obj(g.searchEntryPoint).renderedContent:undefined,
    maps_attribution:g.googleMapsWidgetContextToken,
  };
}

export function publicContentResponse(data: unknown, id: string, model: string) {
  const raw=obj(data);
  return { id,object:"content.response",model,created:Math.floor(Date.now()/1000),
    candidates:list(raw.candidates).map(c=>{const candidate=obj(c);return {index:candidate.index??0,finishReason:candidate.finishReason,
      content:{role:"model",parts:list(obj(candidate.content).parts).map(obj).filter(p=>p.thought!==true).map(p=>Object.fromEntries(
        ["text","inlineData","functionCall","functionResponse","executableCode","codeExecutionResult","thoughtSignature"].filter(k=>p[k]!==undefined).map(k=>[k,p[k]])))},
      ...(candidate.groundingMetadata?{grounding:publicGrounding(candidate.groundingMetadata)}:{}),
    };}),
  };
}
