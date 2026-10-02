import type { SupabaseClient } from "@supabase/supabase-js";

// Plain-language balance for customers: "≈ N respostas". Tokens and prices stay
// in the admin. Cached per organization because the balance pill polls often.
export type ReplyEstimate = { estimatedReplies: number | null; creditsPerReply: number | null; basis: "organization" | "platform" | "none" };

const ttlMs = 10 * 60_000;
const cache = new Map<string, { at: number; creditsPerReply: number | null; basis: ReplyEstimate["basis"] }>();

export function repliesForBalance(balanceCredits: number, creditsPerReply: number | null) {
  if (!creditsPerReply || creditsPerReply <= 0 || !Number.isFinite(balanceCredits)) return null;
  return Math.max(0, Math.floor(balanceCredits / creditsPerReply));
}

/** Never blocks the balance display: failures return no estimate. */
export async function estimateReplies(client: SupabaseClient, organizationId: string, balanceCredits: number, now = Date.now()): Promise<ReplyEstimate> {
  let entry = cache.get(organizationId);
  if (!entry || now - entry.at > ttlMs) {
    try {
      const { data, error } = await client.rpc("reply_credit_estimate", { p_org: organizationId });
      const value = !error && data && typeof data === "object" ? data as { credits_per_reply?: unknown; basis?: unknown } : null;
      const credits = Number(value?.credits_per_reply);
      const basis = value?.basis === "organization" || value?.basis === "platform" ? value.basis : "none";
      entry = { at: now, creditsPerReply: Number.isFinite(credits) && credits > 0 ? credits : null, basis };
      cache.set(organizationId, entry);
    } catch {
      return { estimatedReplies: null, creditsPerReply: null, basis: "none" };
    }
  }
  return { estimatedReplies: repliesForBalance(balanceCredits, entry.creditsPerReply), creditsPerReply: entry.creditsPerReply, basis: entry.basis };
}
