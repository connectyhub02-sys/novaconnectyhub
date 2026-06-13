import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inngest } from "@/lib/inngest/client";
import { createServiceClient } from "@/lib/supabase/service";
import {
  mergeLeadProfileImageMetadata,
  readLeadProfileImageUrl,
  syncLeadAvatarFromUazapi,
} from "./lead-avatar-sync";

type JsonRecord = Record<string, unknown>;

type WhatsappInstanceRow = {
  id: string;
  organization_id: string;
  instance_token_encrypted: string | null;
  metadata: JsonRecord | null;
};

type LeadRow = {
  id: string;
  metadata: JsonRecord | null;
};

type ConversationRow = {
  id: string;
};

type AgentRow = {
  id: string;
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

  if (!message.providerChatId && !message.phoneNumber && !message.providerMessageId) {
    await markWebhookEvent(client, eventResult.eventId, "processed");
    return {
      ...baseResult,
      status: "processed",
    };
  }

  try {
    const lead = message.phoneNumber
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
      await markConversationHandledByHuman(client, conversation.id, message);
    }
    const agentRun = message.direction === "inbound"
      ? await enqueueWhatsappAgentRun(client, {
          organizationId: instance.organization_id,
          leadId: lead?.id ?? null,
          conversationId: conversation.id,
          whatsappInstanceId: instance.id,
          webhookEventId: eventResult.eventId,
          providerMessageId: message.providerMessageId,
          providerChatId: message.providerChatId,
          phoneNumber: message.phoneNumber,
          messageType: message.messageType,
          textContent: message.textContent,
          eventType,
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
        last_message_at: message.occurredAt,
        last_heartbeat_at: new Date().toISOString(),
      })
      .eq("id", instance.id);

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
    .maybeSingle<WhatsappInstanceRow>();

  if (data) {
    return data;
  }

  const { data: byProviderName } = await client
    .from("whatsapp_instances")
    .select("id, organization_id, instance_token_encrypted, metadata")
    .eq("provider", "uazapi")
    .contains("metadata", { provider_name: providerInstanceId })
    .maybeSingle<WhatsappInstanceRow>();

  return byProviderName ?? null;
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
    .select("id, metadata")
    .eq("organization_id", input.organizationId)
    .eq("channel", "whatsapp")
    .eq("phone_number", input.phoneNumber)
    .maybeSingle<LeadRow>();

  if (existing) {
    const metadata = buildLeadMetadata(readRecord(existing.metadata), {
      createdFrom: null,
      displayName: input.displayName,
      lastSource: "uazapi_webhook",
      profileImageUrl: input.profileImageUrl,
      providerChatId: input.providerChatId,
      providerMessageId: input.providerMessageId,
    });
    const updatePayload: JsonRecord = {
      status: "active",
      last_event_summary: input.lastEventSummary,
      last_message_at: input.lastMessageAt,
      metadata,
    };

    if (input.displayName) {
      updatePayload.display_name = input.displayName;
    }

    const { data, error } = await client
      .from("leads")
      .update(updatePayload)
      .eq("id", existing.id)
      .select("id, metadata")
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
      display_name: input.displayName,
      status: "active",
      source: "uazapi_webhook",
      last_event_summary: input.lastEventSummary,
      last_message_at: input.lastMessageAt,
      metadata: buildLeadMetadata(null, {
        createdFrom: "uazapi_webhook",
        displayName: input.displayName,
        lastSource: "uazapi_webhook",
        profileImageUrl: input.profileImageUrl,
        providerChatId: input.providerChatId,
        providerMessageId: input.providerMessageId,
      }),
    })
    .select("id, metadata")
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
    lastMessagePreview: string | null;
    lastMessageAt: string;
  },
) {
  const { data: existing } = input.providerChatId
    ? await client
        .from("conversations")
        .select("id")
        .eq("organization_id", input.organizationId)
        .eq("provider", "uazapi")
        .eq("provider_chat_id", input.providerChatId)
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
      })
      .eq("id", existing.id)
      .select("id")
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
      },
    })
    .select("id")
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

