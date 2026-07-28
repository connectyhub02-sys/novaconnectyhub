import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";

type CredentialRow = {
  env_name: string | null;
  encrypted_value: string | null;
};

export type MetaWebhookRuntimeConfig = {
  appSecret: string | null;
  verifyToken: string | null;
};

const metaWebhookRuntimeCredentialNames = [
  "META_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
  "META_VERIFY_TOKEN",
];

export async function loadMetaWebhookRuntimeConfig(input: {
  client?: SupabaseClient;
} = {}): Promise<MetaWebhookRuntimeConfig> {
  const envAppSecret = readEnv("META_APP_SECRET");
  const envVerifyToken = readEnv("META_WEBHOOK_VERIFY_TOKEN") || readEnv("META_VERIFY_TOKEN");

  if (envAppSecret && envVerifyToken) {
    return {
      appSecret: envAppSecret,
      verifyToken: envVerifyToken,
    };
  }

  const vault = await loadMetaRuntimeCredentialMap(input.client);

  return {
    appSecret: envAppSecret || vault.get("META_APP_SECRET") || null,
    verifyToken: envVerifyToken
      || vault.get("META_WEBHOOK_VERIFY_TOKEN")
      || vault.get("META_VERIFY_TOKEN")
      || null,
  };
}

async function loadMetaRuntimeCredentialMap(client?: SupabaseClient) {
  const credentials = new Map<string, string>();

  try {
    const serviceClient = client ?? createServiceClient();
    const { data, error } = await serviceClient
      .from("integration_credentials")
      .select("env_name, encrypted_value")
      .eq("scope", "platform")
      .eq("integration_id", "meta")
      .is("organization_id", null)
      .in("env_name", metaWebhookRuntimeCredentialNames);

    if (error) {
      return credentials;
    }

    for (const row of (data ?? []) as CredentialRow[]) {
      if (!row.env_name || !row.encrypted_value || credentials.has(row.env_name)) {
        continue;
      }

      try {
        credentials.set(row.env_name, decryptCredentialValue(row.encrypted_value));
      } catch {
        // Environment fallback above keeps public webhooks usable during key rotation.
      }
    }
  } catch {
    return credentials;
  }

  return credentials;
}

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}
