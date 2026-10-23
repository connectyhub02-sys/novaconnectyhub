import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commerceDatabase } from './helpers/commerce-database';
import { newAgentVoiceSettings } from '@/lib/voice/agent-settings';
const m = vi.hoisted(() => ({ generate: vi.fn(), meter: vi.fn(), quote: vi.fn(), voices: vi.fn(), access: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }));
vi.mock('@/lib/billing/access-control', () => ({ assertOrganizationOperationalAccess: vi.fn(async () => ({ planCode: 'pro' })) }));
vi.mock('@/lib/billing/trial', () => ({ assertBillableAccess: m.access }));
vi.mock('@/lib/billing/metered-usage', () => ({ meterUsageEvent: m.meter }));
vi.mock('@/lib/voice-api/catalog', () => ({ quoteVoice: m.quote, voiceModelPrices: vi.fn() }));
vi.mock('@/lib/elevenlabs/tts', () => ({ generateElevenLabsAudio: m.generate }));
vi.mock('@/lib/elevenlabs/voices', () => ({ listWhatsappAudioVoices: m.voices }));
import { generateConfiguredAgentVoice } from '@/lib/voice/agent-generation';

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
