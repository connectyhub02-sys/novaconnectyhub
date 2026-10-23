import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { agentVoiceModels, quoteAgentSpeech } from './agent-generation';
import { generateConnectyVoiceAudio } from './tts';
import { normalizeAgentVoiceSettings } from './agent-settings';
import { VoiceError } from '@/lib/voice-api/contract';
import { BillingAccessError } from '@/lib/billing/trial';
import { statusForDashboardCompanyScopeError } from '@/lib/client-os/dashboard-route-scope';

export async function agentPreviewResponse(request: Request, scope: { organizationId: string; userId: string; agentScope: 'customer' | 'platform'; client: SupabaseClient }, body?: Record<string, unknown>) {
  if (request.method === 'GET') return Response.json({ models: await agentVoiceModels(scope.client, scope.organizationId) }, { headers: { 'Cache-Control': 'no-store' } });
  const config = normalizeAgentVoiceSettings(body?.settings);
  if (!config || typeof body?.text !== 'string' || !body.text.trim() || body.text.length > 600 || typeof body.voiceId !== 'string' || !body.voiceId) throw new VoiceError('invalid_preview', 422, 'Escolha uma voz e escreva uma frase de até 600 caracteres.');
  const input = { organizationId: scope.organizationId, userId: scope.userId, client: scope.client, text: body.text, voiceId: body.voiceId, voiceSource: 'elevenlabs', studioSettings: config, source: 'whatsapp_voice_preview', metadata: { agentScope: scope.agentScope } };
  if (body.action === 'quote') {
    const quote = await quoteAgentSpeech(input);
    return Response.json({ credits: quote.price.chargeCredits, characters: quote.characters }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (body.action !== 'generate' || typeof body.maxCredits !== 'number' || !Number.isFinite(body.maxCredits) || body.maxCredits < 0 || !request.headers.get('idempotency-key')) throw new VoiceError('invalid_preview', 422, 'Atualize a estimativa antes de gerar a prévia.');
  const result = await generateConnectyVoiceAudio({ ...input, maxCredits: body.maxCredits, idempotencyKey: request.headers.get('idempotency-key')! });
  return Response.json({ audioUrl: result.audioUrl, credits: result.chargeCredits }, { headers: { 'Cache-Control': 'no-store' } });
}

export function agentPreviewError(error: unknown) {
  const status = error instanceof SyntaxError ? 400 : error instanceof BillingAccessError ? 402
    : statusForDashboardCompanyScopeError(error, 0) || (error instanceof VoiceError ? error.status : (error as { status?: number })?.status);
  return Response.json({ error: error instanceof Error ? error.message : 'Não foi possível preparar a voz.' }, { status: typeof status === 'number' && status >= 400 && status <= 599 ? status : 503, headers: { 'Cache-Control': 'no-store' } });
}
