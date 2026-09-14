import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/gemini/tts', () => ({ geminiTtsVoices: [{ voiceId: 'gemini:kore', voiceName: 'Kore' }] }));
import { studioGeminiRequest, requestStudioGemini, readStudioGeminiResult } from '../src/lib/voice-api/studio-gemini-provider';
afterEach(() => vi.unstubAllGlobals());
const input = { text: 'Olá, tudo bem?', voiceId: 'gemini:kore', modelId: 'gemini-3.1-flash-tts-preview' };
const result = () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: Buffer.alloc(48000).toString('base64') } }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 32 } });
it('accepts native voices only, with no clone fallback or credentials in URLs', () => {
  const r = studioGeminiRequest(input);
  expect(r.url).not.toContain('key=');
  expect(JSON.parse(r.body).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore');
  expect(() => studioGeminiRequest({ ...input, voiceId: 'private_clone' })).toThrow();
  expect(() => studioGeminiRequest({ ...input, modelId: '../other' })).toThrow();
});
it('wraps complete PCM as a valid one-second WAV and keeps provider token usage', async () => {
  const parsed = await readStudioGeminiResult(Response.json(result()));
  expect(parsed.bytes.toString('ascii', 0, 4)).toBe('RIFF');
  expect(parsed.bytes.readUInt32LE(40)).toBe(48000);
  expect(parsed.bytes.readUInt32LE(24)).toBe(24000);
  expect(parsed.durationSeconds).toBe(1);
  expect(parsed.usage).toEqual({ inputTokens: 10, outputTokens: 32 });
});
it('leaves missing metering pending instead of inventing zero usage', async () => {
  const data = result();
  delete (data as { usageMetadata?: unknown }).usageMetadata;
  expect((await readStudioGeminiResult(Response.json(data))).usage).toBeNull();
});
it('rejects truncated output, wrong sample rates and malformed base64', async () => {
  const truncated = result(); truncated.candidates[0].finishReason = 'MAX_TOKENS';
  await expect(readStudioGeminiResult(Response.json(truncated))).rejects.toThrow();
  const rate = result(); rate.candidates[0].content.parts[0].inlineData.mimeType = 'audio/L16;rate=16000';
  await expect(readStudioGeminiResult(Response.json(rate))).rejects.toThrow();
  const corrupt = result(); corrupt.candidates[0].content.parts[0].inlineData.data = '%%%=';
  await expect(readStudioGeminiResult(Response.json(corrupt))).rejects.toThrow();
});
it('makes a single dispatch when the outcome is uncertain', async () => {
  const fetch = vi.fn().mockRejectedValue(Error('timeout')); vi.stubGlobal('fetch', fetch);
  await expect(requestStudioGemini('synthetic-key', input)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error', headers: { 'x-goog-api-key': 'synthetic-key' } });
});
