import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commerceDatabase } from './helpers/commerce-database';
import { newAgentVoiceSettings } from '@/lib/voice/agent-settings';
const m = vi.hoisted(() => ({ generate: vi.fn(), meter: vi.fn(), quote: vi.fn(), voices: vi.fn(), access: vi.fn() }));
vi.mock('@/lib/voice-api/speech-effects', () => ({ speechEffectsCatalog: async () => ({ filter_presets: [], environments: [{ environment_id: 'small_room' }], background_noises: [{ background_noise_id: 'keyboard' }] }) }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }));
vi.mock('@/lib/billing/access-control', () => ({ assertOrganizationOperationalAccess: vi.fn(async () => ({ planCode: 'pro' })) }));
vi.mock('@/lib/billing/trial', () => ({ assertBillableAccess: m.access }));
vi.mock('@/lib/billing/metered-usage', () => ({ meterUsageEvent: m.meter }));
vi.mock('@/lib/voice-api/catalog', () => ({ quoteVoice: m.quote, voiceModelPrices: vi.fn() }));
vi.mock('@/lib/elevenlabs/tts', () => ({ generateElevenLabsAudio: m.generate }));
vi.mock('@/lib/elevenlabs/voices', () => ({ listWhatsappAudioVoices: m.voices }));
import { generateConfiguredAgentVoice } from '@/lib/voice/agent-generation';
import { newAgentEffects } from '@/lib/voice/agent-effects';

