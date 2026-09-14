import 'server-only';
import {voiceLimits,VoiceError,type VoiceInput} from './contract';
export async function boundedVoiceAudio(response:Response) {
  if(!response.body || !response.headers.get('content-type')?.toLowerCase().startsWith('audio/')) throw new VoiceError('provider_audio_invalid',502,'O provedor não devolveu um áudio válido.');
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>voiceLimits.audioBytes)throw new VoiceError('audio_limit',502,'Áudio acima do limite de armazenamento.');chunks.push(value);}}
  catch(e){await reader.cancel().catch(()=>{});throw e;}
  if(!size)throw new VoiceError('provider_audio_empty',502,'O provedor retornou áudio vazio.');
  return Buffer.concat(chunks,size);
}
export function requestVoiceAudio(apiKey:string,input:VoiceInput) {
  // No SDK retry: a network timeout can happen after the provider charges.
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voice_id)}?output_format=${input.output_format}`,{
    method:'POST',headers:{'xi-api-key':apiKey,'Content-Type':'application/json',Accept:'audio/mpeg'},
    body:JSON.stringify({text:input.text,model_id:input.model_id,voice_settings:input.voice_settings}),
    signal:AbortSignal.timeout(90000),redirect:'error',cache:'no-store',
  });
}
export function retrieveVoiceAudio(apiKey:string,historyId:string) {
  return fetch(`https://api.elevenlabs.io/v1/history/${encodeURIComponent(historyId)}/audio`,{headers:{'xi-api-key':apiKey},signal:AbortSignal.timeout(30000),redirect:'error',cache:'no-store'});
}
