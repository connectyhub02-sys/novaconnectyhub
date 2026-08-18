import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inngest } from "@/lib/inngest/client";
import { sendLeadReplyPushNotifications } from "@/lib/push/web-push";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveUazapiWhatsappStatus } from "@/lib/uazapi/status";
import {
  mergeLeadProfileImageMetadata,
  readLeadProfileImageUrl,
  syncLeadAvatarFromUazapi,
} from "./lead-avatar-sync";
import { normalizeWhatsappBehaviorConfig } from "./agent-behavior";
import { isWhatsappHandoffNotificationRecipient } from "./handoff-notifications";
import {
  cancelQueuedWhatsappRunsForConversation,
  isConversationPausedForHuman,
  resolveHumanInterventionMinutesForInstance,
  scheduleHumanInterventionAutoResumeForLead,
} from "./human-intervention";
import {
  classifyWhatsappLeadDisplayName,
  isLikelyPersonalLeadName,
  normalizeLeadNameCandidate,
  resolveLeadPersonalName,
} from "./lead-names";

type JsonRecord = Record<string, unknown>;

type WhatsappGroupTargetPolicy = {
  groupTargetId: string;
  groupTargetName: string | null;
  groupReplyMode: "all" | "mentions" | "admins" | "observer";
  groupMentionMode: "none" | "author" | "all";
  groupRequireApproval: boolean;
  groupMaxRepliesPerHour: number;
  groupMuteUntil: string | null;
};

type WhatsappInstanceRow = {
  id: string;
  organization_id: string;
  instance_token_encrypted: string | null;
  metadata: JsonRecord | null;
};

type LeadRow = {
  id: string;
  display_name: string | null;
  metadata: JsonRecord | null;
};

type ConversationRow = {
  id: string;
  metadata: JsonRecord | null;
};

type AgentRow = {
  id: string;
  metadata: JsonRecord | null;
};

type WebhookEventRow = {
  id: string;
};

export type UazapiWebhookIngestResult = {
  eventId: string | null;
  eventType: string;
  duplicate: boolean;
  organizationId: string | null;
  whatsappInstanceId: string | null;
  leadId: string | null;
  conversationId: string | null;
  messageId: string | null;
  agentRunId: string | null;
  status: "received" | "processed" | "unmapped" | "duplicate" | "error";
  error?: string;
};

