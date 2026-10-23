import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { speechEffectsCatalog } from '@/lib/voice-api/speech-effects';
import { VoiceError } from '@/lib/voice-api/contract';
import type { EffectsCatalog, SpeechEffects } from '@/lib/voice-api/speech-options';
import type { AgentEffects } from './agent-effects';

type Context = { organizationId: string; requestKey: string; metadata?: Record<string, unknown>; now?: Date };

export function selectAgentEffects(config: AgentEffects, catalog: EffectsCatalog, context: Context): SpeechEffects | undefined {
  if (!config.enabled) return undefined;
  const metadata = context.metadata ?? {};
  const string = (key: string) => typeof metadata[key] === 'string' ? metadata[key] as string : '';
  const run = string('agentRunId') || context.requestKey;
  let scope = run;
  if (config.frequency === 'conversation') scope = string('conversationId') || string('leadId') || run;
  if (config.frequency === 'period') {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(context.now ?? new Date());
    const part = (type: string) => parts.find(p => p.type === type)?.value;
    scope = `${part('year')}-${part('month')}-${part('day')}:${Math.floor(Number(part('hour')) / 6)}:${config.timeZone}`;
  }
  // A preview samples the selected pool without pretending to be a real conversation/time.
  if (string('effectPreviewSeed')) scope = string('effectPreviewSeed');
  const seed = JSON.stringify([context.organizationId, string('agentId'), config.frequency, scope]);
  const effects = { ...config.audio };
  const choose = (mode: AgentEffects['environmentMode'], ids: string[], fixed: string | undefined, group: 'environment' | 'background') => {
    if (mode === 'off') return undefined;
    const available = group === 'environment' ? catalog.environments.map(e => e.environment_id) : catalog.background_noises.map(e => e.background_noise_id);
    const choices = mode === 'fixed' ? (fixed ? [fixed] : []) : [...new Set(ids)].sort();
    if (!choices.length || choices.some(id => !available.includes(id))) throw new VoiceError('invalid_effect', 422, 'Selecione opções disponíveis para o ambiente e o som de fundo.');
    return choices[createHash('sha256').update(`${seed}:${group}`).digest().readUInt32BE(0) % choices.length];
  };
  const environment = choose(config.environmentMode, config.environmentIds, effects.environment_id, 'environment');
  const background = choose(config.backgroundMode, config.backgroundIds, effects.background_noise_id, 'background');
  delete effects.environment_id; delete effects.background_noise_id;
  if (environment) effects.environment_id = environment; else delete effects.send_level;
  if (background) effects.background_noise_id = background;
  if (effects.filter_preset_id && !catalog.filter_presets.some(f => f.filter_preset_id === effects.filter_preset_id)) throw new VoiceError('invalid_effect', 422, 'O filtro salvo não está disponível. Escolha novamente.');
  return Object.keys(effects).length ? effects : undefined;
}

export async function resolveAgentEffects(client: SupabaseClient, config: AgentEffects | undefined, context: Context) {
  if (!config?.enabled) return undefined;
  if (config.frequency === 'period' && typeof context.metadata?.agentRunId === 'string' && !context.metadata?.effectPreviewSeed) {
    // Use the persisted run timestamp so chunks/retries crossing a time boundary agree.
    let createdAt = context.metadata.agentRunCreatedAt;
    if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))) {
      const run = await client.from('agent_runs').select('created_at').eq('id', context.metadata.agentRunId).eq('organization_id', context.organizationId).maybeSingle();
      if (run.error || !run.data?.created_at) throw new VoiceError('effect_period_unavailable', 503, 'Não foi possível confirmar o período desta resposta.');
      createdAt = run.data.created_at;
    }
    if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))) throw new VoiceError('effect_period_unavailable', 503, 'Período da resposta inválido.');
    context = { ...context, now: new Date(createdAt) };
  }
  return selectAgentEffects(config, await speechEffectsCatalog({ client }), context);
}
