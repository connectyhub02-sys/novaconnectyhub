import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMetaSocialSuggestedReply,
  normalizeMetaSocialApprovalText,
} from "@/lib/meta/social-approval-policy";
import { enqueueApprovedMetaSocialDispatch } from "@/lib/meta/social-dispatcher";
import {
  isMetaCommentChannel,
  isMetaSocialChannel,
  metaSocialCommentReceivedEventName,
  metaSocialMessageReceivedEventName,
  type MetaSocialChannel,
} from "@/lib/meta/social-agent-policy";
import { createServiceClient } from "@/lib/supabase/service";
import { listClientCompanies, requireClientCompanyAccess, type ClientCompany } from "./companies";

type JsonRecord = Record<string, unknown>;

type AgentRunRow = {
  id: string;
  agent_id: string;
  organization_id: string | null;
  run_status: string | null;
  trigger_source: string | null;
  input_summary: string | null;
  output_summary: string | null;
  metadata: JsonRecord | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
};

type AgentRow = {
  id: string;
  name: string;
  persona_name: string | null;
  avatar_url: string | null;
};

type LeadRow = {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  status: string | null;
  source: string | null;
  metadata: JsonRecord | null;
};

type ConversationRow = {
  id: string;
  channel: string | null;
  provider: string | null;
  provider_chat_id: string | null;
  status: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  metadata: JsonRecord | null;
};

type MessageRow = {
  id: string;
  direction: string | null;
  message_type: string | null;
  text_content: string | null;
  occurred_at: string | null;
};

export type ClientSocialApproval = {
  id: string;
  companyId: string;
  companyName: string;
  agentId: string;
  agentName: string;
  agentAvatarUrl: string | null;
  leadId: string | null;
  leadName: string;
  leadPhone: string | null;
  conversationId: string | null;
  messageId: string | null;
  channel: MetaSocialChannel;
  channelLabel: string;
  publicSurface: boolean;
  inputSummary: string;
  leadMessage: string;
  suggestedReply: string;
  runtimeInstruction: string | null;
  approvalReasons: string[];
  providerChatId: string | null;
  providerMessageId: string | null;
  sourcePostId: string | null;
  sourceCommentId: string | null;
  createdAt: string | null;
  preparedAt: string | null;
};

export type ClientSocialApprovalReviewResult = {
  runId: string;
  status: "approved" | "rejected";
  message: string;
};

const socialApprovalTriggerSources = [
  metaSocialMessageReceivedEventName,
  metaSocialCommentReceivedEventName,
];