const rates = [{ id: 'studio-rate', unit: 'character', connectyPricePerUnit: .24, providerCostPerUnit: .001, minimumChargeCredits: 5 }];
function fixture() {
  const db = commerceDatabase();
  return { db, input: { organizationId: 'org', client: db.client as never, voiceId: 'clone', text: 'Olá!', studioSettings: newAgentVoiceSettings('eleven_v3'), source: 'whatsapp_voice_preview', idempotencyKey: 'test', metadata: { agentScope: 'customer' } } };
}
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ balanceCredits: 1000 });
  m.quote.mockResolvedValue({ rates, price: { chargeCredits: 5 } });
  m.voices.mockResolvedValue({ voices: [{ voiceId: 'clone', source: 'customer', status: 'ready', name: 'Clone' }] });
  m.generate.mockResolvedValue({ mediaId: 'media', modelId: 'eleven_v3', voiceId: 'clone', audioUrl: 'https://fixture.invalid/audio.mp3', objectKey: 'object', text: 'Olá!', bytesSize: 100 });
  m.meter.mockResolvedValue({ usageEventId: 'usage', chargeCredits: 5, billingMode: 'customer_billable' });
});
describe('configured agent voice dispatch and billing', () => {
  it('persists automatic effects before dispatch and reuses them on recovery without changing Studio pricing', async () => {
    const { input, db } = fixture();
    input.studioSettings.effects = { ...newAgentEffects(), enabled: true, environmentMode: 'auto', environmentIds: ['small_room'], backgroundMode: 'auto', backgroundIds: ['keyboard'], audio: { distance: .1, send_level: .2, pan: -.1 } };
    const expected = { environment_id: 'small_room', background_noise_id: 'keyboard', distance: .1, send_level: .2, pan: -.1 };
    m.generate.mockImplementationOnce(async args => {
      expect(db.tables.agent_voice_generations[0].quote).toMatchObject({ audioEffects: expected, rates, characters: 4 });
      expect(args.audioEffects).toEqual(expected);
      return { mediaId: 'media', audioUrl: 'https://fixture.invalid/audio.mp3', audioEffects: args.audioEffects };
    });
    m.meter.mockRejectedValueOnce(new Error('metering unavailable'));
    await expect(generateConfiguredAgentVoice(input)).rejects.toThrow('metering unavailable');
    expect((await generateConfiguredAgentVoice(input)).audioEffects).toEqual(expected);
    expect(m.generate).toHaveBeenCalledTimes(1);
    expect(m.meter.mock.calls[1][1]).toMatchObject({ quotedRates: rates, characters: 4, metadata: { audioEffects: expected } });
  });
  it('replays one paid generation, keeping Studio rates and agent attribution', async () => {
    const { input } = fixture();
    const first = await generateConfiguredAgentVoice(input);
    expect(await generateConfiguredAgentVoice(input)).toEqual(first);
    expect(m.generate).toHaveBeenCalledTimes(1);
    expect(m.meter).toHaveBeenCalledTimes(1);
    expect(m.meter.mock.calls[0][1]).toMatchObject({ quotedRates: rates, featureCode: 'voice_reply_whatsapp', modelId: 'eleven_v3', characters: 4, organizationId: 'org' });
  });
  it('never generates again after an uncertain provider response', async () => {
    const { input } = fixture();
    m.generate.mockRejectedValueOnce(new Error('timeout'));
    await expect(generateConfiguredAgentVoice(input)).rejects.toThrow('timeout');
    await expect(generateConfiguredAgentVoice(input)).rejects.toMatchObject({ code: 'generation_pending' });
    expect(m.generate).toHaveBeenCalledTimes(1); expect(m.meter).not.toHaveBeenCalled();
  });
  it('recovers a metering failure from the stored audio with the same debit key and rate snapshot', async () => {
    const { input } = fixture();
    m.meter.mockRejectedValueOnce(new Error('metering unavailable'));
    await expect(generateConfiguredAgentVoice(input)).rejects.toThrow('metering unavailable');
    m.quote.mockResolvedValue({ rates: [], price: { chargeCredits: 100 } });
    await generateConfiguredAgentVoice(input);
    expect(m.generate).toHaveBeenCalledTimes(1);
    expect(m.meter.mock.calls[0][1].requestId).toBe(m.meter.mock.calls[1][1].requestId);
    expect(m.meter.mock.calls[1][1].quotedRates).toEqual(rates);
  });
  it('rejects changed input under the same key but scopes keys to the organization', async () => {
    const { input } = fixture(); await generateConfiguredAgentVoice(input);
    await expect(generateConfiguredAgentVoice({ ...input, text: 'Outra frase' })).rejects.toMatchObject({ code: 'idempotency_conflict' });
    await generateConfiguredAgentVoice({ ...input, organizationId: 'second-org' });
    expect(m.generate).toHaveBeenCalledTimes(2);
  });
  it('claims only one dispatch under concurrent requests', async () => {
    const { input } = fixture();
    const results = await Promise.allSettled([generateConfiguredAgentVoice(input), generateConfiguredAgentVoice(input)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(m.generate).toHaveBeenCalledTimes(1);
  });
  it('checks ownership, balance and the quoted ceiling before dispatch', async () => {
    const { input } = fixture();
    await expect(generateConfiguredAgentVoice({ ...input, maxCredits: 4 })).rejects.toMatchObject({ code: 'quote_changed' });
    m.voices.mockResolvedValueOnce({ voices: [] });
    await expect(generateConfiguredAgentVoice(input)).rejects.toMatchObject({ code: 'voice_unavailable' });
    m.access.mockResolvedValueOnce({ balanceCredits: 4 });
    await expect(generateConfiguredAgentVoice(input)).rejects.toMatchObject({ code: 'insufficient_credits' });
    expect(m.generate).not.toHaveBeenCalled(); expect(m.meter).not.toHaveBeenCalled();
  });
  it('uses the same claim for a retried agent run and chunk without a UI key', async () => {
    const { input } = fixture();
    const run = { ...input, idempotencyKey: undefined, metadata: { agentRunId: 'run', audioChunkIndex: 0 } };
    await generateConfiguredAgentVoice(run); await generateConfiguredAgentVoice(run);
    expect(m.generate).toHaveBeenCalledTimes(1);
  });
});
