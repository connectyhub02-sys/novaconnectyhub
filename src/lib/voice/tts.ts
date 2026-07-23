import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateElevenLabsAudio, type GeneratedElevenLabsAudio } from "@/lib/elevenlabs/tts";
import { generateGeminiAudio, isGeminiTtsVoiceId, type GeneratedGeminiAudio } from "@/lib/gemini/tts";

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

export type GeneratedConnectyVoiceAudio = GeneratedElevenLabsAudio | GeneratedGeminiAudio;

export async function generateConnectyVoiceAudio(input: GenerateConnectyVoiceAudioInput): Promise<GeneratedConnectyVoiceAudio> {
  if (resolveVoiceProvider(input.voiceSource, input.voiceId) === "gemini") {
    return generateGeminiAudio({
      organizationId: input.organizationId,
      userId: input.userId,
      text: input.text,
      voiceId: input.voiceId,
      voiceName: input.voiceName,
      modelId: input.modelId,
      source: input.source,
      metadata: input.metadata,
      client: input.client,
    });
  }

  return generateElevenLabsAudio({
    organizationId: input.organizationId,
    userId: input.userId,
    text: input.text,
    voiceId: input.voiceId,
    voicePublicOwnerId: input.voicePublicOwnerId,
    voiceName: input.voiceName,
    modelId: input.modelId,
    source: input.source,
    metadata: input.metadata,
    client: input.client,
  });
}

function resolveVoiceProvider(source: string | null | undefined, voiceId: string | null | undefined) {
  const normalizedSource = source?.trim().toLowerCase();

  if (normalizedSource === "gemini") {
    return "gemini";
  }

  return isGeminiTtsVoiceId(voiceId) ? "gemini" : "elevenlabs";
}
