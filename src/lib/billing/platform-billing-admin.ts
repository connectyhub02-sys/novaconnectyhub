import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CredentialSnapshot, MaintenanceStoredCredential } from "@/lib/maintenance-vault";
import { getMaintenanceVaultSnapshot } from "@/lib/maintenance-vault";
import {
  buildMercadoPagoPlatformBillingRedirectUrl,
  buildMercadoPagoPlatformBillingWebhookUrl,
} from "@/lib/sales-catalog/mercado-pago";
import {
  normalizePlatformBillingMessageTemplates,
  type PlatformBillingMessageTemplates,
} from "@/lib/billing/platform-billing-messages";
import {
  loadBillingOrderBumpProductOptions,
  type BillingOrderBumpProductOption,
} from "@/lib/billing/plan-checkout";
import { createServiceClient } from "@/lib/supabase/service";

type JsonRecord = Record<string, unknown>;

export type PlatformBillingSettings = {
  schemaReady: boolean;
  billingWhatsappAgentId: string | null;
  notificationWhatsappEnabled: boolean;
  pixAutomaticRequired: boolean;
  checkoutMode: "subscription" | "manual_review";
  recurringProvider: "mercado_pago";
  billingMessageTemplates: PlatformBillingMessageTemplates;
  billingOrderBumpProductIds: string[];
  updatedAt: string | null;
  metadata: JsonRecord;
};

