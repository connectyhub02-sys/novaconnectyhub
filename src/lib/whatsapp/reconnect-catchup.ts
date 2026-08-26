import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { callUazapiOperation } from "@/lib/uazapi/client";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import {
  dispatchWhatsappAgentRun,
  enqueueWhatsappAgentRun,
  ingestUazapiWebhook,
} from "./webhook-ingest";
import type { WhatsappReconnectCatchupEventData } from "./reconnect-catchup-event";

type JsonRecord = Record<string, unknown>;

type WhatsappInstanceCatchupRow = {
  id: string;
  organization_id: string;
  provider_instance_id: string | null;
  instance_token_encrypted: string | null;
  status: string | null;
  disconnected_at: string | null;
  last_message_at: string | null;
  metadata: JsonRecord | null;
};

type ConversationRow = {
  id: string;
  lead_id: string | null;
  metadata: JsonRecord | null;
};

export type ReconnectCatchupMessageCandidate = {
  id?: string;
  direction: string | null;
  provider_message_id: string | null;
  provider_chat_id: string | null;
  message_type: string | null;
  text_content: string | null;
  occurred_at: string | null;
  created_at: string | null;
};

const DEFAULT_MAX_CHATS = 30;
const DEFAULT_MESSAGES_PER_CHAT = 12;
const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const FALLBACK_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const DISCONNECT_SAFETY_WINDOW_MS = 5 * 60 * 1000;

export async function processWhatsappReconnectCatchup(input: {
  data: WhatsappReconnectCatchupEventData;
  client?: SupabaseClient;
  maxChats?: number;
  messagesPerChat?: number;
}) {
  const client = input.client ?? createServiceClient();
  const instance = await loadWhatsappInstance(client, input.data.whatsappInstanceId);

  if (!instance) {
    return { status: "skipped", reason: "instance_not_found" };
  }

  if (instance.status !== "connected") {
    return { status: "skipped", reason: "instance_not_connected", instanceStatus: instance.status };
  }

  const token = decryptInstanceToken(instance);
  const providerInstanceId = instance.provider_instance_id ?? readString(readRecord(instance.metadata)?.provider_name);

  if (!token || !providerInstanceId) {
    await updateInstanceCatchupMetadata(client, instance.id, {
      last_reconnect_catchup_status: "skipped",
      last_reconnect_catchup_reason: !token ? "missing_instance_token" : "missing_provider_instance_id",
      last_reconnect_catchup_finished_at: new Date().toISOString(),
    });

    return {
      status: "skipped",
      reason: !token ? "missing_instance_token" : "missing_provider_instance_id",
    };
  }

  const scanStartedAt = new Date().toISOString();
  const cutoffIso = resolveCatchupCutoffIso(instance, input.data);
  const maxChats = clampInteger(input.maxChats, 1, 80, DEFAULT_MAX_CHATS);
  const messagesPerChat = clampInteger(input.messagesPerChat, 1, 50, DEFAULT_MESSAGES_PER_CHAT);

  try {
    await updateInstanceCatchupMetadata(client, instance.id, {
      last_reconnect_catchup_status: "running",
      last_reconnect_catchup_started_at: scanStartedAt,
      last_reconnect_catchup_cutoff_at: cutoffIso,
      last_reconnect_catchup_webhook_event_id: input.data.webhookEventId ?? null,
    });

    const chatsResponse = await callUazapiOperation({
      operationId: "findChats",
      instanceTokenOverride: token,
      payload: {
        operator: "AND",
        sort: "-wa_lastMsgTimestamp",
        limit: maxChats,
        offset: 0,
      },
    });
    const chats = extractRecords(chatsResponse.data)
      .map((chat) => ({
        chat,
        chatId: extractChatId(chat),
        timestampMs: extractTimestampMs(chat),
      }))
      .filter((item): item is { chat: JsonRecord; chatId: string; timestampMs: number | null } =>
        typeof item.chatId === "string" && isPrivateChatId(item.chatId)
      )
      .filter((item) => item.timestampMs === null || item.timestampMs >= Date.parse(cutoffIso))
      .slice(0, maxChats)
      .sort((left, right) => (left.timestampMs ?? 0) - (right.timestampMs ?? 0));

    let chatsChecked = 0;
    let messagesSeen = 0;
    let messagesProcessed = 0;
    let webhookDuplicates = 0;
    let agentRunsEnqueued = 0;
    let skippedAlreadyHandled = 0;
    let skippedExistingRun = 0;

    for (const item of chats) {
      chatsChecked += 1;

      await requestChatHistorySync({
        token,
        chatId: item.chatId,
        count: messagesPerChat,
      });

      const messagesResponse = await callUazapiOperation({
        operationId: "findMessages",
        instanceTokenOverride: token,
        payload: {
          chatid: item.chatId,
          limit: messagesPerChat,
          offset: 0,
        },
      }).catch(() => null);

      const providerMessages = sortMessagesChronologically(
        extractRecords(messagesResponse?.data).filter((message) =>
          isMessageInCatchupWindow(message, cutoffIso)
        ),
      );
      messagesSeen += providerMessages.length;

      for (const providerMessage of providerMessages) {
        const ingest = await ingestProviderMessage({
          client,
          providerInstanceId,
          chatId: item.chatId,
          providerMessage,
        });

        if (ingest.duplicate) {
          webhookDuplicates += 1;
        }

        if (ingest.status === "processed") {
          messagesProcessed += 1;
        }
      }

      const enqueueResult = await enqueueLatestUnansweredInbound({
        client,
        instance,
        chatId: item.chatId,
        cutoffIso,
      });

      if (enqueueResult.status === "enqueued") {
        agentRunsEnqueued += 1;
      } else if (enqueueResult.status === "already_handled") {
        skippedAlreadyHandled += 1;
      } else if (enqueueResult.status === "existing_run") {
        skippedExistingRun += 1;
      }
    }

    const finishedAt = new Date().toISOString();
    const summary = {
      status: "completed" as const,
      whatsappInstanceId: instance.id,
      organizationId: instance.organization_id,
      chatsChecked,
      messagesSeen,
      messagesProcessed,
      webhookDuplicates,
      agentRunsEnqueued,
      skippedAlreadyHandled,
      skippedExistingRun,
      cutoffIso,
      finishedAt,
    };

    await updateInstanceCatchupMetadata(client, instance.id, {
      last_reconnect_catchup_status: "completed",
      last_reconnect_catchup_finished_at: finishedAt,
      last_reconnect_catchup_chats_checked: chatsChecked,
      last_reconnect_catchup_messages_seen: messagesSeen,
      last_reconnect_catchup_messages_processed: messagesProcessed,
      last_reconnect_catchup_agent_runs_enqueued: agentRunsEnqueued,
      last_reconnect_catchup_skipped_existing_run: skippedExistingRun,
      last_reconnect_catchup_skipped_already_handled: skippedAlreadyHandled,
      last_reconnect_catchup_error: null,
    });

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida na varredura pos-reconexao.";

    await updateInstanceCatchupMetadata(client, instance.id, {
      last_reconnect_catchup_status: "failed",
      last_reconnect_catchup_finished_at: new Date().toISOString(),
      last_reconnect_catchup_error: message,
    });

    throw error;
  }
}

