import "server-only";

import type { UazapiCredentials } from "./uazapi-credentials";

type JsonRecord = Record<string, unknown>;

export type WhatsappInstanceProfileImageResult = {
  profileImageUrl: string | null;
  source: string | null;
  profileData: unknown;
  avatarData: unknown;
};

const profileImageKeys = [
  "profileImageUrl",
  "profile_image_url",
  "profilePictureUrl",
  "profile_picture_url",
  "profilePicUrl",
  "profile_pic_url",
  "profilePicThumbObj",
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
  "imagePreview",
  "picture",
  "photo",
  "image",
  "avatar",
];

export function readWhatsappInstanceProfileImageUrl(value: unknown) {
  return findProfileImageUrl(value, profileImageKeys);
}

export function buildWhatsappInstanceProfileImageMetadata(input: {
  profileImageUrl?: string | null;
  source?: string | null;
  syncedAt: string;
  providerData?: unknown;
  profileData?: unknown;
  avatarData?: unknown;
}) {
  if (!input.profileImageUrl) {
    return {
      profile_image_sync_status: "not_found",
      profile_image_last_attempt_at: input.syncedAt,
    } satisfies JsonRecord;
  }

  return {
    profile_image_url: input.profileImageUrl,
    profile_image_synced_at: input.syncedAt,
    profile_image_last_attempt_at: input.syncedAt,
    profile_image_source: input.source ?? "uazapi",
    profile_image_sync_status: "synced",
    ...(input.providerData ? { last_profile_image_provider_payload: sanitizeProviderData(input.providerData) } : {}),
    ...(input.profileData ? { last_profile_response: sanitizeProviderData(input.profileData) } : {}),
    ...(input.avatarData ? { last_avatar_response: sanitizeProviderData(input.avatarData) } : {}),
  } satisfies JsonRecord;
}

export async function getWhatsappInstanceProfileImage(input: {
  credentials: UazapiCredentials;
  token: string;
  phoneNumber?: string | null;
  providerData?: unknown;
}): Promise<WhatsappInstanceProfileImageResult> {
  const profileData = await getConnectedProfileData(input.credentials, input.token);
  const avatarData = input.phoneNumber
    ? await getConnectedAvatarData(input.credentials, input.token, input.phoneNumber)
    : null;
  const profileImageUrl =
    readWhatsappInstanceProfileImageUrl(input.providerData) ??
    readWhatsappInstanceProfileImageUrl(profileData?.data) ??
    readWhatsappInstanceProfileImageUrl(avatarData?.data);

  return {
    profileImageUrl,
    source: profileImageUrl
      ? readWhatsappInstanceProfileImageUrl(input.providerData)
        ? "provider_instance_payload"
        : avatarData?.data && readWhatsappInstanceProfileImageUrl(avatarData.data)
          ? avatarData.source
          : profileData?.source ?? "uazapi_profile"
      : null,
    profileData: profileData?.data ?? null,
    avatarData: avatarData?.data ?? null,
  };
}

async function getConnectedProfileData(credentials: UazapiCredentials, token: string) {
  const attempts: Array<{ path: string; method: "GET" | "POST" }> = [
    { path: "/business/get/profile", method: "POST" },
    { path: "/instance/profile", method: "GET" },
    { path: "/profile", method: "GET" },
  ];
  let firstOkData: unknown = null;

  for (const attempt of attempts) {
    const result = await callUazapi(credentials, attempt.path, {
      method: attempt.method,
      token,
    });

    if (!result.ok) {
      continue;
    }

    firstOkData ??= result.data;

    if (
      readWhatsappInstanceProfileImageUrl(result.data) ||
      findString(result.data, ["profileName", "displayName", "businessName", "name"])
    ) {
      return {
        source: attempt.path,
        data: result.data,
      };
    }
  }

  return firstOkData ? { source: "profile_fallback", data: firstOkData } : null;
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
    const result = await callUazapi(credentials, attempt.path, {
      method: "POST",
      token,
      body: attempt.body,
    });

    if (result.ok && readWhatsappInstanceProfileImageUrl(result.data)) {
      return {
        source: attempt.source,
        data: result.data,
      };
    }
  }

  return null;
}

async function callUazapi(
  credentials: UazapiCredentials,
  path: string,
  options: {
    method: "GET" | "POST";
    body?: unknown;
    token: string;
  },
) {
  const response = await fetch(`${credentials.baseUrl}${path}`, {
    method: options.method,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      token: options.token,
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

function findProfileImageUrl(value: unknown, keys: string[], depth = 0, insideProfileKey = false): string | null {
  if (depth > 5) {
    return null;
  }

  if (typeof value === "string" && depth > 0) {
    return insideProfileKey ? normalizeProfileImageUrl(value) : null;
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
      const direct = normalizeProfileImageUrl(readString(item)) ?? findProfileImageUrl(item, keys, depth + 1, true);

      if (direct) return direct;
    }
  }

  for (const item of Object.values(value)) {
    const found = findProfileImageUrl(item, keys, depth + 1, false);

    if (found) return found;
  }

  return null;
}

function normalizeProfileImageUrl(value: string | null | undefined) {
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

function findString(value: unknown, keys: string[]) {
  if (!isRecord(value)) {
    return null;
  }

  for (const key of keys) {
    const item = value[key];

    if (typeof item === "string" && item.trim()) {
      return item.trim();
    }
  }

  return null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
