import { describe, expect, it, vi } from 'vitest';
import { serverModuleHarness } from './helpers/server-module-harness';
import { commerceDatabase } from './helpers/commerce-database';
import { newAgentVoiceSettings, prepareAgentSpeech } from '@/lib/voice/agent-settings';
import type * as Tts from '@/lib/elevenlabs/tts';

describe('agent voice provider request', () => {
  it.each([false, true])('preserves legacy defaults or sends filtered Studio settings (opt-in=%s)', async optIn => {
    const convert = vi.fn(async () => new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1,2,3])); controller.close(); } }));
    const db = commerceDatabase();
    const tts = serverModuleHarness<typeof Tts>('src/lib/elevenlabs/tts.ts', {
      '@/lib/voice/agent-settings': { prepareAgentSpeech },
      'node:crypto': { randomUUID: () => 'fixture' },
      '@elevenlabs/elevenlabs-js': { ElevenLabsClient: class { textToSpeech = { convert }; } },
      './credentials': { loadElevenLabsCredentials: async () => ({ apiKey: 'fake', defaultVoiceId: 'clone', defaultModelId: 'eleven_multilingual_v2', outputFormat: 'mp3_44100_128' }) },
      '@/lib/storage/r2': { loadR2Config: async () => ({ ok: true, config: {} }), putR2Object: async () => ({ ok: true, objectKey: 'obj', publicUrl: 'https://fixture.invalid/a', bytesSize: 3 }) },
      '@/lib/storage/quotas': { recordOrganizationStorageUsage: async () => {}, assertStorageUploadAllowed: async () => {} },
    });
    const config = newAgentVoiceSettings('eleven_v3'); config.performance.style = 'cinematic'; config.performance.intensity = 'strong';
    const result = await tts.generateElevenLabsAudio({ organizationId: 'org', text: 'Olá!\n\nTudo bem?', client: db.client as never, ...(optIn ? { studioSettings: config } : {}) });
    const request = convert.mock.calls[0] as unknown as [string, { modelId: string; text: string; voiceSettings: Record<string, unknown> }, unknown];
    if (optIn) {
      expect(request[1]).toMatchObject({ modelId: 'eleven_v3', text: '[dramatic] Olá!\n\nTudo bem?' });
      expect(JSON.parse(JSON.stringify(request[1].voiceSettings))).toEqual({ stability: 0 });
      expect(request[2]).toEqual({ maxRetries: 0 });
      expect(db.tables.generated_media[0].transcript).toBe('Olá!\n\nTudo bem?');
    } else {
      expect(request[1]).toMatchObject({ modelId: 'eleven_multilingual_v2', text: 'Olá! Tudo bem?', voiceSettings: { stability: .48, similarityBoost: .78, style: .22, useSpeakerBoost: true } });
    }
    expect(result.audioUrl).toBe('https://fixture.invalid/a');
  });
});
