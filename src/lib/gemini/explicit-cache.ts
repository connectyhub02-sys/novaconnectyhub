import "server-only";

import { createHash } from "node:crypto";

// Explicit Gemini context cache for the stable part of an agent's instructions
// (rules, agent prompt, catalog). The provider's implicit cache is best effort and
// missed every reply a minute apart; an explicit cache is billed at the cached-input
// rate on every use. The parts that change per message stay in the request's own
// system instruction. Any refusal from the provider, or a usage report showing the
// request instructions were not counted, switches the feature off and the caller
// repeats the call without cache: the customer never loses an answer or a rule.

const apiOrigin = "https://generativelanguage.googleapis.com/v1beta";
export const explicitCacheTtlSeconds = 900;
// Gemini 3.x Flash needs 4,096 cached tokens; ~4 characters per token in Portuguese.
export const explicitCacheMinChars = 18_000;
const maxEntries = 500;

type Entry = { name: string; expiresAt: number };
const entries = new Map<string, Entry>();
let disabledUntil = 0;
let lastFailure: string | null = null;

export type ExplicitCacheHandle = { name: string; created: boolean; stableChars: number };

export function explicitCacheStatus(now = Date.now()) {
  return { enabled: now >= disabledUntil, disabledUntil: disabledUntil > now ? new Date(disabledUntil).toISOString() : null, lastFailure, entries: entries.size };
}

/** Turns the feature off for a while; the reason is kept for the run metadata. */
export function rejectExplicitCache(reason: string, now = Date.now(), forMs = 6 * 60 * 60_000) {
  disabledUntil = now + forMs;
  lastFailure = reason.slice(0, 300);
  entries.clear();
}

export function resetExplicitCacheForTests() {
  entries.clear();
  disabledUntil = 0;
  lastFailure = null;
}

/**
 * Same stable text and model share one cache until shortly before it expires.
 * Returns null when disabled, too short, or the provider refuses (never throws).
 */
export async function stablePrefixCache(input: {
  apiKey: string; model: string; stableText: string; fetchImpl?: typeof fetch; now?: number;
}): Promise<ExplicitCacheHandle | null> {
  const now = input.now ?? Date.now();
  if (now < disabledUntil || input.stableText.length < explicitCacheMinChars) return null;
  const key = createHash("sha256").update(`${input.model}\n${input.stableText}`).digest("hex");
  const hit = entries.get(key);
  if (hit && hit.expiresAt - 60_000 > now) return { name: hit.name, created: false, stableChars: input.stableText.length };
  try {
    const response = await (input.fetchImpl ?? fetch)(`${apiOrigin}/cachedContents?key=${encodeURIComponent(input.apiKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        model: `models/${input.model}`,
        systemInstruction: { parts: [{ text: input.stableText }] },
        ttl: `${explicitCacheTtlSeconds}s`,
      }),
    });
    const data = await response.json().catch(() => ({})) as { name?: unknown; error?: { message?: unknown } };
    if (!response.ok || typeof data.name !== "string" || !data.name.startsWith("cachedContents/")) {
      rejectExplicitCache(`create ${response.status}: ${String(data.error?.message ?? "sem detalhe")}`, now, 30 * 60_000);
      return null;
    }
    if (entries.size >= maxEntries) entries.delete(entries.keys().next().value!);
    entries.set(key, { name: data.name, expiresAt: now + explicitCacheTtlSeconds * 1000 });
    return { name: data.name, created: true, stableChars: input.stableText.length };
  } catch (error) {
    rejectExplicitCache(`create: ${error instanceof Error ? error.message : "falha"}`, now, 10 * 60_000);
    return null;
  }
}

/**
 * The request's own instructions must be counted in the prompt: a provider that
 * silently dropped them would answer without the checkout and conduct rules.
 * Portuguese runs ~4 characters per token; 6 is a lenient lower bound.
 */
export function requestInstructionsWereCounted(usage: { inputTokens: number; cachedTokens?: number | null } | null, requestInstructionChars: number) {
  if (!usage) return false;
  const uncached = usage.inputTokens - (usage.cachedTokens ?? 0);
  return uncached >= Math.floor(requestInstructionChars / 6);
}
