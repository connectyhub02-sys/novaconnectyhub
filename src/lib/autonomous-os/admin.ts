import "server-only";

import { createClient } from "@/lib/supabase/server";

export type AgentStatus = "draft" | "online" | "paused" | "needs_review" | "archived";
export type AgentRunStatus = "queued" | "running" | "completed" | "failed" | "needs_approval" | "cancelled";
export type WhatsappInstanceStatus =
  | "draft"
  | "qr_pending"
  | "connected"
  | "disconnected"
  | "blocked"
  | "error"
  | "archived";
export type ContentPipelineStatus =
  | "idea"
  | "researching"
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "published"
  | "archived";

export type AdminAgent = {
  id: string;
  scope: "platform" | "organization";
  organizationId: string | null;
  sectorCode: string;
  sectorName: string;
  agentCode: string;
  name: string;
  personaName: string;
  avatarUrl: string | null;
  avatarAlt: string | null;
  profileBio: string | null;
  roleTitle: string;
  description: string | null;
  prompt: string | null;
  promptPreview: string;
  llmProvider: string;
  modelId: string | null;
  status: AgentStatus;
  autonomyLevel: number;
  requiresHumanApproval: boolean;
  tools: string[];
  triggers: string[];
  scheduleRrule: string | null;
  inngestEventName: string | null;
  memoryAccessLevel: string;
  monthlyBudgetCredits: number | null;
  updatedAt: string | null;
};

export type AdminAgentRun = {
  id: string;
  agentId: string;
  organizationId: string | null;
  runStatus: AgentRunStatus;
  triggerSource: string | null;
  outputSummary: string | null;
  errorMessage: string | null;
  costCredits: number;
  startedAt: string;
  finishedAt: string | null;
};

export type IntelligenceEvent = {
  id: string;
  scope: "platform" | "organization";
  organizationId: string | null;
  sourceType: string;
  eventType: string;
  title: string;
  summary: string | null;
  confidence: number | null;
  tags: string[];
  occurredAt: string;
};

export type IntelligenceMemory = {
  id: string;
  scope: "platform" | "organization";
  organizationId: string | null;
  memoryType: string;
  title: string;
  content: string;
  importance: number;
  tags: string[];
  createdAt: string;
};

export type AdminWhatsappInstance = {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationPlan: string | null;
  provider: string;
  providerInstanceId: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  status: WhatsappInstanceStatus;
  webhookUrl: string | null;
  lastHeartbeatAt: string | null;
  lastMessageAt: string | null;
  connectedAt: string | null;
  planCode: string | null;
};

export type ContentPipelineItem = {
  id: string;
  scope: "platform" | "organization";
  organizationId: string | null;
  contentType: string;
  status: ContentPipelineStatus;
  title: string;
  summary: string | null;
  sourceUrl: string | null;
  scheduledFor: string | null;
  publishedAt: string | null;
  tags: string[];
  createdAt: string;
};

export type PlanEntitlement = {
  id: string;
  planCode: string;
  featureCode: string;
  label: string;
  enabled: boolean;
  valueType: string;
  booleanValue: boolean | null;
  numericLimit: number | null;
  textValue: string | null;
};

export type AutonomousAdminOverview = {
  schemaReady: boolean;
  warnings: string[];
  summary: {
    totalAgents: number;
    onlineAgents: number;
    approvalAgents: number;
    intelligenceMemories: number;
    intelligenceEvents: number;
    whatsappInstances: number;
    connectedWhatsapps: number;
    contentItems: number;
    activePlans: number;
  };
  agents: AdminAgent[];
  runs: AdminAgentRun[];
  intelligenceEvents: IntelligenceEvent[];
  intelligenceMemory: IntelligenceMemory[];
  whatsappInstances: AdminWhatsappInstance[];
  contentPipeline: ContentPipelineItem[];
  planEntitlements: PlanEntitlement[];
};

