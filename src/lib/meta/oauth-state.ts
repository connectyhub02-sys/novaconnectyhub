import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const META_OAUTH_STATE_TTL_SECONDS = 600;

export function metaOAuthCookie(baseUrl: string) {
  const secure = new URL(baseUrl).protocol === "https:";
  return {
    name: secure ? "__Host-meta-oauth-state" : "meta-oauth-state",
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: META_OAUTH_STATE_TTL_SECONDS,
  };
}

export function createMetaOAuthState() {
  return randomBytes(32).toString("hex");
}

export function hashMetaOAuthState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export function matchesMetaOAuthCookie(state: string | undefined, cookie: string | undefined) {
  if (!state || !cookie || !/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(cookie)) return false;
  return timingSafeEqual(Buffer.from(state), Buffer.from(cookie));
}

export function isPendingMetaOAuthState(metadata: Record<string, unknown> | null, userId: string, now = Date.now()) {
  if (!metadata || metadata.oauth_requested_by !== userId || typeof metadata.oauth_requested_at !== "string") return false;
  const age = now - Date.parse(metadata.oauth_requested_at);
  return Number.isFinite(age) && age >= 0 && age < META_OAUTH_STATE_TTL_SECONDS * 1000;
}