export async function listClientSocialApprovals(input: {
  userId: string;
  client?: SupabaseClient;
  limit?: number;
}): Promise<ClientSocialApproval[]> {
  const client = input.client ?? createServiceClient();
  const companies = await listClientCompanies(input.userId, client);
  const companyIds = companies.map((company) => company.id);

  if (!companyIds.length) {
    return [];
  }

  const limit = Math.max(1, Math.min(input.limit ?? 30, 80));
  const { data, error } = await client
    .from("agent_runs")
    .select("id, agent_id, organization_id, run_status, trigger_source, input_summary, output_summary, metadata, started_at, finished_at, created_at")
    .in("organization_id", companyIds)
    .eq("run_status", "needs_approval")
    .in("trigger_source", socialApprovalTriggerSources)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Nao foi possivel carregar aprovacoes sociais: ${error.message}`);
  }

  const runs = ((data ?? []) as AgentRunRow[]).filter(isSocialApprovalRun);

  if (!runs.length) {
    return [];
  }

  const [agents, leads, conversations, messages] = await Promise.all([
    loadAgents(client, uniqueStrings(runs.map((run) => run.agent_id))),
    loadLeads(client, uniqueStrings(runs.map((run) => asString(readRecord(run.metadata)?.leadId)))),
    loadConversations(client, uniqueStrings(runs.map((run) => asString(readRecord(run.metadata)?.conversationId)))),
    loadMessages(client, uniqueStrings(runs.map((run) => asString(readRecord(run.metadata)?.messageId)))),
  ]);

  const companyById = new Map(companies.map((company) => [company.id, company]));

  return runs
    .map((run) => mapSocialApproval(run, {
      agent: agents.get(run.agent_id),
      company: run.organization_id ? companyById.get(run.organization_id) : undefined,
      conversation: getRelatedRow(conversations, run, "conversationId"),
      lead: getRelatedRow(leads, run, "leadId"),
      message: getRelatedRow(messages, run, "messageId"),
    }))
    .filter((item): item is ClientSocialApproval => Boolean(item));
}

export async function reviewClientSocialApproval(input: {
  userId: string;
  runId: string;
  action: "approve" | "reject";
  responseText?: unknown;
  note?: unknown;
  client?: SupabaseClient;
}): Promise<ClientSocialApprovalReviewResult> {
  const client = input.client ?? createServiceClient();
  const run = await loadAgentRun(client, input.runId);

  if (!run?.organization_id || !isSocialApprovalRun(run)) {
    throw new Error("Aprovacao social nao encontrada.");
  }

  if (run.run_status !== "needs_approval") {
    throw new Error("Esta aprovacao social ja foi revisada.");
  }

  await requireClientCompanyAccess({
    userId: input.userId,
    companyId: run.organization_id,
    client,
  });

  if (input.action === "approve") {
    const responseText = normalizeMetaSocialApprovalText(input.responseText);
    const reviewedAt = new Date().toISOString();
    const metadata = {
      ...(run.metadata ?? {}),
      social_approval_status: "approved",
      social_approved_at: reviewedAt,
      social_approved_by: input.userId,
      social_approved_reply_text: responseText,
      social_approval_note: normalizeNote(input.note),
      ready_for_meta_dispatch: true,
      meta_dispatch_status: "pending_adapter",
      nextStep: "meta_social_sender_adapter",
    };
    const { error } = await client
      .from("agent_runs")
      .update({
        run_status: "completed",
        output_summary: preview(responseText, 900),
        error_message: null,
        finished_at: reviewedAt,
        metadata,
      })
      .eq("id", run.id)
      .eq("run_status", "needs_approval");

    if (error) {
      throw new Error(`Nao foi possivel aprovar resposta social: ${error.message}`);
    }

    await enqueueApprovedMetaSocialDispatch({
      client,
      runId: run.id,
      metadata,
    });

    return {
      runId: run.id,
      status: "approved",
      message: "Resposta social aprovada e enviada para a fila Meta.",
    };
  }

  const reviewedAt = new Date().toISOString();
  const metadata = {
    ...(run.metadata ?? {}),
    social_approval_status: "rejected",
    social_rejected_at: reviewedAt,
    social_rejected_by: input.userId,
    social_rejection_note: normalizeNote(input.note),
    ready_for_meta_dispatch: false,
    meta_dispatch_status: "rejected",
    nextStep: "none",
  };
  const { error } = await client
    .from("agent_runs")
    .update({
      run_status: "cancelled",
      output_summary: "Resposta social rejeitada pelo usuario.",
      finished_at: reviewedAt,
      metadata,
    })
    .eq("id", run.id)
    .eq("run_status", "needs_approval");

  if (error) {
    throw new Error(`Nao foi possivel rejeitar resposta social: ${error.message}`);
  }

  return {
    runId: run.id,
    status: "rejected",
    message: "Resposta social rejeitada.",
  };
}

function isSocialApprovalRun(run: AgentRunRow) {
  const metadata = readRecord(run.metadata);
  return run.run_status === "needs_approval"
    && socialApprovalTriggerSources.includes(run.trigger_source as typeof socialApprovalTriggerSources[number])
    && isMetaSocialChannel(metadata?.channel);
}

function mapSocialApproval(
  run: AgentRunRow,
  related: {
    agent?: AgentRow;
    company?: ClientCompany;
    conversation?: ConversationRow;
    lead?: LeadRow;
    message?: MessageRow;
  },
): ClientSocialApproval | null {
  const metadata = readRecord(run.metadata) ?? {};
  const channel = readMetaSocialChannel(metadata.channel);

  if (!channel || !run.organization_id) {
    return null;
  }

  const leadMessage = asString(related.message?.text_content)
    ?? asString(metadata.textContentPreview)
    ?? asString(run.input_summary)
    ?? "Evento social recebido.";
  const leadName = related.lead?.display_name
    ?? asString(metadata.externalUsername)
    ?? "Lead social";
  const suggestedReply = asString(metadata.social_suggested_reply_text)
    ?? buildMetaSocialSuggestedReply({
      channel,
      leadName,
      messageText: leadMessage,
    });

  return {
    id: run.id,
    companyId: run.organization_id,
    companyName: related.company?.name ?? "Empresa",
    agentId: run.agent_id,
    agentName: related.agent?.persona_name ?? related.agent?.name ?? "Agente multicanal",
    agentAvatarUrl: related.agent?.avatar_url ?? null,
    leadId: asString(metadata.leadId) ?? related.lead?.id ?? null,
    leadName,
    leadPhone: related.lead?.phone_number ?? null,
    conversationId: asString(metadata.conversationId) ?? related.conversation?.id ?? null,
    messageId: asString(metadata.messageId) ?? related.message?.id ?? null,
    channel,
    channelLabel: getSocialChannelLabel(channel),
    publicSurface: isMetaCommentChannel(channel),
    inputSummary: asString(run.input_summary) ?? leadMessage,
    leadMessage,
    suggestedReply,
    runtimeInstruction: asString(metadata.channel_runtime_instruction),
    approvalReasons: readStringArray(metadata.approvalReasons),
    providerChatId: asString(metadata.providerChatId) ?? related.conversation?.provider_chat_id ?? null,
    providerMessageId: asString(metadata.providerMessageId),
    sourcePostId: asString(metadata.sourcePostId),
    sourceCommentId: asString(metadata.sourceCommentId),
    createdAt: run.created_at,
    preparedAt: asString(metadata.social_agent_prepared_at) ?? run.finished_at ?? run.started_at,
  };
}

async function loadAgentRun(client: SupabaseClient, runId: string) {
  const { data, error } = await client
    .from("agent_runs")
    .select("id, agent_id, organization_id, run_status, trigger_source, input_summary, output_summary, metadata, started_at, finished_at, created_at")
    .eq("id", runId)
    .maybeSingle<AgentRunRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar aprovacao social: ${error.message}`);
  }

  return data ?? null;
}

