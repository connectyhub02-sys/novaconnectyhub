import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadElevenLabsCredentials } from "./credentials";

// Read-only view of the voice plan: characters used against the monthly quota.
// No generation, no plan change. Cached because the admin page and the daily
// cost center check both read it.
export type ElevenLabsQuota = { tier: string | null; used: number; limit: number; share: number; resetsAt: string | null; checkedAt: string };

const ttlMs = 10 * 60_000;
let cached: { at: number; value: ElevenLabsQuota | null } | null = null;

export function parseElevenLabsSubscription(data: unknown, now = new Date()): ElevenLabsQuota | null {
  const record = data && typeof data === "object" ? data as Record<string, unknown> : null;
  const used = Number(record?.character_count);
  const limit = Number(record?.character_limit);
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return null;
  const reset = Number(record?.next_character_count_reset_unix);
  return {
    tier: typeof record?.tier === "string" ? record.tier : null,
    used,
    limit,
    share: Math.round((used / limit) * 10000) / 10000,
    resetsAt: Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : null,
    checkedAt: now.toISOString(),
  };
}

/** Never throws: an unreadable quota just means the panel shows "not available". */
export async function readElevenLabsQuota(client: SupabaseClient, now = Date.now()): Promise<ElevenLabsQuota | null> {
  if (cached && now - cached.at < ttlMs) return cached.value;
  let value: ElevenLabsQuota | null = null;
  try {
    const { apiKey } = await loadElevenLabsCredentials(client);
    const response = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: { "xi-api-key": apiKey }, signal: AbortSignal.timeout(10_000), redirect: "error", cache: "no-store",
    });
    value = response.ok ? parseElevenLabsSubscription(await response.json(), new Date(now)) : null;
  } catch {
    value = null;
  }
  cached = { at: now, value };
  return value;
}
