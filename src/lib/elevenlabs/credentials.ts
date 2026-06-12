import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";

export type ElevenLabsCredentials = {
  apiKey: string;
  defaultVoiceId: string;
  defaultModelId: string;
  outputFormat: "mp3_44100_128" | "mp3_44100_96" | "mp3_44100_64" | "mp3_24000_48" | "mp3_22050_32";
};

type CredentialRow = {
  env_name: string;
  encrypted_value: string;
  value_preview: string;
};

const elevenLabsEnvNames = [
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_DEFAULT_VOICE_ID",
  "ELEVENLABS_DEFAULT_MODEL_ID",
  "ELEVENLABS_OUTPUT_FORMAT",
];

const fallbackVoiceId = "JBFqnCBsd6RMkjVDRZzb";
const fallbackModelId = "eleven_multilingual_v2";
const fallbackOutputFormat = "mp3_44100_128";
const allowedOutputFormats = new Set<ElevenLabsCredentials["outputFormat"]>([
  "mp3_44100_128",
  "mp3_44100_96",
  "mp3_44100_64",
  "mp3_24000_48",
  "mp3_22050_32",
]);

export async function loadElevenLabsCredentials(client: SupabaseClient = createServiceClient()): Promise<ElevenLabsCredentials> {
  const values = new Map<string, string>();
  const { data, error } = await client
    .from("integration_credentials")
    .select("env_name, encrypted_value, value_preview")
    .eq("scope", "platform")
    .eq("integration_id", "elevenlabs")
    .is("organization_id", null)
    .in("env_name", elevenLabsEnvNames)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Nao foi possivel carregar as credenciais de voz: ${error.message}`);
  }

  for (const credential of (data ?? []) as CredentialRow[]) {
    if (values.has(credential.env_name)) {
      continue;
    }

    try {
      values.set(credential.env_name, decryptCredentialValue(credential.encrypted_value));
    } catch {
      values.set(credential.env_name, credential.value_preview);
    }
  }

  for (const envName of elevenLabsEnvNames) {
    const value = process.env[envName];

    if (value && !values.has(envName)) {
      values.set(envName, value);
    }
  }

  const apiKey = values.get("ELEVENLABS_API_KEY")?.trim() ?? "";

  if (!apiKey) {
    throw new Error("Configure a chave de voz na sala de manutencao antes de gerar audio.");
  }

  const outputFormat = normalizeOutputFormat(values.get("ELEVENLABS_OUTPUT_FORMAT"));

  return {
    apiKey,
    defaultVoiceId: values.get("ELEVENLABS_DEFAULT_VOICE_ID")?.trim() || fallbackVoiceId,
    defaultModelId: values.get("ELEVENLABS_DEFAULT_MODEL_ID")?.trim() || fallbackModelId,
    outputFormat,
  };
}

function normalizeOutputFormat(value: string | undefined) {
  const normalized = value?.trim() as ElevenLabsCredentials["outputFormat"] | undefined;

  return normalized && allowedOutputFormats.has(normalized) ? normalized : fallbackOutputFormat;
}
