import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";

export type GeminiCredentials = {
  apiKey: string;
  model: string;
};

const defaultGeminiModel = "gemini-2.5-flash";

const geminiCredentialNames = [
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_AI_API_KEY",
  "GEMINI_DEFAULT_MODEL",
];

export { defaultGeminiModel, geminiCredentialNames };

export async function loadGeminiCredentials(
  client: SupabaseClient = createServiceClient(),
): Promise<GeminiCredentials> {
  const values = new Map<string, string>();

  const { data, error } = await client
    .from("integration_credentials")
    .select("env_name, encrypted_value, value_preview")
    .eq("scope", "platform")
    .eq("integration_id", "gemini")
    .is("organization_id", null)
    .in("env_name", geminiCredentialNames)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Nao foi possivel carregar credenciais Gemini: ${error.message}`);
  }

  for (const credential of (data ?? []) as Array<{
    env_name: string;
    encrypted_value: string;
    value_preview: string;
  }>) {
    if (values.has(credential.env_name)) {
      continue;
    }

    try {
      values.set(credential.env_name, decryptCredentialValue(credential.encrypted_value));
    } catch {
      values.set(credential.env_name, credential.value_preview);
    }
  }

  for (const name of geminiCredentialNames) {
    const value = process.env[name];
    if (value && !values.has(name)) values.set(name, value);
  }

  const apiKey =
    values.get("GEMINI_API_KEY") ??
    values.get("GOOGLE_GENERATIVE_AI_API_KEY") ??
    values.get("GOOGLE_AI_API_KEY") ??
    "";

  if (!apiKey.trim()) {
    throw new Error("Gemini nao configurado. Verifique a sala de manutencao.");
  }

  return {
    apiKey: apiKey.trim(),
    model: normalizeGeminiModel(values.get("GEMINI_DEFAULT_MODEL") ?? defaultGeminiModel),
  };
}

export function normalizeGeminiModel(value: string) {
  return value.trim().replace(/^models\//, "") || defaultGeminiModel;
}
