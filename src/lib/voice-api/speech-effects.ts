import 'server-only';
import {loadElevenLabsCredentials} from '@/lib/elevenlabs/credentials';
import type {VoiceAuth} from './auth';
import {VoiceError,voiceBody} from './contract';
import type {EffectsCatalog,SpeechEffects} from './speech-options';
let cached:{expires:number;value:EffectsCatalog}|undefined;
export async function speechEffectsCatalog(auth:Pick<VoiceAuth,'client'>):Promise<EffectsCatalog>{
  if(process.env.VOICE_EFFECTS_ENABLED==='false')throw new VoiceError('effects_unavailable',503,'Efeitos temporariamente indisponíveis. Você pode gerar sem efeitos.');
  if(cached&&cached.expires>Date.now())return cached.value;
  const {apiKey}=await loadElevenLabsCredentials(auth.client);
  const response=await fetch('https://api.elevenlabs.io/v1/audio-effects/catalog',{headers:{'xi-api-key':apiKey},signal:AbortSignal.timeout(15000),redirect:'error',cache:'no-store'});
  if(!response.ok){await response.body?.cancel();throw new VoiceError('effects_unavailable',503,'Não foi possível carregar os efeitos. Tente novamente ou gere sem efeitos.');}
  const data=JSON.parse(new TextDecoder().decode(await voiceBody(response,200000)));
  for(const [group,id] of [['filter_presets','filter_preset_id'],['environments','environment_id'],['background_noises','background_noise_id']]){
    if(!Array.isArray(data[group])||data[group].some((v:Record<string,unknown>)=>!v||typeof v[id]!=='string'||! /^[\w-]{1,100}$/.test(v[id] as string)||typeof v.name!=='string'))throw new VoiceError('effects_unavailable',503,'Catálogo de efeitos indisponível.');
  }
  cached={expires:Date.now()+300000,value:data};return data;
}
export async function validateSpeechEffects(auth:VoiceAuth,effects?:SpeechEffects){
  if(!effects)return;
  const catalog=await speechEffectsCatalog(auth);
  for(const [id,group] of [['filter_preset_id','filter_presets'],['environment_id','environments'],['background_noise_id','background_noises']] as const){
    const value=effects[id];
    if(value&&!(catalog[group] as unknown as Record<string,string>[]).some(item=>item[id]===value))throw new VoiceError('invalid_effect',422,'Um efeito não está mais disponível. Escolha novamente no catálogo.');
  }
}
