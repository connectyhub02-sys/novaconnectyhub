import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { readWhatsappInstanceProfileImageUrl } from "@/lib/whatsapp/instance-profile-image";

type JsonRecord = Record<string, unknown>;
type ConnectyHubApiVisibility = "internal" | "api_customer" | "hybrid";

export type CustomerWhatsappInstanceStatus =
  | "draft"
  | "qr_pending"
  | "connected"
  | "disconnected"
  | "blocked"
  | "error"
  | "archived";

export type AdminCustomerWhatsappAgent = {
  id: string;
  organizationId: string | null;
  name: string;
  status: string;
  agentCode: string;
};

export type AdminCustomerWhatsappInstance = {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string | null;
  organizationPlan: string | null;
  organizationStatus: string | null;
  apiClientId: string | null;
  apiVisibility: ConnectyHubApiVisibility;
  provider: string;
  providerInstanceId: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
  status: CustomerWhatsappInstanceStatus;
  webhookUrl: string | null;
  webhookConfiguredAt: string | null;
  webhookConfigured: boolean;
  lastHeartbeatAt: string | null;
  lastMessageAt: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  updatedAt: string | null;
  agents: AdminCustomerWhatsappAgent[];
  leadCount: number;
  activeLeadCount: number;
  conversationCount: number;
  openConversationCount: number;
  messageCount: number;
  inboundMessageCount: number;
  outboundMessageCount: number;
  audioMessageCount: number;
  mediaMessageCount: number;
  agentRunCount: number;
  completedAgentRunCount: number;
  failedAgentRunCount: number;
  averageAgentRunSeconds: number | null;
  lastAgentRunStatus: string | null;
  lastAgentRunAt: string | null;
  lastAgentRunError: string | null;
  lastWebhookStatus: string | null;
  lastWebhookAt: string | null;
  lastWebhookError: string | null;
};

export type AdminCustomerWhatsappWorkspace = {
  summary: {
    totalInstances: number;
    connectedInstances: number;
    pendingInstances: number;
    webhookConfigured: number;
    whatsappAgents: number;
    totalLeads: number;
    activeLeads: number;
    openConversations: number;
    webhookErrors: number;
    messagesTotal: number;
    inboundMessages: number;
    outboundMessages: number;
    audioMessages: number;
    mediaMessages: number;
    agentRunsTotal: number;
    agentRunsCompleted: number;
    agentRunsFailed: number;
    averageAgentRunSeconds: number | null;
  };
  instances: AdminCustomerWhatsappInstance[];
  warnings: string[];
};

type RelatedOrganization =
  | {
      name: string | null;
      slug: string | null;
      plan_code: string | null;
      status: string | null;
    }
  | {
      name: string | null;
      slug: string | null;
      plan_code: string | null;
      status: string | null;
    }[]
  | null;

type InstanceRow = {
  id: string;
  organization_id: string;
  connectyhub_api_client_id: string | null;
  connectyhub_api_visibility: ConnectyHubApiVisibility | null;
  provider: string | null;
  provider_instance_id: string | null;
  phone_number: string | null;
  display_name: string | null;
  status: CustomerWhatsappInstanceStatus | null;
  webhook_url: string | null;
  webhook_configured_at: string | null;
  last_heartbeat_at: string | null;
  last_message_at: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  updated_at: string | null;
  metadata: JsonRecord | null;
  organizations: RelatedOrganization;
};

type AgentRow = {
  id: string;
  organization_id: string | null;
  scope: string | null;
  agent_code: string;
  name: string;
  role_title: string | null;
  status: string | null;
  tools: string[] | null;
  triggers: string[] | null;
  metadata: JsonRecord | null;
  updated_at: string | null;
};

type LeadRow = {
  id: string;
  organization_id: string;
  status: string | null;
  last_message_at: string | null;
};

type ConversationRow = {
  id: string;
  organization_id: string;
  lead_id: string | null;
  whatsapp_instance_id: string | null;
  status: string | null;
  last_message_at: string | null;
};

type WebhookEventRow = {
  id: string;
  organization_id: string | null;
  whatsapp_instance_id: string | null;
  processing_status: string | null;
  error_message: string | null;
  received_at: string;
};

