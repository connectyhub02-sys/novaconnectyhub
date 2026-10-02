import type {DictionaryLocator} from './studio-dictionaries';
import 'server-only';
import {voiceLimits,VoiceError,type VoiceInput} from './contract';

// Raw PCM and μ-law may come without an audio/* type; JSON is the timestamps endpoint.
const audioType=(type:string)=>type.startsWith('audio/')||type.startsWith('application/octet-stream');

export async function boundedVoiceAudio(response:Response) {
  if(!response.body || !audioType(response.headers.get('content-type')?.toLowerCase()??'')) throw new VoiceError('provider_audio_invalid',502,'O provedor não devolveu um áudio válido.');
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>voiceLimits.audioBytes)throw new VoiceError('audio_limit',502,'Áudio acima do limite de armazenamento.');chunks.push(value);}}
  catch(e){await reader.cancel().catch(()=>{});throw e;}
  if(!size)throw new VoiceError('provider_audio_empty',502,'O provedor retornou áudio vazio.');
  return Buffer.concat(chunks,size);
}

/** Timestamps endpoint: base64 audio plus character alignment. */
export async function timestampedVoiceAudio(response:Response) {
  if(!response.headers.get('content-type')?.toLowerCase().includes('json'))throw new VoiceError('provider_audio_invalid',502,'O provedor não devolveu áudio com marcação de tempo.');
  const text=await response.text();
  if(text.length>voiceLimits.audioBytes*1.4)throw new VoiceError('audio_limit',502,'Áudio acima do limite de armazenamento.');
  const data=JSON.parse(text) as {audio_base64?:string;alignment?:unknown;normalized_alignment?:unknown};
  const bytes=Buffer.from(data.audio_base64??'','base64');
  if(!bytes.length)throw new VoiceError('provider_audio_empty',502,'O provedor retornou áudio vazio.');
  return {bytes,alignment:{alignment:data.alignment??null,normalized_alignment:data.normalized_alignment??null}};
}

function body(input:VoiceInput,dictionaries:DictionaryLocator[]) {
  return JSON.stringify({text:input.text,model_id:input.model_id,voice_settings:input.voice_settings,
    ...(input.language_code?{language_code:input.language_code}:{}),
    ...(input.seed!==undefined?{seed:input.seed}:{}),
    ...(input.previous_text?{previous_text:input.previous_text}:{}),
    ...(input.next_text?{next_text:input.next_text}:{}),
    ...(input.apply_text_normalization?{apply_text_normalization:input.apply_text_normalization}:{}),
    ...(dictionaries.length?{pronunciation_dictionary_locators:dictionaries}:{})});
}

export function requestVoiceAudio(apiKey:string,input:VoiceInput,dictionaries:DictionaryLocator[]=[]) {
  // No SDK retry: a network timeout can happen after the provider charges.
  const path=input.with_timestamps?'/with-timestamps':'';
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voice_id)}${path}?output_format=${input.output_format}`,{
    method:'POST',headers:{'xi-api-key':apiKey,'Content-Type':'application/json',Accept:input.with_timestamps?'application/json':'*/*'},
    body:body(input,dictionaries),signal:AbortSignal.timeout(90000),redirect:'error',cache:'no-store',
  });
}

/** Streaming endpoint: audio chunks arrive while the rest is still being generated. */
export function streamVoiceAudio(apiKey:string,input:VoiceInput,dictionaries:DictionaryLocator[]=[]) {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voice_id)}/stream?output_format=${input.output_format}`,{
    method:'POST',headers:{'xi-api-key':apiKey,'Content-Type':'application/json',Accept:'*/*'},
    body:body(input,dictionaries),signal:AbortSignal.timeout(120000),redirect:'error',cache:'no-store',
  });
}

export function retrieveVoiceAudio(apiKey:string,historyId:string) {
  return fetch(`https://api.elevenlabs.io/v1/history/${encodeURIComponent(historyId)}/audio`,{headers:{'xi-api-key':apiKey},signal:AbortSignal.timeout(30000),redirect:'error',cache:'no-store'});
}