type AgentRow = {
  id: string;
  scope: "platform" | "organization";
  organization_id: string | null;
  sector_code: string;
  sector_name: string;
  agent_code: string;
  name: string;
  persona_name: string | null;
  avatar_url: string | null;
  avatar_alt: string | null;
  profile_bio: string | null;
  role_title: string;
  description: string | null;
  prompt: string | null;
  llm_provider: string | null;
  model_id: string | null;
  status: AgentStatus | null;
  autonomy_level: number | null;
  requires_human_approval: boolean | null;
  tools: string[] | null;
  triggers: string[] | null;
  schedule_rrule: string | null;
  inngest_event_name: string | null;
  memory_access_level: string | null;
  monthly_budget_credits: number | string | null;
  updated_at: string | null;
};

type AgentRunRow = {
  id: string;
  agent_id: string;
  organization_id: string | null;
  run_status: AgentRunStatus | null;
  trigger_source: string | null;
  output_summary: string | null;
  error_message: string | null;
  cost_credits: number | string | null;
  started_at: string;
  finished_at: string | null;
};

type IntelligenceEventRow = {
  id: string;
  scope: "platform" | "organization";
  organization_id: string | null;
  source_type: string;
  event_type: string;
  title: string;
  summary: string | null;
  confidence: number | string | null;
  tags: string[] | null;
  occurred_at: string;
};

type IntelligenceMemoryRow = {
  id: string;
  scope: "platform" | "organization";
  organization_id: string | null;
  memory_type: string;
  title: string;
  content: string;
  importance: number | string | null;
  tags: string[] | null;
  created_at: string;
};

type RelatedOrganization =
  | {
      name: string | null;
      plan_code: string | null;
    }
  | {
      name: string | null;
      plan_code: string | null;
    }[]
  | null;

type WhatsappInstanceRow = {
  id: string;
  organization_id: string;
  provider: string | null;
  provider_instance_id: string | null;
  phone_number: string | null;
  display_name: string | null;
  status: WhatsappInstanceStatus | null;
  webhook_url: string | null;
  last_heartbeat_at: string | null;
  last_message_at: string | null;
  connected_at: string | null;
  plan_code: string | null;
  organizations: RelatedOrganization;
};

type ContentPipelineRow = {
  id: string;
  scope: "platform" | "organization";
  organization_id: string | null;
  content_type: string;
  status: ContentPipelineStatus | null;
  title: string;
  summary: string | null;
  source_url: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  tags: string[] | null;
  created_at: string;
};

type PlanEntitlementRow = {
  id: string;
  plan_code: string;
  feature_code: string;
  label: string;
  enabled: boolean | null;
  value_type: string | null;
  boolean_value: boolean | null;
  numeric_limit: number | string | null;
  text_value: string | null;
};

