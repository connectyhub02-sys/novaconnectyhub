import type {SpeechSettings} from './performance';

// Studio controls checked against /v1/models and the TTS guide on 2026-10-22.
// This presentation/request filter does not change legacy API receipt fingerprints.
export const speechControls = {
  eleven_multilingual_v2: {speed:true,similarity:true,style:true,speakerBoost:true},
  eleven_flash_v2_5: {speed:true,similarity:true,style:false,speakerBoost:false},
  eleven_turbo_v2_5: {speed:true,similarity:true,style:false,speakerBoost:false},
  eleven_v3: {speed:false,similarity:false,style:false,speakerBoost:false},
} as const;

export function studioVoiceSettings(model:string,settings:SpeechSettings):SpeechSettings {
  const controls=speechControls[model as keyof typeof speechControls];
  const result={...settings};
  if(!controls?.speed)delete result.speed;
  if(!controls?.similarity)delete result.similarity_boost;
  if(!controls?.style)delete result.style;
  if(!controls?.speakerBoost)delete result.use_speaker_boost;
  if(model==='eleven_v3'&&result.stability!==undefined){
    const stability=result.stability;
    result.stability=[0,0.5,1].reduce((best,value)=>Math.abs(value-stability)<Math.abs(best-stability)?value:best,0.5);
  }
  return result;
}
