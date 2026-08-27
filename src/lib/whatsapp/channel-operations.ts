import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOrganizationFeatureAccess } from "@/lib/billing/access-control";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import type { ClientSalesCatalogItem, SalesCatalogMedia, SalesCatalogMediaKind } from "@/lib/sales-catalog/shared";
import { loadGeminiCredentials, type GeminiCredentials } from "@/lib/gemini/credentials";
import { createServiceClient } from "@/lib/supabase/service";
import { generateConnectyVoiceAudio } from "@/lib/voice/tts";
import { normalizeWhatsappBehaviorConfig, type WhatsappBehaviorConfig } from "./agent-behavior";
import { loadUazapiCredentials, type UazapiCredentials } from "./uazapi-credentials";

type JsonRecord = Record<string, unknown>;
type WhatsappScope = "platform" | "organization";
type WhatsappOutboundOperation = "status" | "campaign_simple" | "newsletter_text" | "target_poll" | "group_announce_mode" | "target_carousel";
type WhatsappTargetType = "group" | "newsletter";
type WhatsappTargetReplyMode = "off" | "all" | "mentions" | "admins" | "observer";
type WhatsappTargetMentionMode = "none" | "author" | "all";
type WhatsappAutomationCapability = "groups" | "status" | "campaigns" | "newsletters" | "interactive";
type WhatsappCampaignRecurrenceFrequency = "daily" | "weekly";
type WhatsappCampaignDeliveryMode = "text" | "audio" | "text_audio";
type WhatsappCampaignInteractiveMode = "none" | "button";
type WhatsappGrowthPlanItemType = "text" | "audio" | "text_audio" | "carousel" | "status" | "poll";
type WhatsappStatusPayloadType = "text" | "image" | "video" | "audio" | "myaudio" | "ptt";
type WhatsappGroupIntelligenceStatus = "fresh" | "stale" | "missing" | "error";
type WhatsappGroupRiskLevel = "low" | "medium" | "high";
type SalesCatalogItemMapperInput = Parameters<typeof mapSalesCatalogItem>[0];

const outboundAudioDeliveryTimeoutMs = 30000;
const whatsappStatusTextMaxBytes = 620;
const whatsappStatusAiTargetChars = 420;

type WhatsappInstanceRow = {
  id: string;
  organization_id: string;
  provider_instance_id: string | null;
  phone_number: string | null;
  display_name: string | null;
  status: string;
  instance_token_encrypted: string | null;
  metadata: JsonRecord | null;
};

type AgentBehaviorRow = {
  metadata: JsonRecord | null;
};

type ContentPipelineRow = {
  id: string;
  scope: WhatsappScope;
  organization_id: string | null;
  content_type: string;
  status: string;
  title: string;
  summary: string | null;
  body: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  tags: string[] | null;
  metadata: JsonRecord | null;
  created_at: string;
};

type SalesCatalogMemoryRow = {
  id: string;
  organization_id: string | null;
  title: string;
  content: string;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

type WhatsappChannelTargetRow = {
  id: string;
  scope: WhatsappScope;
  organization_id: string | null;
  whatsapp_instance_id: string;
  agent_id: string | null;
  provider: string;
  target_type: string;
  provider_jid: string;
  display_name: string | null;
  description: string | null;
  participant_count: number | null;
  is_admin: boolean | null;
  is_announcement: boolean | null;
  enabled: boolean | null;
  campaign_enabled: boolean | null;
  reply_mode: string | null;
  mention_mode: string | null;
  require_approval: boolean | null;
  max_replies_per_hour: number | null;
  mute_until: string | null;
  last_synced_at: string | null;
  metadata: JsonRecord | null;
  created_at: string;
  updated_at: string;
};

export type WhatsappChannelTarget = {
  id: string;
  type: WhatsappTargetType;
  jid: string;
  name: string;
  description: string | null;
  participantCount: number | null;
  isAdmin: boolean | null;
  isAnnouncement: boolean | null;
  enabled: boolean;
  campaignEnabled: boolean;
  replyMode: WhatsappTargetReplyMode;
  mentionMode: WhatsappTargetMentionMode;
  requireApproval: boolean;
  maxRepliesPerHour: number;
  muteUntil: string | null;
  lastSyncedAt: string | null;
  groupIntelligence: WhatsappGroupIntelligence | null;
};

export type WhatsappGroupIntelligence = {
  status: WhatsappGroupIntelligenceStatus;
  riskLevel: WhatsappGroupRiskLevel;
  lastSyncedAt: string | null;
  participantCount: number | null;
  adminCount: number | null;
  memberCount: number | null;
  isAdmin: boolean | null;
  isAnnouncement: boolean | null;
  isLocked: boolean | null;
  pendingRequests: number | null;
  recommendations: string[];
  error: string | null;
};

export type WhatsappOperationalContext = {
  scope: WhatsappScope;
  organizationId: string | null;
  sectorId?: string | null;
  instance: WhatsappInstanceRow;
  token: string;
  credentials: UazapiCredentials;
  behavior: WhatsappBehaviorConfig;
};

export type WhatsappOutboundItem = {
  id: string;
  operation: string;
  status: string;
  title: string;
  summary: string | null;
  scheduledFor: string | null;
  publishedAt: string | null;
  createdAt: string;
  providerStatus: string | null;
  error: string | null;
  campaignTracking: WhatsappCampaignDeliveryTracking | null;
  recurrence: {
    frequency: WhatsappCampaignRecurrenceFrequency;
    occurrenceIndex: number;
    maxOccurrences: number;
    nextScheduledFor: string | null;
    seriesId: string | null;
  } | null;
};

export type WhatsappCampaignDeliverySample = {
  id: string | null;
  number: string | null;
  status: "scheduled" | "sent" | "failed" | "unknown";
  providerStatus: string | null;
  error: string | null;
  scheduledFor: string | null;
  sentAt: string | null;
};

export type WhatsappCampaignDeliveryTracking = {
  folderId: string;
  status: "pending" | "sent" | "failed" | "partial" | "unknown";
  total: number;
  sent: number;
  failed: number;
  scheduled: number;
  pending: number;
  lastSyncedAt: string;
  source: "uazapi_sender";
  error: string | null;
  samples: WhatsappCampaignDeliverySample[];
};

export type WhatsappOperationsAnalytics = {
  summary: {
    total: number;
    scheduled: number;
    published: number;
    failed: number;
    recurring: number;
    withMedia: number;
    withAudio: number;
    totalRecipients: number;
    trackedMessages: number;
    sentMessages: number;
    failedMessages: number;
    pendingMessages: number;
    carouselPosts: number;
    pollPosts: number;
    statusPosts: number;
  };
  calendar: Array<{
    id: string;
    title: string;
    operation: string;
    scheduledFor: string;
    targetCount: number;
    attachmentCount: number;
    deliveryMode: WhatsappCampaignDeliveryMode;
    recurring: boolean;
  }>;
  optimization: {
    nextSuggestedFor: string;
    recommendedHour: number;
    confidence: "low" | "medium" | "high";
    reasons: string[];
  };
  topProducts: Array<{
    id: string;
    title: string;
    count: number;
  }>;
  segments: Array<{
    id: string;
    label: string;
    count: number;
    description: string;
  }>;
};

export type WhatsappTargetCampaignDraft = {
  title: string;
  text: string;
  approvalChecklist: string[];
  targetCount: number;
  targetNames: string[];
  modelId: string;
  systemInstruction: string;
  prompt: string;
  responseData: unknown;
};

export type WhatsappStatusDraft = {
  text: string;
  backgroundColor: number;
  approvalChecklist: string[];
  productNames: string[];
  mediaUrl: string | null;
  mediaKind: "image" | "video" | null;
  modelId: string;
  systemInstruction: string;
  prompt: string;
  responseData: unknown;
};

export type WhatsappGrowthPlanItem = {
  id: string;
  day: number;
  slot: number;
  type: WhatsappGrowthPlanItemType;
  title: string;
  text: string;
  scheduledFor: string;
  targetIds: string[];
  productIds: string[];
  pollChoices: string[];
  buttonLabel: string | null;
};

export type WhatsappGrowthCampaignPlan = {
  title: string;
  objective: string;
  strategySummary: string;
  durationDays: number;
  postsPerDay: number;
  timezone: string;
  approvalChecklist: string[];
  targetCount: number;
  targetNames: string[];
  productNames: string[];
  items: WhatsappGrowthPlanItem[];
  modelId: string;
  systemInstruction: string;
  prompt: string;
  responseData: unknown;
};

export type WhatsappLeadStatusWatchProbe = {
  checkedAt: string;
  available: boolean;
  confidence: "low" | "medium";
  message: string;
  testedEndpoints: string[];
  statusChatFound: boolean;
  statusMessageFound: boolean;
  chatSamples: unknown[];
  messageSamples: unknown[];
  errors: string[];
};

const instanceSelect = "id, organization_id, provider_instance_id, phone_number, display_name, status, instance_token_encrypted, metadata";
const outboundTypes = ["whatsapp_status", "whatsapp_campaign", "whatsapp_newsletter", "whatsapp_group_window"];

export async function resolveClientWhatsappOperationalContext(
  client: SupabaseClient,
  organizationId: string,
  agentId?: string | null,
): Promise<WhatsappOperationalContext> {
  let query = client
    .from("whatsapp_instances")
    .select(instanceSelect)
    .eq("provider", "uazapi")
    .eq("organization_id", organizationId)
    .neq("status", "archived");

  if (agentId) {
    query = query.contains("metadata", { agent_id: agentId });
  }

  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<WhatsappInstanceRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar a instancia WhatsApp: ${error.message}`);
  }

  if (!data) {
    throw new Error("Conecte um WhatsApp antes de usar canais, status ou campanhas.");
  }

  return buildOperationalContext(client, data, "organization", organizationId, null);
}

export async function resolvePlatformWhatsappOperationalContext(
  client: SupabaseClient,
  sectorId: string,
): Promise<WhatsappOperationalContext> {
  const { data, error } = await client
    .from("whatsapp_instances")
    .select(instanceSelect)
    .eq("provider", "uazapi")
    .contains("metadata", { admin_whatsapp: true, sector_id: sectorId })
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<WhatsappInstanceRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar a instancia interna: ${error.message}`);
  }

  if (!data) {
    throw new Error("Conecte o WhatsApp interno deste setor antes de usar canais, status ou campanhas.");
  }

  return buildOperationalContext(client, data, "platform", null, sectorId);
}

export async function getWhatsappOperationsDashboard(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
) {
  const rows = await listWhatsappOutboundRows(client, context, 80);
  const history = rows.slice(0, 12).map(mapOutboundItem);

  return {
    instance: {
      id: context.instance.id,
      status: context.instance.status,
      displayName: context.instance.display_name,
      phoneNumber: context.instance.phone_number,
    },
    behavior: {
      groups: context.behavior.allowGroupChats,
      groupReplyMode: context.behavior.groupReplyMode,
      statusBroadcasts: context.behavior.statusBroadcasts,
      newsletterBroadcasts: context.behavior.newsletterBroadcasts,
      campaignBroadcasts: context.behavior.campaignBroadcasts,
      interactiveMessages: context.behavior.interactiveMessages,
      maxStatusRecipients: context.behavior.whatsappMaxStatusRecipients,
      campaignBatchSize: context.behavior.whatsappCampaignBatchSize,
      campaignDelayMinSeconds: context.behavior.whatsappCampaignDelayMinSeconds,
      campaignDelayMaxSeconds: context.behavior.whatsappCampaignDelayMaxSeconds,
    },
    targets: await listWhatsappChannelTargets(client, context),
    history,
    analytics: buildWhatsappOperationsAnalytics(rows),
  };
}

export async function fetchWhatsappGroups(context: WhatsappOperationalContext) {
  assertWhatsappConnected(context);

  const result = await callUazapi(context, "/group/list", {
    method: "GET",
    query: { noparticipants: true },
  });
  const targets = await syncWhatsappChannelTargets(createServiceClient(), context, "group", result.data);

  return {
    fetchedAt: new Date().toISOString(),
    count: targets.length,
    targets,
    data: sanitizeProviderData(result.data),
  };
}

export async function fetchWhatsappNewsletters(context: WhatsappOperationalContext) {
  assertWhatsappConnected(context);

  const result = await callUazapi(context, "/newsletter/list", {
    method: "GET",
  });
  const targets = await syncWhatsappChannelTargets(createServiceClient(), context, "newsletter", result.data);

  return {
    fetchedAt: new Date().toISOString(),
    count: targets.length,
    targets,
    data: sanitizeProviderData(result.data),
  };
}

export async function fetchWhatsappMessageLimits(context: WhatsappOperationalContext) {
  assertWhatsappConnected(context);

  const result = await callUazapi(context, "/instance/wa_messages_limits", {
    method: "GET",
  });

  return {
    fetchedAt: new Date().toISOString(),
    data: sanitizeProviderData(result.data),
  };
}

export async function fetchWhatsappCampaignFolders(context: WhatsappOperationalContext) {
  assertWhatsappConnected(context);

  const result = await callUazapi(context, "/sender/listfolders", {
    method: "GET",
  });

  return {
    fetchedAt: new Date().toISOString(),
    count: countProviderItems(result.data),
    data: sanitizeProviderData(result.data),
  };
}

export async function syncWhatsappCampaignTracking(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  input: { limit?: number } = {},
) {
  assertWhatsappConnected(context);

  const rows = await listWhatsappOutboundRows(client, context, 80);
  const limit = clamp(Math.round(input.limit ?? 12), 1, 30);
  const candidates = rows
    .filter((row) => {
      const metadata = readRecord(row.metadata) ?? {};
      return asString(metadata.operation) === "campaign_simple" && Boolean(readSenderCampaignFolderId(metadata));
    })
    .slice(0, limit);
  const syncedAt = new Date().toISOString();
  const results: Array<{
    itemId: string;
    title: string;
    folderId: string;
    tracking: WhatsappCampaignDeliveryTracking;
  }> = [];

  for (const row of candidates) {
    const metadata = readRecord(row.metadata) ?? {};
    const folderId = readSenderCampaignFolderId(metadata);
    if (!folderId) continue;

    let tracking: WhatsappCampaignDeliveryTracking;

    try {
      const response = await callUazapi(context, "/sender/listmessages", {
        method: "POST",
        body: {
          folder_id: folderId,
          limit: 1000,
          offset: 0,
        },
      });

      tracking = normalizeCampaignTrackingResponse(response.data, folderId, syncedAt);
    } catch (error) {
      tracking = buildCampaignTrackingError(folderId, syncedAt, error instanceof Error ? error.message : "Nao foi possivel consultar mensagens da campanha.");
    }

    await client
      .from("content_pipeline_items")
      .update({
        metadata: {
          ...metadata,
          campaign_tracking: tracking,
          campaign_tracking_synced_at: syncedAt,
          provider_status: tracking.error
            ? asString(metadata.provider_status) ?? "sent"
            : normalizeProviderStatusFromTracking(tracking, asString(metadata.provider_status)),
        },
      })
      .eq("id", row.id);

    results.push({
      itemId: row.id,
      title: row.title,
      folderId,
      tracking,
    });
  }

  return {
    fetchedAt: syncedAt,
    campaigns: results.length,
    skipped: rows.length - candidates.length,
    totals: summarizeCampaignTrackingResults(results.map((item) => item.tracking)),
    results,
  };
}

export async function syncWhatsappGroupIntelligence(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  input: { limit?: number; force?: boolean } = {},
) {
  assertWhatsappConnected(context);

  const limit = clamp(Math.round(input.limit ?? 20), 1, 30);
  const rows = await listWhatsappGroupTargetRows(client, context, limit);
  const syncedAt = new Date().toISOString();
  const results: Array<{
    targetId: string;
    jid: string;
    name: string;
    intelligence: WhatsappGroupIntelligence;
  }> = [];

  for (const row of rows) {
    const metadata = readRecord(row.metadata) ?? {};
    let intelligence: WhatsappGroupIntelligence;

    try {
      const response = await callUazapi(context, "/group/info", {
        method: "POST",
        body: {
          groupjid: row.provider_jid,
          getInviteLink: false,
          getRequestsParticipants: false,
          force: input.force === true,
        },
      });

      intelligence = normalizeGroupInfoResponse(response.data, row, syncedAt);
    } catch (error) {
      intelligence = buildGroupIntelligenceError(
        row,
        syncedAt,
        error instanceof Error ? error.message : "Nao foi possivel consultar detalhes do grupo.",
      );
    }

    const update = {
      participant_count: intelligence.participantCount ?? row.participant_count,
      is_admin: intelligence.isAdmin ?? row.is_admin,
      is_announcement: intelligence.isAnnouncement ?? row.is_announcement,
      last_synced_at: syncedAt,
      metadata: {
        ...metadata,
        group_intelligence: intelligence,
        group_info_synced_at: syncedAt,
      },
    };

    const { error } = await client
      .from("whatsapp_channel_targets")
      .update(update)
      .eq("id", row.id)
      .eq("whatsapp_instance_id", context.instance.id);

    if (error) {
      throw new Error(`Nao foi possivel salvar inteligencia do grupo ${row.display_name ?? row.provider_jid}: ${error.message}`);
    }

    results.push({
      targetId: row.id,
      jid: row.provider_jid,
      name: row.display_name?.trim() || row.provider_jid,
      intelligence,
    });
  }

  return {
    fetchedAt: syncedAt,
    groups: results.length,
    highRisk: results.filter((item) => item.intelligence.riskLevel === "high").length,
    mediumRisk: results.filter((item) => item.intelligence.riskLevel === "medium").length,
    lowRisk: results.filter((item) => item.intelligence.riskLevel === "low").length,
    results,
  };
}

export async function queueWhatsappStatusBroadcast(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  input: {
    text: string;
    recipients?: string[];
    maxRecipients?: number;
    backgroundColor?: number;
    scheduledFor?: string | null;
    statusType?: string | null;
    mediaUrl?: string | null;
    mediaCaption?: string | null;
    catalogItemIds?: string[];
  },
) {
  assertWhatsappConnected(context);

  if (!context.behavior.statusBroadcasts) {
    throw new Error("Ative Status no comportamento do agente antes de publicar stories.");
  }

  const text = truncateUtf8Text(input.text, whatsappStatusTextMaxBytes);
  const catalogItems = await listSalesCatalogCampaignItems(client, context, input.catalogItemIds ?? []);
  const requestedType = normalizeWhatsappStatusPayloadType(input.statusType);
  const catalogMedia = buildCatalogStatusMedia(catalogItems)[0] ?? null;
  const manualMedia = normalizeStatusMediaAttachment(input.mediaUrl, input.statusType, input.mediaCaption);
  const selectedMedia = requestedType === "text" ? null : manualMedia ?? catalogMedia;
  const statusType = selectedMedia ? selectedMedia.type : "text";

  if (!text && !selectedMedia) {
    throw new Error("Escreva o texto do status ou selecione uma midia publica.");
  }

  const maxRecipients = typeof input.maxRecipients === "number" && Number.isFinite(input.maxRecipients)
    ? clamp(Math.round(input.maxRecipients), 1, context.behavior.whatsappMaxStatusRecipients)
    : null;
  const recipients = normalizeRecipientList(input.recipients);

  return queueWhatsappOutbound(client, context, {
    operation: "status",
    title: `Status WhatsApp - ${new Date().toLocaleDateString("pt-BR")}`,
    summary: preview(text || selectedMedia?.text || "Status com midia", 180),
    body: text,
    scheduledFor: input.scheduledFor,
    payload: {
      type: statusType,
      text,
      file: selectedMedia?.file,
      media_caption: selectedMedia?.text,
      backgroundColor: clamp(Math.round(input.backgroundColor ?? 4), 1, 19),
      ...(maxRecipients ? { max_recipients: maxRecipients } : {}),
      ...(recipients.length ? { recipients } : {}),
      catalog_items: catalogItems.map((item) => ({
        id: item.id,
        title: item.title,
        tag: item.tag,
        price: item.price,
        currency: item.currency,
        media_count: item.media.length,
      })),
    },
  });
}