export function selectReconnectUnansweredInbound(
  messages: ReconnectCatchupMessageCandidate[],
  options: { cutoffIso?: string | null } = {},
) {
  const sorted = [...messages].sort(compareMessagesDesc);
  const latest = sorted[0] ?? null;

  if (!latest || latest.direction !== "inbound") {
    return null;
  }

  const cutoffMs = options.cutoffIso ? Date.parse(options.cutoffIso) : null;

  if (Number.isFinite(cutoffMs) && getMessageTimeMs(latest) < (cutoffMs as number)) {
    return null;
  }

  return latest;
}

async function loadWhatsappInstance(client: SupabaseClient, whatsappInstanceId: string) {
  const { data, error } = await client
    .from("whatsapp_instances")
    .select("id, organization_id, provider_instance_id, instance_token_encrypted, status, disconnected_at, last_message_at, metadata")
    .eq("id", whatsappInstanceId)
    .neq("status", "archived")
    .maybeSingle<WhatsappInstanceCatchupRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar instancia WhatsApp para catch-up: ${error.message}`);
  }

  return data ?? null;
}

async function requestChatHistorySync(input: {
  token: string;
  chatId: string;
  count: number;
}) {
  await callUazapiOperation({
    operationId: "requestHistorySync",
    instanceTokenOverride: input.token,
    payload: {
      number: input.chatId,
      mode: "history",
      count: input.count,
    },
  }).catch(() => null);
}

async function ingestProviderMessage(input: {
  client: SupabaseClient;
  providerInstanceId: string;
  chatId: string;
  providerMessage: JsonRecord;
}) {
  const payload = {
    event: "messages",
    instanceId: input.providerInstanceId,
    data: {
      ...input.providerMessage,
      original_chatid: extractMessageChatId(input.providerMessage),
      chatid: input.chatId,
      remoteJid: input.chatId,
    },
    reconnect_catchup: {
      source: "connectyhub_reconnect_catchup",
      synced_at: new Date().toISOString(),
    },
  };

  return ingestUazapiWebhook({
    payload,
    eventType: "messages",
    requestUrl: `https://connectyhub.internal/reconnect-catchup?instanceId=${encodeURIComponent(input.providerInstanceId)}`,
    headers: new Headers({ "user-agent": "connectyhub-reconnect-catchup" }),
    client: input.client,
    suppressAgentRun: true,
    suppressNotifications: true,
    source: "connectyhub-reconnect-catchup",
  });
}

