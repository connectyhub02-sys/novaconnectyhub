import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Approval,
  AuditEvent,
  ClientAccount,
  InternalAgent,
  MaintenanceItem,
  Metric,
  PlatformHealth,
  StatusTone,
  Tone,
} from "@/lib/connectyhub-os-data";
import { createServiceClient } from "@/lib/supabase/service";

type JsonRecord = Record<string, unknown>;

type OrganizationRow = {
  id: string;
  name: string;
  slug: string | null;
  owner_id: string | null;
  plan_code: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  company_name: string | null;
  is_platform_admin: boolean | null;
};

type MembershipRow = {
  organization_id: string;
  user_id: string;
  role: string | null;
  created_at: string | null;
};

type SubscriptionRow = {
  organization_id: string;
  plan_code: string | null;
  status: string | null;
  current_period_end: string | null;
  next_billing_at: string | null;
  created_at: string | null;
};

type BillingPlanRow = {
  plan_code: string;
  name: string | null;
  status: string | null;
  monthly_price_brl: number | string | null;
};

type WalletRow = {
  organization_id: string;
  balance_credits: number | string | null;
  lifetime_purchased_credits: number | string | null;
  lifetime_used_credits: number | string | null;
  status: string | null;
};

type AgentRow = {
  id: string;
  scope: string | null;
  organization_id: string | null;
  sector_name: string | null;
  name: string | null;
  role_title: string | null;
  status: string | null;
  autonomy_level: number | string | null;
  requires_human_approval: boolean | null;
  metadata: JsonRecord | null;
  updated_at: string | null;
};

type WhatsappInstanceRow = {
  id: string;
  organization_id: string | null;
  status: string | null;
  last_heartbeat_at: string | null;
  last_message_at: string | null;
  updated_at: string | null;
};

type LeadRow = {
  id: string;
  organization_id: string;
  status: string | null;
  score: number | string | null;
  created_at: string | null;
  updated_at: string | null;
  last_message_at: string | null;
};

type ConversationRow = {
  id: string;
  organization_id: string;
  status: string | null;
  created_at: string | null;
  last_message_at: string | null;
};

type MessageRow = {
  id: string;
  organization_id: string;
  direction: string | null;
  occurred_at: string | null;
};

type AgentRunRow = {
  id: string;
  organization_id: string | null;
  run_status: string | null;
  output_summary: string | null;
  error_message: string | null;
  cost_credits: number | string | null;
  started_at: string | null;
  created_at: string | null;
};

type UsageRow = {
  organization_id: string | null;
  provider: string | null;
  provider_cost: number | string | null;
  connecty_revenue_estimate: number | string | null;
  gross_margin_estimate: number | string | null;
  connecty_charge_credits: number | string | null;
  billing_mode: string | null;
  agent_scope: string | null;
  occurred_at: string | null;
};

type PaymentRow = {
  organization_id: string;
  status: string | null;
  amount_brl: number | string | null;
  paid_at: string | null;
  created_at: string | null;
};

type IntegrationRow = {
  organization_id: string;
  provider_id: string | null;
  status: string | null;
  last_error: string | null;
  last_sync_at: string | null;
  updated_at: string | null;
};

type WebhookRow = {
  organization_id: string;
  provider_id: string | null;
  status: string | null;
  received_count: number | string | null;
  last_received_at: string | null;
  last_error: string | null;
  updated_at: string | null;
};

type IntegrationActionLogRow = {
  organization_id: string | null;
  provider_id: string | null;
  action: string | null;
  status: string | null;
  created_at: string | null;
};

type MaintenanceAuditLogRow = {
  actor_id: string | null;
  event_type: string | null;
  target_table: string | null;
  metadata: JsonRecord | null;
  created_at: string | null;
};

type SafeRows<T> = {
  rows: T[];
  error: string | null;
};

type ChartPoint = {
  label: string;
  value: number;
};

type ClientStatusTile = {
  label: string;
  value: string;
  tone: Tone;
  detail: string;
};

type CeoActivityItem = {
  label: string;
  time: string;
  icon: string;
};

type CeoInsight = {
  autonomyLabel: string;
  headline: string;
  recommendations: string[];
  kpis: Array<{ label: string; value: string; tone: Tone }>;
};

type InfraStat = {
  id: "database" | "storage" | "keys" | "audit";
  label: string;
  value: string;
};

type ClientOrganizationRecord = {
  organization: OrganizationRow;
  ownerId: string;
  duplicateCount: number;
  signalScore: number;
};

export type AdminDashboardOverview = {
  generatedAt: string;
  warnings: string[];
  platformHealth: PlatformHealth[];
  hero: {
    totalClients: string;
    activeClients: string;
    newClients7d: string;
    series: number[];
  };
  activationSeries: ChartPoint[];
  leadSeries: ChartPoint[];
  revenue: {
    value: string;
    trend: string;
    series: ChartPoint[];
  };
  retention: {
    value: string;
    trend: string;
    series: ChartPoint[];
  };
  metrics: Metric[];
  clientStatus: ClientStatusTile[];
  ceoActivity: CeoActivityItem[];
  clients: ClientAccount[];
  internalAgents: InternalAgent[];
  ceoInsight: CeoInsight;
  approvals: Approval[];
  maintenanceItems: MaintenanceItem[];
  auditEvents: AuditEvent[];
  infraStats: InfraStat[];
};

const defaultPlanPrices: Record<string, number> = {
  trial: 0,
  starter: 97,
  start: 97,
  pro: 247,
  scale: 497,
};

const activeOrganizationStatuses = new Set(["active", "trial", "trial_pending"]);
const inactiveOrganizationStatuses = new Set(["inactive", "archived", "blocked", "cancelled", "canceled"]);
const activeSubscriptionStatuses = new Set(["active", "past_due", "incomplete"]);
const paidSubscriptionStatuses = new Set(["active", "past_due"]);

