import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

type EmailAvatarCandidate = {
  source: "oauth_profile" | "email_gravatar";
  url: string;
};

export type AuthUserAvatarState = {
  user: User;
  metadata: JsonRecord;
  avatarUrl: string | null;
  avatarSource: string | null;
  whatsappAvatarUrl: string | null;
  whatsappAvatarStatus: string | null;
  whatsappAvatarSyncedAt: string | null;
};

const avatarAutoSourcePrefix = "email_";
const whatsappRetryWindowMs = 6 * 60 * 60 * 1000;
const whatsappRefreshWindowMs = 24 * 60 * 60 * 1000;
const emailRetryWindowMs = 24 * 60 * 60 * 1000;

export async function loadAuthUserAvatarState(
  client: SupabaseClient,
  userId: string,
): Promise<AuthUserAvatarState | null> {
  const { data, error } = await client.auth.admin.getUserById(userId);

  if (error || !data.user) {
    return null;
  }

  const metadata = readRecord(data.user.user_metadata) ?? {};

  return {
    user: data.user,
    metadata,
    avatarUrl: readAuthUserAvatarUrl(data.user),
    avatarSource: readAuthUserAvatarSource(metadata),
    whatsappAvatarUrl: normalizeProfileAvatarUrl(readString(metadata.whatsapp_avatar_url)),
    whatsappAvatarStatus: readString(metadata.whatsapp_avatar_status),
    whatsappAvatarSyncedAt: readString(metadata.whatsapp_avatar_synced_at),
  };
}

export function readAuthUserAvatarUrl(value: User | unknown) {
  const user = isAuthUser(value) ? value : null;
  const metadata = user ? readRecord(user.user_metadata) ?? {} : readRecord(value) ?? {};
  const candidate =
    readString(metadata.avatar_url) ??
    readString(metadata.whatsapp_avatar_url) ??
    readString(metadata.picture) ??
    readString(metadata.avatarUrl) ??
    readString(metadata.profile_image_url) ??
    readString(metadata.profileImageUrl) ??
    readIdentityAvatarUrl(user);

  return normalizeProfileAvatarUrl(candidate);
}

export function readAuthUserAvatarSource(value: User | unknown) {
  const metadata = isAuthUser(value) ? readRecord(value.user_metadata) ?? {} : readRecord(value) ?? {};
  return readString(metadata.avatar_source)
    ?? (normalizeProfileAvatarUrl(readString(metadata.whatsapp_avatar_url)) ? "whatsapp_profile" : null)
    ?? readString(metadata.email_avatar_source);
}

export function readAuthUserWhatsappAvatarSyncedAt(value: User | unknown) {
  const metadata = isAuthUser(value) ? readRecord(value.user_metadata) ?? {} : readRecord(value) ?? {};
  return readString(metadata.whatsapp_avatar_synced_at);
}

export function readAuthUserWhatsappAvatarStatus(value: User | unknown) {
  const metadata = isAuthUser(value) ? readRecord(value.user_metadata) ?? {} : readRecord(value) ?? {};
  return readString(metadata.whatsapp_avatar_status);
}

export function shouldAttemptWhatsappAvatarSync(
  metadata: JsonRecord,
  options: { force?: boolean } = {},
) {
  if (options.force) {
    return true;
  }

  const currentSource = readAuthUserAvatarSource(metadata);

  if (currentSource === "manual_upload") {
    return false;
  }

  const status = readString(metadata.whatsapp_avatar_status);
  const whatsappAvatarUrl = normalizeProfileAvatarUrl(readString(metadata.whatsapp_avatar_url));

  if (
    status === "synced"
    && whatsappAvatarUrl
    && isRecentIso(readString(metadata.whatsapp_avatar_synced_at), whatsappRefreshWindowMs)
  ) {
    return false;
  }

  if (status === "not_found" && isRecentIso(readString(metadata.whatsapp_avatar_last_attempt_at), whatsappRetryWindowMs)) {
    return false;
  }

  return true;
}

