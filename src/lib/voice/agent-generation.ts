import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { assertOrganizationOperationalAccess } from '@/lib/billing/access-control';
import { assertBillableAccess } from '@/lib/billing/trial';
import { meterUsageEvent } from '@/lib/billing/metered-usage';
import { quoteVoice, voiceModelPrices } from '@/lib/voice-api/catalog';
import { VoiceError } from '@/lib/voice-api/contract';
import { generateElevenLabsAudio } from '@/lib/elevenlabs/tts';
import { listWhatsappAudioVoices } from '@/lib/elevenlabs/voices';
import { normalizeAgentVoiceSettings, prepareAgentSpeech } from './agent-settings';
import type { GenerateConnectyVoiceAudioInput, GeneratedConnectyVoiceAudio } from './tts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAgentEffects } from './agent-effects-resolver';

export async function agentVoicePricing(client: SupabaseClient, organizationId: string) {
  const access = await assertOrganizationOperationalAccess({ organizationId, client });
  return { client, planCode: access.planCode };
}

export async function agentVoiceModels(client: SupabaseClient, organizationId: string) {
  return voiceModelPrices(await agentVoicePricing(client, organizationId));
}

export async function quoteAgentSpeech(input: GenerateConnectyVoiceAudioInput) {
  const config = normalizeAgentVoiceSettings(input.studioSettings);
  if (!config) throw new VoiceError('invalid_settings', 422, 'Escolha o modelo e os ajustes de voz.');
  const prepared = prepareAgentSpeech(input.text, config);
  const client = input.client ?? createServiceClient();
  const quote = await quoteVoice(await agentVoicePricing(client, input.organizationId), config.model, prepared.text.length);
  const audioEffects = await resolveAgentEffects(client, config.effects, { organizationId: input.organizationId, requestKey: input.idempotencyKey ?? 'quote', metadata: input.metadata });
  return { ...quote, characters: prepared.text.length, config, prepared, audioEffects };
}

