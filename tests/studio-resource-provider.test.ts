import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { studioResourceProviderRequest, requestStudioResource, studioDubReadUrl } from '../src/lib/voice-api/studio-resource-provider';
afterEach(() => vi.unstubAllGlobals());
it('bounds dialogue by the complete text and distinct voices', () => {
  const request = studioResourceProviderRequest({ operation: 'dialogue', turns: [{ text: 'Oi', voiceId: 'one' }, { text: 'Olá', voiceId: 'two' }] });
  expect(JSON.parse(String(request.body))).toEqual({ model_id: 'eleven_v3', inputs: [{ text: 'Oi', voice_id: 'one' }, { text: 'Olá', voice_id: 'two' }] });
  expect(() => studioResourceProviderRequest({ operation: 'dialogue', turns: [{ text: 'a'.repeat(1001), voiceId: 'one' }, { text: 'b'.repeat(1000), voiceId: 'one' }] })).toThrow();
  expect(() => studioResourceProviderRequest({ operation: 'dialogue', turns: Array.from({ length: 11 }, (_, n) => ({ text: 'Oi', voiceId: `voice_${n}` })) })).toThrow();
});
it('keeps design previews and saving distinct, with explicit bounded preview text', () => {
  const input = { operation: 'voice_design' as const, description: 'Uma voz suave para narrar histórias.', sampleText: 'Uma história começa com uma pergunta. '.repeat(5) };
  const body = JSON.parse(String(studioResourceProviderRequest(input).body));
  expect(body.auto_generate_text).toBe(false);
  expect(body.model_id).toBe('eleven_multilingual_ttv_v2');
  expect(body.should_enhance).toBe(false);
  expect(() => studioResourceProviderRequest({ ...input, sampleText: 'curto' })).toThrow();
  const save = studioResourceProviderRequest({ operation: 'voice_design_save', name: 'Narrador', description: input.description, previewId: 'project_owned_preview' });
  expect(save.url).toBe('https://api.elevenlabs.io/v1/text-to-voice');
  expect(JSON.parse(String(save.body)).generated_voice_id).toBe('project_owned_preview');
  expect(JSON.parse(String(save.body)).text).toBeUndefined();
});
it('does not share a created dictionary and restricts the rule schema', () => {
  const body = JSON.parse(String(studioResourceProviderRequest({ operation: 'dictionary_create', name: 'Marca', rules: [{ type: 'alias', stringToReplace: 'ConnectyHub', alias: 'Conécti Râb' }] }).body));
  expect(body.workspace_access).toBeUndefined();
  expect(body.rules[0]).toEqual({ type: 'alias', string_to_replace: 'ConnectyHub', alias: 'Conécti Râb' });
  expect(() => studioResourceProviderRequest({ operation: 'dictionary_create', name: 'Marca', rules: [] })).toThrow();
});
it('only uploads bounded audio for a single dubbing target without enabling editing or source URLs', () => {
  const request = studioResourceProviderRequest({ operation: 'dubbing', audio: new Blob(['synthetic'], { type: 'audio/wav' }), targetLanguage: 'pt' });
  const form = request.body as FormData;
  expect(form.get('target_lang')).toBe('pt');
  expect(form.get('dubbing_studio')).toBe('false');
  expect(form.get('watermark')).toBe('false');
  expect(form.has('source_url')).toBe(false);
  expect(studioDubReadUrl('own_dub', 'pt')).toBe('https://api.elevenlabs.io/v1/dubbing/own_dub/audio/pt');
  expect(() => studioDubReadUrl('../../other')).toThrow();
  expect(() => studioDubReadUrl('own_dub', 'pt?redirect=other')).toThrow();
});
it('never repeats uncertain resource creation or follows redirects', async () => {
  const fetch = vi.fn().mockRejectedValue(new Error('timeout'));
  vi.stubGlobal('fetch', fetch);
  await expect(requestStudioResource('synthetic', { operation: 'dialogue', turns: [{ text: 'Oi', voiceId: 'one' }] })).rejects.toThrow('timeout');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store' });
});
