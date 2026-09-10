import { measureAiContent } from './content-metering';
import type { AiPriceCard, AiUnits } from './operation-pricing';
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const list=(v:unknown):Record<string,unknown>[]=>Array.isArray(v)?v.map(obj):[];

export function measureAiInteraction(raw:Record<string,unknown>, prices:AiPriceCard):AiUnits {
  const steps=list(raw.steps), usage=obj(raw.usage);
  if(prices.song) {
    const songs=steps.filter(s=>s.type==='model_output').flatMap(s=>list(s.content)).filter(c=>c.type==='audio'&&(c.data||c.uri));
    if(!songs.length && raw.status==='completed')throw new Error('Medição de música ausente.');
    return {song:songs.length};
  }
  if(!Object.keys(usage).length)throw new Error('Consumo da interação ainda indisponível.');
  const units=measureAiContent({usageMetadata:{
    promptTokenCount:usage.total_input_tokens,cachedContentTokenCount:usage.total_cached_tokens,
    toolUsePromptTokenCount:usage.total_tool_use_tokens,candidatesTokenCount:usage.total_output_tokens,
    thoughtsTokenCount:usage.total_thought_tokens,
    promptTokensDetails:list(usage.input_tokens_by_modality).map(d=>({modality:d.modality,tokenCount:d.tokens})),
    candidatesTokensDetails:list(usage.output_tokens_by_modality).map(d=>({modality:d.modality,tokenCount:d.tokens})),
  },candidates:[]},prices);
  if(prices.long_input&&Number(usage.total_input_tokens)>200000) {
    for(const meter of ['input','output','cached_input'])if(units[meter]){units['long_'+meter]=units[meter];delete units[meter];}
  }
  const calls=new Map(steps.filter(s=>typeof s.id==='string').map(s=>[s.id,s]));
  for(const step of calls.values()) {
    if(step.type==='google_search_call')units.search=(units.search??0)+1;
    if(step.type==='google_maps_call')units.maps=(units.maps??0)+1;
  }
  // Modalities must be reported when the result contains paid generated media.
  for(const part of steps.filter(s=>s.type==='model_output').flatMap(s=>list(s.content))) {
    if(['image','audio','video'].includes(String(part.type)) && !units[String(part.type)+'_output'])
      throw new Error('Medição de mídia ausente.');
  }
  return units;
}

export function publicInteraction(raw:Record<string,unknown>,id:string,model:string,media:Record<string,unknown>[] = []) {
  const aliases:Record<string,string>={google_search_call:'web_search_call',google_search_result:'web_search_result',google_maps_call:'maps_call',google_maps_result:'maps_result'};
  const cleanContent=(value:unknown):unknown=>{
    if(Array.isArray(value))return value.map(cleanContent);
    if(!value||typeof value!=='object')return value;
    const item={...obj(value)};
    if(['audio','image','video','document'].includes(String(item.type))&&typeof item.uri==='string') {
      const index=media.length;media.push({uri:item.uri,mime_type:item.mime_type});
      item.uri=`/api/v1/ai/interactions/${id}/content?index=${index}`;
    }
    return Object.fromEntries(Object.entries(item).map(([key,child])=>[key,cleanContent(child)]));
  };
  return {id,object:'interaction',model,status:raw.status,steps:list(raw.steps).filter(s=>!['thought','user_input'].includes(String(s.type))).map(s=>{
    const clean=Object.fromEntries(['type','id','call_id','name','arguments','result','content','is_error','signature'].filter(k=>s[k]!==undefined).map(k=>[k,cleanContent(s[k])]));
    clean.type=aliases[String(s.type)]??s.type;return clean;
  })};
}