export type PlatformBillingAgentOption = {
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

export type PlatformBillingPlanMapping = {
  id: string;
  planCode: string;
  name: string;
  status: string;
  monthlyPriceBrl: number;
  includedCredits: number;
  mercadoPagoPreapprovalPlanId: string | null;
};

export type PlatformBillingPaymentItem = {
  id: string;
  organizationId: string;
  subscriptionId: string | null;
  organizationName: string;
  planCode: string | null;
  status: string;
  providerStatus: string | null;
  providerPaymentId: string | null;
  amountBrl: number;
  checkoutUrl: string | null;
  createdAt: string;
  paidAt: string | null;
};

export type PlatformBillingSubscriptionItem = {
  id: string;
  organizationId: string;
  organizationName: string;
  planCode: string;
  status: string;
  providerSubscriptionId: string | null;
  providerPlanId: string | null;
  checkoutUrl: string | null;
  nextBillingAt: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
};

export type PlatformBillingNotificationItem = {
  id: string;
  organizationId: string | null;
  organizationName: string;
  eventType: string;
  status: string;
  channel: string;
  agentName: string | null;
  recipientPhone: string | null;
  messagePreview: string | null;
  createdAt: string;
  sentAt: string | null;
  errorMessage: string | null;
};

export type PlatformBillingCustomerOption = {
  id: string;
  name: string;
  createdAt: string | null;
};

export type PlatformBillingWebhookItem = {
  id: string;
  eventType: string | null;
  action: string | null;
  dataId: string | null;
  processingStatus: string | null;
  createdAt: string;
};

export type PlatformBillingOperationsCatalog = {
  settings: PlatformBillingSettings;
  credentials: CredentialSnapshot[];
  mercadoPagoConnection: {
    connected: boolean;
    mode: string | null;
    accountId: string | null;
    tokenExpiresAt: string | null;
    webhookUrl: string;
    redirectUrl: string;
    lastError: string | null;
  };
  credentialReadiness: number;
  agents: PlatformBillingAgentOption[];
  plans: PlatformBillingPlanMapping[];
  payments: PlatformBillingPaymentItem[];
  subscriptions: PlatformBillingSubscriptionItem[];
  notifications: PlatformBillingNotificationItem[];
  testCustomers: PlatformBillingCustomerOption[];
  webhookEvents: PlatformBillingWebhookItem[];
  orderBumpProducts: BillingOrderBumpProductOption[];
  notificationsSchemaReady: boolean;
  stats: {
    configuredCredentialFields: number;
    requiredCredentialFields: number;
    connectedAgents: number;
    mappedPaidPlans: number;
    pendingPayments: number;
    activeSubscriptions: number;
    pendingNotifications: number;
    receivedWebhooks: number;
    configuredOrderBumps: number;
  };
  warnings: string[];
};

type PlatformBillingSettingsRow = {
  billing_whatsapp_agent_id: string | null;
  notification_whatsapp_enabled: boolean | null;
  pix_automatic_required: boolean | null;
  checkout_mode: string | null;
  recurring_provider: string | null;
  updated_at: string | null;
  metadata: JsonRecord | null;
};

type BillingPlanRow = {
  id: string;
  plan_code: string;
  name: string;
  status: string | null;
  monthly_price_brl: number | string | null;
  included_credits: number | string | null;
  mercado_pago_preapproval_plan_id: string | null;
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

type BillingPaymentRow = {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  provider_payment_id: string | null;
  provider_status: string | null;
  status: string | null;
  amount_brl: number | string | null;
  paid_at: string | null;
  created_at: string;
  payload: JsonRecord | null;
};

type BillingSubscriptionRow = {
  id: string;
  organization_id: string;
  plan_code: string | null;
  status: string | null;
  provider_subscription_id: string | null;
  provider_plan_id: string | null;
  next_billing_at: string | null;
  current_period_end: string | null;
  metadata: JsonRecord | null;
  created_at: string;
};

type BillingNotificationRow = {
  id: string;
  organization_id: string | null;
  event_type: string;
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
  created_at?: string | null;
};

type WebhookAuditRow = {
  id: string;
  metadata: JsonRecord | null;
  created_at: string;
};

const defaultSettings: PlatformBillingSettings = {
  schemaReady: false,
  billingWhatsappAgentId: null,
  notificationWhatsappEnabled: true,
  pixAutomaticRequired: true,
  checkoutMode: "subscription",
  recurringProvider: "mercado_pago",
  billingMessageTemplates: normalizePlatformBillingMessageTemplates(null),
  billingOrderBumpProductIds: [],
  updatedAt: null,
  metadata: {},
};

export async function getPlatformBillingOperationsCatalog(): Promise<PlatformBillingOperationsCatalog> {
  const client = createServiceClient();
  const [
    storedCredentialsResult,
    settingsResult,
    plansResult,
    agentsResult,
    instancesResult,
    paymentsResult,
    subscriptionsResult,
    notificationsResult,
    testCustomersResult,
    webhookLogsResult,
  ] = await Promise.all([
    client
      .from("integration_credentials")
      .select("integration_id, env_name, value_preview")
      .eq("scope", "platform")
      .is("organization_id", null)
      .order("updated_at", { ascending: false }),
    client
      .from("platform_billing_settings")
      .select("billing_whatsapp_agent_id, notification_whatsapp_enabled, pix_automatic_required, checkout_mode, recurring_provider, updated_at, metadata")
      .eq("setting_key", "default")
      .maybeSingle<PlatformBillingSettingsRow>(),
    client
      .from("billing_plans")
      .select("id, plan_code, name, status, monthly_price_brl, included_credits, mercado_pago_preapproval_plan_id")
      .in("plan_code", ["starter", "pro", "scale"])
      .order("sort_order", { ascending: true })
      .returns<BillingPlanRow[]>(),
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
    client
      .from("billing_payments")
      .select("id, organization_id, subscription_id, provider_payment_id, provider_status, status, amount_brl, paid_at, created_at, payload")
      .order("created_at", { ascending: false })
      .limit(12)
      .returns<BillingPaymentRow[]>(),
    client
      .from("organization_subscriptions")
      .select("id, organization_id, plan_code, status, provider_subscription_id, provider_plan_id, next_billing_at, current_period_end, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(12)
      .returns<BillingSubscriptionRow[]>(),
    client
      .from("billing_notification_events")
      .select("id, organization_id, event_type, status, channel, selected_agent_id, recipient_phone, message_preview, sent_at, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(12)
      .returns<BillingNotificationRow[]>(),
    client
      .from("organizations")
      .select("id, name, slug, created_at")
      .order("created_at", { ascending: false })
      .limit(24)
      .returns<OrganizationRow[]>(),
    client
      .from("maintenance_audit_logs")
      .select("id, metadata, created_at")
      .eq("event_type", "billing.mercado_pago.webhook")
      .order("created_at", { ascending: false })
      .limit(12)
      .returns<WebhookAuditRow[]>(),
  ]);

  const warnings = [
    storedCredentialsResult.error?.message,
    settingsResult.error?.message,
    plansResult.error?.message,
    agentsResult.error?.message,
    instancesResult.error?.message,
    paymentsResult.error?.message,
    subscriptionsResult.error?.message,
    notificationsResult.error?.message,
    testCustomersResult.error?.message,
    webhookLogsResult.error?.message,
  ].filter((message): message is string => Boolean(message));

  const credentials = buildBillingCredentialSnapshots((storedCredentialsResult.data ?? []) as MaintenanceStoredCredential[]);
  const settings = settingsResult.error ? defaultSettings : mapSettings(settingsResult.data ?? null);
  const plans = (plansResult.data ?? []).map(mapPlan);
  const instancesByAgentId = buildInstancesByAgentId(instancesResult.data ?? []);
  const agents = (agentsResult.data ?? []).map((agent) => mapAgent(agent, instancesByAgentId.get(agent.id)));
  const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name]));
  const orgIds = collectOrganizationIds(paymentsResult.data ?? [], subscriptionsResult.data ?? [], notificationsResult.data ?? []);
  const organizationMap = await loadOrganizationMap(client, orgIds);
  const payments = (paymentsResult.data ?? []).map((payment) => mapPayment(payment, organizationMap));
  const pendingCheckoutSubscriptionIds = collectPendingCheckoutSubscriptionIds(payments);
  const subscriptions = (subscriptionsResult.data ?? [])
    .map((subscription) => mapSubscription(subscription, organizationMap))
    .filter((subscription) => shouldShowSubscriptionInOperations(subscription, pendingCheckoutSubscriptionIds));
  const notifications = notificationsResult.error
    ? []
    : (notificationsResult.data ?? []).map((notification) => mapNotification(notification, organizationMap, agentNameById));
  const testCustomers = (testCustomersResult.data ?? []).map(mapTestCustomer);
  const webhookEvents = (webhookLogsResult.data ?? []).map(mapWebhookEvent);
  const orderBumpProducts = await loadBillingOrderBumpProductOptions(client).catch((error) => {
    warnings.push(error instanceof Error ? error.message : "Nao foi possivel carregar produtos internos para order bump.");
    return [];
  });

  return {
    settings,
    credentials,
    mercadoPagoConnection: buildMercadoPagoConnection(credentials, settings),
    credentialReadiness: getCredentialReadiness(credentials),
    agents,
    plans,
    payments,
    subscriptions,
    notifications,
    testCustomers,
    webhookEvents,
    orderBumpProducts,
    notificationsSchemaReady: !notificationsResult.error,
    stats: {
      configuredCredentialFields: credentials.filter((field) => field.configured).length,
      requiredCredentialFields: credentials.filter((field) => field.requirement === "required").length,
      connectedAgents: agents.filter((agent) => agent.isConnected).length,
      mappedPaidPlans: plans.filter((plan) => Boolean(plan.mercadoPagoPreapprovalPlanId)).length,
      pendingPayments: payments.filter((payment) => payment.status === "pending" || payment.status === "in_process").length,
      activeSubscriptions: subscriptions.filter((subscription) => subscription.status === "active").length,
      pendingNotifications: notifications.filter((notification) => notification.status === "pending").length,
      receivedWebhooks: webhookEvents.length,
      configuredOrderBumps: orderBumpProducts.filter((product) => product.selected && product.available).length,
    },
    warnings,
  };
}

function buildBillingCredentialSnapshots(storedCredentials: MaintenanceStoredCredential[]) {
  const vault = getMaintenanceVaultSnapshot({ storedCredentials });
  const integration = vault.integrations.find((item) => item.id === "mercado-pago-billing");
  return integration?.fields ?? [];
}

function buildMercadoPagoConnection(credentials: CredentialSnapshot[], settings: PlatformBillingSettings) {
  const fieldByEnv = new Map(credentials.map((field) => [field.env, field]));
  const accessToken = fieldByEnv.get("MERCADO_PAGO_BILLING_ACCESS_TOKEN");
  const mode = readConfiguredDisplayValue(fieldByEnv.get("MERCADO_PAGO_BILLING_MODE"));
  const accountId = readConfiguredDisplayValue(fieldByEnv.get("MERCADO_PAGO_BILLING_ACCOUNT_ID"));
  const tokenExpiresAt = readConfiguredDisplayValue(fieldByEnv.get("MERCADO_PAGO_BILLING_TOKEN_EXPIRES_AT"));
  const webhookUrl = readConfiguredDisplayValue(fieldByEnv.get("MERCADO_PAGO_BILLING_WEBHOOK_URL"))
    ?? buildMercadoPagoPlatformBillingWebhookUrl();

  return {
    connected: Boolean(accessToken?.configured),
    mode,
    accountId,
    tokenExpiresAt,
    webhookUrl,
    redirectUrl: readString(settings.metadata.mercado_pago_billing_redirect_url) ?? buildMercadoPagoPlatformBillingRedirectUrl(),
    lastError: readString(settings.metadata.mercado_pago_billing_last_error),
  };
}

function mapSettings(row: PlatformBillingSettingsRow | null): PlatformBillingSettings {
  if (!row) {
    return {
      ...defaultSettings,
      schemaReady: true,
    };
  }

  return {
    schemaReady: true,
    billingWhatsappAgentId: row.billing_whatsapp_agent_id,
    notificationWhatsappEnabled: row.notification_whatsapp_enabled !== false,
    pixAutomaticRequired: row.pix_automatic_required !== false,
    checkoutMode: row.checkout_mode === "manual_review" ? "manual_review" : "subscription",
    recurringProvider: "mercado_pago",
    billingMessageTemplates: normalizePlatformBillingMessageTemplates(row.metadata?.billing_message_templates),
    billingOrderBumpProductIds: readUuidList(row.metadata?.billing_order_bump_product_ids),
    updatedAt: row.updated_at,
    metadata: row.metadata ?? {},
  };
}

function readConfiguredDisplayValue(field: CredentialSnapshot | undefined) {
  if (!field?.configured || field.displayValue === "Nao configurado") {
    return null;
  }

  return field.displayValue;
}

function mapPlan(row: BillingPlanRow): PlatformBillingPlanMapping {
  return {
    id: row.id,
    planCode: row.plan_code,
    name: row.name,
    status: row.status ?? "draft",
    monthlyPriceBrl: toNumber(row.monthly_price_brl),
    includedCredits: toNumber(row.included_credits),
    mercadoPagoPreapprovalPlanId: row.mercado_pago_preapproval_plan_id,
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

function mapAgent(row: AgentRow, instance: WhatsappInstanceRow | undefined): PlatformBillingAgentOption {
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

function mapPayment(row: BillingPaymentRow, organizations: Map<string, OrganizationRow>): PlatformBillingPaymentItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    subscriptionId: row.subscription_id,
    organizationName: getOrganizationName(organizations, row.organization_id),
    planCode: readString(row.payload?.requested_plan_code) ?? readString(row.payload?.planCode),
    status: row.status ?? "pending",
    providerStatus: row.provider_status,
    providerPaymentId: row.provider_payment_id,
    amountBrl: toNumber(row.amount_brl),
    checkoutUrl: readCheckoutUrl(row.payload),
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

function mapSubscription(row: BillingSubscriptionRow, organizations: Map<string, OrganizationRow>): PlatformBillingSubscriptionItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: getOrganizationName(organizations, row.organization_id),
    planCode: row.plan_code ?? "sem_plano",
    status: row.status ?? "pending",
    providerSubscriptionId: row.provider_subscription_id,
    providerPlanId: row.provider_plan_id,
    checkoutUrl: readCheckoutUrl(row.metadata),
    nextBillingAt: row.next_billing_at,
    currentPeriodEnd: row.current_period_end,
    createdAt: row.created_at,
  };
}

function collectPendingCheckoutSubscriptionIds(payments: PlatformBillingPaymentItem[]) {
  return new Set(
    payments
      .filter((payment) => payment.subscriptionId && isOpenPaymentStatus(payment.status))
      .map((payment) => payment.subscriptionId as string),
  );
}

function shouldShowSubscriptionInOperations(
  subscription: PlatformBillingSubscriptionItem,
  pendingCheckoutSubscriptionIds: Set<string>,
) {
  const status = subscription.status.toLowerCase();

  if (status === "canceled" || status === "cancelled") {
    return false;
  }

  if ((status === "pending" || status === "incomplete") && pendingCheckoutSubscriptionIds.has(subscription.id)) {
    return false;
  }

  return true;
}

function mapNotification(
  row: BillingNotificationRow,
  organizations: Map<string, OrganizationRow>,
  agentNameById: Map<string, string>,
): PlatformBillingNotificationItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_id ? getOrganizationName(organizations, row.organization_id) : "ConnectyHub",
    eventType: row.event_type,
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

function mapTestCustomer(row: OrganizationRow): PlatformBillingCustomerOption {
  return {
    id: row.id,
    name: row.name?.trim() || row.slug?.trim() || "Cliente",
    createdAt: row.created_at ?? null,
  };
}

function mapWebhookEvent(row: WebhookAuditRow): PlatformBillingWebhookItem {
  const metadata = row.metadata ?? {};

  return {
    id: row.id,
    eventType: readString(metadata.eventType),
    action: readString(metadata.action),
    dataId: readString(metadata.dataId),
    processingStatus: readString(metadata.processingStatus),
    createdAt: row.created_at,
  };
}

function collectOrganizationIds(
  payments: BillingPaymentRow[],
  subscriptions: BillingSubscriptionRow[],
  notifications: BillingNotificationRow[],
) {
  return Array.from(new Set([
    ...payments.map((payment) => payment.organization_id),
    ...subscriptions.map((subscription) => subscription.organization_id),
    ...notifications.map((notification) => notification.organization_id).filter((id): id is string => Boolean(id)),
  ]));
}

async function loadOrganizationMap(client: SupabaseClient, organizationIds: string[]) {
  if (organizationIds.length === 0) {
    return new Map<string, OrganizationRow>();
  }

  const { data } = await client
    .from("organizations")
    .select("id, name, slug")
    .in("id", organizationIds)
    .returns<OrganizationRow[]>();

  return new Map((data ?? []).map((organization) => [organization.id, organization]));
}

function getOrganizationName(organizations: Map<string, OrganizationRow>, organizationId: string) {
  const organization = organizations.get(organizationId);
  return organization?.name?.trim() || organization?.slug?.trim() || "Cliente";
}

function getCredentialReadiness(credentials: CredentialSnapshot[]) {
  const required = credentials.filter((field) => field.requirement === "required");

  if (required.length === 0) {
    return credentials.some((field) => field.configured) ? 100 : 0;
  }

  return Math.round((required.filter((field) => field.configured).length / required.length) * 100);
}

function readCheckoutUrl(metadata: JsonRecord | null | undefined) {
  const value = readString(metadata?.checkout_url);

  return value && /^https?:\/\//i.test(value) ? value : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readUuidList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item));
}

function isOpenPaymentStatus(status: string) {
  return status === "pending" || status === "in_process";
}

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