export async function ingestUazapiWebhook(input: {
  payload: unknown;
  eventType: string;
  requestUrl: string;
  headers: Headers;
  client?: SupabaseClient;
}): Promise<UazapiWebhookIngestResult> {
  const client = input.client ?? createServiceClient();
  const payload = normalizePayload(input.payload);
  const eventType = input.eventType || extractEventType(payload) || "unknown";
  const providerInstanceId = extractProviderInstanceId(payload, input.requestUrl);
  const message = extractMessageSnapshot(payload);
  const instance = providerInstanceId ? await findWhatsappInstance(client, providerInstanceId) : null;
  const payloadHash = hashPayload(payload);
  const eventResult = await insertWebhookEvent(client, {
    eventType,
    payload,
    payloadHash,
    headers: sanitizeHeaders(input.headers),
    providerInstanceId,
    whatsappInstanceId: instance?.id ?? null,
    organizationId: instance?.organization_id ?? null,
    providerMessageId: message.providerMessageId,
    providerChatId: message.providerChatId,
  });

  if (eventResult.duplicate) {
    return {
      eventId: eventResult.eventId,
      eventType,
      duplicate: true,
      organizationId: instance?.organization_id ?? null,
      whatsappInstanceId: instance?.id ?? null,
      leadId: null,
      conversationId: null,
      messageId: null,
      agentRunId: null,
      status: "duplicate",
    };
  }

  const baseResult: UazapiWebhookIngestResult = {
    eventId: eventResult.eventId,
    eventType,
    duplicate: false,
    organizationId: instance?.organization_id ?? null,
    whatsappInstanceId: instance?.id ?? null,
    leadId: null,
    conversationId: null,
    messageId: null,
    agentRunId: null,
    status: "received",
  };

  if (!instance?.organization_id) {
    await markWebhookEvent(client, eventResult.eventId, "unmapped", "Instancia nao mapeada para organizacao.");
    return {
      ...baseResult,
      status: "unmapped",
      error: "Instancia nao mapeada para organizacao.",
    };
  }

  await syncInstanceConnectionFromWebhook(client, {
    eventType,
    instance,
    payload,
  });

  if (!isConversationMessageWebhookEvent(eventType)) {
    await markWebhookEvent(client, eventResult.eventId, "processed");
    return {
      ...baseResult,
      status: "processed",
    };
  }

  if (!message.providerChatId && !message.phoneNumber && !message.providerMessageId) {
    await markWebhookEvent(client, eventResult.eventId, "processed");
    return {
      ...baseResult,
      status: "processed",
    };
  }

  try {
    const behavior = normalizeWhatsappBehaviorConfig(readRecord(instance.metadata)?.behavior_config);
    const isHandoffNotificationReply = message.direction === "inbound"
      && !message.isGroupChat
      && isWhatsappHandoffNotificationRecipient(behavior, message.phoneNumber);
    const lead = !isHandoffNotificationReply && !message.isGroupChat && message.phoneNumber
      ? await ensureLead(client, {
          organizationId: instance.organization_id,
          phoneNumber: message.phoneNumber,
          displayName: message.displayName,
          lastEventSummary: message.textContent,
          lastMessageAt: message.occurredAt,
          profileImageUrl: message.profileImageUrl,
          providerChatId: message.providerChatId,
          providerMessageId: message.providerMessageId,
        })
      : null;
    if (
      lead &&
      message.direction === "inbound" &&
      !readLeadProfileImageUrl(lead.metadata)
    ) {
      await syncLeadAvatarFromUazapi({
        client,
        leadId: lead.id,
        phoneNumber: message.phoneNumber,
        providerChatId: message.providerChatId,
        instance,
        existingMetadata: lead.metadata,
      });
    }
    const conversation = await ensureConversation(client, {
      organizationId: instance.organization_id,
      leadId: lead?.id ?? null,
      whatsappInstanceId: instance.id,
      providerChatId: message.providerChatId ?? message.phoneNumber ?? message.providerMessageId,
      isGroupChat: message.isGroupChat,
      lastMessagePreview: message.textContent,
      lastMessageAt: message.occurredAt,
    });
    const savedMessage = await insertConversationMessage(client, {
      organizationId: instance.organization_id,
      conversationId: conversation.id,
      leadId: lead?.id ?? null,
      whatsappInstanceId: instance.id,
      message,
      payload,
    });
    if (isHumanAuthoredWhatsappMessage(message, payload)) {
      const humanInterventionMinutes = await resolveHumanInterventionMinutesForInstance({
        client,
        organizationId: instance.organization_id,
        instanceMetadata: readRecord(instance.metadata),
      });
      await markConversationHandledByHuman(client, conversation.id, message, humanInterventionMinutes);
    }
    if (message.direction === "inbound" && lead && !message.isGroupChat && !isHandoffNotificationReply) {
      await sendLeadReplyPushNotifications({
        client,
        organizationId: instance.organization_id,
      }).catch(() => undefined);
    }
    const autoResume = message.direction === "inbound" && lead && !message.isGroupChat && !isHandoffNotificationReply
      ? await scheduleHumanInterventionAutoResumeForLead({
          client,
          conversationId: conversation.id,
          messageOccurredAt: message.occurredAt,
          providerMessageId: message.providerMessageId,
        })
      : null;
    const agentRun = message.direction === "inbound"
      ? await enqueueWhatsappAgentRun(client, {
          organizationId: instance.organization_id,
          leadId: lead?.id ?? null,
          conversationId: conversation.id,
          whatsappInstanceId: instance.id,
          webhookEventId: eventResult.eventId,
          providerMessageId: message.providerMessageId,
          providerChatId: message.providerChatId,
          isGroupChat: message.isGroupChat,
          phoneNumber: message.phoneNumber,
          messageType: message.messageType,
          textContent: message.textContent,
          eventType,
          allowPausedConversation: Boolean(autoResume),
          humanFallbackResumeAt: autoResume?.resumeAt ?? null,
        })
      : null;

    if (agentRun?.id) {
      await inngest.send({
        name: "connectyhub/whatsapp.message.received",
        data: {
          runId: agentRun.id,
          organizationId: instance.organization_id,
          conversationId: conversation.id,
          whatsappInstanceId: instance.id,
        },
      }).catch(async (error: unknown) => {
        await client
          .from("agent_runs")
          .update({
            metadata: {
              ...(agentRun.metadata ?? {}),
              inngest_dispatch_error: error instanceof Error ? error.message : "Falha ao disparar Inngest.",
              inngest_dispatch_failed_at: new Date().toISOString(),
            },
          })
          .eq("id", agentRun.id);
      });
    }

    await client
      .from("whatsapp_instances")
      .update({
        status: "connected",
        last_message_at: message.occurredAt,
        last_heartbeat_at: new Date().toISOString(),
        connected_at: new Date().toISOString(),
      })
      .eq("id", instance.id)
      .in("status", ["draft", "qr_pending", "disconnected", "connected"]);

    await createIntelligenceEvent(client, {
      organizationId: instance.organization_id,
      leadId: lead?.id ?? null,
      conversationId: conversation.id,
      webhookEventId: eventResult.eventId,
      agentRunId: agentRun?.id ?? null,
      title: message.direction === "inbound"
        ? "Mensagem recebida no WhatsApp"
        : isHumanAuthoredWhatsappMessage(message, payload)
          ? "Humano respondeu pelo WhatsApp conectado"
          : "Mensagem registrada no WhatsApp",
      summary: message.textContent,
      eventType,
    });

    await markWebhookEvent(client, eventResult.eventId, "processed");

    return {
      ...baseResult,
      leadId: lead?.id ?? null,
      conversationId: conversation.id,
      messageId: savedMessage.id,
      agentRunId: agentRun?.id ?? null,
      status: "processed",
    };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Erro desconhecido ao processar webhook.";
    await markWebhookEvent(client, eventResult.eventId, "error", messageText);

    return {
      ...baseResult,
      status: "error",
      error: messageText,
    };
  }
}