async function markConversationHandledByHuman(client: SupabaseClient, conversationId: string, message: MessageSnapshot) {
  const pausedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
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
          last_human_message_at: message.occurredAt,
          paused_until: pausedUntil,
          updated_at: new Date().toISOString(),
        },
      },
    })
    .eq("id", conversationId);
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
    phoneNumber: string | null;
    messageType: string | null;
    textContent: string | null;
    eventType: string;
  },
) {
  const instanceMetadata = await loadWhatsappInstanceMetadata(client, input.whatsappInstanceId);
  const sectorId = asString(instanceMetadata?.sector_id);
  const isPlatformWhatsapp = instanceMetadata?.admin_whatsapp === true && Boolean(sectorId);
  const agent = isPlatformWhatsapp && sectorId
    ? await findPlatformSectorWhatsappAgent(client, sectorId)
    : await findOrganizationWhatsappAgent(client, input.organizationId);

  if (!agent?.id) {
    return null;
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
        phoneNumber: input.phoneNumber,
        messageType: input.messageType,
        providerEventType: input.eventType,
        ...(isPlatformWhatsapp
          ? {
              platformWhatsapp: true,
              sectorId,
              sectorCode: asString(instanceMetadata?.sector_code),
              sectorName: asString(instanceMetadata?.sector_name),
            }
          : {}),
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

async function findPlatformSectorWhatsappAgent(client: SupabaseClient, sectorId: string) {
  const { data } = await client
    .from("agent_registry")
    .select("id")
    .eq("scope", "platform")
    .is("organization_id", null)
    .contains("metadata", { admin_whatsapp: true, agent_kind: "whatsapp", sector_id: sectorId })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<AgentRow>();

  return data ?? null;
}

async function findOrganizationWhatsappAgent(client: SupabaseClient, organizationId: string) {
  const { data } = await client
    .from("agent_registry")
    .select("id")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .contains("metadata", { client_created: true, agent_kind: "whatsapp" })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<AgentRow>();

  return data ?? null;
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
    phoneNumber: normalizePhone(providerChatId),
    displayName: findString(messageRecord, ["pushName", "senderName", "name", "notifyName", "profileName"]),
    profileImageUrl: readLeadProfileImageUrl(messageRecord) ?? readLeadProfileImageUrl(payload),
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
  if (message.sentByApi === true) {
    return true;
  }

  const trackSource = findNestedString(payload, ["track_source", "trackSource"]);

  return Boolean(trackSource?.toLowerCase().includes("connectyhub"));
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
  const metadata: JsonRecord = {
    ...(baseMetadata ?? {}),
    last_source: input.lastSource,
    ...(input.createdFrom ? { created_from: input.createdFrom } : {}),
    ...(input.displayName ? { last_display_name: input.displayName } : {}),
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
  const mimeType = [
    findString(messageRecord, ["mimetype", "mimeType"]),
    content ? findString(content, ["mimetype", "mimeType"]) : null,
  ].filter(Boolean).join(" ").toLowerCase();

  if (findBoolean(content ?? {}, ["PTT", "ptt"]) || mimeType.includes("audio")) {
    return "AudioMessage";
  }

  if (mimeType.includes("image")) {
    return "ImageMessage";
  }

  if (mimeType.includes("video")) {
    return "VideoMessage";
  }

  if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("application/")) {
    return "DocumentMessage";
  }

  return null;
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
  const fromPayload = findString(payload, ["instanceId", "instance_id", "instanceid", "instanceName", "instance_name", "instance", "session", "serverId"]);

  if (fromPayload) {
    return fromPayload;
  }

  try {
    const url = new URL(requestUrl);
    const fromUrl = url.searchParams.get("instanceId") ?? url.searchParams.get("instance_id") ?? url.searchParams.get("instance");

    if (fromUrl) {
      return fromUrl;
    }
  } catch {}

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
