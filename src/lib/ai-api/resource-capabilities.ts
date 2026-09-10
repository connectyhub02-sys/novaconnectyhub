import type {AiPriceCard} from './operation-pricing';
export function requiredAiMeters(model:{id:string;family:string}) {
  if(model.family==='music')return ['song'];
  if(model.family==='voice')return ['input','audio_output'];
  if(model.family==='image')return ['input','output','image_output'];
  if(model.family==='video')return model.id.startsWith('video-')?['video_720p']:['input','output','video_output'];
  if(model.family==='transcription')return ['audio_input','output'];
  if(model.family==='live')return model.id==='music-realtime-exp'?['audio_second']:model.id==='3.5-transcribe-live'?['audio_input','output']:model.id==='3.5-live-translate-preview'?['audio_input','audio_output']:['input','output','audio_input','audio_output'];
  return model.family==='embeddings'?['input']:['input','output'];
}
export function positiveAiMeters(prices:AiPriceCard,meters:string[]){return meters.every(m=>prices[m]&&Number.isFinite(prices[m].credits)&&prices[m].credits>0);}
export function operationalAiCapabilities(capabilities:string[],prices:AiPriceCard) {
  return capabilities.filter(c=>{
    if(c==='video_output')return positiveAiMeters(prices,['video_output'])||positiveAiMeters(prices,['video_720p']);
    const requirements:Record<string,string[]>={web_search:['search'],maps:['maps'],cache:['cache_hour','cached_input'],batch:['batch_input'],file_search:['indexing_input'],image_output:['image_output'],audio_output:['audio_output'],video_output:['video_output'],music:['song']};
    return !requirements[c]||positiveAiMeters(prices,requirements[c]);
  });
}
