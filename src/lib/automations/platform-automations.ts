import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_PLATFORM_BILLING_MESSAGE_TEMPLATES,
  PLATFORM_BILLING_MESSAGE_TEMPLATE_DEFINITIONS,
  PLATFORM_BILLING_MESSAGE_TEMPLATE_MAX_LENGTH,
  PLATFORM_BILLING_MESSAGE_VARIABLES,
} from "@/lib/billing/platform-billing-messages";
import { createServiceClient } from "@/lib/supabase/service";

type JsonRecord = Record<string, unknown>;

export type PlatformAutomationStatus = "active" | "paused" | "draft" | "archived";
export type PlatformAutomationChannel = "whatsapp" | "in_app";
export type PlatformAutomationAudience = "all_clients" | "trial_users" | "paid_users" | "custom";

export type PlatformAutomationEventDefinition = {
  eventType: string;
  label: string;
  description: string;
  category: "trial" | "billing" | "retention" | "internal";
  revenueGoal: string;
};

export type PlatformAutomationAgentOption = {
  id: string;
  name: string;
  roleTitle: string;
  sectorName: string;
  status: string;
  whatsappStatus: string;
  phoneNumber: string | null;
  displayName: string | null;
  connectedAt: string | null;
  isConnected: boolean;
};

export type PlatformAutomationFlow = {
  id: string;
  flowKey: string;
  name: string;
  description: string;
  eventType: string;
  eventLabel: string;
  channel: PlatformAutomationChannel;
  status: PlatformAutomationStatus;
  selectedAgentId: string | null;
  fallbackToBillingAgent: boolean;
  audienceType: PlatformAutomationAudience;
  conditions: JsonRecord;
  triggerConfig: JsonRecord;
  messageTemplate: string;
  delayMinutes: number;
  cooldownMinutes: number;
  maxSendsPerContact: number;
  priority: number;
  labels: string[];
  metadata: JsonRecord;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PlatformAutomationNotificationItem = {
  id: string;
  organizationId: string | null;
  organizationName: string;
  eventType: string;
  eventLabel: string;
  automationFlowId: string | null;
  automationFlowName: string | null;
  status: string;
  channel: string;
  agentName: string | null;
  recipientPhone: string | null;
  messagePreview: string | null;
  createdAt: string;
  sentAt: string | null;
  errorMessage: string | null;
};

export type PlatformAutomationsCatalog = {
  schemaReady: boolean;
  flows: PlatformAutomationFlow[];
  agents: PlatformAutomationAgentOption[];
  notifications: PlatformAutomationNotificationItem[];
  eventDefinitions: PlatformAutomationEventDefinition[];
  variables: readonly string[];
  stats: {
    totalFlows: number;
    activeFlows: number;
    pausedFlows: number;
    connectedAgents: number;
    sent24h: number;
    pendingNotifications: number;
    failedNotifications: number;
  };
  warnings: string[];
};

type FlowRow = {
  id: string;
  flow_key: string;
  name: string;
  description: string | null;
  event_type: string;
  channel: string | null;
  status: string | null;
  selected_agent_id: string | null;
  fallback_to_billing_agent: boolean | null;
  audience_type: string | null;
  conditions: JsonRecord | null;
  trigger_config: JsonRecord | null;
  message_template: string | null;
  delay_minutes: number | string | null;
  cooldown_minutes: number | string | null;
  max_sends_per_contact: number | string | null;
  priority: number | string | null;
  labels: string[] | null;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

type AgentRow = {
  id: string;
  name: string;
  persona_name: string | null;
  role_title: string | null;
  sector_name: string | null;
  status: string | null;
};

type WhatsappInstanceRow = {
  id: string;
  status: string | null;
  phone_number: string | null;
  display_name: string | null;
  connected_at: string | null;
  updated_at: string | null;
  metadata: JsonRecord | null;
};

type NotificationRow = {
  id: string;
  organization_id: string | null;
  event_type: string;
  automation_flow_id: string | null;
  status: string | null;
  channel: string | null;
  selected_agent_id: string | null;
  recipient_phone: string | null;
  message_preview: string | null;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
};

type OrganizationRow = {
  id: string;
  name: string | null;
  slug: string | null;
};

export const PLATFORM_AUTOMATION_VARIABLES = PLATFORM_BILLING_MESSAGE_VARIABLES;

export const PLATFORM_AUTOMATION_EVENT_DEFINITIONS: PlatformAutomationEventDefinition[] =
  PLATFORM_BILLING_MESSAGE_TEMPLATE_DEFINITIONS.map((definition) => ({
    eventType: definition.eventType,
    label: definition.label,
    description: definition.description,
    category: getEventCategory(definition.eventType),
    revenueGoal: getEventRevenueGoal(definition.eventType),
  }));

const PLATFORM_AUTOMATION_TIMING_POLICY: Record<string, {
  delayMinutes: number;
  cooldownMinutes: number;
  maxSendsPerContact: number;
  priority: number;
}> = {
  trial_started: { delayMinutes: 0, cooldownMinutes: 1440, maxSendsPerContact: 1, priority: 10 },
  trial_credit_milestone: { delayMinutes: 5, cooldownMinutes: 60, maxSendsPerContact: 8, priority: 20 },
  trial_no_credits: { delayMinutes: 2, cooldownMinutes: 720, maxSendsPerContact: 2, priority: 30 },
  subscription_pending: { delayMinutes: 8, cooldownMinutes: 240, maxSendsPerContact: 0, priority: 40 },
  subscription_replaced: { delayMinutes: 2, cooldownMinutes: 180, maxSendsPerContact: 0, priority: 42 },
  checkout_cart_updated: { delayMinutes: 15, cooldownMinutes: 180, maxSendsPerContact: 0, priority: 45 },
  checkout_payment_started: { delayMinutes: 12, cooldownMinutes: 240, maxSendsPerContact: 0, priority: 48 },
  payment_pending: { delayMinutes: 10, cooldownMinutes: 360, maxSendsPerContact: 0, priority: 50 },
  payment_approved: { delayMinutes: 0, cooldownMinutes: 60, maxSendsPerContact: 0, priority: 60 },
  payment_rejected: { delayMinutes: 10, cooldownMinutes: 360, maxSendsPerContact: 0, priority: 70 },
  subscription_paused: { delayMinutes: 60, cooldownMinutes: 1440, maxSendsPerContact: 0, priority: 80 },
  subscription_canceled: { delayMinutes: 120, cooldownMinutes: 1440, maxSendsPerContact: 0, priority: 90 },
  billing_update: { delayMinutes: 15, cooldownMinutes: 360, maxSendsPerContact: 0, priority: 100 },
  billing_operational_test: { delayMinutes: 0, cooldownMinutes: 0, maxSendsPerContact: 50, priority: 110 },
};

export async function getPlatformAutomationsCatalog(): Promise<PlatformAutomationsCatalog> {
  const client = createServiceClient();
  const flowsResult = await client
    .from("platform_automation_flows")
    .select("id, flow_key, name, description, event_type, channel, status, selected_agent_id, fallback_to_billing_agent, audience_type, conditions, trigger_config, message_template, delay_minutes, cooldown_minutes, max_sends_per_contact, priority, labels, metadata, created_at, updated_at")
    .neq("status", "archived")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<FlowRow[]>();

  const schemaReady = !flowsResult.error;
  const [agentsResult, instancesResult, notificationsResult] = await Promise.all([
    client
      .from("agent_registry")
      .select("id, name, persona_name, role_title, sector_name, status")
      .eq("scope", "platform")
      .is("organization_id", null)
      .neq("status", "archived")
      .contains("metadata", { admin_whatsapp: true, agent_kind: "whatsapp" })
      .order("created_at", { ascending: false })
      .returns<AgentRow[]>(),
    client
      .from("whatsapp_instances")
      .select("id, status, phone_number, display_name, connected_at, updated_at, metadata")
      .contains("metadata", { admin_whatsapp: true, platform_whatsapp: true })
      .order("updated_at", { ascending: false })
      .limit(100)
      .returns<WhatsappInstanceRow[]>(),
    schemaReady
      ? client
          .from("billing_notification_events")
          .select("id, organization_id, event_type, automation_flow_id, status, channel, selected_agent_id, recipient_phone, message_preview, sent_at, error_message, created_at")
          .order("created_at", { ascending: false })
          .limit(18)
          .returns<NotificationRow[]>()
      : Promise.resolve({ data: [] as NotificationRow[], error: null }),
  ]);

  const warnings = [
    flowsResult.error?.message,
    agentsResult.error?.message,
    instancesResult.error?.message,
    notificationsResult.error?.message,
  ].filter((message): message is string => Boolean(message));
  const instancesByAgentId = buildInstancesByAgentId(instancesResult.data ?? []);
  const agents = (agentsResult.data ?? []).map((agent) => mapAgent(agent, instancesByAgentId.get(agent.id)));
  const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name]));
  const flows = schemaReady
    ? (flowsResult.data ?? []).map(mapFlow)
    : getDefaultAutomationFlows();
  const flowById = new Map(flows.map((flow) => [flow.id, flow]));
  const organizationIds = Array.from(new Set(
    (notificationsResult.data ?? [])
      .map((notification) => notification.organization_id)
      .filter((id): id is string => Boolean(id)),
  ));
  const organizations = await loadOrganizationMap(client, organizationIds);
  const notifications = (notificationsResult.data ?? []).map((notification) =>
    mapNotification(notification, organizations, agentNameById, flowById),
  );
  const sentWindowStart = Date.now() - 24 * 60 * 60 * 1000;

  return {
    schemaReady,
    flows,
    agents,
    notifications,
    eventDefinitions: PLATFORM_AUTOMATION_EVENT_DEFINITIONS,
    variables: PLATFORM_AUTOMATION_VARIABLES,
    stats: {
      totalFlows: flows.length,
      activeFlows: flows.filter((flow) => flow.status === "active").length,
      pausedFlows: flows.filter((flow) => flow.status === "paused").length,
      connectedAgents: agents.filter((agent) => agent.isConnected).length,
      sent24h: notifications.filter((item) =>
        item.status === "sent" && new Date(item.sentAt ?? item.createdAt).getTime() >= sentWindowStart,
      ).length,
      pendingNotifications: notifications.filter((item) => item.status === "pending").length,
      failedNotifications: notifications.filter((item) => item.status === "failed").length,
    },
    warnings,
  };
}