export async function queueWhatsappSimpleCampaign(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  input: {
    title: string;
    text: string;
    numbers: string[];
    scheduledFor?: string | null;
  },
) {
  assertWhatsappConnected(context);

  if (!context.behavior.campaignBroadcasts) {
    throw new Error("Ative Campanhas no comportamento do agente antes de criar disparos.");
  }

  const text = input.text.trim();
  const numbers = normalizeRecipientList(input.numbers).slice(0, context.behavior.whatsappCampaignBatchSize);
  if (!text) throw new Error("Escreva a mensagem da campanha.");
  if (numbers.length === 0) throw new Error("Informe pelo menos um numero valido para a campanha.");

  const title = input.title.trim() || `Campanha WhatsApp - ${new Date().toLocaleDateString("pt-BR")}`;

  return queueWhatsappOutbound(client, context, {
    operation: "campaign_simple",
    title,
    summary: `${numbers.length} destinatario(s). ${preview(text, 140)}`,
    body: text,
    scheduledFor: input.scheduledFor,
    payload: {
      numbers,
      type: "text",
      text,
      folder: title,
      delayMin: context.behavior.whatsappCampaignDelayMinSeconds,
      delayMax: context.behavior.whatsappCampaignDelayMaxSeconds,
      info: "Criada pelo ConnectyHub via Inngest.",
    },
  });
}

export async function queueWhatsappNewsletterText(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  input: {
    jid: string;
    text: string;
    scheduledFor?: string | null;
  },
) {
  assertWhatsappConnected(context);

  if (!context.behavior.newsletterBroadcasts) {
    throw new Error("Ative Canais no comportamento do agente antes de postar em newsletters.");
  }

  const jid = normalizeNewsletterJid(input.jid);
  const text = input.text.trim();
  if (!jid) throw new Error("Informe o ID ou JID do canal/newsletter.");
  if (!text) throw new Error("Escreva a mensagem do canal.");

  return queueWhatsappOutbound(client, context, {
    operation: "newsletter_text",
    title: `Post canal WhatsApp - ${new Date().toLocaleDateString("pt-BR")}`,
    summary: preview(text, 180),
    body: text,
    scheduledFor: input.scheduledFor,
    payload: {
      jid,
      text,
    },
  });
}

export async function queueWhatsappTargetTextCampaign(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  input: {
    title: string;
    text: string;
    targetIds: string[];
    scheduledFor?: string | null;
    mentionAll?: boolean;
    recurrenceFrequency?: string | null;
    recurrenceOccurrences?: number | null;
    deliveryMode?: string | null;
    mediaUrl?: string | null;
    mediaKind?: string | null;
    mediaCaption?: string | null;
    catalogItemIds?: string[];
    interactiveMode?: string | null;
    buttonLabel?: string | null;
    buttonUrl?: string | null;
  },
) {
  assertWhatsappConnected(context);

  if (!context.behavior.campaignBroadcasts && !context.behavior.newsletterBroadcasts) {
    throw new Error("Ative Campanhas ou Canais no comportamento do agente antes de agendar posts para grupos/canais.");
  }

  const text = input.text.trim();
  if (!text) throw new Error("Escreva a mensagem da campanha.");

  const targets = await listWhatsappChannelTargetsByIds(client, context, input.targetIds);
  if (targets.length === 0) {
    throw new Error("Selecione pelo menos um grupo ou canal sincronizado.");
  }

  const blocked = targets.filter((target) => !target.campaignEnabled);
  if (blocked.length > 0) {
    throw new Error(`Destino sem campanhas liberadas: ${blocked[0]?.name ?? blocked[0]?.jid}.`);
  }

  const lockedAnnouncementGroup = targets.find((target) => target.type === "group" && target.isAnnouncement && target.isAdmin === false);
  if (lockedAnnouncementGroup) {
    throw new Error(`O grupo ${lockedAnnouncementGroup.name} esta como somente avisos e este WhatsApp nao aparece como admin. Atualize Detalhes ou ajuste o grupo antes de agendar.`);
  }

  const mentionAll = Boolean(input.mentionAll);
  if (mentionAll && targets.some((target) => target.type !== "group")) {
    throw new Error("Mencionar todos so pode ser usado em grupos.");
  }

  const deliveryMode = normalizeCampaignDeliveryMode(input.deliveryMode);
  if ((deliveryMode === "audio" || deliveryMode === "text_audio") && !context.organizationId) {
    throw new Error("Campanhas em audio exigem uma organizacao para salvar e medir a voz gerada.");
  }

  const catalogItems = await listSalesCatalogCampaignItems(client, context, input.catalogItemIds ?? []);
  const mediaAttachments = [
    ...normalizeManualCampaignAttachments(input.mediaUrl, input.mediaKind, input.mediaCaption),
    ...buildCatalogCampaignAttachments(catalogItems),
  ].slice(0, 6);
  const button = normalizeCampaignButton(input.buttonLabel, input.buttonUrl, catalogItems);
  const interactiveMode = button && normalizeCampaignInteractiveMode(input.interactiveMode) === "button" ? "button" : "none";

  if (interactiveMode === "button" && !context.behavior.interactiveMessages) {
    throw new Error("Ative Botoes e mensagens interativas no comportamento do agente antes de enviar botao de compra.");
  }

  const title = input.title.trim() || `Campanha WhatsApp - ${new Date().toLocaleDateString("pt-BR")}`;
  return queueWhatsappOutbound(client, context, {
    operation: "campaign_simple",
    title,
    summary: `${targets.length} destino(s), ${mediaAttachments.length} anexo(s): ${preview(text, 140)}`,
    body: text,
    scheduledFor: input.scheduledFor,
    payload: {
      type: "text",
      text,
      delivery_mode: deliveryMode,
      target_mode: "whatsapp_targets",
      targets: targets.map((target) => ({
        id: target.id,
        type: target.type,
        jid: target.jid,
        name: target.name,
      })),
      mentions: mentionAll ? "all" : undefined,
      media_attachments: mediaAttachments,
      interactive_mode: interactiveMode,
      buttons: button ? [button] : [],
      catalog_items: catalogItems.map((item) => ({
        id: item.id,
        title: item.title,
        tag: item.tag,
        price: item.price,
        currency: item.currency,
        media_count: item.media.length,
      })),
    },
    recurrence: normalizeCampaignRecurrence({
      frequency: input.recurrenceFrequency,
      occurrences: input.recurrenceOccurrences,
    }),
  });
}

export async function queueWhatsappTargetCarouselCampaign(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  input: {
    title: string;
    text?: string | null;
    targetIds: string[];
    scheduledFor?: string | null;
    mentionAll?: boolean;
    catalogItemIds?: string[];
    buttonLabel?: string | null;
    buttonUrl?: string | null;
  },
) {
  assertWhatsappConnected(context);

  if (!context.behavior.campaignBroadcasts && !context.behavior.newsletterBroadcasts) {
    throw new Error("Ative Campanhas ou Canais no comportamento do agente antes de agendar carrossel.");
  }

  if (!context.behavior.interactiveMessages) {
    throw new Error("Ative Botoes e mensagens interativas no comportamento do agente antes de enviar carrossel.");
  }

  const targets = await listWhatsappChannelTargetsByIds(client, context, input.targetIds);
  if (targets.length === 0) {
    throw new Error("Selecione pelo menos um grupo ou canal sincronizado.");
  }

  const blocked = targets.filter((target) => !target.campaignEnabled);
  if (blocked.length > 0) {
    throw new Error(`Destino sem campanhas liberadas: ${blocked[0]?.name ?? blocked[0]?.jid}.`);
  }

  const mentionAll = Boolean(input.mentionAll);
  if (mentionAll && targets.some((target) => target.type !== "group")) {
    throw new Error("Mencionar todos so pode ser usado em grupos.");
  }

  const catalogItems = await listSalesCatalogCampaignItems(client, context, input.catalogItemIds ?? []);
  const carouselCards = buildCampaignCarouselCards(catalogItems, input.buttonLabel, input.buttonUrl);
  if (carouselCards.length === 0) {
    throw new Error("Selecione produtos ativos com imagem, video ou documento publico para montar o carrossel.");
  }

  const text = (input.text?.trim() || buildCarouselIntroText(catalogItems)).slice(0, 900);
  const title = input.title.trim() || `Carrossel WhatsApp - ${new Date().toLocaleDateString("pt-BR")}`;

  return queueWhatsappOutbound(client, context, {
    operation: "target_carousel",
    title,
    summary: `${targets.length} destino(s), ${carouselCards.length} card(s): ${preview(text, 140)}`,
    body: text,
    scheduledFor: input.scheduledFor,
    payload: {
      type: "carousel",
      text,
      target_mode: "whatsapp_targets",
      targets: targets.map((target) => ({
        id: target.id,
        type: target.type,
        jid: target.jid,
        name: target.name,
      })),
      mentions: mentionAll ? "all" : undefined,
      carousel: carouselCards,
      media_attachments: buildCatalogCampaignAttachments(catalogItems).slice(0, 6),
      catalog_items: catalogItems.map((item) => ({
        id: item.id,
        title: item.title,
        tag: item.tag,
        price: item.price,
        currency: item.currency,
        media_count: item.media.length,
      })),
    },
  });
}

export async function generateWhatsappTargetCampaignDraft(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  input: {
    targetIds: string[];
    brief?: string | null;
    currentTitle?: string | null;
    currentText?: string | null;
    recurrenceFrequency?: string | null;
    recurrenceOccurrences?: number | null;
    mentionAll?: boolean;
    catalogItemIds?: string[];
  },
): Promise<WhatsappTargetCampaignDraft> {
  if (!context.behavior.campaignBroadcasts && !context.behavior.newsletterBroadcasts) {
    throw new Error("Ative Campanhas ou Canais no comportamento do agente antes de criar rascunhos com IA.");
  }

  const targets = await listWhatsappChannelTargetsByIds(client, context, input.targetIds);
  if (targets.length === 0) {
    throw new Error("Selecione pelo menos um grupo ou canal para a IA contextualizar a campanha.");
  }

  const blocked = targets.filter((target) => !target.campaignEnabled);
  if (blocked.length > 0) {
    throw new Error(`Destino sem campanhas liberadas: ${blocked[0]?.name ?? blocked[0]?.jid}.`);
  }

  const mentionAll = Boolean(input.mentionAll);
  if (mentionAll && targets.some((target) => target.type !== "group")) {
    throw new Error("Mencionar todos so pode ser usado em grupos.");
  }

  const brief = input.brief?.trim().slice(0, 1200) ?? "";
  const currentTitle = input.currentTitle?.trim().slice(0, 120) ?? "";
  const currentText = input.currentText?.trim().slice(0, 1600) ?? "";
  const catalogItems = await listSalesCatalogCampaignItems(client, context, input.catalogItemIds ?? []);

  if (!brief && !currentTitle && !currentText && catalogItems.length === 0) {
    throw new Error("Informe um tema, oferta, mensagem inicial ou selecione produtos para a IA criar o rascunho.");
  }

  const credentials = await loadGeminiCredentials(client);
  const recurrence = normalizeCampaignRecurrence({
    frequency: input.recurrenceFrequency,
    occurrences: input.recurrenceOccurrences,
  });
  const systemInstruction = [
    "Você cria rascunhos de campanhas para grupos e canais do WhatsApp.",
    "Escreva em português do Brasil, com tom comercial natural, claro e sem parecer spam.",
    "Não invente desconto, garantia, preço, prazo, estoque, link ou bônus que não esteja no briefing.",
    "Não use markdown pesado. Evite excesso de emojis e evite caixa alta.",
    "Se houver grupos, a mensagem deve funcionar em conversa coletiva. Se houver canais, deve funcionar como post de broadcast.",
    "Quando houver produtos do catalogo, escolha um gancho comercial claro e conduza para compra sem soar mecanico.",
    "Retorne somente JSON valido com as chaves title, text e approvalChecklist.",
    "title deve ter no maximo 90 caracteres. text deve ter no maximo 1400 caracteres.",
  ].join("\n");
  const prompt = [
    `Escopo: ${context.scope === "platform" ? "campanha interna ConnectyHub" : "campanha de cliente ConnectyHub"}`,
    `WhatsApp conectado: ${context.instance.display_name ?? context.instance.phone_number ?? context.instance.provider_instance_id ?? "sem nome"}`,
    `Destinos selecionados (${targets.length}):`,
    targets.map((target, index) => [
      `${index + 1}. ${target.type === "newsletter" ? "Canal" : "Grupo"}: ${target.name}`,
      target.participantCount !== null ? `${target.participantCount} membros` : "",
      target.isAdmin ? "numero e admin" : "",
      target.isAnnouncement ? "somente avisos" : "",
    ].filter(Boolean).join(" / ")).join("\n"),
    recurrence ? `Recorrencia planejada: ${recurrence.frequency === "weekly" ? "semanal" : "diaria"}, ${readInteger(recurrence.max_occurrences, 1)} envios no total.` : "Recorrencia planejada: envio unico.",
    mentionAll ? "Controle de mencao: mencionar todos nos grupos selecionados." : "Controle de mencao: nao mencionar todos por padrao.",
    catalogItems.length ? "Produtos do catalogo selecionados:" : "",
    catalogItems.map((item, index) => formatCampaignCatalogPromptItem(item, index)).join("\n"),
    brief ? `Briefing do usuario: ${brief}` : "",
    currentTitle ? `Titulo atual para aproveitar ou melhorar: ${currentTitle}` : "",
    currentText ? `Texto atual para aproveitar ou melhorar: ${currentText}` : "",
    "Checklist esperado: 3 a 5 itens curtos que o humano deve conferir antes de aprovar o envio.",
  ].filter(Boolean).join("\n\n");
  const responseData = await callGeminiGenerateContent(credentials, systemInstruction, prompt, {
    temperature: 0.7,
    maxOutputTokens: 900,
  });
  const rawText = extractGeminiText(responseData);
  const parsed = parseGeminiCampaignDraft(rawText);

  if (!parsed.text) {
    throw new Error("Gemini nao retornou texto para a campanha.");
  }

  return {
    title: (parsed.title || currentTitle || `Campanha WhatsApp - ${new Date().toLocaleDateString("pt-BR")}`).slice(0, 90),
    text: parsed.text.slice(0, 1400),
    approvalChecklist: parsed.approvalChecklist.slice(0, 5),
    targetCount: targets.length,
    targetNames: targets.map((target) => target.name).slice(0, 12),
    modelId: credentials.model,
    systemInstruction,
    prompt,
    responseData,
  };
}

export async function generateWhatsappStatusDraft(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  input: {
    brief?: string | null;
    currentText?: string | null;
    catalogItemIds?: string[];
  },
): Promise<WhatsappStatusDraft> {
  if (!context.behavior.statusBroadcasts) {
    throw new Error("Ative Status no comportamento do agente antes de criar rascunhos com IA.");
  }

  const brief = input.brief?.trim().slice(0, 900) ?? "";
  const currentText = truncateUtf8Text(input.currentText ?? "", whatsappStatusTextMaxBytes);
  const catalogItems = await listSalesCatalogCampaignItems(client, context, input.catalogItemIds ?? []);

  if (!brief && !currentText && catalogItems.length === 0) {
    throw new Error("Informe uma ideia ou selecione produtos para a IA criar o status.");
  }

  const credentials = await loadGeminiCredentials(client);
  const statusMedia = buildCatalogStatusMedia(catalogItems)[0] ?? null;
  const systemInstruction = [
    "Voce cria textos curtos para Status/Stories de WhatsApp de uma empresa.",
    "Escreva em portugues do Brasil, com tom natural de atendente humano e foco comercial leve.",
    "Nao invente desconto, garantia, prazo, estoque, link ou bonus que nao esteja no briefing ou no catalogo.",
    `O texto precisa caber no status do WhatsApp: mire ate ${whatsappStatusAiTargetChars} caracteres e evite texto longo.`,
    "Evite markdown, excesso de emojis e caixa alta.",
    "Retorne somente JSON valido com as chaves text, backgroundColor e approvalChecklist.",
    "backgroundColor deve ser um numero de 1 a 19.",
  ].join("\n");
  const prompt = [
    `Escopo: ${context.scope === "platform" ? "status interno ConnectyHub" : "status de cliente ConnectyHub"}`,
    `WhatsApp conectado: ${context.instance.display_name ?? context.instance.phone_number ?? context.instance.provider_instance_id ?? "sem nome"}`,
    catalogItems.length ? "Produtos selecionados:" : "",
    catalogItems.map((item, index) => formatCampaignCatalogPromptItem(item, index)).join("\n"),
    statusMedia ? `Midia sugerida para acompanhar o status: ${statusMedia.type} ${statusMedia.file}` : "Sem midia de produto selecionada.",
    brief ? `Ideia do usuario: ${brief}` : "",
    currentText ? `Texto atual para aproveitar ou melhorar: ${currentText}` : "",
    "Crie um status que gere resposta natural do lead, sem parecer disparo frio.",
    "Checklist esperado: 3 a 5 itens curtos que o humano deve conferir antes de aprovar.",
  ].filter(Boolean).join("\n\n");
  const responseData = await callGeminiGenerateContent(credentials, systemInstruction, prompt, {
    temperature: 0.78,
    maxOutputTokens: 650,
  });
  const rawText = extractGeminiText(responseData);
  const parsed = parseGeminiStatusDraft(rawText);

  if (!parsed.text) {
    throw new Error("Gemini nao retornou texto para o status.");
  }

  return {
    text: truncateUtf8Text(parsed.text, whatsappStatusTextMaxBytes),
    backgroundColor: parsed.backgroundColor,
    approvalChecklist: parsed.approvalChecklist.slice(0, 5),
    productNames: catalogItems.map((item) => item.title).slice(0, 6),
    mediaUrl: statusMedia?.file ?? null,
    mediaKind: statusMedia?.type === "image" || statusMedia?.type === "video" ? statusMedia.type : null,
    modelId: credentials.model,
    systemInstruction,
    prompt,
    responseData,
  };
}