type MessageRow = {
  id: string;
  organization_id: string;
  conversation_id: string | null;
  whatsapp_instance_id: string | null;
  direction: string | null;
  message_type: string | null;
  payload: JsonRecord | null;
  occurred_at: string | null;
};

type AgentRunRow = {
  id: string;
  agent_id: string | null;
  organization_id: string | null;
  run_status: string | null;
  trigger_source: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
};

type CountBucket = {
  total: number;
  active: number;
  latestAt: string | null;
};

type MessageAnalyticsBucket = {
  total: number;
  inbound: number;
  outbound: number;
  audio: number;
  media: number;
  latestAt: string | null;
};

type AgentRunBucket = {
  total: number;
  completed: number;
  failed: number;
  queued: number;
  running: number;
  durationSecondsTotal: number;
  durationCount: number;
  latestAt: string | null;
  latestStatus: string | null;
  latestError: string | null;
};

export async function getAdminCustomerWhatsappWorkspace(
  client: SupabaseClient = createServiceClient(),
): Promise<AdminCustomerWhatsappWorkspace> {
  const warnings: string[] = [];
  const { data: instanceData, error: instanceError } = await client
    .from("whatsapp_instances")
    .select(
      "id, organization_id, connectyhub_api_client_id, connectyhub_api_visibility, provider, provider_instance_id, phone_number, display_name, status, webhook_url, webhook_configured_at, last_heartbeat_at, last_message_at, connected_at, disconnected_at, updated_at, metadata, organizations(name, slug, plan_code, status)",
    )
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (instanceError) {
    return {
      ...emptyWorkspace,
      warnings: [`Nao foi possivel carregar instancias dos clientes: ${instanceError.message}`],
    };
  }

  const instanceRows = ((instanceData ?? []) as InstanceRow[]).filter(isCustomerPanelInstance);
  const organizationIds = Array.from(new Set(instanceRows.map((row) => row.organization_id).filter(Boolean)));

  if (organizationIds.length === 0) {
    return {
      ...emptyWorkspace,
      warnings: ["Nenhuma instancia WhatsApp de cliente foi registrada ainda."],
    };
  }

  const [agentsResult, leadsResult, conversationsResult, webhooksResult, messagesResult, agentRunsResult] = await Promise.all([
    client
      .from("agent_registry")
      .select("id, organization_id, scope, agent_code, name, role_title, status, tools, triggers, metadata, updated_at")
      .in("organization_id", organizationIds)
      .limit(1000),
    client
      .from("leads")
      .select("id, organization_id, status, last_message_at")
      .in("organization_id", organizationIds)
      .limit(5000),
    client
      .from("conversations")
      .select("id, organization_id, lead_id, whatsapp_instance_id, status, last_message_at")
      .in("organization_id", organizationIds)
      .limit(5000),
    client
      .from("whatsapp_webhook_events")
      .select("id, organization_id, whatsapp_instance_id, processing_status, error_message, received_at")
      .in("organization_id", organizationIds)
      .order("received_at", { ascending: false })
      .limit(1200),
    client
      .from("conversation_messages")
      .select("id, organization_id, conversation_id, whatsapp_instance_id, direction, message_type, payload, occurred_at")
      .in("organization_id", organizationIds)
      .order("occurred_at", { ascending: false })
      .limit(10000),
    client
      .from("agent_runs")
      .select("id, agent_id, organization_id, run_status, trigger_source, error_message, started_at, finished_at, created_at")
      .in("organization_id", organizationIds)
      .order("started_at", { ascending: false })
      .limit(5000),
  ]);

  if (agentsResult.error) warnings.push(`Nao foi possivel carregar agentes WhatsApp dos clientes: ${agentsResult.error.message}`);
  if (leadsResult.error) warnings.push(`Nao foi possivel carregar leads do WhatsApp: ${leadsResult.error.message}`);
  if (conversationsResult.error) warnings.push(`Nao foi possivel carregar conversas do WhatsApp: ${conversationsResult.error.message}`);
  if (webhooksResult.error) warnings.push(`Nao foi possivel carregar eventos recentes de webhook: ${webhooksResult.error.message}`);
  if (messagesResult.error) warnings.push(`Nao foi possivel carregar telemetria de mensagens: ${messagesResult.error.message}`);
  if (agentRunsResult.error) warnings.push(`Nao foi possivel carregar execucoes dos agentes: ${agentRunsResult.error.message}`);

  const whatsappAgents = ((agentsResult.data ?? []) as AgentRow[])
    .filter((agent) => agent.organization_id && isCustomerWhatsappAgent(agent));
  const agentsById = indexAgentsById(whatsappAgents);
  const agentsByOrganization = groupAgentsByOrganization(whatsappAgents);
  const leadsByOrg = groupLeads((leadsResult.data ?? []) as LeadRow[]);
  const leadsById = indexLeadsById((leadsResult.data ?? []) as LeadRow[]);
  const conversations = (conversationsResult.data ?? []) as ConversationRow[];
  const leadsByInstance = groupLeadsByInstance(conversations, leadsById);
  const conversationsByOrg = groupConversationsByOrganization((conversationsResult.data ?? []) as ConversationRow[]);
  const conversationsByInstance = groupConversationsByInstance(conversations);
  const webhookByInstance = latestWebhookByInstance((webhooksResult.data ?? []) as WebhookEventRow[]);
  const webhookErrors = ((webhooksResult.data ?? []) as WebhookEventRow[]).filter(hasWebhookError).length;
  const visibleInstanceRows = instanceRows.filter((row) => !isOrphanedClientAgentInstance(row, agentsById));
  const messages = (messagesResult.data ?? []) as MessageRow[];
  const agentRuns = ((agentRunsResult.data ?? []) as AgentRunRow[]).filter((run) => run.agent_id && agentsById.has(run.agent_id));
  const conversationInstanceById = indexConversationInstance(conversations);
  const messagesByInstance = groupMessagesByInstance(messages, conversationInstanceById);
  const messageSummary = summarizeMessages(messages, conversationInstanceById, visibleInstanceRows);
  const instanceIdsByAgent = indexInstanceIdsByAgent(visibleInstanceRows, agentsById, agentsByOrganization);
  const agentRunsByInstance = groupAgentRunsByInstance(agentRuns, instanceIdsByAgent);
  const agentRunSummary = summarizeAgentRuns(agentRuns);

  const instances = visibleInstanceRows.map((row) => {
    const organization = readOrganization(row.organizations);
    const agents = resolveInstanceAgents(row, agentsById, agentsByOrganization);
    const leadBucket = leadsByInstance.get(row.id) ?? emptyBucket();
    const conversationBucket = conversationsByInstance.get(row.id) ?? emptyBucket();
    const messageBucket = messagesByInstance.get(row.id) ?? emptyMessageBucket();
    const runBucket = agentRunsByInstance.get(row.id) ?? emptyAgentRunBucket();
    const webhookEvent = webhookByInstance.get(row.id);

    return {
      id: row.id,
      organizationId: row.organization_id,
      organizationName: organization?.name ?? "Empresa sem nome",
      organizationSlug: organization?.slug ?? null,
      organizationPlan: organization?.plan_code ?? null,
      organizationStatus: organization?.status ?? null,
      apiClientId: row.connectyhub_api_client_id,
      apiVisibility: normalizeApiVisibility(row.connectyhub_api_visibility),
      provider: row.provider ?? "uazapi",
      providerInstanceId: row.provider_instance_id,
      phoneNumber: row.phone_number,
      displayName: row.display_name,
      profileImageUrl: readWhatsappInstanceProfileImageUrl(row.metadata),
      status: row.status ?? "draft",
      webhookUrl: row.webhook_url,
      webhookConfiguredAt: row.webhook_configured_at,
      webhookConfigured: Boolean(row.webhook_url || row.webhook_configured_at),
      lastHeartbeatAt: row.last_heartbeat_at,
      lastMessageAt: pickLatest(row.last_message_at, conversationBucket.latestAt, leadBucket.latestAt),
      connectedAt: row.connected_at,
      disconnectedAt: row.disconnected_at,
      updatedAt: row.updated_at,
      agents,
      leadCount: leadBucket.total,
      activeLeadCount: leadBucket.active,
      conversationCount: conversationBucket.total,
      openConversationCount: conversationBucket.active,
      messageCount: messageBucket.total,
      inboundMessageCount: messageBucket.inbound,
      outboundMessageCount: messageBucket.outbound,
      audioMessageCount: messageBucket.audio,
      mediaMessageCount: messageBucket.media,
      agentRunCount: runBucket.total,
      completedAgentRunCount: runBucket.completed,
      failedAgentRunCount: runBucket.failed,
      averageAgentRunSeconds: readAverageRunSeconds(runBucket),
      lastAgentRunStatus: runBucket.latestStatus,
      lastAgentRunAt: runBucket.latestAt,
      lastAgentRunError: runBucket.latestError,
      lastWebhookStatus: webhookEvent?.processing_status ?? null,
      lastWebhookAt: webhookEvent?.received_at ?? null,
      lastWebhookError: webhookEvent?.error_message ?? null,
    } satisfies AdminCustomerWhatsappInstance;
  });

  return {
    summary: {
      totalInstances: instances.length,
      connectedInstances: instances.filter((instance) => instance.status === "connected").length,
      pendingInstances: instances.filter((instance) => instance.status === "qr_pending" || instance.status === "draft").length,
      webhookConfigured: instances.filter((instance) => instance.webhookConfigured).length,
      whatsappAgents: whatsappAgents.length,
      totalLeads: sumBuckets(leadsByOrg, "total"),
      activeLeads: sumBuckets(leadsByOrg, "active"),
      openConversations: sumBuckets(conversationsByOrg, "active"),
      webhookErrors,
      messagesTotal: messageSummary.total,
      inboundMessages: messageSummary.inbound,
      outboundMessages: messageSummary.outbound,
      audioMessages: messageSummary.audio,
      mediaMessages: messageSummary.media,
      agentRunsTotal: agentRunSummary.total,
      agentRunsCompleted: agentRunSummary.completed,
      agentRunsFailed: agentRunSummary.failed,
      averageAgentRunSeconds: readAverageRunSeconds(agentRunSummary),
    },
    instances,
    warnings,
  };
}