export async function findPlatformAutomationForNotification(
  client: SupabaseClient,
  input: {
    organizationId: string;
    eventType: string;
    channel?: PlatformAutomationChannel;
    planCode?: string | null;
    balanceCredits?: number | null;
    usedCredits?: number | null;
    milestoneCredits?: number | null;
    metadata?: JsonRecord | null;
  },
): Promise<PlatformAutomationFlow | null> {
  const { data, error } = await client
    .from("platform_automation_flows")
    .select("id, flow_key, name, description, event_type, channel, status, selected_agent_id, fallback_to_billing_agent, audience_type, conditions, trigger_config, message_template, delay_minutes, cooldown_minutes, max_sends_per_contact, priority, labels, metadata, created_at, updated_at")
    .eq("event_type", input.eventType)
    .eq("channel", input.channel ?? "whatsapp")
    .eq("status", "active")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<FlowRow[]>();

  if (error) {
    return null;
  }

  for (const row of data ?? []) {
    const flow = mapFlow(row);

    if (!automationConditionsMatch(flow.conditions, input)) {
      continue;
    }

    const allowed = await automationSendLimitAllows(client, flow, input.organizationId);

    if (allowed) {
      return flow;
    }
  }

  return null;
}

export async function validateConnectedPlatformAutomationAgent(
  client: SupabaseClient,
  agentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: agent, error: agentError } = await client
    .from("agent_registry")
    .select("id")
    .eq("id", agentId)
    .eq("scope", "platform")
    .is("organization_id", null)
    .neq("status", "archived")
    .contains("metadata", { admin_whatsapp: true, agent_kind: "whatsapp" })
    .maybeSingle<{ id: string }>();

  if (agentError) {
    return { ok: false, error: `Nao foi possivel validar o agente: ${agentError.message}` };
  }

  if (!agent) {
    return { ok: false, error: "Escolha um agente WhatsApp interno da ConnectyHub." };
  }

  const { data: instance, error: instanceError } = await client
    .from("whatsapp_instances")
    .select("id")
    .eq("status", "connected")
    .contains("metadata", { admin_whatsapp: true, platform_whatsapp: true, agent_id: agentId })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (instanceError) {
    return { ok: false, error: `Nao foi possivel validar o WhatsApp do agente: ${instanceError.message}` };
  }

  if (!instance) {
    return { ok: false, error: "Escolha um agente com WhatsApp conectado para enviar automacoes." };
  }

  return { ok: true };
}