async function findWhatsappInstance(client: SupabaseClient, providerInstanceId: string) {
  const { data } = await client
    .from("whatsapp_instances")
    .select("id, organization_id, instance_token_encrypted, metadata")
    .eq("provider", "uazapi")
    .eq("provider_instance_id", providerInstanceId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<WhatsappInstanceRow>();

  if (data) {
    return data;
  }

  const { data: byProviderName } = await client
    .from("whatsapp_instances")
    .select("id, organization_id, instance_token_encrypted, metadata")
    .eq("provider", "uazapi")
    .contains("metadata", { provider_name: providerInstanceId })
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<WhatsappInstanceRow>();

  return byProviderName ?? null;
}

async function syncInstanceConnectionFromWebhook(
  client: SupabaseClient,
  input: {
    eventType: string;
    instance: WhatsappInstanceRow;
    payload: JsonRecord;
  },
) {
  if (!isConnectionWebhookEvent(input.eventType)) {
    return;
  }

  const status = resolveUazapiWhatsappStatus(input.payload, "draft");

  if (status === "draft") {
    return;
  }

  const now = new Date().toISOString();
  const update: JsonRecord = {
    status,
    last_heartbeat_at: now,
    last_synced_at: now,
    metadata: {
      ...(input.instance.metadata ?? {}),
      last_connection_event: input.eventType,
      last_connection_event_status: status,
      last_connection_event_synced_at: now,
    },
  };

  if (status === "connected") {
    update.connected_at = now;
    update.disconnected_at = null;
  }

  if (status === "disconnected") {
    update.disconnected_at = now;
  }

  await client
    .from("whatsapp_instances")
    .update(update)
    .eq("id", input.instance.id)
    .neq("status", "archived");
}

function isConnectionWebhookEvent(eventType: string) {
  const normalized = eventType.toLowerCase().replace(/[_-]+/g, " ");

  return normalized.includes("connection") || normalized.includes("connect") || normalized.includes("status");
}

function isConversationMessageWebhookEvent(eventType: string) {
  const normalized = eventType.toLowerCase().replace(/[_-]+/g, " ").trim();

  return normalized === "message"
    || normalized === "messages"
    || normalized === "message received"
    || normalized === "messages received";
}

async function insertWebhookEvent(
  client: SupabaseClient,
  input: {
    eventType: string;
    payload: JsonRecord;
    payloadHash: string;
    headers: JsonRecord;
    providerInstanceId: string | null;
    whatsappInstanceId: string | null;
    organizationId: string | null;
    providerMessageId: string | null;
    providerChatId: string | null;
  },
) {
  const { data, error } = await client
    .from("whatsapp_webhook_events")
    .insert({
      provider: "uazapi",
      event_type: input.eventType,
      provider_instance_id: input.providerInstanceId,
      whatsapp_instance_id: input.whatsappInstanceId,
      organization_id: input.organizationId,
      provider_message_id: input.providerMessageId,
      provider_chat_id: input.providerChatId,
      payload_hash: input.payloadHash,
      payload: input.payload,
      headers: input.headers,
      metadata: {
        ingested_by: "connectyhub-webhook",
      },
    })
    .select("id")
    .single<WebhookEventRow>();

  if (!error) {
    return { eventId: data.id, duplicate: false };
  }

  if (error.code === "23505") {
    const existing = input.providerMessageId
      ? await client
          .from("whatsapp_webhook_events")
          .select("id")
          .eq("provider", "uazapi")
          .eq("provider_message_id", input.providerMessageId)
          .maybeSingle<WebhookEventRow>()
          .then((result) => result.data)
      : null;

    if (existing) {
      return { eventId: existing.id, duplicate: true };
    }

    const { data: byHash } = await client
      .from("whatsapp_webhook_events")
      .select("id")
      .eq("provider", "uazapi")
      .eq("payload_hash", input.payloadHash)
      .maybeSingle<WebhookEventRow>();

    return { eventId: byHash?.id ?? null, duplicate: true };
  }

  throw new Error(`Nao foi possivel registrar webhook Uazapi: ${error.message}`);
}

async function markWebhookEvent(client: SupabaseClient, eventId: string | null, status: string, errorMessage?: string) {
  if (!eventId) {
    return;
  }

  await client
    .from("whatsapp_webhook_events")
    .update({
      processing_status: status,
      processed_at: new Date().toISOString(),
      error_message: errorMessage ?? null,
    })
    .eq("id", eventId);
}

async function ensureLead(
  client: SupabaseClient,
  input: {
    organizationId: string;
    phoneNumber: string;
    displayName: string | null;
    lastEventSummary: string | null;
    lastMessageAt: string;
    profileImageUrl: string | null;
    providerChatId: string | null;
    providerMessageId: string | null;
  },
) {
  const { data: existing } = await client
    .from("leads")
    .select("id, display_name, metadata")
    .eq("organization_id", input.organizationId)
    .eq("channel", "whatsapp")
    .eq("phone_number", input.phoneNumber)
    .maybeSingle<LeadRow>();
  const incomingDisplayName = normalizeLeadNameCandidate(input.displayName);
  const incomingDisplayNameIsPersonal = isLikelyPersonalLeadName(incomingDisplayName);

  if (existing) {
    const metadata = buildLeadMetadata(readRecord(existing.metadata), {
      createdFrom: null,
      displayName: incomingDisplayName,
      lastSource: "uazapi_webhook",
      profileImageUrl: input.profileImageUrl,
      providerChatId: input.providerChatId,
      providerMessageId: input.providerMessageId,
    });
    const safeExistingName = resolveLeadPersonalName({
      displayName: existing.display_name,
      metadata,
    });
    const updatePayload: JsonRecord = {
      status: "active",
      last_event_summary: input.lastEventSummary,
      last_message_at: input.lastMessageAt,
      metadata,
    };

    if (incomingDisplayNameIsPersonal && incomingDisplayName) {
      updatePayload.display_name = incomingDisplayName;
    } else if (safeExistingName) {
      updatePayload.display_name = safeExistingName;
    } else if (existing.display_name && !isLikelyPersonalLeadName(existing.display_name)) {
      updatePayload.display_name = null;
    }

    const { data, error } = await client
      .from("leads")
      .update(updatePayload)
      .eq("id", existing.id)
      .select("id, display_name, metadata")
      .single<LeadRow>();

    if (error) {
      throw new Error(`Nao foi possivel atualizar lead: ${error.message}`);
    }

    return data;
  }

  const { data, error } = await client
    .from("leads")
    .insert({
      organization_id: input.organizationId,
      channel: "whatsapp",
      phone_number: input.phoneNumber,
      display_name: incomingDisplayNameIsPersonal ? incomingDisplayName : null,
      status: "active",
      source: "uazapi_webhook",
      last_event_summary: input.lastEventSummary,
      last_message_at: input.lastMessageAt,
      metadata: buildLeadMetadata(null, {
        createdFrom: "uazapi_webhook",
        displayName: incomingDisplayName,
        lastSource: "uazapi_webhook",
        profileImageUrl: input.profileImageUrl,
        providerChatId: input.providerChatId,
        providerMessageId: input.providerMessageId,
      }),
    })
    .select("id, display_name, metadata")
    .single<LeadRow>();

  if (error) {
    throw new Error(`Nao foi possivel criar lead: ${error.message}`);
  }

  return data;
}

async function ensureConversation(
  client: SupabaseClient,
  input: {
    organizationId: string;
    leadId: string | null;
    whatsappInstanceId: string;
    providerChatId: string | null;
    isGroupChat: boolean;
    lastMessagePreview: string | null;
    lastMessageAt: string;
  },
) {
  const { data: existing } = input.providerChatId
    ? await client
        .from("conversations")
        .select("id, metadata")
        .eq("organization_id", input.organizationId)
        .eq("provider", "uazapi")
        .eq("provider_chat_id", input.providerChatId)
        .eq("whatsapp_instance_id", input.whatsappInstanceId)
        .maybeSingle<ConversationRow>()
    : { data: null };

  if (existing) {
    const { data, error } = await client
      .from("conversations")
      .update({
        lead_id: input.leadId,
        whatsapp_instance_id: input.whatsappInstanceId,
        status: "open",
        last_message_preview: input.lastMessagePreview,
        last_message_at: input.lastMessageAt,
        metadata: {
          ...(existing.metadata ?? {}),
          is_group_chat: input.isGroupChat,
          chat_kind: input.isGroupChat ? "group" : "direct",
        },
      })
      .eq("id", existing.id)
      .select("id, metadata")
      .single<ConversationRow>();

    if (error) {
      throw new Error(`Nao foi possivel atualizar conversa: ${error.message}`);
    }

    return data;
  }

  const { data, error } = await client
    .from("conversations")
    .insert({
      organization_id: input.organizationId,
      lead_id: input.leadId,
      whatsapp_instance_id: input.whatsappInstanceId,
      channel: "whatsapp",
      provider: "uazapi",
      provider_chat_id: input.providerChatId,
      status: "open",
      last_message_preview: input.lastMessagePreview,
      last_message_at: input.lastMessageAt,
      metadata: {
        created_from: "uazapi_webhook",
        is_group_chat: input.isGroupChat,
        chat_kind: input.isGroupChat ? "group" : "direct",
      },
    })
    .select("id, metadata")
    .single<ConversationRow>();

  if (error) {
    throw new Error(`Nao foi possivel criar conversa: ${error.message}`);
  }

  return data;
}

async function insertConversationMessage(
  client: SupabaseClient,
  input: {
    organizationId: string;
    conversationId: string;
    leadId: string | null;
    whatsappInstanceId: string;
    message: MessageSnapshot;
    payload: JsonRecord;
  },
) {
  const messagePayload = buildConversationMessagePayload(input.payload, input.message);
  const insertPayload = {
    organization_id: input.organizationId,
    conversation_id: input.conversationId,
    lead_id: input.leadId,
    whatsapp_instance_id: input.whatsappInstanceId,
    provider: "uazapi",
    provider_message_id: input.message.providerMessageId,
    provider_chat_id: input.message.providerChatId,
    direction: input.message.direction,
    message_type: input.message.messageType,
    text_content: input.message.textContent,
    payload: messagePayload,
    occurred_at: input.message.occurredAt,
  };
  const { data, error } = await client
    .from("conversation_messages")
    .insert(insertPayload)
    .select("id")
    .single<{ id: string }>();

  if (!error) {
    return data;
  }

  if (error.code === "23505" && input.message.providerMessageId) {
    const { data: existing } = await client
      .from("conversation_messages")
      .select("id")
      .eq("provider", "uazapi")
      .eq("provider_message_id", input.message.providerMessageId)
      .maybeSingle<{ id: string }>();

    if (existing) {
      return existing;
    }
  }

  throw new Error(`Nao foi possivel registrar mensagem: ${error.message}`);
}

async function markConversationHandledByHuman(
  client: SupabaseClient,
  conversationId: string,
  message: MessageSnapshot,
  humanInterventionMinutes: number,
) {
  const occurredAtMs = new Date(message.occurredAt).getTime();
  const nowMs = Date.now();
  const humanInterventionMs = humanInterventionMinutes * 60 * 1000;

  if (Number.isFinite(occurredAtMs) && nowMs - occurredAtMs > humanInterventionMs) {
    return;
  }

  const pauseBaseMs = Number.isFinite(occurredAtMs) && occurredAtMs <= nowMs ? occurredAtMs : nowMs;
  const pausedUntil = new Date(pauseBaseMs + humanInterventionMs).toISOString();
  const { data } = await client
    .from("conversations")
    .select("metadata")
    .eq("id", conversationId)
    .maybeSingle<{ metadata: JsonRecord | null }>();
  const metadata = readRecord(data?.metadata);
  const currentHuman = readRecord(metadata?.human_intervention);

  await client
    .from("conversations")
    .update({
      metadata: {
        ...(metadata ?? {}),
        human_intervention: {
          ...(currentHuman ?? {}),
          active: true,
          reason: "human_outbound_from_connected_whatsapp",
          source: "connected_whatsapp",
          configured_minutes: humanInterventionMinutes,
          last_human_message_at: message.occurredAt,
          lead_waiting_since: null,
          last_unanswered_lead_message_at: null,
          last_unanswered_lead_provider_message_id: null,
          auto_resume_reason: null,
          auto_resume_after: null,
          paused_until: pausedUntil,
          updated_at: new Date().toISOString(),
        },
      },
    })
    .eq("id", conversationId);

  await cancelQueuedWhatsappRunsForConversation(
    client,
    conversationId,
    "Cancelado: humano respondeu pelo WhatsApp conectado.",
  );
}

async function enqueueWhatsappAgentRun(
  client: SupabaseClient,
  input: {
    organizationId: string;
    leadId: string | null;
    conversationId: string;
    whatsappInstanceId: string;
    webhookEventId: string | null;
    providerMessageId: string | null;
    providerChatId: string | null;
    isGroupChat: boolean;
    phoneNumber: string | null;
    messageType: string | null;
    textContent: string | null;
    eventType: string;
    allowPausedConversation?: boolean;
    humanFallbackResumeAt?: string | null;
  },
) {
  const instanceMetadata = await loadWhatsappInstanceMetadata(client, input.whatsappInstanceId);
  const sectorId = asString(instanceMetadata?.sector_id);
  const clientAgentId = asString(instanceMetadata?.agent_id);
  const isPlatformWhatsapp = instanceMetadata?.admin_whatsapp === true && Boolean(sectorId);
  const agent = isPlatformWhatsapp && sectorId
    ? await findPlatformSectorWhatsappAgent(client, sectorId)
    : await findOrganizationWhatsappAgent(client, input.organizationId, clientAgentId);

  if (!agent?.id) {
    return null;
  }

  const behavior = await resolveWebhookBehaviorConfig(client, {
    organizationId: input.organizationId,
    instanceMetadata,
    agent,
    isPlatformWhatsapp,
  });
  const isGroupChat = input.isGroupChat || isWhatsappGroupChatId(input.providerChatId);

  if (isGroupChat && !behavior.allowGroupChats) {
    return null;
  }

  const groupTargetDecision = isGroupChat
    ? await loadWhatsappGroupTargetDecision(client, {
        whatsappInstanceId: input.whatsappInstanceId,
        providerChatId: input.providerChatId,
      })
    : null;

  if (groupTargetDecision && !groupTargetDecision.allowed) {
    return null;
  }

  const groupTargetMetadata = groupTargetDecision?.policy
    ? {
        groupTargetId: groupTargetDecision.policy.groupTargetId,
        groupTargetName: groupTargetDecision.policy.groupTargetName,
        groupReplyMode: groupTargetDecision.policy.groupReplyMode,
        groupMentionMode: groupTargetDecision.policy.groupMentionMode,
        groupRequireApproval: groupTargetDecision.policy.groupRequireApproval,
        groupMaxRepliesPerHour: groupTargetDecision.policy.groupMaxRepliesPerHour,
        groupMuteUntil: groupTargetDecision.policy.groupMuteUntil,
      }
    : {};

  if (!isGroupChat && isWhatsappHandoffNotificationRecipient(behavior, input.phoneNumber)) {
    return null;
  }

  if (!isGroupChat && !input.allowPausedConversation && await isConversationPausedForHuman(client, input.conversationId)) {
    return null;
  }

  const messageGroupingSeconds = Math.max(behavior.timingTextBurstSeconds, 5);
  const groupingCutoff = new Date(Date.now() - messageGroupingSeconds * 1000).toISOString();
  const { data: recentRun } = await client
    .from("agent_runs")
    .select("id")
    .eq("agent_id", agent.id)
    .eq("trigger_source", "connectyhub/whatsapp.message.received")
    .eq("run_status", "queued")
    .contains("metadata", { conversationId: input.conversationId })
    .gte("created_at", groupingCutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (recentRun) {
    const { data: updatedRun, error: updateError } = await client
      .from("agent_runs")
      .update({
        input_summary: preview(input.textContent, 240) ?? "Mensagem WhatsApp recebida.",
        metadata: {
          leadId: input.leadId,
          conversationId: input.conversationId,
          whatsappInstanceId: input.whatsappInstanceId,
          webhookEventId: input.webhookEventId,
          providerMessageId: input.providerMessageId,
          providerChatId: input.providerChatId,
          isGroupChat,
          chatKind: isGroupChat ? "group" : "direct",
          ...groupTargetMetadata,
          phoneNumber: input.phoneNumber,
          messageType: input.messageType,
          providerEventType: input.eventType,
          debounced: true,
          debounced_at: new Date().toISOString(),
          messageGroupingSeconds,
          ...(input.humanFallbackResumeAt
            ? {
                humanFallback: true,
                humanFallbackReason: "lead_unanswered_after_handoff",
                humanFallbackResumeAt: input.humanFallbackResumeAt,
              }
            : {}),
          ...(isPlatformWhatsapp
            ? {
                platformWhatsapp: true,
                sectorId,
                sectorCode: asString(instanceMetadata?.sector_code),
                sectorName: asString(instanceMetadata?.sector_name),
              }
            : {
                clientAgentId: agent.id,
                sectorCode: asString(instanceMetadata?.sector_code),
                sectorName: asString(instanceMetadata?.sector_name),
              }),
        },
      })
      .eq("id", recentRun.id)
      .eq("run_status", "queued")
      .select("id")
      .maybeSingle<{ id: string }>();

    if (updateError) {
      throw new Error(`Nao foi possivel atualizar execucao WhatsApp agrupada: ${updateError.message}`);
    }

    if (updatedRun?.id) {
      return { id: updatedRun.id, metadata: null };
    }
  }

  const { data, error } = await client
    .from("agent_runs")
    .insert({
      agent_id: agent.id,
      organization_id: input.organizationId,
      run_status: "queued",
      trigger_source: "connectyhub/whatsapp.message.received",
      input_summary: preview(input.textContent, 240) ?? "Mensagem WhatsApp recebida.",
      metadata: {
        leadId: input.leadId,
        conversationId: input.conversationId,
        whatsappInstanceId: input.whatsappInstanceId,
        webhookEventId: input.webhookEventId,
        providerMessageId: input.providerMessageId,
        providerChatId: input.providerChatId,
        isGroupChat,
        chatKind: isGroupChat ? "group" : "direct",
        ...groupTargetMetadata,
        phoneNumber: input.phoneNumber,
        messageType: input.messageType,
        providerEventType: input.eventType,
        messageGroupingSeconds,
        ...(input.humanFallbackResumeAt
          ? {
              humanFallback: true,
              humanFallbackReason: "lead_unanswered_after_handoff",
              humanFallbackResumeAt: input.humanFallbackResumeAt,
            }
          : {}),
        ...(isPlatformWhatsapp
          ? {
              platformWhatsapp: true,
              sectorId,
              sectorCode: asString(instanceMetadata?.sector_code),
              sectorName: asString(instanceMetadata?.sector_name),
            }
          : {
              clientAgentId: agent.id,
              sectorCode: asString(instanceMetadata?.sector_code),
              sectorName: asString(instanceMetadata?.sector_name),
            }),
      },
    })
    .select("id, metadata")
    .single<{ id: string; metadata: JsonRecord | null }>();

  if (error) {
    throw new Error(`Nao foi possivel enfileirar agente WhatsApp: ${error.message}`);
  }

  return data;
}

async function loadWhatsappInstanceMetadata(client: SupabaseClient, whatsappInstanceId: string) {
  const { data } = await client
    .from("whatsapp_instances")
    .select("metadata")
    .eq("id", whatsappInstanceId)
    .maybeSingle<{ metadata: JsonRecord | null }>();

  return isRecord(data?.metadata) ? data.metadata : null;
}

async function loadWhatsappGroupTargetDecision(
  client: SupabaseClient,
  input: {
    whatsappInstanceId: string;
    providerChatId: string | null;
  },
): Promise<{ allowed: boolean; reason: string | null; policy: WhatsappGroupTargetPolicy | null }> {
  const providerJid = normalizeGroupJid(input.providerChatId);
  if (!providerJid) {
    return { allowed: false, reason: "group_missing_chat_id", policy: null };
  }

  const { data, error } = await client
    .from("whatsapp_channel_targets")
    .select("id, provider_jid, display_name, enabled, reply_mode, mention_mode, require_approval, max_replies_per_hour, mute_until")
    .eq("whatsapp_instance_id", input.whatsappInstanceId)
    .eq("target_type", "group")
    .eq("provider_jid", providerJid)
    .maybeSingle<{
      id: string;
      provider_jid: string;
      display_name: string | null;
      enabled: boolean | null;
      reply_mode: string | null;
      mention_mode: string | null;
      require_approval: boolean | null;
      max_replies_per_hour: number | null;
      mute_until: string | null;
    }>();

  if (error) {
    if (isMissingWhatsappChannelTargetsTable(error)) {
      return { allowed: true, reason: "group_target_table_missing", policy: null };
    }
    return { allowed: false, reason: "group_target_lookup_failed", policy: null };
  }

  if (!data) {
    return { allowed: false, reason: "group_target_not_configured", policy: null };
  }

  if (data.enabled !== true) {
    return { allowed: false, reason: "group_target_disabled", policy: null };
  }

  const muteUntil = parseFutureIsoDate(data.mute_until);
  if (muteUntil) {
    return { allowed: false, reason: "group_target_muted", policy: null };
  }

  const replyMode = normalizeGroupTargetReplyMode(data.reply_mode);
  if (replyMode === "off") {
    return { allowed: false, reason: "group_target_off", policy: null };
  }

  return {
    allowed: true,
    reason: null,
    policy: {
      groupTargetId: data.id,
      groupTargetName: data.display_name,
      groupReplyMode: replyMode,
      groupMentionMode: normalizeGroupTargetMentionMode(data.mention_mode),
      groupRequireApproval: data.require_approval === true,
      groupMaxRepliesPerHour: clampInteger(data.max_replies_per_hour, 0, 120, 6),
      groupMuteUntil: data.mute_until,
    },
  };
}

async function findPlatformSectorWhatsappAgent(client: SupabaseClient, sectorId: string) {
  const { data } = await client
    .from("agent_registry")
    .select("id, metadata")
    .eq("scope", "platform")
    .is("organization_id", null)
    .contains("metadata", { admin_whatsapp: true, agent_kind: "whatsapp", sector_id: sectorId })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<AgentRow>();

  return data ?? null;
}

async function findOrganizationWhatsappAgent(client: SupabaseClient, organizationId: string, agentId?: string | null) {
  if (agentId) {
    const { data } = await client
      .from("agent_registry")
      .select("id, metadata")
      .eq("id", agentId)
      .eq("scope", "organization")
      .eq("organization_id", organizationId)
      .contains("metadata", { client_created: true, agent_kind: "whatsapp" })
      .maybeSingle<AgentRow>();

    if (data) {
      return data;
    }
  }

  const { data } = await client
    .from("agent_registry")
    .select("id, metadata")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .contains("metadata", { client_created: true, agent_kind: "whatsapp" })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<AgentRow>();

  return data ?? null;
}

async function resolveWebhookBehaviorConfig(
  client: SupabaseClient,
  input: {
    organizationId: string;
    instanceMetadata: JsonRecord | null;
    agent: AgentRow;
    isPlatformWhatsapp: boolean;
  },
) {
  const instanceConfig = readRecord(input.instanceMetadata?.behavior_config);
  const agentConfig = readRecord(input.agent.metadata)?.whatsapp_behavior_config;

  if (instanceConfig) {
    return normalizeWhatsappBehaviorConfig(instanceConfig);
  }

  if (!input.isPlatformWhatsapp) {
    const globalConfig = await loadOrganizationGlobalBehaviorConfig(client, input.organizationId);
    return normalizeWhatsappBehaviorConfig(agentConfig ?? globalConfig);
  }

  return normalizeWhatsappBehaviorConfig(agentConfig);
}

async function loadOrganizationGlobalBehaviorConfig(client: SupabaseClient, organizationId: string) {
  const { data } = await client
    .from("agent_registry")
    .select("metadata")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .eq("agent_code", "agente-whatsapp-global")
    .maybeSingle<{ metadata: JsonRecord | null }>();

  return readRecord(data?.metadata)?.whatsapp_behavior_config ?? null;
}

async function createIntelligenceEvent(
  client: SupabaseClient,
  input: {
    organizationId: string;
    leadId: string | null;
    conversationId: string;
    webhookEventId: string | null;
    agentRunId: string | null;
    title: string;
    summary: string | null;
    eventType: string;
  },
) {
  await client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: input.organizationId,
    source_type: "whatsapp",
    source_id: input.conversationId,
    event_type: input.eventType,
    title: input.title,
    summary: preview(input.summary, 500),
    confidence: 0.75,
    tags: ["whatsapp", "uazapi", "lead"],
    payload: {
      leadId: input.leadId,
      conversationId: input.conversationId,
      webhookEventId: input.webhookEventId,
      agentRunId: input.agentRunId,
    },
  });
}