const emptyWorkspace: AdminCustomerWhatsappWorkspace = {
  summary: {
    totalInstances: 0,
    connectedInstances: 0,
    pendingInstances: 0,
    webhookConfigured: 0,
    whatsappAgents: 0,
    totalLeads: 0,
    activeLeads: 0,
    openConversations: 0,
    webhookErrors: 0,
    messagesTotal: 0,
    inboundMessages: 0,
    outboundMessages: 0,
    audioMessages: 0,
    mediaMessages: 0,
    agentRunsTotal: 0,
    agentRunsCompleted: 0,
    agentRunsFailed: 0,
    averageAgentRunSeconds: null,
  },
  instances: [],
  warnings: [],
};

function indexAgentsById(rows: AgentRow[]) {
  const indexed = new Map<string, AdminCustomerWhatsappAgent>();

  for (const row of rows) {
    indexed.set(row.id, mapAdminCustomerWhatsappAgent(row));
  }

  return indexed;
}

function groupAgentsByOrganization(rows: AgentRow[]) {
  const grouped = new Map<string, AdminCustomerWhatsappAgent[]>();

  for (const row of rows) {
    if (!row.organization_id) continue;

    const agents = grouped.get(row.organization_id) ?? [];
    agents.push(mapAdminCustomerWhatsappAgent(row));
    grouped.set(row.organization_id, agents);
  }

  return grouped;
}

