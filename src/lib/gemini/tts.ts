import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { loadR2Config, putR2Object } from "@/lib/storage/r2";
import { loadGeminiCredentials } from "./credentials";

type JsonRecord = Record<string, unknown>;

export type GeminiTtsVoice = {
  voiceId: string;
  voiceName: string;
  displayName: string;
  tone: string;
  useCase: string;
};

export type GenerateGeminiAudioInput = {
  organizationId: string;
  text: string;
  userId?: string | null;
  voiceId?: string | null;
  voiceName?: string | null;
  modelId?: string | null;
  source?: string;
  metadata?: JsonRecord;
  client?: SupabaseClient;
};

export type GeneratedGeminiAudio = {
  mediaId: string | null;
  audioUrl: string;
  objectKey: string;
  bytesSize: number;
  voiceId: string;
  modelId: string;
  outputFormat: "wav_24000_16_mono";
  text: string;
};

export const geminiTtsVoicePrefix = "gemini:";

export const geminiTtsVoices: GeminiTtsVoice[] = [
  { voiceId: "gemini:kore", voiceName: "Kore", displayName: "Voz Economica - Clara", tone: "firme", useCase: "atendimento direto" },
  { voiceId: "gemini:puck", voiceName: "Puck", displayName: "Voz Economica - Energia", tone: "animada", useCase: "vendas e reativacao" },
  { voiceId: "gemini:zephyr", voiceName: "Zephyr", displayName: "Voz Economica - Leve", tone: "clara", useCase: "respostas rapidas" },
  { voiceId: "gemini:charon", voiceName: "Charon", displayName: "Voz Economica - Consultiva", tone: "informativa", useCase: "explicacoes" },
  { voiceId: "gemini:aoede", voiceName: "Aoede", displayName: "Voz Economica - Natural", tone: "arejada", useCase: "conversa comum" },
  { voiceId: "gemini:iapetus", voiceName: "Iapetus", displayName: "Voz Economica - Precisa", tone: "limpa", useCase: "suporte e pos-venda" },
  { voiceId: "gemini:callirrhoe", voiceName: "Callirrhoe", displayName: "Voz Economica - Calma", tone: "tranquila", useCase: "acolhimento" },
  { voiceId: "gemini:orus", voiceName: "Orus", displayName: "Voz Economica - Autoridade", tone: "firme", useCase: "negociacao" },
];

const maxAudioTextLength = 4800;
const outputFormat = "wav_24000_16_mono" as const;
const pcmSampleRate = 24000;
const pcmChannels = 1;
const pcmSampleWidthBytes = 2;
const maxAttempts = 2;

export async function generateGeminiAudio(input: GenerateGeminiAudioInput): Promise<GeneratedGeminiAudio> {
  const text = normalizeAudioText(input.text);

  if (!text) {
    throw new Error("Escreva a mensagem antes de gerar audio.");
  }

  const client = input.client ?? createServiceClient();
  const credentials = await loadGeminiCredentials(client);
  const r2Config = await loadR2Config(client);

  if (!r2Config.ok) {
    throw new Error(r2Config.error);
  }

  const voice = resolveGeminiTtsVoice(input.voiceId, input.voiceName);
  const modelId = input.modelId?.trim() || credentials.ttsModel;
  const pcmBytes = await requestGeminiPcmAudio({
    apiKey: credentials.apiKey,
    modelId,
    voiceName: voice.voiceName,
    text,
  });
  const audioBytes = wrapPcmAsWav(pcmBytes);
  const now = new Date();
  const objectKey = `generated-media/gemini/audio/${input.organizationId}/${now.getTime()}-${randomUUID()}.wav`;
  const upload = await putR2Object(r2Config.config, objectKey, audioBytes, "audio/wav");

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
      provider: "gemini",
      source: input.source ?? "whatsapp_agent",
      voiceId: voice.voiceId,
      voiceName: voice.voiceName,
      modelId,
      outputFormat,
      generatedBy: input.userId ?? null,
      generatedAt: now.toISOString(),
    },
  });

  return {
    mediaId,
    audioUrl: upload.publicUrl,
    objectKey: upload.objectKey,
    bytesSize: upload.bytesSize,
    voiceId: voice.voiceId,
    modelId,
    outputFormat,
    text,
  };
}

