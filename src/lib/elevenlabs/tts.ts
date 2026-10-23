import { prepareAgentSpeech, type AgentVoiceSettings } from "@/lib/voice/agent-settings";
import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createServiceClient } from "@/lib/supabase/service";
import { loadR2Config, putR2Object } from "@/lib/storage/r2";
import { assertStorageUploadAllowed, recordOrganizationStorageUsage } from "@/lib/storage/quotas";
import { loadElevenLabsCredentials } from "./credentials";
import { requestVoiceAudio, boundedVoiceAudio } from '@/lib/voice-api/provider';
import { VoiceError } from '@/lib/voice-api/contract';
import type { SpeechEffects } from '@/lib/voice-api/speech-options';

type JsonRecord = Record<string, unknown>;

export type GenerateElevenLabsAudioInput = {
  organizationId: string;
  text: string;
  studioSettings?: AgentVoiceSettings;
  audioEffects?: SpeechEffects;
  userId?: string | null;
  voiceId?: string | null;
  voicePublicOwnerId?: string | null;
  voiceName?: string | null;
  modelId?: string | null;
  source?: string;
  metadata?: JsonRecord;
  client?: SupabaseClient;
};

export type GeneratedElevenLabsAudio = {
  mediaId: string | null;
  audioUrl: string;
  objectKey: string;
  bytesSize: number;
  voiceId: string;
  modelId: string;
  outputFormat: string;
  text: string;
  audioEffects?: SpeechEffects;
};

const maxAudioTextLength = 4800;

export async function generateElevenLabsAudio(input: GenerateElevenLabsAudioInput): Promise<GeneratedElevenLabsAudio> {
  const prepared = input.studioSettings ? prepareAgentSpeech(input.text, input.studioSettings) : null;
  const text = prepared?.text ?? normalizeAudioText(input.text);

  if (!text) {
    throw new Error("Escreva a mensagem antes de gerar audio.");
  }

  const client = input.client ?? createServiceClient();
  const credentials = await loadElevenLabsCredentials(client);
  const r2Config = await loadR2Config(client);

  if (!r2Config.ok) {
    throw new Error(r2Config.error);
  }

  const voiceId = input.voiceId?.trim() || credentials.defaultVoiceId;
  const modelId = input.studioSettings?.model || input.modelId?.trim() || credentials.defaultModelId;
  const elevenLabs = new ElevenLabsClient({ apiKey: credentials.apiKey });

  await ensureSharedVoiceAvailable(elevenLabs, {
    voiceId,
    publicOwnerId: input.voicePublicOwnerId,
    name: input.voiceName,
  });

  let audioBytes: Uint8Array;
  if (input.audioEffects && prepared) {
    const response = await requestVoiceAudio(credentials.apiKey, { text, voice_id: voiceId, model_id: modelId, voice_settings: prepared.settings, output_format: credentials.outputFormat, audio_effects: input.audioEffects });
    if (!response.ok) {
      await response.body?.cancel();
      throw new VoiceError('provider_effects_failed', 502, 'Não foi possível gerar o áudio com os efeitos escolhidos. A solicitação não será repetida automaticamente.');
    }
    audioBytes = await boundedVoiceAudio(response);
  } else {
    const audioStream = await elevenLabs.textToSpeech.convert(voiceId, {
      text,
      modelId,
      outputFormat: credentials.outputFormat,
      voiceSettings: prepared ? {
        stability: prepared.settings.stability,
        similarityBoost: prepared.settings.similarity_boost,
        style: prepared.settings.style,
        speed: prepared.settings.speed,
        useSpeakerBoost: prepared.settings.use_speaker_boost,
      } : {
        stability: 0.48,
        similarityBoost: 0.78,
        style: 0.22,
        useSpeakerBoost: true,
      },
    }, input.studioSettings ? { maxRetries: 0 } : undefined);
    audioBytes = await readableStreamToBytes(audioStream);
  }
  const now = new Date();
  const objectKey = `generated-media/elevenlabs/audio/${input.organizationId}/${now.getTime()}-${randomUUID()}.mp3`;
  const bypassStorageQuota = isRealtimeWhatsappAudioSource(input.source);

  if (!bypassStorageQuota) {
    await assertStorageUploadAllowed({
      client,
      organizationId: input.organizationId,
      category: "generated_media",
      files: [{
        fileName: `${now.getTime()}-${voiceId}.mp3`,
        contentType: "audio/mpeg",
        sizeBytes: audioBytes.byteLength,
      }],
    });
  }

  const upload = await putR2Object(r2Config.config, objectKey, audioBytes, "audio/mpeg");

  if (!upload.ok) {
    throw new Error(upload.error);
  }

  await recordOrganizationStorageUsage({
    client,
    organizationId: input.organizationId,
    category: "generated_media",
    bytes: upload.bytesSize,
    fileCount: 1,
    metadata: {
      source: input.source ?? "voice_tts",
      provider: "elevenlabs",
      object_key: upload.objectKey,
      voice_id: voiceId,
    },
  }).catch((error: unknown) => {
    if (!bypassStorageQuota) {
      throw error;
    }
    return null;
  });

  const mediaId = await registerGeneratedMedia(client, {
    organizationId: input.organizationId,
    storageUrl: upload.publicUrl,
    objectKey: upload.objectKey,
    bytesSize: upload.bytesSize,
    transcript: prepared?.transcript ?? text,
    metadata: {
      ...(input.metadata ?? {}),
      provider: "elevenlabs",
      source: input.source ?? "whatsapp_agent",
      voiceId,
      modelId,
      ...(input.studioSettings ? { studioSettings: input.studioSettings } : {}),
      ...(input.audioEffects ? { audioEffects: input.audioEffects } : {}),
      outputFormat: credentials.outputFormat,
      generatedBy: input.userId ?? null,
      generatedAt: now.toISOString(),
    },
  });

  return {
    mediaId,
    audioUrl: upload.publicUrl,
    objectKey: upload.objectKey,
    bytesSize: upload.bytesSize,
    voiceId,
    modelId,
    outputFormat: credentials.outputFormat,
    text,
    ...(input.audioEffects ? { audioEffects: input.audioEffects } : {}),
  };
}

