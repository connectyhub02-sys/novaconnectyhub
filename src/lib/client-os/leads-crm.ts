import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
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

export type ClientLeadStatus = "new" | "active" | "qualified" | "won" | "lost" | "archived";

export type ClientLeadMessage = {
  id: string;
  direction: "inbound" | "outbound" | "system" | "unknown";
  type: string;
  text: string;
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

export type ClientLeadRecord = {
  id: string;
  companyId: string;
  companyName: string;
  companyPlan: string;
  agentName: string | null;
  agentAvatarUrl: string | null;
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
    status: string | null;
    preview: string | null;
    messageCount: number;
    messages: ClientLeadMessage[];
  };
  activities: ClientLeadActivity[];
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
};

export type ClientLeadCrmWorkspace = {
  companies: ClientCompany[];
  leads: ClientLeadRecord[];
  stats: {
    total: number;
    new: number;
    active: number;
    qualified: number;
    converted: number;
    archived: number;
  };
};

export async function getClientLeadCrmWorkspace(input: {
  userId: string;
  client?: SupabaseClient;
}): Promise<ClientLeadCrmWorkspace> {
  const client = input.client ?? createServiceClient();
  const companies = await listClientCompanies(input.userId, client);
  const companyIds = companies.map((company) => company.id);

  if (!companyIds.length) {
    return buildEmptyWorkspace(companies);
  }

  const { data: leadsData, error: leadsError } = await client
    .from("leads")
    .select("id, organization_id, channel, phone_number, display_name, status, score, source, last_event_summary, last_message_at, metadata, created_at, updated_at")
    .in("organization_id", companyIds)
    .order("updated_at", { ascending: false })
    .limit(160);

  if (leadsError) {
    throw new Error(`Nao foi possivel carregar os leads: ${leadsError.message}`);
  }

  const leadRows = (leadsData ?? []) as LeadRow[];
  const leadIds = leadRows.map((lead) => lead.id);

  const [conversationsResult, agentsResult, eventsResult] = await Promise.all([
    leadIds.length
      ? client
          .from("conversations")
          .select("id, organization_id, lead_id, whatsapp_instance_id, channel, provider, provider_chat_id, status, last_message_preview, last_message_at, metadata, created_at, updated_at")
          .in("lead_id", leadIds)
          .order("updated_at", { ascending: false })
          .limit(240)
      : Promise.resolve({ data: [], error: null }),
    client
      .from("agent_registry")
      .select("id, organization_id, name, persona_name, avatar_url, metadata")
      .eq("scope", "organization")
      .in("organization_id", companyIds)
      .contains("metadata", { client_created: true, agent_kind: "whatsapp" })
      .order("updated_at", { ascending: false })
      .limit(120),
    client
      .from("intelligence_events")
      .select("id, organization_id, source_type, source_id, event_type, title, summary, tags, payload, occurred_at")
      .in("organization_id", companyIds)
      .order("occurred_at", { ascending: false })
      .limit(500),
  ]);

  if (conversationsResult.error) {
    throw new Error(`Nao foi possivel carregar conversas: ${conversationsResult.error.message}`);
  }

  if (agentsResult.error) {
    throw new Error(`Nao foi possivel carregar agentes: ${agentsResult.error.message}`);
  }

  if (eventsResult.error) {
    throw new Error(`Nao foi possivel carregar eventos dos leads: ${eventsResult.error.message}`);
  }

  const conversationRows = (conversationsResult.data ?? []) as ConversationRow[];
  const conversationIds = conversationRows.map((conversation) => conversation.id);
  const messagesResult = conversationIds.length
    ? await client
        .from("conversation_messages")
        .select("id, organization_id, conversation_id, lead_id, whatsapp_instance_id, provider, provider_message_id, provider_chat_id, direction, message_type, text_content, payload, occurred_at, created_at")
        .in("conversation_id", conversationIds)
        .order("occurred_at", { ascending: true })
        .limit(1200)
    : { data: [], error: null };

  if (messagesResult.error) {
    throw new Error(`Nao foi possivel carregar mensagens: ${messagesResult.error.message}`);
  }

  const companyById = new Map(companies.map((company) => [company.id, company]));
  const agentByOrgId = new Map<string, AgentRow>();

  for (const agent of (agentsResult.data ?? []) as AgentRow[]) {
    if (agent.organization_id && !agentByOrgId.has(agent.organization_id)) {
      agentByOrgId.set(agent.organization_id, agent);
    }
  }

  const conversationsByLead = groupBy(conversationRows, (conversation) => conversation.lead_id ?? "none");
  const messagesByConversation = groupBy((messagesResult.data ?? []) as MessageRow[], (message) => message.conversation_id ?? "none");
  const eventRows = (eventsResult.data ?? []) as IntelligenceEventRow[];
  const leads = leadRows.map((lead) => {
    const company = companyById.get(lead.organization_id);
    const conversations = conversationsByLead.get(lead.id) ?? [];
    const activeConversation = pickActiveConversation(conversations);
    const messages = activeConversation ? messagesByConversation.get(activeConversation.id) ?? [] : [];
    const events = matchLeadEvents(lead, conversations, eventRows);
    const agent = agentByOrgId.get(lead.organization_id) ?? null;

    return mapLeadRecord({
      lead,
      company,
      agent,
      conversation: activeConversation,
      messages,
      events,
    });
  });

  return {
    companies,
    leads,
    stats: buildStats(leads),
  };
}

