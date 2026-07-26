import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { loadUazapiCredentials, type UazapiCredentials } from "@/lib/whatsapp/uazapi-credentials";
import { readWhatsappInstanceProfileImageUrl } from "@/lib/whatsapp/instance-profile-image";

type JsonRecord = Record<string, unknown>;

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  phone_normalized: string | null;
  phone_whatsapp_exists: boolean | null;
};

type BillingSettingsRow = {
  billing_whatsapp_agent_id: string | null;
};

type WhatsappInstanceRow = {
  id: string;
  status: string | null;
  instance_token_encrypted: string | null;
};

type WhatsappLookupTransport = {
  credentials: UazapiCredentials;
  token: string;
  instance: WhatsappInstanceRow;
};

type AvatarLookupResult = {
  profileImageUrl: string;
  source: string;
  providerData: unknown;
};

export type AdminUserWhatsappAvatarResult = {
  userId: string;
  phone: string | null;
  phoneNormalized: string | null;
  phoneWhatsappExists: boolean | null;
  avatarUrl: string | null;
  avatarSource: string | null;
  avatarSyncedAt: string | null;
  avatarSyncStatus: "synced" | "not_found";
  message: string;
};

export async function syncAdminUserWhatsappAvatar(input: {
  client: SupabaseClient;
  userId: string;
  actorId: string;
}): Promise<AdminUserWhatsappAvatarResult> {
  const profile = await loadProfile(input.client, input.userId);
  const phoneNormalized = normalizeBrazilPhone(profile.phone_normalized ?? profile.phone);

  if (!phoneNormalized) {
    throw new Error("Este usuario ainda nao possui WhatsApp salvo no cadastro.");
  }

  const transport = await loadWhatsappLookupTransport(input.client);
  const lookup = await lookupWhatsappAvatar(transport, phoneNormalized);
  const syncedAt = new Date().toISOString();

  const currentUser = await input.client.auth.admin.getUserById(input.userId);

  if (currentUser.error || !currentUser.data.user) {
    throw new Error(currentUser.error?.message ?? "Nao foi possivel carregar o usuario no Auth.");
  }

  const currentMetadata = readRecord(currentUser.data.user.user_metadata) ?? {};
  const avatarUrl = lookup ? normalizeProfileAvatarUrl(lookup.profileImageUrl) : null;
  const nextMetadata: JsonRecord = {
    ...currentMetadata,
    whatsapp_avatar_status: avatarUrl ? "synced" : "not_found",
    whatsapp_avatar_last_attempt_at: syncedAt,
    ...(avatarUrl
      ? {
          avatar_url: avatarUrl,
          avatar_source: "whatsapp_profile",
          whatsapp_avatar_url: avatarUrl,
          whatsapp_avatar_source: lookup?.source ?? "uazapi",
          whatsapp_avatar_synced_at: syncedAt,
        }
      : {}),
  };

  const updateResult = await input.client.auth.admin.updateUserById(input.userId, {
    user_metadata: nextMetadata,
  });

  if (updateResult.error) {
    throw new Error(`Nao foi possivel salvar a foto no perfil: ${updateResult.error.message}`);
  }

  if (avatarUrl) {
    await input.client
      .from("profiles")
      .update({
        phone_whatsapp_exists: true,
        phone_whatsapp_checked_at: syncedAt,
        updated_at: syncedAt,
      })
      .eq("id", input.userId);
  }

  await input.client.from("maintenance_audit_logs").insert({
    actor_id: input.actorId,
    event_type: avatarUrl ? "profile.whatsapp_avatar_synced" : "profile.whatsapp_avatar_not_found",
    target_table: "profiles",
    target_id: input.userId,
    metadata: {
      phonePreview: formatPhonePreview(phoneNormalized),
      whatsappInstanceId: transport.instance.id,
      source: lookup?.source ?? null,
      providerData: lookup ? sanitizeProviderData(lookup.providerData) : null,
    },
  });

  return {
    userId: input.userId,
    phone: profile.phone,
    phoneNormalized,
    phoneWhatsappExists: avatarUrl ? true : profile.phone_whatsapp_exists,
    avatarUrl,
    avatarSource: avatarUrl ? "whatsapp_profile" : readString(currentMetadata.avatar_source),
    avatarSyncedAt: avatarUrl ? syncedAt : null,
    avatarSyncStatus: avatarUrl ? "synced" : "not_found",
    message: avatarUrl
      ? "Foto do WhatsApp sincronizada no perfil do cliente."
      : "Nao encontramos uma foto publica para este WhatsApp. As iniciais continuam como fallback.",
  };
}

