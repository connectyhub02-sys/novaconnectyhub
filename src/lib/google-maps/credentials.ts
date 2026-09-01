import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";

type CredentialRow = {
  env_name: string;
  encrypted_value: string;
  value_preview: string;
};

export type GoogleMapsCredentials = {
  browserApiKey: string;
  serverApiKey: string;
  mapId: string | null;
  browserConfigured: boolean;
  serverConfigured: boolean;
};

export const googleMapsCredentialNames = [
  "GOOGLE_MAPS_BROWSER_API_KEY",
  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  "GOOGLE_MAPS_SERVER_API_KEY",
  "GOOGLE_MAPS_API_KEY",
  "GOOGLE_MAPS_MAP_ID",
  "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID",
];

export async function loadGoogleMapsCredentials(
  client: SupabaseClient = createServiceClient(),
): Promise<GoogleMapsCredentials> {
  const values = new Map<string, string>();

  const { data, error } = await client
    .from("integration_credentials")
    .select("env_name, encrypted_value, value_preview")
    .eq("scope", "platform")
    .eq("integration_id", "google-maps")
    .is("organization_id", null)
    .in("env_name", googleMapsCredentialNames)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Nao foi possivel carregar credenciais Google Maps: ${error.message}`);
  }

  for (const credential of (data ?? []) as CredentialRow[]) {
    if (!values.has(credential.env_name)) {
      values.set(credential.env_name, decryptCredential(credential));
    }
  }

  for (const envName of googleMapsCredentialNames) {
    const value = process.env[envName];

    if (value && !values.has(envName)) {
      values.set(envName, value);
    }
  }

  const browserApiKey = (
    values.get("GOOGLE_MAPS_BROWSER_API_KEY")
    ?? values.get("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY")
    ?? ""
  ).trim();
  const serverApiKey = (
    values.get("GOOGLE_MAPS_SERVER_API_KEY")
    ?? values.get("GOOGLE_MAPS_API_KEY")
    ?? ""
  ).trim();
  const mapId = (
    values.get("GOOGLE_MAPS_MAP_ID")
    ?? values.get("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID")
    ?? ""
  ).trim() || null;

  return {
    browserApiKey,
    serverApiKey,
    mapId,
    browserConfigured: Boolean(browserApiKey),
    serverConfigured: Boolean(serverApiKey),
  };
}

function decryptCredential(credential: CredentialRow) {
  try {
    return decryptCredentialValue(credential.encrypted_value);
  } catch {
    return credential.value_preview;
  }
}