function mapAdminCustomerWhatsappAgent(row: AgentRow): AdminCustomerWhatsappAgent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    status: row.status ?? "draft",
    agentCode: row.agent_code,
  };
}

function groupLeads(rows: LeadRow[]) {
  const grouped = new Map<string, CountBucket>();

  for (const row of rows) {
    const bucket = grouped.get(row.organization_id) ?? emptyBucket();
    bucket.total += 1;
    if (["new", "active", "qualified"].includes(row.status ?? "new")) {
      bucket.active += 1;
    }
    bucket.latestAt = pickLatest(bucket.latestAt, row.last_message_at);
    grouped.set(row.organization_id, bucket);
  }

  return grouped;
}

function indexLeadsById(rows: LeadRow[]) {
  const indexed = new Map<string, LeadRow>();

  for (const row of rows) {
    indexed.set(row.id, row);
  }

  return indexed;
}

function groupLeadsByInstance(rows: ConversationRow[], leadsById: Map<string, LeadRow>) {
  const grouped = new Map<string, CountBucket>();
  const seenByInstance = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!row.whatsapp_instance_id || !row.lead_id) continue;

    const seen = seenByInstance.get(row.whatsapp_instance_id) ?? new Set<string>();
    if (seen.has(row.lead_id)) continue;
    seen.add(row.lead_id);
    seenByInstance.set(row.whatsapp_instance_id, seen);

    const lead = leadsById.get(row.lead_id);
    const bucket = grouped.get(row.whatsapp_instance_id) ?? emptyBucket();
    bucket.total += 1;
    if (isActiveLeadStatus(lead?.status)) {
      bucket.active += 1;
    }
    bucket.latestAt = pickLatest(bucket.latestAt, lead?.last_message_at, row.last_message_at);
    grouped.set(row.whatsapp_instance_id, bucket);
  }

  return grouped;
}

