import { describe, expect, it } from 'vitest';
import { newAgentVoiceSettings, normalizeAgentVoiceSettings, prepareAgentSpeech } from '@/lib/voice/agent-settings';
import { normalizeWhatsappBehaviorSettings, normalizeWhatsappBehaviorConfig } from '@/lib/whatsapp/agent-behavior';
import { parseVoiceInput } from '@/lib/voice-api/contract';
import { studioVoiceSettings } from '@/lib/voice-api/model-controls';

describe('agent voice opt-in and Studio direction', () => {
  it('never changes the legacy voice/model or opts in on an unrelated save', () => {
    const old = { audioVoiceId: 'clone', audioModelId: 'eleven_flash_v2_5', audioVoiceSource: 'customer', responseMode: 'mirror' };
    const saved = normalizeWhatsappBehaviorSettings(old);
    expect(saved).toMatchObject({ ...old, audioStudioSettings: null });
    expect(normalizeWhatsappBehaviorSettings({ ...saved, markAsRead: false }).audioStudioSettings).toBeNull();
  });
  it('preserves the chosen configuration through pause, JSON persistence, clone and activation', () => {
    const config = newAgentVoiceSettings('eleven_v3');
    config.performance = { style: 'cinematic', intensity: 'strong', preview: false };
    for (const normalize of [normalizeWhatsappBehaviorConfig, normalizeWhatsappBehaviorSettings]) {
      const saved = normalize(JSON.parse(JSON.stringify({ audioStudioSettings: config, agentEnabled: false })));
      expect(saved.audioStudioSettings).toEqual(config);
      expect(normalize({ ...saved, agentEnabled: true }).audioStudioSettings).toEqual(config);
    }
  });
  it.each(['eleven_v3', 'eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_turbo_v2_5'] as const)('compiles and counts the same direction as Studio for %s', model => {
    const config = newAgentVoiceSettings(model);
    if (model === 'eleven_v3') config.performance.style = 'cinematic';
    const text = 'Olá! Vamos conversar...\n\nCom calma.';
    const agent = prepareAgentSpeech(text, config);
    const studio = parseVoiceInput({ text, voice_id: 'clone', model_id: model, performance: config.performance, voice_settings: studioVoiceSettings(model, config.settings) });
    expect(agent.text).toBe(studio.text);
    expect(agent.text.length).toBe(studio.text.length);
    expect(agent.settings).toEqual(studioVoiceSettings(model, studio.voice_settings));
    expect(agent.transcript).toContain('\n\n');
    expect(agent.transcript).not.toContain('[dramatic]');
  });
  it.each([['gentle', 1], ['balanced', .5], ['strong', 0]] as const)('uses %s intensity without unsupported v3 settings', (intensity, stability) => {
    const config = newAgentVoiceSettings('eleven_v3');
    config.performance = { style: 'sales', intensity, preview: false };
    const prepared = prepareAgentSpeech('[shouting] Olá! ⟦Rir⟧ <break time="3s" />', config);
    expect(prepared.text).toBe('[confident] [warmly] Olá!');
    expect(prepared.settings).toEqual({ stability });
  });
  it('normalizes corrupted inputs and strips incompatible performance after a model change', () => {
    expect(normalizeAgentVoiceSettings({ version: 1, model: '__proto__' })).toBeNull();
    expect(normalizeAgentVoiceSettings({ version: 2, model: 'eleven_v3' })).toBeNull();
    const config = normalizeAgentVoiceSettings({ ...newAgentVoiceSettings(), performance: { style: 'cinematic', intensity: 'strong', preview: true }, settings: { speed: 99, stability: -1, style: NaN } });
    expect(config).toMatchObject({ performance: { style: 'natural', preview: false }, settings: { speed: 1.2, stability: 0, style: 0 } });
  });
});
