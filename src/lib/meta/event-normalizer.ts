import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetaWebhookEvent } from "./webhook-events";

type JsonRecord = Record<string, unknown>;

type MetaSocialChannel =
  | "instagram_direct"
  | "instagram_comments"
  | "facebook_messenger"
  | "facebook_comments";

type OrganizationIntegrationRef = {
  id: string;
  organization_id: string;
  metadata: JsonRecord | null;
};

type LeadRow = {
  id: string;
  display_name: string | null;
  metadata: JsonRecord | null;
};

type LeadChannelIdentityRow = {
  id: string;
  lead_id: string | null;
  metadata: JsonRecord | null;
};

type ConversationRow = {
  id: string;
  metadata: JsonRecord | null;
};

export type MetaCrmSnapshot = {
  channel: MetaSocialChannel;
  externalAccountId: string;
  externalUserId: string;
  externalUsername: string | null;
  displayName: string | null;
  providerChatId: string;
  providerMessageId: string;
  direction: "inbound" | "outbound" | "system" | "unknown";
  messageType: string;
  textContent: string | null;
  occurredAt: string;
  sourcePostId: string | null;
  sourceCommentId: string | null;
  rawEventType: string;
  metadata: JsonRecord;
};

export type MetaCrmNormalizeResult =
  | {
      status: "normalized";
      leadId: string;
      conversationId: string;
      messageId: string;
      channel: MetaSocialChannel;
    }
  | {
      status: "ignored";
      reason: string;
    };

export async function normalizeMetaEventToCrm(input: {
  client: SupabaseClient;
  event: MetaWebhookEvent;
  integration: OrganizationIntegrationRef;
  integrationEventId: string | null;
}): Promise<MetaCrmNormalizeResult> {
  const snapshot = buildMetaCrmSnapshot(input.event);

  if (!snapshot) {
    await markIntegrationEvent(input.client, input.integrationEventId, {
      status: "ignored",
      reason: "Evento Meta sem mensagem, comentario ou identidade de lead.",
    });

    return { status: "ignored", reason: "unsupported_meta_event" };
  }

  const lead = await ensureMetaLead(input.client, {
    organizationId: input.integration.organization_id,
    snapshot,
  });
  await upsertLeadChannelIdentity(input.client, {
    organizationId: input.integration.organization_id,
    leadId: lead.id,
    snapshot,
  });
  const conversation = await ensureMetaConversation(input.client, {
    organizationId: input.integration.organization_id,
    leadId: lead.id,
    snapshot,
  });
  const message = await insertMetaConversationMessage(input.client, {
    organizationId: input.integration.organization_id,
    leadId: lead.id,
    conversationId: conversation.id,
    snapshot,
    event: input.event,
  });

  await markIntegrationEvent(input.client, input.integrationEventId, {
    status: "processed",
  });

  return {
    status: "normalized",
    leadId: lead.id,
    conversationId: conversation.id,
    messageId: message.id,
    channel: snapshot.channel,
  };
}

export function buildMetaCrmSnapshot(event: MetaWebhookEvent): MetaCrmSnapshot | null {
  const payload = readRecord(event.payload) ?? {};
  const object = readString(payload.object) ?? "meta";
  const messaging = readRecord(payload.messaging);

  if (messaging) {
    return buildMessagingSnapshot({ event, object, messaging });
  }

  const change = readRecord(payload.change);

  if (change) {
    return buildChangeSnapshot({ event, object, change });
  }

  return null;
}

async function ensureMetaLead(
  client: SupabaseClient,
  input: {
    organizationId: string;
    snapshot: MetaCrmSnapshot;
  },
) {
  const existingIdentity = await findLeadChannelIdentity(client, input);
  const existingLead = existingIdentity?.lead_id
    ? await findLeadById(client, existingIdentity.lead_id)
    : null;
  const displayName = input.snapshot.displayName ?? input.snapshot.externalUsername;
  const metadata = buildLeadMetadata(existingLead?.metadata, input.snapshot);

  if (existingLead) {
    const { data, error } = await client
      .from("leads")
      .update({
        display_name: displayName ?? existingLead.display_name,
        status: "active",
        last_event_summary: input.snapshot.textContent,
        last_message_at: input.snapshot.occurredAt,
        metadata,
      })
      .eq("id", existingLead.id)
      .select("id, display_name, metadata")
      .single<LeadRow>();

    if (error || !data) {
      throw new Error(error?.message ?? "Nao foi possivel atualizar lead Meta.");
    }

    return data;
  }

  const { data, error } = await client
    .from("leads")
    .insert({
      organization_id: input.organizationId,
      channel: input.snapshot.channel,
      phone_number: null,
      display_name: displayName,
      status: "active",
      source: "meta_webhook",
      last_event_summary: input.snapshot.textContent,
      last_message_at: input.snapshot.occurredAt,
      metadata,
    })
    .select("id, display_name, metadata")
    .single<LeadRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel criar lead Meta.");
  }

  return data;
}

