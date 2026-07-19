import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { createServiceClient } from "@/lib/supabase/service";
import { buildMetaCrmSnapshot, normalizeMetaEventToCrm } from "./event-normalizer";
import {
  isMetaSocialChannel,
  metaSocialCommentReceivedEventName,
  metaSocialMessageReceivedEventName,
  type MetaSocialChannel,
} from "./social-agent-policy";
import type { MetaWebhookEvent } from "./webhook-events";
import {
  isReplayableMetaWebhookStatus,
  normalizeMetaWebhookMonitorStatus,
  resolveMetaWebhookMonitorChannel,
  summarizeMetaWebhookChannels,
  summarizeMetaWebhookMonitorEvents,
  type MetaWebhookMonitorChannel,
  type MetaWebhookMonitorSummary,
} from "./webhook-monitor-policy";

type JsonRecord = Record<string, unknown>;

type OrganizationIntegrationRow = {
  id: string;
  organization_id: string;
  status: string | null;
  connection_label: string | null;
  external_account_label: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  metadata: JsonRecord | null;
};

type IntegrationEventRow = {
  id: string;
  organization_id: string;
  organization_integration_id: string | null;
  provider_id: string;
  event_type: string;
  status: string | null;
  source_event_id: string | null;
  payload: JsonRecord | null;
  headers: JsonRecord | null;
  error_message: string | null;
  received_at: string | null;
  processed_at: string | null;
  created_at: string | null;
};

type AgentRunRow = {
  id: string;
  run_status: string | null;
  trigger_source: string | null;
  input_summary: string | null;
  error_message: string | null;
  metadata: JsonRecord | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
};

type ActionLogRow = {
  id: string;
  action: string;
  status: string | null;
  metadata: JsonRecord | null;
  created_at: string | null;
};

export type MetaWebhookMonitorEvent = {
  id: string;
  eventType: string;
  status: "received" | "processed" | "ignored" | "failed";
  channel: MetaWebhookMonitorChannel;
  sourceEventId: string | null;
  assetId: string | null;
  leadIdentity: string | null;
  direction: "inbound" | "outbound" | "system" | "unknown";
  textPreview: string | null;
  errorMessage: string | null;
  receivedAt: string | null;
  processedAt: string | null;
  replayable: boolean;
  origin: "meta" | "simulation";
};

export type MetaWebhookMonitorChannelSummary = ReturnType<typeof summarizeMetaWebhookChannels>[number];

export type MetaWebhookMonitorAgentQueue = {
  total: number;
  queued: number;
  running: number;
  needsApproval: number;
  completed: number;
  failed: number;
  cancelled: number;
  latestAt: string | null;
  runs: Array<{
    id: string;
    status: string;
    channel: MetaSocialChannel | null;
    triggerSource: string | null;
    summary: string | null;
    errorMessage: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  }>;
};

export type MetaWebhookMonitorDiagnostic = {
  id: string;
  label: string;
  status: "ok" | "warning" | "critical";
  detail: string;
};

export type MetaWebhookMonitorResult = {
  generatedAt: string;
  integration: {
    id: string | null;
    status: string;
    label: string;
    accountLabel: string | null;
    lastSyncAt: string | null;
    lastError: string | null;
    pageId: string | null;
    instagramBusinessId: string | null;
    activationOk: boolean;
  };
  summary: MetaWebhookMonitorSummary;
  channels: MetaWebhookMonitorChannelSummary[];
  agentQueue: MetaWebhookMonitorAgentQueue;
  diagnostics: MetaWebhookMonitorDiagnostic[];
  events: MetaWebhookMonitorEvent[];
  recentActions: Array<{
    id: string;
    action: string;
    status: "success" | "warning" | "error";
    createdAt: string | null;
  }>;
};

export type MetaWebhookReplayResult = {
  ok: boolean;
  eventId: string;
  status: "normalized" | "ignored" | "skipped" | "failed";
  detail: string;
  replayedAt: string;
};

