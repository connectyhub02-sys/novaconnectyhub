import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import {
  readLeadProfileImageUrl,
  syncLeadAvatarFromUazapi,
  type LeadAvatarSyncInstance,
} from "@/lib/whatsapp/lead-avatar-sync";
import { readWhatsappInstanceProfileImageUrl } from "@/lib/whatsapp/instance-profile-image";
import {
  resolveConversationMessageMedia,
  type WhatsappMessageMediaKind,
} from "@/lib/whatsapp/message-media";
import { resolveLeadPersonalName } from "@/lib/whatsapp/lead-names";
import { platformWhatsappOrganizationSlug, type ConversationPanelScope } from "@/lib/whatsapp/conversation-panel-scope";
import { listClientCompanies, type ClientCompany } from "./companies";

type JsonRecord = Record<string, unknown>;

type LeadRow = {
  id: string;
  organization_id: string;
  channel: string;
  phone_number: string | null;
  display_name: string | null;
  status: string;
  score: number | null;
  source: string | null;
  last_event_summary: string | null;
  last_message_at: string | null;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

type ConversationRow = {
  id: string;
  organization_id: string;
  lead_id: string | null;
  whatsapp_instance_id: string | null;
  channel: string;
  provider: string;
  provider_chat_id: string | null;
  status: string;
  last_message_preview: string | null;
  last_message_at: string | null;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

type MessageRow = {
  id: string;
  organization_id: string;
  conversation_id: string | null;
  lead_id: string | null;
  whatsapp_instance_id: string | null;
  provider: string;
  provider_message_id: string | null;
  provider_chat_id: string | null;
  direction: "inbound" | "outbound" | "system" | "unknown";
  message_type: string | null;
  text_content: string | null;
  payload: JsonRecord | null;
  occurred_at: string | null;
  created_at: string | null;
};

type IntelligenceEventRow = {
  id: string;
  organization_id: string | null;
  source_type: string;
  source_id: string | null;
  event_type: string;
  title: string;
  summary: string | null;
  tags: string[] | null;
  payload: JsonRecord | null;
  occurred_at: string | null;
};

type AgentRow = {
  id: string;
  organization_id: string | null;
  name: string;
  persona_name: string | null;
  avatar_url: string | null;
  metadata: JsonRecord | null;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string | null;
  plan_code: string;
  status: string;
  created_at: string | null;
};

type WhatsappInstanceAvatarRow = LeadAvatarSyncInstance & {
  id: string;
  instance_token_encrypted: string | null;
  metadata: JsonRecord | null;
};

type WhatsappInstanceQueueRow = {
  id: string;
  organization_id: string;
  connectyhub_api_client_id: string | null;
  connectyhub_api_visibility: string | null;
  phone_number: string | null;
  display_name: string | null;
  status: string | null;
  metadata: JsonRecord | null;
};

type AdminLeadCrmWorkspaceScope = "all" | ConversationPanelScope;

export type ClientLeadStatus = "new" | "active" | "qualified" | "won" | "lost" | "archived";

export type ClientLeadMessageDirection = "inbound" | "outbound" | "system" | "unknown";

export type ClientLeadMessageAuthor = "lead" | "ai" | "human" | "system" | "unknown";

export type ClientLeadQuotedMessage = {
  providerMessageId: string | null;
  direction: ClientLeadMessageDirection | null;
  authorLabel: string | null;
  type: string | null;
  text: string;
};

export type ClientLeadMessage = {
  id: string;
  direction: ClientLeadMessageDirection;
  author: ClientLeadMessageAuthor;
  authorLabel: string;
  authorSource: string;
  agentRunId: string | null;
  agentId: string | null;
  provider: string;
  providerMessageId: string | null;
  providerChatId: string | null;
  type: string;
  text: string;
  quotedMessage: ClientLeadQuotedMessage | null;
  mediaKind: WhatsappMessageMediaKind;
  mediaMimeType: string | null;
  mediaFileName: string | null;
  mediaTranscription: {
    provider: string | null;
    model: string | null;
    mimeType: string | null;
    byteLength: number | null;
    transcribedAt: string | null;
  } | null;
  mediaUrl: string | null;
  occurredAt: string | null;
};

export type ClientLeadActivity = {
  id: string;
  title: string;
  summary: string;
  type: string;
  occurredAt: string | null;
  tone: "cyan" | "green" | "amber" | "rose" | "zinc";
};

export type ClientLeadConversationFile = {
  id: string;
  whatsappInstanceId: string | null;
  whatsappInstanceName: string | null;
  whatsappInstancePhone: string | null;
  whatsappInstanceStatus: string | null;
  agentId: string | null;
  agentName: string | null;
  agentAvatarUrl: string | null;
  channel: string;
  provider: string;
  providerChatId: string | null;
  status: string | null;
  preview: string | null;
  messageCount: number;
  messages: ClientLeadMessage[];
  humanIntervention: ClientLeadHumanIntervention;
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
};

export type ClientLeadHumanIntervention = {
  active: boolean;
  pausedUntil: string | null;
  reason: string | null;
  source: string | null;
  updatedAt: string | null;
};

export type ClientLeadRecord = {
  id: string;
  companyId: string;
  companyName: string;
  companyPlan: string;
  agentName: string | null;
  agentAvatarUrl: string | null;
  avatarUrl: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  status: ClientLeadStatus;
  score: number;
  channel: string;
  source: string;
  summary: string;
  qualification: {
    purpose: string | null;
    budget: string | null;
    timeframe: string | null;
    objections: string | null;
    mainPain: string | null;
    volumeOrContext: string | null;
    decisionAuthority: string | null;
    nextStepAcceptance: string | null;
    temperature: "cold" | "warm" | "hot" | "vip" | null;
    nextBestQuestion: string | null;
    nextBestAction: string | null;
    answeredQuestionIds: string[];
    missingQuestionIds: string[];
    updatedAt: string | null;
    fields: Array<{
      key: string;
      label: string;
      value: string;
    }>;
  };
  technical: {
    origin: string;
    device: string | null;
    browser: string | null;
    os: string | null;
    location: string | null;
    ipAddress: string | null;
    lastClick: string | null;
  };
  conversation: {
    id: string | null;
    whatsappInstanceId: string | null;
    whatsappInstanceName: string | null;
    whatsappInstancePhone: string | null;
    whatsappInstanceStatus: string | null;
    agentId: string | null;
    agentName: string | null;
    agentAvatarUrl: string | null;
    status: string | null;
    preview: string | null;
    messageCount: number;
    messages: ClientLeadMessage[];
    humanIntervention: ClientLeadHumanIntervention;
  };
  leadFile: {
    conversationCount: number;
    messageCount: number;
    trackingEventCount: number;
    intelligenceEventCount: number;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
    conversations: ClientLeadConversationFile[];
    trackingEvents: ClientLeadActivity[];
    intelligenceEvents: ClientLeadActivity[];
  };
  activities: ClientLeadActivity[];
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
};

export type ClientLeadAttendanceQueue = {
  key: string;
  companyId: string;
  agentId: string | null;
  whatsappInstanceId: string | null;
  label: string;
  detail: string | null;
  phone: string | null;
  status: string | null;
  avatarUrl: string | null;
};

export type ClientLeadCrmWorkspace = {
  companies: ClientCompany[];
  attendanceQueues: ClientLeadAttendanceQueue[];
  leads: ClientLeadRecord[];
  stats: {
    total: number;
    new: number;
    active: number;
    qualified: number;
    converted: number;
    archived: number;
  };
  warnings?: string[];
};

type LeadCrmLoadOptions = {
  includeEvents?: boolean;
  leadLimit?: number;
  messageLimit?: number;
  syncAvatars?: boolean;
};

export async function getClientLeadCrmWorkspace(input: {
  userId: string;
  organizationId?: string | null;
  company?: ClientCompany | null;
  client?: SupabaseClient;
} & LeadCrmLoadOptions): Promise<ClientLeadCrmWorkspace> {
  const client = input.client ?? createServiceClient();
  let companies: ClientCompany[];

  try {
    companies = await listClientCompanies(input.userId, client);
  } catch (error) {
    return buildEmptyWorkspace([], [toLoadWarning("empresas", error)]);
  }

  const resolvedCompanies = resolveClientWorkspaceCompanies({
    companies,
    organizationId: input.organizationId,
    company: input.company,
  });

  if (resolvedCompanies.warning) {
    return buildEmptyWorkspace(resolvedCompanies.companies, [resolvedCompanies.warning]);
  }

  return getLeadCrmWorkspaceForCompanies({
    client,
    companies: resolvedCompanies.companies,
    includeEvents: input.includeEvents,
    leadLimit: input.leadLimit,
    messageLimit: input.messageLimit,
    syncAvatars: input.syncAvatars,
  });
}

export async function getAdminLeadCrmWorkspace(input: {
  client?: SupabaseClient;
  limit?: number;
  scope?: AdminLeadCrmWorkspaceScope;
} & LeadCrmLoadOptions = {}): Promise<ClientLeadCrmWorkspace> {
  const client = input.client ?? createServiceClient();
  const scope = input.scope ?? "all";
  let organizationRows: OrganizationRow[] = [];

  try {
    let organizationsQuery = client
      .from("organizations")
      .select("id, name, slug, plan_code, status, created_at")
      .order("created_at", { ascending: false });

    if (scope === "platform_internal") {
      organizationsQuery = organizationsQuery
        .eq("slug", platformWhatsappOrganizationSlug)
        .limit(1);
    } else {
      organizationsQuery = organizationsQuery.limit(500);
    }

    const organizationsResult = await organizationsQuery;

    if (organizationsResult.error) {
      return buildEmptyWorkspace([], [toLoadWarning("organizacoes", organizationsResult.error)]);
    }

    organizationRows = (organizationsResult.data ?? []) as OrganizationRow[];
  } catch (error) {
    return buildEmptyWorkspace([], [toLoadWarning("organizacoes", error)]);
  }

  const companies = organizationRows.map((organization) => ({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    brandLogoUrl: null,
    brandLogoAlt: organization.name,
    planCode: organization.plan_code,
    status: organization.status,
    role: "platform_admin",
    createdAt: organization.created_at,
  } satisfies ClientCompany));

  return getLeadCrmWorkspaceForCompanies({
    client,
    companies,
    includeEvents: input.includeEvents,
    leadLimit: input.limit ?? 300,
    messageLimit: input.messageLimit,
    syncAvatars: input.syncAvatars,
  });
}

function buildEmptyWorkspace(companies: ClientCompany[], warnings: string[] = []): ClientLeadCrmWorkspace {
  return {
    companies,
    attendanceQueues: [],
    leads: [],
    stats: {
      total: 0,
      new: 0,
      active: 0,
      qualified: 0,
      converted: 0,
      archived: 0,
    },
    ...(warnings.length ? { warnings } : {}),
  };
}

function resolveClientWorkspaceCompanies(input: {
  companies: ClientCompany[];
  organizationId?: string | null;
  company?: ClientCompany | null;
}) {
  let companies = input.companies;
  const trustedCompany = input.company ?? null;

  if (trustedCompany && input.organizationId && trustedCompany.id !== input.organizationId) {
    return {
      companies: [],
      warning: "Empresa selecionada nao corresponde ao workspace atual.",
    };
  }

  if (trustedCompany) {
    if (!companies.some((company) => company.id === trustedCompany.id)) {
      companies = [trustedCompany, ...companies];
    }

    return {
      companies: [trustedCompany],
      warning: null,
    };
  }

  if (input.organizationId) {
    const selectedCompany = companies.find((company) => company.id === input.organizationId) ?? null;

    if (!selectedCompany) {
      return {
        companies: [],
        warning: "Empresa selecionada nao esta vinculada a sua conta.",
      };
    }

    return {
      companies: [selectedCompany],
      warning: null,
    };
  }

  return {
    companies,
    warning: null,
  };
}

async function getLeadCrmWorkspaceForCompanies(input: {
  client: SupabaseClient;
  companies: ClientCompany[];
  includeEvents?: boolean;
  leadLimit?: number;
  messageLimit?: number;
  syncAvatars?: boolean;
}): Promise<ClientLeadCrmWorkspace> {
  const companyIds = input.companies.map((company) => company.id);

  if (!companyIds.length) {
    return buildEmptyWorkspace(input.companies);
  }

  const warnings: string[] = [];
  let leadRows: LeadRow[] = [];
  let conversationRows: ConversationRow[] = [];
  let agentRows: AgentRow[] = [];
  let whatsappInstanceRows: WhatsappInstanceQueueRow[] = [];
  let eventRows: IntelligenceEventRow[] = [];

  try {
    const [agentsResult, whatsappInstancesResult] = await Promise.all([
      input.client
        .from("agent_registry")
        .select("id, organization_id, name, persona_name, avatar_url, metadata")
        .eq("scope", "organization")
        .in("organization_id", companyIds)
        .contains("metadata", { client_created: true, agent_kind: "whatsapp" })
        .order("updated_at", { ascending: false })
        .limit(240),
      input.client
        .from("whatsapp_instances")
        .select("id, organization_id, connectyhub_api_client_id, connectyhub_api_visibility, phone_number, display_name, status, metadata")
        .in("organization_id", companyIds)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(240),
    ]);

    if (agentsResult.error) {
      warnings.push(toLoadWarning("agentes", agentsResult.error));
    } else {
      agentRows = (agentsResult.data ?? []) as AgentRow[];
    }

    if (whatsappInstancesResult.error) {
      warnings.push(toLoadWarning("instancias WhatsApp", whatsappInstancesResult.error));
    } else {
      whatsappInstanceRows = (whatsappInstancesResult.data ?? []) as WhatsappInstanceQueueRow[];
    }

    if (input.includeEvents ?? true) {
      const eventsResult = await input.client
        .from("intelligence_events")
        .select("id, organization_id, source_type, source_id, event_type, title, summary, tags, payload, occurred_at")
        .in("organization_id", companyIds)
        .order("occurred_at", { ascending: false })
        .limit(1200);

      if (eventsResult.error) {
        warnings.push(toLoadWarning("eventos dos leads", eventsResult.error));
      } else {
        eventRows = (eventsResult.data ?? []) as IntelligenceEventRow[];
      }
    }
  } catch (error) {
    warnings.push(toLoadWarning("dados complementares dos leads", error));
  }

  const leadCrmWhatsappInstanceRows = whatsappInstanceRows.filter(isLeadCrmWhatsappInstance);
  const leadCrmWhatsappInstanceIds = leadCrmWhatsappInstanceRows.map((instance) => instance.id);

  try {
    if (leadCrmWhatsappInstanceIds.length) {
      const leadLimit = input.leadLimit ?? 160;
      const conversationLimit = Math.max(leadLimit, leadLimit * 2);
      const conversationsResult = await input.client
        .from("conversations")
        .select("id, organization_id, lead_id, whatsapp_instance_id, channel, provider, provider_chat_id, status, last_message_preview, last_message_at, metadata, created_at, updated_at")
        .in("organization_id", companyIds)
        .in("whatsapp_instance_id", leadCrmWhatsappInstanceIds)
        .not("lead_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(conversationLimit);

      if (conversationsResult.error) {
        warnings.push(toLoadWarning("conversas", conversationsResult.error));
      } else {
        conversationRows = (conversationsResult.data ?? []) as ConversationRow[];
      }
    }
  } catch (error) {
    warnings.push(toLoadWarning("conversas", error));
  }

  const leadIds = uniqueStrings(conversationRows.map((conversation) => conversation.lead_id));

  try {
    if (leadIds.length) {
      const leadsResult = await input.client
        .from("leads")
        .select("id, organization_id, channel, phone_number, display_name, status, score, source, last_event_summary, last_message_at, metadata, created_at, updated_at")
        .in("organization_id", companyIds)
        .in("id", leadIds)
        .order("updated_at", { ascending: false })
        .limit(input.leadLimit ?? 160);

      if (leadsResult.error) {
        warnings.push(toLoadWarning("leads", leadsResult.error));
      } else {
        leadRows = (leadsResult.data ?? []) as LeadRow[];
      }
    }
  } catch (error) {
    warnings.push(toLoadWarning("leads", error));
  }

  const loadedLeadIds = new Set(leadRows.map((lead) => lead.id));
  conversationRows = conversationRows.filter((conversation) => (
    Boolean(conversation.lead_id) && loadedLeadIds.has(conversation.lead_id as string)
  ));

  const conversationIds = conversationRows.map((conversation) => conversation.id);
  let messageRows: MessageRow[] = [];

  try {
    if (conversationIds.length) {
      const messagesResult = await loadConversationMessageRows({
        client: input.client,
        companyIds,
        conversationIds,
        messageLimit: input.messageLimit,
      });

      messageRows = messagesResult.rows;
      warnings.push(...messagesResult.warnings);
    }
  } catch (error) {
    warnings.push(toLoadWarning("mensagens", error));
  }

  const companyById = new Map(input.companies.map((company) => [company.id, company]));
  const agentByOrgId = new Map<string, AgentRow>();
  const agentById = new Map(agentRows.map((agent) => [agent.id, agent]));
  const whatsappInstanceById = new Map(leadCrmWhatsappInstanceRows.map((instance) => [instance.id, instance]));
  let syncedAvatarMetadata = new Map<string, JsonRecord>();

  if (input.syncAvatars ?? true) {
    try {
      syncedAvatarMetadata = await syncMissingLeadAvatarsForCrm({
        client: input.client,
        leads: leadRows,
        conversations: conversationRows,
      });
    } catch (error) {
      warnings.push(toLoadWarning("fotos dos leads", error));
    }
  }

  const hydratedLeadRows = leadRows.map((lead) => {
    const metadata = syncedAvatarMetadata.get(lead.id);

    return metadata ? { ...lead, metadata } : lead;
  });

  for (const agent of agentRows) {
    if (agent.organization_id && !agentByOrgId.has(agent.organization_id)) {
      agentByOrgId.set(agent.organization_id, agent);
    }
  }

  const conversationsByLead = groupBy(conversationRows, (conversation) => conversation.lead_id ?? "none");
  const messagesByConversation = groupBy(messageRows, (message) => message.conversation_id ?? "none");
  const leads = hydratedLeadRows.map((lead) => {
    const company = companyById.get(lead.organization_id);
    const conversations = conversationsByLead.get(lead.id) ?? [];
    const events = matchLeadEvents(lead, conversations, eventRows);
    const agent = agentByOrgId.get(lead.organization_id) ?? null;

    return mapLeadRecord({
      lead,
      company,
      agent,
      conversations,
      agentById,
      whatsappInstanceById,
      messagesByConversation,
      events,
    });
  });

  return {
    companies: input.companies,
    attendanceQueues: buildAttendanceQueues({
      agents: agentRows,
      companies: input.companies,
      instances: leadCrmWhatsappInstanceRows,
    }),
    leads,
    stats: buildStats(leads),
    ...(warnings.length ? { warnings } : {}),
  };
}

function toLoadWarning(scope: string, error: unknown) {
  logLeadCrmLoadError(scope, error);
  return `Nao foi possivel atualizar ${scope} agora. Tente novamente em instantes.`;
}

function logLeadCrmLoadError(scope: string, error: unknown) {
  console.error(`[LeadCRM] Falha ao carregar ${scope}`, error);
}

const conversationMessageColumns = "id, organization_id, conversation_id, lead_id, whatsapp_instance_id, provider, provider_message_id, provider_chat_id, direction, message_type, text_content, payload, occurred_at, created_at";
const conversationMessageSlimColumns = "id, organization_id, conversation_id, lead_id, whatsapp_instance_id, provider, provider_message_id, provider_chat_id, direction, message_type, text_content, occurred_at, created_at";

async function loadConversationMessageRows(input: {
  client: SupabaseClient;
  companyIds: string[];
  conversationIds: string[];
  messageLimit?: number;
}): Promise<{ rows: MessageRow[]; warnings: string[] }> {
  const rows: MessageRow[] = [];
  const failedConversationIds: string[] = [];

  for (const batch of chunkArray(input.conversationIds, 8)) {
    const results = await Promise.all(
      batch.map((conversationId) => loadMessagesForConversation({
        client: input.client,
        companyIds: input.companyIds,
        conversationId,
        messageLimit: input.messageLimit,
      })),
    );

    for (const result of results) {
      rows.push(...result.rows);

      if (result.error) {
        failedConversationIds.push(result.conversationId);
      }
    }
  }

  const seen = new Set<string>();
  const dedupedRows = rows.filter((row) => {
    if (seen.has(row.id)) {
      return false;
    }

    seen.add(row.id);
    return true;
  });

  dedupedRows.sort((a, b) => compareDateAsc(a.occurred_at ?? a.created_at, b.occurred_at ?? b.created_at));

  return {
    rows: dedupedRows,
    warnings: failedConversationIds.length
      ? ["Algumas mensagens antigas nao carregaram nesta tentativa. As demais conversas continuam disponiveis."]
      : [],
  };
}

async function loadMessagesForConversation(input: {
  client: SupabaseClient;
  companyIds: string[];
  conversationId: string;
  messageLimit?: number;
}): Promise<{ conversationId: string; rows: MessageRow[]; error: unknown | null }> {
  const messageLimit = input.messageLimit ?? 120;
  const queryMessages = (columns: string) => input.client
    .from("conversation_messages")
    .select(columns)
    .in("organization_id", input.companyIds)
    .eq("conversation_id", input.conversationId)
    .order("occurred_at", { ascending: false })
    .limit(messageLimit);
  const fullResult = await queryMessages(conversationMessageColumns);

  if (!fullResult.error) {
    return {
      conversationId: input.conversationId,
      rows: ((fullResult.data ?? []) as unknown as MessageRow[]).reverse(),
      error: null,
    };
  }

  logLeadCrmLoadError(`mensagens da conversa ${input.conversationId}`, fullResult.error);

  const slimResult = await queryMessages(conversationMessageSlimColumns);

  if (!slimResult.error) {
    return {
      conversationId: input.conversationId,
      rows: ((slimResult.data ?? []) as unknown as Array<Omit<MessageRow, "payload">>).reverse().map((row) => ({
        ...row,
        payload: null,
      })),
      error: null,
    };
  }

  logLeadCrmLoadError(`mensagens leves da conversa ${input.conversationId}`, slimResult.error);

  return {
    conversationId: input.conversationId,
    rows: [],
    error: slimResult.error,
  };
}

function isLeadCrmWhatsappInstance(instance: WhatsappInstanceQueueRow) {
  const metadata = readRecord(instance.metadata) ?? {};
  const visibility = (instance.connectyhub_api_visibility ?? "").toLowerCase();
  const createdFrom = readString(metadata.created_from)?.toLowerCase();

  if (visibility === "api_customer") {
    return false;
  }

  if (instance.connectyhub_api_client_id || metadata.api_gateway === true) {
    return false;
  }

  return metadata.client_agent === true
    || Boolean(readString(metadata.agent_id))
    || createdFrom === "client_dashboard";
}

async function syncMissingLeadAvatarsForCrm(input: {
  client: SupabaseClient;
  leads: LeadRow[];
  conversations: ConversationRow[];
}) {
  const updatedMetadata = new Map<string, JsonRecord>();
  const conversationsByLead = groupBy(input.conversations, (conversation) => conversation.lead_id ?? "none");
  const candidates = input.leads
    .filter((lead) => {
      if (!lead.phone_number || readLeadProfileImageUrl(lead.metadata)) {
        return false;
      }

      return (conversationsByLead.get(lead.id) ?? []).some((conversation) => Boolean(conversation.whatsapp_instance_id));
    })
    .slice(0, 6);

  if (!candidates.length) {
    return updatedMetadata;
  }

  const instanceIds = Array.from(
    new Set(
      candidates.flatMap((lead) =>
        (conversationsByLead.get(lead.id) ?? [])
          .map((conversation) => conversation.whatsapp_instance_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ),
  );

  if (!instanceIds.length) {
    return updatedMetadata;
  }

  const organizationIds = Array.from(new Set(input.leads.map((lead) => lead.organization_id).filter(Boolean)));
  const { data, error } = await input.client
    .from("whatsapp_instances")
    .select("id, instance_token_encrypted, metadata")
    .in("organization_id", organizationIds)
    .in("id", instanceIds);

  if (error) {
    return updatedMetadata;
  }

  const instanceById = new Map(
    ((data ?? []) as WhatsappInstanceAvatarRow[]).map((instance) => [instance.id, instance]),
  );

  for (const lead of candidates) {
    const conversation = (conversationsByLead.get(lead.id) ?? [])
      .find((item) => item.whatsapp_instance_id && instanceById.has(item.whatsapp_instance_id));
    const instance = conversation?.whatsapp_instance_id ? instanceById.get(conversation.whatsapp_instance_id) ?? null : null;

    if (!instance?.instance_token_encrypted) {
      continue;
    }

    const metadata = await syncLeadAvatarFromUazapi({
      client: input.client,
      leadId: lead.id,
      phoneNumber: lead.phone_number,
      providerChatId: conversation?.provider_chat_id ?? null,
      instance,
      existingMetadata: readRecord(lead.metadata),
    }).catch(() => null);

    if (metadata) {
      updatedMetadata.set(lead.id, metadata);
    }
  }

  return updatedMetadata;
}

function mapLeadRecord(input: {
  lead: LeadRow;
  company?: ClientCompany;
  agent: AgentRow | null;
  conversations: ConversationRow[];
  agentById: Map<string, AgentRow>;
  whatsappInstanceById: Map<string, WhatsappInstanceQueueRow>;
  messagesByConversation: Map<string, MessageRow[]>;
  events: IntelligenceEventRow[];
}): ClientLeadRecord {
  const metadata = readRecord(input.lead.metadata) ?? {};
  const eventMetadata = mergeEventPayloads(input.events);
  const activeConversation = pickActiveConversation(input.conversations);
  const avatarUrl = readLeadProfileImageUrl(metadata)
    ?? readLeadProfileImageUrl(eventMetadata)
    ?? readLeadProfileImageUrl(input.conversations.map((conversation) => conversation.metadata));
  const name = resolveLeadPersonalName({
    displayName: input.lead.display_name,
    metadata,
  }) ?? fallbackLeadName(input.lead.phone_number);
  const email = readString(metadata.email) ?? readString(metadata.lead_email);
  const source = readString(input.lead.source) ?? readString(metadata.source) ?? input.lead.channel ?? "whatsapp";
  const qualificationMetadata = readRecord(metadata.qualification) ?? {};
  const leadQualification = readRecord(metadata.lead_qualification) ?? {};
  const qualification = {
    purpose: readString(qualificationMetadata.purpose) ?? readString(metadata.purpose) ?? readString(metadata.finality) ?? readString(metadata.finalidade) ?? readString(metadata.lead_purpose),
    budget: readString(qualificationMetadata.budget) ?? readString(metadata.budget) ?? readString(metadata.investment) ?? readString(metadata.investimento) ?? readString(metadata.lead_budget),
    timeframe: readString(qualificationMetadata.timeframe) ?? readString(metadata.timeframe) ?? readString(metadata.deadline) ?? readString(metadata.prazo) ?? readString(metadata.lead_timeframe),
    objections: readString(qualificationMetadata.objections) ?? readString(metadata.objections) ?? readString(metadata.objection) ?? readString(metadata.objecoes),
    mainPain: readString(qualificationMetadata.main_pain) ?? readString(metadata.main_pain),
    volumeOrContext: readString(qualificationMetadata.volume_or_context) ?? readString(metadata.volume_or_context),
    decisionAuthority: readString(qualificationMetadata.decision_authority) ?? readString(metadata.decision_authority),
    nextStepAcceptance: readString(qualificationMetadata.next_step_acceptance) ?? readString(metadata.next_step_acceptance),
    temperature: normalizeTemperature(readString(leadQualification.temperature) ?? readString(metadata.lead_temperature)),
    nextBestQuestion: readString(leadQualification.next_best_question),
    nextBestAction: readString(leadQualification.next_best_action),
    answeredQuestionIds: readStringList(leadQualification.answered_question_ids),
    missingQuestionIds: readStringList(leadQualification.missing_question_ids),
    updatedAt: readString(leadQualification.updated_at) ?? readString(metadata.last_qualification_updated_at),
    fields: mapQualificationFields(qualificationMetadata),
  };
  const device = readString(metadata.device_type) ?? readString(metadata.device) ?? readString(eventMetadata.device_type);
  const browser = readString(metadata.browser) ?? readString(eventMetadata.browser);
  const os = readString(metadata.os) ?? readString(eventMetadata.os);
  const location = formatLocation([
    readString(metadata.city) ?? readString(eventMetadata.city),
    readString(metadata.region) ?? readString(eventMetadata.region),
    readString(metadata.country) ?? readString(eventMetadata.country),
  ]);
  const ipAddress = readString(metadata.ip_address) ?? readString(metadata.ip) ?? readString(eventMetadata.ip_address);
  const latestClick = input.events.find((event) => event.event_type === "tracked_link.clicked");
  const summary = readString(metadata.ai_summary)
    ?? readString(metadata.summary)
    ?? input.lead.last_event_summary
    ?? activeConversation?.last_message_preview
    ?? "Ainda sem resumo automatico.";
  const conversationFiles = buildConversationFiles({
    agentById: input.agentById,
    conversations: input.conversations,
    messagesByConversation: input.messagesByConversation,
    whatsappInstanceById: input.whatsappInstanceById,
  });
  const activeConversationFile = activeConversation
    ? conversationFiles.find((conversation) => conversation.id === activeConversation.id) ?? null
    : conversationFiles[0] ?? null;
  const messages = activeConversationFile?.messages ?? [];
  const humanIntervention = activeConversationFile?.humanIntervention ?? emptyHumanIntervention();
  const activities = buildActivities(input.lead, input.conversations, input.events);
  const trackingEvents = activities.filter(isTrackingActivity);
  const intelligenceEvents = activities.filter((activity) => !isTrackingActivity(activity));
  const messageDates = conversationFiles.flatMap((conversation) => conversation.messages.map((message) => message.occurredAt));
  const fileDates = [
    input.lead.created_at,
    input.lead.updated_at,
    input.lead.last_message_at,
    ...input.conversations.flatMap((conversation) => [conversation.created_at, conversation.updated_at, conversation.last_message_at]),
    ...input.events.map((event) => event.occurred_at),
    ...messageDates,
  ];
  const companyName = input.company?.name ?? "Empresa sem nome";

  return {
    id: input.lead.id,
    companyId: input.lead.organization_id,
    companyName,
    companyPlan: input.company ? `${input.company.planCode} / ${input.company.status}` : "sem plano",
    agentName: readString(input.agent?.persona_name) ?? input.agent?.name ?? null,
    agentAvatarUrl: activeConversationFile?.agentAvatarUrl ?? input.agent?.avatar_url ?? null,
    avatarUrl,
    name,
    phone: input.lead.phone_number,
    email,
    status: normalizeLeadStatus(input.lead.status),
    score: clampScore(input.lead.score),
    channel: input.lead.channel,
    source,
    summary,
    qualification,
    technical: {
      origin: source,
      device,
      browser,
      os,
      location,
      ipAddress,
      lastClick: latestClick?.occurred_at ?? null,
    },
    conversation: {
      id: activeConversationFile?.id ?? null,
      whatsappInstanceId: activeConversationFile?.whatsappInstanceId ?? null,
      whatsappInstanceName: activeConversationFile?.whatsappInstanceName ?? null,
      whatsappInstancePhone: activeConversationFile?.whatsappInstancePhone ?? null,
      whatsappInstanceStatus: activeConversationFile?.whatsappInstanceStatus ?? null,
      agentId: activeConversationFile?.agentId ?? null,
      agentName: activeConversationFile?.agentName ?? null,
      agentAvatarUrl: activeConversationFile?.agentAvatarUrl ?? null,
      status: activeConversationFile?.status ?? null,
      preview: activeConversationFile?.preview ?? null,
      messageCount: messages.length,
      messages,
      humanIntervention,
    },
    leadFile: {
      conversationCount: conversationFiles.length,
      messageCount: conversationFiles.reduce((total, conversation) => total + conversation.messageCount, 0),
      trackingEventCount: trackingEvents.length,
      intelligenceEventCount: intelligenceEvents.length,
      firstSeenAt: pickDate(fileDates, "asc"),
      lastSeenAt: pickDate(fileDates, "desc"),
      conversations: conversationFiles,
      trackingEvents,
      intelligenceEvents,
    },
    activities,
    createdAt: input.lead.created_at,
    updatedAt: input.lead.updated_at,
    lastMessageAt: input.lead.last_message_at ?? activeConversationFile?.lastMessageAt ?? null,
  };
}

function buildAttendanceQueues(input: {
  agents: AgentRow[];
  companies: ClientCompany[];
  instances: WhatsappInstanceQueueRow[];
}): ClientLeadAttendanceQueue[] {
  const agentById = new Map(input.agents.map((agent) => [agent.id, agent]));
  const companyById = new Map(input.companies.map((company) => [company.id, company]));
  const agentIdsWithInstance = new Set<string>();
  const seenKeys = new Set<string>();
  const queues: ClientLeadAttendanceQueue[] = [];

  const pushQueue = (queue: ClientLeadAttendanceQueue) => {
    if (seenKeys.has(queue.key)) {
      return;
    }

    seenKeys.add(queue.key);
    queues.push(queue);
  };

  for (const instance of input.instances) {
    const metadata = readRecord(instance.metadata) ?? {};
    const agentId = readString(metadata.agent_id);
    const agent = agentId ? agentById.get(agentId) ?? null : null;
    const company = companyById.get(instance.organization_id);
    const label = readString(metadata.agent_name)
      ?? readString(agent?.persona_name)
      ?? agent?.name
      ?? instance.display_name
      ?? instance.phone_number
      ?? "WhatsApp";
    const detail = formatLocation([
      instance.display_name,
      instance.phone_number,
      company?.name ?? null,
    ]);

    if (agentId) {
      agentIdsWithInstance.add(agentId);
    }

    pushQueue({
      key: `instance:${instance.id}`,
      companyId: instance.organization_id,
      agentId,
      whatsappInstanceId: instance.id,
      label,
      detail,
      phone: instance.phone_number,
      status: instance.status,
      avatarUrl: readWhatsappInstanceAvatarUrl(instance) ?? agent?.avatar_url ?? null,
    });
  }

  for (const agent of input.agents) {
    if (!agent.organization_id || agentIdsWithInstance.has(agent.id)) {
      continue;
    }

    const company = companyById.get(agent.organization_id);

    pushQueue({
      key: `agent:${agent.id}`,
      companyId: agent.organization_id,
      agentId: agent.id,
      whatsappInstanceId: null,
      label: readString(agent.persona_name) ?? agent.name,
      detail: company ? `${company.name} / Sem WhatsApp conectado` : "Sem WhatsApp conectado",
      phone: null,
      status: null,
      avatarUrl: agent.avatar_url,
    });
  }

  return queues.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

function readWhatsappInstanceAvatarUrl(instance: WhatsappInstanceQueueRow | null | undefined) {
  return readWhatsappInstanceProfileImageUrl(instance?.metadata);
}

function mapMessage(row: MessageRow, conversationMessages: MessageRow[] = []): ClientLeadMessage {
  const payload = readRecord(row.payload) ?? {};
  const author = resolveMessageAuthor(row, payload);
  const media = resolveConversationMessageMedia(row, {
    proxyBasePath: "/api/dashboard/attendance/media",
  });
  const quotedMessage = buildQuotedMessagePreview(row, conversationMessages);

  return {
    id: row.id,
    direction: row.direction,
    author: author.type,
    authorLabel: author.label,
    authorSource: author.source,
    agentRunId: readString(payload.agent_run_id),
    agentId: readString(payload.agent_id),
    provider: row.provider,
    providerMessageId: row.provider_message_id,
    providerChatId: row.provider_chat_id,
    type: row.message_type ?? "text",
    text: readMessageText(row, payload, media.url ?? media.directUrl, media.kind) ?? "Mensagem sem texto.",
    quotedMessage,
    mediaKind: media.kind,
    mediaMimeType: media.mimeType,
    mediaFileName: media.fileName,
    mediaTranscription: media.transcription,
    mediaUrl: media.url,
    occurredAt: row.occurred_at ?? row.created_at,
  };
}

function readMessageText(row: MessageRow, payload = readRecord(row.payload) ?? {}, mediaUrl: string | null = null, mediaKind: WhatsappMessageMediaKind = "unknown") {
  return readString(row.text_content)
    ?? readString(payload.text)
    ?? readString(payload.body)
    ?? readString(payload.caption)
    ?? (mediaUrl ? `${formatMessageMediaKind(mediaKind, row.message_type)} recebido.` : null);
}

function formatMessageMediaKind(kind: WhatsappMessageMediaKind, fallbackType: string | null) {
  if (kind === "audio") return "Áudio";
  if (kind === "image") return "Imagem";
  if (kind === "video") return "Vídeo";
  if (kind === "document") return "Documento";
  return fallbackType && fallbackType !== "text" ? fallbackType : "Mídia";
}

function buildQuotedMessagePreview(row: MessageRow, conversationMessages: MessageRow[]): ClientLeadQuotedMessage | null {
  const payload = readRecord(row.payload);
  if (!payload) return null;

  const quotedProviderMessageId = findQuotedProviderMessageId(payload);
  const directText =
    findNestedQuotedMessageContext(payload, "quotedMsg") ??
    findNestedQuotedMessageContext(payload, "quotedMessage") ??
    findNestedQuotedMessageContext(payload, "contextInfo");
  const referencedMessage = quotedProviderMessageId
    ? findQuotedMessageByProviderId(conversationMessages, quotedProviderMessageId, row.id)
    : null;
  const referencedPayload = readRecord(referencedMessage?.payload) ?? {};
  const referencedAuthor = referencedMessage ? resolveMessageAuthor(referencedMessage, referencedPayload) : null;
  const referencedText = referencedMessage ? readMessageText(referencedMessage, referencedPayload) : null;
  const text = directText ?? referencedText;

  if (!text) {
    return null;
  }

  return {
    providerMessageId: referencedMessage?.provider_message_id ?? quotedProviderMessageId ?? null,
    direction: referencedMessage?.direction ?? null,
    authorLabel: referencedAuthor?.label ?? null,
    type: referencedMessage?.message_type ?? findQuotedMessageType(payload),
    text: text.trim().slice(0, 500),
  };
}

function findNestedQuotedMessageContext(payload: JsonRecord, rootKey: string): string | null {
  for (const [key, value] of Object.entries(payload)) {
    if (key.toLowerCase() === rootKey.toLowerCase() && readRecord(value)) {
      return describeQuotedMessageContext(value as JsonRecord);
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const itemRecord = readRecord(item);
        if (!itemRecord) continue;

        const found = findNestedQuotedMessageContext(itemRecord, rootKey);
        if (found) return found;
      }
    }

    const record = readRecord(value);
    if (record) {
      const found = findNestedQuotedMessageContext(record, rootKey);
      if (found) return found;
    }
  }

  return null;
}

function describeQuotedMessageContext(value: JsonRecord): string | null {
  const text = readQuotedMessageText(value);

  if (text) {
    return text;
  }

  const mediaKind = detectQuotedPayloadMediaKind(value);

  if (mediaKind) {
    const caption = findString(value, ["caption", "fileName", "filename", "title", "name"]);
    return caption
      ? `${formatQuotedMediaKind(mediaKind)} citado: ${caption}`
      : `${formatQuotedMediaKind(mediaKind)} citado sem texto legivel.`;
  }

  return null;
}

function readQuotedMessageText(value: JsonRecord): string | null {
  const text =
    readString(value.text) ??
    readString(value.body) ??
    readString(value.caption) ??
    readString(value.conversation) ??
    readString(value.content);

  if (text) return text;

  for (const inner of Object.values(value)) {
    const innerRecord = readRecord(inner);
    if (!innerRecord) continue;

    const innerText =
      readString(innerRecord.text) ??
      readString(innerRecord.body) ??
      readString(innerRecord.caption) ??
      readString(innerRecord.conversation);

    if (innerText) return innerText;
  }

  return null;
}

function detectQuotedPayloadMediaKind(value: JsonRecord): "audio" | "image" | "video" | "document" | null {
  const signature = normalizeSearch(collectQuotedPayloadSignature(value).join(" "));

  if (signature.includes("audio") || signature.includes("voice") || signature.includes("ptt") || signature.includes("ogg") || signature.includes("opus")) {
    return "audio";
  }

  if (signature.includes("image") || signature.includes("photo") || signature.includes("jpeg") || signature.includes("png") || signature.includes("webp") || signature.includes("imagem")) {
    return "image";
  }

  if (signature.includes("video") || signature.includes("mp4") || signature.includes("quicktime")) {
    return "video";
  }

  if (signature.includes("document") || signature.includes("file") || signature.includes("pdf") || signature.includes("application") || signature.includes("arquivo")) {
    return "document";
  }

  return null;
}

function collectQuotedPayloadSignature(value: unknown, depth = 0): string[] {
  if (!value || depth > 4) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectQuotedPayloadSignature(item, depth + 1));
  }

  const record = readRecord(value);
  if (!record) {
    return [];
  }

  const parts: string[] = [];

  for (const [key, item] of Object.entries(record)) {
    parts.push(key);

    if (typeof item === "string") {
      const normalizedKey = normalizeSearch(key);
      if (/\b(type|kind|mimetype|mime type|media type|message type|caption|filename|file name|url)\b/.test(normalizedKey)) {
        parts.push(item);
      }
    } else if (typeof item === "boolean" && item) {
      parts.push(key);
    } else if (readRecord(item) || Array.isArray(item)) {
      parts.push(...collectQuotedPayloadSignature(item, depth + 1));
    }
  }

  return parts;
}

function findQuotedProviderMessageId(payload: JsonRecord) {
  return findString(payload, [
    "quoted",
    "quotedId",
    "quoted_id",
    "quotedMsgId",
    "quoted_msg_id",
    "quotedMessageId",
    "quoted_message_id",
    "quotedStanzaId",
    "quoted_stanza_id",
    "stanzaId",
    "stanza_id",
  ]);
}

function findQuotedMessageType(payload: JsonRecord) {
  return findString(payload, [
    "quotedMessageType",
    "quoted_message_type",
    "messageType",
    "message_type",
    "mediaType",
    "media_type",
  ]) ?? detectQuotedPayloadMediaKind(payload);
}

function findQuotedMessageByProviderId(messages: MessageRow[], quotedProviderMessageId: string, activeMessageId: string) {
  for (const candidate of [...messages].reverse()) {
    if (candidate.id === activeMessageId || !candidate.provider_message_id) {
      continue;
    }

    if (providerMessageIdsMatch(candidate.provider_message_id, quotedProviderMessageId)) {
      return candidate;
    }
  }

  return null;
}

function providerMessageIdsMatch(left: string, right: string) {
  const normalizedLeft = normalizeProviderMessageId(left);
  const normalizedRight = normalizeProviderMessageId(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  return normalizedLeft.length >= 8
    && normalizedRight.length >= 8
    && (normalizedLeft.endsWith(normalizedRight) || normalizedRight.endsWith(normalizedLeft));
}

function normalizeProviderMessageId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findString(value: unknown, keys: string[], depth = 0): string | null {
  if (!value || depth > 5) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, keys, depth + 1);
      if (found) return found;
    }

    return null;
  }

  const record = readRecord(value);
  if (!record) return null;

  const keySet = new Set(keys.map((key) => key.toLowerCase()));

  for (const [key, item] of Object.entries(record)) {
    if (keySet.has(key.toLowerCase())) {
      const found = readString(item);
      if (found) return found;
    }
  }

  for (const item of Object.values(record)) {
    if (readRecord(item) || Array.isArray(item)) {
      const found = findString(item, keys, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatQuotedMediaKind(value: "audio" | "image" | "video" | "document") {
  if (value === "audio") return "Audio";
  if (value === "image") return "Imagem";
  if (value === "video") return "Video";
  return "Documento";
}

function resolveMessageAuthor(row: MessageRow, payload: JsonRecord): {
  type: ClientLeadMessageAuthor;
  label: string;
  source: string;
} {
  const nestedAuthor = readRecord(payload.message_author);
  const rawType = readString(payload.author_type) ?? readString(nestedAuthor?.type);
  const type = normalizeMessageAuthor(rawType);
  const label = readString(payload.author_label) ?? readString(nestedAuthor?.label);
  const source = readString(payload.author_source) ?? readString(nestedAuthor?.source);

  if (type) {
    return {
      type,
      label: label ?? defaultMessageAuthorLabel(type),
      source: source ?? "payload",
    };
  }

  if (readString(payload.agent_run_id) || readString(payload.agent_id) || source === "agent_runtime") {
    return { type: "ai", label: label ?? "Agente IA", source: source ?? "agent_runtime" };
  }

  if (row.direction === "inbound") {
    return { type: "lead", label: "Lead", source: "direction_inbound" };
  }

  if (row.direction === "outbound") {
    return { type: "human", label: "Humano", source: "direction_outbound" };
  }

  if (row.direction === "system") {
    return { type: "system", label: "Sistema", source: "direction_system" };
  }

  return { type: "unknown", label: "Desconhecido", source: "direction_unknown" };
}

function normalizeMessageAuthor(value: string | null): ClientLeadMessageAuthor | null {
  if (value === "lead" || value === "ai" || value === "human" || value === "system" || value === "unknown") {
    return value;
  }

  return null;
}

function defaultMessageAuthorLabel(type: ClientLeadMessageAuthor) {
  if (type === "lead") return "Lead";
  if (type === "ai") return "Agente IA";
  if (type === "human") return "Humano";
  if (type === "system") return "Sistema";
  return "Desconhecido";
}

function buildConversationFiles(input: {
  conversations: ConversationRow[];
  messagesByConversation: Map<string, MessageRow[]>;
  agentById: Map<string, AgentRow>;
  whatsappInstanceById: Map<string, WhatsappInstanceQueueRow>;
}): ClientLeadConversationFile[] {
  const resolveInstanceAgent = (conversation: ConversationRow) => {
    const instance = conversation.whatsapp_instance_id
      ? input.whatsappInstanceById.get(conversation.whatsapp_instance_id) ?? null
      : null;
    const instanceMetadata = readRecord(instance?.metadata);
    const agentId = readString(instanceMetadata?.agent_id);
    const agent = agentId ? input.agentById.get(agentId) ?? null : null;
    const agentName = readString(instanceMetadata?.agent_name)
      ?? readString(agent?.persona_name)
      ?? agent?.name
      ?? instance?.display_name
      ?? null;

    return {
      agent,
      agentId,
      agentName,
      instance,
    };
  };

  return input.conversations
    .map((conversation) => {
      const conversationMessages = input.messagesByConversation.get(conversation.id) ?? [];
      const messages = conversationMessages.map((message) => mapMessage(message, conversationMessages));
      const humanIntervention = readConversationHumanIntervention(conversation.metadata);
      const { agent, agentId, agentName, instance } = resolveInstanceAgent(conversation);

      return {
        id: conversation.id,
        whatsappInstanceId: conversation.whatsapp_instance_id,
        whatsappInstanceName: instance?.display_name ?? null,
        whatsappInstancePhone: instance?.phone_number ?? null,
        whatsappInstanceStatus: instance?.status ?? null,
        agentId,
        agentName,
        agentAvatarUrl: readWhatsappInstanceAvatarUrl(instance) ?? agent?.avatar_url ?? null,
        channel: conversation.channel,
        provider: conversation.provider,
        providerChatId: conversation.provider_chat_id,
        status: conversation.status,
        preview: conversation.last_message_preview,
        messageCount: messages.length,
        messages,
        humanIntervention,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
        lastMessageAt: conversation.last_message_at ?? conversation.updated_at,
      };
    })
    .sort((a, b) => compareDateDesc(a.lastMessageAt ?? a.updatedAt, b.lastMessageAt ?? b.updatedAt));
}

function emptyHumanIntervention(): ClientLeadHumanIntervention {
  return {
    active: false,
    pausedUntil: null,
    reason: null,
    source: null,
    updatedAt: null,
  };
}

function readConversationHumanIntervention(metadata: JsonRecord | null): ClientLeadHumanIntervention {
  const human = readRecord(metadata?.human_intervention);
  const pausedUntil = readString(human?.paused_until);
  const pausedDate = pausedUntil ? new Date(pausedUntil) : null;
  const pauseIsFuture = pausedDate !== null && !Number.isNaN(pausedDate.getTime()) && pausedDate.getTime() > Date.now();
  const active = human?.active === true && (!pausedUntil || pauseIsFuture);

  return {
    active,
    pausedUntil,
    reason: readString(human?.reason),
    source: readString(human?.source),
    updatedAt: readString(human?.updated_at),
  };
}

function buildActivities(
  lead: LeadRow,
  conversations: ConversationRow[],
  events: IntelligenceEventRow[],
): ClientLeadActivity[] {
  const activities: ClientLeadActivity[] = [];

  if (lead.created_at) {
    activities.push({
      id: `${lead.id}-created`,
      title: "Lead criado",
      summary: `Origem: ${lead.source ?? lead.channel}.`,
      type: "lead.created",
      occurredAt: lead.created_at,
      tone: "cyan",
    });
  }

  for (const conversation of conversations) {
    activities.push({
      id: `${conversation.id}-conversation`,
      title: "Conversa aberta",
      summary: conversation.last_message_preview ?? "Primeira conversa vinculada ao lead.",
      type: "conversation.opened",
      occurredAt: conversation.created_at,
      tone: "green",
    });
  }

  for (const event of events) {
    activities.push({
      id: event.id,
      title: event.title,
      summary: event.summary ?? event.event_type,
      type: event.event_type,
      occurredAt: event.occurred_at,
      tone: getActivityTone(event),
    });
  }

  return activities.sort((a, b) => compareDateDesc(a.occurredAt, b.occurredAt));
}

function isTrackingActivity(activity: ClientLeadActivity) {
  const value = `${activity.type} ${activity.title} ${activity.summary}`.toLowerCase();

  return [
    "track",
    "tracked",
    "click",
    "cookie",
    "push",
    "gps",
    "location",
    "localizacao",
    "visitor",
    "session",
    "utm",
    "page",
    "lead_tracking",
  ].some((needle) => value.includes(needle));
}

function getActivityTone(event: IntelligenceEventRow): ClientLeadActivity["tone"] {
  if (event.event_type.includes("clicked")) return "amber";
  if (event.event_type.includes("responded") || event.event_type.includes("message")) return "green";
  if (event.event_type.includes("error")) return "rose";
  if (event.tags?.includes("lead_tracking")) return "cyan";
  return "zinc";
}

function matchLeadEvents(
  lead: LeadRow,
  conversations: ConversationRow[],
  events: IntelligenceEventRow[],
) {
  const metadata = readRecord(lead.metadata) ?? {};
  const normalizedLeadPhone = normalizePhone(lead.phone_number);
  const conversationIds = new Set(conversations.map((conversation) => conversation.id));
  const chatIds = new Set(conversations.map((conversation) => conversation.provider_chat_id).filter(Boolean));
  const leadTrackingIds = collectTrackingIds(metadata);

  return events.filter((event) => {
    if (event.organization_id !== lead.organization_id) {
      return false;
    }

    if (event.source_id && conversationIds.has(event.source_id)) {
      return true;
    }

    const payload = readRecord(event.payload) ?? {};
    const payloadLeadId = readString(payload.lead_id) ?? readString(payload.leadId);
    const payloadLeadPhone = normalizePhone(readString(payload.lead_phone) ?? readString(payload.phone_number) ?? readString(payload.phone));
    const payloadChatId = readString(payload.provider_chat_id) ?? readString(payload.chat_id);
    const eventTrackingIds = collectTrackingIds({
      ...payload,
      visitor_id: event.source_id,
    });

    return (
      payloadLeadId === lead.id ||
      Boolean(normalizedLeadPhone && payloadLeadPhone === normalizedLeadPhone) ||
      Boolean(payloadChatId && chatIds.has(payloadChatId)) ||
      intersectsSet(leadTrackingIds, eventTrackingIds)
    );
  });
}

function collectTrackingIds(record: JsonRecord, depth = 0): Set<string> {
  const ids = new Set<string>();
  const allowedKeys = new Set([
    "anonymous_id",
    "anon_id",
    "connecty_visitor_id",
    "session_cookie_id",
    "session_id",
    "user_id",
    "visitor_cookie_id",
    "visitor_id",
  ]);

  if (depth > 3) {
    return ids;
  }

  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = key.toLowerCase();
    const stringValue = readString(value);

    if (allowedKeys.has(normalizedKey) && stringValue) {
      ids.add(stringValue);
    }

    const nested = readRecord(value);

    if (nested) {
      for (const id of collectTrackingIds(nested, depth + 1)) {
        ids.add(id);
      }
    }
  }

  return ids;
}

function intersectsSet(a: Set<string>, b: Set<string>) {
  for (const item of a) {
    if (b.has(item)) {
      return true;
    }
  }

  return false;
}

function mergeEventPayloads(events: IntelligenceEventRow[]) {
  return events.reduce<JsonRecord>((acc, event) => {
    return {
      ...acc,
      ...(readRecord(event.payload) ?? {}),
    };
  }, {});
}

function buildStats(leads: ClientLeadRecord[]): ClientLeadCrmWorkspace["stats"] {
  return {
    total: leads.length,
    new: leads.filter((lead) => lead.status === "new").length,
    active: leads.filter((lead) => lead.status === "active").length,
    qualified: leads.filter((lead) => lead.status === "qualified").length,
    converted: leads.filter((lead) => lead.status === "won").length,
    archived: leads.filter((lead) => lead.status === "lost" || lead.status === "archived").length,
  };
}

function pickActiveConversation(conversations: ConversationRow[]) {
  return [...conversations].sort((a, b) => compareDateDesc(a.last_message_at ?? a.updated_at, b.last_message_at ?? b.updated_at))[0];
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, T[]>();

  for (const item of items) {
    const key = keyFn(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  }

  return map;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function compareDateAsc(a: string | null | undefined, b: string | null | undefined) {
  return new Date(a ?? 0).getTime() - new Date(b ?? 0).getTime();
}

function compareDateDesc(a: string | null | undefined, b: string | null | undefined) {
  return new Date(b ?? 0).getTime() - new Date(a ?? 0).getTime();
}

function pickDate(values: Array<string | null | undefined>, direction: "asc" | "desc") {
  const dates = values.filter((value): value is string => Boolean(value));

  if (!dates.length) {
    return null;
  }

  return dates.sort((a, b) => {
    const diff = new Date(a).getTime() - new Date(b).getTime();
    return direction === "asc" ? diff : -diff;
  })[0];
}

function normalizeLeadStatus(value: string): ClientLeadStatus {
  if (["new", "active", "qualified", "won", "lost", "archived"].includes(value)) {
    return value as ClientLeadStatus;
  }

  return "new";
}

function normalizeTemperature(value: string | null): ClientLeadRecord["qualification"]["temperature"] {
  if (value === "cold" || value === "warm" || value === "hot" || value === "vip") {
    return value;
  }

  return null;
}

function readStringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(readString).filter((item): item is string => Boolean(item))
    : [];
}

function mapQualificationFields(value: JsonRecord) {
  const hiddenKeys = new Set([
    "purpose",
    "budget",
    "investment",
    "timeframe",
    "urgency",
    "objections",
    "objection",
    "main_pain",
    "volume_or_context",
    "decision_authority",
    "next_step_acceptance",
  ]);

  return Object.entries(value)
    .map(([key, item]) => ({
      key,
      label: formatFieldLabel(key),
      value: readString(item),
    }))
    .filter((item): item is { key: string; label: string; value: string } => Boolean(item.value) && !hiddenKeys.has(item.key))
    .slice(0, 20);
}

function formatFieldLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .slice(0, 80);
}

function clampScore(value: number | null) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value ?? 0)));
}

function fallbackLeadName(phone: string | null) {
  if (phone) {
    return `WhatsApp ${phone.slice(-4)}`;
  }

  return "Lead sem nome";
}

function formatLocation(parts: Array<string | null>) {
  const value = parts.filter(Boolean).join(", ");
  return value || null;
}

function normalizePhone(value: string | null | undefined) {
  const phone = value?.replace(/\D/g, "") ?? "";
  return phone || null;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
