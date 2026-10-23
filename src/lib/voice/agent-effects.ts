import { parseSpeechEffects, type SpeechEffects } from '@/lib/voice-api/speech-options';

export type AgentEffects = {
  enabled: boolean;
  audio: SpeechEffects;
  environmentMode: 'off' | 'fixed' | 'auto';
  backgroundMode: 'off' | 'fixed' | 'auto';
  environmentIds: string[];
  backgroundIds: string[];
  frequency: 'conversation' | 'period' | 'audio';
  timeZone: string;
};

export function newAgentEffects(): AgentEffects {
  return { enabled: false, audio: {}, environmentMode: 'off', backgroundMode: 'off', environmentIds: [], backgroundIds: [], frequency: 'conversation', timeZone: 'America/Sao_Paulo' };
}

/** Reading an old agent never enables effects. Keep disabled drafts for reactivation. */
export function normalizeAgentEffects(raw: unknown): AgentEffects | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Partial<AgentEffects>, result = newAgentEffects();
  result.enabled = value.enabled === true;
  try { result.audio = parseSpeechEffects(value.audio) ?? {}; } catch { result.enabled = false; }
  for (const key of ['environmentMode', 'backgroundMode'] as const) {
    if (value[key] && ['off', 'fixed', 'auto'].includes(value[key])) result[key] = value[key];
  }
  for (const key of ['environmentIds', 'backgroundIds'] as const) {
    if (Array.isArray(value[key])) result[key] = [...new Set(value[key].filter(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id)))].sort().slice(0, 40);
  }
  if (value.frequency && ['conversation', 'period', 'audio'].includes(value.frequency)) result.frequency = value.frequency;
  if (typeof value.timeZone === 'string' && value.timeZone.length <= 80) {
    try { new Intl.DateTimeFormat('en', { timeZone: value.timeZone }).format(); result.timeZone = value.timeZone; } catch { /* Use the displayed default. */ }
  }
  return result;
}
