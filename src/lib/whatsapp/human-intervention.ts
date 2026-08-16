import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

export const HUMAN_INTERVENTION_DEFAULT_MINUTES = 60;
export const HUMAN_INTERVENTION_DEFAULT_MS = HUMAN_INTERVENTION_DEFAULT_MINUTES * 60 * 1000;
export const HUMAN_INTERVENTION_UNANSWERED_LEAD_MINUTES = 5;
export const HUMAN_INTERVENTION_UNANSWERED_LEAD_MS = HUMAN_INTERVENTION_UNANSWERED_LEAD_MINUTES * 60 * 1000;

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

export async function scheduleHumanInterventionAutoResumeForLead(input: {
  client: SupabaseClient;
  conversationId: string;
  messageOccurredAt: string;
  providerMessageId: string | null;
}) {
  const nowMs = Date.now();
  const { data } = await input.client
    .from("conversations")
    .select("metadata")
    .eq("id", input.conversationId)
    .maybeSingle<{ metadata: JsonRecord | null }>();
  const metadata = readRecord(data?.metadata) ?? {};
  const currentHuman = readRecord(metadata.human_intervention) ?? {};

  if (!isHumanInterventionActive(metadata, nowMs)) {
    return null;
  }

  const currentPausedUntilMs = parseIsoTimestamp(readString(currentHuman.paused_until));
  const messageMs = parseIsoTimestamp(input.messageOccurredAt);
  const fallbackBaseMs = messageMs && messageMs <= nowMs ? messageMs : nowMs;
  const fallbackUntilMs = Math.max(nowMs + 10_000, fallbackBaseMs + HUMAN_INTERVENTION_UNANSWERED_LEAD_MS);
  const effectivePausedUntilMs = Math.min(currentPausedUntilMs ?? fallbackUntilMs, fallbackUntilMs);
  const resumeAt = new Date(effectivePausedUntilMs).toISOString();
  const now = new Date(nowMs).toISOString();
  const waitingSince = readString(currentHuman.lead_waiting_since) ?? input.messageOccurredAt;

  await input.client
    .from("conversations")
    .update({
      metadata: {
        ...metadata,
        human_intervention: {
          ...currentHuman,
          active: true,
          lead_waiting_since: waitingSince,
          last_unanswered_lead_message_at: input.messageOccurredAt,
          last_unanswered_lead_provider_message_id: input.providerMessageId,
          auto_resume_reason: "lead_unanswered_after_handoff",
          auto_resume_after: resumeAt,
          paused_until: resumeAt,
          updated_at: now,
        },
      },
    })
    .eq("id", input.conversationId);

  return {
    resumeAt,
    resumeAtMs: effectivePausedUntilMs,
  };
}

function parseIsoTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