async function loadAgents(client: SupabaseClient, ids: string[]) {
  if (!ids.length) return new Map<string, AgentRow>();

  const { data } = await client
    .from("agent_registry")
    .select("id, name, persona_name, avatar_url")
    .in("id", ids);

  return new Map(((data ?? []) as AgentRow[]).map((row) => [row.id, row]));
}

async function loadLeads(client: SupabaseClient, ids: string[]) {
  if (!ids.length) return new Map<string, LeadRow>();

  const { data } = await client
    .from("leads")
    .select("id, display_name, phone_number, status, source, metadata")
    .in("id", ids);

  return new Map(((data ?? []) as LeadRow[]).map((row) => [row.id, row]));
}

async function loadConversations(client: SupabaseClient, ids: string[]) {
  if (!ids.length) return new Map<string, ConversationRow>();

  const { data } = await client
    .from("conversations")
    .select("id, channel, provider, provider_chat_id, status, last_message_preview, last_message_at, metadata")
    .in("id", ids);

  return new Map(((data ?? []) as ConversationRow[]).map((row) => [row.id, row]));
}

async function loadMessages(client: SupabaseClient, ids: string[]) {
  if (!ids.length) return new Map<string, MessageRow>();

  const { data } = await client
    .from("conversation_messages")
    .select("id, direction, message_type, text_content, occurred_at")
    .in("id", ids);

  return new Map(((data ?? []) as MessageRow[]).map((row) => [row.id, row]));
}

function getRelatedRow<T>(rows: Map<string, T>, run: AgentRunRow, key: string) {
  const id = asString(readRecord(run.metadata)?.[key]);
  return id ? rows.get(id) : undefined;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function getSocialChannelLabel(channel: MetaSocialChannel) {
  switch (channel) {
    case "instagram_direct":
      return "Instagram Direct";
    case "instagram_comments":
      return "Comentarios Instagram";
    case "facebook_messenger":
      return "Facebook Messenger";
    case "facebook_comments":
      return "Comentarios Facebook";
  }
}

function readMetaSocialChannel(value: unknown) {
  return isMetaSocialChannel(value) ? value : null;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNote(value: unknown) {
  const note = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return note ? preview(note, 500) : null;
}

function preview(value: string, maxLength: number) {
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}