function groupConversationsByOrganization(rows: ConversationRow[]) {
  const grouped = new Map<string, CountBucket>();

  for (const row of rows) {
    const bucket = grouped.get(row.organization_id) ?? emptyBucket();
    updateConversationBucket(bucket, row);
    grouped.set(row.organization_id, bucket);
  }

  return grouped;
}

function groupConversationsByInstance(rows: ConversationRow[]) {
  const grouped = new Map<string, CountBucket>();

  for (const row of rows) {
    if (!row.whatsapp_instance_id) continue;

    const bucket = grouped.get(row.whatsapp_instance_id) ?? emptyBucket();
    updateConversationBucket(bucket, row);
    grouped.set(row.whatsapp_instance_id, bucket);
  }

  return grouped;
}

function updateConversationBucket(bucket: CountBucket, row: ConversationRow) {
  bucket.total += 1;
  if (["open", "waiting_customer", "waiting_agent"].includes(row.status ?? "open")) {
    bucket.active += 1;
  }
  bucket.latestAt = pickLatest(bucket.latestAt, row.last_message_at);
}

function latestWebhookByInstance(rows: WebhookEventRow[]) {
  const grouped = new Map<string, WebhookEventRow>();

  for (const row of rows) {
    if (!row.whatsapp_instance_id || grouped.has(row.whatsapp_instance_id)) {
      continue;
    }
    grouped.set(row.whatsapp_instance_id, row);
  }

  return grouped;
}

function indexConversationInstance(rows: ConversationRow[]) {
  const indexed = new Map<string, string>();

  for (const row of rows) {
    if (row.whatsapp_instance_id) {
      indexed.set(row.id, row.whatsapp_instance_id);
    }
  }

  return indexed;
}

function groupMessagesByInstance(rows: MessageRow[], conversationInstanceById: Map<string, string>) {
  const grouped = new Map<string, MessageAnalyticsBucket>();

  for (const row of rows) {
    const instanceId = getMessageInstanceId(row, conversationInstanceById);
    if (!instanceId) continue;

    const bucket = grouped.get(instanceId) ?? emptyMessageBucket();
    updateMessageBucket(bucket, row);
    grouped.set(instanceId, bucket);
  }

  return grouped;
}

function summarizeMessages(
  rows: MessageRow[],
  conversationInstanceById: Map<string, string>,
  instanceRows: InstanceRow[],
) {
  const allowedInstanceIds = new Set(instanceRows.map((row) => row.id));
  const bucket = emptyMessageBucket();

  for (const row of rows) {
    const instanceId = getMessageInstanceId(row, conversationInstanceById);
    if (!instanceId || !allowedInstanceIds.has(instanceId)) continue;
    updateMessageBucket(bucket, row);
  }

  return bucket;
}

function getMessageInstanceId(row: MessageRow, conversationInstanceById: Map<string, string>) {
  if (row.whatsapp_instance_id) {
    return row.whatsapp_instance_id;
  }

  return row.conversation_id ? conversationInstanceById.get(row.conversation_id) ?? null : null;
}

