import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAgentChannelRuntimeInstruction,
  normalizeAgentChannelConfig,
} from "../agents/multichannel";
import { inngest } from "../inngest/client";
import { createServiceClient } from "../supabase/service";
import type { MetaCrmSnapshot } from "./event-normalizer";
import { buildMetaSocialSuggestedReply } from "./social-approval-policy";
import {
  isMetaSocialChannel,
  metaSocialCommentReceivedEventName,
  metaSocialMessageReceivedEventName,
  resolveMetaSocialQueueDecision,
  type MetaSocialAgentEventName,
  type MetaSocialChannel,
  type MetaSocialQueueDecision,
} from "./social-agent-policy";
import type { MetaWebhookEvent } from "./webhook-events";

type JsonRecord = Record<string, unknown>;

type OrganizationIntegrationRef = {
  id: string;
  organization_id: string;
  metadata: JsonRecord | null;
};

type AgentRow = {
  id: string;
  status: string | null;
  requires_human_approval: boolean | null;
  metadata: JsonRecord | null;
};

type AgentRunRow = {
  id: string;
  agent_id: string;
  organization_id: string | null;
  run_status: string;
  input_summary: string | null;
  metadata: JsonRecord | null;
};

export type MetaSocialAgentQueueResult =
  | {
      status: "queued" | "debounced";
      runId: string;
      triggerSource: MetaSocialAgentEventName;
    }
  | {
      status: "skipped";
      reason: "non_inbound" | "no_agent" | "channel_disabled";
      triggerSource?: MetaSocialAgentEventName;
    };

const metaSocialTriggerSources = [
  metaSocialMessageReceivedEventName,
  metaSocialCommentReceivedEventName,
];

export async function enqueueMetaSocialAgentRun(input: {
  client: SupabaseClient;
  integration: OrganizationIntegrationRef;
  event: MetaWebhookEvent;
  snapshot: MetaCrmSnapshot;
  integrationEventId: string | null;
  leadId: string;
  conversationId: string;
  messageId: string;
}): Promise<MetaSocialAgentQueueResult> {
  if (input.snapshot.direction !== "inbound") {
    return { status: "skipped", reason: "non_inbound" };
  }

  const agent = await findOrganizationMultichannelAgent(input.client, {
    organizationId: input.integration.organization_id,
    channel: input.snapshot.channel,
  });

  if (!agent) {
    return { status: "skipped", reason: "no_agent" };
  }

  const decision = resolveMetaSocialQueueDecision({
    channel: input.snapshot.channel,
    config: readRecord(agent.metadata)?.multichannel_config,
    agentRequiresHumanApproval: agent.requires_human_approval !== false,
  });

  if (!decision.shouldQueue) {
    return {
      status: "skipped",
      reason: decision.reason,
      triggerSource: decision.triggerSource,
    };
  }

  const inputSummary = buildMetaSocialInputSummary(input.snapshot);
  const metadata = buildMetaSocialRunMetadata(input, decision);
  const recentRun = await findRecentMetaSocialAgentRun(input.client, {
    agentId: agent.id,
    triggerSource: decision.triggerSource,
    conversationId: input.conversationId,
    channel: input.snapshot.channel,
  });

  if (recentRun) {
    const mergedMetadata = {
      ...(recentRun.metadata ?? {}),
      ...metadata,
      debounced: true,
      debounced_at: new Date().toISOString(),
      debounced_count: readNumber(recentRun.metadata?.debounced_count) + 1,
    };

    await input.client
      .from("agent_runs")
      .update({
        input_summary: inputSummary,
        metadata: mergedMetadata,
      })
      .eq("id", recentRun.id);

    await dispatchMetaSocialAgentRun(input.client, {
      runId: recentRun.id,
      organizationId: input.integration.organization_id,
      conversationId: input.conversationId,
      messageId: input.messageId,
      channel: input.snapshot.channel,
      triggerSource: decision.triggerSource,
      metadata: mergedMetadata,
    });

    return {
      status: "debounced",
      runId: recentRun.id,
      triggerSource: decision.triggerSource,
    };
  }

  const { data, error } = await input.client
    .from("agent_runs")
    .insert({
      agent_id: agent.id,
      organization_id: input.integration.organization_id,
      run_status: "queued",
      trigger_source: decision.triggerSource,
      input_summary: inputSummary,
      cost_credits: 0,
      metadata,
    })
    .select("id, metadata")
    .single<{ id: string; metadata: JsonRecord | null }>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel enfileirar agente social Meta.");
  }

  await dispatchMetaSocialAgentRun(input.client, {
    runId: data.id,
    organizationId: input.integration.organization_id,
    conversationId: input.conversationId,
    messageId: input.messageId,
    channel: input.snapshot.channel,
    triggerSource: decision.triggerSource,
    metadata: data.metadata ?? metadata,
  });

  return {
    status: "queued",
    runId: data.id,
    triggerSource: decision.triggerSource,
  };
}

