import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeWhatsappBehaviorConfig, type WhatsappBehaviorConfig } from "./agent-behavior";
import { loadUazapiCredentials, type UazapiCredentials } from "./uazapi-credentials";

type JsonRecord = Record<string, unknown>;
type WhatsappScope = "platform" | "organization";
type WhatsappOutboundOperation = "status" | "campaign_simple" | "newsletter_text";
type WhatsappTargetType = "group" | "newsletter";
type WhatsappTargetReplyMode = "off" | "all" | "mentions" | "admins" | "observer";
type WhatsappTargetMentionMode = "none" | "author" | "all";

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
};

const instanceSelect = "id, organization_id, provider_instance_id, phone_number, display_name, status, instance_token_encrypted, metadata";
const outboundTypes = ["whatsapp_status", "whatsapp_campaign", "whatsapp_newsletter"];

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
  const history = await listWhatsappOutboundItems(client, context);

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
  };
}

export async function fetchWhatsappGroups(context: WhatsappOperationalContext) {
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
  const result = await callUazapi(context, "/instance/wa_messages_limits", {
    method: "GET",
  });

  return {
    fetchedAt: new Date().toISOString(),
    data: sanitizeProviderData(result.data),
  };
}

export async function fetchWhatsappCampaignFolders(context: WhatsappOperationalContext) {
  const result = await callUazapi(context, "/sender/listfolders", {
    method: "GET",
  });

  return {
    fetchedAt: new Date().toISOString(),
    count: countProviderItems(result.data),
    data: sanitizeProviderData(result.data),
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
  },
) {
  if (!context.behavior.statusBroadcasts) {
    throw new Error("Ative Status no comportamento do agente antes de publicar stories.");
  }

  const text = input.text.trim();
  if (!text) throw new Error("Escreva o texto do status.");

  const maxRecipients = clamp(
    Math.round(input.maxRecipients ?? context.behavior.whatsappMaxStatusRecipients),
    1,
    context.behavior.whatsappMaxStatusRecipients,
  );

  return queueWhatsappOutbound(client, context, {
    operation: "status",
    title: `Status WhatsApp - ${new Date().toLocaleDateString("pt-BR")}`,
    summary: preview(text, 180),
    body: text,
    scheduledFor: input.scheduledFor,
    payload: {
      type: "text",
      text,
      backgroundColor: clamp(Math.round(input.backgroundColor ?? 4), 1, 19),
      max_recipients: maxRecipients,
      recipients: normalizeRecipientList(input.recipients),
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
  },
) {
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

  const mentionAll = Boolean(input.mentionAll);
  if (mentionAll && targets.some((target) => target.type !== "group")) {
    throw new Error("Mencionar todos so pode ser usado em grupos.");
  }

  const title = input.title.trim() || `Campanha WhatsApp - ${new Date().toLocaleDateString("pt-BR")}`;
  return queueWhatsappOutbound(client, context, {
    operation: "campaign_simple",
    title,
    summary: `${targets.length} destino(s): ${preview(text, 140)}`,
    body: text,
    scheduledFor: input.scheduledFor,
    payload: {
      type: "text",
      text,
      target_mode: "whatsapp_targets",
      targets: targets.map((target) => ({
        id: target.id,
        type: target.type,
        jid: target.jid,
        name: target.name,
      })),
      mentions: mentionAll ? "all" : undefined,
    },
  });
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
    const operation = asString(metadata.operation) as WhatsappOutboundOperation | null;
    const context = await resolveContextByOutboundItem(client, claimed);
    const payload = readRecord(metadata.payload) ?? {};
    let providerResponse: unknown;

    if (operation === "status") {
      providerResponse = await callUazapi(context, "/send/status", {
        method: "POST",
        body: cleanPayload({
          type: payload.type ?? "text",
          text: payload.text ?? item.body,
          backgroundColor: payload.backgroundColor,
          max_recipients: payload.max_recipients,
          recipients: payload.recipients,
        }),
      }).then((result) => result.data);
    } else if (operation === "campaign_simple") {
      const targetRecipients = readCampaignTargetRecipients(payload);

      if (targetRecipients) {
        const responses = [];
        for (const recipient of targetRecipients) {
          const sent = await callUazapi(context, "/send/text", {
            method: "POST",
            body: cleanPayload({
              number: recipient,
              text: payload.text ?? item.body,
              mentions: payload.mentions,
              linkPreview: true,
              track_source: "connectyhub",
              track_id: `campaign_${item.id}`,
            }),
          }).then((result) => result.data);
          responses.push({ recipient, response: sanitizeProviderData(sent) });
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
    await client
      .from("content_pipeline_items")
      .update({
        status: "published",
        published_at: publishedAt,
        metadata: {
          ...(metadata ?? {}),
          provider_status: "sent",
          provider_response: sanitizeProviderData(providerResponse),
          processed_at: publishedAt,
        },
      })
      .eq("id", item.id);

    await recordOutboundEvent(client, context, item, "whatsapp.outbound.sent", "Envio WhatsApp processado", providerResponse);
    return { id: item.id, status: "published" };
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
  },
) {
  const scheduledFor = normalizeScheduledFor(input.scheduledFor);
  const contentType = input.operation === "status"
    ? "whatsapp_status"
    : input.operation === "campaign_simple"
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
      },
    })
    .select("id, scope, organization_id, content_type, status, title, summary, body, scheduled_for, published_at, tags, metadata, created_at")
    .single<ContentPipelineRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel agendar o envio WhatsApp.");
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

async function syncWhatsappChannelTargets(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  type: WhatsappTargetType,
  providerData: unknown,
) {
  const now = new Date().toISOString();
  const items = extractProviderTargetItems(providerData, type);
  if (items.length === 0) return [];

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

async function listWhatsappOutboundItems(
  client: SupabaseClient,
  context: WhatsappOperationalContext,
  limit = 12,
): Promise<WhatsappOutboundItem[]> {
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

  return ((data ?? []) as ContentPipelineRow[]).map(mapOutboundItem);
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
  },
) {
  const url = new URL(`${context.credentials.baseUrl}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: options.method,
    headers: {
      Accept: "application/json",
      token: context.token,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const data = await readResponse(response);

  if (!response.ok) {
    throw new Error(readProviderError(data) ?? `Uazapi respondeu status ${response.status}.`);
  }

  return { status: response.status, data };
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
  };
}

function isMissingWhatsappChannelTargetsTable(error: unknown) {
  const record = readRecord(error);
  const code = asString(record?.code);
  const message = asString(record?.message)?.toLowerCase() ?? "";
  return code === "42P01" || message.includes("whatsapp_channel_targets");
}

function mapWhatsappChannelTarget(row: WhatsappChannelTargetRow): WhatsappChannelTarget {
  const type = row.target_type === "newsletter" ? "newsletter" : "group";
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
  };
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

function findString(value: unknown, keys: string[]): string | null {
  const lower = new Set(keys.map((key) => key.toLowerCase()));
  const found = findValue(value, (key, item) => lower.has(key.toLowerCase()) && typeof item === "string" && item.trim().length > 0);
  return typeof found === "string" ? found.trim() : null;
}

function findBoolean(value: unknown, keys: string[]): boolean | null {
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase().replace(/[_-]/g, "")));
  const found = findValue(value, (key, item) => normalizedKeys.has(key.toLowerCase().replace(/[_-]/g, ""))
    && (typeof item === "boolean" || typeof item === "string" || typeof item === "number"));

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

function preview(value: string, maxLength: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 3)}...` : cleaned;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