const monitorEventLimit = 80;
const monitorRunLimit = 60;
const monitorActionLimit = 20;

const metaSocialTriggerSources = [
  metaSocialMessageReceivedEventName,
  metaSocialCommentReceivedEventName,
];

export async function loadClientMetaWebhookMonitor(input: {
  userId: string;
  organizationId: string;
  client?: SupabaseClient;
}): Promise<MetaWebhookMonitorResult> {
  const client = input.client ?? createServiceClient();
  const company = await requireClientCompanyAccess({
    client,
    companyId: input.organizationId,
    userId: input.userId,
  });
  const [integration, eventRows, agentRows, actionRows] = await Promise.all([
    loadMetaIntegration(client, company.id),
    loadMetaWebhookEventRows(client, company.id),
    loadMetaAgentRunRows(client, company.id),
    loadMetaActionRows(client, company.id),
  ]);
  const events = eventRows.map(mapMetaWebhookEventRow);
  const summary = summarizeMetaWebhookMonitorEvents(events);
  const agentQueue = summarizeAgentRuns(agentRows);

  return {
    generatedAt: new Date().toISOString(),
    integration: mapIntegration(integration),
    summary,
    channels: summarizeMetaWebhookChannels(events),
    agentQueue,
    diagnostics: buildDiagnostics({
      agentQueue,
      integration,
      summary,
    }),
    events,
    recentActions: actionRows.map((row) => ({
      id: row.id,
      action: row.action,
      status: normalizeActionStatus(row.status),
      createdAt: row.created_at,
    })),
  };
}

export async function replayClientMetaWebhookEvent(input: {
  userId: string;
  organizationId: string;
  eventId: string;
  client?: SupabaseClient;
}): Promise<MetaWebhookReplayResult> {
  const client = input.client ?? createServiceClient();
  const company = await requireClientCompanyAccess({
    client,
    companyId: input.organizationId,
    userId: input.userId,
  });

  if (!["owner", "admin"].includes(company.role)) {
    throw new Error("Somente dono ou admin da empresa pode reprocessar webhooks Meta.");
  }

  const event = await loadMetaWebhookEventRow(client, {
    eventId: input.eventId,
    organizationId: company.id,
  });
  const replayedAt = new Date().toISOString();

  if (!isReplayableMetaWebhookStatus(event.status)) {
    const result: MetaWebhookReplayResult = {
      ok: false,
      eventId: event.id,
      status: "skipped",
      detail: "Evento ja processado. Replay bloqueado para evitar duplicidade operacional.",
      replayedAt,
    };

    await logReplayAction({
      actorId: input.userId,
      client,
      event,
      result,
    });

    return result;
  }

  const integration = await loadReplayIntegration(client, event);
  const metaEvent = buildMetaWebhookEventFromRow(event);

  try {
    const normalized = await normalizeMetaEventToCrm({
      client,
      event: metaEvent,
      integration,
      integrationEventId: event.id,
    });
    const result: MetaWebhookReplayResult = normalized.status === "normalized"
      ? {
          ok: true,
          eventId: event.id,
          status: "normalized",
          detail: `Evento reprocessado para ${normalized.channel}.`,
          replayedAt,
        }
      : {
          ok: false,
          eventId: event.id,
          status: "ignored",
          detail: `Evento reprocessado e ignorado: ${normalized.reason}.`,
          replayedAt,
        };

    await logReplayAction({
      actorId: input.userId,
      client,
      event,
      result,
    });

    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Replay Meta falhou.";
    const result: MetaWebhookReplayResult = {
      ok: false,
      eventId: event.id,
      status: "failed",
      detail,
      replayedAt,
    };

    await markMetaEventFailed(client, event.id, detail);
    await logReplayAction({
      actorId: input.userId,
      client,
      event,
      result,
    });

    return result;
  }
}