type MessageSnapshot = {
  providerMessageId: string | null;
  providerChatId: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
  isGroupChat: boolean;
  fromMe: boolean | null;
  sentByApi: boolean | null;
  direction: "inbound" | "outbound" | "system" | "unknown";
  messageType: string | null;
  textContent: string | null;
  occurredAt: string;
};

function extractMessageSnapshot(payload: JsonRecord): MessageSnapshot {
  const messageRecord = findMessageRecord(payload) ?? payload;
  const providerChatId = findString(messageRecord, ["chatid", "chatId", "chat_id", "remoteJid", "jid", "from", "to"])
    ?? findNestedString(messageRecord, ["remoteJid", "participant"]);
  const isGroupChat = isWhatsappGroupChatId(providerChatId)
    || findBoolean(messageRecord, ["isGroup", "is_group", "fromGroup", "from_group"])
    || findNestedBoolean(messageRecord, ["isGroup", "is_group", "fromGroup", "from_group"])
    || false;
  const textContent =
    findString(messageRecord, ["text", "body", "caption", "content", "messageText"])
    ?? findNestedString(messageRecord, ["conversation", "text", "caption"]);
  const providerMessageId =
    findString(messageRecord, ["messageId", "message_id", "messageid", "id"])
    ?? findNestedString(messageRecord, ["id", "messageId"]);
  const fromMe = findBoolean(messageRecord, ["fromMe", "from_me"])
    ?? findNestedBoolean(messageRecord, ["fromMe", "from_me"]);
  const sentByApi = findBoolean(messageRecord, ["wasSentByApi", "sentByApi", "sent_by_api", "fromApi"])
    ?? findNestedBoolean(messageRecord, ["wasSentByApi", "sentByApi", "sent_by_api", "fromApi"]);
  const outbound = typeof fromMe === "boolean" ? fromMe : sentByApi === true ? true : null;
  const messageType = resolveMessageType(messageRecord);
  const occurredAt = parseOccurredAt(findUnknown(messageRecord, ["timestamp", "messageTimestamp", "date", "created", "createdAt"]));

  return {
    providerMessageId,
    providerChatId,
    phoneNumber: isGroupChat ? null : normalizePhone(providerChatId),
    displayName: findString(messageRecord, ["pushName", "senderName", "name", "notifyName", "profileName"]),
    profileImageUrl: readLeadProfileImageUrl(messageRecord) ?? readLeadProfileImageUrl(payload),
    isGroupChat,
    fromMe,
    sentByApi,
    direction: typeof outbound === "boolean" ? (outbound ? "outbound" : "inbound") : "unknown",
    messageType,
    textContent,
    occurredAt,
  };
}

