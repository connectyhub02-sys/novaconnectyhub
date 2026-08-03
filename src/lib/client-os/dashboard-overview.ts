import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { formatStorageBytes, getOrganizationStorageState } from "@/lib/storage/quotas";
import { listClientCompanies, requireClientCompanyAccess, type ClientCompany } from "./companies";

type JsonRecord = Record<string, unknown>;
type DashboardTone = "green" | "cyan" | "amber" | "rose" | "violet" | "zinc";

type ScopedRow = {
  organization_id: string | null;
};

type LeadRow = ScopedRow & {
  id: string;
  channel: string | null;
  phone_number: string | null;
  display_name: string | null;
  status: string | null;
  score: number | string | null;
  source: string | null;
  last_event_summary: string | null;
  last_message_at: string | null;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

type ConversationRow = ScopedRow & {
  id: string;
  lead_id: string | null;
  channel: string | null;
  provider: string | null;
  status: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

type MessageRow = ScopedRow & {
  id: string;
  conversation_id: string | null;
  lead_id: string | null;
  direction: string | null;
  message_type: string | null;
  occurred_at: string | null;
  created_at: string | null;
};

type AgentRow = ScopedRow & {
  id: string;
  name: string | null;
  persona_name: string | null;
  role_title: string | null;
  status: string | null;
  autonomy_level: number | string | null;
  metadata: JsonRecord | null;
  updated_at: string | null;
  created_at: string | null;
};

type AgentRunRow = ScopedRow & {
  id: string;
  run_status: string | null;
  trigger_source: string | null;
  cost_credits: number | string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
};

type WhatsappInstanceRow = ScopedRow & {
  id: string;
  status: string | null;
  phone_number: string | null;
  display_name: string | null;
  last_message_at: string | null;
  connected_at: string | null;
  updated_at: string | null;
};

type WalletRow = ScopedRow & {
  balance_credits: number | string | null;
  reserved_credits: number | string | null;
  lifetime_used_credits: number | string | null;
  updated_at: string | null;
};

type UsageEventRow = ScopedRow & {
  id: string;
  feature_code: string | null;
  connecty_charge_credits: number | string | null;
  occurred_at: string | null;
  created_at: string | null;
};

type BillingPaymentRow = ScopedRow & {
  id: string;
  status: string | null;
  amount_brl: number | string | null;
  paid_at: string | null;
  created_at: string | null;
};

type SalesOrderRow = ScopedRow & {
  id: string;
  status: string | null;
  payment_status: string | null;
  total: number | string | null;
  created_at: string | null;
  updated_at: string | null;
};

type IntegrationAssetRow = ScopedRow & {
  id: string;
  provider_id: string | null;
  asset_type: string | null;
  label: string | null;
  status: string | null;
  is_selected: boolean | null;
  metrics_summary: JsonRecord | null;
  last_synced_at: string | null;
  updated_at: string | null;
};

type MetricSnapshotRow = ScopedRow & {
  id: string;
  provider_id: string | null;
  resource_type: string | null;
  external_id: string | null;
  label: string | null;
  metrics: JsonRecord | null;
  dimensions: JsonRecord | null;
  date_start: string | null;
  date_stop: string | null;
  collected_at: string | null;
};

type TrafficActionRow = ScopedRow & {
  id: string;
  platform: string | null;
  priority: string | null;
  status: string | null;
  title: string | null;
  created_at: string | null;
};

export type ClientDashboardSeriesPoint = {
  label: string;
  value: number;
};

export type ClientDashboardMetricCard = {
  id: string;
  label: string;
  value: string;
  detail: string;
  trend: string;
  tone: DashboardTone;
  series: number[];
};

export type ClientDashboardFunnelStage = {
  label: string;
  count: number;
  value: number;
  tone: DashboardTone;
};

export type ClientDashboardLead = {
  id: string;
  name: string;
  channel: string;
  status: string;
  score: number;
  source: string;
  summary: string;
  lastActivityAt: string | null;
};

export type ClientDashboardConversation = {
  id: string;
  leadId: string | null;
  leadName: string;
  channel: string;
  status: string;
  summary: string;
  score: number;
  lastMessageAt: string | null;
};

export type ClientDashboardAgent = {
  id: string;
  name: string;
  role: string;
  status: "online" | "warning" | "critical" | "idle";
  accuracy: number;
  current: string;
  updatedAt: string | null;
};

export type ClientDashboardCampaign = {
  id: string;
  platform: string;
  name: string;
  status: string;
  spendBrl: number;
  clicks: number;
  leads: number;
  roas: number | null;
  updatedAt: string | null;
};

export type ClientDashboardStorage = {
  planCode: string | null;
  planName: string;
  usedBytes: number;
  limitBytes: number;
  availableBytes: number;
  usedPercent: number;
  usedLabel: string;
  limitLabel: string;
  availableLabel: string;
  fileCount: number;
  fileLimit: number;
  availableFileCount: number;
  status: "ok" | "warning" | "danger";
  updatedAt: string | null;
};

export type ClientDashboardOverview = {
  generatedAt: string;
  company: ClientCompany | null;
  companies: ClientCompany[];
  warnings: string[];
  metrics: {
    leads: {
      total: number;
      new: number;
      active: number;
      qualified: number;
      won: number;
      lost: number;
      archived: number;
      today: number;
      last7d: number;
    };
    conversations: {
      total: number;
      open: number;
      today: number;
    };
    messages: {
      today: number;
      inboundToday: number;
      outboundToday: number;
    };
    agents: {
      total: number;
      online: number;
      warning: number;
    };
    whatsapp: {
      total: number;
      connected: number;
      disconnected: number;
    };
    credits: {
      available: number;
      reserved: number;
      usedLifetime: number;
      used30d: number;
    };
    sales: {
      orders30d: number;
      paidOrders30d: number;
      revenue30dBrl: number;
      approvedPayments30dBrl: number;
      rejectedPayments30d: number;
    };
    traffic: {
      assetsTotal: number;
      selectedAssets: number;
      campaignSnapshots: number;
      openActions: number;
    };
    automation: {
      runs30d: number;
      completed30d: number;
      failed30d: number;
      successRate: number;
    };
  };
  summaryCards: ClientDashboardMetricCard[];
  funnel: ClientDashboardFunnelStage[];
  leadSeries: ClientDashboardSeriesPoint[];
  recentLeads: ClientDashboardLead[];
  recentConversations: ClientDashboardConversation[];
  activeAgents: ClientDashboardAgent[];
  campaigns: ClientDashboardCampaign[];
  storage: ClientDashboardStorage | null;
};

export type ClientDashboardOverviewRows = {
  leads?: LeadRow[];
  conversations?: ConversationRow[];
  messagesToday?: MessageRow[];
  agents?: AgentRow[];
  agentRuns30d?: AgentRunRow[];
  whatsappInstances?: WhatsappInstanceRow[];
  wallets?: WalletRow[];
  usageEvents30d?: UsageEventRow[];
  billingPayments30d?: BillingPaymentRow[];
  salesOrders30d?: SalesOrderRow[];
  integrationAssets?: IntegrationAssetRow[];
  metricSnapshots?: MetricSnapshotRow[];
  trafficActions?: TrafficActionRow[];
};

type QueryResponse<T> = {
  data: T[] | null;
  error: { message: string; code?: string } | null;
};

type QueryBucket<T> = {
  rows: T[];
  warning: string | null;
};

const recentLimit = 8;
const dashboardRowLimit = 5000;

export async function getClientDashboardOverview(input: {
  userId: string;
  organizationId?: string | null;
  company?: ClientCompany | null;
  client?: SupabaseClient;
  now?: Date;
}): Promise<ClientDashboardOverview> {
  const client = input.client ?? createServiceClient();
  const now = input.now ?? new Date();
  let companies: ClientCompany[] = [];

  try {
    companies = await listClientCompanies(input.userId, client);
  } catch (error) {
    return buildClientDashboardOverviewFromRows({
      company: null,
      companies,
      now,
      rows: {},
      warnings: [toLoadWarning("empresas", error)],
    });
  }

  const trustedCompany = input.company ?? null;

  if (trustedCompany && input.organizationId && trustedCompany.id !== input.organizationId) {
    return buildClientDashboardOverviewFromRows({
      company: null,
      companies,
      now,
      rows: {},
      warnings: ["Empresa selecionada nao corresponde ao workspace atual."],
    });
  }

  if (trustedCompany && !companies.some((company) => company.id === trustedCompany.id)) {
    companies = [trustedCompany, ...companies];
  }

  let company: ClientCompany | null = trustedCompany;

  if (!company && input.organizationId) {
    try {
      company = await requireClientCompanyAccess({
        userId: input.userId,
        companyId: input.organizationId,
        client,
      });
    } catch (error) {
      return buildClientDashboardOverviewFromRows({
        company: null,
        companies,
        now,
        rows: {},
        warnings: [toLoadWarning("empresa selecionada", error)],
      });
    }
  } else {
    company = companies[0] ?? null;
  }

  if (!company) {
    return buildClientDashboardOverviewFromRows({
      company: null,
      companies,
      now,
      rows: {},
    });
  }

  const { rows, warnings } = await loadDashboardRows({
    client,
    organizationId: company.id,
    now,
  });
  const storage = await loadDashboardStorage({
    client,
    organizationId: company.id,
  });

  return buildClientDashboardOverviewFromRows({
    company,
    companies,
    now,
    rows,
    warnings: storage.warning ? [...warnings, storage.warning] : warnings,
    storage: storage.data,
  });
}

export function buildClientDashboardOverviewFromRows(input: {
  company: ClientCompany | null;
  companies?: ClientCompany[];
  rows?: ClientDashboardOverviewRows;
  now?: Date;
  warnings?: string[];
  storage?: ClientDashboardStorage | null;
}): ClientDashboardOverview {
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const organizationId = input.company?.id ?? null;
  const rows = scopeRows(input.rows ?? {}, organizationId);
  const leadSeries = buildLeadSeries(rows.leads, now);
  const leadsById = new Map(rows.leads.map((lead) => [lead.id, lead]));
  const todayStart = startOfDay(now);
  const sevenDaysAgo = addDays(now, -7);

  const leadStatus = countBy(rows.leads, (lead) => normalizeStatus(lead.status, "new"));
  const totalLeads = rows.leads.length;
  const leadsToday = rows.leads.filter((lead) => isOnOrAfter(lead.created_at, todayStart)).length;
  const leadsLast7d = rows.leads.filter((lead) => isOnOrAfter(lead.created_at, sevenDaysAgo)).length;
  const openConversations = rows.conversations.filter((conversation) =>
    ["open", "waiting_customer", "waiting_agent"].includes(normalizeStatus(conversation.status, "open")),
  ).length;
  const conversationsToday = rows.conversations.filter((conversation) =>
    isOnOrAfter(conversation.last_message_at ?? conversation.updated_at ?? conversation.created_at, todayStart),
  ).length;
  const messagesToday = rows.messagesToday.length;
  const inboundToday = rows.messagesToday.filter((message) => message.direction === "inbound").length;
  const outboundToday = rows.messagesToday.filter((message) => message.direction === "outbound").length;
  const agentsOnline = rows.agents.filter((agent) => agent.status === "online").length;
  const agentsWarning = rows.agents.filter((agent) => ["needs_review", "paused"].includes(normalizeStatus(agent.status, ""))).length;
  const connectedWhatsapp = rows.whatsappInstances.filter((instance) => instance.status === "connected").length;
  const disconnectedWhatsapp = rows.whatsappInstances.filter((instance) =>
    ["disconnected", "blocked", "error"].includes(normalizeStatus(instance.status, "")),
  ).length;
  const wallet = rows.wallets[0] ?? null;
  const creditsUsed30d = sumNumbers(rows.usageEvents30d, (event) => event.connecty_charge_credits);
  const paidOrders = rows.salesOrders30d.filter((order) => isPaidOrder(order));
  const salesRevenue30d = sumNumbers(paidOrders, (order) => order.total);
  const approvedPayments30d = rows.billingPayments30d.filter((payment) => payment.status === "approved");
  const rejectedPayments30d = rows.billingPayments30d.filter((payment) => payment.status === "rejected").length;
  const trafficOpenActions = rows.trafficActions.filter((action) =>
    ["suggested", "queued", "approved", "in_progress"].includes(normalizeStatus(action.status, "")),
  ).length;
  const completedRuns = rows.agentRuns30d.filter((run) => run.run_status === "completed").length;
  const failedRuns = rows.agentRuns30d.filter((run) => ["failed", "cancelled"].includes(normalizeStatus(run.run_status, ""))).length;
  const successRate = rows.agentRuns30d.length ? Math.round((completedRuns / rows.agentRuns30d.length) * 100) : 0;

  const metrics = {
    leads: {
      total: totalLeads,
      new: leadStatus.get("new") ?? 0,
      active: leadStatus.get("active") ?? 0,
      qualified: leadStatus.get("qualified") ?? 0,
      won: leadStatus.get("won") ?? 0,
      lost: leadStatus.get("lost") ?? 0,
      archived: leadStatus.get("archived") ?? 0,
      today: leadsToday,
      last7d: leadsLast7d,
    },
    conversations: {
      total: rows.conversations.length,
      open: openConversations,
      today: conversationsToday,
    },
    messages: {
      today: messagesToday,
      inboundToday,
      outboundToday,
    },
    agents: {
      total: rows.agents.length,
      online: agentsOnline,
      warning: agentsWarning,
    },
    whatsapp: {
      total: rows.whatsappInstances.length,
      connected: connectedWhatsapp,
      disconnected: disconnectedWhatsapp,
    },
    credits: {
      available: toNumber(wallet?.balance_credits),
      reserved: toNumber(wallet?.reserved_credits),
      usedLifetime: toNumber(wallet?.lifetime_used_credits),
      used30d: creditsUsed30d,
    },
    sales: {
      orders30d: rows.salesOrders30d.length,
      paidOrders30d: paidOrders.length,
      revenue30dBrl: salesRevenue30d,
      approvedPayments30dBrl: sumNumbers(approvedPayments30d, (payment) => payment.amount_brl),
      rejectedPayments30d,
    },
    traffic: {
      assetsTotal: rows.integrationAssets.length,
      selectedAssets: rows.integrationAssets.filter((asset) => asset.is_selected).length,
      campaignSnapshots: rows.metricSnapshots.filter((snapshot) => snapshot.resource_type === "campaign").length,
      openActions: trafficOpenActions,
    },
    automation: {
      runs30d: rows.agentRuns30d.length,
      completed30d: completedRuns,
      failed30d: failedRuns,
      successRate,
    },
  } satisfies ClientDashboardOverview["metrics"];

  return {
    generatedAt,
    company: input.company,
    companies: input.companies ?? [],
    warnings: input.warnings ?? [],
    metrics,
    summaryCards: buildSummaryCards(metrics, leadSeries),
    funnel: buildFunnel(metrics),
    leadSeries,
    recentLeads: buildRecentLeads(rows.leads),
    recentConversations: buildRecentConversations(rows.conversations, leadsById),
    activeAgents: buildActiveAgents(rows.agents),
    campaigns: buildCampaigns(rows.metricSnapshots, rows.integrationAssets),
    storage: input.storage ?? null,
  };
}

async function loadDashboardRows(input: {
  client: SupabaseClient;
  organizationId: string;
  now: Date;
}) {
  const todayStart = startOfDay(input.now).toISOString();
  const thirtyDaysAgo = addDays(input.now, -30).toISOString();

  const [
    leads,
    conversations,
    messagesToday,
    agents,
    agentRuns30d,
    whatsappInstances,
    wallets,
    usageEvents30d,
    billingPayments30d,
    salesOrders30d,
    integrationAssets,
    metricSnapshots,
    trafficActions,
  ] = await Promise.all([
    safeQuery<LeadRow>("leads", input.client
      .from("leads")
      .select("id, organization_id, channel, phone_number, display_name, status, score, source, last_event_summary, last_message_at, metadata, created_at, updated_at")
      .eq("organization_id", input.organizationId)
      .order("updated_at", { ascending: false })
      .limit(dashboardRowLimit)),
    safeQuery<ConversationRow>("conversas", input.client
      .from("conversations")
      .select("id, organization_id, lead_id, channel, provider, status, last_message_preview, last_message_at, metadata, created_at, updated_at")
      .eq("organization_id", input.organizationId)
      .order("updated_at", { ascending: false })
      .limit(dashboardRowLimit)),
    safeQuery<MessageRow>("mensagens de hoje", input.client
      .from("conversation_messages")
      .select("id, organization_id, conversation_id, lead_id, direction, message_type, occurred_at, created_at")
      .eq("organization_id", input.organizationId)
      .gte("occurred_at", todayStart)
      .order("occurred_at", { ascending: false })
      .limit(dashboardRowLimit)),
    safeQuery<AgentRow>("agentes", input.client
      .from("agent_registry")
      .select("id, organization_id, name, persona_name, role_title, status, autonomy_level, metadata, updated_at, created_at")
      .eq("scope", "organization")
      .eq("organization_id", input.organizationId)
      .contains("metadata", { client_created: true })
      .order("updated_at", { ascending: false })
      .limit(500)),
    safeQuery<AgentRunRow>("execucoes dos agentes", input.client
      .from("agent_runs")
      .select("id, organization_id, run_status, trigger_source, cost_credits, started_at, finished_at, created_at")
      .eq("organization_id", input.organizationId)
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(dashboardRowLimit)),
    safeQuery<WhatsappInstanceRow>("instancias WhatsApp", input.client
      .from("whatsapp_instances")
      .select("id, organization_id, status, phone_number, display_name, last_message_at, connected_at, updated_at")
      .eq("organization_id", input.organizationId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(500)),
    safeQuery<WalletRow>("carteira de creditos", input.client
      .from("credit_wallets")
      .select("organization_id, balance_credits, reserved_credits, lifetime_used_credits, updated_at")
      .eq("organization_id", input.organizationId)
      .limit(1)),
    safeQuery<UsageEventRow>("consumo de creditos", input.client
      .from("usage_events")
      .select("id, organization_id, feature_code, connecty_charge_credits, occurred_at, created_at")
      .eq("organization_id", input.organizationId)
      .eq("status", "completed")
      .gte("occurred_at", thirtyDaysAgo)
      .order("occurred_at", { ascending: false })
      .limit(dashboardRowLimit)),
    safeQuery<BillingPaymentRow>("pagamentos", input.client
      .from("billing_payments")
      .select("id, organization_id, status, amount_brl, paid_at, created_at")
      .eq("organization_id", input.organizationId)
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(1000)),
    safeQuery<SalesOrderRow>("pedidos do catalogo", input.client
      .from("sales_catalog_orders")
      .select("id, organization_id, status, payment_status, total, created_at, updated_at")
      .eq("organization_id", input.organizationId)
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(1000)),
    safeQuery<IntegrationAssetRow>("assets de crescimento", input.client
      .from("integration_assets")
      .select("id, organization_id, provider_id, asset_type, label, status, is_selected, metrics_summary, last_synced_at, updated_at")
      .eq("organization_id", input.organizationId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(500)),
    safeQuery<MetricSnapshotRow>("snapshots de trafego", input.client
      .from("integration_metric_snapshots")
      .select("id, organization_id, provider_id, resource_type, external_id, label, metrics, dimensions, date_start, date_stop, collected_at")
      .eq("organization_id", input.organizationId)
      .in("resource_type", ["campaign", "post"])
      .order("collected_at", { ascending: false })
      .limit(500)),
    safeQuery<TrafficActionRow>("acoes do gestor IA", input.client
      .from("traffic_ai_action_items")
      .select("id, organization_id, platform, priority, status, title, created_at")
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: false })
      .limit(500)),
  ]);

  const buckets = [
    leads,
    conversations,
    messagesToday,
    agents,
    agentRuns30d,
    whatsappInstances,
    wallets,
    usageEvents30d,
    billingPayments30d,
    salesOrders30d,
    integrationAssets,
    metricSnapshots,
    trafficActions,
  ];

  return {
    rows: {
      leads: leads.rows,
      conversations: conversations.rows,
      messagesToday: messagesToday.rows,
      agents: agents.rows,
      agentRuns30d: agentRuns30d.rows,
      whatsappInstances: whatsappInstances.rows,
      wallets: wallets.rows,
      usageEvents30d: usageEvents30d.rows,
      billingPayments30d: billingPayments30d.rows,
      salesOrders30d: salesOrders30d.rows,
      integrationAssets: integrationAssets.rows,
      metricSnapshots: metricSnapshots.rows,
      trafficActions: trafficActions.rows,
    },
    warnings: buckets.map((bucket) => bucket.warning).filter((warning): warning is string => Boolean(warning)),
  };
}

async function loadDashboardStorage(input: {
  client: SupabaseClient;
  organizationId: string;
}): Promise<{ data: ClientDashboardStorage | null; warning: string | null }> {
  try {
    const state = await getOrganizationStorageState({
      client: input.client,
      organizationId: input.organizationId,
    });
    const fileLimit = state.entitlement.totalStorageFileLimit;
    const fileWarningThreshold = fileLimit > 0 ? Math.ceil(fileLimit * 0.9) : Number.POSITIVE_INFINITY;
    const status: ClientDashboardStorage["status"] =
      state.usedPercent >= 95 || state.availableBytes <= 0 || state.availableFileCount <= 0
        ? "danger"
        : state.usedPercent >= 80 || state.usage.billableFileCount >= fileWarningThreshold
          ? "warning"
          : "ok";

    return {
      data: {
        planCode: state.entitlement.planCode,
        planName: state.entitlement.planName ?? state.entitlement.planCode ?? "Plano atual",
        usedBytes: state.usage.usedBytes,
        limitBytes: state.entitlement.totalStorageLimitBytes,
        availableBytes: state.availableBytes,
        usedPercent: state.usedPercent,
        usedLabel: formatStorageBytes(state.usage.usedBytes),
        limitLabel: formatStorageBytes(state.entitlement.totalStorageLimitBytes),
        availableLabel: formatStorageBytes(state.availableBytes),
        fileCount: state.usage.billableFileCount,
        fileLimit,
        availableFileCount: state.availableFileCount,
        status,
        updatedAt: state.usage.updatedAt,
      },
      warning: null,
    };
  } catch (error) {
    return {
      data: null,
      warning: toLoadWarning("armazenamento", error),
    };
  }
}

async function safeQuery<T>(scope: string, query: PromiseLike<QueryResponse<T>>): Promise<QueryBucket<T>> {
  try {
    const result = await query;

    if (result.error) {
      return {
        rows: [],
        warning: toLoadWarning(scope, result.error),
      };
    }

    return {
      rows: result.data ?? [],
      warning: null,
    };
  } catch (error) {
    return {
      rows: [],
      warning: toLoadWarning(scope, error),
    };
  }
}

function scopeRows(rows: ClientDashboardOverviewRows, organizationId: string | null): Required<ClientDashboardOverviewRows> {
  if (!organizationId) {
    return emptyRows();
  }

  return {
    leads: filterScoped(rows.leads, organizationId),
    conversations: filterScoped(rows.conversations, organizationId),
    messagesToday: filterScoped(rows.messagesToday, organizationId),
    agents: filterScoped(rows.agents, organizationId),
    agentRuns30d: filterScoped(rows.agentRuns30d, organizationId),
    whatsappInstances: filterScoped(rows.whatsappInstances, organizationId),
    wallets: filterScoped(rows.wallets, organizationId),
    usageEvents30d: filterScoped(rows.usageEvents30d, organizationId),
    billingPayments30d: filterScoped(rows.billingPayments30d, organizationId),
    salesOrders30d: filterScoped(rows.salesOrders30d, organizationId),
    integrationAssets: filterScoped(rows.integrationAssets, organizationId),
    metricSnapshots: filterScoped(rows.metricSnapshots, organizationId),
    trafficActions: filterScoped(rows.trafficActions, organizationId),
  };
}

function emptyRows(): Required<ClientDashboardOverviewRows> {
  return {
    leads: [],
    conversations: [],
    messagesToday: [],
    agents: [],
    agentRuns30d: [],
    whatsappInstances: [],
    wallets: [],
    usageEvents30d: [],
    billingPayments30d: [],
    salesOrders30d: [],
    integrationAssets: [],
    metricSnapshots: [],
    trafficActions: [],
  };
}

function filterScoped<T extends ScopedRow>(rows: T[] | undefined, organizationId: string) {
  return (rows ?? []).filter((row) => row.organization_id === organizationId);
}

function buildSummaryCards(
  metrics: ClientDashboardOverview["metrics"],
  leadSeries: ClientDashboardSeriesPoint[],
): ClientDashboardMetricCard[] {
  return [
    {
      id: "leads",
      label: "Leads captados",
      value: formatInteger(metrics.leads.total),
      detail: `${formatInteger(metrics.leads.today)} hoje, ${formatInteger(metrics.leads.last7d)} em 7 dias`,
      trend: metrics.leads.last7d > 0 ? "captacao ativa" : "sem novos leads",
      tone: "cyan",
      series: leadSeries.map((point) => point.value),
    },
    {
      id: "conversations",
      label: "Conversas IA",
      value: formatInteger(metrics.conversations.total),
      detail: `${formatInteger(metrics.conversations.open)} abertas, ${formatInteger(metrics.messages.today)} mensagens hoje`,
      trend: `${formatInteger(metrics.messages.inboundToday)} entradas hoje`,
      tone: "green",
      series: buildTinySeries([
        metrics.conversations.open,
        metrics.conversations.today,
        metrics.messages.inboundToday,
        metrics.messages.outboundToday,
      ]),
    },
    {
      id: "sales",
      label: "Vendas atribuidas",
      value: formatMoney(metrics.sales.revenue30dBrl),
      detail: `${formatInteger(metrics.sales.paidOrders30d)} pedidos pagos em 30 dias`,
      trend: `${formatMoney(metrics.sales.approvedPayments30dBrl)} em pagamentos aprovados`,
      tone: metrics.sales.revenue30dBrl > 0 ? "violet" : "zinc",
      series: buildTinySeries([
        metrics.sales.orders30d,
        metrics.sales.paidOrders30d,
        metrics.sales.approvedPayments30dBrl,
        metrics.sales.revenue30dBrl,
      ]),
    },
    {
      id: "credits",
      label: "Creditos restantes",
      value: formatCredits(metrics.credits.available),
      detail: `${formatCredits(metrics.credits.used30d)} usados em 30 dias`,
      trend: metrics.credits.available > 0 ? "saldo disponivel" : "sem saldo registrado",
      tone: metrics.credits.available > 0 ? "amber" : "rose",
      series: buildTinySeries([
        metrics.credits.used30d,
        metrics.credits.reserved,
        metrics.credits.available,
      ]),
    },
  ];
}

function buildFunnel(metrics: ClientDashboardOverview["metrics"]): ClientDashboardFunnelStage[] {
  const total = Math.max(metrics.leads.total, 1);
  const offered = Math.max(metrics.sales.orders30d, metrics.traffic.openActions);
  const sold = Math.max(metrics.leads.won, metrics.sales.paidOrders30d);

  return [
    { label: "Captado", count: metrics.leads.total, value: percent(metrics.leads.total, total), tone: "cyan" },
    { label: "Atendido IA", count: metrics.conversations.total, value: percent(metrics.conversations.total, total), tone: "green" },
    { label: "Qualificado", count: metrics.leads.qualified, value: percent(metrics.leads.qualified, total), tone: "violet" },
    { label: "Oferta enviada", count: offered, value: percent(offered, total), tone: "amber" },
    { label: "Venda", count: sold, value: percent(sold, total), tone: "green" },
  ];
}

function buildLeadSeries(leads: LeadRow[], now: Date): ClientDashboardSeriesPoint[] {
  const days = Array.from({ length: 7 }, (_, index) => startOfDay(addDays(now, index - 6)));

  return days.map((day) => {
    const nextDay = addDays(day, 1);
    const value = leads.filter((lead) => {
      const createdAt = parseDate(lead.created_at);
      return Boolean(createdAt && createdAt >= day && createdAt < nextDay);
    }).length;

    return {
      label: formatDay(day),
      value,
    };
  });
}

function buildRecentLeads(leads: LeadRow[]): ClientDashboardLead[] {
  return [...leads]
    .sort((a, b) => compareDateDesc(resolveLeadActivityAt(a), resolveLeadActivityAt(b)))
    .slice(0, recentLimit)
    .map((lead) => {
      const metadata = readRecord(lead.metadata) ?? {};
      const name = readString(lead.display_name) ?? fallbackLeadName(lead.phone_number);

      return {
        id: lead.id,
        name,
        channel: normalizeLabel(lead.channel ?? "whatsapp"),
        status: normalizeLabel(lead.status ?? "new"),
        score: clampNumber(toNumber(lead.score), 0, 100),
        source: readString(lead.source) ?? readString(metadata.source) ?? "whatsapp",
        summary: readString(lead.last_event_summary) ?? readString(metadata.summary) ?? "Sem resumo recente.",
        lastActivityAt: resolveLeadActivityAt(lead),
      };
    });
}

function buildRecentConversations(
  conversations: ConversationRow[],
  leadsById: Map<string, LeadRow>,
): ClientDashboardConversation[] {
  return [...conversations]
    .sort((a, b) => compareDateDesc(a.last_message_at ?? a.updated_at ?? a.created_at, b.last_message_at ?? b.updated_at ?? b.created_at))
    .slice(0, recentLimit)
    .map((conversation) => {
      const lead = conversation.lead_id ? leadsById.get(conversation.lead_id) ?? null : null;

      return {
        id: conversation.id,
        leadId: conversation.lead_id,
        leadName: readString(lead?.display_name) ?? fallbackLeadName(lead?.phone_number ?? null),
        channel: normalizeLabel(conversation.channel ?? conversation.provider ?? "whatsapp"),
        status: normalizeLabel(conversation.status ?? "open"),
        summary: readString(conversation.last_message_preview) ?? "Conversa sem mensagem recente.",
        score: clampNumber(toNumber(lead?.score), 0, 100),
        lastMessageAt: conversation.last_message_at ?? conversation.updated_at ?? conversation.created_at,
      };
    });
}

function buildActiveAgents(agents: AgentRow[]): ClientDashboardAgent[] {
  return [...agents]
    .sort((a, b) => compareAgentStatus(a, b) || compareDateDesc(a.updated_at ?? a.created_at, b.updated_at ?? b.created_at))
    .slice(0, recentLimit)
    .map((agent) => {
      const status = normalizeStatus(agent.status, "draft");
      const name = readString(agent.persona_name) ?? readString(agent.name) ?? "Agente";

      return {
        id: agent.id,
        name,
        role: readString(agent.role_title) ?? "Atendimento IA",
        status: mapAgentStatus(status),
        accuracy: clampNumber(toNumber(agent.autonomy_level), 0, 100),
        current: agentCurrentText(status),
        updatedAt: agent.updated_at ?? agent.created_at,
      };
    });
}

function buildCampaigns(
  snapshots: MetricSnapshotRow[],
  assets: IntegrationAssetRow[],
): ClientDashboardCampaign[] {
  const snapshotCampaigns = snapshots
    .filter((snapshot) => snapshot.resource_type === "campaign")
    .map(mapCampaignSnapshot);
  const seen = new Set(snapshotCampaigns.map((campaign) => campaign.id));
  const assetCampaigns = assets
    .filter((asset) => asset.asset_type === "meta_campaign" || asset.asset_type === "google_campaign")
    .filter((asset) => !seen.has(asset.id))
    .map((asset) => ({
      id: asset.id,
      platform: providerLabel(asset.provider_id),
      name: readString(asset.label) ?? "Campanha",
      status: normalizeLabel(asset.status ?? "available"),
      spendBrl: toNumber(readRecord(asset.metrics_summary)?.spend),
      clicks: toNumber(readRecord(asset.metrics_summary)?.clicks),
      leads: toNumber(readRecord(asset.metrics_summary)?.conversions ?? readRecord(asset.metrics_summary)?.leads),
      roas: readOptionalNumber(readRecord(asset.metrics_summary)?.roas),
      updatedAt: asset.last_synced_at ?? asset.updated_at,
    }));

  return [...snapshotCampaigns, ...assetCampaigns]
    .sort((a, b) => compareDateDesc(a.updatedAt, b.updatedAt))
    .slice(0, recentLimit);
}

function mapCampaignSnapshot(snapshot: MetricSnapshotRow): ClientDashboardCampaign {
  const metrics = readRecord(snapshot.metrics) ?? {};
  const dimensions = readRecord(snapshot.dimensions) ?? {};
  const id = readString(snapshot.external_id) ?? snapshot.id;

  return {
    id,
    platform: providerLabel(snapshot.provider_id),
    name: readString(snapshot.label) ?? `Campanha ${id}`,
    status: normalizeLabel(readString(dimensions.status) ?? "active"),
    spendBrl: toNumber(metrics.spend ?? metrics.cost ?? metrics.cost_brl),
    clicks: toNumber(metrics.clicks),
    leads: toNumber(metrics.conversions ?? metrics.leads),
    roas: readOptionalNumber(metrics.roas),
    updatedAt: snapshot.collected_at ?? snapshot.date_stop ?? snapshot.date_start,
  };
}

function isPaidOrder(order: SalesOrderRow) {
  return order.status === "paid" || order.payment_status === "confirmed";
}

function resolveLeadActivityAt(lead: LeadRow) {
  return lead.last_message_at ?? lead.updated_at ?? lead.created_at;
}

function compareAgentStatus(a: AgentRow, b: AgentRow) {
  return agentStatusRank(a.status) - agentStatusRank(b.status);
}

function agentStatusRank(status: string | null) {
  if (status === "online") return 0;
  if (status === "needs_review") return 1;
  if (status === "paused") return 2;
  if (status === "draft") return 3;
  return 4;
}

function mapAgentStatus(status: string): ClientDashboardAgent["status"] {
  if (status === "online") return "online";
  if (status === "needs_review" || status === "paused") return "warning";
  if (status === "archived") return "critical";
  return "idle";
}

function agentCurrentText(status: string) {
  if (status === "online") return "Atendendo leads e registrando oportunidades.";
  if (status === "needs_review") return "Aguardando revisao humana.";
  if (status === "paused") return "Pausado pelo usuario.";
  return "Pronto para configuracao.";
}

function buildTinySeries(values: number[]) {
  const normalized = values.map((value) => Math.max(0, Math.round(value)));

  if (normalized.some((value) => value > 0)) {
    return normalized;
  }

  return [0, 0, 0, 0];
}

function percent(value: number, total: number) {
  if (!total) {
    return 0;
  }

  return clampNumber(Math.round((value / total) * 100), 0, 100);
}

function countBy<T>(rows: T[], keyFn: (row: T) => string) {
  const map = new Map<string, number>();

  for (const row of rows) {
    const key = keyFn(row);
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  return map;
}

function sumNumbers<T>(rows: T[], valueFn: (row: T) => unknown) {
  return rows.reduce((total, row) => total + toNumber(valueFn(row)), 0);
}

function toNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : 0;
  return Number.isFinite(number) ? number : 0;
}

function readOptionalNumber(value: unknown) {
  const number = toNumber(value);
  return number > 0 ? number : null;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeStatus(value: string | null, fallback: string) {
  return value?.trim().toLowerCase() || fallback;
}

function normalizeLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function providerLabel(value: string | null) {
  if (value === "meta-ads") return "Meta";
  if (value === "google-growth") return "Google";
  return normalizeLabel(value ?? "trafego");
}

function fallbackLeadName(phone: string | null) {
  if (phone) {
    return `Lead ${phone.replace(/\D/g, "").slice(-4) || phone.slice(-4)}`;
  }

  return "Lead sem nome";
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isOnOrAfter(value: string | null | undefined, since: Date) {
  const date = parseDate(value);
  return Boolean(date && date >= since);
}

function compareDateDesc(a: string | null | undefined, b: string | null | undefined) {
  return (parseDate(b)?.getTime() ?? 0) - (parseDate(a)?.getTime() ?? 0);
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCredits(value: number) {
  if (value >= 1000000) {
    return `${formatDecimal(value / 1000000)}M`;
  }

  if (value >= 1000) {
    return `${formatDecimal(value / 1000)}k`;
  }

  return formatInteger(value);
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toLoadWarning(scope: string, error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error && typeof error.message === "string"
      ? error.message
      : "erro inesperado";

  return `Nao foi possivel carregar ${scope}: ${message}`;
}