async function enqueueLatestUnansweredInbound(input: {
  client: SupabaseClient;
  instance: WhatsappInstanceCatchupRow;
  chatId: string;
  cutoffIso: string;
}) {
  const { data: conversation, error: conversationError } = await input.client
    .from("conversations")
    .select("id, lead_id, metadata")
    .eq("organization_id", input.instance.organization_id)
    .eq("provider", "uazapi")
    .eq("provider_chat_id", input.chatId)
    .eq("whatsapp_instance_id", input.instance.id)
    .maybeSingle<ConversationRow>();

  if (conversationError) {
    throw new Error(`Nao foi possivel carregar conversa do catch-up: ${conversationError.message}`);
  }

  if (!conversation) {
    return { status: "no_conversation" as const };
  }

  const { data: messages, error: messagesError } = await input.client
    .from("conversation_messages")
    .select("id, direction, provider_message_id, provider_chat_id, message_type, text_content, occurred_at, created_at")
    .eq("conversation_id", conversation.id)
    .order("occurred_at", { ascending: false })
    .limit(12);

  if (messagesError) {
    throw new Error(`Nao foi possivel carregar mensagens do catch-up: ${messagesError.message}`);
  }

  const latestInbound = selectReconnectUnansweredInbound(
    (messages ?? []) as ReconnectCatchupMessageCandidate[],
    { cutoffIso: input.cutoffIso },
  );

  if (!latestInbound) {
    return { status: "already_handled" as const };
  }

  if (await hasExistingRunForInbound(input.client, conversation.id, latestInbound.provider_message_id)) {
    return { status: "existing_run" as const };
  }

  const humanFallback = resolveHumanFallback(conversation.metadata);
  const agentRun = await enqueueWhatsappAgentRun(input.client, {
    organizationId: input.instance.organization_id,
    leadId: conversation.lead_id,
    conversationId: conversation.id,
    whatsappInstanceId: input.instance.id,
    webhookEventId: null,
    providerMessageId: latestInbound.provider_message_id,
    providerChatId: latestInbound.provider_chat_id ?? input.chatId,
    isGroupChat: false,
    phoneNumber: normalizePhone(input.chatId),
    messageType: latestInbound.message_type,
    textContent: latestInbound.text_content,
    eventType: "reconnect_catchup",
    allowPausedConversation: humanFallback.allowPausedConversation,
    humanFallbackResumeAt: humanFallback.resumeAt,
    metadata: {
      reconnectCatchup: true,
      reconnectCatchupReason: "latest_inbound_unanswered_after_reconnect",
      reconnectCatchupSyncedAt: new Date().toISOString(),
    },
  });

  if (!agentRun?.id) {
    return { status: "not_enqueued" as const };
  }

  await dispatchWhatsappAgentRun(input.client, agentRun, {
    organizationId: input.instance.organization_id,
    conversationId: conversation.id,
    whatsappInstanceId: input.instance.id,
  });

  return { status: "enqueued" as const, runId: agentRun.id };
}

