import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";

type CredentialRow = {
  env_name: string;
  encrypted_value: string;
  value_preview: string;
};

export type UazapiCredentials = {
  baseUrl: string;
  adminToken: string;
  webhookSecret: string | null;
  webhookUrl: string | null;
};

const uazapiEnvNames = ["UAZAPI_BASE_URL", "UAZAPI_ADMIN_TOKEN", "UAZAPI_WEBHOOK_SECRET"];

export async function loadUazapiCredentials(client: SupabaseClient = createServiceClient()): Promise<UazapiCredentials> {
  const values = new Map<string, string>();
  const { data, error } = await client
    .from("integration_credentials")
    .select("env_name, encrypted_value, value_preview")
    .eq("scope", "platform")
    .eq("integration_id", "uazapi")
    .is("organization_id", null)
    .in("env_name", uazapiEnvNames)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Nao foi possivel carregar credenciais Uazapi: ${error.message}`);
  }

  for (const credential of (data ?? []) as CredentialRow[]) {
    if (!values.has(credential.env_name)) {
      values.set(credential.env_name, decryptCredential(credential));
    }
  }

  for (const envName of uazapiEnvNames) {
    const value = process.env[envName];

    if (value && !values.has(envName)) {
      values.set(envName, value);
    }
  }

  const baseUrl = normalizeBaseUrl(values.get("UAZAPI_BASE_URL") ?? "");
  const adminToken = values.get("UAZAPI_ADMIN_TOKEN")?.trim() ?? "";

  if (!baseUrl || !adminToken) {
    throw new Error("UAZAPI_BASE_URL ou UAZAPI_ADMIN_TOKEN nao configurados.");
  }

  return {
    baseUrl,
    adminToken,
    webhookSecret: values.get("UAZAPI_WEBHOOK_SECRET")?.trim() || process.env.UAZAPI_WEBHOOK_SECRET || null,
    webhookUrl: buildWebhookUrl(),
  };
}

function decryptCredential(credential: CredentialRow) {
  try {
    return decryptCredentialValue(credential.encrypted_value);
  } catch {
    return credential.value_preview;
  }
}

function normalizeBaseUrl(value: string) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value.trim());

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }

    return url.origin.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function buildWebhookUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  if (!appUrl) {
    return null;
  }

  return `${appUrl}/api/webhooks/uazapi`;
}
