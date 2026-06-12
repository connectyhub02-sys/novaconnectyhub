import "server-only";

import { randomUUID } from "node:crypto";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { loadR2Config, putR2Object } from "@/lib/storage/r2";
import { loadElevenLabsCredentials, type ElevenLabsCredentials } from "./credentials";

type CloneVoiceFile = {
  file: File;
  filename: string;
  contentType: string;
  size: number;
};

export type CustomerVoiceClone = {
  id: string | null;
  voiceId: string;
  name: string;
  status: string;
  requiresVerification: boolean;
};

export async function deleteCustomerVoiceClone(input: {
  organizationId: string;
  voiceId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const credentials = await loadElevenLabsCredentials(client);
  const elevenLabs = new ElevenLabsClient({ apiKey: credentials.apiKey });

  await elevenLabs.voices.delete(input.voiceId).catch(() => {});

  const { data: voice } = await client
    .from("customer_voices")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("provider_voice_id", input.voiceId)
    .eq("provider", "elevenlabs")
    .maybeSingle<{ id: string }>();

  if (voice) {
    await client
      .from("customer_voices")
      .update({ status: "deleted" })
      .eq("id", voice.id);
  }
}

const maxVoiceNameLength = 80;
const maxCloneFiles = 5;
const maxCloneFileBytes = 25 * 1024 * 1024;
const maxCloneTotalBytes = 60 * 1024 * 1024;
const allowedAudioExtensions = new Set(["aac", "m4a", "mp3", "mp4", "mpeg", "oga", "ogg", "opus", "wav", "webm"]);

export async function createCustomerVoiceClone(input: {
  organizationId: string;
  userId: string;
  name: string;
  files: File[];
  consentText: string;
  removeBackgroundNoise: boolean;
  client?: SupabaseClient;
}): Promise<CustomerVoiceClone> {
  const client = input.client ?? createServiceClient();
  const credentials = await loadElevenLabsCredentials(client);
  const name = normalizeVoiceName(input.name);
  const files = normalizeCloneFiles(input.files);
  const elevenLabs = new ElevenLabsClient({ apiKey: credentials.apiKey });
  const createdAt = new Date().toISOString();

  const response = await elevenLabs.voices.ivc.create({
    name,
    files: files.map((file) => ({
      data: file.file,
      filename: file.filename,
      contentType: file.contentType,
      contentLength: file.size,
    })),
    removeBackgroundNoise: input.removeBackgroundNoise,
    description: `Voz clonada com consentimento no painel ConnectyHub em ${createdAt}.`,
    labels: {
      source: "connectyhub",
      consent: "accepted",
    },
  });

  const status = response.requiresVerification ? "verification_required" : "ready";
  const metadata = {
    clone_type: "instant_voice_clone",
    provider: "elevenlabs",
    created_from: "dashboard_whatsapp",
    remove_background_noise: input.removeBackgroundNoise,
    requires_verification: response.requiresVerification,
    consent_text: input.consentText,
    consent_accepted_at: createdAt,
    sample_count: files.length,
    sample_files: files.map((file) => ({
      name: file.filename,
      content_type: file.contentType,
      bytes_size: file.size,
    })),
  };

  const { data, error } = await client
    .from("customer_voices")
    .insert({
      organization_id: input.organizationId,
      owner_user_id: input.userId,
      provider: "elevenlabs",
      provider_voice_id: response.voiceId,
      name,
      status,
      consent_status: "accepted",
      default_for_agents: false,
      metadata,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    await elevenLabs.voices.delete(response.voiceId).catch(() => null);
    throw new Error(`Voz criada, mas nao foi possivel salvar no ConnectyHub: ${error.message}`);
  }

  generateVoicePreview(client, elevenLabs, credentials, {
    voiceId: response.voiceId,
    voiceRecordId: data?.id ?? null,
    organizationId: input.organizationId,
  }).catch(() => {});

  return {
    id: data?.id ?? null,
    voiceId: response.voiceId,
    name,
    status,
    requiresVerification: response.requiresVerification,
  };
}

function normalizeVoiceName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");

  if (name.length < 2) {
    throw new Error("Informe um nome para a voz.");
  }

  if (name.length > maxVoiceNameLength) {
    throw new Error(`O nome da voz pode ter no maximo ${maxVoiceNameLength} caracteres.`);
  }

  return name;
}

function normalizeCloneFiles(files: File[]) {
  const validFiles = files
    .filter((file) => file.size > 0)
    .map((file) => {
      const filename = sanitizeFilename(file.name || "audio-clone.mp3");
      const contentType = file.type || inferContentType(filename);

      if (!isAllowedAudioFile(filename, contentType)) {
        throw new Error(`O arquivo ${filename} precisa ser um audio valido.`);
      }

      if (file.size > maxCloneFileBytes) {
        throw new Error(`O arquivo ${filename} excede 25 MB.`);
      }

      return {
        file,
        filename,
        contentType,
        size: file.size,
      } satisfies CloneVoiceFile;
    });

  if (validFiles.length === 0) {
    throw new Error("Envie ao menos um audio para clonar a voz.");
  }

  if (validFiles.length > maxCloneFiles) {
    throw new Error(`Envie no maximo ${maxCloneFiles} audios por clonagem.`);
  }

  const totalBytes = validFiles.reduce((sum, file) => sum + file.size, 0);

  if (totalBytes > maxCloneTotalBytes) {
    throw new Error("Os audios somados nao podem passar de 60 MB.");
  }

  return validFiles;
}

function sanitizeFilename(value: string) {
  const cleaned = value.trim().replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-");
  return cleaned || "audio-clone.mp3";
}

function inferContentType(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase();

  if (extension === "wav") return "audio/wav";
  if (extension === "ogg" || extension === "oga" || extension === "opus") return "audio/ogg";
  if (extension === "m4a" || extension === "mp4") return "audio/mp4";
  if (extension === "webm") return "audio/webm";
  if (extension === "aac") return "audio/aac";

  return "audio/mpeg";
}

function isAllowedAudioFile(filename: string, contentType: string) {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return contentType.startsWith("audio/") || allowedAudioExtensions.has(extension);
}

const previewText = "Oi, essa e a minha voz clonada. Estou pronta pra atender no WhatsApp!";

const previewDelayMs = 5000;
const previewMaxRetries = 2;

async function generateVoicePreview(
  client: SupabaseClient,
  elevenLabs: ElevenLabsClient,
  credentials: ElevenLabsCredentials,
  input: { voiceId: string; voiceRecordId: string | null; organizationId: string },
) {
  await new Promise((resolve) => setTimeout(resolve, previewDelayMs));

  let audioStream: ReadableStream<Uint8Array> | null = null;

  for (let attempt = 0; attempt <= previewMaxRetries; attempt++) {
    try {
      audioStream = await elevenLabs.textToSpeech.convert(input.voiceId, {
        text: previewText,
        modelId: credentials.defaultModelId,
        outputFormat: credentials.outputFormat,
        voiceSettings: { stability: 0.48, similarityBoost: 0.78, style: 0.22, useSpeakerBoost: true },
      });
      break;
    } catch {
      if (attempt === previewMaxRetries) return;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  if (!audioStream) return;

  const chunks: Uint8Array[] = [];
  const reader = audioStream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const r2Config = await loadR2Config(client);
  if (!r2Config.ok) return;

  const objectKey = `voice-previews/${input.organizationId}/${input.voiceId}-${randomUUID()}.mp3`;
  const upload = await putR2Object(r2Config.config, objectKey, bytes, "audio/mpeg");
  if (!upload.ok) return;

  if (input.voiceRecordId) {
    const { data } = await client
      .from("customer_voices")
      .select("metadata")
      .eq("id", input.voiceRecordId)
      .maybeSingle<{ metadata: Record<string, unknown> | null }>();

    await client
      .from("customer_voices")
      .update({
        metadata: {
          ...(data?.metadata ?? {}),
          preview_url: upload.publicUrl,
          preview_generated_at: new Date().toISOString(),
        },
      })
      .eq("id", input.voiceRecordId);
  }
}