async function hasExistingRunForInbound(
  client: SupabaseClient,
  conversationId: string,
  providerMessageId: string | null,
) {
  if (!providerMessageId) {
    return false;
  }

  const { data } = await client
    .from("agent_runs")
    .select("id")
    .eq("trigger_source", "connectyhub/whatsapp.message.received")
    .contains("metadata", { conversationId, providerMessageId })
    .in("run_status", ["queued", "running", "completed", "needs_approval"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  return Boolean(data?.id);
}

async function updateInstanceCatchupMetadata(
  client: SupabaseClient,
  whatsappInstanceId: string,
  patch: JsonRecord,
) {
  const { data } = await client
    .from("whatsapp_instances")
    .select("metadata")
    .eq("id", whatsappInstanceId)
    .maybeSingle<{ metadata: JsonRecord | null }>();

  await client
    .from("whatsapp_instances")
    .update({
      metadata: {
        ...(readRecord(data?.metadata) ?? {}),
        ...patch,
      },
    })
    .eq("id", whatsappInstanceId);
}

function resolveCatchupCutoffIso(
  instance: WhatsappInstanceCatchupRow,
  eventData: WhatsappReconnectCatchupEventData,
) {
  const now = Date.now();
  const oldestAllowed = now - MAX_LOOKBACK_MS;
  const disconnectedMs =
    parseTimestampMs(eventData.disconnectedAt) ??
    parseTimestampMs(instance.disconnected_at);

  if (disconnectedMs) {
    return new Date(Math.max(oldestAllowed, disconnectedMs - DISCONNECT_SAFETY_WINDOW_MS)).toISOString();
  }

  return new Date(Math.max(oldestAllowed, now - FALLBACK_LOOKBACK_MS)).toISOString();
}

function resolveHumanFallback(metadata: JsonRecord | null) {
  const human = readRecord(readRecord(metadata)?.human_intervention);
  const resumeAt = readString(human?.auto_resume_after);

  return {
    allowPausedConversation: human?.auto_resume_reason === "lead_unanswered_after_handoff" && Boolean(resumeAt),
    resumeAt: resumeAt ?? null,
  };
}

function sortMessagesChronologically(messages: JsonRecord[]) {
  return [...messages].reverse().sort((left, right) => {
    const leftTime = extractTimestampMs(left);
    const rightTime = extractTimestampMs(right);

    if (leftTime === null || rightTime === null) {
      return 0;
    }

    return leftTime - rightTime;
  });
}

function isMessageInCatchupWindow(message: JsonRecord, cutoffIso: string) {
  const timestampMs = extractTimestampMs(message);

  return timestampMs === null || timestampMs >= Date.parse(cutoffIso);
}

function compareMessagesDesc(left: ReconnectCatchupMessageCandidate, right: ReconnectCatchupMessageCandidate) {
  return getMessageTimeMs(right) - getMessageTimeMs(left);
}

function getMessageTimeMs(message: ReconnectCatchupMessageCandidate) {
  return parseTimestampMs(message.occurred_at) ?? parseTimestampMs(message.created_at) ?? 0;
}

function extractRecords(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  const root = readRecord(value);
  if (!root) {
    return [];
  }

  for (const key of ["data", "items", "messages", "chats", "contacts", "rows", "result", "results", "response"]) {
    const direct = root[key];

    if (Array.isArray(direct)) {
      return direct.filter(isRecord);
    }

    const nested = readRecord(direct);

    if (nested) {
      const records = extractRecords(nested);

      if (records.length) {
        return records;
      }
    }
  }

  return [];
}

function extractChatId(chat: JsonRecord) {
  const key = readRecord(chat.key);

  return readString(chat.wa_chatid)
    ?? readString(chat.chatid)
    ?? readString(chat.chatId)
    ?? readString(chat.remoteJid)
    ?? readString(chat.jid)
    ?? readString(chat.id)
    ?? readString(key?.remoteJid);
}

function extractMessageChatId(message: JsonRecord) {
  const key = readRecord(message.key);

  return readString(message.chatid)
    ?? readString(message.chatId)
    ?? readString(message.remoteJid)
    ?? readString(message.jid)
    ?? readString(message.from)
    ?? readString(message.to)
    ?? readString(key?.remoteJid);
}

function isPrivateChatId(chatId: string) {
  const normalized = chatId.toLowerCase();

  return !normalized.includes("status@broadcast")
    && !normalized.endsWith("@g.us")
    && !normalized.includes("@newsletter")
    && !normalized.includes("broadcast");
}

function extractTimestampMs(value: unknown): number | null {
  const direct = findNestedValue(value, [
    "wa_lastMsgTimestamp",
    "lastMessageTimestamp",
    "last_message_timestamp",
    "messageTimestamp",
    "timestamp",
    "date",
    "createdAt",
    "created",
  ]);

  return parseTimestampMs(direct);
}

function findNestedValue(value: unknown, keys: string[], depth = 0): unknown {
  if (depth > 4 || !value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNestedValue(item, keys, depth + 1);

      if (found !== null && found !== undefined) {
        return found;
      }
    }

    return null;
  }

  const record = value as JsonRecord;
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()));

  for (const [key, item] of Object.entries(record)) {
    if (normalizedKeys.has(key.toLowerCase()) && item !== null && item !== undefined) {
      return item;
    }
  }

  for (const item of Object.values(record)) {
    const found = findNestedValue(item, keys, depth + 1);

    if (found !== null && found !== undefined) {
      return found;
    }
  }

  return null;
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    }

    const parsed = Date.parse(value);

    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function normalizePhone(value: string | null) {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");

  return digits.length >= 8 ? digits : null;
}

function decryptInstanceToken(instance: WhatsappInstanceCatchupRow) {
  if (!instance.instance_token_encrypted) {
    return null;
  }

  try {
    return decryptCredentialValue(instance.instance_token_encrypted);
  } catch {
    return null;
  }
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : fallback;
  const safe = Number.isFinite(number) ? Math.round(number) : fallback;

  return Math.min(max, Math.max(min, safe));
}

function readRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