async function findLeadChannelIdentity(
  client: SupabaseClient,
  input: {
    organizationId: string;
    snapshot: MetaCrmSnapshot;
  },
) {
  const { data, error } = await client
    .from("lead_channel_identities")
    .select("id, lead_id, metadata")
    .eq("organization_id", input.organizationId)
    .eq("provider", "meta")
    .eq("channel", input.snapshot.channel)
    .eq("external_account_id", input.snapshot.externalAccountId)
    .eq("external_user_id", input.snapshot.externalUserId)
    .maybeSingle<LeadChannelIdentityRow>();

  if (error) {
    throw new Error(`Nao foi possivel consultar identidade Meta do lead: ${error.message}`);
  }

  return data ?? null;
}

async function findLeadById(client: SupabaseClient, leadId: string) {
  const { data, error } = await client
    .from("leads")
    .select("id, display_name, metadata")
    .eq("id", leadId)
    .maybeSingle<LeadRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar lead Meta: ${error.message}`);
  }

  return data ?? null;
}

async function upsertLeadChannelIdentity(
  client: SupabaseClient,
  input: {
    organizationId: string;
    leadId: string;
    snapshot: MetaCrmSnapshot;
  },
) {
  const existing = await findLeadChannelIdentity(client, input);
  const payload = {
    lead_id: input.leadId,
    external_username: input.snapshot.externalUsername,
    display_name: input.snapshot.displayName,
    last_seen_at: input.snapshot.occurredAt,
    metadata: {
      ...(existing?.metadata ?? {}),
      last_provider_chat_id: input.snapshot.providerChatId,
      last_provider_message_id: input.snapshot.providerMessageId,
      last_event_type: input.snapshot.rawEventType,
      last_channel: input.snapshot.channel,
      source_post_id: input.snapshot.sourcePostId,
      source_comment_id: input.snapshot.sourceCommentId,
    },
  };

  if (existing) {
    const { error } = await client
      .from("lead_channel_identities")
      .update(payload)
      .eq("id", existing.id);

    if (error) {
      throw new Error(`Nao foi possivel atualizar identidade Meta do lead: ${error.message}`);
    }

    return;
  }

  const { error } = await client
    .from("lead_channel_identities")
    .insert({
      organization_id: input.organizationId,
      lead_id: input.leadId,
      provider: "meta",
      channel: input.snapshot.channel,
      external_account_id: input.snapshot.externalAccountId,
      external_user_id: input.snapshot.externalUserId,
      external_username: input.snapshot.externalUsername,
      display_name: input.snapshot.displayName,
      first_seen_at: input.snapshot.occurredAt,
      last_seen_at: input.snapshot.occurredAt,
      metadata: payload.metadata,
    });

  if (error) {
    throw new Error(`Nao foi possivel criar identidade Meta do lead: ${error.message}`);
  }
}

async function ensureMetaConversation(
  client: SupabaseClient,
  input: {
    organizationId: string;
    leadId: string;
    snapshot: MetaCrmSnapshot;
  },
) {
  const { data: existing, error: lookupError } = await client
    .from("conversations")
    .select("id, metadata")
    .eq("organization_id", input.organizationId)
    .eq("provider", "meta")
    .eq("provider_chat_id", input.snapshot.providerChatId)
    .maybeSingle<ConversationRow>();

  if (lookupError) {
    throw new Error(`Nao foi possivel consultar conversa Meta: ${lookupError.message}`);
  }

  const metadata = buildConversationMetadata(existing?.metadata, input.snapshot);

  if (existing) {
    const { data, error } = await client
      .from("conversations")
      .update({
        lead_id: input.leadId,
        channel: input.snapshot.channel,
        status: "open",
        last_message_preview: input.snapshot.textContent,
        last_message_at: input.snapshot.occurredAt,
        metadata,
      })
      .eq("id", existing.id)
      .select("id, metadata")
      .single<ConversationRow>();

    if (error || !data) {
      throw new Error(error?.message ?? "Nao foi possivel atualizar conversa Meta.");
    }

    return data;
  }

  const { data, error } = await client
    .from("conversations")
    .insert({
      organization_id: input.organizationId,
      lead_id: input.leadId,
      whatsapp_instance_id: null,
      channel: input.snapshot.channel,
      provider: "meta",
      provider_chat_id: input.snapshot.providerChatId,
      status: "open",
      last_message_preview: input.snapshot.textContent,
      last_message_at: input.snapshot.occurredAt,
      metadata,
    })
    .select("id, metadata")
    .single<ConversationRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel criar conversa Meta.");
  }

  return data;
}

async function insertMetaConversationMessage(
  client: SupabaseClient,
  input: {
    organizationId: string;
    leadId: string;
    conversationId: string;
    snapshot: MetaCrmSnapshot;
    event: MetaWebhookEvent;
  },
) {
  const insertPayload = {
    organization_id: input.organizationId,
    conversation_id: input.conversationId,
    lead_id: input.leadId,
    whatsapp_instance_id: null,
    provider: "meta",
    provider_message_id: input.snapshot.providerMessageId,
    provider_chat_id: input.snapshot.providerChatId,
    direction: input.snapshot.direction,
    message_type: input.snapshot.messageType,
    text_content: input.snapshot.textContent,
    payload: {
      ...input.snapshot.metadata,
      raw_event_type: input.event.eventType,
      source_event_id: input.event.sourceEventId,
    },
    occurred_at: input.snapshot.occurredAt,
  };
  const { data, error } = await client
    .from("conversation_messages")
    .insert(insertPayload)
    .select("id")
    .single<{ id: string }>();

  if (!error && data) {
    return data;
  }

  if (error?.code === "23505") {
    const { data: existing } = await client
      .from("conversation_messages")
      .select("id")
      .eq("provider", "meta")
      .eq("provider_message_id", input.snapshot.providerMessageId)
      .maybeSingle<{ id: string }>();

    if (existing) {
      return existing;
    }
  }

  throw new Error(error?.message ?? "Nao foi possivel registrar mensagem Meta.");
}

async function markIntegrationEvent(
  client: SupabaseClient,
  integrationEventId: string | null,
  input: {
    status: "processed" | "ignored" | "failed";
    reason?: string;
  },
) {
  if (!integrationEventId) {
    return;
  }

  const payload: JsonRecord = {
    status: input.status,
    processed_at: new Date().toISOString(),
  };

  if (input.reason) {
    payload.error_message = input.reason;
  }

  const { error } = await client
    .from("integration_events")
    .update(payload)
    .eq("id", integrationEventId);

  if (error) {
    throw new Error(`Nao foi possivel atualizar evento Meta: ${error.message}`);
  }
}

function buildMessagingSnapshot(input: {
  event: MetaWebhookEvent;
  object: string;
  messaging: JsonRecord;
}): MetaCrmSnapshot | null {
  const sender = readRecord(input.messaging.sender);
  const recipient = readRecord(input.messaging.recipient);
  const message = readRecord(input.messaging.message);
  const postback = readRecord(input.messaging.postback);
  const senderId = readString(sender?.id);
  const recipientId = readString(recipient?.id);
  const externalAccountId = input.event.assetId ?? recipientId ?? "unknown";
  const isEcho = readBoolean(message?.is_echo) === true;
  const direction = isEcho || senderId === externalAccountId ? "outbound" : "inbound";
  const externalUserId = direction === "outbound"
    ? recipientId ?? senderId
    : senderId ?? recipientId;

  if (!externalUserId) {
    return null;
  }

  const channel: MetaSocialChannel = input.object === "instagram" ? "instagram_direct" : "facebook_messenger";
  const textContent = readString(message?.text)
    ?? readString(postback?.title)
    ?? readString(postback?.payload)
    ?? null;
  const providerMessageId = [
    channel,
    readString(message?.mid) ?? readString(message?.message_id) ?? input.event.sourceEventId,
  ].filter(Boolean).join(":");
  const occurredAt = parseMetaTimestamp(input.messaging.timestamp) ?? new Date().toISOString();
  const messageType = message
    ? readArray(message.attachments).length ? "attachment" : "text"
    : postback ? "postback" : "message";

  return {
    channel,
    externalAccountId,
    externalUserId,
    externalUsername: null,
    displayName: null,
    providerChatId: `${channel}:${externalAccountId}:${externalUserId}`,
    providerMessageId: providerMessageId || `${channel}:${externalAccountId}:${externalUserId}:${occurredAt}`,
    direction,
    messageType,
    textContent,
    occurredAt,
    sourcePostId: readString(readRecord(input.messaging.referral)?.source_id),
    sourceCommentId: null,
    rawEventType: input.event.eventType,
    metadata: {
      channel_kind: "private",
      sender,
      recipient,
      message,
      postback,
      referral: readRecord(input.messaging.referral),
    },
  };
}

function buildChangeSnapshot(input: {
  event: MetaWebhookEvent;
  object: string;
  change: JsonRecord;
}): MetaCrmSnapshot | null {
  const field = readString(input.change.field) ?? "change";
  const value = readRecord(input.change.value) ?? {};

  if (/leadgen/i.test(field) || readString(value.leadgen_id)) {
    return null;
  }

  const from = readRecord(value.from);
  const externalAccountId = input.event.assetId
    ?? readString(value.page_id)
    ?? readString(value.recipient_id)
    ?? readString(readRecord(input.event.payload.entry)?.id)
    ?? "unknown";
  const fromId = readString(from?.id)
    ?? readString(value.sender_id)
    ?? readString(value.user_id)
    ?? readString(value.from_id);
  const sourceCommentId = readString(value.comment_id)
    ?? readString(value.commentId)
    ?? readString(value.id);
  const externalUserId = fromId && fromId !== externalAccountId
    ? fromId
    : sourceCommentId ? `comment:${sourceCommentId}` : null;

  if (!externalUserId || !isCommentLikeField(field, value)) {
    return null;
  }

  const channel: MetaSocialChannel = input.object === "instagram" ? "instagram_comments" : "facebook_comments";
  const sourcePostId = readString(value.post_id)
    ?? readString(value.media_id)
    ?? readString(value.parent_id)
    ?? null;
  const textContent = readString(value.message)
    ?? readString(value.text)
    ?? readString(value.comment)
    ?? null;
  const occurredAt = parseMetaTimestamp(value.created_time ?? value.createdTime ?? value.timestamp)
    ?? new Date().toISOString();
  const direction = fromId && fromId === externalAccountId ? "outbound" : "inbound";

  return {
    channel,
    externalAccountId,
    externalUserId,
    externalUsername: readString(from?.username) ?? readString(value.username),
    displayName: readString(from?.name) ?? readString(value.name),
    providerChatId: `${channel}:${externalAccountId}:${sourcePostId ?? "post"}:${externalUserId}`,
    providerMessageId: [
      channel,
      sourceCommentId ?? input.event.sourceEventId ?? `${externalAccountId}:${externalUserId}:${occurredAt}`,
    ].filter(Boolean).join(":"),
    direction,
    messageType: "comment",
    textContent,
    occurredAt,
    sourcePostId,
    sourceCommentId,
    rawEventType: input.event.eventType,
    metadata: {
      channel_kind: "public_comment",
      field,
      value,
      from,
    },
  };
}

function buildLeadMetadata(existing: JsonRecord | null | undefined, snapshot: MetaCrmSnapshot): JsonRecord {
  return {
    ...(existing ?? {}),
    source: "meta_webhook",
    last_source: "meta_webhook",
    last_channel: snapshot.channel,
    last_provider: "meta",
    last_external_account_id: snapshot.externalAccountId,
    last_external_user_id: snapshot.externalUserId,
    last_provider_chat_id: snapshot.providerChatId,
    last_provider_message_id: snapshot.providerMessageId,
    last_source_post_id: snapshot.sourcePostId,
    last_source_comment_id: snapshot.sourceCommentId,
    last_meta_event_type: snapshot.rawEventType,
  };
}

function buildConversationMetadata(existing: JsonRecord | null | undefined, snapshot: MetaCrmSnapshot): JsonRecord {
  return {
    ...(existing ?? {}),
    created_from: (existing ?? {}).created_from ?? "meta_webhook",
    channel_kind: snapshot.channel.endsWith("_comments") ? "public_comment" : "direct",
    external_account_id: snapshot.externalAccountId,
    external_user_id: snapshot.externalUserId,
    external_username: snapshot.externalUsername,
    source_post_id: snapshot.sourcePostId,
    source_comment_id: snapshot.sourceCommentId,
    last_meta_event_type: snapshot.rawEventType,
  };
}

function isCommentLikeField(field: string, value: JsonRecord) {
  if (/comment|comments|feed|mention/i.test(field)) {
    return true;
  }

  return Boolean(
    readString(value.comment_id)
    || readString(value.commentId)
    || (readString(value.message) && (readString(value.post_id) || readString(value.media_id))),
  );
}

function parseMetaTimestamp(value: unknown) {
  const number = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : NaN;

  if (Number.isFinite(number)) {
    const milliseconds = number > 9_999_999_999 ? number : number * 1000;
    return new Date(milliseconds).toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }

  return null;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}