export async function getAutonomousAdminOverview(): Promise<AutonomousAdminOverview> {
  const supabase = await createClient();

  const [
    agentsResult,
    runsResult,
    eventsResult,
    memoryResult,
    instancesResult,
    contentResult,
    entitlementsResult,
  ] = await Promise.all([
    supabase
      .from("agent_registry")
      .select(
        "id, scope, organization_id, sector_code, sector_name, agent_code, name, persona_name, avatar_url, avatar_alt, profile_bio, role_title, description, prompt, llm_provider, model_id, status, autonomy_level, requires_human_approval, tools, triggers, schedule_rrule, inngest_event_name, memory_access_level, monthly_budget_credits, updated_at",
      )
      .order("sector_name", { ascending: true })
      .order("name", { ascending: true })
      .limit(120),
    supabase
      .from("agent_runs")
      .select("id, agent_id, organization_id, run_status, trigger_source, output_summary, error_message, cost_credits, started_at, finished_at")
      .order("started_at", { ascending: false })
      .limit(12),
    supabase
      .from("intelligence_events")
      .select("id, scope, organization_id, source_type, event_type, title, summary, confidence, tags, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(20),
    supabase
      .from("intelligence_memory")
      .select("id, scope, organization_id, memory_type, title, content, importance, tags, created_at")
      .order("importance", { ascending: false })
      .limit(20),
    supabase
      .from("whatsapp_instances")
      .select(
        "id, organization_id, provider, provider_instance_id, phone_number, display_name, status, webhook_url, last_heartbeat_at, last_message_at, connected_at, plan_code, organizations(name, plan_code)",
      )
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("content_pipeline_items")
      .select("id, scope, organization_id, content_type, status, title, summary, source_url, scheduled_for, published_at, tags, created_at")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("plan_entitlements")
      .select("id, plan_code, feature_code, label, enabled, value_type, boolean_value, numeric_limit, text_value")
      .order("plan_code", { ascending: true })
      .order("feature_code", { ascending: true })
      .limit(500),
  ]);

  const errors = [
    agentsResult.error,
    runsResult.error,
    eventsResult.error,
    memoryResult.error,
    instancesResult.error,
    contentResult.error,
    entitlementsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    return {
      ...fallbackOverview,
      warnings: errors.map((error) => error?.message ?? "Erro desconhecido ao carregar Admin OS autonomo."),
    };
  }

  const agents = ((agentsResult.data ?? []) as AgentRow[]).map(mapAgent);
  const runs = ((runsResult.data ?? []) as AgentRunRow[]).map(mapAgentRun);
  const intelligenceEvents = ((eventsResult.data ?? []) as IntelligenceEventRow[]).map(mapIntelligenceEvent);
  const intelligenceMemory = ((memoryResult.data ?? []) as IntelligenceMemoryRow[]).map(mapIntelligenceMemory);
  const whatsappInstances = ((instancesResult.data ?? []) as WhatsappInstanceRow[]).map(mapWhatsappInstance);
  const contentPipeline = ((contentResult.data ?? []) as ContentPipelineRow[]).map(mapContentPipelineItem);
  const planEntitlements = ((entitlementsResult.data ?? []) as PlanEntitlementRow[]).map(mapPlanEntitlement);
  const activePlans = new Set(planEntitlements.filter((item) => item.enabled).map((item) => item.planCode)).size;

  return {
    schemaReady: true,
    warnings: [],
    summary: {
      totalAgents: agents.length,
      onlineAgents: agents.filter((agent) => agent.status === "online").length,
      approvalAgents: agents.filter((agent) => agent.requiresHumanApproval || agent.status === "needs_review").length,
      intelligenceMemories: intelligenceMemory.length,
      intelligenceEvents: intelligenceEvents.length,
      whatsappInstances: whatsappInstances.length,
      connectedWhatsapps: whatsappInstances.filter((instance) => instance.status === "connected").length,
      contentItems: contentPipeline.length,
      activePlans,
    },
    agents,
    runs,
    intelligenceEvents,
    intelligenceMemory,
    whatsappInstances,
    contentPipeline,
    planEntitlements,
  };
}

function mapAgent(row: AgentRow): AdminAgent {
  return {
    id: row.id,
    scope: row.scope,
    organizationId: row.organization_id,
    sectorCode: row.sector_code,
    sectorName: row.sector_name,
    agentCode: row.agent_code,
    name: row.name,
    personaName: row.persona_name?.trim() || row.name,
    avatarUrl: row.avatar_url,
    avatarAlt: row.avatar_alt,
    profileBio: row.profile_bio,
    roleTitle: row.role_title,
    description: row.description,
    prompt: row.prompt,
    promptPreview: preview(row.prompt),
    llmProvider: row.llm_provider ?? "gemini",
    modelId: row.model_id,
    status: row.status ?? "draft",
    autonomyLevel: Number(row.autonomy_level ?? 0),
    requiresHumanApproval: row.requires_human_approval !== false,
    tools: toStringArray(row.tools),
    triggers: toStringArray(row.triggers),
    scheduleRrule: row.schedule_rrule,
    inngestEventName: row.inngest_event_name,
    memoryAccessLevel: row.memory_access_level ?? "sector",
    monthlyBudgetCredits: toNullableNumber(row.monthly_budget_credits),
    updatedAt: row.updated_at,
  };
}

function mapAgentRun(row: AgentRunRow): AdminAgentRun {
  return {
    id: row.id,
    agentId: row.agent_id,
    organizationId: row.organization_id,
    runStatus: row.run_status ?? "queued",
    triggerSource: row.trigger_source,
    outputSummary: row.output_summary,
    errorMessage: row.error_message,
    costCredits: toNumber(row.cost_credits),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function mapIntelligenceEvent(row: IntelligenceEventRow): IntelligenceEvent {
  return {
    id: row.id,
    scope: row.scope,
    organizationId: row.organization_id,
    sourceType: row.source_type,
    eventType: row.event_type,
    title: row.title,
    summary: row.summary,
    confidence: toNullableNumber(row.confidence),
    tags: toStringArray(row.tags),
    occurredAt: row.occurred_at,
  };
}

function mapIntelligenceMemory(row: IntelligenceMemoryRow): IntelligenceMemory {
  return {
    id: row.id,
    scope: row.scope,
    organizationId: row.organization_id,
    memoryType: row.memory_type,
    title: row.title,
    content: row.content,
    importance: toNumber(row.importance),
    tags: toStringArray(row.tags),
    createdAt: row.created_at,
  };
}

function mapWhatsappInstance(row: WhatsappInstanceRow): AdminWhatsappInstance {
  const organization = getRelatedOrganization(row.organizations);

  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: organization?.name ?? "Empresa sem nome",
    organizationPlan: organization?.plan_code ?? null,
    provider: row.provider ?? "uazapi",
    providerInstanceId: row.provider_instance_id,
    phoneNumber: row.phone_number,
    displayName: row.display_name,
    status: row.status ?? "draft",
    webhookUrl: row.webhook_url,
    lastHeartbeatAt: row.last_heartbeat_at,
    lastMessageAt: row.last_message_at,
    connectedAt: row.connected_at,
    planCode: row.plan_code,
  };
}

function mapContentPipelineItem(row: ContentPipelineRow): ContentPipelineItem {
  return {
    id: row.id,
    scope: row.scope,
    organizationId: row.organization_id,
    contentType: row.content_type,
    status: row.status ?? "idea",
    title: row.title,
    summary: row.summary,
    sourceUrl: row.source_url,
    scheduledFor: row.scheduled_for,
    publishedAt: row.published_at,
    tags: toStringArray(row.tags),
    createdAt: row.created_at,
  };
}

function mapPlanEntitlement(row: PlanEntitlementRow): PlanEntitlement {
  return {
    id: row.id,
    planCode: row.plan_code,
    featureCode: row.feature_code,
    label: row.label,
    enabled: row.enabled !== false,
    valueType: row.value_type ?? "boolean",
    booleanValue: row.boolean_value,
    numericLimit: toNullableNumber(row.numeric_limit),
    textValue: row.text_value,
  };
}

function getRelatedOrganization(organization: RelatedOrganization) {
  return Array.isArray(organization) ? organization[0] ?? null : organization;
}

function toStringArray(value: string[] | null | undefined) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function preview(value: string | null | undefined) {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
}

const fallbackOverview: AutonomousAdminOverview = {
  schemaReady: false,
  warnings: [],
  summary: {
    totalAgents: 0,
    onlineAgents: 0,
    approvalAgents: 0,
    intelligenceMemories: 0,
    intelligenceEvents: 0,
    whatsappInstances: 0,
    connectedWhatsapps: 0,
    contentItems: 0,
    activePlans: 0,
  },
  agents: [],
  runs: [],
  intelligenceEvents: [],
  intelligenceMemory: [],
  whatsappInstances: [],
  contentPipeline: [],
  planEntitlements: [],
};
