import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/voice-api/speech-effects', () => ({ speechEffectsCatalog: vi.fn() }));
import { normalizeAgentEffects, newAgentEffects } from '@/lib/voice/agent-effects';
import { normalizeAgentVoiceSettings, newAgentVoiceSettings } from '@/lib/voice/agent-settings';
import { selectAgentEffects, resolveAgentEffects } from '@/lib/voice/agent-effects-resolver';
import { speechEffectsCatalog } from '@/lib/voice-api/speech-effects';
import { normalizeWhatsappBehaviorSettings } from '@/lib/whatsapp/agent-behavior';
import { commerceDatabase } from './helpers/commerce-database';

const catalog = {
  filter_presets: [{ filter_preset_id: 'phone', name: 'Phone', description: '' }],
  environments: ['small_room', 'street', 'hall'].map(environment_id => ({ environment_id, name: environment_id, description: '' })),
  background_noises: ['cafe', 'city', 'keyboard', 'call_center'].map(background_noise_id => ({ background_noise_id, name: background_noise_id, description: '' })),
};
const context = { organizationId: 'org', requestKey: 'run:1:0', metadata: { agentId: 'agent', agentRunId: 'run-1', conversationId: 'conversation-1' }, now: new Date('2026-10-23T08:59:00Z') };
const auto = () => ({ ...newAgentEffects(), enabled: true, environmentMode: 'auto' as const, backgroundMode: 'auto' as const, environmentIds: ['small_room', 'street', 'hall'], backgroundIds: ['cafe', 'city', 'keyboard', 'call_center'] });

describe('agent soundscape opt-in and selection', () => {
  it('keeps old settings byte-compatible and all new effects off by default', () => {
    const old = newAgentVoiceSettings();
    expect(normalizeAgentVoiceSettings(old)).toEqual(old);
    expect(normalizeAgentEffects(undefined)).toBeUndefined();
    expect(newAgentEffects()).toMatchObject({ enabled: false, environmentMode: 'off', backgroundMode: 'off' });
    expect(selectAgentEffects(newAgentEffects(), catalog, context)).toBeUndefined();
  });
  it('preserves disabled choices through save, pause and activation', () => {
    const effects = { ...auto(), enabled: false, audio: { filter_preset_id: 'phone', distance: .2, send_level: .3, pan: -.1 } };
    const config = normalizeAgentVoiceSettings({ ...newAgentVoiceSettings(), effects });
    const saved = normalizeWhatsappBehaviorSettings(JSON.parse(JSON.stringify({ audioStudioSettings: config, agentEnabled: false })));
    expect(saved.audioStudioSettings).toEqual(config);
    expect(normalizeWhatsappBehaviorSettings({ ...saved, agentEnabled: true }).audioStudioSettings).toEqual(config);
  });
  it('sends every manual effect while omitting disabled environments and their reverb', () => {
    const config = { ...auto(), environmentMode: 'fixed' as const, backgroundMode: 'fixed' as const, audio: { filter_preset_id: 'phone', environment_id: 'small_room', background_noise_id: 'keyboard', distance: .2, send_level: .3, pan: -.1 } };
    expect(selectAgentEffects(config, catalog, context)).toEqual(config.audio);
    expect(selectAgentEffects({ ...config, environmentMode: 'off', backgroundMode: 'off' }, catalog, context)).toEqual({ filter_preset_id: 'phone', distance: .2, pan: -.1 });
  });
  it('keeps the same scene across conversation replies and reordered pools', () => {
    const config = auto(), first = selectAgentEffects(config, catalog, context);
    expect(selectAgentEffects({ ...config, backgroundIds: [...config.backgroundIds].reverse() }, catalog, { ...context, requestKey: 'run:2:0', metadata: { ...context.metadata, agentRunId: 'run-2' } })).toEqual(first);
  });
  it('varies between responses while keeping all chunks in one response consistent', () => {
    const config = { ...auto(), frequency: 'audio' as const };
    expect(selectAgentEffects(config, catalog, { ...context, requestKey: 'run:1:1' })).toEqual(selectAgentEffects(config, catalog, context));
    const choices = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(selectAgentEffects(config, catalog, { ...context, metadata: { ...context.metadata, agentRunId: `run-${i}` } }))));
    expect(choices.size).toBeGreaterThan(1);
    for (const choice of choices) { const selected = JSON.parse(choice); expect(config.backgroundIds).toContain(selected.background_noise_id); expect(config.environmentIds).toContain(selected.environment_id); }
  });
  it('uses local six-hour periods and a stable persisted run timestamp across boundaries', async () => {
    const config = { ...auto(), frequency: 'period' as const };
    const first = selectAgentEffects(config, catalog, context);
    expect(selectAgentEffects(config, catalog, { ...context, now: new Date('2026-10-23T03:00:00Z') })).toEqual(first);
    vi.mocked(speechEffectsCatalog).mockResolvedValue(catalog);
    const db = commerceDatabase({ agent_runs: [{ id: 'run-1', organization_id: 'org', created_at: '2026-10-23T08:59:00Z' }] });
    expect(await resolveAgentEffects(db.client as never, config, { ...context, now: new Date('2026-10-24T12:00:00Z') })).toEqual(first);
    await expect(resolveAgentEffects(db.client as never, config, { ...context, organizationId: 'other' })).rejects.toMatchObject({ code: 'effect_period_unavailable' });
  });
  it('lets a preview sample independently of the live conversation without widening the pool', () => {
    const config = { ...auto(), environmentIds: ['small_room'], backgroundIds: ['keyboard'] };
    expect(selectAgentEffects(config, catalog, { ...context, metadata: { effectPreviewSeed: 'new-preview' } })).toEqual({ environment_id: 'small_room', background_noise_id: 'keyboard' });
  });
  it('rejects empty or removed choices before dispatch rather than silently broadening them', () => {
    for (const config of [{ ...auto(), backgroundIds: [] }, { ...auto(), environmentIds: ['removed'] }, { ...auto(), backgroundMode: 'fixed' as const }, { ...auto(), audio: { filter_preset_id: 'removed' } }]) {
      expect(() => selectAgentEffects(config, catalog, context)).toThrow();
    }
  });
  it('does not call the catalog for a disabled configuration', async () => {
    vi.mocked(speechEffectsCatalog).mockClear();
    expect(await resolveAgentEffects({} as never, { ...auto(), enabled: false }, context)).toBeUndefined();
    expect(speechEffectsCatalog).not.toHaveBeenCalled();
  });
});