export async function syncAuthUserWhatsappAvatar(input: {
  client: SupabaseClient;
  userId: string;
  avatarUrl: string | null;
  providerSource?: string | null;
  syncedAt?: string;
}) {
  const state = await loadAuthUserAvatarState(input.client, input.userId);

  if (!state) {
    return null;
  }

  const syncedAt = input.syncedAt ?? new Date().toISOString();
  const avatarUrl = normalizeProfileAvatarUrl(input.avatarUrl);
  const canReplaceDisplayAvatar = Boolean(avatarUrl && canReplaceAvatarSource(state.metadata, "whatsapp_profile"));
  const nextMetadata: JsonRecord = {
    ...state.metadata,
    whatsapp_avatar_status: avatarUrl ? "synced" : "not_found",
    whatsapp_avatar_last_attempt_at: syncedAt,
    ...(avatarUrl
      ? {
          whatsapp_avatar_url: avatarUrl,
          whatsapp_avatar_source: input.providerSource ?? "uazapi",
          whatsapp_avatar_synced_at: syncedAt,
        }
      : {}),
    ...(canReplaceDisplayAvatar
      ? {
          avatar_url: avatarUrl,
          avatar_source: "whatsapp_profile",
          avatar_synced_at: syncedAt,
        }
      : {}),
  };

  const updateResult = await input.client.auth.admin.updateUserById(input.userId, {
    user_metadata: nextMetadata,
  });

  if (updateResult.error) {
    return null;
  }

  return canReplaceDisplayAvatar ? avatarUrl : state.avatarUrl;
}

export async function syncAuthUserEmailAvatarIfMissing(input: {
  client: SupabaseClient;
  userId: string;
  email?: string | null;
  state?: AuthUserAvatarState | null;
}) {
  const state = input.state ?? await loadAuthUserAvatarState(input.client, input.userId);

  if (!state) {
    return null;
  }

  if (state.avatarUrl) {
    return state.avatarUrl;
  }

  if (isRecentIso(readString(state.metadata.email_avatar_last_attempt_at), emailRetryWindowMs)) {
    return null;
  }

  const syncedAt = new Date().toISOString();
  const candidate =
    resolveIdentityAvatarCandidate(state.user) ??
    await lookupPublicGravatarAvatar(input.email ?? state.user.email);

  if (!candidate) {
    await input.client.auth.admin.updateUserById(input.userId, {
      user_metadata: {
        ...state.metadata,
        email_avatar_status: "not_found",
        email_avatar_last_attempt_at: syncedAt,
      },
    });
    return null;
  }

  const nextMetadata: JsonRecord = {
    ...state.metadata,
    avatar_url: candidate.url,
    avatar_source: candidate.source,
    avatar_synced_at: syncedAt,
    email_avatar_url: candidate.url,
    email_avatar_source: candidate.source,
    email_avatar_status: "synced",
    email_avatar_synced_at: syncedAt,
    email_avatar_last_attempt_at: syncedAt,
  };

  const updateResult = await input.client.auth.admin.updateUserById(input.userId, {
    user_metadata: nextMetadata,
  });

  return updateResult.error ? null : candidate.url;
}

export function normalizeProfileAvatarUrl(value: string | null | undefined) {
  const url = value?.trim();

  if (!url || url.length > 2048 || !/^https?:\/\//i.test(url)) {
    return null;
  }

  return url;
}

function canReplaceAvatarSource(metadata: JsonRecord, nextSource: "whatsapp_profile" | "oauth_profile" | "email_gravatar") {
  const currentSource = readAuthUserAvatarSource(metadata);

  if (!currentSource) {
    return true;
  }

  if (currentSource === "manual_upload") {
    return false;
  }

  if (nextSource === "whatsapp_profile") {
    return true;
  }

  return currentSource.startsWith(avatarAutoSourcePrefix) || currentSource === "oauth_profile";
}

function resolveIdentityAvatarCandidate(user: User): EmailAvatarCandidate | null {
  const url = readIdentityAvatarUrl(user);
  return url ? { source: "oauth_profile", url } : null;
}

function readIdentityAvatarUrl(user: User | null) {
  const identities = Array.isArray(user?.identities) ? user.identities : [];

  for (const identity of identities) {
    const data = readRecord(identity?.identity_data) ?? {};
    const candidate =
      readString(data.avatar_url) ??
      readString(data.picture) ??
      readString(data.avatarUrl) ??
      readString(data.profile_image_url) ??
      readString(data.profileImageUrl);
    const url = normalizeProfileAvatarUrl(candidate);

    if (url) {
      return url;
    }
  }

  return null;
}

async function lookupPublicGravatarAvatar(email: string | null | undefined): Promise<EmailAvatarCandidate | null> {
  const normalized = email?.trim().toLowerCase();

  if (!normalized || !normalized.includes("@")) {
    return null;
  }

  const hash = createHash("md5").update(normalized).digest("hex");
  const url = `https://www.gravatar.com/avatar/${hash}?s=256&d=404`;

  try {
    const response = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.toLowerCase().startsWith("image/")) {
      return null;
    }

    return { source: "email_gravatar", url };
  } catch {
    return null;
  }
}

function isRecentIso(value: string | null, windowMs: number) {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp < windowMs;
}

function isAuthUser(value: unknown): value is User {
  return value !== null
    && typeof value === "object"
    && "id" in value
    && "user_metadata" in value;
}

function readRecord(value: unknown): JsonRecord | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
