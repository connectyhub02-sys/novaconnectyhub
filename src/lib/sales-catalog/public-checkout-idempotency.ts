import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

type ExistingCheckoutOrderRow = {
  id: string;
  latest_payment_session_id: string | null;
};

type ExistingCheckoutSessionRow = {
  id: string;
  order_id: string;
  checkout_url: string | null;
  metadata: JsonRecord | null;
};

export function createPublicCheckoutIntentKey(parts: unknown[]) {
  return createHash("sha256")
    .update(JSON.stringify(normalizeIntentParts(parts)))
    .digest("hex");
}

export async function findRecentPublicCheckoutSession(input: {
  client: SupabaseClient;
  organizationId: string;
  checkoutIntentKey: string;
  windowMinutes?: number;
}) {
  const cutoff = new Date(Date.now() - Math.max(1, input.windowMinutes ?? 15) * 60 * 1000).toISOString();
  const { data: order } = await input.client
    .from("sales_catalog_orders")
    .select("id, latest_payment_session_id")
    .eq("organization_id", input.organizationId)
    .eq("payment_status", "pending")
    .eq("metadata->>checkout_intent_key", input.checkoutIntentKey)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ExistingCheckoutOrderRow>();

  if (!order) {
    return null;
  }

  const query = input.client
    .from("sales_catalog_payment_sessions")
    .select("id, order_id, checkout_url, metadata")
    .eq("organization_id", input.organizationId)
    .eq("order_id", order.id)
    .in("status", ["created", "pending", "error"])
    .order("created_at", { ascending: false })
    .limit(1);

  const { data: session } = order.latest_payment_session_id
    ? await query.eq("id", order.latest_payment_session_id).maybeSingle<ExistingCheckoutSessionRow>()
    : await query.maybeSingle<ExistingCheckoutSessionRow>();

  if (!session?.checkout_url) {
    return null;
  }

  const metadata = readRecord(session.metadata);

  return {
    orderId: order.id,
    sessionId: session.id,
    checkoutUrl: session.checkout_url,
    trackingUrl: readString(metadata.checkout_tracking_url),
  };
}

function normalizeIntentParts(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeIntentParts);
  }

  if (!value || typeof value !== "object") {
    return typeof value === "string" ? value.trim().toLowerCase() : value;
  }

  return Object.fromEntries(
    Object.entries(value as JsonRecord)
      .filter(([, entry]) => entry !== null && entry !== undefined && entry !== "")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizeIntentParts(entry)]),
  );
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
