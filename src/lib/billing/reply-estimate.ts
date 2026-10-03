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

// A reply is only generated when the wallet can pay for it: otherwise the AI would
// work (provider cost) and the reply could not be delivered. Bounded so a costly
// history never blocks a company that still has a reasonable balance.
const minimumReplyCredits = 10;
const maximumReplyCredits = 150;
const fallbackReplyCredits = 40;

export function creditsNeededForReply(creditsPerReply: number | null) {
  const value = creditsPerReply && creditsPerReply > 0 ? creditsPerReply : fallbackReplyCredits;
  return Math.min(maximumReplyCredits, Math.max(minimumReplyCredits, value));
}

export async function checkReplyBalance(client: SupabaseClient, organizationId: string) {
  const { data: org } = await client.from("organizations").select("billing_organization_id").eq("id", organizationId).maybeSingle<{ billing_organization_id: string | null }>();
  const walletOrganizationId = org?.billing_organization_id ?? organizationId;
  const { data: wallet, error } = await client.from("credit_wallets").select("balance_credits,reserved_credits").eq("organization_id", walletOrganizationId).maybeSingle<{ balance_credits: number | string; reserved_credits: number | string | null }>();
  // Never blocks on a lookup failure: the debit itself still guards the wallet.
  if (error || !wallet) return { ok: true, available: null, needed: null };
  const available = Number(wallet.balance_credits) - Number(wallet.reserved_credits ?? 0);
  const { creditsPerReply } = await estimateReplies(client, organizationId, available);
  const needed = creditsNeededForReply(creditsPerReply);
  return { ok: available >= needed, available, needed };
}
