import 'server-only';
import { VoiceError } from './contract';
import { studioAudioTransportLimits } from './audio-provider';

// Internal provider boundary, not a public API. Callers must resolve every voice,
// preview, dictionary and dub through the owning project before reaching here.
// Creation must have a durable reservation; transport never retries a POST.
type AliasRule = { type: 'alias'; stringToReplace: string; alias: string };
type PhonemeRule = { type: 'phoneme'; stringToReplace: string; phoneme: string; alphabet: 'ipa' | 'cmu-arpabet' };
export type StudioResourceRequest =
  | { operation: 'dialogue'; turns: Array<{ text: string; voiceId: string }> }
  | { operation: 'voice_design'; description: string; sampleText: string }
  | { operation: 'voice_design_save'; name: string; description: string; previewId: string }
  | { operation: 'dictionary_create'; name: string; rules: Array<AliasRule | PhonemeRule> }
  | { operation: 'dubbing'; audio: Blob; targetLanguage: string };

const providerOrigin = 'https://api.elevenlabs.io';
function text(value: unknown, min: number, max: number) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) {
    throw new VoiceError('text_limit', 422, `Texto deve ter entre ${min} e ${max} caracteres.`);
  }
  return value.trim();
}
function id(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new VoiceError('resource_invalid', 422, 'Recurso inválido.');
  return value;
}
function language(value: unknown) {
  if (typeof value !== 'string' || !/^[a-z]{2,3}$/.test(value)) throw new VoiceError('invalid_language', 422, 'Idioma inválido.');
  return value;
}
function json(path: string, value: object, audioResult = false) {
  return { url: `${providerOrigin}${path}`, body: JSON.stringify(value) as BodyInit, contentType: 'application/json' as string | null, audioResult };
}

export function studioResourceProviderRequest(input: StudioResourceRequest) {
  switch (input.operation) {
    case 'dialogue': {
      if (!Array.isArray(input.turns) || !input.turns.length || input.turns.length > 50) throw new VoiceError('turn_limit', 422, 'Envie entre 1 e 50 falas.');
      const turns = input.turns.map(turn => ({ text: text(turn.text, 1, 2000), voice_id: id(turn.voiceId) }));
      if (turns.reduce((n, turn) => n + turn.text.length, 0) > 2000 || new Set(turns.map(turn => turn.voice_id)).size > 10) {
        throw new VoiceError('dialogue_limit', 422, 'Use até 2.000 caracteres no total e 10 vozes.');
      }
      return json('/v1/text-to-dialogue?output_format=mp3_44100_128', { inputs: turns, model_id: 'eleven_v3' }, true);
    }
    case 'voice_design':
      // Explicit text permits an exact preflight character quote. Do not turn on
      // automatic text/prompt enhancement with unbounded or separately priced work.
      return json('/v1/text-to-voice/design?output_format=mp3_44100_128', {
        voice_description: text(input.description, 20, 1000), text: text(input.sampleText, 100, 1000),
        auto_generate_text: false, should_enhance: false,
      });
    case 'voice_design_save':
      return json('/v1/text-to-voice', { voice_name: text(input.name, 1, 100), voice_description: text(input.description, 20, 1000), generated_voice_id: id(input.previewId) });
    case 'dictionary_create': {
      if (!Array.isArray(input.rules) || !input.rules.length || input.rules.length > 100) throw new VoiceError('rule_limit', 422, 'Use entre 1 e 100 regras.');
      const rules = input.rules.map(rule => {
        const string_to_replace = text(rule.stringToReplace, 1, 100);
        if (rule.type === 'alias') return { type: 'alias', string_to_replace, alias: text(rule.alias, 1, 200) };
        if (rule.type === 'phoneme' && ['ipa', 'cmu-arpabet'].includes(rule.alphabet)) {
          return { type: 'phoneme', string_to_replace, phoneme: text(rule.phoneme, 1, 200), alphabet: rule.alphabet };
        }
        throw new VoiceError('rule_invalid', 422, 'Regra de pronúncia inválida.');
      });
      // No workspace_access: the provider defaults to no shared workspace access.
      // Edits create a private immutable version, never mutate another project's dictionary.
      return json('/v1/pronunciation-dictionaries/add-from-rules', { name: text(input.name, 1, 100), rules });
    }
    case 'dubbing': {
      if (!(input.audio instanceof Blob) || !input.audio.size || input.audio.size > studioAudioTransportLimits.inputBytes || !/^audio\/[a-z0-9.+-]+$/i.test(input.audio.type)) {
        throw new VoiceError('audio_limit', 422, 'Envie áudio de até 20 MB.');
      }
      const form = new FormData();
      form.set('file', input.audio, 'audio');
      form.set('target_lang', language(input.targetLanguage));
      form.set('mode', 'automatic');
      form.set('dubbing_studio', 'false');
      return { url: `${providerOrigin}/v1/dubbing`, body: form as BodyInit, contentType: null, audioResult: false };
    }
    default:
      throw new VoiceError('unsupported_operation', 422, 'Operação não suportada.');
  }
}

export function requestStudioResource(apiKey: string, input: StudioResourceRequest) {
  const request = studioResourceProviderRequest(input);
  return fetch(request.url, {
    method: 'POST', body: request.body,
    headers: { 'xi-api-key': apiKey, Accept: request.audioResult ? 'audio/mpeg' : 'application/json', ...(request.contentType ? { 'Content-Type': request.contentType } : {}) },
    signal: AbortSignal.timeout(120_000), redirect: 'error', cache: 'no-store',
  });
}

// IDs here must come from a project-owned receipt, never a client-supplied provider URL.
export function studioDubReadUrl(dubId: string, targetLanguage?: string) {
  const base = `${providerOrigin}/v1/dubbing/${encodeURIComponent(id(dubId))}`;
  return targetLanguage ? `${base}/audio/${encodeURIComponent(language(targetLanguage))}` : base;
}
