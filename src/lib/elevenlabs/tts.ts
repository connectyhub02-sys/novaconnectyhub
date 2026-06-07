import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createServiceClient } from "@/lib/supabase/service";
import { loadR2Config, putR2Object } from "@/lib/storage/r2";
import { loadElevenLabsCredentials } from "./credentials";

type JsonRecord = Record<string, unknown>;

export type GenerateElevenLabsAudioInput = {
  organizationId: string;
  text: string;
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
};

const maxAudioTextLength = 2500;

export async function generateElevenLabsAudio(input: GenerateElevenLabsAudioInput): Promise<GeneratedElevenLabsAudio> {
  const text = normalizeAudioText(input.text);

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
  const modelId = input.modelId?.trim() || credentials.defaultModelId;
  const elevenLabs = new ElevenLabsClient({ apiKey: credentials.apiKey });

  await ensureSharedVoiceAvailable(elevenLabs, {
    voiceId,
    publicOwnerId: input.voicePublicOwnerId,
    name: input.voiceName,
  });

  const audioStream = await elevenLabs.textToSpeech.convert(voiceId, {
    text,
    modelId,
    outputFormat: credentials.outputFormat,
    voiceSettings: {
      stability: 0.48,
      similarityBoost: 0.78,
      style: 0.22,
      useSpeakerBoost: true,
    },
  });
  const audioBytes = await readableStreamToBytes(audioStream);
  const now = new Date();
  const objectKey = `generated-media/elevenlabs/audio/${input.organizationId}/${now.getTime()}-${randomUUID()}.mp3`;
  const upload = await putR2Object(r2Config.config, objectKey, audioBytes, "audio/mpeg");

  if (!upload.ok) {
    throw new Error(upload.error);
  }

  const mediaId = await registerGeneratedMedia(client, {
    organizationId: input.organizationId,
    storageUrl: upload.publicUrl,
    objectKey: upload.objectKey,
    bytesSize: upload.bytesSize,
    transcript: text,
    metadata: {
      ...(input.metadata ?? {}),
      provider: "elevenlabs",
      source: input.source ?? "whatsapp_agent",
      voiceId,
      modelId,
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
  };
}

function normalizeAudioText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxAudioTextLength);
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
      newName: input.name?.trim() || "Voz ElevenLabs",
      bookmarked: true,
    });
  } catch {
    // If the voice was already added to the account, ElevenLabs can return a conflict.
    // The following TTS call is the authoritative validation.
  }
}