function updateMessageBucket(bucket: MessageAnalyticsBucket, row: MessageRow) {
  bucket.total += 1;

  const direction = (row.direction ?? "").toLowerCase();
  if (direction === "inbound") {
    bucket.inbound += 1;
  } else if (direction === "outbound") {
    bucket.outbound += 1;
  }

  const kind = detectMessageKind(row);
  if (kind === "audio") {
    bucket.audio += 1;
  } else if (kind === "media") {
    bucket.media += 1;
  }

  bucket.latestAt = pickLatest(bucket.latestAt, row.occurred_at);
}

function detectMessageKind(row: MessageRow): "audio" | "media" | "text" | "unknown" {
  const type = normalizeComparable(row.message_type);
  const payload = readRecord(row.payload);
  const payloadHints = [
    readString(payload?.type),
    readString(payload?.messageType),
    readString(payload?.mediaType),
    readString(payload?.mimetype),
    readString(payload?.mime_type),
    readString(readRecord(payload?.media)?.type),
    readString(readRecord(payload?.media)?.mimetype),
  ].map(normalizeComparable);
  const joined = [type, ...payloadHints].filter(Boolean).join(" ");

  if (joined.includes("audio") || joined.includes("voice") || joined.includes("ptt")) {
    return "audio";
  }

  if (["image", "video", "document", "file", "sticker", "location", "media"].some((item) => joined.includes(item))) {
    return "media";
  }

  if (!joined || joined.includes("text") || joined.includes("chat")) {
    return "text";
  }

  return "unknown";
}

function indexInstanceIdsByAgent(
  rows: InstanceRow[],
  agentsById: Map<string, AdminCustomerWhatsappAgent>,
  agentsByOrganization: Map<string, AdminCustomerWhatsappAgent[]>,
) {
  const indexed = new Map<string, string[]>();

  for (const row of rows) {
    const agents = resolveInstanceAgents(row, agentsById, agentsByOrganization);

    for (const agent of agents) {
      const instanceIds = indexed.get(agent.id) ?? [];
      instanceIds.push(row.id);
      indexed.set(agent.id, instanceIds);
    }
  }

  return indexed;
}

function groupAgentRunsByInstance(rows: AgentRunRow[], instanceIdsByAgent: Map<string, string[]>) {
  const grouped = new Map<string, AgentRunBucket>();

  for (const row of rows) {
    if (!row.agent_id) continue;

    const instanceIds = instanceIdsByAgent.get(row.agent_id) ?? [];
    for (const instanceId of instanceIds) {
      const bucket = grouped.get(instanceId) ?? emptyAgentRunBucket();
      updateAgentRunBucket(bucket, row);
      grouped.set(instanceId, bucket);
    }
  }

  return grouped;
}

function summarizeAgentRuns(rows: AgentRunRow[]) {
  const bucket = emptyAgentRunBucket();

  for (const row of rows) {
    updateAgentRunBucket(bucket, row);
  }

  return bucket;
}

function updateAgentRunBucket(bucket: AgentRunBucket, row: AgentRunRow) {
  bucket.total += 1;

  const status = (row.run_status ?? "queued").toLowerCase();
  if (status === "completed") {
    bucket.completed += 1;
  } else if (status === "failed" || status === "cancelled") {
    bucket.failed += 1;
  } else if (status === "running") {
    bucket.running += 1;
  } else {
    bucket.queued += 1;
  }

  const duration = diffSeconds(row.started_at, row.finished_at);
  if (duration !== null) {
    bucket.durationSecondsTotal += duration;
    bucket.durationCount += 1;
  }

  const eventAt = pickLatest(row.finished_at, row.started_at, row.created_at);
  if (!bucket.latestAt || (eventAt && new Date(eventAt).getTime() > new Date(bucket.latestAt).getTime())) {
    bucket.latestAt = eventAt;
    bucket.latestStatus = status;
    bucket.latestError = row.error_message;
  } else if (!bucket.latestError && row.error_message) {
    bucket.latestError = row.error_message;
  }
}

