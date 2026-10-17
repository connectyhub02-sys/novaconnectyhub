/** Shared options; catalog IDs are additionally checked by the server. */
export type SpeechEffects = {filter_preset_id?:string; environment_id?:string; background_noise_id?:string; distance?:number; send_level?:number; pan?:number};
export type EffectsCatalog = {filter_presets:{filter_preset_id:string;name:string;description:string}[];environments:{environment_id:string;name:string;description:string}[];background_noises:{background_noise_id:string;name:string;description:string}[]};
export const studioFormats = [
  {id:'mp3_44100_128',label:'MP3 · alta qualidade (128 kbps)'},
  {id:'mp3_44100_64',label:'MP3 · arquivo menor (64 kbps)'},
  {id:'mp3_22050_32',label:'MP3 · compacto (32 kbps)'},
] as const;
export function parseSpeechEffects(raw:unknown):SpeechEffects|undefined {
  if(raw===undefined)return undefined;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Efeitos de áudio inválidos.');
  const result:SpeechEffects={};
  for(const [key,value] of Object.entries(raw)){
    if(['filter_preset_id','environment_id','background_noise_id'].includes(key)){
      if(typeof value!=='string'||! /^[a-zA-Z0-9_-]{1,100}$/.test(value))throw new Error('Escolha um efeito do catálogo.');
      result[key as 'filter_preset_id']=value;
    }else if(['distance','send_level','pan'].includes(key)){
      if(typeof value!=='number'||!Number.isFinite(value)||value<(key==='pan'?-1:0)||value>1)throw new Error('Intensidade de efeito fora dos limites.');
      result[key as 'distance']=value;
    }else throw new Error('Efeito de áudio não suportado.');
  }
  return Object.keys(result).length?result:undefined;
}
export function validateEffectsFormat(effects:SpeechEffects|undefined,format:string){
  if(effects&&((effects.environment_id&&(effects.send_level??1)>0)||(effects.pan??0)!==0)&&/^(pcm|ulaw|alaw)_/.test(format))throw new Error('Reverberação e posição estéreo precisam de MP3 ou Opus.');
}
export function validateLongFormat(format:string|undefined,characters:number){
  if(format&&!studioFormats.some(f=>f.id===format))throw new Error('Áudios longos aceitam MP3 de 32, 64 ou 128 kbps.');
  if(format==='mp3_44100_128'&&characters>120000)throw new Error('Em 128 kbps, use até 120.000 caracteres por volume ou selecione 64 kbps.');
}