type MessageAuthorType = "lead" | "ai" | "human" | "system" | "unknown";

function buildConversationMessagePayload(payload: JsonRecord, message: MessageSnapshot) {
  const author = resolveWebhookMessageAuthor(message, payload);

  return {
    ...payload,
    author_type: author.type,
    author_label: author.label,
    author_source: author.source,
    message_author: {
      ...author,
      from_me: message.fromMe,
      sent_by_api: message.sentByApi,
    },
    is_group_chat: message.isGroupChat,
    chat_kind: message.isGroupChat ? "group" : "direct",
  };
}

function resolveWebhookMessageAuthor(message: MessageSnapshot, payload: JsonRecord): {
  type: MessageAuthorType;
  label: string;
  source: string;
} {
  if (message.direction === "inbound") {
    return { type: "lead", label: "Lead", source: "whatsapp_lead" };
  }

  if (message.direction === "outbound") {
    if (isApiAuthoredWhatsappMessage(message, payload)) {
      return { type: "ai", label: "Agente IA", source: "uazapi_api_echo" };
    }

    return { type: "human", label: "Humano", source: "connected_whatsapp" };
  }

  if (message.direction === "system") {
    return { type: "system", label: "Sistema", source: "webhook_system" };
  }

  return { type: "unknown", label: "Desconhecido", source: "webhook_unknown" };
}