function resolveInstanceAgents(
  row: InstanceRow,
  agentsById: Map<string, AdminCustomerWhatsappAgent>,
  agentsByOrganization: Map<string, AdminCustomerWhatsappAgent[]>,
) {
  const candidateIds = getInstanceAgentCandidateIds(row);
  const agents = candidateIds
    .map((id) => agentsById.get(id))
    .filter((agent): agent is AdminCustomerWhatsappAgent => Boolean(agent));

  if (agents.length > 0) {
    return agents;
  }

  return inferLegacyInstanceAgents(row, agentsByOrganization);
}

function getInstanceAgentCandidateIds(row: InstanceRow) {
  const metadata = readRecord(row.metadata) ?? {};
  return uniqueStrings([
    readString(metadata.agent_id),
    readString(metadata.agentId),
    readString(metadata.whatsapp_agent_id),
    readString(metadata.producer_agent_id),
    ...toStringArray(metadata.agent_ids),
  ]);
}

function inferLegacyInstanceAgents(
  row: InstanceRow,
  agentsByOrganization: Map<string, AdminCustomerWhatsappAgent[]>,
) {
  const organizationAgents = agentsByOrganization.get(row.organization_id) ?? [];

  if (organizationAgents.length === 0) {
    return [];
  }

  const metadata = readRecord(row.metadata) ?? {};
  const metadataAgentName = normalizeComparable(readString(metadata.agent_name));
  const metadataAgentCode = normalizeComparable(readString(metadata.agent_code));
  const instanceFingerprint = normalizeComparable([
    row.display_name,
    row.provider_instance_id,
    readString(metadata.provider_name),
    metadataAgentName,
    metadataAgentCode,
  ].filter(Boolean).join(" "));

  const matches = organizationAgents.filter((agent) => {
    const agentName = normalizeComparable(agent.name);
    const agentCode = normalizeComparable(agent.agentCode);

    return (metadataAgentCode && metadataAgentCode === agentCode)
      || (metadataAgentName && metadataAgentName === agentName)
      || (agentCode && instanceFingerprint.includes(agentCode))
      || (agentName && instanceFingerprint.includes(agentName));
  });

  if (matches.length > 0) {
    return matches;
  }

  if (row.status === "connected" && organizationAgents.length === 1) {
    return organizationAgents;
  }

  return [];
}

function isWhatsappAgent(row: AgentRow) {
  const metadata = readRecord(row.metadata) ?? {};
  const agentType = readString(metadata.agent_type);
  const agentKind = readString(metadata.agent_kind);
  const code = row.agent_code.toLowerCase();
  const name = row.name.toLowerCase();
  const role = (row.role_title ?? "").toLowerCase();
  const tools = toStringArray(row.tools).map((item) => item.toLowerCase());
  const triggers = toStringArray(row.triggers).map((item) => item.toLowerCase());

  return agentType === "whatsapp_attendant"
    || agentKind === "whatsapp"
    || code.includes("agente-whatsapp")
    || name.includes("whatsapp")
    || role.includes("whatsapp")
    || triggers.some((trigger) => trigger.includes("connectyhub/whatsapp."))
    || tools.includes("whatsapp");
}

function isCustomerWhatsappAgent(row: AgentRow) {
  return isWhatsappAgent(row) && !isGlobalWhatsappAgent(row);
}

function isGlobalWhatsappAgent(row: AgentRow) {
  const metadata = readRecord(row.metadata) ?? {};
  const code = row.agent_code.toLowerCase();
  const role = (row.role_title ?? "").toLowerCase();

  return code === "agente-whatsapp-global"
    || readBoolean(metadata.whatsapp_global_agent)
    || readBoolean(metadata.global_whatsapp_agent)
    || role.includes("controlador global");
}

function isCustomerPanelInstance(row: InstanceRow) {
  if (isPlatformInternalInstance(row)) {
    return false;
  }

  if (isDirectClientDashboardInstance(row)) {
    return true;
  }

  if (row.connectyhub_api_client_id || normalizeApiVisibility(row.connectyhub_api_visibility) !== "internal") {
    return false;
  }

  return true;
}