async function loadMetaIntegration(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from("organization_integrations")
    .select("id, organization_id, status, connection_label, external_account_label, last_sync_at, last_error, metadata")
    .eq("organization_id", organizationId)
    .eq("provider_id", "meta-ads")
    .maybeSingle<OrganizationIntegrationRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar integracao Meta: ${error.message}`);
  }

  return data ?? null;
}

async function loadReplayIntegration(client: SupabaseClient, event: IntegrationEventRow) {
  const query = client
    .from("organization_integrations")
    .select("id, organization_id, status, connection_label, external_account_label, last_sync_at, last_error, metadata")
    .eq("organization_id", event.organization_id)
    .eq("provider_id", "meta-ads");

  const { data, error } = event.organization_integration_id
    ? await query.eq("id", event.organization_integration_id).maybeSingle<OrganizationIntegrationRow>()
    : await query.maybeSingle<OrganizationIntegrationRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar integracao Meta do evento: ${error.message}`);
  }

  if (!data) {
    throw new Error("Integracao Meta do evento nao foi encontrada.");
  }

  return {
    id: data.id,
    organization_id: data.organization_id,
    metadata: data.metadata,
  };
}

async function loadMetaWebhookEventRows(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from("integration_events")
    .select("id, organization_id, organization_integration_id, provider_id, event_type, status, source_event_id, payload, headers, error_message, received_at, processed_at, created_at")
    .eq("organization_id", organizationId)
    .eq("provider_id", "meta-ads")
    .order("received_at", { ascending: false })
    .limit(monitorEventLimit);

  if (error) {
    throw new Error(`Nao foi possivel carregar eventos Meta: ${error.message}`);
  }

  return (data ?? []) as IntegrationEventRow[];
}