function isHumanAuthoredWhatsappMessage(message: MessageSnapshot, payload: JsonRecord) {
  return message.direction === "outbound" && !isApiAuthoredWhatsappMessage(message, payload);
}

function isApiAuthoredWhatsappMessage(message: MessageSnapshot, payload: JsonRecord) {
  if (isDashboardHumanReply(payload)) {
    return false;
  }

  if (message.sentByApi === true) {
    return true;
  }

  const trackSource = findNestedString(payload, ["track_source", "trackSource"]);

  if (trackSource?.toLowerCase().includes("connectyhub")) {
    return true;
  }

  const trackId = findNestedString(payload, ["track_id", "trackId"]);

  if (trackId && /^(agent_text_|agent_audio_|lead_opt_out_|human_handoff_)/.test(trackId)) {
    return true;
  }

  const agentRunId = findNestedString(payload, ["agent_run_id", "agentRunId"]);

  if (agentRunId) {
    return true;
  }

  return false;
}

function isDashboardHumanReply(payload: JsonRecord) {
  const trackSource = findNestedString(payload, ["track_source", "trackSource"]);

  if (trackSource === "connectyhub_dashboard_human") {
    return true;
  }

  const trackId = findNestedString(payload, ["track_id", "trackId"]);

  if (trackId?.startsWith("dashboard_human_reply_")) {
    return true;
  }

  const authorSource = findNestedString(payload, ["author_source", "authorSource", "source"]);
  const authorType = findNestedString(payload, ["author_type", "authorType", "type"]);

  return authorSource === "connectyhub_dashboard" && authorType === "human";
}