export async function getAdminDashboardOverview(
  client: SupabaseClient = createServiceClient(),
): Promise<AdminDashboardOverview> {
  const now = new Date();
  const since7 = startOfDay(daysAgo(now, 6));
  const since30 = daysAgo(now, 30);
  const since60 = daysAgo(now, 60);
  const monthStart = startOfMonth(addMonths(now, -6));
  const warnings: string[] = [];

  const [
    organizationsResult,
    profilesResult,
    membershipsResult,
    subscriptionsResult,
    plansResult,
    walletsResult,
    agentsResult,
    instancesResult,
    leadsResult,
    conversationsResult,
    messagesResult,
    runsResult,
    usageResult,
    paymentsResult,
    integrationsResult,
    webhooksResult,
    actionLogsResult,
    maintenanceLogsResult,
  ] = await Promise.all([
    safeRows<OrganizationRow>("organizations", client
      .from("organizations")
      .select("id, name, slug, owner_id, plan_code, status, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(10000)),
    safeRows<ProfileRow>("profiles", client
      .from("profiles")
      .select("id, email, full_name, company_name, is_platform_admin")
      .limit(10000)),
    safeRows<MembershipRow>("organization_members", client
      .from("organization_members")
      .select("organization_id, user_id, role, created_at")
      .order("created_at", { ascending: true })
      .limit(10000)),
    safeRows<SubscriptionRow>("organization_subscriptions", client
      .from("organization_subscriptions")
      .select("organization_id, plan_code, status, current_period_end, next_billing_at, created_at")
      .order("created_at", { ascending: false })
      .limit(10000)),
    safeRows<BillingPlanRow>("billing_plans", client
      .from("billing_plans")
      .select("plan_code, name, status, monthly_price_brl")
      .limit(1000)),
    safeRows<WalletRow>("credit_wallets", client
      .from("credit_wallets")
      .select("organization_id, balance_credits, lifetime_purchased_credits, lifetime_used_credits, status")
      .limit(10000)),
    safeRows<AgentRow>("agent_registry", client
      .from("agent_registry")
      .select("id, scope, organization_id, sector_name, name, role_title, status, autonomy_level, requires_human_approval, metadata, updated_at")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(10000)),
    safeRows<WhatsappInstanceRow>("whatsapp_instances", client
      .from("whatsapp_instances")
      .select("id, organization_id, status, last_heartbeat_at, last_message_at, updated_at")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(10000)),
    safeRows<LeadRow>("leads", client
      .from("leads")
      .select("id, organization_id, status, score, created_at, updated_at, last_message_at")
      .gte("created_at", since30.toISOString())
      .order("created_at", { ascending: false })
      .limit(10000)),
    safeRows<ConversationRow>("conversations", client
      .from("conversations")
      .select("id, organization_id, status, created_at, last_message_at")
      .gte("created_at", since30.toISOString())
      .order("created_at", { ascending: false })
      .limit(10000)),
    safeRows<MessageRow>("conversation_messages", client
      .from("conversation_messages")
      .select("id, organization_id, direction, occurred_at")
      .gte("occurred_at", since7.toISOString())
      .order("occurred_at", { ascending: false })
      .limit(10000)),
    safeRows<AgentRunRow>("agent_runs", client
      .from("agent_runs")
      .select("id, organization_id, run_status, output_summary, error_message, cost_credits, started_at, created_at")
      .gte("started_at", since30.toISOString())
      .order("started_at", { ascending: false })
      .limit(10000)),
    safeRows<UsageRow>("usage_events", client
      .from("usage_events")
      .select("organization_id, provider, provider_cost, connecty_revenue_estimate, gross_margin_estimate, connecty_charge_credits, billing_mode, agent_scope, occurred_at")
      .gte("occurred_at", since60.toISOString())
      .order("occurred_at", { ascending: false })
      .limit(10000)),
    safeRows<PaymentRow>("billing_payments", client
      .from("billing_payments")
      .select("organization_id, status, amount_brl, paid_at, created_at")
      .gte("created_at", monthStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(10000)),
    safeRows<IntegrationRow>("organization_integrations", client
      .from("organization_integrations")
      .select("organization_id, provider_id, status, last_error, last_sync_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(10000)),
    safeRows<WebhookRow>("integration_webhook_endpoints", client
      .from("integration_webhook_endpoints")
      .select("organization_id, provider_id, status, received_count, last_received_at, last_error, updated_at")
      .order("updated_at", { ascending: false })
      .limit(10000)),
    safeRows<IntegrationActionLogRow>("integration_action_logs", client
      .from("integration_action_logs")
      .select("organization_id, provider_id, action, status, created_at")
      .order("created_at", { ascending: false })
      .limit(200)),
    safeRows<MaintenanceAuditLogRow>("maintenance_audit_logs", client
      .from("maintenance_audit_logs")
      .select("actor_id, event_type, target_table, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(200)),
  ]);

  collectWarnings(warnings, [
    organizationsResult,
    profilesResult,
    membershipsResult,
    subscriptionsResult,
    plansResult,
    walletsResult,
    agentsResult,
    instancesResult,
    leadsResult,
    conversationsResult,
    messagesResult,
    runsResult,
    usageResult,
    paymentsResult,
    integrationsResult,
    webhooksResult,
    actionLogsResult,
    maintenanceLogsResult,
  ]);

  const organizations = organizationsResult.rows;
  const profilesById = new Map(profilesResult.rows.map((profile) => [profile.id, profile]));
  const ownersByOrg = buildOwnerMap(membershipsResult.rows);
  const plansByCode = new Map(plansResult.rows.map((plan) => [plan.plan_code, plan]));
  const subscriptionByOrg = latestSubscriptionByOrg(subscriptionsResult.rows);
  const walletByOrg = new Map(walletsResult.rows.map((wallet) => [wallet.organization_id, wallet]));
  const agentsByOrg = groupBy(agentsResult.rows.filter((agent) => agent.organization_id), (agent) => agent.organization_id!);
  const conversationsByOrg = groupBy(conversationsResult.rows, (conversation) => conversation.organization_id);
  const paymentsByOrg = groupBy(paymentsResult.rows, (payment) => payment.organization_id);
  const leadsByOrg = groupBy(leadsResult.rows, (lead) => lead.organization_id);
  const instancesByOrg = groupBy(instancesResult.rows.filter(hasOrganizationId), (instance) => instance.organization_id);
  const usageByOrg = groupBy(usageResult.rows.filter(hasOrganizationId), (row) => row.organization_id);
  const runsByOrg = groupBy(runsResult.rows.filter(hasOrganizationId), (row) => row.organization_id);
  const clientRecords = buildClientOrganizationRecords({
    agentsByOrg,
    conversationsByOrg,
    instancesByOrg,
    leadsByOrg,
    organizations,
    ownersByOrg,
    paymentsByOrg,
    profilesById,
    runsByOrg,
    subscriptionByOrg,
    usageByOrg,
    walletsByOrg: walletByOrg,
  });
  const clientOrganizations = clientRecords.map((record) => record.organization);
  const duplicateClientWorkspaces = clientRecords.reduce(
    (total, record) => total + Math.max(0, record.duplicateCount - 1),
    0,
  );

  if (duplicateClientWorkspaces > 0) {
    warnings.push(`Higiene de clientes: ${formatInteger(duplicateClientWorkspaces)} workspaces duplicados foram agrupados por dono.`);
  }

  const payments = paymentsResult.rows;
  const approvedPayments = payments.filter((payment) => payment.status === "approved");
  const currentPayments30 = approvedPayments.filter((payment) => isOnOrAfter(payment.paid_at ?? payment.created_at, since30));
  const previousPayments30 = approvedPayments.filter((payment) => {
    const time = parseDateMs(payment.paid_at ?? payment.created_at);
    return time >= since60.getTime() && time < since30.getTime();
  });
  const paidRevenue30 = sum(currentPayments30, (payment) => toNumber(payment.amount_brl));
  const previousRevenue30 = sum(previousPayments30, (payment) => toNumber(payment.amount_brl));
  const activeClients = clientOrganizations.filter((organization) => isActiveOrganization(organization.status)).length;
  const inactiveClients = clientOrganizations.filter((organization) => isInactiveOrganization(organization.status)).length;
  const paidClients = clientOrganizations.filter((organization) => {
    const subscription = subscriptionByOrg.get(organization.id);
    return subscription ? paidSubscriptionStatuses.has(subscription.status ?? "") : paidPlanCode(organization.plan_code);
  }).length;
  const onboardingClients = clientOrganizations.filter((organization) => {
    const status = organization.status ?? "";
    const subscription = subscriptionByOrg.get(organization.id);
    return status === "trial" || status === "trial_pending" || subscription?.status === "pending" || subscription?.status === "incomplete";
  }).length;
  const mrr = clientOrganizations.reduce((total, organization) => {
    const subscription = subscriptionByOrg.get(organization.id);
    const planCode = subscription?.plan_code ?? organization.plan_code ?? "starter";

    if (subscription && !activeSubscriptionStatuses.has(subscription.status ?? "")) {
      return total;
    }

    if (!subscription && !isActiveOrganization(organization.status)) {
      return total;
    }

    return total + planPrice(planCode, plansByCode);
  }, 0);
  const usage30 = usageResult.rows.filter((row) => isOnOrAfter(row.occurred_at, since30));
  const usagePrevious30 = usageResult.rows.filter((row) => {
    const time = parseDateMs(row.occurred_at);
    return time >= since60.getTime() && time < since30.getTime();
  });
  const usageRevenue = sum(usage30, (row) => toNumber(row.connecty_revenue_estimate));
  const usagePreviousRevenue = sum(usagePrevious30, (row) => toNumber(row.connecty_revenue_estimate));
  const usageMargin = sum(usage30, (row) => toNumber(row.gross_margin_estimate));
  const marginPercent = usageRevenue > 0 ? (usageMargin / usageRevenue) * 100 : 0;
  const chargeCredits30 = sum(usage30, (row) => toNumber(row.connecty_charge_credits));
  const chargeCreditsPrevious30 = sum(usagePrevious30, (row) => toNumber(row.connecty_charge_credits));
  const walletBalance = sum(walletsResult.rows, (wallet) => toNumber(wallet.balance_credits));
  const approvals = buildApprovals(runsResult.rows, organizations);
  const failedRuns30 = runsResult.rows.filter((run) => run.run_status === "failed").length;
  const integrationErrors = integrationsResult.rows.filter((integration) => integration.status === "error" || integration.last_error).length;
  const webhookErrors = webhooksResult.rows.filter((webhook) => webhook.last_error || webhook.status === "disabled").length;
  const rejectedPayments30 = payments.filter((payment) => payment.status === "rejected" && isOnOrAfter(payment.created_at, since30)).length;
  const connectedWhatsapps = instancesResult.rows.filter((instance) => instance.status === "connected").length;
  const problemWhatsapps = instancesResult.rows.filter((instance) => ["error", "blocked", "disconnected"].includes(instance.status ?? "")).length;
  const platformAgents = agentsResult.rows
    .filter((agent) => agent.scope === "platform" || !agent.organization_id)
    .slice(0, 8);
  const organizationAgents = agentsResult.rows.filter((agent) => agent.organization_id);
  const pendingApprovals = runsResult.rows.filter((run) => run.run_status === "needs_approval").length + approvals.length;
  const leadSeries = bucketByDays(lastDays(now, 7), leadsResult.rows, (lead) => lead.created_at);
  const activationSeries = bucketByDays(lastDays(now, 7), clientOrganizations, (organization) => organization.created_at);
  const revenueSeries = bucketByMonths(lastMonths(now, 7), approvedPayments, (payment) => payment.paid_at ?? payment.created_at, (payment) => toNumber(payment.amount_brl));
  const retentionSeries = buildRetentionSeries(lastMonths(now, 7), clientOrganizations);

  return {
    generatedAt: now.toISOString(),
    warnings: [...new Set(warnings)],
    platformHealth: buildPlatformHealth({
      queryWarnings: warnings.length,
      connectedWhatsapps,
      problemWhatsapps,
      integrations: integrationsResult.rows,
      integrationErrors,
      webhookErrors,
      usageEvents: usage30.length,
      rejectedPayments30,
      pastDueSubscriptions: subscriptionsResult.rows.filter((subscription) => subscription.status === "past_due").length,
    }),
    hero: {
      totalClients: formatInteger(clientOrganizations.length),
      activeClients: formatInteger(activeClients),
      newClients7d: signedInteger(clientOrganizations.filter((organization) => isOnOrAfter(organization.created_at, since7)).length),
      series: activationSeries.map((point) => point.value),
    },
    activationSeries,
    leadSeries,
    revenue: {
      value: formatMoney(mrr),
      trend: revenueTrend(paidRevenue30, previousRevenue30),
      series: revenueSeries,
    },
    retention: {
      value: `${formatDecimal(retentionPercent(activeClients, clientOrganizations.length), 1)}%`,
      trend: inactiveClients > 0 ? `-${formatInteger(inactiveClients)} risco` : "+0 risco",
      series: retentionSeries,
    },
    metrics: [
      {
        label: "MRR ativo",
        value: formatMoney(mrr),
        detail: `${formatMoney(paidRevenue30)} pagos em 30 dias`,
        trend: revenueTrend(paidRevenue30, previousRevenue30),
        tone: "green",
        series: revenueSeries.map((point) => point.value),
      },
      {
        label: "Margem IA",
        value: `${formatDecimal(marginPercent, 1)}%`,
        detail: `${formatMoney(usageMargin)} margem em 30 dias`,
        trend: revenueTrend(usageRevenue, usagePreviousRevenue),
        tone: marginPercent >= 40 ? "cyan" : "amber",
        series: bucketByDays(lastDays(now, 7), usage30, (row) => row.occurred_at, (row) => toNumber(row.gross_margin_estimate)).map((point) => point.value),
      },
      {
        label: "Creditos clientes",
        value: formatCompact(walletBalance),
        detail: `${formatCompact(chargeCredits30)} usados em 30 dias`,
        trend: usageTrend(chargeCredits30, chargeCreditsPrevious30),
        tone: "violet",
        series: bucketByDays(lastDays(now, 7), usage30, (row) => row.occurred_at, (row) => toNumber(row.connecty_charge_credits)).map((point) => point.value),
      },
      {
        label: "Aprovacoes",
        value: formatInteger(pendingApprovals),
        detail: `${formatInteger(failedRuns30 + integrationErrors + webhookErrors)} alertas operacionais`,
        trend: pendingApprovals > 0 ? `+${formatInteger(pendingApprovals)}` : "+0",
        tone: pendingApprovals > 0 ? "amber" : "green",
        series: bucketByDays(lastDays(now, 7), runsResult.rows.filter((run) => run.run_status === "needs_approval"), (run) => run.started_at ?? run.created_at).map((point) => point.value),
      },
    ],
    clientStatus: [
      { label: "Ativos", value: formatInteger(activeClients), tone: "green", detail: "clientes" },
      { label: "Em setup", value: formatInteger(onboardingClients), tone: "amber", detail: "clientes" },
      { label: "Inativos", value: formatInteger(inactiveClients), tone: inactiveClients > 0 ? "rose" : "zinc", detail: "clientes" },
      { label: "Pagantes", value: formatInteger(paidClients), tone: "cyan", detail: "clientes" },
    ],
    ceoActivity: buildCeoActivity(maintenanceLogsResult.rows, actionLogsResult.rows, runsResult.rows),
    clients: buildClientRows({
      agentsByOrg,
      conversationsByOrg,
      clientRecords,
      planPrices: plansByCode,
      profilesById,
      subscriptionByOrg,
      walletsByOrg: walletByOrg,
    }),
    internalAgents: buildInternalAgents(platformAgents, organizationAgents),
    ceoInsight: buildCeoInsight({
      activeClients,
      integrationErrors,
      mrr,
      pendingApprovals,
      problemWhatsapps,
      rejectedPayments30,
      totalClients: clientOrganizations.length,
      usageMarginPercent: marginPercent,
    }),
    approvals,
    maintenanceItems: buildMaintenanceItems({
      connectedWhatsapps,
      integrationErrors,
      problemWhatsapps,
      rejectedPayments30,
      usageEvents30: usage30.length,
      webhookErrors,
    }),
    auditEvents: buildAuditEvents(maintenanceLogsResult.rows, actionLogsResult.rows, runsResult.rows),
    infraStats: [
      { id: "database", label: "Supabase", value: warnings.length ? `${warnings.length} alerta(s)` : "OK" },
      { id: "storage", label: "Wallets", value: formatCompact(walletBalance) },
      { id: "keys", label: "Integracoes", value: formatInteger(integrationsResult.rows.length) },
      { id: "audit", label: "Audit", value: formatInteger(maintenanceLogsResult.rows.length) },
    ],
  };
}

async function safeRows<T>(
  label: string,
  query: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<SafeRows<T>> {
  try {
    const { data, error } = await query;

    if (error) {
      return { rows: [], error: `${label}: ${error.message}` };
    }

    return { rows: (data ?? []) as T[], error: null };
  } catch (error) {
    return {
      rows: [],
      error: `${label}: ${error instanceof Error ? error.message : "erro desconhecido"}`,
    };
  }
}

function collectWarnings(warnings: string[], results: Array<SafeRows<unknown>>) {
  for (const result of results) {
    if (result.error) {
      warnings.push(result.error);
    }
  }
}

function buildOwnerMap(rows: MembershipRow[]) {
  const map = new Map<string, MembershipRow>();

  for (const row of rows) {
    const current = map.get(row.organization_id);
    if (!current || row.role === "owner") {
      map.set(row.organization_id, row);
    }
  }

  return map;
}

function latestSubscriptionByOrg(rows: SubscriptionRow[]) {
  const map = new Map<string, SubscriptionRow>();

  for (const row of rows) {
    if (!map.has(row.organization_id)) {
      map.set(row.organization_id, row);
    }
  }

  return map;
}

function buildClientOrganizationRecords(input: {
  agentsByOrg: Map<string, AgentRow[]>;
  conversationsByOrg: Map<string, ConversationRow[]>;
  instancesByOrg: Map<string, WhatsappInstanceRow[]>;
  leadsByOrg: Map<string, LeadRow[]>;
  organizations: OrganizationRow[];
  ownersByOrg: Map<string, MembershipRow>;
  paymentsByOrg: Map<string, PaymentRow[]>;
  profilesById: Map<string, ProfileRow>;
  runsByOrg: Map<string, AgentRunRow[]>;
  subscriptionByOrg: Map<string, SubscriptionRow>;
  usageByOrg: Map<string, UsageRow[]>;
  walletsByOrg: Map<string, WalletRow>;
}): ClientOrganizationRecord[] {
  const byOwner = new Map<string, ClientOrganizationRecord>();
  const duplicateCountByOwner = new Map<string, number>();

  for (const organization of input.organizations) {
    const ownerId = organization.owner_id ?? input.ownersByOrg.get(organization.id)?.user_id ?? null;

    if (!ownerId || input.profilesById.get(ownerId)?.is_platform_admin || isInternalOrganization(organization)) {
      continue;
    }

    duplicateCountByOwner.set(ownerId, (duplicateCountByOwner.get(ownerId) ?? 0) + 1);

    const record = {
      organization,
      ownerId,
      duplicateCount: 1,
      signalScore: scoreClientOrganization({
        agents: input.agentsByOrg.get(organization.id) ?? [],
        conversations: input.conversationsByOrg.get(organization.id) ?? [],
        instances: input.instancesByOrg.get(organization.id) ?? [],
        leads: input.leadsByOrg.get(organization.id) ?? [],
        organization,
        payments: input.paymentsByOrg.get(organization.id) ?? [],
        runs: input.runsByOrg.get(organization.id) ?? [],
        subscription: input.subscriptionByOrg.get(organization.id),
        usageEvents: input.usageByOrg.get(organization.id) ?? [],
        wallet: input.walletsByOrg.get(organization.id),
      }),
    };
    const current = byOwner.get(ownerId);

    if (!current || isBetterClientOrganization(record, current)) {
      byOwner.set(ownerId, record);
    }
  }

  return Array.from(byOwner.values())
    .map((record) => ({
      ...record,
      duplicateCount: duplicateCountByOwner.get(record.ownerId) ?? 1,
    }))
    .sort((left, right) => parseDateMs(right.organization.created_at) - parseDateMs(left.organization.created_at));
}

function scoreClientOrganization(input: {
  agents: AgentRow[];
  conversations: ConversationRow[];
  instances: WhatsappInstanceRow[];
  leads: LeadRow[];
  organization: OrganizationRow;
  payments: PaymentRow[];
  runs: AgentRunRow[];
  subscription: SubscriptionRow | undefined;
  usageEvents: UsageRow[];
  wallet: WalletRow | undefined;
}) {
  const subscriptionStatus = input.subscription?.status ?? "";
  let score = 0;

  if (input.subscription && paidSubscriptionStatuses.has(subscriptionStatus)) score += 90;
  else if (input.subscription && activeSubscriptionStatuses.has(subscriptionStatus)) score += 75;
  else if (input.subscription) score += 40;

  if (input.wallet) score += 35;
  if (input.payments.some((payment) => payment.status === "approved")) score += 30;
  else if (input.payments.length > 0) score += 18;

  if (input.instances.some((instance) => instance.status === "connected")) score += 22;
  else if (input.instances.length > 0) score += 12;

  if (input.conversations.length > 0) score += 18;
  if (input.leads.length > 0) score += 12;
  if (input.agents.length > 0) score += 10;
  if (input.runs.length > 0) score += 8;
  if (input.usageEvents.length > 0) score += 8;
  if (isActiveOrganization(input.organization.status)) score += 4;

  return score;
}

function isBetterClientOrganization(candidate: ClientOrganizationRecord, current: ClientOrganizationRecord) {
  if (candidate.signalScore !== current.signalScore) {
    return candidate.signalScore > current.signalScore;
  }

  return parseDateMs(candidate.organization.created_at) < parseDateMs(current.organization.created_at);
}

function buildClientRows(input: {
  agentsByOrg: Map<string, AgentRow[]>;
  conversationsByOrg: Map<string, ConversationRow[]>;
  clientRecords: ClientOrganizationRecord[];
  planPrices: Map<string, BillingPlanRow>;
  profilesById: Map<string, ProfileRow>;
  subscriptionByOrg: Map<string, SubscriptionRow>;
  walletsByOrg: Map<string, WalletRow>;
}): ClientAccount[] {
  return input.clientRecords
    .slice(0, 12)
    .map((record, index) => {
      const organization = record.organization;
      const owner = input.profilesById.get(record.ownerId);
      const subscription = input.subscriptionByOrg.get(organization.id);
      const planCode = subscription?.plan_code ?? organization.plan_code ?? "starter";
      const wallet = input.walletsByOrg.get(organization.id);
      const agents = input.agentsByOrg.get(organization.id) ?? [];
      const conversations = input.conversationsByOrg.get(organization.id) ?? [];
      const used = toNumber(wallet?.lifetime_used_credits);
      const purchased = toNumber(wallet?.lifetime_purchased_credits);
      const balance = toNumber(wallet?.balance_credits);
      const health = clientHealthLabel(organization, subscription, wallet, conversations);
      const duplicateDetail = record.duplicateCount > 1
        ? ` · ${formatInteger(record.duplicateCount - 1)} workspace(s) duplicado(s)`
        : "";

      return {
        id: `CLI-${String(index + 1).padStart(3, "0")}`,
        company: organization.name,
        owner: owner?.full_name ?? owner?.email ?? owner?.company_name ?? "Responsavel nao identificado",
        plan: planLabel(planCode, input.planPrices),
        health: `${health}${duplicateDetail}`,
        mrr: formatMoney(subscription && !activeSubscriptionStatuses.has(subscription.status ?? "") ? 0 : planPrice(planCode, input.planPrices)),
        tokens: `${formatCompact(balance)} saldo / ${formatCompact(Math.max(purchased, used))} total`,
        agents: agents.length,
        status: clientStatusTone(organization, subscription, wallet, conversations),
      };
    });
}

function buildPlatformHealth(input: {
  queryWarnings: number;
  connectedWhatsapps: number;
  problemWhatsapps: number;
  integrations: IntegrationRow[];
  integrationErrors: number;
  webhookErrors: number;
  usageEvents: number;
  rejectedPayments30: number;
  pastDueSubscriptions: number;
}): PlatformHealth[] {
  const metaConnected = input.integrations.filter((item) => item.provider_id === "meta-ads" && item.status === "connected").length;
  const googleConnected = input.integrations.filter((item) => item.provider_id === "google-growth" && item.status === "connected").length;

  return [
    {
      name: "Supabase",
      status: input.queryWarnings > 0 ? "warning" : "online",
      latency: "server",
      detail: input.queryWarnings > 0 ? `${input.queryWarnings} consulta(s) com alerta` : "consultas admin carregadas",
    },
    {
      name: "WhatsApp Gateway",
      status: input.problemWhatsapps > 0 ? "warning" : input.connectedWhatsapps > 0 ? "online" : "idle",
      latency: `${input.connectedWhatsapps} online`,
      detail: `${input.problemWhatsapps} instancia(s) exigem atencao`,
    },
    {
      name: "Meta Graph",
      status: input.integrationErrors > 0 ? "warning" : metaConnected > 0 ? "online" : "idle",
      latency: `${metaConnected} conexao(oes)`,
      detail: "Meta Ads, Instagram e Facebook",
    },
    {
      name: "Google Growth",
      status: googleConnected > 0 ? "online" : "idle",
      latency: `${googleConnected} conexao(oes)`,
      detail: "Google Ads e assets de crescimento",
    },
    {
      name: "Billing",
      status: input.rejectedPayments30 > 0 || input.pastDueSubscriptions > 0 ? "warning" : "online",
      latency: `${input.rejectedPayments30} recusas`,
      detail: `${input.pastDueSubscriptions} assinatura(s) em atraso`,
    },
    {
      name: "IA / Jobs",
      status: input.usageEvents > 0 ? "online" : "idle",
      latency: `${input.usageEvents} usos`,
      detail: `${input.webhookErrors} webhook(s) com alerta`,
    },
  ];
}

function buildInternalAgents(platformAgents: AgentRow[], organizationAgents: AgentRow[]): InternalAgent[] {
  const source = platformAgents.length ? platformAgents : organizationAgents.slice(0, 4);

  return source.slice(0, 4).map((agent) => ({
    name: agent.name ?? "Agente sem nome",
    sector: agent.sector_name ?? (agent.scope === "platform" ? "Plataforma" : "Cliente"),
    role: agent.role_title ?? "Operacao IA",
    status: agentStatusTone(agent.status),
    autonomy: `${Math.round(toNumber(agent.autonomy_level))}%`,
    task: readString(agent.metadata?.last_task)
      ?? readString(agent.metadata?.current_task)
      ?? (agent.updated_at ? `Atualizado em ${formatShortDate(agent.updated_at)}` : "Sem atividade recente registrada."),
    accuracy: Math.max(1, Math.min(100, Math.round(toNumber(agent.autonomy_level) || (agent.status === "online" ? 82 : 55)))),
  }));
}

function buildApprovals(runs: AgentRunRow[], organizations: OrganizationRow[]): Approval[] {
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));

  return runs
    .filter((run) => run.run_status === "needs_approval")
    .slice(0, 8)
    .map((run, index) => ({
      id: `APR-${String(index + 1).padStart(4, "0")}`,
      client: run.organization_id ? organizationById.get(run.organization_id)?.name ?? "Cliente" : "Plataforma",
      request: run.output_summary ?? run.error_message ?? "Execucao de agente aguardando aprovacao humana.",
      risk: "amber",
      submitted: relativeTime(run.started_at ?? run.created_at),
    }));
}

function buildCeoActivity(
  maintenanceLogs: MaintenanceAuditLogRow[],
  actionLogs: IntegrationActionLogRow[],
  runs: AgentRunRow[],
): CeoActivityItem[] {
  const items = [
    ...maintenanceLogs.slice(0, 4).map((log) => ({
      label: log.event_type ?? "Evento de manutencao",
      time: formatTime(log.created_at),
      icon: "A",
    })),
    ...actionLogs.slice(0, 4).map((log) => ({
      label: `${log.provider_id ?? "integracao"}: ${log.action ?? "acao"}`,
      time: formatTime(log.created_at),
      icon: "I",
    })),
    ...runs.filter((run) => run.run_status === "failed" || run.run_status === "needs_approval").slice(0, 4).map((run) => ({
      label: run.error_message ?? run.output_summary ?? `Run ${run.run_status ?? "registrado"}`,
      time: formatTime(run.started_at ?? run.created_at),
      icon: run.run_status === "failed" ? "!" : "P",
    })),
  ].sort((left, right) => parseShortTime(right.time) - parseShortTime(left.time));

  return items.slice(0, 4);
}

function buildCeoInsight(input: {
  activeClients: number;
  integrationErrors: number;
  mrr: number;
  pendingApprovals: number;
  problemWhatsapps: number;
  rejectedPayments30: number;
  totalClients: number;
  usageMarginPercent: number;
}): CeoInsight {
  const riskCount = input.integrationErrors + input.problemWhatsapps + input.rejectedPayments30;
  const autonomy = input.totalClients > 0
    ? Math.min(96, Math.max(20, Math.round((input.activeClients / input.totalClients) * 100)))
    : 0;
  const recommendations = [
    input.problemWhatsapps > 0
      ? `Priorizar ${formatInteger(input.problemWhatsapps)} instancia(s) WhatsApp com alerta.`
      : "Manter monitoramento das instancias WhatsApp conectadas.",
    input.integrationErrors > 0
      ? `Revisar ${formatInteger(input.integrationErrors)} integracao(oes) com erro.`
      : "Estimular clientes sem Meta/Google conectado a finalizar setup.",
    input.rejectedPayments30 > 0
      ? `Acompanhar ${formatInteger(input.rejectedPayments30)} pagamento(s) recusado(s) nos ultimos 30 dias.`
      : "Usar pagamentos aprovados para ofertas de upgrade.",
  ];

  return {
    autonomyLabel: `Autonomia: ${formatInteger(autonomy)}%`,
    headline: riskCount > 0
      ? "A plataforma esta operando, mas ha pontos que precisam de acompanhamento humano."
      : "A operacao esta saudavel e pronta para crescimento controlado.",
    recommendations,
    kpis: [
      { label: "MRR", value: formatMoney(input.mrr), tone: "green" },
      { label: "Riscos", value: formatInteger(riskCount), tone: riskCount > 0 ? "amber" : "green" },
      { label: "Aprovacoes", value: formatInteger(input.pendingApprovals), tone: input.pendingApprovals > 0 ? "cyan" : "zinc" },
    ],
  };
}

function buildMaintenanceItems(input: {
  connectedWhatsapps: number;
  integrationErrors: number;
  problemWhatsapps: number;
  rejectedPayments30: number;
  usageEvents30: number;
  webhookErrors: number;
}): MaintenanceItem[] {
  return [
    {
      area: "WhatsApp",
      target: `${input.connectedWhatsapps} conectadas`,
      status: input.problemWhatsapps > 0 ? "warning" : input.connectedWhatsapps > 0 ? "online" : "idle",
      detail: `${input.problemWhatsapps} instancia(s) com status de atencao.`,
    },
    {
      area: "Integracoes",
      target: "Meta, Google, Webhooks",
      status: input.integrationErrors + input.webhookErrors > 0 ? "warning" : "online",
      detail: `${input.integrationErrors} integracao(oes) e ${input.webhookErrors} webhook(s) com alerta.`,
    },
    {
      area: "Financeiro",
      target: "Mercado Pago billing",
      status: input.rejectedPayments30 > 0 ? "warning" : "online",
      detail: `${input.rejectedPayments30} pagamento(s) recusado(s) em 30 dias.`,
    },
    {
      area: "IA",
      target: "Usage events",
      status: input.usageEvents30 > 0 ? "online" : "idle",
      detail: `${input.usageEvents30} evento(s) de uso nos ultimos 30 dias.`,
    },
  ];
}

function buildAuditEvents(
  maintenanceLogs: MaintenanceAuditLogRow[],
  actionLogs: IntegrationActionLogRow[],
  runs: AgentRunRow[],
): AuditEvent[] {
  const items: AuditEvent[] = [
    ...maintenanceLogs.slice(0, 8).map((log) => ({
      time: formatTime(log.created_at),
      actor: "Admin OS",
      action: log.event_type ?? log.target_table ?? "Evento registrado",
      tone: "cyan" as Tone,
    })),
    ...actionLogs.slice(0, 8).map((log) => ({
      time: formatTime(log.created_at),
      actor: log.provider_id ?? "Integracao",
      action: log.action ?? "Acao registrada",
      tone: log.status === "error" ? "rose" as Tone : log.status === "warning" ? "amber" as Tone : "green" as Tone,
    })),
    ...runs.filter((run) => run.run_status === "failed").slice(0, 4).map((run) => ({
      time: formatTime(run.started_at ?? run.created_at),
      actor: "Agente IA",
      action: run.error_message ?? "Execucao falhou",
      tone: "rose" as Tone,
    })),
  ];

  return items.slice(0, 12);
}

function bucketByDays<T>(
  days: Date[],
  rows: T[],
  readDate: (row: T) => string | null | undefined,
  readValue: (row: T) => number = () => 1,
): ChartPoint[] {
  const buckets = new Map(days.map((day) => [dateKey(day), 0]));

  for (const row of rows) {
    const key = dateKey(readDate(row));
    if (key && buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + readValue(row));
    }
  }

  return days.map((day) => ({
    label: dayLabel(day),
    value: roundChartValue(buckets.get(dateKey(day)) ?? 0),
  }));
}

function bucketByMonths<T>(
  months: Date[],
  rows: T[],
  readDate: (row: T) => string | null | undefined,
  readValue: (row: T) => number = () => 1,
): ChartPoint[] {
  const buckets = new Map(months.map((month) => [monthKey(month), 0]));

  for (const row of rows) {
    const key = monthKey(readDate(row));
    if (key && buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + readValue(row));
    }
  }

  return months.map((month) => ({
    label: monthLabel(month),
    value: roundChartValue(buckets.get(monthKey(month)) ?? 0),
  }));
}

function buildRetentionSeries(months: Date[], organizations: OrganizationRow[]): ChartPoint[] {
  return months.map((month) => {
    const monthEnd = endOfMonth(month);
    const created = organizations.filter((organization) => parseDateMs(organization.created_at) <= monthEnd.getTime());
    const active = created.filter((organization) => isActiveOrganization(organization.status)).length;

    return {
      label: monthLabel(month),
      value: roundChartValue(retentionPercent(active, created.length)),
    };
  });
}

function groupBy<T>(rows: T[], readKey: (row: T) => string) {
  const map = new Map<string, T[]>();

  for (const row of rows) {
    const key = readKey(row);
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }

  return map;
}

function hasOrganizationId<T extends { organization_id: string | null }>(row: T): row is T & { organization_id: string } {
  return Boolean(row.organization_id);
}

function clientHealthLabel(
  organization: OrganizationRow,
  subscription: SubscriptionRow | undefined,
  wallet: WalletRow | undefined,
  conversations: ConversationRow[],
) {
  if (isInactiveOrganization(organization.status) || subscription?.status === "canceled") return "Inativo";
  if (subscription?.status === "past_due") return "Pagamento";
  if (toNumber(wallet?.balance_credits) <= 0 && wallet) return "Sem creditos";
  if (conversations.some((conversation) => conversation.status === "open")) return "Em operacao";
  if (organization.status === "trial" || organization.status === "trial_pending") return "Setup";
  return "Saudavel";
}

function clientStatusTone(
  organization: OrganizationRow,
  subscription: SubscriptionRow | undefined,
  wallet: WalletRow | undefined,
  conversations: ConversationRow[],
): StatusTone {
  if (isInactiveOrganization(organization.status) || subscription?.status === "canceled") return "idle";
  if (subscription?.status === "past_due" || toNumber(wallet?.balance_credits) <= 0 && wallet) return "warning";
  if (conversations.some((conversation) => conversation.status === "open")) return "online";
  if (isActiveOrganization(organization.status)) return "online";
  return "idle";
}

function agentStatusTone(status: string | null): StatusTone {
  if (status === "online") return "online";
  if (status === "needs_review") return "warning";
  if (status === "paused" || status === "draft") return "idle";
  return "warning";
}

function isActiveOrganization(status: string | null | undefined) {
  return activeOrganizationStatuses.has(status ?? "");
}

function isInactiveOrganization(status: string | null | undefined) {
  return inactiveOrganizationStatuses.has(status ?? "");
}

function isInternalOrganization(organization: OrganizationRow) {
  return organization.plan_code === "internal" || organization.slug === "connectyhub-internal";
}

function paidPlanCode(planCode: string | null | undefined) {
  const normalized = planCode?.toLowerCase() ?? "";
  return normalized !== "trial" && normalized !== "free" && normalized !== "";
}

function planPrice(planCode: string | null | undefined, plans: Map<string, BillingPlanRow>) {
  const code = planCode?.toLowerCase() ?? "starter";
  const configured = toNumber(plans.get(code)?.monthly_price_brl);
  return configured > 0 ? configured : defaultPlanPrices[code] ?? 0;
}

function planLabel(planCode: string | null | undefined, plans: Map<string, BillingPlanRow>) {
  const code = planCode?.toLowerCase() ?? "starter";
  return plans.get(code)?.name ?? code.toUpperCase();
}

function retentionPercent(active: number, total: number) {
  return total > 0 ? (active / total) * 100 : 0;
}

function revenueTrend(current: number, previous: number) {
  if (previous <= 0) {
    return current > 0 ? "+100%" : "+0%";
  }

  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? "+" : ""}${formatDecimal(change, 0)}%`;
}

function usageTrend(current: number, previous: number) {
  if (previous <= 0) {
    return current > 0 ? "+100%" : "+0%";
  }

  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? "+" : ""}${formatDecimal(change, 0)}%`;
}

function sum<T>(rows: T[], readValue: (row: T) => number) {
  return rows.reduce((total, row) => total + readValue(row), 0);
}

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function daysAgo(now: Date, amount: number) {
  const date = new Date(now);
  date.setDate(date.getDate() - amount);
  return date;
}

function addMonths(now: Date, amount: number) {
  const date = new Date(now);
  date.setMonth(date.getMonth() + amount);
  return date;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfMonth(date: Date) {
  const copy = new Date(date);
  copy.setDate(1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfMonth(date: Date) {
  const copy = startOfMonth(date);
  copy.setMonth(copy.getMonth() + 1);
  copy.setMilliseconds(copy.getMilliseconds() - 1);
  return copy;
}

function lastDays(now: Date, count: number) {
  return Array.from({ length: count }, (_, index) => startOfDay(daysAgo(now, count - index - 1)));
}

function lastMonths(now: Date, count: number) {
  return Array.from({ length: count }, (_, index) => startOfMonth(addMonths(now, index - count + 1)));
}

function dateKey(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function monthKey(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 7);
}

function parseDateMs(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isOnOrAfter(value: string | null | undefined, threshold: Date) {
  return parseDateMs(value) >= threshold.getTime();
}

function dayLabel(date: Date) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatDecimal(value: number, digits: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    notation: Math.abs(value) >= 100000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 100000 ? 1 : 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function signedInteger(value: number) {
  return `${value >= 0 ? "+" : ""}${formatInteger(value)}`;
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string | null | undefined) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function relativeTime(value: string | null | undefined) {
  const time = parseDateMs(value);
  if (!time) return "sem data";
  const diffMinutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (diffMinutes < 60) return `ha ${diffMinutes} min`;
  if (diffMinutes < 1440) return `ha ${Math.round(diffMinutes / 60)} h`;
  return `ha ${Math.round(diffMinutes / 1440)} d`;
}

function parseShortTime(value: string) {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function roundChartValue(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}
