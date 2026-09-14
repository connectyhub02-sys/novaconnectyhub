import 'server-only';
import { geminiTtsVoices } from '@/lib/gemini/tts';
import { VoiceError } from './contract';
import { voiceBody } from './contract';

// Separate from WhatsApp generation: no retry, public R2 upload, implicit voice
// fallback or second metering path. A project-owned operation persists the result
// and settles exactly one tariff before exposing the private audio.
const audioLimit = 20_000_000;
const jsonLimit = 28_000_000;
const models = new Set(['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts']);
export function studioGeminiRequest(input: { text: string; voiceId: string; modelId: string }) {
  const voice = geminiTtsVoices.find(v => v.voiceId === input.voiceId);
  if (!voice) throw new VoiceError('voice_unavailable', 422, 'Escolha uma voz nativa disponível para este modelo.');
  if (!models.has(input.modelId)) throw new VoiceError('model_unavailable', 422, 'Modelo de voz não disponível.');
  if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4800) throw new VoiceError('text_limit', 422, 'Envie entre 1 e 4800 caracteres.');
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${input.modelId}:generateContent`,
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: input.text }] }],
      generationConfig: { maxOutputTokens:8192, responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.voiceName } } } },
    }),
  };
}
export function requestStudioGemini(apiKey: string, input: Parameters<typeof studioGeminiRequest>[0]) {
  const request = studioGeminiRequest(input);
  return fetch(request.url, { method: 'POST', headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' }, body: request.body, signal: AbortSignal.timeout(120_000), redirect: 'error', cache: 'no-store' });
}

function wav(pcm: Buffer) {
  const output = Buffer.alloc(44 + pcm.length);
  output.write('RIFF'); output.writeUInt32LE(36 + pcm.length, 4); output.write('WAVE', 8);
  output.write('fmt ', 12); output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22);
  output.writeUInt32LE(24000, 24); output.writeUInt32LE(48000, 28); output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34);
  output.write('data', 36); output.writeUInt32LE(pcm.length, 40); pcm.copy(output, 44);
  return output;
}
type Result = { candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
export async function readStudioGeminiResult(response: Response) {
  if (!response.ok || response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    await response.body?.cancel(); throw new VoiceError('provider_result_invalid', 502, 'Resultado de voz indisponível.');
  }
  const bytes = await voiceBody(response, jsonLimit);
  let data: Result;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new VoiceError('provider_result_invalid', 502, 'Resultado de voz inválido.'); }
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts?.filter(p => p.inlineData);
  const inline = parts?.[0]?.inlineData;
  if (data?.candidates?.length !== 1 || candidate?.finishReason !== 'STOP' || parts?.length !== 1 || !inline || typeof inline.data !== 'string') {
    throw new VoiceError('provider_result_incomplete', 502, 'A geração de voz não terminou corretamente.');
  }
  // The documented output is mono signed 16-bit little-endian PCM at 24 kHz.
  // Refuse other rates/codecs rather than silently producing corrupt WAV files.
  const mime = inline.mimeType?.toLowerCase().replace(/\s/g, '');
  if (!mime || !/^audio\/l16;(?:codec=pcm;)?rate=24000(?:;channels=1)?$/.test(mime)) throw new VoiceError('audio_format', 502, 'Formato de voz inesperado.');
  if (inline.data.length > Math.ceil(audioLimit / 3) * 4 || (inline.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(inline.data))) {
    throw new VoiceError('audio_limit', 502, 'Resultado de voz inválido ou acima do limite.');
  }
  const pcm = Buffer.from(inline.data, 'base64');
  if (!pcm.length || pcm.length % 2 || pcm.length > audioLimit || pcm.toString('base64') !== inline.data) throw new VoiceError('audio_format', 502, 'Áudio incompleto.');
  const inputTokens = data.usageMetadata?.promptTokenCount, outputTokens = data.usageMetadata?.candidatesTokenCount;
  const usage = Number.isSafeInteger(inputTokens) && Number.isSafeInteger(outputTokens) && inputTokens! >= 0 && outputTokens! > 0
    ? { inputTokens: inputTokens!, outputTokens: outputTokens! } : null;
  // Missing usage is a pending reconciliation, never a zero-cost generation.
  return { bytes: wav(pcm), contentType: 'audio/wav', durationSeconds: pcm.length / 48000, usage };
}
