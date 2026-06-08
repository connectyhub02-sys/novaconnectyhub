import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { loadUazapiCredentials, type UazapiCredentials } from "./uazapi-credentials";

type JsonRecord = Record<string, unknown>;

export type LeadAvatarSyncInstance = {
  id: string;
  instance_token_encrypted: string | null;
  metadata?: JsonRecord | null;
};

const profileImageKeys = [
  "profileImageUrl",
  "profile_image_url",
  "profilePictureUrl",
  "profile_picture_url",
  "profilePicUrl",
  "profile_pic_url",
  "pictureUrl",
  "picture_url",
  "photoUrl",
  "photo_url",
  "imageUrl",
  "image_url",
  "avatarUrl",
  "avatar_url",
  "profileImage",
  "profilePicture",
  "profilePic",
  "profilePicThumbObj",
  "imagePreview",
  "picture",
  "photo",
  "image",
  "avatar",
];

export function readLeadProfileImageUrl(value: unknown) {
  return findProfileImageUrl(value, profileImageKeys);
}

export function mergeLeadProfileImageMetadata(
  metadata: JsonRecord | null | undefined,
  input: {
    profileImageUrl: string;
    source: string;
    syncedAt?: string;
    providerChatId?: string | null;
    providerData?: unknown;
  },
) {
  const syncedAt = input.syncedAt ?? new Date().toISOString();

  return {
    ...(readRecord(metadata) ?? {}),
    profile_image_url: input.profileImageUrl,
    profile_image_synced_at: syncedAt,
    profile_image_source: input.source,
    profile_image_sync_status: "synced",
    ...(input.providerChatId ? { profile_image_provider_chat_id: input.providerChatId } : {}),
    ...(input.providerData ? { last_profile_image_response: sanitizeProviderData(input.providerData) } : {}),
  } satisfies JsonRecord;
}

export async function syncLeadAvatarFromUazapi(input: {
  client: SupabaseClient;
  leadId: string;
  phoneNumber: string | null;
  providerChatId?: string | null;
  instance: LeadAvatarSyncInstance | null;
  existingMetadata?: JsonRecord | null;
  force?: boolean;
}) {
  const baseMetadata = readRecord(input.existingMetadata) ?? {};

  if (!input.force && readLeadProfileImageUrl(baseMetadata)) {
    return null;
  }

  if (!input.force && !shouldAttemptAvatarSync(baseMetadata)) {
    return null;
  }

  const token = decryptInstanceToken(input.instance);
  const phoneNumber = normalizePhone(input.phoneNumber);

  if (!token || !phoneNumber) {
    return null;
  }

  const attemptedAt = new Date().toISOString();

  try {
    const credentials = await loadUazapiCredentials(input.client);
    const avatar = await getConnectedAvatarData(credentials, token, phoneNumber);

    if (avatar?.profileImageUrl) {
      const nextMetadata = mergeLeadProfileImageMetadata(baseMetadata, {
        profileImageUrl: avatar.profileImageUrl,
        source: avatar.source,
        syncedAt: attemptedAt,
        providerChatId: input.providerChatId,
        providerData: avatar.data,
      });

      await updateLeadMetadata(input.client, input.leadId, nextMetadata);
      return nextMetadata;
    }
  } catch {
    // Avatar sync must never block webhook ingest or CRM loading.
  }

  const attemptedMetadata = {
    ...baseMetadata,
    profile_image_sync_status: "not_found",
    profile_image_last_attempt_at: attemptedAt,
  } satisfies JsonRecord;

  await updateLeadMetadata(input.client, input.leadId, attemptedMetadata);
  return attemptedMetadata;
}

function shouldAttemptAvatarSync(metadata: JsonRecord) {
  const lastAttempt = readString(metadata.profile_image_last_attempt_at);

  if (!lastAttempt) {
    return true;
  }

  const parsed = new Date(lastAttempt).getTime();

  if (!Number.isFinite(parsed)) {
    return true;
  }

  return Date.now() - parsed > 6 * 60 * 60 * 1000;
}

async function getConnectedAvatarData(credentials: UazapiCredentials, token: string, phoneNumber: string) {
  const attempts = [
    {
      source: "chat_details",
      path: "/chat/details",
      body: {
        number: phoneNumber,
        preview: true,
      },
    },
    {
      source: "contact_avatar",
      path: "/contact/avatar",
      body: {
        number: phoneNumber,
      },
    },
  ];

  for (const attempt of attempts) {
    const response = await callUazapi(credentials, attempt.path, {
      method: "POST",
      token,
      body: attempt.body,
    });
    const profileImageUrl = response.ok ? readLeadProfileImageUrl(response.data) : null;

    if (profileImageUrl) {
      return {
        source: attempt.source,
        data: response.data,
        profileImageUrl,
      };
    }
  }

  return null;
}

async function callUazapi(
  credentials: UazapiCredentials,
  path: string,
  options: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    token?: string;
  },
) {
  const response = await fetch(`${credentials.baseUrl}${path}`, {
    method: options.method,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { token: options.token } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
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

async function updateLeadMetadata(client: SupabaseClient, leadId: string, metadata: JsonRecord) {
  await client
    .from("leads")
    .update({ metadata })
    .eq("id", leadId);
}

function decryptInstanceToken(instance: LeadAvatarSyncInstance | null) {
  if (!instance?.instance_token_encrypted) {
    return null;
  }

  try {
    return decryptCredentialValue(instance.instance_token_encrypted);
  } catch {
    return null;
  }
}

function normalizeLeadProfileImageUrl(value: string | null | undefined) {
  const url = value?.trim();

  if (!url) {
    return null;
  }

  if (/^https?:\/\//i.test(url) || url.startsWith("data:image/")) {
    return url;
  }

  const compactBase64 = url.replace(/\s+/g, "");

  if (/^[A-Za-z0-9+/=]+$/.test(compactBase64) && compactBase64.length > 120) {
    return `data:image/jpeg;base64,${compactBase64}`;
  }

  return null;
}

function findProfileImageUrl(value: unknown, keys: string[], depth = 0, insideProfileKey = false): string | null {
  if (depth > 5) {
    return null;
  }

  if (typeof value === "string" && depth > 0) {
    return insideProfileKey ? normalizeLeadProfileImageUrl(value) : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findProfileImageUrl(item, keys, depth + 1, insideProfileKey);

      if (found) return found;
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const lowerKeys = new Set(keys.map((key) => key.toLowerCase()));

  for (const [key, item] of Object.entries(value)) {
    if (lowerKeys.has(key.toLowerCase())) {
      const direct = normalizeLeadProfileImageUrl(readString(item)) ?? findProfileImageUrl(item, keys, depth + 1, true);

      if (direct) return direct;
    }
  }

  for (const item of Object.values(value)) {
    const found = findProfileImageUrl(item, keys, depth + 1, false);

    if (found) return found;
  }

  return null;
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

function normalizePhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";

  return digits.length >= 8 ? digits : null;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