function isDirectClientDashboardInstance(row: InstanceRow) {
  const metadata = readRecord(row.metadata) ?? {};
  const createdFrom = (readString(metadata.created_from) ?? "").toLowerCase();

  return createdFrom === "client_dashboard"
    || readBoolean(metadata.client_agent)
    || getInstanceAgentCandidateIds(row).length > 0;
}

function isOrphanedClientAgentInstance(row: InstanceRow, agentsById: Map<string, AdminCustomerWhatsappAgent>) {
  const metadata = readRecord(row.metadata) ?? {};
  const candidateIds = getInstanceAgentCandidateIds(row);

  if (candidateIds.some((id) => agentsById.has(id))) {
    return false;
  }

  const createdFrom = (readString(metadata.created_from) ?? "").toLowerCase();
  const wasClientAgent = readBoolean(metadata.client_agent)
    || Boolean(readString(metadata.agent_name))
    || Boolean(readString(metadata.agent_code));
  const isConnectedWithNumber = row.status === "connected" && Boolean(row.phone_number);

  if (candidateIds.length > 0) {
    return wasClientAgent && !isConnectedWithNumber;
  }

  return createdFrom === "client_dashboard" && !isConnectedWithNumber;
}

function isPlatformInternalInstance(row: InstanceRow) {
  const metadata = readRecord(row.metadata) ?? {};
  const organization = readOrganization(row.organizations);
  const providerInstanceId = (row.provider_instance_id ?? "").toLowerCase();
  const displayName = (row.display_name ?? "").toLowerCase();
  const organizationName = (organization?.name ?? "").toLowerCase();
  const createdFrom = (readString(metadata.created_from) ?? "").toLowerCase();

  return readBoolean(metadata.connectyhub_internal)
    || readBoolean(metadata.platform_whatsapp)
    || readBoolean(metadata.admin_whatsapp)
    || createdFrom === "admin_whatsapp_internal"
    || providerInstanceId.includes("connectyhub-interno")
    || displayName.includes("connectyhub interno")
    || organizationName.includes("connectyhub interno");
}

function hasWebhookError(row: WebhookEventRow) {
  const status = (row.processing_status ?? "").toLowerCase();
  return Boolean(row.error_message) || status === "failed" || status === "error";
}

function normalizeApiVisibility(value: unknown): ConnectyHubApiVisibility {
  return value === "api_customer" || value === "hybrid" ? value : "internal";
}

function readOrganization(value: RelatedOrganization) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown) {
  return value === true || value === "true";
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function normalizeComparable(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isActiveLeadStatus(status: string | null | undefined) {
  return ["new", "active", "qualified"].includes(status ?? "new");
}

function emptyBucket(): CountBucket {
  return { total: 0, active: 0, latestAt: null };
}

function emptyMessageBucket(): MessageAnalyticsBucket {
  return {
    total: 0,
    inbound: 0,
    outbound: 0,
    audio: 0,
    media: 0,
    latestAt: null,
  };
}

function emptyAgentRunBucket(): AgentRunBucket {
  return {
    total: 0,
    completed: 0,
    failed: 0,
    queued: 0,
    running: 0,
    durationSecondsTotal: 0,
    durationCount: 0,
    latestAt: null,
    latestStatus: null,
    latestError: null,
  };
}

function sumBuckets(map: Map<string, CountBucket>, key: "total" | "active") {
  let total = 0;
  for (const bucket of map.values()) {
    total += bucket[key];
  }
  return total;
}

function readAverageRunSeconds(bucket: AgentRunBucket) {
  if (bucket.durationCount === 0) {
    return null;
  }

  return Math.round(bucket.durationSecondsTotal / bucket.durationCount);
}

function diffSeconds(start: string | null | undefined, finish: string | null | undefined) {
  if (!start || !finish) {
    return null;
  }

  const startMs = new Date(start).getTime();
  const finishMs = new Date(finish).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(finishMs) || finishMs < startMs) {
    return null;
  }

  return Math.round((finishMs - startMs) / 1000);
}

function pickLatest(...values: Array<string | null | undefined>) {
  let latest: string | null = null;

  for (const value of values) {
    if (!value) continue;
    if (!latest || new Date(value).getTime() > new Date(latest).getTime()) {
      latest = value;
    }
  }

  return latest;
}
