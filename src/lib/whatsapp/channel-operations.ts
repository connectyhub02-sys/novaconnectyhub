import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeWhatsappBehaviorConfig, type WhatsappBehaviorConfig } from "./agent-behavior";
import { loadUazapiCredentials, type UazapiCredentials } from "./uazapi-credentials";

type JsonRecord = Record<string, unknown>;
type WhatsappScope = "platform" | "organization";
type WhatsappOutboundOperation = "status" | "campaign_simple" | "newsletter_text";

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
): Promise<WhatsappOperationalContext> {
  const { data, error } = await client
    .from("whatsapp_instances")
    .select(instanceSelect)
    .eq("provider", "uazapi")
    .eq("organization_id", organizationId)
    .neq("status", "archived")
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
    history,
  };
}

export async function fetchWhatsappGroups(context: WhatsappOperationalContext) {
  const result = await callUazapi(context, "/group/list", {
    method: "GET",
    query: { noparticipants: true },
  });

  return {
    fetchedAt: new Date().toISOString(),
    count: countProviderItems(result.data),
    data: sanitizeProviderData(result.data),
  };
}

export async function fetchWhatsappNewsletters(context: WhatsappOperationalContext) {
  const result = await callUazapi(context, "/newsletter/list", {
    method: "GET",
  });

  return {
    fetchedAt: new Date().toISOString(),
    count: countProviderItems(result.data),
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
    const globalConfig = await loadOrganizationGlobalBehaviorConfig(client, input.organizationId);
    return normalizeWhatsappBehaviorConfig(globalConfig);
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