export function normalizeAutomationMessageTemplate(value: unknown, fallback: string) {
  const template = typeof value === "string" ? value : "";
  const clean = template
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, PLATFORM_BILLING_MESSAGE_TEMPLATE_MAX_LENGTH);

  return clean || fallback;
}

export function getDefaultAutomationTemplate(eventType: string) {
  return DEFAULT_PLATFORM_BILLING_MESSAGE_TEMPLATES[
    getKnownMessageTemplateKey(eventType)
  ];
}

export function getDefaultAutomationFlows(): PlatformAutomationFlow[] {
  return PLATFORM_AUTOMATION_EVENT_DEFINITIONS.map((definition, index) => {
    const timing = PLATFORM_AUTOMATION_TIMING_POLICY[definition.eventType] ?? {
      delayMinutes: 0,
      cooldownMinutes: 0,
      maxSendsPerContact: definition.eventType === "trial_credit_milestone" ? 20 : 3,
      priority: (index + 1) * 10,
    };

    return {
      id: definition.eventType,
      flowKey: definition.eventType,
      name: definition.label,
      description: definition.description,
      eventType: definition.eventType,
      eventLabel: definition.label,
      channel: "whatsapp",
      status: "draft",
      selectedAgentId: null,
      fallbackToBillingAgent: true,
      audienceType: definition.category === "trial" ? "trial_users" : "all_clients",
      conditions: definition.eventType === "trial_credit_milestone"
        ? { milestone_step_credits: 100 }
        : {},
      triggerConfig: { kind: definition.category },
      messageTemplate: getDefaultAutomationTemplate(definition.eventType),
      delayMinutes: timing.delayMinutes,
      cooldownMinutes: timing.cooldownMinutes,
      maxSendsPerContact: timing.maxSendsPerContact,
      priority: timing.priority,
      labels: [definition.category],
      metadata: { preview: true, timingPolicy: "0038_platform_automation_timing_policy" },
      createdAt: null,
      updatedAt: null,
    };
  });
}