export async function processMetaSocialAgentRun(input: {
  runId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const run = await loadMetaSocialAgentRun(client, input.runId);

  if (!run) {
    return { status: "skipped", reason: "missing_run", runId: input.runId };
  }

  if (!["queued", "running"].includes(run.run_status)) {
    return { status: "skipped", reason: `run_${run.run_status}`, runId: run.id };
  }

  const metadata = readRecord(run.metadata) ?? {};
  const channel = readMetaSocialChannel(metadata.channel);

  if (!channel) {
    await failMetaSocialAgentRun(client, run, "Canal Meta ausente nos metadados da fila.");
    return { status: "failed", reason: "missing_channel", runId: run.id };
  }

  const agent = await loadAgent(client, run.agent_id);

  if (!agent) {
    await failMetaSocialAgentRun(client, run, "Agente multicanal nao encontrado.");
    return { status: "failed", reason: "missing_agent", runId: run.id };
  }

  const config = normalizeAgentChannelConfig(readRecord(agent.metadata)?.multichannel_config);
  const decision = resolveMetaSocialQueueDecision({
    channel,
    config,
    agentRequiresHumanApproval: agent.requires_human_approval !== false,
  });

  if (!decision.shouldQueue) {
    await cancelMetaSocialAgentRun(client, run, {
      channel,
      reason: decision.reason,
    });

    return {
      status: "cancelled",
      reason: decision.reason,
      runId: run.id,
      channel,
    };
  }

  let workingMetadata = metadata;

  if (run.run_status === "queued") {
    const processingStartedAt = new Date().toISOString();
    workingMetadata = {
      ...metadata,
      social_agent_processing_started_at: processingStartedAt,
    };

    await client
      .from("agent_runs")
      .update({
        run_status: "running",
        started_at: processingStartedAt,
        metadata: workingMetadata,
      })
      .eq("id", run.id)
      .eq("run_status", "queued");
  }

  const runtimeInstruction = buildAgentChannelRuntimeInstruction({
    channelId: channel,
    config,
  });
  const suggestedReplyText = buildMetaSocialSuggestedReply({
    channel,
    messageText: asString(metadata.textContentPreview),
  });
  const preparedAt = new Date().toISOString();
  const outputSummary = decision.requiresHumanApproval
    ? "Atendimento social Meta preparado e aguardando aprovacao humana."
    : "Atendimento social Meta preparado; envio automatico segue bloqueado ate o adapter Meta.";

  await client
    .from("agent_runs")
    .update({
      run_status: decision.finalRunStatus,
      output_summary: outputSummary,
      error_message: null,
      finished_at: preparedAt,
      metadata: {
        ...workingMetadata,
        social_agent_status: "prepared",
        social_agent_prepared_at: preparedAt,
        social_agent_phase: "meta_social_agent_queue",
        channel_runtime_instruction: runtimeInstruction,
        channel_config: decision.channelConfig,
        autoReply: decision.autoReply,
        requiresHumanApproval: decision.requiresHumanApproval,
        approvalReasons: decision.approvalReasons,
        publicSurface: decision.publicSurface,
        autoSendBlocked: decision.autoSendBlocked,
        autoSendBlockReason: decision.autoSendBlockReason,
        social_suggested_reply_text: suggestedReplyText,
        social_suggested_reply_source: "safe_template",
        social_suggested_reply_created_at: preparedAt,
        nextStep: "review_social_agent_response",
      },
    })
    .eq("id", run.id);

  return {
    status: decision.finalRunStatus,
    runId: run.id,
    channel,
    autoSendBlocked: decision.autoSendBlocked,
  };
}

export async function processQueuedMetaSocialAgentRuns(input: {
  limit?: number;
  client?: SupabaseClient;
} = {}) {
  const client = input.client ?? createServiceClient();
  const limit = Math.max(1, Math.min(input.limit ?? 10, 50));
  const { data, error } = await client
    .from("agent_runs")
    .select("id")
    .in("trigger_source", metaSocialTriggerSources)
    .eq("run_status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Nao foi possivel consultar fila social Meta: ${error.message}`);
  }

  const results = [];

  for (const row of data ?? []) {
    results.push(await processMetaSocialAgentRun({ client, runId: row.id }));
  }

  return {
    status: "swept",
    checked: data?.length ?? 0,
    results,
  };
}

async function findOrganizationMultichannelAgent(
  client: SupabaseClient,
  input: {
    organizationId: string;
    channel: MetaSocialChannel;
  },
) {
  const { data, error } = await client
    .from("agent_registry")
    .select("id, status, requires_human_approval, metadata")
    .eq("scope", "organization")
    .eq("organization_id", input.organizationId)
    .contains("metadata", { client_created: true, agent_kind: "whatsapp" })
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Nao foi possivel consultar agente multicanal: ${error.message}`);
  }

  const agents = (data ?? []) as AgentRow[];
  const enabledAgent = agents.find((agent) => {
    const decision = resolveMetaSocialQueueDecision({
      channel: input.channel,
      config: readRecord(agent.metadata)?.multichannel_config,
      agentRequiresHumanApproval: agent.requires_human_approval !== false,
    });

    return decision.shouldQueue;
  });

  return enabledAgent ?? agents[0] ?? null;
}

async function findRecentMetaSocialAgentRun(
  client: SupabaseClient,
  input: {
    agentId: string;
    triggerSource: MetaSocialAgentEventName;
    conversationId: string;
    channel: MetaSocialChannel;
  },
) {
  const groupingCutoff = new Date(Date.now() - 45 * 1000).toISOString();
  const { data } = await client
    .from("agent_runs")
    .select("id, metadata")
    .eq("agent_id", input.agentId)
    .eq("trigger_source", input.triggerSource)
    .in("run_status", ["queued", "running", "needs_approval"])
    .contains("metadata", {
      conversationId: input.conversationId,
      channel: input.channel,
    })
    .gte("created_at", groupingCutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; metadata: JsonRecord | null }>();

  return data ?? null;
}

async function dispatchMetaSocialAgentRun(
  client: SupabaseClient,
  input: {
    runId: string;
    organizationId: string;
    conversationId: string;
    messageId: string;
    channel: MetaSocialChannel;
    triggerSource: MetaSocialAgentEventName;
    metadata: JsonRecord;
  },
) {
  await inngest.send({
    name: input.triggerSource,
    data: {
      runId: input.runId,
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      channel: input.channel,
    },
  }).catch(async (error: unknown) => {
    await client
      .from("agent_runs")
      .update({
        metadata: {
          ...input.metadata,
          inngest_dispatch_error: error instanceof Error ? error.message : "Falha ao disparar Inngest.",
          inngest_dispatch_failed_at: new Date().toISOString(),
        },
      })
      .eq("id", input.runId);
  });
}

async function loadMetaSocialAgentRun(client: SupabaseClient, runId: string) {
  const { data, error } = await client
    .from("agent_runs")
    .select("id, agent_id, organization_id, run_status, input_summary, metadata")
    .eq("id", runId)
    .maybeSingle<AgentRunRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar execucao social Meta: ${error.message}`);
  }

  return data ?? null;
}