export async function generateWhatsappGrowthCampaignPlan(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  input: {
    targetIds: string[];
    catalogItemIds?: string[];
    objective?: string | null;
    brief?: string | null;
    durationDays?: number | null;
    postsPerDay?: number | null;
    startFrom?: string | null;
    mentionAll?: boolean;
    preferredFormats?: string[] | null;
  },
): Promise<WhatsappGrowthCampaignPlan> {
  if (!context.behavior.campaignBroadcasts && !context.behavior.newsletterBroadcasts && !context.behavior.statusBroadcasts) {
    throw new Error("Ative Campanhas, Canais ou Status no comportamento do agente antes de criar uma rotina IA.");
  }

  const durationDays = clamp(Math.round(input.durationDays ?? 7), 1, 14);
  const postsPerDay = clamp(Math.round(input.postsPerDay ?? 3), 1, 5);
  const startFrom = normalizeScheduledFor(input.startFrom);
  const objective = (input.objective?.trim() || "Vender mais pelo WhatsApp com conteudo recorrente").slice(0, 220);
  const brief = input.brief?.trim().slice(0, 1600) ?? "";
  const targets = input.targetIds.length > 0
    ? await listWhatsappChannelTargetsByIds(client, context, input.targetIds)
    : [];
  const catalogItems = await listSalesCatalogCampaignItems(client, context, input.catalogItemIds ?? []);

  if (targets.length === 0 && !context.behavior.statusBroadcasts) {
    throw new Error("Selecione grupos/canais ou ative Status para a IA montar a rotina.");
  }

  if (!brief && catalogItems.length === 0) {
    throw new Error("Informe um objetivo/briefing ou selecione produtos para a IA planejar a rotina.");
  }

  const blocked = targets.filter((target) => !target.campaignEnabled);
  if (blocked.length > 0) {
    throw new Error(`Destino sem campanhas liberadas: ${blocked[0]?.name ?? blocked[0]?.jid}.`);
  }

  const credentials = await loadGeminiCredentials(client);
  const availableFormats = resolveAllowedGrowthPlanFormats(context, targets, catalogItems);
  const allowedFormats = resolvePreferredGrowthPlanFormats(availableFormats, input.preferredFormats ?? []);
  const systemInstruction = [
    "Voce e estrategista de crescimento para WhatsApp, grupos, canais e status.",
    "Monte uma rotina de campanha que reduza o trabalho do usuario: ele escolhe produtos e voce planeja a cadencia.",
    "Escreva em portugues do Brasil com tom comercial humano, natural e sem parecer spam.",
    "Alterne formatos quando fizer sentido: texto, audio, texto_audio, carousel, status e poll.",
    "Quando o usuario escolher um formato principal, respeite os formatos permitidos do prompt e nao troque para outro formato.",
    "Use carousel quando houver 2 ou mais produtos com midia. Use poll para gerar conversa em grupos.",
    "Nao invente preco, estoque, desconto, prazo, garantia, link ou bonus que nao esteja no catalogo ou briefing.",
    `Cada texto deve ter no maximo 900 caracteres e deve conduzir para conversa ou compra. Quando type=status, mire ate ${whatsappStatusAiTargetChars} caracteres.`,
    "Retorne somente JSON valido com as chaves title, strategySummary, approvalChecklist e items.",
    "Cada item deve ter: day, slot, type, title, text, productRefs, pollChoices e buttonLabel.",
  ].join("\n");
  const prompt = [
    `Objetivo: ${objective}`,
    `Duracao: ${durationDays} dia(s). Posts por dia: ${postsPerDay}.`,
    `Data inicial ISO: ${startFrom}. Fuso operacional: America/Sao_Paulo.`,
    `Formatos permitidos: ${allowedFormats.join(", ")}.`,
    input.preferredFormats?.length ? `Formato principal escolhido pelo usuario: ${input.preferredFormats.join(", ")}.` : "Formato principal escolhido pelo usuario: IA pode alternar.",
    `Mencao geral em grupos: ${input.mentionAll ? "permitida quando fizer sentido" : "nao usar por padrao"}.`,
    targets.length ? "Destinos:" : "Destino principal: status do agente.",
    targets.map((target, index) => [
      `${index + 1}. ${target.type === "newsletter" ? "Canal" : "Grupo"}: ${target.name}`,
      target.participantCount !== null ? `${target.participantCount} membros` : "",
      target.isAnnouncement ? "somente avisos" : "",
    ].filter(Boolean).join(" / ")).join("\n"),
    catalogItems.length ? "Produtos disponiveis, referencie como P1, P2...:" : "",
    catalogItems.map((item, index) => `P${index + 1}: ${formatCampaignCatalogPromptItem(item, index)}`).join("\n"),
    brief ? `Briefing adicional: ${brief}` : "",
    "Crie exatamente a quantidade solicitada de itens quando possivel.",
    "Para enquetes, pollChoices deve ter 2 a 5 opcoes.",
  ].filter(Boolean).join("\n\n");
  const responseData = await callGeminiGenerateContent(credentials, systemInstruction, prompt, {
    temperature: 0.78,
    maxOutputTokens: 2400,
  });
  const rawText = extractGeminiText(responseData);
  const parsed = parseGeminiGrowthPlan(rawText);
  const items = normalizeGrowthPlanItems({
    rawItems: parsed.items,
    allowedFormats,
    catalogItems,
    targets,
    durationDays,
    postsPerDay,
    startFrom,
  });

  return {
    title: (parsed.title || `Rotina WhatsApp IA - ${new Date().toLocaleDateString("pt-BR")}`).slice(0, 90),
    objective,
    strategySummary: (parsed.strategySummary || buildFallbackGrowthStrategySummary(catalogItems, targets)).slice(0, 480),
    durationDays,
    postsPerDay,
    timezone: "America/Sao_Paulo",
    approvalChecklist: parsed.approvalChecklist.length > 0
      ? parsed.approvalChecklist.slice(0, 6)
      : buildGrowthPlanApprovalChecklist(allowedFormats),
    targetCount: targets.length,
    targetNames: targets.map((target) => target.name).slice(0, 12),
    productNames: catalogItems.map((item) => item.title).slice(0, 12),
    items,
    modelId: credentials.model,
    systemInstruction,
    prompt,
    responseData,
  };
}

export async function queueWhatsappGrowthCampaignPlan(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  input: {
    planItems: unknown;
    targetIds: string[];
    catalogItemIds?: string[];
    mentionAll?: boolean;
    buttonLabel?: string | null;
  },
) {
  assertWhatsappConnected(context);

  const targets = await listWhatsappChannelTargetsByIds(client, context, input.targetIds);
  const groupTargetIds = targets.filter((target) => target.type === "group").map((target) => target.id);
  const fallbackTargetIds = targets.map((target) => target.id);
  const fallbackProductIds = Array.from(new Set((input.catalogItemIds ?? []).map((id) => id.trim()).filter(Boolean)));
  const planItems = normalizeQueuedGrowthPlanItems(input.planItems, fallbackTargetIds, fallbackProductIds);

  if (planItems.length === 0) {
    throw new Error("Gere ou informe uma rotina IA antes de agendar.");
  }

  const queued: WhatsappOutboundItem[] = [];

  for (const planItem of planItems.slice(0, 70)) {
    const targetIds = planItem.targetIds.length > 0 ? intersectStrings(planItem.targetIds, fallbackTargetIds) : fallbackTargetIds;
    const productIds = planItem.productIds.length > 0 ? planItem.productIds : fallbackProductIds.slice(0, 4);
    const title = planItem.title || `Rotina IA WhatsApp - dia ${planItem.day}`;

    if (planItem.type === "status") {
      queued.push(await queueWhatsappStatusBroadcast(client, context, {
        text: planItem.text,
        scheduledFor: planItem.scheduledFor,
        catalogItemIds: productIds,
      }));
    } else if (planItem.type === "poll") {
      if (groupTargetIds.length === 0) {
        queued.push(await queueWhatsappTargetTextCampaign(client, context, {
          title,
          text: planItem.text,
          targetIds,
          scheduledFor: planItem.scheduledFor,
          mentionAll: input.mentionAll,
          catalogItemIds: productIds,
          interactiveMode: "button",
          buttonLabel: planItem.buttonLabel ?? input.buttonLabel ?? "Quero saber mais",
        }));
      } else {
        const pollTargetIds = intersectStrings(targetIds, groupTargetIds);
        queued.push(await queueWhatsappTargetPollCampaign(client, context, {
          title,
          question: planItem.text,
          choices: planItem.pollChoices,
          targetIds: pollTargetIds.length > 0 ? pollTargetIds : groupTargetIds,
          scheduledFor: planItem.scheduledFor,
          mentionAll: input.mentionAll,
          selectableCount: 1,
        }));
      }
    } else if (planItem.type === "carousel") {
      queued.push(await queueWhatsappTargetCarouselCampaign(client, context, {
        title,
        text: planItem.text,
        targetIds,
        scheduledFor: planItem.scheduledFor,
        mentionAll: input.mentionAll,
        catalogItemIds: productIds,
        buttonLabel: planItem.buttonLabel ?? input.buttonLabel,
      }));
    } else {
      queued.push(await queueWhatsappTargetTextCampaign(client, context, {
        title,
        text: planItem.text,
        targetIds,
        scheduledFor: planItem.scheduledFor,
        mentionAll: input.mentionAll,
        deliveryMode: planItem.type === "audio" || planItem.type === "text_audio" ? planItem.type : "text",
        catalogItemIds: productIds,
        interactiveMode: "button",
        buttonLabel: planItem.buttonLabel ?? input.buttonLabel ?? "Comprar agora",
      }));
    }
  }

  return {
    count: queued.length,
    items: queued,
  };
}

export async function queueWhatsappTargetPollCampaign(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  input: {
    title?: string | null;
    question: string;
    choices: string[];
    targetIds: string[];
    scheduledFor?: string | null;
    recurrenceFrequency?: string | null;
    recurrenceOccurrences?: number | null;
    selectableCount?: number | null;
    mentionAll?: boolean;
  },
) {
  assertWhatsappConnected(context);

  if (!context.behavior.campaignBroadcasts) {
    throw new Error("Ative Campanhas no comportamento do agente antes de agendar enquetes.");
  }

  if (!context.behavior.interactiveMessages) {
    throw new Error("Ative Botoes e mensagens interativas no comportamento do agente antes de enviar enquetes.");
  }

  const question = input.question.trim().slice(0, 600);
  const choices = normalizePollChoices(input.choices);
  if (!question) throw new Error("Escreva a pergunta da enquete.");
  if (choices.length < 2) throw new Error("Informe pelo menos duas opcoes para a enquete.");

  const targets = await listWhatsappChannelTargetsByIds(client, context, input.targetIds);
  if (targets.length === 0) {
    throw new Error("Selecione pelo menos um grupo sincronizado para a enquete.");
  }

  const newsletterTarget = targets.find((target) => target.type === "newsletter");
  if (newsletterTarget) {
    throw new Error("Enquetes interativas da Uazapi usam /send/menu e atualmente so sao seguras para grupos, nao canais.");
  }

  const blocked = targets.filter((target) => !target.campaignEnabled);
  if (blocked.length > 0) {
    throw new Error(`Destino sem campanhas liberadas: ${blocked[0]?.name ?? blocked[0]?.jid}.`);
  }

  const mentionAll = Boolean(input.mentionAll);
  const title = input.title?.trim().slice(0, 90) || `Enquete WhatsApp - ${new Date().toLocaleDateString("pt-BR")}`;

  return queueWhatsappOutbound(client, context, {
    operation: "target_poll",
    title,
    summary: `${targets.length} grupo(s), ${choices.length} opcao(oes): ${preview(question, 140)}`,
    body: question,
    scheduledFor: input.scheduledFor,
    payload: {
      type: "poll",
      text: question,
      choices,
      selectable_count: clamp(Math.round(input.selectableCount ?? 1), 1, Math.max(1, choices.length)),
      target_mode: "whatsapp_targets",
      targets: targets.map((target) => ({
        id: target.id,
        type: target.type,
        jid: target.jid,
        name: target.name,
      })),
      mentions: mentionAll ? "all" : undefined,
    },
    recurrence: normalizeCampaignRecurrence({
      frequency: input.recurrenceFrequency,
      occurrences: input.recurrenceOccurrences,
    }),
  });
}

export async function queueWhatsappGroupWindow(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  input: {
    targetId: string;
    openScheduledFor: string;
    closeScheduledFor: string;
    openingText?: string | null;
    preCloseText?: string | null;
    closingText?: string | null;
    preCloseMinutes?: number | null;
    mentionAll?: boolean;
  },
) {
  assertWhatsappConnected(context);

  if (!context.behavior.allowGroupChats) {
    throw new Error("Ative Responder em grupos no comportamento do agente antes de criar janela de conversa.");
  }

  const target = await loadWhatsappChannelTargetById(client, context, input.targetId.trim());
  if (!target) throw new Error("Grupo nao encontrado para esta instancia.");
  if (target.target_type !== "group") throw new Error("Janela de conversa so pode ser criada para grupos.");
  if (target.is_admin === false) {
    throw new Error("Este WhatsApp precisa ser admin do grupo para abrir ou fechar a conversa.");
  }

  const openScheduledFor = normalizeRequiredScheduledFor(input.openScheduledFor, "Informe quando o grupo deve abrir.");
  const closeScheduledFor = normalizeRequiredScheduledFor(input.closeScheduledFor, "Informe quando o grupo deve fechar.");
  if (closeScheduledFor.getTime() <= openScheduledFor.getTime()) {
    throw new Error("O horario de fechamento precisa ser depois da abertura.");
  }

  const targetName = target.display_name?.trim() || target.provider_jid;
  const mentionAll = Boolean(input.mentionAll);
  const openingText = normalizeGroupWindowMessage(
    input.openingText,
    "Oi pessoal, abri o grupo por um tempo para duvidas e troca de ideias. Podem mandar as perguntas por aqui que eu vou respondendo.",
  );
  const preCloseText = normalizeGroupWindowMessage(
    input.preCloseText,
    "Vou deixar o grupo aberto mais alguns minutos. Quem tiver duvida, manda agora que eu tento responder todo mundo.",
  );
  const closingText = normalizeGroupWindowMessage(
    input.closingText,
    "Fechando o grupo agora, pessoal. Quem quiser continuar, pode chamar no privado ou tocar no botao de compra quando eu enviar uma oferta.",
  );
  const items: WhatsappOutboundItem[] = [];

  items.push(await queueWhatsappOutbound(client, context, {
    operation: "group_announce_mode",
    title: `Abrir grupo - ${targetName}`.slice(0, 140),
    summary: preview(openingText, 180),
    body: openingText,
    scheduledFor: openScheduledFor.toISOString(),
    payload: buildGroupWindowPayload({
      phase: "open",
      targetId: target.id,
      targetJid: target.provider_jid,
      targetName,
      announce: false,
      text: openingText,
      mentions: mentionAll ? "all" : undefined,
    }),
  }));

  const preCloseMinutes = clamp(Math.round(input.preCloseMinutes ?? 5), 1, 120);
  const preCloseScheduledFor = new Date(closeScheduledFor.getTime() - preCloseMinutes * 60_000);
  if (preCloseScheduledFor.getTime() > openScheduledFor.getTime() + 60_000) {
    items.push(await queueWhatsappOutbound(client, context, {
      operation: "group_announce_mode",
      title: `Aviso de fechamento - ${targetName}`.slice(0, 140),
      summary: preview(preCloseText, 180),
      body: preCloseText,
      scheduledFor: preCloseScheduledFor.toISOString(),
      payload: buildGroupWindowPayload({
        phase: "pre_close",
        targetId: target.id,
        targetJid: target.provider_jid,
        targetName,
        announce: null,
        text: preCloseText,
        mentions: mentionAll ? "all" : undefined,
      }),
    }));
  }

  items.push(await queueWhatsappOutbound(client, context, {
    operation: "group_announce_mode",
    title: `Fechar grupo - ${targetName}`.slice(0, 140),
    summary: preview(closingText, 180),
    body: closingText,
    scheduledFor: closeScheduledFor.toISOString(),
    payload: buildGroupWindowPayload({
      phase: "close",
      targetId: target.id,
      targetJid: target.provider_jid,
      targetName,
      announce: true,
      text: closingText,
      mentions: mentionAll ? "all" : undefined,
    }),
  }));

  return {
    target: mapWhatsappChannelTarget(target),
    items,
  };
}

export async function probeWhatsappLeadStatusWatch(
  context: WhatsappOperationalContext,
): Promise<WhatsappLeadStatusWatchProbe> {
  assertWhatsappConnected(context);

  const checkedAt = new Date().toISOString();
  const testedEndpoints = ["/chat/find", "/message/find"];
  const errors: string[] = [];
  let chatSamples: unknown[] = [];
  let messageSamples: unknown[] = [];

  try {
    const chats = await callUazapi(context, "/chat/find", {
      method: "POST",
      body: {
        operator: "OR",
        sort: "-wa_lastMsgTimestamp",
        limit: 5,
        offset: 0,
        wa_chatid: "status@broadcast",
        wa_name: "status",
      },
    });
    chatSamples = extractProviderItems(chats.data, ["chats", "data", "items", "response"])
      .slice(0, 5)
      .map(sanitizeProviderData);
  } catch (error) {
    errors.push(`/chat/find: ${error instanceof Error ? error.message : "falha ao consultar chat de status"}`);
  }

  try {
    const messages = await callUazapi(context, "/message/find", {
      method: "POST",
      body: {
        chatid: "status@broadcast",
        limit: 5,
        offset: 0,
      },
    });
    messageSamples = extractProviderItems(messages.data, ["messages", "data", "items", "response"])
      .slice(0, 5)
      .map(sanitizeProviderData);
  } catch (error) {
    errors.push(`/message/find: ${error instanceof Error ? error.message : "falha ao consultar mensagens de status"}`);
  }

  const statusChatFound = chatSamples.length > 0;
  const statusMessageFound = messageSamples.length > 0;
  const available = statusChatFound || statusMessageFound;

  return {
    checkedAt,
    available,
    confidence: available ? "medium" : "low",
    message: available
      ? "A Uazapi retornou registros ligados a status@broadcast. Da para seguir com piloto controlado de status dos leads."
      : "A Uazapi respondeu sem confirmar uma caixa de status dos leads. O recurso deve continuar como experimental ate validacao com status recente ou endpoint dedicado.",
    testedEndpoints,
    statusChatFound,
    statusMessageFound,
    chatSamples,
    messageSamples,
    errors,
  };
}

export async function enableWhatsappGroupReplies(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  input: {
    updatedBy?: string | null;
  } = {},
) {
  return enableWhatsappAutomationCapability(client, context, {
    capability: "groups",
    enabled: true,
    updatedBy: input.updatedBy,
  });
}

export async function enableWhatsappAutomationCapability(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  input: {
    capability: string;
    enabled?: boolean | null;
    updatedBy?: string | null;
  },
) {
  assertWhatsappConnected(context);

  const capability = normalizeAutomationCapability(input.capability);
  if (!capability) {
    throw new Error("Escolha qual recurso de automacao WhatsApp deseja ativar.");
  }

  const now = new Date().toISOString();
  const enabled = input.enabled !== false;
  const nextBehavior = buildAutomationCapabilityBehavior(context.behavior, capability, enabled);
  const instanceMetadata = readRecord(context.instance.metadata) ?? {};
  const nextInstanceMetadata = {
    ...instanceMetadata,
    behavior_config: nextBehavior,
    behavior_updated_at: now,
    behavior_updated_by: input.updatedBy ?? null,
    last_client_action: `${enabled ? "enable" : "disable"}_${capability}`,
  };

  const { error: instanceError } = await client
    .from("whatsapp_instances")
    .update({ metadata: nextInstanceMetadata })
    .eq("id", context.instance.id);

  if (instanceError) {
    throw new Error(`Nao foi possivel ${enabled ? "ativar" : "desativar"} ${describeAutomationCapability(capability)} nesta instancia: ${instanceError.message}`);
  }

  const agentId = asString(instanceMetadata.agent_id);
  if (context.scope === "organization" && context.organizationId && agentId) {
    const { data: agent, error: agentLoadError } = await client
      .from("agent_registry")
      .select("metadata")
      .eq("id", agentId)
      .eq("scope", "organization")
      .eq("organization_id", context.organizationId)
      .maybeSingle<AgentBehaviorRow>();

    if (agentLoadError) {
      throw new Error(`Nao foi possivel carregar o comportamento do agente: ${agentLoadError.message}`);
    }

    const agentMetadata = readRecord(agent?.metadata) ?? {};
    const currentAgentBehavior = buildAutomationCapabilityBehavior(
      normalizeWhatsappBehaviorConfig(agentMetadata.whatsapp_behavior_config ?? nextBehavior),
      capability,
      enabled,
    );
    const { error: agentUpdateError } = await client
      .from("agent_registry")
      .update({
        metadata: {
          ...agentMetadata,
          whatsapp_behavior_config: currentAgentBehavior,
          prompt_control: {
            ...(readRecord(agentMetadata.prompt_control) ?? {}),
            last_updated_at: now,
            last_updated_by: input.updatedBy ?? null,
            source: "whatsapp_automations_capability",
          },
        },
      })
      .eq("id", agentId)
      .eq("scope", "organization")
      .eq("organization_id", context.organizationId);

    if (agentUpdateError) {
      throw new Error(`Nao foi possivel ${enabled ? "ativar" : "desativar"} ${describeAutomationCapability(capability)} no agente: ${agentUpdateError.message}`);
    }
  }

  context.instance.metadata = nextInstanceMetadata;
  context.behavior = nextBehavior;

  return {
    behavior: {
      groups: nextBehavior.allowGroupChats,
      groupReplyMode: nextBehavior.groupReplyMode,
      groupMentionAll: nextBehavior.groupMentionAll,
      statusBroadcasts: nextBehavior.statusBroadcasts,
      newsletterBroadcasts: nextBehavior.newsletterBroadcasts,
      campaignBroadcasts: nextBehavior.campaignBroadcasts,
      interactiveMessages: nextBehavior.interactiveMessages,
      enabled,
    },
  };
}

function buildAutomationCapabilityBehavior(
  behavior: WhatsappBehaviorConfig,
  capability: WhatsappAutomationCapability,
  enabled: boolean,
) {
  const nextBehavior = normalizeWhatsappBehaviorConfig(behavior);

  if (capability === "groups") {
    nextBehavior.allowGroupChats = enabled;
    nextBehavior.groupReplyMode = nextBehavior.groupReplyMode || "all";
  } else if (capability === "status") {
    nextBehavior.statusBroadcasts = enabled;
  } else if (capability === "campaigns") {
    nextBehavior.campaignBroadcasts = enabled;
  } else if (capability === "newsletters") {
    nextBehavior.newsletterBroadcasts = enabled;
  } else if (capability === "interactive") {
    nextBehavior.interactiveMessages = enabled;
  }

  return nextBehavior;
}

function normalizeAutomationCapability(value: string | null | undefined): WhatsappAutomationCapability | null {
  if (value === "groups" || value === "status" || value === "campaigns" || value === "newsletters" || value === "interactive") {
    return value;
  }

  return null;
}