function normalizeAudioText(value: string) {
  const text = value.replace(/\s+/g, " ").trim();

  if (text.length > maxAudioTextLength) {
    throw new Error(`Texto para audio excede ${maxAudioTextLength} caracteres. Divida a mensagem antes de gerar voz.`);
  }

  return text;
}

function isRealtimeWhatsappAudioSource(value: string | null | undefined) {
  const source = value?.trim().toLowerCase();
  return source === "whatsapp_agent"
    || source === "whatsapp_test"
    || source === "whatsapp_internal_test";
}

async function readableStreamToBytes(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (value) {
      chunks.push(value);
      totalLength += value.byteLength;
    }
  }

  const bytes = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

async function registerGeneratedMedia(
  client: SupabaseClient,
  input: {
    organizationId: string;
    storageUrl: string;
    objectKey: string;
    bytesSize: number;
    transcript: string;
    metadata: JsonRecord;
  },
) {
  const { data, error } = await client
    .from("generated_media")
    .insert({
      organization_id: input.organizationId,
      provider: "elevenlabs",
      media_type: "audio",
      storage_url: input.storageUrl,
      r2_object_key: input.objectKey,
      bytes_size: input.bytesSize,
      transcript: input.transcript,
      metadata: input.metadata,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    return null;
  }

  return data?.id ?? null;
}

async function ensureSharedVoiceAvailable(
  elevenLabs: ElevenLabsClient,
  input: {
    voiceId: string;
    publicOwnerId?: string | null;
    name?: string | null;
  },
) {
  const publicOwnerId = input.publicOwnerId?.trim();

  if (!publicOwnerId) {
    return;
  }

  try {
    await elevenLabs.voices.share(publicOwnerId, input.voiceId, {
      newName: input.name?.trim() || "Voz ConnectyHub",
      bookmarked: true,
    });
  } catch {
    // If the voice was already added to the account, ElevenLabs can return a conflict.
    // The following TTS call is the authoritative validation.
  }
}