export function isGeminiTtsVoiceId(value: string | null | undefined) {
  return Boolean(value?.trim().toLowerCase().startsWith(geminiTtsVoicePrefix));
}

export function resolveGeminiTtsVoice(voiceId?: string | null, voiceName?: string | null) {
  const normalizedId = voiceId?.trim().toLowerCase();
  const byId = normalizedId ? geminiTtsVoices.find((voice) => voice.voiceId === normalizedId) : null;

  if (byId) {
    return byId;
  }

  const normalizedVoiceName = voiceName?.trim().toLowerCase();
  const byVoiceName = normalizedVoiceName
    ? geminiTtsVoices.find((voice) => voice.voiceName.toLowerCase() === normalizedVoiceName)
    : null;

  return byVoiceName ?? geminiTtsVoices[0];
}

async function requestGeminiPcmAudio(input: {
  apiKey: string;
  modelId: string;
  voiceName: string;
  text: string;
}) {
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.modelId)}:generateContent`);
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": input.apiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: buildGeminiTtsPrompt(input.text),
          }],
        }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: input.voiceName,
              },
            },
          },
        },
      }),
      cache: "no-store",
    });
    const data = await readProviderResponse(response);

    if (response.ok) {
      const base64Audio = extractGeminiInlineAudio(data);

      if (base64Audio) {
        return Uint8Array.from(Buffer.from(base64Audio, "base64"));
      }

      lastError = "Gemini respondeu sem audio.";
    } else {
      lastError = readProviderError(data) ?? `Gemini TTS respondeu status ${response.status}.`;
    }

    if (attempt < maxAttempts && response.status >= 500) {
      await sleep(250);
      continue;
    }

    break;
  }

  throw new Error(lastError ?? "Nao foi possivel gerar audio com Gemini.");
}

function buildGeminiTtsPrompt(text: string) {
  return [
    "Synthesize speech for the transcript below. Read only the transcript; do not read these instructions.",
    "Use natural Brazilian Portuguese pacing, warm commercial tone, and short WhatsApp-style delivery.",
    "TRANSCRIPT:",
    text,
  ].join("\n");
}

function extractGeminiInlineAudio(value: unknown) {
  const candidates = readRecord(value)?.candidates;

  if (!Array.isArray(candidates)) {
    return null;
  }

  for (const candidate of candidates) {
    const parts = readRecord(readRecord(candidate)?.content)?.parts;

    if (!Array.isArray(parts)) {
      continue;
    }

    for (const part of parts) {
      const record = readRecord(part);
      const inlineData = readRecord(record?.inlineData) ?? readRecord(record?.inline_data);
      const data = inlineData?.data;

      if (typeof data === "string" && data.trim()) {
        return data.trim();
      }
    }
  }

  return null;
}

function wrapPcmAsWav(pcmBytes: Uint8Array) {
  const header = Buffer.alloc(44);
  const byteRate = pcmSampleRate * pcmChannels * pcmSampleWidthBytes;
  const blockAlign = pcmChannels * pcmSampleWidthBytes;
  const dataLength = pcmBytes.byteLength;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(pcmChannels, 22);
  header.writeUInt32LE(pcmSampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(pcmSampleWidthBytes * 8, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);

  return new Uint8Array(Buffer.concat([header, Buffer.from(pcmBytes)]));
}

function normalizeAudioText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxAudioTextLength);
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
      provider: "gemini",
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

async function readProviderResponse(response: Response) {
  const text = await response.text().catch(() => "");

  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readProviderError(value: unknown) {
  return findString(value, ["error", "message", "detail"]);
}

function findString(value: unknown, keys: string[]): string | null {
  const lowerKeys = new Set(keys.map((key) => key.toLowerCase()));
  const found = findValue(value, (key, item) => lowerKeys.has(key.toLowerCase()) && typeof item === "string" && item.trim().length > 0);
  return typeof found === "string" ? found.trim() : null;
}

function findValue(value: unknown, predicate: (key: string, value: unknown) => boolean): unknown {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValue(item, predicate);
      if (found) return found;
    }
    return null;
  }

  for (const [key, item] of Object.entries(value as JsonRecord)) {
    if (predicate(key, item)) return item;

    const found = findValue(item, predicate);
    if (found) return found;
  }

  return null;
}

function readRecord(value: unknown): JsonRecord | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