async function loadMetaWebhookEventRow(
  client: SupabaseClient,
  input: {
    eventId: string;
    organizationId: string;
  },
) {
  const { data, error } = await client
    .from("integration_events")
    .select("id, organization_id, organization_integration_id, provider_id, event_type, status, source_event_id, payload, headers, error_message, received_at, processed_at, created_at")
    .eq("organization_id", input.organizationId)
    .eq("provider_id", "meta-ads")
    .eq("id", input.eventId)
    .maybeSingle<IntegrationEventRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar evento Meta: ${error.message}`);
  }

  if (!data) {
    throw new Error("Evento Meta nao encontrado para esta empresa.");
  }

  return data;
}

async function loadMetaAgentRunRows(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from("agent_runs")
    .select("id, run_status, trigger_source, input_summary, error_message, metadata, started_at, finished_at, created_at")
    .eq("organization_id", organizationId)
    .in("trigger_source", metaSocialTriggerSources)
    .order("created_at", { ascending: false })
    .limit(monitorRunLimit);

  if (error) {
    throw new Error(`Nao foi possivel carregar fila social Meta: ${error.message}`);
  }

  return (data ?? []) as AgentRunRow[];
}

async function loadMetaActionRows(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from("integration_action_logs")
    .select("id, action, status, metadata, created_at")
    .eq("organization_id", organizationId)
    .eq("provider_id", "meta-ads")
    .in("action", ["meta.webhook.subscribe", "meta.webhook.simulate", "meta.webhook.replay"])
    .order("created_at", { ascending: false })
    .limit(monitorActionLimit);

  if (error) {
    throw new Error(`Nao foi possivel carregar acoes Meta: ${error.message}`);
  }

  return (data ?? []) as ActionLogRow[];
}

function mapMetaWebhookEventRow(row: IntegrationEventRow): MetaWebhookMonitorEvent {
  const metaEvent = buildMetaWebhookEventFromRow(row);
  const snapshot = buildMetaCrmSnapshot(metaEvent);
  const payload = readRecord(row.payload);
  const change = readRecord(payload.change);
  const channel = snapshot?.channel
    ?? resolveMetaWebhookMonitorChannel({
      eventType: row.event_type,
      object: readString(payload.object),
      field: readString(change.field),
    });
  const status = normalizeMetaWebhookMonitorStatus(row.status);

  return {
    id: row.id,
    eventType: row.event_type,
    status,
    channel,
    sourceEventId: row.source_event_id,
    assetId: snapshot?.externalAccountId ?? metaEvent.assetId,
    leadIdentity: snapshot?.displayName ?? snapshot?.externalUsername ?? snapshot?.externalUserId ?? null,
    direction: snapshot?.direction ?? "unknown",
    textPreview: snapshot?.textContent ?? readTextPreview(payload),
    errorMessage: row.error_message,
    receivedAt: row.received_at ?? row.created_at,
    processedAt: row.processed_at,
    replayable: isReplayableMetaWebhookStatus(status),
    origin: readString(readRecord(row.headers)["x-connectyhub-simulation"]) ? "simulation" : "meta",
  };
}

function buildMetaWebhookEventFromRow(row: IntegrationEventRow): MetaWebhookEvent {
  const payload = readRecord(row.payload);

  return {
    assetId: readMetaEventAssetId(payload),
    eventType: row.event_type,
    sourceEventId: row.source_event_id,
    payload,
  };
}

function readMetaEventAssetId(payload: JsonRecord) {
  const change = readRecord(payload.change);
  const value = readRecord(change.value);
  const messaging = readRecord(payload.messaging);
  const recipient = readRecord(messaging.recipient);
  const entry = readRecord(payload.entry);

  return readString(value.page_id)
    ?? readString(value.recipient_id)
    ?? readString(recipient.id)
    ?? readString(entry.id)
    ?? null;
}

function summarizeAgentRuns(rows: AgentRunRow[]): MetaWebhookMonitorAgentQueue {
  const runs = rows.map((row) => ({
    id: row.id,
    status: row.run_status ?? "unknown",
    channel: readMetaSocialChannel(readRecord(row.metadata).channel),
    triggerSource: row.trigger_source,
    summary: row.input_summary,
    errorMessage: row.error_message,
    startedAt: row.started_at ?? row.created_at,
    finishedAt: row.finished_at,
  }));

  return {
    total: rows.length,
    queued: rows.filter((row) => row.run_status === "queued").length,
    running: rows.filter((row) => row.run_status === "running").length,
    needsApproval: rows.filter((row) => row.run_status === "needs_approval").length,
    completed: rows.filter((row) => row.run_status === "completed").length,
    failed: rows.filter((row) => row.run_status === "failed").length,
    cancelled: rows.filter((row) => row.run_status === "cancelled").length,
    latestAt: maxDate(rows.map((row) => row.created_at ?? row.started_at)),
    runs: runs.slice(0, 8),
  };
}

function buildDiagnostics(input: {
  agentQueue: MetaWebhookMonitorAgentQueue;
  integration: OrganizationIntegrationRow | null;
  summary: MetaWebhookMonitorSummary;
}): MetaWebhookMonitorDiagnostic[] {
  const metadata = readRecord(input.integration?.metadata);
  const activation = readRecord(metadata.webhook_activation);
  const activationOk = readBoolean(activation.ok);
  const verifyTokenReady = Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN);
  const appSecretReady = Boolean(process.env.META_APP_SECRET);

  return [
    {
      id: "runtime",
      label: "Runtime Meta",
      status: verifyTokenReady && appSecretReady ? "ok" : "critical",
      detail: verifyTokenReady && appSecretReady
        ? "Verify token e App Secret configurados."
        : "Configure META_WEBHOOK_VERIFY_TOKEN e META_APP_SECRET antes de operar eventos reais.",
    },
    {
      id: "page_subscription",
      label: "Assinatura Page",
      status: activationOk ? "ok" : "warning",
      detail: activationOk
        ? "A ultima assinatura da Pagina foi confirmada."
        : "Assine a Pagina ou rode o checklist quando a Meta liberar o aplicativo.",
    },
    {
      id: "recent_events",
      label: "Eventos recentes",
      status: input.summary.total > 0 ? "ok" : "warning",
      detail: input.summary.total > 0
        ? `${input.summary.total} evento(s) Meta no monitor.`
        : "Nenhum webhook Meta registrado ainda para esta empresa.",
    },
    {
      id: "failures",
      label: "Falhas",
      status: input.summary.failed > 0 ? "critical" : "ok",
      detail: input.summary.failed > 0
        ? `${input.summary.failed} evento(s) precisam de analise ou replay.`
        : "Sem falhas recentes de normalizacao.",
    },
    {
      id: "agent_queue",
      label: "Fila agentes",
      status: input.agentQueue.failed > 0
        ? "critical"
        : input.agentQueue.needsApproval > 0 || input.agentQueue.queued > 0 || input.agentQueue.running > 0
          ? "warning"
          : "ok",
      detail: input.agentQueue.failed > 0
        ? `${input.agentQueue.failed} execucao(oes) social(is) falharam.`
        : input.agentQueue.needsApproval > 0
          ? `${input.agentQueue.needsApproval} resposta(s) aguardando aprovacao.`
          : "Fila social Meta sem bloqueio critico.",
    },
  ];
}

function mapIntegration(row: OrganizationIntegrationRow | null): MetaWebhookMonitorResult["integration"] {
  const metadata = readRecord(row?.metadata);
  const activation = readRecord(metadata.webhook_activation);

  return {
    id: row?.id ?? null,
    status: row?.status ?? "not_configured",
    label: row?.connection_label ?? "Meta",
    accountLabel: row?.external_account_label ?? null,
    lastSyncAt: row?.last_sync_at ?? null,
    lastError: row?.last_error ?? null,
    pageId: readString(metadata.selected_facebook_page_id) ?? readString(metadata.facebook_page_id),
    instagramBusinessId: readString(metadata.selected_instagram_business_id) ?? readString(metadata.instagram_business_id),
    activationOk: readBoolean(activation.ok),
  };
}

async function markMetaEventFailed(client: SupabaseClient, eventId: string, message: string) {
  await client
    .from("integration_events")
    .update({
      status: "failed",
      error_message: message,
      processed_at: new Date().toISOString(),
    })
    .eq("id", eventId);
}

async function logReplayAction(input: {
  actorId: string;
  client: SupabaseClient;
  event: IntegrationEventRow;
  result: MetaWebhookReplayResult;
}) {
  await input.client.from("integration_action_logs").insert({
    organization_id: input.event.organization_id,
    organization_integration_id: input.event.organization_integration_id,
    provider_id: "meta-ads",
    actor_id: input.actorId,
    action: "meta.webhook.replay",
    status: input.result.ok ? "success" : input.result.status === "failed" ? "error" : "warning",
    metadata: {
      event_id: input.event.id,
      event_type: input.event.event_type,
      replay: input.result,
    },
  });
}

function readTextPreview(payload: JsonRecord) {
  const messaging = readRecord(payload.messaging);
  const message = readRecord(messaging.message);
  const postback = readRecord(messaging.postback);
  const change = readRecord(payload.change);
  const value = readRecord(change.value);

  return readString(message.text)
    ?? readString(postback.title)
    ?? readString(postback.payload)
    ?? readString(value.message)
    ?? readString(value.text)
    ?? null;
}

function readMetaSocialChannel(value: unknown) {
  return isMetaSocialChannel(value) ? value : null;
}

function normalizeActionStatus(value: unknown) {
  return value === "warning" || value === "error" ? value : "success";
}

function maxDate(values: Array<string | null>) {
  let latest: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    if (!value) continue;

    const time = Date.parse(value);

    if (Number.isFinite(time) && time > latestTime) {
      latest = value;
      latestTime = time;
    }
  }

  return latest;
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
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
  return value === true || value === "true";
}
