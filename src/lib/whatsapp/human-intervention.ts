import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

export const HUMAN_INTERVENTION_DEFAULT_MINUTES = 60;
export const HUMAN_INTERVENTION_DEFAULT_MS = HUMAN_INTERVENTION_DEFAULT_MINUTES * 60 * 1000;

export async function isConversationPausedForHuman(client: SupabaseClient, conversationId: string) {
  const { data } = await client
    .from("conversations")
    .select("metadata")
    .eq("id", conversationId)
    .maybeSingle<{ metadata: JsonRecord | null }>();

  return isHumanInterventionActive(data?.metadata);
}

export function isHumanInterventionActive(metadata: unknown, nowMs = Date.now()) {
  const root = readRecord(metadata);
  const human = readRecord(root?.human_intervention);

  if (human?.active !== true) {
    return false;
  }

  const pausedUntil = readString(human.paused_until);

  if (!pausedUntil) {
    return true;
  }

  const pausedDate = new Date(pausedUntil);

  return !Number.isNaN(pausedDate.getTime()) && pausedDate.getTime() > nowMs;
}

export async function cancelQueuedWhatsappRunsForConversation(
  client: SupabaseClient,
  conversationId: string,
  reason = "Conversa assumida por atendimento humano.",
) {
  const now = new Date().toISOString();

  await client
    .from("agent_runs")
    .update({
      run_status: "cancelled",
      output_summary: reason,
      finished_at: now,
    })
    .eq("run_status", "queued")
    .eq("trigger_source", "connectyhub/whatsapp.message.received")
    .contains("metadata", { conversationId });
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