async function loadProfile(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("profiles")
    .select("id, email, full_name, phone, phone_normalized, phone_whatsapp_exists")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar o perfil: ${error.message}`);
  }

  if (!data) {
    throw new Error("Perfil do usuario nao encontrado.");
  }

  return data;
}

async function loadWhatsappLookupTransport(client: SupabaseClient): Promise<WhatsappLookupTransport> {
  const [credentials, settings] = await Promise.all([
    loadUazapiCredentials(client),
    loadBillingSettings(client),
  ]);
  const preferredInstance = settings?.billing_whatsapp_agent_id
    ? await loadPlatformWhatsappInstance(client, settings.billing_whatsapp_agent_id)
    : null;
  const instance = preferredInstance ?? await loadPlatformWhatsappInstance(client, null);

  if (!instance?.instance_token_encrypted || instance.status !== "connected") {
    throw new Error("Conecte um WhatsApp interno da ConnectyHub para buscar fotos dos clientes.");
  }

  const token = decryptCredentialValue(instance.instance_token_encrypted);

  return { credentials, token, instance };
}

async function loadBillingSettings(client: SupabaseClient) {
  const { data, error } = await client
    .from("platform_billing_settings")
    .select("billing_whatsapp_agent_id")
    .eq("setting_key", "default")
    .maybeSingle<BillingSettingsRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar configuracao de billing: ${error.message}`);
  }

  return data ?? null;
}

async function loadPlatformWhatsappInstance(client: SupabaseClient, agentId: string | null) {
  let query = client
    .from("whatsapp_instances")
    .select("id, status, instance_token_encrypted")
    .eq("provider", "uazapi")
    .eq("status", "connected")
    .contains("metadata", { admin_whatsapp: true, platform_whatsapp: true })
    .order("updated_at", { ascending: false })
    .limit(1);

  if (agentId) {
    query = query.contains("metadata", { agent_id: agentId });
  }

  const { data, error } = await query.maybeSingle<WhatsappInstanceRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar WhatsApp interno: ${error.message}`);
  }

  return data ?? null;
}

async function lookupWhatsappAvatar(transport: WhatsappLookupTransport, phoneNormalized: string): Promise<AvatarLookupResult | null> {
  const attempts = [
    {
      source: "chat_details",
      path: "/chat/details",
      body: {
        number: phoneNormalized,
        preview: true,
      },
    },
    {
      source: "contact_avatar",
      path: "/contact/avatar",
      body: {
        number: phoneNormalized,
      },
    },
  ];

  for (const attempt of attempts) {
    const response = await callUazapi(transport.credentials, attempt.path, {
      token: transport.token,
      body: attempt.body,
    });

    if (!response.ok) {
      continue;
    }

    const profileImageUrl = readWhatsappInstanceProfileImageUrl(response.data);

    if (profileImageUrl) {
      return {
        profileImageUrl,
        source: attempt.source,
        providerData: response.data,
      };
    }
  }

  return null;
}

async function callUazapi(
  credentials: UazapiCredentials,
  path: string,
  options: {
    body: unknown;
    token: string;
  },
) {
  const response = await fetch(`${credentials.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      token: options.token,
    },
    body: JSON.stringify(options.body),
    cache: "no-store",
  });
  const data = await readResponse(response);

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

async function readResponse(response: Response) {
  const text = await response.text().catch(() => "");

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function normalizeBrazilPhone(value: string | null | undefined) {
  let digits = String(value ?? "").replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  return digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits : null;
}

function normalizeProfileAvatarUrl(value: string | null | undefined) {
  const url = value?.trim();

  if (!url || url.length > 2048 || !/^https?:\/\//i.test(url)) {
    return null;
  }

  return url;
}

function formatPhonePreview(phoneNormalized: string) {
  return `${phoneNormalized.slice(0, 4)}****${phoneNormalized.slice(-4)}`;
}

function sanitizeProviderData(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeProviderData);
  }

  return Object.fromEntries(
    Object.entries(value as JsonRecord).map(([key, item]) => {
      const normalized = key.toLowerCase();

      if (normalized.includes("token") || normalized.includes("secret") || normalized.includes("qrcode")) {
        return [key, "[redacted]"];
      }

      if (typeof item === "string" && item.length > 500 && (normalized.includes("image") || normalized.includes("photo") || normalized.includes("picture"))) {
        return [key, "[redacted-image]"];
      }

      return [key, sanitizeProviderData(item)];
    }),
  );
}

function readRecord(value: unknown): JsonRecord | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
