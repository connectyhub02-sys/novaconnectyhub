import { normalizeOutboundSpeechText } from "@/lib/whatsapp/outbound-language";
import { defaultPerformance, interpretations, normalizeSpeech, prepareSpeech, type Performance, type SpeechSettings } from '@/lib/voice-api/performance';
import { speechControls, studioVoiceSettings } from '@/lib/voice-api/model-controls';
import { normalizeAgentEffects, type AgentEffects } from './agent-effects';

export type AgentVoiceSettings = {
  version: 1;
  model: keyof typeof speechControls;
  performance: Performance;
  settings: SpeechSettings;
  effects?: AgentEffects;
};

export function newAgentVoiceSettings(model: AgentVoiceSettings['model'] = 'eleven_multilingual_v2'): AgentVoiceSettings {
  return { version: 1, model, performance: { ...defaultPerformance }, settings: { stability: .5, similarity_boost: .78, style: 0, speed: 1, use_speaker_boost: true } };
}

/** Missing/invalid configurations stay on the legacy path; reading never opts in. */
export function normalizeAgentVoiceSettings(raw: unknown): AgentVoiceSettings | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<AgentVoiceSettings>;
  if (value.version !== 1 || !value.model || !Object.hasOwn(speechControls, value.model)) return null;
  const result = newAgentVoiceSettings(value.model);
  const p = value.performance;
  if (p && interpretations.some(item => item.id === p.style)) result.performance.style = p.style;
  if (p && ['gentle', 'balanced', 'strong'].includes(p.intensity)) result.performance.intensity = p.intensity;
  if (value.model !== 'eleven_v3') result.performance.style = 'natural';
  const settings = value.settings;
  for (const key of ['stability', 'similarity_boost', 'style', 'speed'] as const) {
    const next = settings?.[key];
    if (typeof next === 'number' && Number.isFinite(next)) result.settings[key] = Math.max(key === 'speed' ? .7 : 0, Math.min(key === 'speed' ? 1.2 : 1, next));
  }
  if (typeof settings?.use_speaker_boost === 'boolean') result.settings.use_speaker_boost = settings.use_speaker_boost;
  const effects = normalizeAgentEffects(value.effects);
  if (effects) result.effects = effects;
  return result;
}

export function prepareAgentSpeech(text: string, config: AgentVoiceSettings) {
  // The customer/LLM cannot inject acting commands. Direction comes only from saved controls.
  const transcript = normalizeSpeech(normalizeOutboundSpeechText(text).replace(/\[[^\]\n]*\]|⟦[^⟧]*⟧|<[^>]*>/g, ''));
  if (!transcript) throw new Error('Escreva uma frase para ouvir a voz.');
  const prepared = prepareSpeech(transcript, config.model, studioVoiceSettings(config.model, config.settings), config.performance);
  if (prepared.text.length > 4800) throw new Error('Texto e interpretação excedem 4.800 caracteres.');
  return { transcript, text: prepared.text, settings: studioVoiceSettings(config.model, prepared.voiceSettings) };
}