function describeAutomationCapability(capability: WhatsappAutomationCapability) {
  if (capability === "groups") return "respostas em grupos";
  if (capability === "status") return "posts no status";
  if (capability === "campaigns") return "campanhas";
  if (capability === "newsletters") return "canais";
  return "botoes e enquetes";
}

export async function updateWhatsappChannelTargetSettings(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  input: {
    targetId: string;
    enabled?: boolean;
    campaignEnabled?: boolean;
    replyMode?: string | null;
    mentionMode?: string | null;
    requireApproval?: boolean;
    maxRepliesPerHour?: number | null;
    muteUntil?: string | null;
  },
) {
  const targetId = input.targetId.trim();
  if (!targetId) throw new Error("Selecione um grupo ou canal para configurar.");

  const current = await loadWhatsappChannelTargetById(client, context, targetId);
  if (!current) throw new Error("Grupo ou canal nao encontrado para esta instancia.");

  const patch: JsonRecord = {
    metadata: {
      ...(current.metadata ?? {}),
      settings_updated_at: new Date().toISOString(),
    },
  };

  if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
  if (typeof input.campaignEnabled === "boolean") patch.campaign_enabled = input.campaignEnabled;
  if (input.replyMode !== undefined) patch.reply_mode = normalizeTargetReplyMode(input.replyMode);
  if (input.mentionMode !== undefined) patch.mention_mode = normalizeTargetMentionMode(input.mentionMode);
  if (typeof input.requireApproval === "boolean") patch.require_approval = input.requireApproval;
  if (input.maxRepliesPerHour !== undefined && input.maxRepliesPerHour !== null) {
    patch.max_replies_per_hour = clamp(Math.round(input.maxRepliesPerHour), 0, 120);
  }
  if (input.muteUntil !== undefined) {
    patch.mute_until = normalizeMuteUntil(input.muteUntil);
  }

  const { data, error } = await client
    .from("whatsapp_channel_targets")
    .update(patch)
    .eq("id", targetId)
    .eq("whatsapp_instance_id", context.instance.id)
    .select("id, scope, organization_id, whatsapp_instance_id, agent_id, provider, target_type, provider_jid, display_name, description, participant_count, is_admin, is_announcement, enabled, campaign_enabled, reply_mode, mention_mode, require_approval, max_replies_per_hour, mute_until, last_synced_at, metadata, created_at, updated_at")
    .single<WhatsappChannelTargetRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel salvar a regra do grupo/canal.");
  }

  return mapWhatsappChannelTarget(data);
}

export async function processScheduledWhatsappOutbounds(input: {
  itemId?: string;
  limit?: number;
  client?: SupabaseClient;
} = {}) {
  const client = input.client ?? createServiceClient();
  const now = new Date().toISOString();
  let query = client
    .from("content_pipeline_items")
    .select("id, scope, organization_id, content_type, status, title, summary, body, scheduled_for, published_at, tags, metadata, created_at")
    .in("content_type", outboundTypes)
    .eq("status", "scheduled")
    .order("scheduled_for", { ascending: true })
    .limit(Math.min(Math.max(input.limit ?? 10, 1), 50));

  query = input.itemId ? query.eq("id", input.itemId) : query.lte("scheduled_for", now);

  const { data, error } = await query;
  if (error) throw new Error(`Nao foi possivel carregar envios WhatsApp: ${error.message}`);

  const results = [];
  for (const item of (data ?? []) as ContentPipelineRow[]) {
    if (!isOutboundDue(item)) {
      results.push({ id: item.id, status: "skipped", reason: "scheduled_for_future" });
      continue;
    }

    results.push(await processWhatsappOutboundItem(client, item));
  }

  return {
    processed: results.length,
    results,
  };
}

async function processWhatsappOutboundItem(client: SupabaseClient, item: ContentPipelineRow) {
  const claimed = await claimOutboundItem(client, item);
  if (!claimed) return { id: item.id, status: "skipped", reason: "already_claimed" };

  const metadata = readRecord(claimed.metadata) ?? readRecord(item.metadata) ?? {};

  try {
    if (claimed.scope === "organization" && claimed.organization_id) {
      await assertOrganizationFeatureAccess({
        organizationId: claimed.organization_id,
        featureCode: "whatsapp_groups_channels",
        client,
      });
    }

    const operation = asString(metadata.operation) as WhatsappOutboundOperation | null;
    const context = await resolveContextByOutboundItem(client, claimed);
    assertWhatsappConnected(context);
    const payload = readRecord(metadata.payload) ?? {};
    let providerResponse: unknown;

    if (operation === "status") {
      providerResponse = await callUazapi(context, "/send/status", {
        method: "POST",
        body: cleanPayload({
          type: payload.type ?? "text",
          text: asString(payload.text) ?? asString(payload.media_caption) ?? item.body,
          file: payload.file,
          backgroundColor: payload.backgroundColor,
          background_color: payload.backgroundColor ?? payload.background_color,
          max_recipients: payload.max_recipients,
          recipients: payload.recipients,
        }),
      }).then((result) => result.data);
    } else if (operation === "campaign_simple") {
      const targetRecipients = readCampaignTargetRecipients(payload);

      if (targetRecipients) {
        const responses = [];
        for (const recipient of targetRecipients) {
          const sent = await sendTargetCampaignPayloadToRecipient(client, context, item, payload, recipient);
          responses.push({ recipient, responses: sanitizeProviderData(sent) });
        }
        providerResponse = { target_mode: "whatsapp_targets", sent: responses };
      } else {
        providerResponse = await callUazapi(context, "/sender/simple", {
          method: "POST",
          body: cleanPayload({
            numbers: payload.numbers,
            type: payload.type ?? "text",
            text: payload.text ?? item.body,
            folder: payload.folder ?? item.title,
            delayMin: payload.delayMin,
            delayMax: payload.delayMax,
            scheduled_for: 1,
            info: payload.info,
            linkPreview: true,
          }),
        }).then((result) => result.data);
      }
    } else if (operation === "target_poll") {
      const targetRecipients = readCampaignTargetRecipients(payload);

      if (!targetRecipients) {
        throw new Error("Enquete sem grupos de destino.");
      }

      const responses = [];
      for (const recipient of targetRecipients) {
        const sent = await sendTargetPollPayloadToRecipient(context, item, payload, recipient);
        responses.push({ recipient, responses: sanitizeProviderData(sent) });
      }
      providerResponse = { target_mode: "whatsapp_targets", sent: responses };
    } else if (operation === "target_carousel") {
      const targetRecipients = readCampaignTargetRecipients(payload);

      if (!targetRecipients) {
        throw new Error("Carrossel sem destinos.");
      }

      const responses = [];
      for (const recipient of targetRecipients) {
        const sent = await sendTargetCarouselPayloadToRecipient(context, item, payload, recipient);
        responses.push({ recipient, responses: sanitizeProviderData(sent) });
      }
      providerResponse = { target_mode: "whatsapp_targets", sent: responses };
    } else if (operation === "group_announce_mode") {
      providerResponse = await sendGroupWindowPayload(context, item, payload);
    } else if (operation === "newsletter_text") {
      providerResponse = await callUazapi(context, "/send/text", {
        method: "POST",
        body: {
          number: payload.jid,
          text: payload.text ?? item.body,
          linkPreview: true,
          track_source: "connectyhub",
          track_id: `newsletter_${item.id}`,
        },
      }).then((result) => result.data);
    } else {
      throw new Error("Operacao WhatsApp agendada desconhecida.");
    }

    const publishedAt = new Date().toISOString();
    const sanitizedProviderResponse = sanitizeProviderData(providerResponse);
    const senderFolderId = operation === "campaign_simple" ? readSenderFolderIdFromProviderResponse(sanitizedProviderResponse) : null;
    let nextOccurrence: WhatsappOutboundItem | null = null;
    let recurrenceError: string | null = null;

    try {
      nextOccurrence = await scheduleNextRecurringWhatsappOutbound(client, claimed, metadata, publishedAt);
    } catch (nextError) {
      recurrenceError = nextError instanceof Error ? nextError.message : "Nao foi possivel agendar a proxima recorrencia.";
    }

    await client
      .from("content_pipeline_items")
      .update({
        status: "published",
        published_at: publishedAt,
        metadata: {
          ...(metadata ?? {}),
          provider_status: "sent",
          provider_response: sanitizedProviderResponse,
          sender_folder_id: senderFolderId,
          processed_at: publishedAt,
          recurrence: buildPublishedRecurrenceMetadata(metadata.recurrence, item.id, nextOccurrence, publishedAt, recurrenceError),
        },
      })
      .eq("id", item.id);

    await recordOutboundEvent(client, context, item, "whatsapp.outbound.sent", "Envio WhatsApp processado", providerResponse);
    return { id: item.id, status: "published", nextOccurrenceId: nextOccurrence?.id ?? null, recurrenceError };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido no envio WhatsApp.";
    await client
      .from("content_pipeline_items")
      .update({
        status: "review",
        metadata: {
          ...metadata,
          provider_status: "failed",
          provider_error: message,
          failed_at: new Date().toISOString(),
        },
      })
      .eq("id", item.id);

    return { id: item.id, status: "failed", error: message };
  }
}

async function sendTargetCampaignPayloadToRecipient(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  item: ContentPipelineRow,
  payload: JsonRecord,
  recipient: string,
) {
  const text = asString(payload.text) ?? item.body ?? "";
  const deliveryMode = normalizeCampaignDeliveryMode(payload.delivery_mode);
  const mentions = payload.mentions;
  const buttons = readCampaignButtons(payload.buttons);
  const interactiveMode = buttons.length > 0 ? normalizeCampaignInteractiveMode(payload.interactive_mode) : "none";
  const responses: Array<JsonRecord> = [];

  if ((deliveryMode === "text" || deliveryMode === "text_audio") && text) {
    if (interactiveMode === "button" && !recipient.endsWith("@newsletter")) {
      const menuResponse = await callUazapi(context, "/send/menu", {
        method: "POST",
        body: cleanPayload({
          number: recipient,
          type: "button",
          text,
          mentions,
          choices: buttons.map((button) => button.choice),
          imageButton: asString(payload.image_button),
          footerText: "ConnectyHub",
          track_source: "connectyhub",
          track_id: `campaign_${item.id}_button`,
        }),
      }).then((result) => result.data);
      responses.push({ mode: "button", response: sanitizeProviderData(menuResponse) as JsonRecord });
    } else {
      const textResponse = await callUazapi(context, "/send/text", {
        method: "POST",
        body: cleanPayload({
          number: recipient,
          text,
          mentions,
          linkPreview: true,
          track_source: "connectyhub",
          track_id: `campaign_${item.id}_text`,
        }),
      }).then((result) => result.data);
      responses.push({ mode: "text", response: sanitizeProviderData(textResponse) as JsonRecord });
    }
  }

  if ((deliveryMode === "audio" || deliveryMode === "text_audio") && text) {
    const audioResponse = await sendCampaignAudioToRecipient(client, context, item, recipient, text, mentions);
    responses.push(audioResponse);
  }

  const attachments = readCampaignMediaAttachments(payload.media_attachments);
  for (let index = 0; index < attachments.length; index++) {
    const attachment = attachments[index];
    const mediaResponse = await callUazapi(context, "/send/media", {
      method: "POST",
      body: cleanPayload({
        number: recipient,
        type: attachment.type,
        file: attachment.file,
        text: attachment.text,
        mentions,
        track_source: "connectyhub",
        track_id: `campaign_${item.id}_media_${index + 1}`,
      }),
    }).then((result) => result.data);
    responses.push({
      mode: "media",
      mediaType: attachment.type,
      source: attachment.source,
      catalogItemId: attachment.catalogItemId,
      response: sanitizeProviderData(mediaResponse) as JsonRecord,
    });
  }

  return responses;
}

async function sendTargetPollPayloadToRecipient(
  context: WhatsappOperationalContext,
  item: ContentPipelineRow,
  payload: JsonRecord,
  recipient: string,
) {
  const question = asString(payload.text) ?? item.body ?? "";
  const choices = normalizePollChoices(readStringArray(payload.choices));

  if (!question || choices.length < 2) {
    throw new Error("Enquete sem pergunta ou opcoes validas.");
  }

  const providerResponse = await callUazapi(context, "/send/menu", {
    method: "POST",
    body: cleanPayload({
      number: recipient,
      type: "poll",
      text: question,
      choices,
      selectableCount: clamp(readInteger(payload.selectable_count, 1), 1, choices.length),
      mentions: payload.mentions,
      track_source: "connectyhub",
      track_id: `poll_${item.id}`,
    }),
  }).then((result) => result.data);

  return [{
    mode: "poll",
    response: sanitizeProviderData(providerResponse) as JsonRecord,
  }];
}

async function sendTargetCarouselPayloadToRecipient(
  context: WhatsappOperationalContext,
  item: ContentPipelineRow,
  payload: JsonRecord,
  recipient: string,
) {
  const text = asString(payload.text) ?? item.body ?? "";
  const mentions = payload.mentions;
  const carousel = readCampaignCarouselCards(payload.carousel);
  const responses: Array<JsonRecord> = [];

  if (carousel.length === 0) {
    throw new Error("Carrossel sem cards validos.");
  }

  if (!recipient.endsWith("@newsletter")) {
    const providerResponse = await callUazapi(context, "/send/carousel", {
      method: "POST",
      body: cleanPayload({
        number: recipient,
        text,
        carousel,
        mentions,
        readchat: true,
        track_source: "connectyhub",
        track_id: `carousel_${item.id}`,
      }),
    }).then((result) => result.data);

    return [{
      mode: "carousel",
      response: sanitizeProviderData(providerResponse) as JsonRecord,
    }];
  }

  if (text) {
    const textResponse = await callUazapi(context, "/send/text", {
      method: "POST",
      body: cleanPayload({
        number: recipient,
        text,
        linkPreview: true,
        track_source: "connectyhub",
        track_id: `carousel_${item.id}_newsletter_text`,
      }),
    }).then((result) => result.data);
    responses.push({ mode: "newsletter_text_fallback", response: sanitizeProviderData(textResponse) as JsonRecord });
  }

  const attachments = readCampaignMediaAttachments(payload.media_attachments);
  for (let index = 0; index < attachments.length; index++) {
    const attachment = attachments[index];
    const mediaResponse = await callUazapi(context, "/send/media", {
      method: "POST",
      body: cleanPayload({
        number: recipient,
        type: attachment.type,
        file: attachment.file,
        text: attachment.text,
        track_source: "connectyhub",
        track_id: `carousel_${item.id}_newsletter_media_${index + 1}`,
      }),
    }).then((result) => result.data);
    responses.push({
      mode: "newsletter_media_fallback",
      mediaType: attachment.type,
      source: attachment.source,
      catalogItemId: attachment.catalogItemId,
      response: sanitizeProviderData(mediaResponse) as JsonRecord,
    });
  }

  return responses;
}

async function sendGroupWindowPayload(
  context: WhatsappOperationalContext,
  item: ContentPipelineRow,
  payload: JsonRecord,
) {
  const targetJid = asString(payload.target_jid);
  const text = asString(payload.text) ?? item.body ?? "";
  const phase = asString(payload.phase) ?? "message";
  const announce = typeof payload.announce === "boolean" ? payload.announce : null;
  const responses: Array<JsonRecord> = [];

  if (!targetJid?.endsWith("@g.us")) {
    throw new Error("Janela de grupo sem JID de grupo valido.");
  }

  async function updateAnnounce() {
    if (announce === null) return;
    const response = await callUazapi(context, "/group/updateAnnounce", {
      method: "POST",
      body: {
        groupjid: targetJid,
        announce,
      },
    }).then((result) => result.data);
    responses.push({ mode: "group_announce", announce, response: sanitizeProviderData(response) as JsonRecord });
  }

  async function sendMessage() {
    if (!text) return;
    const response = await callUazapi(context, "/send/text", {
      method: "POST",
      body: cleanPayload({
        number: targetJid,
        text,
        mentions: payload.mentions,
        linkPreview: true,
        track_source: "connectyhub",
        track_id: `group_window_${item.id}_${phase}`,
      }),
    }).then((result) => result.data);
    responses.push({ mode: "group_message", response: sanitizeProviderData(response) as JsonRecord });
  }

  if (phase === "open") {
    await updateAnnounce();
    await sendMessage();
  } else if (phase === "close") {
    await sendMessage();
    await updateAnnounce();
  } else {
    await sendMessage();
  }

  return {
    targetJid,
    phase,
    responses,
  };
}

async function sendCampaignAudioToRecipient(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  item: ContentPipelineRow,
  recipient: string,
  text: string,
  mentions: unknown,
) {
  if (!context.organizationId) {
    throw new Error("Campanhas em audio exigem uma organizacao vinculada.");
  }

  const generatedAudio = await generateConnectyVoiceAudio({
    organizationId: context.organizationId,
    userId: null,
    text,
    voiceId: context.behavior.audioVoiceId || null,
    voicePublicOwnerId: context.behavior.audioVoicePublicOwnerId || null,
    voiceName: context.behavior.audioVoiceName || null,
    voiceSource: context.behavior.audioVoiceSource || null,
    modelId: context.behavior.audioModelId || null,
    source: "whatsapp_campaign",
    metadata: {
      whatsappInstanceId: context.instance.id,
      contentPipelineItemId: item.id,
      recipient,
      agentScope: "customer",
      deliveryMode: "campaign_audio",
    },
    client,
  });
  const providerResponse = await callUazapi(context, "/send/media", {
    method: "POST",
    timeoutMs: outboundAudioDeliveryTimeoutMs,
    body: cleanPayload({
      number: recipient,
      type: "ptt",
      file: generatedAudio.audioUrl,
      mentions,
      track_source: "connectyhub",
      track_id: `campaign_${item.id}_audio`,
    }),
  }).then((result) => result.data);

  return {
    mode: "audio",
    generatedAudio: {
      mediaId: generatedAudio.mediaId,
      bytesSize: generatedAudio.bytesSize,
      voiceId: generatedAudio.voiceId,
      modelId: generatedAudio.modelId,
      chargeCredits: generatedAudio.chargeCredits ?? null,
    },
    response: sanitizeProviderData(providerResponse) as JsonRecord,
  };
}

async function buildOperationalContext(
  client: SupabaseClient,
  instance: WhatsappInstanceRow,
  scope: WhatsappScope,
  organizationId: string | null,
  sectorId: string | null,
) {
  const token = decryptInstanceToken(instance);
  if (!token) throw new Error("Instancia WhatsApp sem token seguro. Reconecte o numero.");

  const credentials = await loadUazapiCredentials(client);
  const metadata = readRecord(instance.metadata);
  const behavior = await resolveOperationalBehaviorConfig(client, {
    scope,
    organizationId,
    sectorId,
    instanceMetadata: metadata,
  });

  return {
    scope,
    organizationId,
    sectorId,
    instance,
    token,
    credentials,
    behavior,
  };
}

function assertWhatsappConnected(context: WhatsappOperationalContext) {
  if (context.instance.status !== "connected") {
    throw new Error("Conecte o WhatsApp antes de usar grupos, status, canais ou campanhas.");
  }
}

async function resolveOperationalBehaviorConfig(
  client: SupabaseClient,
  input: {
    scope: WhatsappScope;
    organizationId: string | null;
    sectorId: string | null;
    instanceMetadata: JsonRecord | null;
  },
) {
  const instanceConfig = readRecord(input.instanceMetadata?.behavior_config);

  if (instanceConfig) {
    return normalizeWhatsappBehaviorConfig(instanceConfig);
  }

  if (input.scope === "organization" && input.organizationId) {
    const agentId = asString(input.instanceMetadata?.agent_id);
    const [agentConfig, globalConfig] = await Promise.all([
      agentId ? loadOrganizationAgentBehaviorConfig(client, input.organizationId, agentId) : Promise.resolve(null),
      loadOrganizationGlobalBehaviorConfig(client, input.organizationId),
    ]);

    return normalizeWhatsappBehaviorConfig(agentConfig ?? globalConfig);
  }

  if (input.scope === "platform" && input.sectorId) {
    const platformConfig = await loadPlatformSectorBehaviorConfig(client, input.sectorId);
    return normalizeWhatsappBehaviorConfig(platformConfig);
  }

  return normalizeWhatsappBehaviorConfig(null);
}

async function loadOrganizationGlobalBehaviorConfig(client: SupabaseClient, organizationId: string) {
  const { data } = await client
    .from("agent_registry")
    .select("metadata")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .eq("agent_code", "agente-whatsapp-global")
    .maybeSingle<AgentBehaviorRow>();

  return readRecord(data?.metadata)?.whatsapp_behavior_config ?? null;
}