function buildLeadMetadata(
  baseMetadata: JsonRecord | null,
  input: {
    createdFrom: string | null;
    displayName: string | null;
    lastSource: string;
    profileImageUrl: string | null;
    providerChatId: string | null;
    providerMessageId: string | null;
  },
) {
  const displayName = normalizeLeadNameCandidate(input.displayName);
  const displayNameKind = classifyWhatsappLeadDisplayName(displayName);
  const metadata: JsonRecord = {
    ...(baseMetadata ?? {}),
    last_source: input.lastSource,
    ...(input.createdFrom ? { created_from: input.createdFrom } : {}),
    ...(displayName ? {
      last_display_name: displayName,
      whatsapp_display_name: displayName,
      whatsapp_display_name_kind: displayNameKind,
    } : {}),
    ...(displayName && isLikelyPersonalLeadName(displayName) ? {
      person_name: displayName,
      personal_name: displayName,
      name: displayName,
      lead_name: displayName,
    } : {}),
    ...(input.providerChatId ? { last_provider_chat_id: input.providerChatId } : {}),
    ...(input.providerMessageId ? { last_provider_message_id: input.providerMessageId } : {}),
  };

  return input.profileImageUrl
    ? mergeLeadProfileImageMetadata(metadata, {
        profileImageUrl: input.profileImageUrl,
        source: "webhook_payload",
        providerChatId: input.providerChatId,
      })
    : metadata;
}

function resolveMessageType(messageRecord: JsonRecord) {
  return findString(messageRecord, ["messageType", "mediaType", "kind"])
    ?? inferMessageTypeFromContent(messageRecord)
    ?? findString(messageRecord, ["type"])
    ?? "text";
}

function inferMessageTypeFromContent(messageRecord: JsonRecord) {
  const content = isRecord(messageRecord.content) ? messageRecord.content : null;
  const signature = normalizeMessageSignature(messageRecord);
  const mimeType = [
    findString(messageRecord, ["mimetype", "mimeType"]),
    content ? findString(content, ["mimetype", "mimeType"]) : null,
  ].filter(Boolean).join(" ").toLowerCase();

  if (
    findBoolean(content ?? {}, ["PTT", "ptt"])
    || mimeType.includes("audio")
    || isAudioSignature(signature)
  ) {
    return "AudioMessage";
  }

  if (mimeType.includes("image") || signature.includes("imagemessage") || signature.includes("image message")) {
    return "ImageMessage";
  }

  if (mimeType.includes("video") || signature.includes("videomessage") || signature.includes("video message")) {
    return "VideoMessage";
  }

  if (
    mimeType.includes("pdf")
    || mimeType.includes("document")
    || mimeType.includes("application/")
    || signature.includes("documentmessage")
    || signature.includes("document message")
  ) {
    return "DocumentMessage";
  }

  return null;
}

