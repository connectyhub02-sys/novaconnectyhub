import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

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

type CountBucket = {
  total: number;
  active: number;
  latestAt: string | null;
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

  const [agentsResult, leadsResult, conversationsResult, webhooksResult] = await Promise.all([
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
  ]);

  if (agentsResult.error) warnings.push(`Nao foi possivel carregar agentes WhatsApp dos clientes: ${agentsResult.error.message}`);
  if (leadsResult.error) warnings.push(`Nao foi possivel carregar leads do WhatsApp: ${leadsResult.error.message}`);
  if (conversationsResult.error) warnings.push(`Nao foi possivel carregar conversas do WhatsApp: ${conversationsResult.error.message}`);
  if (webhooksResult.error) warnings.push(`Nao foi possivel carregar eventos recentes de webhook: ${webhooksResult.error.message}`);

  const whatsappAgents = ((agentsResult.data ?? []) as AgentRow[])
    .filter((agent) => agent.organization_id && isWhatsappAgent(agent));
  const agentsById = indexAgentsById(whatsappAgents);
  const leadsByOrg = groupLeads((leadsResult.data ?? []) as LeadRow[]);
  const leadsById = indexLeadsById((leadsResult.data ?? []) as LeadRow[]);
  const conversations = (conversationsResult.data ?? []) as ConversationRow[];
  const leadsByInstance = groupLeadsByInstance(conversations, leadsById);
  const conversationsByOrg = groupConversationsByOrganization((conversationsResult.data ?? []) as ConversationRow[]);
  const conversationsByInstance = groupConversationsByInstance(conversations);
  const webhookByInstance = latestWebhookByInstance((webhooksResult.data ?? []) as WebhookEventRow[]);
  const webhookErrors = ((webhooksResult.data ?? []) as WebhookEventRow[]).filter(hasWebhookError).length;

  const instances = instanceRows.map((row) => {
    const organization = readOrganization(row.organizations);
    const agents = resolveInstanceAgents(row, agentsById);
    const leadBucket = leadsByInstance.get(row.id) ?? emptyBucket();
    const conversationBucket = conversationsByInstance.get(row.id) ?? emptyBucket();
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
  },
  instances: [],
  warnings: [],
};

function indexAgentsById(rows: AgentRow[]) {
  const indexed = new Map<string, AdminCustomerWhatsappAgent>();

  for (const row of rows) {
    indexed.set(row.id, {
      id: row.id,
      name: row.name,
      status: row.status ?? "draft",
      agentCode: row.agent_code,
    });
  }

  return indexed;
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

function resolveInstanceAgents(row: InstanceRow, agentsById: Map<string, AdminCustomerWhatsappAgent>) {
  const metadata = readRecord(row.metadata) ?? {};
  const candidateIds = uniqueStrings([
    readString(metadata.agent_id),
    readString(metadata.agentId),
    readString(metadata.whatsapp_agent_id),
    readString(metadata.producer_agent_id),
    ...toStringArray(metadata.agent_ids),
  ]);
  const agents = candidateIds
    .map((id) => agentsById.get(id))
    .filter((agent): agent is AdminCustomerWhatsappAgent => Boolean(agent));

  if (agents.length > 0) {
    return agents;
  }

  const metadataAgentName = readString(metadata.agent_name);
  if (metadataAgentName) {
    return [{
      id: `metadata:${row.id}`,
      name: metadataAgentName,
      status: "vinculado",
      agentCode: readString(metadata.agent_code) ?? "metadata",
    }];
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

function isCustomerPanelInstance(row: InstanceRow) {
  if (normalizeApiVisibility(row.connectyhub_api_visibility) === "api_customer") {
    return false;
  }

  return !isPlatformInternalInstance(row);
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

function isActiveLeadStatus(status: string | null | undefined) {
  return ["new", "active", "qualified"].includes(status ?? "new");
}

function emptyBucket(): CountBucket {
  return { total: 0, active: 0, latestAt: null };
}

function sumBuckets(map: Map<string, CountBucket>, key: "total" | "active") {
  let total = 0;
  for (const bucket of map.values()) {
    total += bucket[key];
  }
  return total;
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