async function loadOrganizationAgentBehaviorConfig(client: SupabaseClient, organizationId: string, agentId: string) {
  const { data } = await client
    .from("agent_registry")
    .select("metadata")
    .eq("id", agentId)
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .contains("metadata", { client_created: true, agent_kind: "whatsapp" })
    .maybeSingle<AgentBehaviorRow>();

  return readRecord(data?.metadata)?.whatsapp_behavior_config ?? null;
}

async function loadPlatformSectorBehaviorConfig(client: SupabaseClient, sectorId: string) {
  const { data } = await client
    .from("agent_registry")
    .select("metadata")
    .eq("scope", "platform")
    .is("organization_id", null)
    .contains("metadata", { admin_whatsapp: true, agent_kind: "whatsapp", sector_id: sectorId })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<AgentBehaviorRow>();

  return readRecord(data?.metadata)?.whatsapp_behavior_config ?? null;
}

async function resolveContextByOutboundItem(client: SupabaseClient, item: ContentPipelineRow) {
  const metadata = readRecord(item.metadata) ?? {};
  const instanceId = asString(metadata.whatsapp_instance_id);

  if (!instanceId) {
    throw new Error("Envio WhatsApp sem instancia vinculada.");
  }

  const { data, error } = await client
    .from("whatsapp_instances")
    .select(instanceSelect)
    .eq("id", instanceId)
    .maybeSingle<WhatsappInstanceRow>();

  if (error) throw new Error(`Nao foi possivel carregar instancia do envio: ${error.message}`);
  if (!data) throw new Error("Instancia do envio WhatsApp nao encontrada.");

  return buildOperationalContext(
    client,
    data,
    item.scope,
    item.scope === "organization" ? item.organization_id : null,
    asString(metadata.sector_id),
  );
}

async function queueWhatsappOutbound(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  input: {
    operation: WhatsappOutboundOperation;
    title: string;
    summary: string;
    body: string;
    scheduledFor?: string | null;
    payload: JsonRecord;
    recurrence?: JsonRecord | null;
  },
) {
  const scheduledFor = normalizeScheduledFor(input.scheduledFor);
  const contentType = input.operation === "status"
    ? "whatsapp_status"
    : input.operation === "group_announce_mode"
      ? "whatsapp_group_window"
      : input.operation === "campaign_simple" || input.operation === "target_poll" || input.operation === "target_carousel"
      ? "whatsapp_campaign"
      : "whatsapp_newsletter";

  const { data, error } = await client
    .from("content_pipeline_items")
    .insert({
      scope: context.scope,
      organization_id: context.scope === "organization" ? context.organizationId : null,
      content_type: contentType,
      status: "scheduled",
      title: input.title,
      summary: input.summary,
      body: input.body,
      scheduled_for: scheduledFor,
      tags: ["whatsapp", "uazapi", input.operation],
      metadata: {
        operation: input.operation,
        payload: input.payload,
        whatsapp_instance_id: context.instance.id,
        provider_instance_id: context.instance.provider_instance_id,
        sector_id: context.sectorId ?? null,
        queued_from: "connectyhub_panel",
        queued_at: new Date().toISOString(),
        recurrence: input.recurrence ?? null,
      },
    })
    .select("id, scope, organization_id, content_type, status, title, summary, body, scheduled_for, published_at, tags, metadata, created_at")
    .single<ContentPipelineRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel agendar o envio WhatsApp.");
  }

  return mapOutboundItem(data);
}

async function scheduleNextRecurringWhatsappOutbound(
  client: SupabaseClient,
  item: ContentPipelineRow,
  metadata: JsonRecord,
  publishedAt: string,
): Promise<WhatsappOutboundItem | null> {
  const recurrence = readStoredRecurrence(metadata.recurrence);
  if (!recurrence || recurrence.occurrenceIndex >= recurrence.maxOccurrences) {
    return null;
  }

  const nextScheduledFor = nextRecurrenceDate(item.scheduled_for ?? publishedAt, recurrence.frequency);
  const nextMetadata: JsonRecord = {
    ...metadata,
    recurrence: {
      enabled: true,
      frequency: recurrence.frequency,
      occurrence_index: recurrence.occurrenceIndex + 1,
      max_occurrences: recurrence.maxOccurrences,
      series_id: recurrence.seriesId ?? item.id,
      previous_item_id: item.id,
    },
  };

  for (const key of [
    "provider_status",
    "provider_response",
    "provider_error",
    "processed_at",
    "failed_at",
    "processing_started_at",
  ]) {
    delete nextMetadata[key];
  }

  const { data, error } = await client
    .from("content_pipeline_items")
    .insert({
      scope: item.scope,
      organization_id: item.organization_id,
      content_type: item.content_type,
      status: "scheduled",
      title: item.title,
      summary: item.summary,
      body: item.body,
      scheduled_for: nextScheduledFor,
      tags: item.tags ?? ["whatsapp", "uazapi", asString(metadata.operation) ?? "campaign_simple"],
      metadata: nextMetadata,
    })
    .select("id, scope, organization_id, content_type, status, title, summary, body, scheduled_for, published_at, tags, metadata, created_at")
    .single<ContentPipelineRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel agendar a proxima recorrencia WhatsApp.");
  }

  return mapOutboundItem(data);
}

async function listWhatsappChannelTargets(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
): Promise<WhatsappChannelTarget[]> {
  const { data, error } = await client
    .from("whatsapp_channel_targets")
    .select("id, scope, organization_id, whatsapp_instance_id, agent_id, provider, target_type, provider_jid, display_name, description, participant_count, is_admin, is_announcement, enabled, campaign_enabled, reply_mode, mention_mode, require_approval, max_replies_per_hour, mute_until, last_synced_at, metadata, created_at, updated_at")
    .eq("whatsapp_instance_id", context.instance.id)
    .order("target_type", { ascending: true })
    .order("display_name", { ascending: true });

  if (error) {
    if (isMissingWhatsappChannelTargetsTable(error)) {
      return [];
    }
    throw new Error(`Nao foi possivel listar grupos e canais WhatsApp: ${error.message}`);
  }

  return ((data ?? []) as WhatsappChannelTargetRow[]).map(mapWhatsappChannelTarget);
}

async function listWhatsappChannelTargetsByIds(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  ids: string[],
) {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean))).slice(0, 100);
  if (uniqueIds.length === 0) return [];

  const { data, error } = await client
    .from("whatsapp_channel_targets")
    .select("id, scope, organization_id, whatsapp_instance_id, agent_id, provider, target_type, provider_jid, display_name, description, participant_count, is_admin, is_announcement, enabled, campaign_enabled, reply_mode, mention_mode, require_approval, max_replies_per_hour, mute_until, last_synced_at, metadata, created_at, updated_at")
    .eq("whatsapp_instance_id", context.instance.id)
    .in("id", uniqueIds);

  if (error) {
    throw new Error(`Nao foi possivel carregar destinos da campanha: ${error.message}`);
  }

  return ((data ?? []) as WhatsappChannelTargetRow[]).map(mapWhatsappChannelTarget);
}

async function listWhatsappGroupTargetRows(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  limit: number,
): Promise<WhatsappChannelTargetRow[]> {
  const { data, error } = await client
    .from("whatsapp_channel_targets")
    .select("id, scope, organization_id, whatsapp_instance_id, agent_id, provider, target_type, provider_jid, display_name, description, participant_count, is_admin, is_announcement, enabled, campaign_enabled, reply_mode, mention_mode, require_approval, max_replies_per_hour, mute_until, last_synced_at, metadata, created_at, updated_at")
    .eq("whatsapp_instance_id", context.instance.id)
    .eq("target_type", "group")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingWhatsappChannelTargetsTable(error)) {
      throw new Error("Aplique a migration whatsapp_channel_targets antes de sincronizar detalhes dos grupos.");
    }
    throw new Error(`Nao foi possivel carregar grupos para analise: ${error.message}`);
  }

  return (data ?? []) as WhatsappChannelTargetRow[];
}

async function loadWhatsappChannelTargetById(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  targetId: string,
) {
  const { data, error } = await client
    .from("whatsapp_channel_targets")
    .select("id, scope, organization_id, whatsapp_instance_id, agent_id, provider, target_type, provider_jid, display_name, description, participant_count, is_admin, is_announcement, enabled, campaign_enabled, reply_mode, mention_mode, require_approval, max_replies_per_hour, mute_until, last_synced_at, metadata, created_at, updated_at")
    .eq("id", targetId)
    .eq("whatsapp_instance_id", context.instance.id)
    .maybeSingle<WhatsappChannelTargetRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar regra do grupo/canal: ${error.message}`);
  }

  return data ?? null;
}

async function listSalesCatalogCampaignItems(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  ids: string[],
): Promise<ClientSalesCatalogItem[]> {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean))).slice(0, 6);
  if (uniqueIds.length === 0 || context.scope !== "organization" || !context.organizationId) return [];

  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("memory_type", "sales_catalog_item")
    .eq("organization_id", context.organizationId)
    .in("id", uniqueIds);

  if (error) {
    throw new Error(`Nao foi possivel carregar produtos da campanha: ${error.message}`);
  }

  return ((data ?? []) as SalesCatalogMemoryRow[])
    .map((row) => mapSalesCatalogItem(row as SalesCatalogItemMapperInput))
    .filter((item) => item.status === "active");
}

async function syncWhatsappChannelTargets(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  type: WhatsappTargetType,
  providerData: unknown,
) {
  const now = new Date().toISOString();
  const items = extractProviderTargetItems(providerData, type);
  if (items.length === 0) return [];
  const existingMetadata = await listExistingChannelTargetMetadata(client, context, type, items.map((item) => item.jid));

  const rows = items.map((item) => ({
    scope: context.scope,
    organization_id: context.scope === "organization" ? context.organizationId : null,
    whatsapp_instance_id: context.instance.id,
    agent_id: asString(readRecord(context.instance.metadata)?.agent_id),
    provider: "uazapi",
    target_type: type,
    provider_jid: item.jid,
    display_name: item.name,
    description: item.description,
    participant_count: item.participantCount,
    is_admin: item.isAdmin,
    is_announcement: item.isAnnouncement,
    last_synced_at: now,
    metadata: {
      ...(existingMetadata.get(item.jid) ?? {}),
      provider_payload: sanitizeProviderData(item.raw),
      synced_from: type === "group" ? "group_list" : "newsletter_list",
    },
  }));

  const { data, error } = await client
    .from("whatsapp_channel_targets")
    .upsert(rows, {
      onConflict: "whatsapp_instance_id,target_type,provider_jid",
      ignoreDuplicates: false,
    })
    .select("id, scope, organization_id, whatsapp_instance_id, agent_id, provider, target_type, provider_jid, display_name, description, participant_count, is_admin, is_announcement, enabled, campaign_enabled, reply_mode, mention_mode, require_approval, max_replies_per_hour, mute_until, last_synced_at, metadata, created_at, updated_at");

  if (error) {
    if (isMissingWhatsappChannelTargetsTable(error)) {
      throw new Error("Aplique a migration whatsapp_channel_targets antes de sincronizar grupos e canais.");
    }
    throw new Error(`Nao foi possivel salvar ${type === "group" ? "grupos" : "canais"} WhatsApp: ${error.message}`);
  }

  return ((data ?? []) as WhatsappChannelTargetRow[]).map(mapWhatsappChannelTarget);
}

async function listExistingChannelTargetMetadata(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  type: WhatsappTargetType,
  jids: string[],
) {
  const uniqueJids = Array.from(new Set(jids)).slice(0, 250);
  const metadata = new Map<string, JsonRecord>();
  if (uniqueJids.length === 0) return metadata;

  const { data, error } = await client
    .from("whatsapp_channel_targets")
    .select("provider_jid, metadata")
    .eq("whatsapp_instance_id", context.instance.id)
    .eq("target_type", type)
    .in("provider_jid", uniqueJids);

  if (error) {
    if (isMissingWhatsappChannelTargetsTable(error)) {
      return metadata;
    }
    throw new Error(`Nao foi possivel preservar metadados dos destinos WhatsApp: ${error.message}`);
  }

  for (const row of (data ?? []) as Array<{ provider_jid: string; metadata: JsonRecord | null }>) {
    metadata.set(row.provider_jid, readRecord(row.metadata) ?? {});
  }

  return metadata;
}

async function listWhatsappOutboundRows(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  limit = 12,
): Promise<ContentPipelineRow[]> {
  const { data, error } = await client
    .from("content_pipeline_items")
    .select("id, scope, organization_id, content_type, status, title, summary, body, scheduled_for, published_at, tags, metadata, created_at")
    .in("content_type", outboundTypes)
    .contains("metadata", { whatsapp_instance_id: context.instance.id })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Nao foi possivel listar envios WhatsApp: ${error.message}`);
  }

  return (data ?? []) as ContentPipelineRow[];
}

function buildWhatsappOperationsAnalytics(rows: ContentPipelineRow[]): WhatsappOperationsAnalytics {
  const now = Date.now();
  const summary = {
    total: rows.length,
    scheduled: 0,
    published: 0,
    failed: 0,
    recurring: 0,
    withMedia: 0,
    withAudio: 0,
    totalRecipients: 0,
    trackedMessages: 0,
    sentMessages: 0,
    failedMessages: 0,
    pendingMessages: 0,
    carouselPosts: 0,
    pollPosts: 0,
    statusPosts: 0,
  };
  const publishedHours = new Map<number, number>();
  const productCounts = new Map<string, { id: string; title: string; count: number }>();
  const targetTypeCounts = new Map<string, number>();

  for (const row of rows) {
    const metadata = readRecord(row.metadata) ?? {};
    const payload = readRecord(metadata.payload) ?? {};
    const operation = asString(metadata.operation);
    const providerStatus = asString(metadata.provider_status);
    const deliveryMode = normalizeCampaignDeliveryMode(payload.delivery_mode);
    const attachmentCount = readCampaignMediaAttachments(payload.media_attachments).length;
    const targetCount = readCampaignTargetCount(payload);
    const campaignTracking = readCampaignTracking(metadata.campaign_tracking);

    if (row.status === "scheduled") summary.scheduled += 1;
    if (row.status === "published") summary.published += 1;
    if (row.status === "review" || providerStatus === "failed") summary.failed += 1;
    if (readStoredRecurrence(metadata.recurrence)) summary.recurring += 1;
    if (attachmentCount > 0 || asString(payload.file)) summary.withMedia += 1;
    if (deliveryMode === "audio" || deliveryMode === "text_audio" || ["audio", "myaudio", "ptt"].includes(asString(payload.type) ?? "")) summary.withAudio += 1;
    if (operation === "target_carousel") summary.carouselPosts += 1;
    if (operation === "target_poll") summary.pollPosts += 1;
    if (operation === "status") summary.statusPosts += 1;
    summary.totalRecipients += targetCount;
    if (campaignTracking) {
      summary.trackedMessages += campaignTracking.total;
      summary.sentMessages += campaignTracking.sent;
      summary.failedMessages += campaignTracking.failed;
      summary.pendingMessages += campaignTracking.pending;
    }
    for (const product of readPayloadCatalogItems(payload.catalog_items)) {
      const current = productCounts.get(product.id) ?? { ...product, count: 0 };
      current.count += 1;
      productCounts.set(product.id, current);
    }
    for (const targetType of readPayloadTargetTypes(payload.targets)) {
      targetTypeCounts.set(targetType, (targetTypeCounts.get(targetType) ?? 0) + 1);
    }

    if (row.status === "published" && row.published_at) {
      const hour = getSaoPauloHour(row.published_at);
      if (hour !== null) publishedHours.set(hour, (publishedHours.get(hour) ?? 0) + 1);
    }
  }

  const recommendedHour = resolveRecommendedCampaignHour(publishedHours);
  const calendar = rows
    .filter((row) => row.status === "scheduled" && isFutureIso(row.scheduled_for, now))
    .sort((a, b) => new Date(a.scheduled_for ?? 0).getTime() - new Date(b.scheduled_for ?? 0).getTime())
    .slice(0, 10)
    .map((row) => {
      const metadata = readRecord(row.metadata) ?? {};
      const payload = readRecord(metadata.payload) ?? {};

      return {
        id: row.id,
        title: row.title,
        operation: asString(metadata.operation) ?? row.content_type,
        scheduledFor: row.scheduled_for ?? new Date().toISOString(),
        targetCount: readCampaignTargetCount(payload),
        attachmentCount: readCampaignMediaAttachments(payload.media_attachments).length,
        deliveryMode: normalizeCampaignDeliveryMode(payload.delivery_mode),
        recurring: Boolean(readStoredRecurrence(metadata.recurrence)),
      };
    });

  return {
    summary,
    calendar,
    optimization: {
      nextSuggestedFor: buildNextSuggestedCampaignSlot(recommendedHour),
      recommendedHour,
      confidence: publishedHours.size >= 3 ? "high" : rows.length >= 8 ? "medium" : "low",
      reasons: buildCampaignOptimizationReasons(summary, calendar.length, publishedHours, recommendedHour),
    },
    topProducts: Array.from(productCounts.values())
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
      .slice(0, 6),
    segments: buildWhatsappCampaignSegments(summary, targetTypeCounts, productCounts),
  };
}

async function claimOutboundItem(client: SupabaseClient, item: ContentPipelineRow) {
  const metadata = readRecord(item.metadata) ?? {};
  const { data, error } = await client
    .from("content_pipeline_items")
    .update({
      status: "researching",
      metadata: {
        ...metadata,
        processing_started_at: new Date().toISOString(),
      },
    })
    .eq("id", item.id)
    .eq("status", "scheduled")
    .select("id, scope, organization_id, content_type, status, title, summary, body, scheduled_for, published_at, tags, metadata, created_at")
    .maybeSingle<ContentPipelineRow>();

  if (error) throw new Error(`Nao foi possivel reservar envio WhatsApp: ${error.message}`);
  return data ?? null;
}

function isOutboundDue(item: ContentPipelineRow) {
  const scheduledFor = item.scheduled_for ? new Date(item.scheduled_for) : new Date(0);
  if (Number.isNaN(scheduledFor.getTime())) return true;
  return scheduledFor.getTime() <= Date.now();
}

async function recordOutboundEvent(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  item: ContentPipelineRow,
  eventType: string,
  title: string,
  providerResponse: unknown,
) {
  await client.from("intelligence_events").insert({
    scope: context.scope,
    organization_id: context.scope === "organization" ? context.organizationId : null,
    source_type: "whatsapp",
    source_id: item.id,
    event_type: eventType,
    title,
    summary: item.summary,
    confidence: 0.85,
    visibility: context.scope,
    tags: ["whatsapp", "uazapi", "outbound"],
    payload: {
      contentPipelineItemId: item.id,
      whatsappInstanceId: context.instance.id,
      providerResponse: sanitizeProviderData(providerResponse),
    },
  });
}

