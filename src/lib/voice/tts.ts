import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { meterUsageEvent } from "@/lib/billing/metered-usage";
import type { BillingProvider, UsageAgentScope, UsageBillingMode } from "@/lib/billing/cost-center";
import { generateElevenLabsAudio, type GeneratedElevenLabsAudio } from "@/lib/elevenlabs/tts";
import { generateGeminiAudio, isGeminiTtsVoiceId, type GeneratedGeminiAudio } from "@/lib/gemini/tts";
import { createServiceClient } from "@/lib/supabase/service";

type JsonRecord = Record<string, unknown>;

export type GenerateConnectyVoiceAudioInput = {
  organizationId: string;
  text: string;
  userId?: string | null;
  voiceId?: string | null;
  voicePublicOwnerId?: string | null;
  voiceName?: string | null;
  voiceSource?: string | null;
  modelId?: string | null;
  source?: string;
  metadata?: JsonRecord;
  client?: SupabaseClient;
};

export type GeneratedConnectyVoiceAudio = (GeneratedElevenLabsAudio | GeneratedGeminiAudio) & {
  usageEventId?: string | null;
  billingMode?: UsageBillingMode | null;
  chargeCredits?: number | null;
  meteringError?: string | null;
};

export async function generateConnectyVoiceAudio(input: GenerateConnectyVoiceAudioInput): Promise<GeneratedConnectyVoiceAudio> {
  const provider = resolveVoiceProvider(input.voiceSource, input.voiceId);
  const client = input.client ?? createServiceClient();
  const generated = provider === "gemini"
    ? await generateGeminiAudio({
      organizationId: input.organizationId,
      userId: input.userId,
      text: input.text,
      voiceId: input.voiceId,
      voiceName: input.voiceName,
      modelId: input.modelId,
      source: input.source,
      metadata: input.metadata,
      client,
    })
    : await generateElevenLabsAudio({
      organizationId: input.organizationId,
      userId: input.userId,
      text: input.text,
      voiceId: input.voiceId,
      voicePublicOwnerId: input.voicePublicOwnerId,
      voiceName: input.voiceName,
      modelId: input.modelId,
      source: input.source,
      metadata: input.metadata,
      client,
    });

  let metering: Awaited<ReturnType<typeof meterVoiceUsage>>;

  try {
    metering = await meterVoiceUsage(client, input, generated, provider);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida ao registrar metering de audio.";
    await appendGeneratedMediaMeteringError(client, generated.mediaId, message);
    throw error;
  }

  if (metering?.usageEventId && generated.mediaId) {
    await client
      .from("generated_media")
      .update({
        usage_event_id: metering.usageEventId,
      })
      .eq("id", generated.mediaId);
  }

  return {
    ...generated,
    usageEventId: metering.usageEventId ?? null,
    billingMode: metering.billingMode ?? null,
    chargeCredits: metering.chargeCredits ?? null,
    meteringError: null,
  };
}

async function meterVoiceUsage(
  client: SupabaseClient,
  input: GenerateConnectyVoiceAudioInput,
  generated: GeneratedElevenLabsAudio | GeneratedGeminiAudio,
  provider: BillingProvider,
) {
  const metadata = readRecord(input.metadata) ?? {};
  const characters = generated.text.length;

  return meterUsageEvent(client, {
    organizationId: input.organizationId,
    userId: input.userId ?? null,
    provider,
    featureCode: resolveVoiceFeatureCode(input.source),
    modelId: generated.modelId,
    agentId: readString(metadata.agentId),
    agentRunId: readString(metadata.agentRunId),
    conversationId: readString(metadata.conversationId),
    leadId: readString(metadata.leadId),
    agentScope: readAgentScope(metadata.agentScope),
    billingMode: readBillingMode(metadata.billingMode),
    characters,
    outputUnits: characters,
    requestId: `voice:${provider}:${generated.mediaId ?? generated.objectKey}`,
    debitDescription: "Audio de agente ConnectyHub",
    metadata: {
      ...metadata,
      source: input.source ?? "voice_tts",
      mediaId: generated.mediaId,
      objectKey: generated.objectKey,
      bytesSize: generated.bytesSize,
      voiceId: generated.voiceId,
      outputFormat: generated.outputFormat,
      characters,
    },
  });
}

async function appendGeneratedMediaMeteringError(client: SupabaseClient, mediaId: string | null, errorMessage: string) {
  if (!mediaId) {
    return;
  }

  const { data } = await client
    .from("generated_media")
    .select("metadata")
    .eq("id", mediaId)
    .maybeSingle<{ metadata: JsonRecord | null }>();
  const metadata = readRecord(data?.metadata) ?? {};
  const errors = Array.isArray(metadata.metering_errors) ? metadata.metering_errors : [];

  await client
    .from("generated_media")
    .update({
      metadata: {
        ...metadata,
        metering_errors: [
          ...errors.slice(-4),
          {
            errorMessage: errorMessage.slice(0, 500),
            occurredAt: new Date().toISOString(),
          },
        ],
      },
    })
    .eq("id", mediaId);
}

function resolveVoiceProvider(source: string | null | undefined, voiceId: string | null | undefined): BillingProvider {
  const normalizedSource = source?.trim().toLowerCase();

  if (normalizedSource === "gemini") {
    return "gemini";
  }

  return isGeminiTtsVoiceId(voiceId) ? "gemini" : "elevenlabs";
}

function resolveVoiceFeatureCode(source: string | null | undefined) {
  const normalizedSource = source?.trim().toLowerCase() ?? "";
  return normalizedSource.includes("whatsapp") ? "voice_reply_whatsapp" : "text_to_speech";
}

function readRecord(value: unknown): JsonRecord | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readAgentScope(value: unknown): UsageAgentScope | undefined {
  return value === "customer" || value === "platform" || value === "internal" || value === "unknown" ? value : undefined;
}

function readBillingMode(value: unknown): UsageBillingMode | undefined {
  return value === "customer_billable"
    || value === "trial_billable"
    || value === "internal_shadow"
    || value === "platform_absorbed"
    || value === "free"
    ? value
    : undefined;
}