function buildEmptyWorkspace(companies: ClientCompany[]): ClientLeadCrmWorkspace {
  return {
    companies,
    leads: [],
    stats: {
      total: 0,
      new: 0,
      active: 0,
      qualified: 0,
      converted: 0,
      archived: 0,
    },
  };
}

function mapLeadRecord(input: {
  lead: LeadRow;
  company?: ClientCompany;
  agent: AgentRow | null;
  conversation?: ConversationRow;
  messages: MessageRow[];
  events: IntelligenceEventRow[];
}): ClientLeadRecord {
  const metadata = readRecord(input.lead.metadata) ?? {};
  const eventMetadata = mergeEventPayloads(input.events);
  const name = readString(input.lead.display_name) ?? readString(metadata.name) ?? readString(metadata.lead_name) ?? fallbackLeadName(input.lead.phone_number);
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
    ?? input.conversation?.last_message_preview
    ?? "Ainda sem resumo automatico.";
  const messages = input.messages.map(mapMessage);
  const activities = buildActivities(input.lead, input.conversation, input.events);
  const companyName = input.company?.name ?? "Empresa sem nome";

  return {
    id: input.lead.id,
    companyId: input.lead.organization_id,
    companyName,
    companyPlan: input.company ? `${input.company.planCode} / ${input.company.status}` : "sem plano",
    agentName: readString(input.agent?.persona_name) ?? input.agent?.name ?? null,
    agentAvatarUrl: input.agent?.avatar_url ?? null,
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
      id: input.conversation?.id ?? null,
      status: input.conversation?.status ?? null,
      preview: input.conversation?.last_message_preview ?? null,
      messageCount: messages.length,
      messages,
    },
    activities,
    createdAt: input.lead.created_at,
    updatedAt: input.lead.updated_at,
    lastMessageAt: input.lead.last_message_at ?? input.conversation?.last_message_at ?? null,
  };
}

function mapMessage(row: MessageRow): ClientLeadMessage {
  return {
    id: row.id,
    direction: row.direction,
    type: row.message_type ?? "text",
    text: readString(row.text_content) ?? readString(readRecord(row.payload)?.text) ?? readString(readRecord(row.payload)?.body) ?? "Mensagem sem texto.",
    occurredAt: row.occurred_at ?? row.created_at,
  };
}

function buildActivities(
  lead: LeadRow,
  conversation: ConversationRow | undefined,
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

  if (conversation?.created_at) {
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
  const normalizedLeadPhone = normalizePhone(lead.phone_number);
  const conversationIds = new Set(conversations.map((conversation) => conversation.id));
  const chatIds = new Set(conversations.map((conversation) => conversation.provider_chat_id).filter(Boolean));

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

    return (
      payloadLeadId === lead.id ||
      Boolean(normalizedLeadPhone && payloadLeadPhone === normalizedLeadPhone) ||
      Boolean(payloadChatId && chatIds.has(payloadChatId))
    );
  });
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
  return conversations.sort((a, b) => compareDateDesc(a.last_message_at ?? a.updated_at, b.last_message_at ?? b.updated_at))[0];
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, T[]>();

  for (const item of items) {
    const key = keyFn(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  }

  return map;
}

function compareDateDesc(a: string | null | undefined, b: string | null | undefined) {
  return new Date(b ?? 0).getTime() - new Date(a ?? 0).getTime();
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