async function callUazapi(
  context: WhatsappOperationalContext,
  path: string,
  options: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    query?: Record<string, string | number | boolean | null | undefined>;
    timeoutMs?: number;
  },
) {
  const url = new URL(`${context.credentials.baseUrl}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const fetchInit = {
    method: options.method,
    headers: {
      Accept: "application/json",
      token: context.token,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  } satisfies RequestInit;
  const response = options.timeoutMs
    ? await fetchWithTimeout(url, fetchInit, options.timeoutMs, `Uazapi ${path}`)
    : await fetch(url, fetchInit);
  const data = options.timeoutMs
    ? await withTimeout(readResponse(response), options.timeoutMs, `Uazapi ${path} leitura da resposta`)
    : await readResponse(response);

  if (!response.ok) {
    throw new Error(readProviderError(data) ?? `Uazapi respondeu status ${response.status}.`);
  }

  return { status: response.status, data };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number, label: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`${label} excedeu ${Math.round(timeoutMs / 1000)}s.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${label} excedeu ${Math.round(timeoutMs / 1000)}s.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function callGeminiGenerateContent(
  credentials: GeminiCredentials,
  systemInstruction: string,
  prompt: string,
  options: {
    temperature: number;
    maxOutputTokens: number;
  },
) {
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(credentials.model)}:generateContent`);
  url.searchParams.set("key", credentials.apiKey);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [{
        role: "user",
        parts: [{ text: prompt }],
      }],
      generationConfig: {
        temperature: options.temperature,
        topP: 0.9,
        maxOutputTokens: options.maxOutputTokens,
        responseMimeType: "application/json",
      },
    }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(readGeminiError(data) ?? `Gemini respondeu status ${response.status}.`);
  }

  return data;
}

async function readResponse(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapOutboundItem(row: ContentPipelineRow): WhatsappOutboundItem {
  const metadata = readRecord(row.metadata) ?? {};
  const recurrence = readStoredRecurrence(metadata.recurrence);
  const recurrenceRecord = readRecord(metadata.recurrence);

  return {
    id: row.id,
    operation: asString(metadata.operation) ?? row.content_type,
    status: row.status,
    title: row.title,
    summary: row.summary,
    scheduledFor: row.scheduled_for,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    providerStatus: asString(metadata.provider_status),
    error: asString(metadata.provider_error),
    campaignTracking: readCampaignTracking(metadata.campaign_tracking),
    recurrence: recurrence
      ? {
        frequency: recurrence.frequency,
        occurrenceIndex: recurrence.occurrenceIndex,
        maxOccurrences: recurrence.maxOccurrences,
        nextScheduledFor: asString(recurrenceRecord?.next_scheduled_for),
        seriesId: recurrence.seriesId,
      }
      : null,
  };
}

function normalizeCampaignTrackingResponse(
  value: unknown,
  folderId: string,
  syncedAt: string,
): WhatsappCampaignDeliveryTracking {
  const messages = extractProviderItems(value, ["messages", "data", "items", "response"]);
  const pagination = readRecord(findValue(value, (key) => key.toLowerCase() === "pagination"));
  const totalRecords = readInteger(pagination?.totalRecords ?? pagination?.total_records ?? pagination?.total, messages.length);
  const samples = messages.map(normalizeCampaignMessageSample);
  const sent = samples.filter((item) => item.status === "sent").length;
  const failed = samples.filter((item) => item.status === "failed").length;
  const scheduled = samples.filter((item) => item.status === "scheduled").length;
  const visibleTotal = Math.max(totalRecords, samples.length);
  const unknown = Math.max(0, visibleTotal - sent - failed - scheduled);
  const pending = Math.max(0, visibleTotal - sent - failed);
  const status = resolveCampaignTrackingStatus({ total: visibleTotal, sent, failed, scheduled, pending, unknown });

  return {
    folderId,
    status,
    total: visibleTotal,
    sent,
    failed,
    scheduled,
    pending,
    lastSyncedAt: syncedAt,
    source: "uazapi_sender",
    error: null,
    samples: samples
      .filter((item) => item.status === "failed" || item.error)
      .concat(samples.filter((item) => item.status !== "failed" && !item.error))
      .slice(0, 8),
  };
}

function normalizeCampaignMessageSample(value: unknown): WhatsappCampaignDeliverySample {
  const record = readRecord(value) ?? {};
  const providerStatus = findString(record, ["messageStatus", "message_status", "status", "Status", "state", "sendStatus"]);

  return {
    id: findString(record, ["id", "messageId", "message_id", "keyId", "key_id", "wa_id"]),
    number: findString(record, ["number", "phone", "recipient", "to", "chatId", "chatid", "jid", "remoteJid", "remote_jid"]),
    status: normalizeCampaignMessageStatus(providerStatus, record),
    providerStatus,
    error: findString(record, ["error", "errorMessage", "error_message", "failReason", "fail_reason", "reason", "lastError"]),
    scheduledFor: findDateString(record, ["scheduled_for", "scheduledFor", "scheduledAt", "scheduled_at", "created", "createdAt", "created_at"]),
    sentAt: findDateString(record, ["sentAt", "sent_at", "deliveredAt", "delivered_at", "updated", "updatedAt", "updated_at"]),
  };
}

function normalizeCampaignMessageStatus(
  value: string | null,
  record: JsonRecord,
): WhatsappCampaignDeliverySample["status"] {
  const normalized = value?.trim().toLowerCase().replace(/[\s_-]+/g, "");

  if (normalized) {
    if (["sent", "delivered", "read", "success", "succeeded", "completed", "done", "processed"].includes(normalized)) return "sent";
    if (["failed", "error", "erro", "undelivered", "notdelivered", "notsent", "canceled", "cancelled"].includes(normalized)) return "failed";
    if (["scheduled", "pending", "queued", "queue", "processing", "running", "waiting", "active", "created"].includes(normalized)) return "scheduled";
  }

  if (findString(record, ["error", "errorMessage", "error_message", "failReason", "fail_reason", "lastError"])) {
    return "failed";
  }

  return "unknown";
}

function resolveCampaignTrackingStatus(input: {
  total: number;
  sent: number;
  failed: number;
  scheduled: number;
  pending: number;
  unknown: number;
}): WhatsappCampaignDeliveryTracking["status"] {
  if (input.total <= 0 || input.unknown >= input.total) return "unknown";
  if (input.failed >= input.total) return "failed";
  if (input.sent >= input.total) return "sent";
  if (input.sent > 0 || input.failed > 0) return "partial";
  if (input.pending > 0 || input.scheduled > 0) return "pending";
  return "unknown";
}

function buildCampaignTrackingError(
  folderId: string,
  syncedAt: string,
  message: string,
): WhatsappCampaignDeliveryTracking {
  return {
    folderId,
    status: "unknown",
    total: 0,
    sent: 0,
    failed: 0,
    scheduled: 0,
    pending: 0,
    lastSyncedAt: syncedAt,
    source: "uazapi_sender",
    error: message,
    samples: [],
  };
}

function readCampaignTracking(value: unknown): WhatsappCampaignDeliveryTracking | null {
  const record = readRecord(value);
  const folderId = asString(record?.folderId);
  const lastSyncedAt = asString(record?.lastSyncedAt);

  if (!record || !folderId || !lastSyncedAt) return null;

  const status = normalizeCampaignTrackingStatus(record.status);
  const total = Math.max(0, readInteger(record.total, 0));
  const sent = Math.max(0, readInteger(record.sent, 0));
  const failed = Math.max(0, readInteger(record.failed, 0));
  const scheduled = Math.max(0, readInteger(record.scheduled, 0));
  const pending = Math.max(0, readInteger(record.pending, Math.max(0, total - sent - failed)));

  return {
    folderId,
    status,
    total,
    sent,
    failed,
    scheduled,
    pending,
    lastSyncedAt,
    source: "uazapi_sender",
    error: asString(record.error),
    samples: readCampaignTrackingSamples(record.samples),
  };
}

function readCampaignTrackingSamples(value: unknown): WhatsappCampaignDeliverySample[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = readRecord(item);
      if (!record) return null;

      return {
        id: asString(record.id),
        number: asString(record.number),
        status: normalizeCampaignMessageStatus(asString(record.status), record),
        providerStatus: asString(record.providerStatus),
        error: asString(record.error),
        scheduledFor: asString(record.scheduledFor),
        sentAt: asString(record.sentAt),
      };
    })
    .filter((item): item is WhatsappCampaignDeliverySample => Boolean(item))
    .slice(0, 8);
}

function normalizeCampaignTrackingStatus(value: unknown): WhatsappCampaignDeliveryTracking["status"] {
  if (value === "pending" || value === "sent" || value === "failed" || value === "partial" || value === "unknown") return value;
  return "unknown";
}

function normalizeProviderStatusFromTracking(
  tracking: WhatsappCampaignDeliveryTracking,
  fallback: string | null,
) {
  if (tracking.status === "sent") return "sent";
  if (tracking.status === "failed") return "failed";
  if (tracking.status === "partial") return "partial";
  if (tracking.status === "pending") return "pending";
  return fallback ?? "sent";
}

function summarizeCampaignTrackingResults(items: WhatsappCampaignDeliveryTracking[]) {
  return items.reduce(
    (total, item) => ({
      messages: total.messages + item.total,
      sent: total.sent + item.sent,
      failed: total.failed + item.failed,
      pending: total.pending + item.pending,
      errors: total.errors + (item.error ? 1 : 0),
    }),
    { messages: 0, sent: 0, failed: 0, pending: 0, errors: 0 },
  );
}

function readSenderCampaignFolderId(metadata: JsonRecord) {
  const providerResponse = readRecord(metadata.provider_response);
  return asString(metadata.sender_folder_id)
    ?? asString(metadata.campaign_folder_id)
    ?? readSenderFolderIdFromProviderResponse(providerResponse);
}

function readSenderFolderIdFromProviderResponse(value: unknown) {
  const record = readRecord(value);
  return asString(record?.folder_id) ?? asString(record?.folderId);
}

function isMissingWhatsappChannelTargetsTable(error: unknown) {
  const record = readRecord(error);
  const code = asString(record?.code);
  const message = asString(record?.message)?.toLowerCase() ?? "";
  return code === "42P01" || message.includes("whatsapp_channel_targets");
}

function mapWhatsappChannelTarget(row: WhatsappChannelTargetRow): WhatsappChannelTarget {
  const type = row.target_type === "newsletter" ? "newsletter" : "group";
  const metadata = readRecord(row.metadata) ?? {};
  return {
    id: row.id,
    type,
    jid: row.provider_jid,
    name: row.display_name?.trim() || row.provider_jid,
    description: row.description,
    participantCount: row.participant_count,
    isAdmin: row.is_admin,
    isAnnouncement: row.is_announcement,
    enabled: row.enabled === true,
    campaignEnabled: row.campaign_enabled !== false,
    replyMode: normalizeTargetReplyMode(row.reply_mode),
    mentionMode: normalizeTargetMentionMode(row.mention_mode),
    requireApproval: row.require_approval === true,
    maxRepliesPerHour: clamp(Math.round(row.max_replies_per_hour ?? 6), 0, 120),
    muteUntil: row.mute_until,
    lastSyncedAt: row.last_synced_at,
    groupIntelligence: type === "group" ? readGroupIntelligence(metadata.group_intelligence) : null,
  };
}

function normalizeGroupInfoResponse(
  value: unknown,
  row: WhatsappChannelTargetRow,
  syncedAt: string,
): WhatsappGroupIntelligence {
  const record = readGroupInfoRecord(value);
  const participants = readGroupParticipants(record);
  const participantCount = readGroupParticipantCount(record, participants.length || null) ?? row.participant_count;
  const adminCount = readGroupAdminCount(record, participants);
  const memberCount = participantCount ?? (participants.length > 0 ? participants.length : null);
  const isAdmin = findBooleanShallow(record, ["isAdmin", "is_admin", "IsAdmin", "isSenderAdmin", "senderIsAdmin", "meIsAdmin", "amIAdmin"])
    ?? row.is_admin;
  const isAnnouncement = findBooleanShallow(record, ["announce", "Announce", "isAnnounce", "IsAnnounce", "is_announcement", "isReadOnly", "readOnly"])
    ?? row.is_announcement;
  const isLocked = findBooleanShallow(record, ["isLocked", "IsLocked", "locked", "restrict", "isRestricted", "memberAddMode"]);
  const pendingRequests = readCount(findValue(record, (key, item) => {
    const normalized = key.toLowerCase().replace(/[_-]/g, "");
    return ["requestparticipants", "requestsparticipants", "pendingparticipants", "pendingrequests"].includes(normalized)
      && (Array.isArray(item) || typeof item === "number" || typeof item === "string");
  }));

  return buildGroupIntelligence({
    status: "fresh",
    syncedAt,
    participantCount,
    adminCount,
    memberCount,
    isAdmin,
    isAnnouncement,
    isLocked,
    pendingRequests,
    error: null,
  });
}

function buildGroupIntelligence(input: {
  status: WhatsappGroupIntelligenceStatus;
  syncedAt: string;
  participantCount: number | null;
  adminCount: number | null;
  memberCount: number | null;
  isAdmin: boolean | null;
  isAnnouncement: boolean | null;
  isLocked: boolean | null;
  pendingRequests: number | null;
  error: string | null;
}): WhatsappGroupIntelligence {
  const recommendations: string[] = [];
  let riskLevel: WhatsappGroupRiskLevel = "low";

  if (input.error) {
    riskLevel = "high";
    recommendations.push("Nao foi possivel ler os detalhes deste grupo. Revise a conexao ou sincronize novamente.");
  }

  if (input.isAnnouncement && input.isAdmin === false) {
    riskLevel = "high";
    recommendations.push("Grupo esta como somente avisos e este WhatsApp nao aparece como admin.");
  } else if (input.isAdmin === false) {
    riskLevel = riskLevel === "high" ? "high" : "medium";
    recommendations.push("Numero nao aparece como admin; evite automacoes sensiveis neste grupo.");
  } else if (input.isAdmin === null) {
    riskLevel = riskLevel === "high" ? "high" : "medium";
    recommendations.push("Permissao de admin ainda nao foi confirmada pela Uazapi.");
  }

  if (input.isLocked) {
    riskLevel = riskLevel === "high" ? "high" : "medium";
    recommendations.push("Grupo tem configuracao restrita; alteracoes podem depender de admin.");
  }

  if (input.participantCount === null) {
    riskLevel = riskLevel === "high" ? "high" : "medium";
    recommendations.push("Contagem de membros nao veio no retorno; confira antes de campanhas grandes.");
  } else if (input.participantCount >= 200) {
    recommendations.push("Grupo grande; mantenha delays e mensagens curtas para reduzir risco de bloqueio.");
  }

  if ((input.pendingRequests ?? 0) > 0) {
    recommendations.push("Existem solicitacoes pendentes de entrada no grupo.");
  }

  if (recommendations.length === 0) {
    recommendations.push("Grupo pronto para campanhas com os delays atuais.");
  }

  return {
    status: input.status,
    riskLevel,
    lastSyncedAt: input.syncedAt,
    participantCount: input.participantCount,
    adminCount: input.adminCount,
    memberCount: input.memberCount,
    isAdmin: input.isAdmin,
    isAnnouncement: input.isAnnouncement,
    isLocked: input.isLocked,
    pendingRequests: input.pendingRequests,
    recommendations: recommendations.slice(0, 4),
    error: input.error,
  };
}

function buildGroupIntelligenceError(
  row: WhatsappChannelTargetRow,
  syncedAt: string,
  message: string,
): WhatsappGroupIntelligence {
  return buildGroupIntelligence({
    status: "error",
    syncedAt,
    participantCount: row.participant_count,
    adminCount: null,
    memberCount: row.participant_count,
    isAdmin: row.is_admin,
    isAnnouncement: row.is_announcement,
    isLocked: null,
    pendingRequests: null,
    error: message,
  });
}

function readGroupIntelligence(value: unknown): WhatsappGroupIntelligence | null {
  const record = readRecord(value);
  if (!record) return null;

  const lastSyncedAt = asString(record.lastSyncedAt);
  const storedStatus = normalizeGroupIntelligenceStatus(record.status);
  const status = storedStatus === "fresh" && isOlderThanHours(lastSyncedAt, 72) ? "stale" : storedStatus;

  return {
    status,
    riskLevel: normalizeGroupRiskLevel(record.riskLevel),
    lastSyncedAt,
    participantCount: readNullableInteger(record.participantCount),
    adminCount: readNullableInteger(record.adminCount),
    memberCount: readNullableInteger(record.memberCount),
    isAdmin: asNullableBoolean(record.isAdmin),
    isAnnouncement: asNullableBoolean(record.isAnnouncement),
    isLocked: asNullableBoolean(record.isLocked),
    pendingRequests: readNullableInteger(record.pendingRequests),
    recommendations: readStringArray(record.recommendations).slice(0, 4),
    error: asString(record.error),
  };
}

function readGroupInfoRecord(value: unknown): JsonRecord {
  let record = readRecord(value) ?? {};

  for (let depth = 0; depth < 4; depth += 1) {
    let next: JsonRecord | null = null;

    for (const key of ["group", "Group", "info", "Info", "data", "Data", "response", "Response"]) {
      const nested = readRecord(record[key]);
      if (nested) {
        next = nested;
        break;
      }
    }

    if (!next) break;
    record = next;
  }

  return record;
}

function readGroupParticipants(record: JsonRecord): JsonRecord[] {
  const participants = findValue(record, (key, item) => {
    const normalized = key.toLowerCase().replace(/[_-]/g, "");
    return ["participants", "members", "groupmembers"].includes(normalized) && Array.isArray(item);
  });

  if (!Array.isArray(participants)) return [];

  return participants
    .map((item) => readRecord(item))
    .filter((item): item is JsonRecord => Boolean(item));
}

function readGroupParticipantCount(record: JsonRecord, fallback: number | null) {
  const count = readCount(findValue(record, (key, item) => {
    const normalized = key.toLowerCase().replace(/[_-]/g, "");
    return ["participantcount", "membercount", "memberscount", "size"].includes(normalized)
      && (Array.isArray(item) || typeof item === "number" || typeof item === "string");
  }));

  return count ?? fallback;
}

function readGroupAdminCount(record: JsonRecord, participants: JsonRecord[]) {
  const count = readCount(findValue(record, (key, item) => {
    const normalized = key.toLowerCase().replace(/[_-]/g, "");
    return ["admincount", "adminscount", "admins"].includes(normalized)
      && (Array.isArray(item) || typeof item === "number" || typeof item === "string");
  }));

  if (count !== null) return count;
  if (participants.length === 0) return null;

  return participants.filter((participant) => isGroupParticipantAdmin(participant)).length;
}

function isGroupParticipantAdmin(participant: JsonRecord) {
  const admin = findBooleanShallow(participant, ["isAdmin", "IsAdmin", "admin", "isSuperAdmin", "IsSuperAdmin", "isOwner", "owner"]);
  if (admin !== null) return admin;

  const role = findString(participant, ["role", "type", "participantType"]);
  const normalized = role?.toLowerCase().replace(/[\s_-]+/g, "");
  return normalized === "admin" || normalized === "superadmin" || normalized === "owner";
}

function normalizeGroupIntelligenceStatus(value: unknown): WhatsappGroupIntelligenceStatus {
  return value === "fresh" || value === "stale" || value === "missing" || value === "error" ? value : "missing";
}

function normalizeGroupRiskLevel(value: unknown): WhatsappGroupRiskLevel {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function extractProviderTargetItems(value: unknown, type: WhatsappTargetType) {
  return extractProviderItems(value, type === "group" ? ["groups", "data", "items", "response"] : ["newsletters", "channels", "data", "items", "response"])
    .map((item) => normalizeProviderTargetItem(item, type))
    .filter((item): item is NonNullable<ReturnType<typeof normalizeProviderTargetItem>> => Boolean(item));
}

function extractProviderItems(value: unknown, preferredKeys: string[]): unknown[] {
  if (Array.isArray(value)) return value;
  const record = readRecord(value);
  if (!record) return [];

  for (const key of preferredKeys) {
    const item = record[key];
    if (Array.isArray(item)) return item;
  }

  for (const item of Object.values(record)) {
    if (Array.isArray(item)) return item;
  }

  return [];
}

function normalizeProviderTargetItem(value: unknown, type: WhatsappTargetType) {
  const record = readRecord(value);
  if (!record) return null;

  const jid = findString(record, type === "group"
    ? ["jid", "id", "groupJid", "groupjid", "groupId", "group_id", "chatId", "chatid"]
    : ["jid", "id", "newsletterJid", "newsletterjid", "newsletterId", "newsletter_id", "threadId", "thread_id"]);
  const normalizedJid = normalizeTargetJid(jid, type);
  if (!normalizedJid) return null;

  const participants = findValue(record, (key, item) => {
    const normalizedKey = key.toLowerCase().replace(/[_-]/g, "");
    return ["participants", "members", "participantcount", "membercount", "subscribers", "subscribercount"].includes(normalizedKey)
      && (Array.isArray(item) || typeof item === "number" || typeof item === "string");
  });

  return {
    jid: normalizedJid,
    name: findString(record, ["name", "subject", "title", "displayName", "display_name"]) ?? normalizedJid,
    description: findString(record, ["description", "desc", "about"]),
    participantCount: readCount(participants),
    isAdmin: findBoolean(record, ["isAdmin", "is_admin", "IsAdmin", "isSenderAdmin", "isOwner"]),
    isAnnouncement: findBoolean(record, ["announce", "isAnnounce", "is_announcement", "IsAnnounce", "isReadOnly", "readOnly"]),
    raw: record,
  };
}

function readCampaignTargetRecipients(payload: JsonRecord) {
  const targets = Array.isArray(payload.targets) ? payload.targets : [];
  const recipients = targets
    .map((item) => readRecord(item))
    .map((item) => asString(item?.jid))
    .filter((item): item is string => Boolean(item));

  return recipients.length > 0 ? Array.from(new Set(recipients)) : null;
}

function decryptInstanceToken(instance: WhatsappInstanceRow) {
  if (!instance.instance_token_encrypted) return null;

  try {
    return decryptCredentialValue(instance.instance_token_encrypted);
  } catch {
    return null;
  }
}

function normalizeScheduledFor(value: string | null | undefined) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeRequiredScheduledFor(value: string | null | undefined, message: string) {
  if (!value) throw new Error(message);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(message);
  return date;
}

function normalizeGroupWindowMessage(value: string | null | undefined, fallback: string) {
  return (value?.trim() || fallback).replace(/\s+/g, " ").slice(0, 1200);
}

function buildGroupWindowPayload(input: {
  phase: "open" | "pre_close" | "close";
  targetId: string;
  targetJid: string;
  targetName: string;
  announce: boolean | null;
  text: string;
  mentions?: string;
}) {
  return cleanPayload({
    type: "group_announce_mode",
    phase: input.phase,
    target_id: input.targetId,
    target_jid: input.targetJid,
    target_name: input.targetName,
    announce: input.announce,
    text: input.text,
    mentions: input.mentions,
  });
}

function normalizeCampaignRecurrence(input: {
  frequency?: string | null;
  occurrences?: number | null;
}): JsonRecord | null {
  const frequency = input.frequency === "daily" || input.frequency === "weekly" ? input.frequency : null;
  if (!frequency) return null;

  return {
    enabled: true,
    frequency,
    occurrence_index: 1,
    max_occurrences: clamp(Math.round(input.occurrences ?? (frequency === "daily" ? 7 : 4)), 2, 365),
  };
}

function buildPublishedRecurrenceMetadata(
  value: unknown,
  currentItemId: string,
  nextOccurrence: WhatsappOutboundItem | null,
  publishedAt: string,
  recurrenceError: string | null,
) {
  const recurrence = readStoredRecurrence(value);
  if (!recurrence) return null;

  return cleanPayload({
    enabled: true,
    frequency: recurrence.frequency,
    occurrence_index: recurrence.occurrenceIndex,
    max_occurrences: recurrence.maxOccurrences,
    series_id: recurrence.seriesId ?? nextOccurrence?.recurrence?.seriesId ?? currentItemId,
    last_published_at: publishedAt,
    next_item_id: nextOccurrence?.id,
    next_scheduled_for: nextOccurrence?.scheduledFor,
    finished_at: !nextOccurrence && recurrence.occurrenceIndex >= recurrence.maxOccurrences ? publishedAt : undefined,
    schedule_error: recurrenceError,
  });
}

function readStoredRecurrence(value: unknown): {
  frequency: WhatsappCampaignRecurrenceFrequency;
  occurrenceIndex: number;
  maxOccurrences: number;
  seriesId: string | null;
} | null {
  const record = readRecord(value);
  if (!record || record.enabled !== true) return null;

  const frequency = record.frequency === "daily" || record.frequency === "weekly" ? record.frequency : null;
  if (!frequency) return null;

  const occurrenceIndex = clamp(readInteger(record.occurrence_index, 1), 1, 365);
  const maxOccurrences = clamp(readInteger(record.max_occurrences, 1), 1, 365);

  return {
    frequency,
    occurrenceIndex,
    maxOccurrences,
    seriesId: asString(record.series_id),
  };
}

function nextRecurrenceDate(value: string, frequency: WhatsappCampaignRecurrenceFrequency) {
  const base = new Date(value);
  const date = Number.isNaN(base.getTime()) ? new Date() : base;
  date.setUTCDate(date.getUTCDate() + (frequency === "weekly" ? 7 : 1));
  return date.toISOString();
}

function readCampaignTargetCount(payload: JsonRecord) {
  if (Array.isArray(payload.targets)) return payload.targets.length;
  if (Array.isArray(payload.numbers)) return payload.numbers.length;
  if (asString(payload.jid)) return 1;
  if (asString(payload.target_jid)) return 1;
  return 0;
}

function normalizeWhatsappStatusPayloadType(value: unknown): WhatsappStatusPayloadType {
  if (value === "image" || value === "video" || value === "audio" || value === "myaudio" || value === "ptt") {
    return value;
  }
  return "text";
}

function truncateUtf8Text(value: string | null | undefined, maxBytes: number) {
  const text = value?.trim() ?? "";
  if (!text) return "";
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;

  let output = "";
  for (const char of text) {
    const next = output + char;
    if (Buffer.byteLength(next, "utf8") > maxBytes) break;
    output = next;
  }

  return output.trimEnd();
}

function normalizeGrowthPlanText(type: WhatsappGrowthPlanItemType, text: string) {
  return type === "status"
    ? truncateUtf8Text(text, whatsappStatusTextMaxBytes)
    : text.trim().slice(0, 900);
}

function normalizeStatusMediaAttachment(
  mediaUrl: string | null | undefined,
  statusType: string | null | undefined,
  mediaCaption: string | null | undefined,
) {
  const file = normalizePublicMediaUrl(mediaUrl);
  const type = normalizeWhatsappStatusPayloadType(statusType);

  if (!file || type === "text") return null;

  return {
    type,
    file,
    text: truncateUtf8Text(mediaCaption, whatsappStatusTextMaxBytes) || null,
    source: "manual_url",
    catalogItemId: null as string | null,
  };
}

function buildCatalogStatusMedia(items: ClientSalesCatalogItem[]) {
  return items
    .map((item) => {
      const media = item.media.find((entry) => (entry.kind === "image" || entry.kind === "video") && normalizePublicMediaUrl(entry.storageUrl));
      if (!media) return null;

      return {
        type: media.kind,
        file: media.storageUrl,
        text: truncateUtf8Text(buildCampaignCatalogCaption(item, media), whatsappStatusTextMaxBytes),
        source: "sales_catalog",
        catalogItemId: item.id,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function normalizeCampaignDeliveryMode(value: unknown): WhatsappCampaignDeliveryMode {
  if (value === "audio" || value === "text_audio") return value;
  return "text";
}

function normalizeCampaignInteractiveMode(value: unknown): WhatsappCampaignInteractiveMode {
  return value === "button" ? "button" : "none";
}

function normalizeCampaignButton(
  labelValue: string | null | undefined,
  urlValue: string | null | undefined,
  catalogItems: ClientSalesCatalogItem[],
) {
  const firstProduct = catalogItems[0] ?? null;
  const label = (
    labelValue?.trim()
    || firstProduct?.externalLinkButtonLabel
    || firstProduct?.offer.callToAction
    || "Comprar agora"
  ).slice(0, 24);
  const productUrl = normalizePublicMediaUrl(urlValue)
    ?? normalizePublicMediaUrl(firstProduct?.externalLinkButtonTrackingUrl ?? null)
    ?? normalizePublicMediaUrl(firstProduct?.productUrl ?? null);
  const fallbackId = `comprar_${firstProduct?.id.slice(0, 8) ?? "agora"}`;
  const choice = productUrl ? `${label}|${productUrl}` : `${label}|${fallbackId}`;

  if (!label) return null;

  return {
    label,
    url: productUrl,
    choice,
    kind: productUrl ? "url" : "reply",
    productId: firstProduct?.id ?? null,
  };
}

function readCampaignButtons(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => readRecord(item))
    .map((item) => {
      const choice = asString(item?.choice);
      if (!choice) return null;

      return {
        label: asString(item?.label),
        url: asString(item?.url),
        choice,
        kind: asString(item?.kind),
        productId: asString(item?.productId),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 3);
}

function buildCampaignCarouselCards(
  items: ClientSalesCatalogItem[],
  labelValue: string | null | undefined,
  urlValue: string | null | undefined,
) {
  return items
    .map((item) => {
      const media = item.media.find((entry) => normalizeCampaignMediaKind(entry.kind) && normalizePublicMediaUrl(entry.storageUrl));
      if (!media) return null;

      const productUrl = normalizePublicMediaUrl(urlValue)
        ?? normalizePublicMediaUrl(item.externalLinkButtonTrackingUrl)
        ?? normalizePublicMediaUrl(item.productUrl);
      const label = (
        labelValue?.trim()
        || item.externalLinkButtonLabel
        || item.offer.callToAction
        || "Comprar agora"
      ).slice(0, 24);
      const buttons = [{
        id: productUrl ?? `quero_${item.id.slice(0, 8)}`,
        text: label,
        type: productUrl ? "URL" : "REPLY",
      }];
      const card = cleanPayload({
        text: buildCarouselCardText(item),
        image: media.kind === "image" ? media.storageUrl : undefined,
        video: media.kind === "video" ? media.storageUrl : undefined,
        document: media.kind === "document" ? media.storageUrl : undefined,
        filename: media.kind === "document" ? media.fileName || `${item.title}.pdf` : undefined,
        buttons,
      });

      return card;
    })
    .filter((item): item is JsonRecord => Boolean(item))
    .slice(0, 10);
}

function readCampaignCarouselCards(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => readRecord(item))
    .map((item) => {
      const text = asString(item?.text);
      const buttons = readCarouselButtons(item?.buttons);
      if (!text || buttons.length === 0) return null;

      return cleanPayload({
        text,
        image: normalizePublicMediaUrl(asString(item?.image)),
        video: normalizePublicMediaUrl(asString(item?.video)),
        document: normalizePublicMediaUrl(asString(item?.document)),
        filename: asString(item?.filename),
        buttons,
      });
    })
    .filter((item): item is JsonRecord => Boolean(item))
    .slice(0, 10);
}

function readCarouselButtons(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => readRecord(item))
    .map((item) => {
      const id = asString(item?.id);
      const text = asString(item?.text);
      const type = normalizeCarouselButtonType(item?.type, id);
      if (!id || !text) return null;

      return {
        id,
        text: text.slice(0, 24),
        type,
      };
    })
    .filter((item): item is { id: string; text: string; type: "REPLY" | "URL" | "CALL" | "COPY" } => Boolean(item))
    .slice(0, 4);
}

function normalizeCarouselButtonType(value: unknown, id: string | null): "REPLY" | "URL" | "CALL" | "COPY" {
  if (value === "URL" || value === "CALL" || value === "COPY" || value === "REPLY") return value;
  if (id && normalizePublicMediaUrl(id)) return "URL";
  return "REPLY";
}

function buildCarouselIntroText(items: ClientSalesCatalogItem[]) {
  if (items.length === 1) return `Separei essa opcao pra voce: ${items[0].title}.`;
  const names = items.map((item) => item.title).slice(0, 3).join(", ");
  return `Separei algumas opcoes da loja pra voce ver: ${names}.`;
}

function buildCarouselCardText(item: ClientSalesCatalogItem) {
  const parts = [
    item.title,
    item.price ? `${item.price} ${item.currency}` : "",
    item.highlightLabel,
    item.description ? preview(item.description, 180) : "",
  ];

  return parts.filter(Boolean).join("\n").slice(0, 500);
}

function resolveAllowedGrowthPlanFormats(
  context: WhatsappOperationalContext,
  targets: WhatsappChannelTarget[],
  catalogItems: ClientSalesCatalogItem[],
): WhatsappGrowthPlanItemType[] {
  const formats: WhatsappGrowthPlanItemType[] = [];

  if (context.behavior.campaignBroadcasts || context.behavior.newsletterBroadcasts) {
    formats.push("text");
    if (context.organizationId) {
      formats.push("audio", "text_audio");
    }
    if (context.behavior.interactiveMessages && catalogItems.filter((item) => item.media.some((media) => normalizeCampaignMediaKind(media.kind))).length >= 1) {
      formats.push("carousel");
    }
    if (context.behavior.interactiveMessages && targets.some((target) => target.type === "group")) {
      formats.push("poll");
    }
  }

  if (context.behavior.statusBroadcasts) {
    formats.push("status");
  }

  return Array.from(new Set(formats.length ? formats : ["text"]));
}

function resolvePreferredGrowthPlanFormats(
  availableFormats: WhatsappGrowthPlanItemType[],
  preferredFormats: string[],
) {
  const preferred = Array.from(new Set(preferredFormats
    .map((format) => normalizeGrowthPlanFormatPreference(format))
    .filter((format): format is WhatsappGrowthPlanItemType => Boolean(format))));

  if (preferred.length === 0) return availableFormats;

  const available = new Set(availableFormats);
  const selected = preferred.filter((format) => available.has(format));

  if (selected.length === 0) {
    throw new Error("O formato escolhido nao esta habilitado para este agente ou destino. Ative campanhas, botoes/enquetes, status ou selecione produtos com midia.");
  }

  return selected;
}

function normalizeGrowthPlanFormatPreference(value: string): WhatsappGrowthPlanItemType | null {
  if (value === "audio_text") return "text_audio";
  if (value === "text" || value === "audio" || value === "text_audio" || value === "carousel" || value === "status" || value === "poll") {
    return value;
  }
  return null;
}

function parseGeminiGrowthPlan(value: string) {
  const cleaned = stripCodeFence(value).trim();
  const jsonText = extractJsonObject(cleaned) ?? cleaned;
  const parsed = parseJsonObject(jsonText);
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

  return {
    title: asString(parsed?.title) ?? asString(parsed?.titulo) ?? "",
    strategySummary: asString(parsed?.strategySummary) ?? asString(parsed?.strategy_summary) ?? asString(parsed?.summary) ?? "",
    approvalChecklist: readStringArray(parsed?.approvalChecklist ?? parsed?.checklist ?? parsed?.approval_checklist)
      .map((item) => item.slice(0, 160)),
    items: rawItems,
  };
}

function normalizeGrowthPlanItems(input: {
  rawItems: unknown[];
  allowedFormats: WhatsappGrowthPlanItemType[];
  catalogItems: ClientSalesCatalogItem[];
  targets: WhatsappChannelTarget[];
  durationDays: number;
  postsPerDay: number;
  startFrom: string;
}): WhatsappGrowthPlanItem[] {
  const expectedCount = clamp(input.durationDays * input.postsPerDay, 1, 70);
  const fallback = buildFallbackGrowthPlanItems(input);
  const normalized = input.rawItems
    .map((rawItem, index) => normalizeGrowthPlanAiItem(rawItem, index, input, fallback[index]))
    .filter((item): item is WhatsappGrowthPlanItem => Boolean(item))
    .slice(0, expectedCount);

  if (normalized.length >= expectedCount) {
    return normalized;
  }

  const existingKeys = new Set(normalized.map((item) => `${item.day}:${item.slot}`));
  const missing = fallback.filter((item) => !existingKeys.has(`${item.day}:${item.slot}`));
  return normalized.concat(missing).slice(0, expectedCount);
}

function normalizeGrowthPlanAiItem(
  rawItem: unknown,
  index: number,
  input: Parameters<typeof normalizeGrowthPlanItems>[0],
  fallback: WhatsappGrowthPlanItem | undefined,
): WhatsappGrowthPlanItem | null {
  const record = readRecord(rawItem);
  if (!record) return fallback ?? null;

  const type = normalizeGrowthPlanItemType(record.type ?? record.format ?? record.tipo, input.allowedFormats, fallback?.type ?? "text");
  const productIds = readGrowthPlanProductIds(record.productIds ?? record.product_ids ?? record.productRefs ?? record.products, input.catalogItems);
  const day = clamp(readInteger(record.day ?? record.dia, fallback?.day ?? Math.floor(index / input.postsPerDay) + 1), 1, input.durationDays);
  const slot = clamp(readInteger(record.slot ?? record.post ?? record.ordem, fallback?.slot ?? (index % input.postsPerDay) + 1), 1, input.postsPerDay);
  const text = normalizeGrowthPlanText(type, (
    asString(record.text)
    ?? asString(record.message)
    ?? asString(record.copy)
    ?? fallback?.text
    ?? buildFallbackGrowthPostText(type, productIds, input.catalogItems)
  ));
  const pollChoices = normalizePollChoices(record.pollChoices ?? record.poll_choices ?? record.options ?? fallback?.pollChoices);
  const selectedTargetIds = readStringArray(record.targetIds ?? record.target_ids);
  const targetIds = selectedTargetIds.length > 0
    ? intersectStrings(selectedTargetIds, input.targets.map((target) => target.id))
    : input.targets.map((target) => target.id);

  return {
    id: `growth_${day}_${slot}_${index + 1}`,
    day,
    slot,
    type,
    title: (asString(record.title) ?? asString(record.titulo) ?? fallback?.title ?? `Post ${index + 1}`).slice(0, 90),
    text,
    scheduledFor: buildGrowthPlanScheduledFor(input.startFrom, index, input.postsPerDay),
    targetIds: type === "status" ? [] : targetIds,
    productIds: productIds.length > 0 ? productIds : fallback?.productIds ?? [],
    pollChoices: pollChoices.length >= 2 ? pollChoices : fallback?.pollChoices ?? buildFallbackPollChoices(input.catalogItems),
    buttonLabel: (asString(record.buttonLabel) ?? asString(record.button_label) ?? fallback?.buttonLabel)?.slice(0, 24) ?? null,
  };
}

function buildFallbackGrowthPlanItems(input: {
  allowedFormats: WhatsappGrowthPlanItemType[];
  catalogItems: ClientSalesCatalogItem[];
  targets: WhatsappChannelTarget[];
  durationDays: number;
  postsPerDay: number;
  startFrom: string;
}): WhatsappGrowthPlanItem[] {
  const productIds = input.catalogItems.map((item) => item.id);
  const targetIds = input.targets.map((target) => target.id);
  const count = clamp(input.durationDays * input.postsPerDay, 1, 70);
  const items: WhatsappGrowthPlanItem[] = [];

  for (let index = 0; index < count; index++) {
    const type = pickGrowthPlanType(input.allowedFormats, index, productIds.length);
    const itemProductIds = pickRollingProductIds(productIds, index, type === "carousel" ? 4 : 1);
    const day = Math.floor(index / input.postsPerDay) + 1;
    const slot = (index % input.postsPerDay) + 1;

    items.push({
      id: `growth_${day}_${slot}_${index + 1}`,
      day,
      slot,
      type,
      title: buildFallbackGrowthPostTitle(type, input.catalogItems, itemProductIds, index),
      text: normalizeGrowthPlanText(type, buildFallbackGrowthPostText(type, itemProductIds, input.catalogItems)),
      scheduledFor: buildGrowthPlanScheduledFor(input.startFrom, index, input.postsPerDay),
      targetIds: type === "status" ? [] : targetIds,
      productIds: itemProductIds,
      pollChoices: buildFallbackPollChoices(input.catalogItems),
      buttonLabel: type === "poll" ? null : "Comprar agora",
    });
  }

  return items;
}

function normalizeQueuedGrowthPlanItems(value: unknown, fallbackTargetIds: string[], fallbackProductIds: string[]): WhatsappGrowthPlanItem[] {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item, index) => {
      const record = readRecord(item);
      if (!record) return null;

      const scheduledFor = asString(record.scheduledFor) ?? asString(record.scheduled_for);
      const text = asString(record.text) ?? asString(record.message);
      if (!scheduledFor || !text) return null;

      const type = normalizeGrowthPlanItemType(record.type, ["text", "audio", "text_audio", "carousel", "status", "poll"], "text");
      const productIds = readFlexibleStringArray(record.productIds ?? record.product_ids);
      const targetIds = readFlexibleStringArray(record.targetIds ?? record.target_ids);
      const day = clamp(readInteger(record.day, Math.floor(index / 3) + 1), 1, 365);
      const slot = clamp(readInteger(record.slot, (index % 3) + 1), 1, 12);

      return {
        id: asString(record.id) ?? `queued_growth_${index + 1}`,
        day,
        slot,
        type,
        title: (asString(record.title) ?? `Rotina IA WhatsApp - ${index + 1}`).slice(0, 90),
        text: normalizeGrowthPlanText(type, text),
        scheduledFor: normalizeScheduledFor(scheduledFor),
        targetIds: targetIds.length > 0 ? targetIds : fallbackTargetIds,
        productIds: productIds.length > 0 ? productIds : fallbackProductIds.slice(0, 4),
        pollChoices: normalizePollChoices(record.pollChoices ?? record.poll_choices).length >= 2
          ? normalizePollChoices(record.pollChoices ?? record.poll_choices)
          : ["Quero esse", "Quero outra opcao", "Me chama no privado"],
        buttonLabel: asString(record.buttonLabel) ?? asString(record.button_label),
      };
    })
    .filter((item): item is WhatsappGrowthPlanItem => Boolean(item))
    .slice(0, 70);
}

function normalizeGrowthPlanItemType(
  value: unknown,
  allowedFormats: WhatsappGrowthPlanItemType[],
  fallback: WhatsappGrowthPlanItemType,
): WhatsappGrowthPlanItemType {
  const normalized = typeof value === "string" ? value.trim().toLowerCase().replace(/[-\s]+/g, "_") : "";
  const candidate = normalized === "audio_text" ? "text_audio" : normalized;
  if (candidate === "text" || candidate === "audio" || candidate === "text_audio" || candidate === "carousel" || candidate === "status" || candidate === "poll") {
    return allowedFormats.includes(candidate) ? candidate : fallback;
  }
  return fallback;
}

function pickGrowthPlanType(allowedFormats: WhatsappGrowthPlanItemType[], index: number, productCount: number): WhatsappGrowthPlanItemType {
  const candidates: WhatsappGrowthPlanItemType[] = [];
  if (productCount >= 2) candidates.push("carousel");
  candidates.push("text_audio", "status", "poll", "text", "audio");
  return candidates.find((candidate, offset) => allowedFormats.includes(candidate) && (index + offset) % Math.max(2, candidates.length - 1) === 0)
    ?? candidates.find((candidate) => allowedFormats.includes(candidate))
    ?? "text";
}

function readGrowthPlanProductIds(value: unknown, catalogItems: ClientSalesCatalogItem[]) {
  const byReference = new Map<string, string>();
  catalogItems.forEach((item, index) => {
    byReference.set(item.id, item.id);
    byReference.set(`p${index + 1}`, item.id);
    byReference.set(String(index + 1), item.id);
    byReference.set(item.title.toLowerCase(), item.id);
  });

  return Array.from(new Set(readFlexibleStringArray(value)
    .map((entry) => byReference.get(entry.toLowerCase()) ?? byReference.get(entry) ?? null)
    .filter((entry): entry is string => Boolean(entry))))
    .slice(0, 6);
}

function readFlexibleStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const record = readRecord(item);
      if (record) {
        return [
          asString(record.id),
          asString(record.ref),
          asString(record.reference),
          asString(record.title),
          asString(record.name),
        ].filter((entry): entry is string => Boolean(entry));
      }

      return String(item)
        .split(/[,\n;]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    });
  }

  if (typeof value === "string") {
    return value
      .split(/[,\n;]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function buildGrowthPlanScheduledFor(startFrom: string, index: number, postsPerDay: number) {
  const start = new Date(startFrom);
  const date = Number.isNaN(start.getTime()) ? new Date(Date.now() + 60 * 60_000) : start;
  const dayOffset = Math.floor(index / postsPerDay);
  const slotOffset = index % postsPerDay;
  const minutesBetweenSlots = Math.floor((10 * 60) / Math.max(1, postsPerDay));

  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCMinutes(date.getUTCMinutes() + slotOffset * minutesBetweenSlots);

  return date.toISOString();
}

function pickRollingProductIds(productIds: string[], index: number, count: number) {
  if (productIds.length === 0) return [];

  const selected = [];
  for (let offset = 0; offset < Math.min(count, productIds.length); offset++) {
    selected.push(productIds[(index + offset) % productIds.length]);
  }

  return selected;
}

function buildFallbackGrowthPostTitle(
  type: WhatsappGrowthPlanItemType,
  catalogItems: ClientSalesCatalogItem[],
  productIds: string[],
  index: number,
) {
  const product = catalogItems.find((item) => productIds.includes(item.id));
  if (type === "carousel") return "Vitrine de produtos";
  if (type === "poll") return "Enquete de preferencia";
  if (type === "status") return "Status de relacionamento";
  return product?.title ? `Oferta: ${product.title}` : `Post WhatsApp ${index + 1}`;
}

function buildFallbackGrowthPostText(
  type: WhatsappGrowthPlanItemType,
  productIds: string[],
  catalogItems: ClientSalesCatalogItem[],
) {
  const selected = catalogItems.filter((item) => productIds.includes(item.id));
  const product = selected[0] ?? catalogItems[0];

  if (type === "poll") {
    return "Qual dessas opcoes voces querem que eu detalhe melhor hoje?";
  }

  if (type === "carousel" && selected.length > 1) {
    return `Separei ${selected.length} opcoes que estao disponiveis na loja. Olha qual combina melhor com o que voce procura e me chama aqui.`;
  }

  if (!product) {
    return "Passei pra lembrar que temos novidades disponiveis hoje. Quem quiser, me chama que eu separo as melhores opcoes.";
  }

  return [
    `${product.title} esta disponivel na loja.`,
    product.price ? `Valor: ${product.price} ${product.currency}.` : "",
    product.description ? preview(product.description, 220) : "",
    "Quem quiser, me chama que eu ajudo a escolher certinho.",
  ].filter(Boolean).join(" ");
}

function buildFallbackPollChoices(items: ClientSalesCatalogItem[]) {
  const choices = items.map((item) => item.title).slice(0, 4);
  return (choices.length >= 2 ? choices : ["Quero oferta", "Quero indicacao", "Tenho duvida"]).slice(0, 5);
}

function buildFallbackGrowthStrategySummary(items: ClientSalesCatalogItem[], targets: WhatsappChannelTarget[]) {
  const targetText = targets.length ? `${targets.length} destino(s)` : "status do agente";
  const productText = items.length ? `${items.length} produto(s)` : "tema informado";
  return `Rotina baseada em ${productText}, alternando formatos para manter presenca comercial em ${targetText}.`;
}

function buildGrowthPlanApprovalChecklist(formats: WhatsappGrowthPlanItemType[]) {
  const checklist = [
    "Confirmar precos, estoque e links dos produtos selecionados.",
    "Conferir se os horarios respeitam a rotina do grupo ou canal.",
    "Validar se o tom combina com o agente escolhido.",
  ];

  if (formats.includes("audio") || formats.includes("text_audio")) {
    checklist.push("Revisar consumo de creditos dos audios antes de aprovar a rotina.");
  }

  if (formats.includes("poll")) {
    checklist.push("Conferir se as opcoes da enquete ajudam a tomar decisao comercial.");
  }

  return checklist;
}

function intersectStrings(source: string[], allowed: string[]) {
  const allowedSet = new Set(allowed);
  return source.filter((item) => allowedSet.has(item));
}

function normalizePollChoices(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n;]/)
      : [];

  return Array.from(new Set(source
    .map((item) => String(item).trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .map((item) => item.slice(0, 80))))
    .slice(0, 12);
}

function normalizeManualCampaignAttachments(
  mediaUrl: string | null | undefined,
  mediaKind: string | null | undefined,
  mediaCaption: string | null | undefined,
) {
  const file = normalizePublicMediaUrl(mediaUrl);
  const type = normalizeCampaignMediaKind(mediaKind);

  if (!file || !type) return [];

  return [{
    type,
    file,
    text: mediaCaption?.trim().slice(0, 500) || null,
    source: "manual_url",
    catalogItemId: null,
    catalogItemTitle: null,
  }];
}

function buildCatalogCampaignAttachments(items: ClientSalesCatalogItem[]) {
  return items
    .map((item) => {
      const media = item.media.find((entry) => normalizeCampaignMediaKind(entry.kind) && normalizePublicMediaUrl(entry.storageUrl));
      if (!media) return null;

      return {
        type: media.kind,
        file: media.storageUrl,
        text: buildCampaignCatalogCaption(item, media),
        source: "sales_catalog",
        catalogItemId: item.id,
        catalogItemTitle: item.title,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function readCampaignMediaAttachments(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => readRecord(item))
    .map((item) => {
      const file = normalizePublicMediaUrl(asString(item?.file));
      const type = normalizeCampaignMediaKind(asString(item?.type));
      if (!file || !type) return null;

      return {
        type,
        file,
        text: asString(item?.text),
        source: asString(item?.source),
        catalogItemId: asString(item?.catalogItemId),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 6);
}

function normalizeCampaignMediaKind(value: unknown): SalesCatalogMediaKind | null {
  if (value === "image" || value === "video" || value === "document") return value;
  return null;
}

function normalizePublicMediaUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function buildCampaignCatalogCaption(item: ClientSalesCatalogItem, media: SalesCatalogMedia) {
  const parts = [
    item.title,
    item.price ? `${item.price} ${item.currency}` : "",
    item.highlightLabel,
    media.kind === "document" ? media.fileName : "",
  ];

  return parts.filter(Boolean).join(" | ").slice(0, 500);
}

function formatCampaignCatalogPromptItem(item: ClientSalesCatalogItem, index: number) {
  return [
    `${index + 1}. ${item.title}`,
    item.price ? `Preco: ${item.price} ${item.currency}` : "",
    item.category ? `Categoria: ${item.category}` : "",
    item.highlightLabel ? `Destaque: ${item.highlightLabel}` : "",
    item.offer.callToAction ? `CTA: ${item.offer.callToAction}` : "",
    item.description ? `Descricao: ${preview(item.description, 420)}` : "",
    item.media.length ? `Midias disponiveis: ${item.media.length}` : "Sem midia cadastrada",
  ].filter(Boolean).join(" / ");
}

function isFutureIso(value: string | null, now: number) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() >= now;
}

function getSaoPauloHour(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const hour = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date).find((part) => part.type === "hour")?.value;
  const parsed = hour ? Number(hour) : NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

function resolveRecommendedCampaignHour(hours: Map<number, number>) {
  if (hours.size === 0) return 10;

  return Array.from(hours.entries())
    .filter(([hour]) => hour >= 8 && hour <= 21)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 10;
}

function buildNextSuggestedCampaignSlot(hourBrt: number) {
  const now = new Date();
  const next = new Date(now);
  const utcHour = (clamp(Math.round(hourBrt), 6, 22) + 3) % 24;

  next.setUTCHours(utcHour, 0, 0, 0);
  if (next.getTime() <= now.getTime() + 60 * 60 * 1000) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  while (next.getUTCDay() === 0) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next.toISOString();
}

function buildCampaignOptimizationReasons(
  summary: WhatsappOperationsAnalytics["summary"],
  upcomingCount: number,
  publishedHours: Map<number, number>,
  recommendedHour: number,
) {
  const reasons = [];

  if (publishedHours.size > 0) {
    reasons.push(`Melhor janela observada: ${String(recommendedHour).padStart(2, "0")}:00 em Sao Paulo.`);
  } else {
    reasons.push("Sem historico suficiente: usando 10:00 como janela inicial segura.");
  }

  if (upcomingCount > 0) {
    reasons.push(`${upcomingCount} envio(s) ja estao no calendario.`);
  } else {
    reasons.push("Nenhum envio futuro agendado; programe o proximo post para manter cadencia.");
  }

  if (summary.failed > 0) {
    reasons.push(`${summary.failed} envio(s) precisam revisao antes de aumentar volume.`);
  }

  if (summary.failedMessages > 0) {
    reasons.push(`${summary.failedMessages} mensagem(ns) falharam na fila Uazapi; revise numeros e limites antes do proximo lote.`);
  }

  if (summary.recurring === 0 && summary.published > 0) {
    reasons.push("Use recorrencia em campanhas que funcionam para manter presenca sem retrabalho.");
  }

  if (summary.withMedia === 0 && summary.published > 0) {
    reasons.push("Teste anexos de produto ou imagem em parte das campanhas para comparar resposta.");
  }

  return reasons.slice(0, 4);
}

function readPayloadCatalogItems(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => readRecord(item))
    .map((item) => {
      const id = asString(item?.id);
      const title = asString(item?.title);
      if (!id || !title) return null;
      return { id, title };
    })
    .filter((item): item is { id: string; title: string } => Boolean(item));
}

function readPayloadTargetTypes(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => readRecord(item))
    .map((item) => asString(item?.type))
    .filter((item): item is string => item === "group" || item === "newsletter");
}

function buildWhatsappCampaignSegments(
  summary: WhatsappOperationsAnalytics["summary"],
  targetTypeCounts: Map<string, number>,
  productCounts: Map<string, { id: string; title: string; count: number }>,
) {
  const segments = [
    {
      id: "status_viewers",
      label: "Respondeu status",
      count: summary.statusPosts,
      description: "Usar quando leads responderem ao status do agente e entrarem em conversa quente.",
    },
    {
      id: "poll_engaged",
      label: "Votou em enquete",
      count: summary.pollPosts,
      description: "Separar quem interagiu com perguntas de preferencia para campanhas de oferta.",
    },
    {
      id: "carousel_interested",
      label: "Recebeu carrossel",
      count: summary.carouselPosts,
      description: "Puxar follow-up por produto visualizado ou botao clicado quando houver webhook.",
    },
    {
      id: "group_relationship",
      label: "Relacionamento em grupo",
      count: targetTypeCounts.get("group") ?? 0,
      description: "Agrupar conversas nascidas de grupos para medir temas e ofertas que mais aquecem.",
    },
  ];

  const topProduct = Array.from(productCounts.values()).sort((a, b) => b.count - a.count)[0];
  if (topProduct) {
    segments.unshift({
      id: `product_${topProduct.id}`,
      label: `Interesse: ${topProduct.title}`.slice(0, 64),
      count: topProduct.count,
      description: "Produto mais usado nas campanhas recentes; bom candidato para rotina de follow-up.",
    });
  }

  return segments.filter((segment) => segment.count > 0).slice(0, 5);
}

function normalizeRecipientList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeRecipient(String(item))).filter((item): item is string => Boolean(item));
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,;]/)
      .map((item) => normalizeRecipient(item))
      .filter((item): item is string => Boolean(item));
  }

  return [];
}

function normalizeRecipient(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("@")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

function normalizeNewsletterJid(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith("@newsletter")) return trimmed;
  const id = trimmed.replace(/[^\d]/g, "");
  return id ? `${id}@newsletter` : null;
}

function normalizeTargetJid(value: string | null, type: WhatsappTargetType) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (type === "group") {
    if (trimmed.endsWith("@g.us")) return trimmed;
    const digits = trimmed.replace(/[^\d-]/g, "");
    return digits ? `${digits}@g.us` : null;
  }

  return normalizeNewsletterJid(trimmed);
}

function normalizeTargetReplyMode(value: unknown): WhatsappTargetReplyMode {
  if (value === "off" || value === "all" || value === "mentions" || value === "admins" || value === "observer") {
    return value;
  }
  return "mentions";
}

function normalizeTargetMentionMode(value: unknown): WhatsappTargetMentionMode {
  if (value === "none" || value === "author" || value === "all") {
    return value;
  }
  return "none";
}

function normalizeMuteUntil(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanPayload(value: JsonRecord) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item === null || item === undefined || item === "") return false;
      if (Array.isArray(item) && item.length === 0) return false;
      return true;
    }),
  );
}

function countProviderItems(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  const record = readRecord(value);
  if (!record) return null;

  for (const key of ["response", "data", "items", "groups", "newsletters", "folders"]) {
    const item = record[key];
    if (Array.isArray(item)) return item.length;
  }

  return null;
}

function readProviderError(value: unknown) {
  if (typeof value === "string") return value.trim() || null;
  return findString(value, ["error", "message", "detail"]);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : readRecord(error)?.name === "AbortError";
}

function parseGeminiCampaignDraft(value: string) {
  const cleaned = stripCodeFence(value).trim();
  const jsonText = extractJsonObject(cleaned) ?? cleaned;
  const parsed = parseJsonObject(jsonText);
  const title = asString(parsed?.title) ?? asString(parsed?.titulo) ?? "";
  const text = asString(parsed?.text) ?? asString(parsed?.texto) ?? asString(parsed?.message) ?? (parsed ? "" : cleaned);
  const checklist = readStringArray(parsed?.approvalChecklist ?? parsed?.checklist ?? parsed?.approval_checklist)
    .map((item) => item.slice(0, 160));

  return {
    title,
    text,
    approvalChecklist: checklist.length > 0
      ? checklist
      : [
        "Confirmar se a oferta e as condicoes estao corretas.",
        "Conferir se o tom combina com o grupo ou canal.",
        "Remover qualquer promessa que nao esteja aprovada.",
      ],
  };
}

function parseGeminiStatusDraft(value: string) {
  const cleaned = stripCodeFence(value).trim();
  const jsonText = extractJsonObject(cleaned) ?? cleaned;
  const parsed = parseJsonObject(jsonText);
  const text = asString(parsed?.text) ?? asString(parsed?.texto) ?? asString(parsed?.message) ?? (parsed ? "" : cleaned);
  const checklist = readStringArray(parsed?.approvalChecklist ?? parsed?.checklist ?? parsed?.approval_checklist)
    .map((item) => item.slice(0, 160));

  return {
    text,
    backgroundColor: clamp(readInteger(parsed?.backgroundColor ?? parsed?.background_color, 4), 1, 19),
    approvalChecklist: checklist.length > 0
      ? checklist
      : [
        "Confirmar se produto, preco e disponibilidade estao corretos.",
        "Conferir se o texto parece natural para status.",
        "Remover promessa ou condicao que nao esteja aprovada.",
      ],
  };
}

function extractGeminiText(value: unknown) {
  const candidates = readRecord(value)?.candidates;

  if (!Array.isArray(candidates)) {
    return "";
  }

  return candidates
    .flatMap((candidate) => {
      const parts = readRecord(readRecord(candidate)?.content)?.parts;
      return Array.isArray(parts) ? parts : [];
    })
    .map((part) => readRecord(part)?.text)
    .filter((text): text is string => typeof text === "string")
    .join("\n")
    .trim();
}

function readGeminiError(value: unknown) {
  const error = readRecord(readRecord(value)?.error);
  const message = error?.message;
  return typeof message === "string" ? message : null;
}

function stripCodeFence(value: string) {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObject(value: string) {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  return start >= 0 && end > start ? value.slice(start, end + 1) : null;
}

function parseJsonObject(value: string) {
  try {
    return readRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function findString(value: unknown, keys: string[]): string | null {
  const lower = new Set(keys.map((key) => key.toLowerCase()));
  const found = findValue(value, (key, item) => lower.has(key.toLowerCase()) && typeof item === "string" && item.trim().length > 0);
  return typeof found === "string" ? found.trim() : null;
}

function findDateString(value: unknown, keys: string[]): string | null {
  const raw = findString(value, keys);
  if (!raw) return null;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

function findBooleanShallow(value: unknown, keys: string[]): boolean | null {
  const record = readRecord(value);
  if (!record) return null;

  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase().replace(/[_-]/g, "")));

  for (const [key, item] of Object.entries(record)) {
    if (!normalizedKeys.has(key.toLowerCase().replace(/[_-]/g, ""))) continue;
    const parsed = asNullableBoolean(item);
    if (parsed !== null) return parsed;
  }

  return null;
}

function findBoolean(value: unknown, keys: string[]): boolean | null {
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase().replace(/[_-]/g, "")));
  const found = findValue(value, (key, item) => normalizedKeys.has(key.toLowerCase().replace(/[_-]/g, ""))
    && (typeof item === "boolean" || typeof item === "string" || typeof item === "number"));
  const parsed = asNullableBoolean(found);
  if (parsed !== null) return parsed;

  if (typeof found === "boolean") return found;
  if (typeof found === "number") return found === 1;
  if (typeof found === "string") {
    const normalized = found.trim().toLowerCase();
    if (["true", "1", "yes", "sim", "admin", "owner"].includes(normalized)) return true;
    if (["false", "0", "no", "nao", "não", "member"].includes(normalized)) return false;
  }

  return null;
}

function findValue(value: unknown, predicate: (key: string, value: unknown) => boolean): unknown {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValue(item, predicate);
      if (found) return found;
    }
    return null;
  }

  for (const [key, item] of Object.entries(value as JsonRecord)) {
    if (predicate(key, item)) return item;
    const found = findValue(item, predicate);
    if (found) return found;
  }

  return null;
}

function readCount(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readNullableInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}

function asNullableBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "sim", "admin", "owner", "superadmin"].includes(normalized)) return true;
    if (["false", "0", "no", "nao", "member", "membro"].includes(normalized)) return false;
  }

  return null;
}

function isOlderThanHours(value: string | null, hours: number) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() > hours * 60 * 60 * 1000;
}

function sanitizeProviderData(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitizeProviderData);

  return Object.fromEntries(
    Object.entries(value as JsonRecord).map(([key, item]) => {
      const normalized = key.toLowerCase();
      if (normalized.includes("token") || normalized.includes("secret") || normalized.includes("qrcode")) {
        return [key, "[redacted]"];
      }
      return [key, sanitizeProviderData(item)];
    }),
  );
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readInteger(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function preview(value: string, maxLength: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 3)}...` : cleaned;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
