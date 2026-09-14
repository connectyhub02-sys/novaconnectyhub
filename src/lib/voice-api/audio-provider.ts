import 'server-only';
import {VoiceError} from './contract';

// Internal transport only. The operation worker must verify project ownership,
// measured duration, the effective tariff and the durable reservation first.
// No public route dispatches these operations until that pipeline is integrated.
export type StudioAudioRequest =
  | {operation:'transcription'; audio:Blob; language?:string; diarize:boolean}
  | {operation:'audio_isolation'; audio:Blob}
  | {operation:'voice_change'; audio:Blob; voiceId:string}
  | {operation:'forced_alignment'; audio:Blob; text:string};

export const studioAudioTransportLimits = {inputBytes:20_000_000, resultBytes:20_000_000, jsonBytes:4_000_000} as const;

export function studioAudioProviderRequest(input:StudioAudioRequest) {
  if (!(input.audio instanceof Blob) || !input.audio.size || input.audio.size > studioAudioTransportLimits.inputBytes) {
    throw new VoiceError('audio_limit',422,'Envie um áudio válido de até 20 MB.');
  }
  if (!/^audio\/[a-z0-9.+-]+$/i.test(input.audio.type)) {
    throw new VoiceError('audio_format',422,'Formato de áudio não aceito.');
  }
  const form = new FormData();
  let path:string;
  let audioResult = false;
  switch (input.operation) {
    case 'transcription':
      path = '/v1/speech-to-text';
      form.set('file',input.audio,'audio');
      form.set('model_id','scribe_v2');
      form.set('diarize',String(input.diarize));
      form.set('timestamps_granularity','word');
      if (input.language) {
        if (!/^[a-z]{2,3}$/.test(input.language)) throw new VoiceError('invalid_language',422,'Idioma inválido.');
        form.set('language_code',input.language);
      }
      break;
    case 'audio_isolation':
      path = '/v1/audio-isolation';
      form.set('audio',input.audio,'audio');
      audioResult = true;
      break;
    case 'voice_change':
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.voiceId)) throw new VoiceError('invalid_voice',422,'Voz inválida.');
      path = `/v1/speech-to-speech/${encodeURIComponent(input.voiceId)}?output_format=mp3_44100_128`;
      form.set('audio',input.audio,'audio');
      form.set('model_id','eleven_multilingual_sts_v2');
      // Isolation is a separate operation. Never silently enable a second cost.
      form.set('remove_background_noise','false');
      audioResult = true;
      break;
    case 'forced_alignment':
      if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4800) {
        throw new VoiceError('text_limit',422,'Envie entre 1 e 4800 caracteres.');
      }
      path = '/v1/forced-alignment';
      form.set('file',input.audio,'audio');
      form.set('text',input.text);
      break;
    default:
      throw new VoiceError('unsupported_operation',422,'Operação de áudio não suportada.');
  }
  return {url:`https://api.elevenlabs.io${path}`,body:form,audioResult};
}

export async function requestStudioAudio(apiKey:string,input:StudioAudioRequest) {
  const operation = studioAudioProviderRequest(input);
  // Exactly one dispatch. Timeout/5xx is not evidence that nothing was charged.
  return fetch(operation.url,{
    method:'POST',
    headers:{'xi-api-key':apiKey,Accept:operation.audioResult?'audio/mpeg':'application/json'},
    body:operation.body,signal:AbortSignal.timeout(120_000),redirect:'error',cache:'no-store',
  });
}

export async function readStudioAudioResult(response:Response,audioResult:boolean) {
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!response.ok || !response.body || !(audioResult?type?.startsWith('audio/'):type==='application/json')) {
    await response.body?.cancel();
    throw new VoiceError('provider_result_invalid',502,'Resultado de áudio indisponível.');
  }
  const limit = audioResult?studioAudioTransportLimits.resultBytes:studioAudioTransportLimits.jsonBytes;
  const reader = response.body.getReader();
  const chunks:Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new VoiceError('result_limit',502,'Resultado acima do limite.');
      chunks.push(value);
    }
    if (!size) throw new VoiceError('provider_result_empty',502,'Resultado vazio.');
  } catch (error) {
    await reader.cancel().catch(()=>{});
    throw error;
  }
  return {bytes:Buffer.concat(chunks,size),contentType:type!};
}