function mapFlow(row: FlowRow): PlatformAutomationFlow {
  const eventDefinition = PLATFORM_AUTOMATION_EVENT_DEFINITIONS.find((item) => item.eventType === row.event_type);

  return {
    id: row.id,
    flowKey: row.flow_key,
    name: row.name,
    description: row.description ?? eventDefinition?.description ?? "",
    eventType: row.event_type,
    eventLabel: eventDefinition?.label ?? row.event_type,
    channel: row.channel === "in_app" ? "in_app" : "whatsapp",
    status: isAutomationStatus(row.status) ? row.status : "draft",
    selectedAgentId: row.selected_agent_id,
    fallbackToBillingAgent: row.fallback_to_billing_agent !== false,
    audienceType: isAudience(row.audience_type) ? row.audience_type : "all_clients",
    conditions: row.conditions ?? {},
    triggerConfig: row.trigger_config ?? {},
    messageTemplate: normalizeAutomationMessageTemplate(row.message_template, getDefaultAutomationTemplate(row.event_type)),
    delayMinutes: toNumber(row.delay_minutes),
    cooldownMinutes: toNumber(row.cooldown_minutes),
    maxSendsPerContact: toNumber(row.max_sends_per_contact),
    priority: toNumber(row.priority),
    labels: Array.isArray(row.labels) ? row.labels.filter((item): item is string => typeof item === "string") : [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildInstancesByAgentId(rows: WhatsappInstanceRow[]) {
  const map = new Map<string, WhatsappInstanceRow>();

  for (const row of rows) {
    const agentId = readString(row.metadata?.agent_id);

    if (!agentId) {
      continue;
    }

    const current = map.get(agentId);
    if (!current || instanceRank(row) > instanceRank(current)) {
      map.set(agentId, row);
    }
  }

  return map;
}

function instanceRank(row: WhatsappInstanceRow) {
  const statusScore = row.status === "connected" ? 10 : row.status === "qr_pending" ? 4 : 0;
  const updatedScore = new Date(row.updated_at ?? row.connected_at ?? 0).getTime();
  return statusScore * 10_000_000_000_000 + (Number.isFinite(updatedScore) ? updatedScore : 0);
}

function mapAgent(row: AgentRow, instance: WhatsappInstanceRow | undefined): PlatformAutomationAgentOption {
  const whatsappStatus = instance?.status ?? "disconnected";

  return {
    id: row.id,
    name: row.persona_name?.trim() || row.name,
    roleTitle: row.role_title?.trim() || "Agente WhatsApp da ConnectyHub",
    sectorName: row.sector_name?.trim() || "Setor interno",
    status: row.status ?? "draft",
    whatsappStatus,
    phoneNumber: instance?.phone_number ?? null,
    displayName: instance?.display_name ?? null,
    connectedAt: instance?.connected_at ?? null,
    isConnected: whatsappStatus === "connected",
  };
}

async function loadOrganizationMap(client: SupabaseClient, ids: string[]) {
  if (ids.length === 0) {
    return new Map<string, OrganizationRow>();
  }

  const { data } = await client
    .from("organizations")
    .select("id, name, slug")
    .in("id", ids)
    .returns<OrganizationRow[]>();

  return new Map((data ?? []).map((organization) => [organization.id, organization]));
}

function mapNotification(
  row: NotificationRow,
  organizations: Map<string, OrganizationRow>,
  agentNameById: Map<string, string>,
  flowById: Map<string, PlatformAutomationFlow>,
): PlatformAutomationNotificationItem {
  const flow = row.automation_flow_id ? flowById.get(row.automation_flow_id) ?? null : null;
  const organization = row.organization_id ? organizations.get(row.organization_id) ?? null : null;

  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: organization?.name?.trim() || organization?.slug?.trim() || "ConnectyHub",
    eventType: row.event_type,
    eventLabel: flow?.eventLabel ?? getEventLabel(row.event_type),
    automationFlowId: row.automation_flow_id,
    automationFlowName: flow?.name ?? null,
    status: row.status ?? "pending",
    channel: row.channel ?? "whatsapp",
    agentName: row.selected_agent_id ? agentNameById.get(row.selected_agent_id) ?? "Agente removido" : null,
    recipientPhone: row.recipient_phone,
    messagePreview: row.message_preview,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    errorMessage: row.error_message,
  };
}

function automationConditionsMatch(
  conditions: JsonRecord,
  input: {
    planCode?: string | null;
    balanceCredits?: number | null;
    usedCredits?: number | null;
    milestoneCredits?: number | null;
    metadata?: JsonRecord | null;
  },
) {
  const planCodes = readStringList(conditions.plan_codes);
  const planCode = input.planCode?.trim();

  if (planCodes.length > 0 && (!planCode || !planCodes.includes(planCode))) {
    return false;
  }

  if (!numberConditionMatches(input.balanceCredits, conditions.min_balance_credits, conditions.max_balance_credits)) {
    return false;
  }

  if (!numberConditionMatches(input.usedCredits, conditions.min_used_credits, conditions.max_used_credits)) {
    return false;
  }

  if (!numberConditionMatches(input.milestoneCredits, conditions.min_milestone_credits, conditions.max_milestone_credits)) {
    return false;
  }

  return true;
}

async function automationSendLimitAllows(
  client: SupabaseClient,
  flow: PlatformAutomationFlow,
  organizationId: string,
) {
  if (flow.maxSendsPerContact > 0) {
    const { count, error } = await client
      .from("billing_notification_events")
      .select("id", { count: "exact", head: true })
      .eq("automation_flow_id", flow.id)
      .eq("organization_id", organizationId)
      .neq("status", "skipped");

    if (!error && typeof count === "number" && count >= flow.maxSendsPerContact) {
      return false;
    }
  }

  if (flow.cooldownMinutes > 0) {
    const { data, error } = await client
      .from("billing_notification_events")
      .select("created_at")
      .eq("automation_flow_id", flow.id)
      .eq("organization_id", organizationId)
      .neq("status", "skipped")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ created_at: string }>();

    if (!error && data?.created_at) {
      const lastSentAt = new Date(data.created_at).getTime();
      const cooldownMs = flow.cooldownMinutes * 60 * 1000;

      if (Number.isFinite(lastSentAt) && Date.now() - lastSentAt < cooldownMs) {
        return false;
      }
    }
  }

  return true;
}

function numberConditionMatches(value: number | null | undefined, minRaw: unknown, maxRaw: unknown) {
  const min = readNumber(minRaw);
  const max = readNumber(maxRaw);

  if (min === null && max === null) {
    return true;
  }

  const number = value ?? 0;

  if (min !== null && number < min) {
    return false;
  }

  if (max !== null && number > max) {
    return false;
  }

  return true;
}

function getKnownMessageTemplateKey(eventType: string) {
  return PLATFORM_BILLING_MESSAGE_TEMPLATE_DEFINITIONS.some((definition) => definition.eventType === eventType)
    ? eventType as keyof typeof DEFAULT_PLATFORM_BILLING_MESSAGE_TEMPLATES
    : "billing_update";
}

function getEventLabel(eventType: string) {
  return PLATFORM_AUTOMATION_EVENT_DEFINITIONS.find((definition) => definition.eventType === eventType)?.label
    ?? eventType;
}

function getEventCategory(eventType: string): PlatformAutomationEventDefinition["category"] {
  if (eventType.startsWith("trial_")) return "trial";
  if (eventType.includes("subscription_canceled") || eventType.includes("subscription_paused")) return "retention";
  if (eventType.includes("operational_test")) return "internal";
  return "billing";
}

function getEventRevenueGoal(eventType: string) {
  if (eventType === "trial_started") return "Mostrar bonus e acelerar a primeira assinatura.";
  if (eventType === "trial_credit_milestone") return "Criar urgencia conforme o saldo de teste diminui.";
  if (eventType === "trial_no_credits") return "Recuperar usuarios sem saldo antes de perder o momento de compra.";
  if (eventType === "subscription_replaced") return "Manter a troca de plano no checkout e evitar perda da venda.";
  if (eventType === "checkout_cart_updated") return "Aumentar ticket medio com adicionais e pacotes de credito.";
  if (eventType === "checkout_payment_started") return "Recuperar pagamento iniciado antes de abandono do checkout.";
  if (eventType.includes("rejected") || eventType.includes("pending")) return "Recuperar checkout pendente ou recusado.";
  if (eventType.includes("approved")) return "Confirmar valor entregue e preparar expansao de creditos.";
  if (eventType.includes("canceled") || eventType.includes("paused")) return "Reduzir cancelamento e reativar assinatura.";
  return "Manter o cliente informado e proximo da compra.";
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function toNumber(value: number | string | null | undefined) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function isAutomationStatus(value: unknown): value is PlatformAutomationStatus {
  return value === "active" || value === "paused" || value === "draft" || value === "archived";
}

function isAudience(value: unknown): value is PlatformAutomationAudience {
  return value === "all_clients" || value === "trial_users" || value === "paid_users" || value === "custom";
}