function isAudioSignature(signature: string) {
  return signature.includes("audio")
    || signature.includes("voice")
    || signature.includes("ptt")
    || signature.includes("opus")
    || signature.includes("ogg")
    || signature.includes("audiomessage")
    || signature.includes("audio message")
    || signature.includes("pttmessage")
    || signature.includes("ptt message");
}

function normalizeMessageSignature(value: unknown, depth = 0): string {
  if (depth > 3 || !value) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeMessageSignature(item, depth + 1)).join(" ");
  }

  if (!isRecord(value)) {
    return typeof value === "string" ? value.toLowerCase() : "";
  }

  const parts: string[] = [];

  for (const [key, item] of Object.entries(value)) {
    parts.push(key);

    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      parts.push(String(item));
    } else if (depth < 2) {
      parts.push(normalizeMessageSignature(item, depth + 1));
    }
  }

  return parts.join(" ").toLowerCase();
}

function findMessageRecord(payload: JsonRecord) {
  const directCandidates = [
    payload.message,
    payload.msg,
    payload.data,
    payload.result,
    Array.isArray(payload.messages) ? payload.messages[0] : null,
  ];

  for (const candidate of directCandidates) {
    if (isRecord(candidate)) {
      return candidate;
    }
  }

  return null;
}

function extractProviderInstanceId(payload: JsonRecord, requestUrl: string) {
  try {
    const url = new URL(requestUrl);
    const fromUrl = url.searchParams.get("instanceId") ?? url.searchParams.get("instance_id") ?? url.searchParams.get("instance");

    if (fromUrl) {
      return fromUrl;
    }
  } catch {}

  const fromPayload = findString(payload, ["instanceId", "instance_id", "instanceid"]);

  if (fromPayload) {
    return fromPayload;
  }

  return findNestedString(payload, ["instanceId", "instance_id"]);
}

function extractEventType(payload: JsonRecord) {
  return findString(payload, ["event", "type", "eventType", "EventType"]) ?? "unknown";
}

function normalizePayload(payload: unknown): JsonRecord {
  return isRecord(payload) ? payload : { value: payload };
}

function hashPayload(payload: JsonRecord) {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function sanitizeHeaders(headers: Headers): JsonRecord {
  const safe: JsonRecord = {};

  headers.forEach((value, key) => {
    const normalized = key.toLowerCase();

    if (
      normalized.includes("secret") ||
      normalized.includes("token") ||
      normalized.includes("authorization") ||
      normalized.includes("cookie")
    ) {
      safe[key] = "__redacted__";
      return;
    }

    if (["user-agent", "x-forwarded-for", "x-vercel-ip-country", "x-uazapi-event"].includes(normalized)) {
      safe[key] = value.slice(0, 240);
    }
  });

  return safe;
}

function findString(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function findNestedString(value: unknown, keys: string[], depth = 0): string | null {
  if (depth > 4) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNestedString(item, keys, depth + 1);

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const direct = findString(value, keys);

  if (direct) {
    return direct;
  }

  for (const nested of Object.values(value)) {
    const found = findNestedString(nested, keys, depth + 1);

    if (found) {
      return found;
    }
  }

  return null;
}

function findBoolean(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      if (value.toLowerCase() === "true") return true;
      if (value.toLowerCase() === "false") return false;
    }
  }

  return null;
}

function findNestedBoolean(value: unknown, keys: string[], depth = 0): boolean | null {
  if (depth > 4) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNestedBoolean(item, keys, depth + 1);

      if (typeof found === "boolean") {
        return found;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const direct = findBoolean(value, keys);

  if (typeof direct === "boolean") {
    return direct;
  }

  for (const nested of Object.values(value)) {
    const found = findNestedBoolean(nested, keys, depth + 1);

    if (typeof found === "boolean") {
      return found;
    }
  }

  return null;
}

function findUnknown(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }

  return null;
}

function parseOccurredAt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value < 10_000_000_000 ? value * 1000 : value).toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      return new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric).toISOString();
    }

    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

function normalizePhone(value: string | null) {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");

  return digits.length >= 8 ? digits : null;
}

function normalizeGroupJid(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (isWhatsappGroupChatId(trimmed)) return trimmed;
  const digits = trimmed.replace(/[^\d-]/g, "");
  return digits ? `${digits}@g.us` : null;
}

function isWhatsappGroupChatId(value: string | null | undefined) {
  return typeof value === "string" && /@g\.us(?:$|[^\w.-])/i.test(value.trim());
}

function normalizeGroupTargetReplyMode(value: unknown): WhatsappGroupTargetPolicy["groupReplyMode"] | "off" {
  if (value === "off" || value === "all" || value === "mentions" || value === "admins" || value === "observer") {
    return value;
  }
  return "mentions";
}

function normalizeGroupTargetMentionMode(value: unknown): WhatsappGroupTargetPolicy["groupMentionMode"] {
  if (value === "none" || value === "author" || value === "all") return value;
  return "none";
}

function parseFutureIsoDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime() > Date.now() ? date : null;
}

function clampInteger(value: number | null | undefined, min: number, max: number, fallback: number) {
  const number = Number.isFinite(value) ? Math.round(value as number) : fallback;
  return Math.min(max, Math.max(min, number));
}

function isMissingWhatsappChannelTargetsTable(error: unknown) {
  const record = readRecord(error);
  const code = asString(record?.code);
  const message = asString(record?.message)?.toLowerCase() ?? "";
  return code === "42P01" || message.includes("whatsapp_channel_targets");
}

function preview(value: string | null | undefined, maxLength: number) {
  const cleaned = value?.replace(/\s+/g, " ").trim() ?? "";

  if (!cleaned) {
    return null;
  }

  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 3)}...` : cleaned;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