async function loadAgent(client: SupabaseClient, agentId: string) {
  const { data, error } = await client
    .from("agent_registry")
    .select("id, status, requires_human_approval, metadata")
    .eq("id", agentId)
    .maybeSingle<AgentRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar agente multicanal: ${error.message}`);
  }

  return data ?? null;
}

async function failMetaSocialAgentRun(
  client: SupabaseClient,
  run: AgentRunRow,
  message: string,
) {
  await client
    .from("agent_runs")
    .update({
      run_status: "failed",
      error_message: message,
      finished_at: new Date().toISOString(),
      metadata: {
        ...(run.metadata ?? {}),
        social_agent_status: "failed",
        social_agent_error: message,
      },
    })
    .eq("id", run.id);
}

async function cancelMetaSocialAgentRun(
  client: SupabaseClient,
  run: AgentRunRow,
  input: {
    channel: MetaSocialChannel;
    reason: string;
  },
) {
  await client
    .from("agent_runs")
    .update({
      run_status: "cancelled",
      output_summary: "Canal social Meta desabilitado antes do processamento.",
      finished_at: new Date().toISOString(),
      metadata: {
        ...(run.metadata ?? {}),
        channel: input.channel,
        social_agent_status: "cancelled",
        social_agent_cancelled_reason: input.reason,
      },
    })
    .eq("id", run.id);
}

function buildMetaSocialRunMetadata(
  input: {
    integration: OrganizationIntegrationRef;
    event: MetaWebhookEvent;
    snapshot: MetaCrmSnapshot;
    integrationEventId: string | null;
    leadId: string;
    conversationId: string;
    messageId: string;
  },
  decision: Extract<MetaSocialQueueDecision, { shouldQueue: true }>,
): JsonRecord {
  return {
    provider: "meta",
    channel: input.snapshot.channel,
    triggerSource: decision.triggerSource,
    organizationIntegrationId: input.integration.id,
    integrationEventId: input.integrationEventId,
    leadId: input.leadId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    providerEventType: input.event.eventType,
    providerSourceEventId: input.event.sourceEventId,
    providerMessageId: input.snapshot.providerMessageId,
    providerChatId: input.snapshot.providerChatId,
    externalAccountId: input.snapshot.externalAccountId,
    externalUserId: input.snapshot.externalUserId,
    externalUsername: input.snapshot.externalUsername,
    sourcePostId: input.snapshot.sourcePostId,
    sourceCommentId: input.snapshot.sourceCommentId,
    direction: input.snapshot.direction,
    messageType: input.snapshot.messageType,
    textContentPreview: preview(input.snapshot.textContent, 500),
    occurredAt: input.snapshot.occurredAt,
    rawEventType: input.snapshot.rawEventType,
    autoReply: decision.autoReply,
    requiresHumanApproval: decision.requiresHumanApproval,
    approvalReasons: decision.approvalReasons,
    publicSurface: decision.publicSurface,
    autoSendBlocked: decision.autoSendBlocked,
    autoSendBlockReason: decision.autoSendBlockReason,
    social_agent_phase: "meta_social_agent_queue",
  };
}

function buildMetaSocialInputSummary(snapshot: MetaCrmSnapshot) {
  const label = channelLabel(snapshot.channel);
  const text = preview(snapshot.textContent, 240);

  return text ? `${label}: ${text}` : `${label}: evento recebido.`;
}

function channelLabel(channel: MetaSocialChannel) {
  switch (channel) {
    case "instagram_direct":
      return "Instagram Direct";
    case "instagram_comments":
      return "Comentario Instagram";
    case "facebook_messenger":
      return "Facebook Messenger";
    case "facebook_comments":
      return "Comentario Facebook";
  }
}

function readMetaSocialChannel(value: unknown) {
  return isMetaSocialChannel(value) ? value : null;
}

function preview(value: string | null | undefined, maxLength: number) {
  const text = value?.trim().replace(/\s+/g, " ");

  if (!text) {
    return null;
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