/** A persisted claim prevents a repeated preview/job from requesting a second paid audio. */
export async function generateConfiguredAgentVoice(input: GenerateConnectyVoiceAudioInput): Promise<GeneratedConnectyVoiceAudio> {
  const client = input.client ?? createServiceClient();
  const config = normalizeAgentVoiceSettings(input.studioSettings);
  if (!config) throw new VoiceError('invalid_settings', 422, 'Configuração de voz inválida.');
  const prepared = prepareAgentSpeech(input.text, config);
  const metadata = input.metadata ?? {};
  const runKey = typeof metadata.agentRunId === 'string' ? `run:${metadata.agentRunId}:${metadata.audioChunkIndex ?? 0}` : randomUUID();
  const key = input.idempotencyKey ?? runKey;
  if (!/^[\x21-\x7e]{1,128}$/.test(key)) throw new VoiceError('invalid_key', 422, 'Identificador da prévia inválido.');
  const hash = createHash('sha256').update(JSON.stringify({ config, text: prepared.text, voice: input.voiceId, source: input.source, ...(config.effects?.enabled && metadata.effectPreviewSeed ? { effectSample: metadata.effectPreviewSeed } : {}) })).digest('hex');
  const lookup = () => client.from('agent_voice_generations').select('*').eq('organization_id', input.organizationId).eq('request_key', key).maybeSingle();
  const existing = await lookup();
  if (existing.error) throw new Error('Não foi possível consultar a geração de voz.');
  let receipt = existing.data;
  if (receipt && receipt.input_hash !== hash) throw new VoiceError('idempotency_conflict', 409, 'Esta solicitação pertence a outra configuração.');
  if (receipt?.result) return receipt.result as GeneratedConnectyVoiceAudio;
  if (receipt && !receipt.generated) throw new VoiceError('generation_pending', 409, 'Áudio em processamento ou aguardando conciliação. Esta solicitação não será gerada novamente.');
  if (!receipt) {
    const quote = await quoteAgentSpeech({ ...input, client, idempotencyKey: key });
    if (input.maxCredits !== undefined && quote.price.chargeCredits > input.maxCredits + 1e-9) throw new VoiceError('quote_changed', 409, 'O custo mudou. Atualize a estimativa antes de gerar.');
    // Resolve ownership on the server. A supplied voice id/public owner is not authorization.
    const catalog = await listWhatsappAudioVoices({ organizationId: input.organizationId, client });
    const voice = catalog.voices.find(v => v.voiceId === (input.voiceId || catalog.defaultVoiceId) && v.source !== 'gemini' && v.status !== 'verification_required' && v.status !== 'deleted');
    if (!voice) throw new VoiceError('voice_unavailable', 404, 'Voz indisponível nesta empresa.');
    if (metadata.agentScope !== 'platform' && metadata.agentScope !== 'internal') {
      const access = await assertBillableAccess({ organizationId: input.organizationId, client });
      if (access.balanceCredits < quote.price.chargeCredits) throw new VoiceError('insufficient_credits', 402, 'Créditos insuficientes para este áudio.');
    }
    const claimed = await client.from('agent_voice_generations').upsert({ organization_id: input.organizationId, request_key: key, input_hash: hash, quote: { rates: quote.rates, characters: quote.characters, ...(quote.audioEffects ? { audioEffects: quote.audioEffects } : {}) }, status: 'processing' }, { onConflict: 'organization_id,request_key', ignoreDuplicates: true }).select('*').maybeSingle();
    if (claimed.error) throw new Error('Não foi possível registrar a geração de voz.');
    if (!claimed.data) throw new VoiceError('generation_pending', 409, 'Esta solicitação já está em processamento.');
    receipt = claimed.data;
    try {
      const generated = await generateElevenLabsAudio({ ...input, client, studioSettings: config, audioEffects: receipt.quote.audioEffects, voiceId: voice.voiceId, voicePublicOwnerId: voice.publicOwnerId, voiceName: voice.name });
      const stored = await client.from('agent_voice_generations').update({ generated, status: 'metering', updated_at: new Date().toISOString() }).eq('id', receipt.id);
      if (stored.error) throw new Error('O áudio aguarda recuperação do recibo.');
      receipt.generated = generated;
    } catch (error) {
      await client.from('agent_voice_generations').update({ status: 'uncertain', updated_at: new Date().toISOString() }).eq('id', receipt.id);
      throw error;
    }
  }
  const generated = receipt.generated;
  const string = (key: string) => typeof metadata[key] === 'string' ? metadata[key] as string : null;
  const usage = await meterUsageEvent(client, {
    organizationId: input.organizationId, userId: input.userId, provider: 'elevenlabs',
    featureCode: input.source?.includes('whatsapp') ? 'voice_reply_whatsapp' : 'text_to_speech',
    modelId: config.model, quotedRates: receipt.quote.rates, characters: receipt.quote.characters,
    agentId: string('agentId'), agentRunId: string('agentRunId'), conversationId: string('conversationId'), leadId: string('leadId'),
    agentScope: metadata.agentScope === 'platform' ? 'platform' : metadata.agentScope === 'internal' ? 'internal' : 'customer',
    requestId: `agent-voice:${receipt.id}`, debitDescription: 'Áudio de agente ConnectyHub',
    metadata: { ...metadata, source: input.source, pricingFeature: 'text_to_speech', studioSettings: config, audioEffects: receipt.quote.audioEffects, mediaId: generated.mediaId, characters: receipt.quote.characters },
  });
  const result: GeneratedConnectyVoiceAudio = { ...generated, text: prepared.transcript, usageEventId: usage.usageEventId, billingMode: usage.billingMode, chargeCredits: usage.chargeCredits, meteringError: null };
  if (generated.mediaId) {
    const linked = await client.from('generated_media').update({ usage_event_id: usage.usageEventId }).eq('id', generated.mediaId).eq('organization_id', input.organizationId);
    if (linked.error) throw new Error('Áudio gerado; vínculo do consumo pendente. Reutilize a solicitação.');
  }
  const completed = await client.from('agent_voice_generations').update({ result, status: 'completed', updated_at: new Date().toISOString() }).eq('id', receipt.id);
  if (completed.error) throw new Error('Áudio gerado; recibo pendente. Reutilize a solicitação.');
  return result;
}
