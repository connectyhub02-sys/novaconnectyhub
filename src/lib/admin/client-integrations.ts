import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

const providerIds = ["meta-ads", "google-growth", "mercado-pago", "webhook-universal"] as const;

export type AdminClientIntegrationProviderId = (typeof providerIds)[number];
export type AdminClientIntegrationStatus = "connected" | "warning" | "error" | "not_configured";
export type AdminClientProviderSelectionStatus = "complete" | "partial" | "not_available" | "not_required";
export type AdminClientIntegrationFilterStatus = AdminClientIntegrationStatus | "selection_pending" | "all";
export type AdminClientIntegrationEventStatus = "success" | "warning" | "error";
export type AdminClientIntegrationAlertSeverity = "critical" | "warning" | "info";
export type AdminClientSupportActionKind = "connect" | "select_assets" | "fix_error" | "sync" | "monitor";

export type AdminClientIntegrationFilters = {
  provider: AdminClientIntegrationProviderId | "all";
  status: AdminClientIntegrationFilterStatus;
  companyId: string | null;
};

export type AdminClientIntegrationFilterOption<T extends string> = {
  id: T;
  label: string;
};

export type AdminClientProviderStatus = {
  providerId: AdminClientIntegrationProviderId;
  label: string;
  status: AdminClientIntegrationStatus;
  statusLabel: string;
  accountLabel: string | null;
  detail: string;
  lastActivityAt: string | null;
  issue: string | null;
  selectionStatus: AdminClientProviderSelectionStatus;
  selectionLabel: string;
  selectedAssets: AdminClientProviderSelectedAsset[];
  supportAction: AdminClientSupportAction;
};

export type AdminClientProviderSelectedAsset = {
  label: string;
  value: string | null;
  required: boolean;
  ready: boolean;
};

export type AdminClientSupportAction = {
  kind: AdminClientSupportActionKind;
  title: string;
  detail: string;
  href: string | null;
  hrefLabel: string | null;
  priority: AdminClientIntegrationAlertSeverity;
  customerMessage: string;
};

export type AdminClientIntegrationCompany = {
  id: string;
  name: string;
  slug: string | null;
  planCode: string | null;
  status: string | null;
  createdAt: string | null;
  providers: AdminClientProviderStatus[];
  health: AdminClientIntegrationStatus;
  issue: string | null;
  lastActivityAt: string | null;
  events: AdminClientIntegrationEvent[];
};

export type AdminClientProviderSummary = {
  providerId: AdminClientIntegrationProviderId;
  label: string;
  connected: number;
  warning: number;
  error: number;
  notConfigured: number;
  selectionPending: number;
  total: number;
};

export type AdminClientIntegrationEvent = {
  id: string;
  companyId: string;
  companyName: string;
  providerId: AdminClientIntegrationProviderId | null;
  providerLabel: string;
  actionKey: string;
  action: string;
  status: AdminClientIntegrationEventStatus;
  message: string | null;
  createdAt: string | null;
};

export type AdminClientIntegrationAlert = {
  id: string;
  companyId: string;
  companyName: string;
  providerId: AdminClientIntegrationProviderId;
  providerLabel: string;
  severity: AdminClientIntegrationAlertSeverity;
  title: string;
  detail: string;
  lastActivityAt: string | null;
  supportAction: AdminClientSupportAction;
};

export type AdminClientIntegrationsOverview = {
  generatedAt: string;
  filters: AdminClientIntegrationFilters;
  providerFilterOptions: Array<AdminClientIntegrationFilterOption<AdminClientIntegrationProviderId | "all">>;
  statusFilterOptions: Array<AdminClientIntegrationFilterOption<AdminClientIntegrationFilterStatus>>;
  schemaReady: boolean;
  schemaMessages: string[];
  totalCompanies: number;
  filteredCompanies: number;
  connectedLinks: number;
  warningLinks: number;
  errorLinks: number;
  notConfiguredLinks: number;
  selectionPendingLinks: number;
  criticalAlerts: number;
  warningAlerts: number;
  infoAlerts: number;
  lastActivityAt: string | null;
  providers: AdminClientProviderSummary[];
  companies: AdminClientIntegrationCompany[];
  selectedCompany: AdminClientIntegrationCompany | null;
  recentEvents: AdminClientIntegrationEvent[];
  alerts: AdminClientIntegrationAlert[];
};

type ClientOrganizationRow = {
  id: string;
  name: string | null;
  slug: string | null;
  plan_code: string | null;
  status: string | null;
  created_at: string | null;
};

type OrganizationIntegrationRow = {
  id: string;
  organization_id: string;
  provider_id: string;
  status: string | null;
  connection_label: string | null;
  external_account_id: string | null;
  external_account_label: string | null;
  last_sync_at: string | null;
  last_test_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown> | null;
  connected_at?: string | null;
  updated_at?: string | null;
};

type IntegrationCredentialRow = {
  id: string;
  organization_id: string;
  integration_id: string;
  env_name: string;
  label: string | null;
  requirement: string | null;
  value_preview: string | null;
  updated_at: string | null;
};

type WebhookEndpointRow = {
  id: string;
  organization_id: string;
  provider_id: string;
  label: string | null;
  status: string | null;
  url_path: string | null;
  received_count: number | null;
  last_received_at: string | null;
  last_error: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type PaymentIntegrationRow = {
  id: string;
  organization_id: string;
  provider: string;
  status: string | null;
  account_label: string | null;
  provider_account_id: string | null;
  connected_at: string | null;
  last_error: string | null;
  webhook_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type IntegrationActionLogRow = {
  id: string;
  organization_id: string;
  provider_id: string | null;
  action: string;
  status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

type QueryResult<T> = {
  ready: boolean;
  rows: T[];
  error: string | null;
};

const providerLabels: Record<AdminClientIntegrationProviderId, string> = {
  "meta-ads": "Meta Ads",
  "google-growth": "Google Ads",
  "mercado-pago": "Mercado Pago",
  "webhook-universal": "Webhook Universal",
};

const providerCustomerRoutes: Record<AdminClientIntegrationProviderId, { href: string; label: string }> = {
  "meta-ads": { href: "/dashboard/integracoes", label: "Rota do cliente" },
  "google-growth": { href: "/dashboard/integracoes", label: "Rota do cliente" },
  "mercado-pago": { href: "/dashboard/integracoes", label: "Rota do cliente" },
  "webhook-universal": { href: "/dashboard/integracoes", label: "Rota do cliente" },
};

const providerDashboardRoutes: Partial<Record<AdminClientIntegrationProviderId, { href: string; label: string }>> = {
  "meta-ads": { href: "/dashboard/trafego/meta-ads", label: "Dashboard cliente" },
  "google-growth": { href: "/dashboard/trafego/google-ads", label: "Dashboard cliente" },
};

const defaultFilters: AdminClientIntegrationFilters = {
  provider: "all",
  status: "all",
  companyId: null,
};

const staleActivityDays = 14;

const providerFilterOptions: Array<AdminClientIntegrationFilterOption<AdminClientIntegrationProviderId | "all">> = [
  { id: "all", label: "Todos" },
  ...providerIds.map((providerId) => ({ id: providerId, label: providerLabels[providerId] })),
];

const statusFilterOptions: Array<AdminClientIntegrationFilterOption<AdminClientIntegrationFilterStatus>> = [
  { id: "all", label: "Todos" },
  { id: "connected", label: "Conectados" },
  { id: "selection_pending", label: "Selecao pendente" },
  { id: "warning", label: "Pendencias" },
  { id: "error", label: "Erros" },
  { id: "not_configured", label: "Sem conexao" },
];

type RawSearchParams = Record<string, string | string[] | undefined>;

export function parseAdminClientIntegrationFilters(searchParams: RawSearchParams): AdminClientIntegrationFilters {
  const provider = firstParam(searchParams.provider);
  const status = firstParam(searchParams.status);
  const companyId = firstParam(searchParams.company);

  return normalizeFilters({
    provider: isProviderId(provider) ? provider : "all",
    status: isFilterStatus(status) ? status : "all",
    companyId: companyId || null,
  });
}

export async function getAdminClientIntegrationsOverview(
  filters: Partial<AdminClientIntegrationFilters> = defaultFilters,
): Promise<AdminClientIntegrationsOverview> {
  const normalizedFilters = normalizeFilters(filters);
  const client = createServiceClient();
  const organizations = await loadClientOrganizations(client);

  if (!organizations.ready) {
    return buildEmptyOverview([organizations.error ?? "Nao foi possivel carregar empresas clientes."], normalizedFilters);
  }

  const organizationIds = organizations.rows.map((company) => company.id);
  const [integrations, credentials, webhooks, payments, actionLogs] = organizationIds.length > 0
    ? await Promise.all([
      loadOrganizationIntegrations(client, organizationIds),
      loadIntegrationCredentials(client, organizationIds),
      loadWebhookEndpoints(client, organizationIds),
      loadPaymentIntegrations(client, organizationIds),
      loadIntegrationActionLogs(client, organizationIds),
    ])
    : [
      readyResult<OrganizationIntegrationRow>(),
      readyResult<IntegrationCredentialRow>(),
      readyResult<WebhookEndpointRow>(),
      readyResult<PaymentIntegrationRow>(),
      readyResult<IntegrationActionLogRow>(),
    ];

  const schemaMessages = [integrations.error, credentials.error, webhooks.error, payments.error, actionLogs.error].filter(Boolean) as string[];
  const integrationsByOrg = groupByOrganization(integrations.rows);
  const credentialsByOrg = groupByOrganization(credentials.rows);
  const webhooksByOrg = groupByOrganization(webhooks.rows);
  const paymentsByOrg = groupByOrganization(payments.rows);
  const actionLogsByOrg = groupByOrganization(actionLogs.rows);

  const companies = organizations.rows.map((company) => {
    const companyName = company.name ?? "Empresa sem nome";
    const events = (actionLogsByOrg.get(company.id) ?? [])
      .map((log) => buildIntegrationEvent(log, company.id, companyName))
      .sort((a, b) => parseDateMs(b.createdAt) - parseDateMs(a.createdAt))
      .slice(0, 12);
    const providerStatuses = providerIds.map((providerId) => buildProviderStatus({
      providerId,
      integrations: integrationsByOrg.get(company.id) ?? [],
      credentials: credentialsByOrg.get(company.id) ?? [],
      webhooks: webhooksByOrg.get(company.id) ?? [],
      payments: paymentsByOrg.get(company.id) ?? [],
    }));

    const health = resolveCompanyHealth(providerStatuses);
    const firstIssue = providerStatuses.find((provider) => provider.status === "error" || provider.status === "warning")?.issue ?? null;

    return {
      id: company.id,
      name: companyName,
      slug: company.slug,
      planCode: company.plan_code,
      status: company.status,
      createdAt: company.created_at,
      providers: providerStatuses,
      health,
      issue: firstIssue,
      lastActivityAt: mostRecentDate([
        ...providerStatuses.map((provider) => provider.lastActivityAt),
        ...events.map((event) => event.createdAt),
      ]),
      events,
    };
  });

  const summaries = providerIds.map((providerId) => {
    const statuses = companies.map((company) => company.providers.find((provider) => provider.providerId === providerId)?.status ?? "not_configured");

    return {
      providerId,
      label: providerLabels[providerId],
      connected: statuses.filter((status) => status === "connected").length,
      warning: statuses.filter((status) => status === "warning").length,
      error: statuses.filter((status) => status === "error").length,
      notConfigured: statuses.filter((status) => status === "not_configured").length,
      selectionPending: companies.filter((company) => {
        const provider = company.providers.find((item) => item.providerId === providerId);
        return provider?.selectionStatus === "partial";
      }).length,
      total: statuses.length,
    };
  });
  const filteredCompanies = companies.filter((company) => matchesFilters(company, normalizedFilters));
  const selectedCompany = normalizedFilters.companyId
    ? companies.find((company) => company.id === normalizedFilters.companyId) ?? null
    : null;
  const alerts = filteredCompanies
    .flatMap((company) => buildCompanyAlerts(company, normalizedFilters))
    .sort(sortAlerts)
    .slice(0, 40);
  const recentEvents = companies
    .flatMap((company) => company.events)
    .sort((a, b) => parseDateMs(b.createdAt) - parseDateMs(a.createdAt))
    .slice(0, 20);

  return {
    generatedAt: new Date().toISOString(),
    filters: normalizedFilters,
    providerFilterOptions,
    statusFilterOptions,
    schemaReady: schemaMessages.length === 0,
    schemaMessages,
    totalCompanies: companies.length,
    filteredCompanies: filteredCompanies.length,
    connectedLinks: countProviderStatuses(companies, "connected"),
    warningLinks: countProviderStatuses(companies, "warning"),
    errorLinks: countProviderStatuses(companies, "error"),
    notConfiguredLinks: countProviderStatuses(companies, "not_configured"),
    selectionPendingLinks: countSelectionPending(companies),
    criticalAlerts: alerts.filter((alert) => alert.severity === "critical").length,
    warningAlerts: alerts.filter((alert) => alert.severity === "warning").length,
    infoAlerts: alerts.filter((alert) => alert.severity === "info").length,
    lastActivityAt: mostRecentDate(companies.map((company) => company.lastActivityAt)),
    providers: summaries,
    companies: filteredCompanies,
    selectedCompany,
    recentEvents,
    alerts,
  };
}

function buildEmptyOverview(
  schemaMessages: string[],
  filters: AdminClientIntegrationFilters = defaultFilters,
): AdminClientIntegrationsOverview {
  return {
    generatedAt: new Date().toISOString(),
    filters,
    providerFilterOptions,
    statusFilterOptions,
    schemaReady: false,
    schemaMessages,
    totalCompanies: 0,
    filteredCompanies: 0,
    connectedLinks: 0,
    warningLinks: 0,
    errorLinks: 0,
    notConfiguredLinks: 0,
    selectionPendingLinks: 0,
    criticalAlerts: 0,
    warningAlerts: 0,
    infoAlerts: 0,
    lastActivityAt: null,
    providers: providerIds.map((providerId) => ({
      providerId,
      label: providerLabels[providerId],
      connected: 0,
      warning: 0,
      error: 0,
      notConfigured: 0,
      selectionPending: 0,
      total: 0,
    })),
    companies: [],
    selectedCompany: null,
    recentEvents: [],
    alerts: [],
  };
}

function readyResult<T>(): QueryResult<T> {
  return { ready: true, rows: [], error: null };
}

async function loadClientOrganizations(client: ReturnType<typeof createServiceClient>): Promise<QueryResult<ClientOrganizationRow>> {
  const { data, error } = await client
    .from("organizations")
    .select("id, name, slug, plan_code, status, created_at")
    .like("slug", "empresa-cliente-%")
    .order("created_at", { ascending: false });

  if (error) {
    return { ready: false, rows: [], error: `organizations: ${error.message}` };
  }

  return { ready: true, rows: (data ?? []) as ClientOrganizationRow[], error: null };
}

async function loadOrganizationIntegrations(
  client: ReturnType<typeof createServiceClient>,
  organizationIds: string[],
): Promise<QueryResult<OrganizationIntegrationRow>> {
  const { data, error } = await client
    .from("organization_integrations")
    .select("id, organization_id, provider_id, status, connection_label, external_account_id, external_account_label, last_sync_at, last_test_at, last_error, metadata, connected_at, updated_at")
    .in("organization_id", organizationIds)
    .in("provider_id", ["meta-ads", "google-growth", "webhook-universal"]);

  if (error) {
    return { ready: false, rows: [], error: `organization_integrations: ${error.message}` };
  }

  return { ready: true, rows: (data ?? []) as OrganizationIntegrationRow[], error: null };
}

async function loadIntegrationCredentials(
  client: ReturnType<typeof createServiceClient>,
  organizationIds: string[],
): Promise<QueryResult<IntegrationCredentialRow>> {
  const { data, error } = await client
    .from("integration_credentials")
    .select("id, organization_id, integration_id, env_name, label, requirement, value_preview, updated_at")
    .eq("scope", "organization")
    .in("organization_id", organizationIds)
    .in("integration_id", ["meta", "google-ads"]);

  if (error) {
    return { ready: false, rows: [], error: `integration_credentials: ${error.message}` };
  }

  return { ready: true, rows: (data ?? []) as IntegrationCredentialRow[], error: null };
}

async function loadWebhookEndpoints(
  client: ReturnType<typeof createServiceClient>,
  organizationIds: string[],
): Promise<QueryResult<WebhookEndpointRow>> {
  const { data, error } = await client
    .from("integration_webhook_endpoints")
    .select("id, organization_id, provider_id, label, status, url_path, received_count, last_received_at, last_error, created_at, updated_at")
    .in("organization_id", organizationIds)
    .eq("provider_id", "webhook-universal");

  if (error) {
    return { ready: false, rows: [], error: `integration_webhook_endpoints: ${error.message}` };
  }

  return { ready: true, rows: (data ?? []) as WebhookEndpointRow[], error: null };
}

async function loadPaymentIntegrations(
  client: ReturnType<typeof createServiceClient>,
  organizationIds: string[],
): Promise<QueryResult<PaymentIntegrationRow>> {
  const { data, error } = await client
    .from("sales_catalog_payment_integrations")
    .select("id, organization_id, provider, status, account_label, provider_account_id, connected_at, last_error, webhook_url, created_at, updated_at")
    .in("organization_id", organizationIds)
    .eq("provider", "mercado_pago");

  if (error) {
    return { ready: false, rows: [], error: `sales_catalog_payment_integrations: ${error.message}` };
  }

  return { ready: true, rows: (data ?? []) as PaymentIntegrationRow[], error: null };
}

async function loadIntegrationActionLogs(
  client: ReturnType<typeof createServiceClient>,
  organizationIds: string[],
): Promise<QueryResult<IntegrationActionLogRow>> {
  const { data, error } = await client
    .from("integration_action_logs")
    .select("id, organization_id, provider_id, action, status, metadata, created_at")
    .in("organization_id", organizationIds)
    .order("created_at", { ascending: false })
    .limit(160);

  if (error) {
    return { ready: false, rows: [], error: `integration_action_logs: ${error.message}` };
  }

  return { ready: true, rows: (data ?? []) as IntegrationActionLogRow[], error: null };
}

function buildProviderStatus({
  providerId,
  integrations,
  credentials,
  webhooks,
  payments,
}: {
  providerId: AdminClientIntegrationProviderId;
  integrations: OrganizationIntegrationRow[];
  credentials: IntegrationCredentialRow[];
  webhooks: WebhookEndpointRow[];
  payments: PaymentIntegrationRow[];
}): AdminClientProviderStatus {
  if (providerId === "meta-ads") {
    return buildMetaStatus(integrations, credentials);
  }

  if (providerId === "google-growth") {
    return buildGoogleStatus(integrations, credentials);
  }

  if (providerId === "mercado-pago") {
    return buildMercadoPagoStatus(payments);
  }

  return buildWebhookStatus(integrations, webhooks);
}

function buildMetaStatus(integrations: OrganizationIntegrationRow[], credentials: IntegrationCredentialRow[]): AdminClientProviderStatus {
  const integration = latestIntegration(integrations, "meta-ads");
  const metadata = integration?.metadata ?? {};
  const error = integration?.last_error ?? null;
  const token = credential(credentials, "meta", "META_ACCESS_TOKEN");
  const adAccount = firstString(
    credential(credentials, "meta", "META_AD_ACCOUNT_ID")?.value_preview,
    integration?.external_account_id,
    readString(metadata, "selected_ad_account_id"),
    readString(metadata, "ad_account_id"),
  );
  const pageId = firstString(
    credential(credentials, "meta", "FACEBOOK_PAGE_ID")?.value_preview,
    readString(metadata, "selected_facebook_page_id"),
    readString(metadata, "facebook_page_id"),
  );
  const instagramId = firstString(
    credential(credentials, "meta", "INSTAGRAM_BUSINESS_ACCOUNT_ID")?.value_preview,
    readString(metadata, "selected_instagram_business_id"),
    readString(metadata, "instagram_business_id"),
  );
  const lastActivityAt = mostRecentDate([
    integration?.last_sync_at,
    integration?.last_test_at,
    integration?.connected_at ?? null,
    integration?.updated_at ?? null,
    token?.updated_at ?? null,
    credential(credentials, "meta", "META_AD_ACCOUNT_ID")?.updated_at ?? null,
    credential(credentials, "meta", "FACEBOOK_PAGE_ID")?.updated_at ?? null,
  ]);
  const hasConnection = Boolean(integration || token || adAccount || pageId || instagramId);
  const selection = resolveGuidedSelection(
    hasConnection,
    [
      guidedAsset("Conta de anuncios", adAccount, true),
      guidedAsset("Pagina Facebook", pageId, true),
      guidedAsset("Instagram Business", instagramId, false),
    ],
    "Ativos obrigatorios selecionados.",
    "Selecao guiada pendente",
  );

  if (error || integration?.status === "error") {
    return providerStatus("meta-ads", "error", integration?.external_account_label ?? adAccount, error ?? "Meta Ads retornou erro.", lastActivityAt, selection);
  }

  if ((integration?.status === "connected" || token) && adAccount && pageId) {
    const detail = instagramId ? "Conta de anuncios, pagina e Instagram mapeados." : "Conta e pagina mapeadas. Instagram opcional ausente.";
    return providerStatus("meta-ads", "connected", integration?.external_account_label ?? adAccount, detail, lastActivityAt, selection);
  }

  if (integration || token || adAccount || pageId || instagramId) {
    const missing = [
      token ? null : "token",
      adAccount ? null : "conta de anuncios",
      pageId ? null : "pagina Facebook",
    ].filter(Boolean).join(", ");

    return providerStatus("meta-ads", "warning", integration?.external_account_label ?? adAccount, `Pendente: ${missing || "selecionar ativos"}.`, lastActivityAt, selection);
  }

  return providerStatus("meta-ads", "not_configured", null, "Sem OAuth ou credenciais Meta.", null, selection);
}

function buildGoogleStatus(integrations: OrganizationIntegrationRow[], credentials: IntegrationCredentialRow[]): AdminClientProviderStatus {
  const integration = latestIntegration(integrations, "google-growth");
  const metadata = integration?.metadata ?? {};
  const error = integration?.last_error ?? null;
  const refreshToken = credential(credentials, "google-ads", "GOOGLE_ADS_REFRESH_TOKEN");
  const customerId = firstString(
    credential(credentials, "google-ads", "GOOGLE_ADS_CUSTOMER_ID")?.value_preview,
    integration?.external_account_id,
    readString(metadata, "selected_customer_id"),
  );
  const searchConsoleSite = credential(credentials, "google-ads", "GOOGLE_SEARCH_CONSOLE_SITE_URL")?.value_preview ?? null;
  const lastActivityAt = mostRecentDate([
    integration?.last_sync_at,
    integration?.last_test_at,
    integration?.connected_at ?? null,
    integration?.updated_at ?? null,
    refreshToken?.updated_at ?? null,
    credential(credentials, "google-ads", "GOOGLE_ADS_CUSTOMER_ID")?.updated_at ?? null,
  ]);
  const hasConnection = Boolean(integration || refreshToken || customerId || searchConsoleSite);
  const selection = resolveGuidedSelection(
    hasConnection,
    [
      guidedAsset("Conta Google Ads", customerId, true),
      guidedAsset("Search Console", searchConsoleSite, false),
    ],
    "Conta Google Ads selecionada.",
    "Selecao guiada pendente",
  );

  if (error || integration?.status === "error") {
    return providerStatus("google-growth", "error", integration?.external_account_label ?? customerId, error ?? "Google Ads retornou erro.", lastActivityAt, selection);
  }

  if ((integration?.status === "connected" || refreshToken) && customerId) {
    const detail = searchConsoleSite ? "Google Ads e Search Console mapeados." : "Google Ads mapeado. Search Console opcional ausente.";
    return providerStatus("google-growth", "connected", integration?.external_account_label ?? customerId, detail, lastActivityAt, selection);
  }

  if (integration || refreshToken || customerId) {
    const missing = [
      refreshToken ? null : "refresh token",
      customerId ? null : "customer ID",
    ].filter(Boolean).join(", ");

    return providerStatus("google-growth", "warning", integration?.external_account_label ?? customerId, `Pendente: ${missing || "selecionar conta"}.`, lastActivityAt, selection);
  }

  return providerStatus("google-growth", "not_configured", null, "Sem OAuth ou credenciais Google.", null, selection);
}

function buildMercadoPagoStatus(payments: PaymentIntegrationRow[]): AdminClientProviderStatus {
  const payment = latestPayment(payments);
  const account = payment?.account_label ?? payment?.provider_account_id ?? null;
  const lastActivityAt = mostRecentDate([
    payment?.connected_at ?? null,
    payment?.updated_at ?? null,
    payment?.created_at ?? null,
  ]);

  if (payment?.last_error || payment?.status === "error") {
    return providerStatus("mercado-pago", "error", account, payment.last_error ?? "Mercado Pago retornou erro.", lastActivityAt);
  }

  if (payment?.status === "connected") {
    const detail = payment.webhook_url ? "Conta e webhook mapeados." : "Conta conectada. Webhook pendente.";
    const status = payment.webhook_url ? "connected" : "warning";
    return providerStatus("mercado-pago", status, account, detail, lastActivityAt);
  }

  if (payment) {
    return providerStatus("mercado-pago", "warning", account, `Status atual: ${payment.status ?? "pendente"}.`, lastActivityAt);
  }

  return providerStatus("mercado-pago", "not_configured", null, "Sem conta Mercado Pago conectada.");
}

function buildWebhookStatus(integrations: OrganizationIntegrationRow[], webhooks: WebhookEndpointRow[]): AdminClientProviderStatus {
  const integration = latestIntegration(integrations, "webhook-universal");
  const activeEndpoints = webhooks.filter((endpoint) => endpoint.status === "active");
  const latestWebhook = latestByDate(webhooks, ["last_received_at", "updated_at", "created_at"]);
  const endpointError = webhooks.find((endpoint) => endpoint.last_error)?.last_error ?? null;
  const lastActivityAt = mostRecentDate([
    integration?.last_sync_at,
    integration?.last_test_at,
    integration?.connected_at ?? null,
    integration?.updated_at ?? null,
    latestWebhook?.last_received_at ?? null,
    latestWebhook?.updated_at ?? null,
    latestWebhook?.created_at ?? null,
  ]);

  if (endpointError || integration?.last_error || integration?.status === "error") {
    return providerStatus("webhook-universal", "error", latestWebhook?.label ?? null, endpointError ?? integration?.last_error ?? "Webhook retornou erro.", lastActivityAt);
  }

  if (activeEndpoints.length > 0) {
    const receivedCount = activeEndpoints.reduce((total, endpoint) => total + (endpoint.received_count ?? 0), 0);
    return providerStatus("webhook-universal", "connected", `${activeEndpoints.length} endpoint(s)`, `${receivedCount} evento(s) recebidos.`, lastActivityAt);
  }

  if (integration || webhooks.length > 0) {
    return providerStatus("webhook-universal", "warning", latestWebhook?.label ?? null, "Sem endpoint ativo.", lastActivityAt);
  }

  return providerStatus("webhook-universal", "not_configured", null, "Nenhum endpoint criado.");
}

function buildIntegrationEvent(
  log: IntegrationActionLogRow,
  companyId: string,
  companyName: string,
): AdminClientIntegrationEvent {
  const metadata = log.metadata ?? {};
  const providerId = normalizeProviderId(log.provider_id, metadata);

  return {
    id: log.id,
    companyId,
    companyName,
    providerId,
    providerLabel: providerId ? providerLabels[providerId] : "Integracao",
    actionKey: log.action,
    action: humanizeAction(log.action),
    status: normalizeEventStatus(log.status),
    message: firstString(
      readString(metadata, "message"),
      readString(metadata, "detail"),
      readString(metadata, "error"),
      readString(metadata, "last_error"),
      readString(metadata, "status_message"),
    ),
    createdAt: log.created_at,
  };
}

function guidedAsset(
  label: string,
  value: string | null | undefined,
  required: boolean,
): AdminClientProviderSelectedAsset {
  const normalizedValue = typeof value === "string" && value.trim() ? value.trim() : null;

  return {
    label,
    value: normalizedValue,
    required,
    ready: Boolean(normalizedValue),
  };
}

function resolveGuidedSelection(
  hasConnection: boolean,
  selectedAssets: AdminClientProviderSelectedAsset[],
  completeLabel: string,
  pendingLabel: string,
): Pick<AdminClientProviderStatus, "selectionStatus" | "selectionLabel" | "selectedAssets"> {
  if (!hasConnection) {
    return {
      selectionStatus: "not_available",
      selectionLabel: "Aguardando OAuth ou credenciais.",
      selectedAssets,
    };
  }

  const requiredAssets = selectedAssets.filter((asset) => asset.required);
  const missingRequiredAssets = requiredAssets.filter((asset) => !asset.ready);

  if (requiredAssets.length === 0) {
    return {
      selectionStatus: "not_required",
      selectionLabel: "Nao exige selecao guiada.",
      selectedAssets,
    };
  }

  if (missingRequiredAssets.length === 0) {
    const missingOptionalAssets = selectedAssets
      .filter((asset) => !asset.required && !asset.ready)
      .map((asset) => asset.label);

    return {
      selectionStatus: "complete",
      selectionLabel: missingOptionalAssets.length > 0
        ? `${completeLabel} Opcional ausente: ${missingOptionalAssets.join(", ")}.`
        : completeLabel,
      selectedAssets,
    };
  }

  return {
    selectionStatus: "partial",
    selectionLabel: `${pendingLabel}: ${missingRequiredAssets.map((asset) => asset.label).join(", ")}.`,
    selectedAssets,
  };
}

function providerStatus(
  providerId: AdminClientIntegrationProviderId,
  status: AdminClientIntegrationStatus,
  accountLabel: string | null,
  detail: string,
  lastActivityAt: string | null = null,
  selection: Partial<Pick<AdminClientProviderStatus, "selectionStatus" | "selectionLabel" | "selectedAssets">> = {},
): AdminClientProviderStatus {
  const provider = {
    providerId,
    label: providerLabels[providerId],
    status,
    statusLabel: statusLabel(status),
    accountLabel,
    detail,
    lastActivityAt,
    issue: status === "connected" ? null : detail,
    selectionStatus: selection.selectionStatus ?? "not_required",
    selectionLabel: selection.selectionLabel ?? "Nao exige selecao guiada.",
    selectedAssets: selection.selectedAssets ?? [],
  };

  return {
    ...provider,
    supportAction: buildSupportAction(provider),
  };
}

function buildSupportAction(provider: Omit<AdminClientProviderStatus, "supportAction">): AdminClientSupportAction {
  const customerRoute = providerCustomerRoutes[provider.providerId];
  const dashboardRoute = providerDashboardRoutes[provider.providerId] ?? customerRoute;
  const missingRequiredAssets = missingAssetLabels(provider);
  const missingAssetsText = missingRequiredAssets.length > 0 ? missingRequiredAssets.join(", ") : "ativos obrigatorios";

  if (provider.status === "error") {
    return {
      kind: "fix_error",
      title: "Corrigir erro antes do reteste",
      detail: "Abra os logs, valide se a conta ainda esta autorizada e peca ao cliente para reconectar se a falha for de OAuth ou permissao.",
      href: customerRoute.href,
      hrefLabel: customerRoute.label,
      priority: "critical",
      customerMessage: `Identificamos uma falha na integracao ${provider.label}. Acesse Integracoes na ConnectyHub, reconecte a conta se for solicitado e nos avise para retestarmos.`,
    };
  }

  if (provider.selectionStatus === "partial") {
    return {
      kind: "select_assets",
      title: "Completar selecao guiada",
      detail: `A conexao existe, mas ainda falta selecionar ${missingAssetsText}. O cliente precisa voltar em Integracoes e salvar a escolha guiada.`,
      href: customerRoute.href,
      hrefLabel: customerRoute.label,
      priority: "warning",
      customerMessage: `A conexao com ${provider.label} foi autorizada, mas ainda falta selecionar ${missingAssetsText}. Acesse Integracoes, abra ${provider.label} e salve a selecao guiada.`,
    };
  }

  if (provider.status === "warning") {
    return {
      kind: "connect",
      title: "Resolver pendencia de conexao",
      detail: "Oriente o cliente a revisar a integracao no painel dele e salve um reteste no admin depois da correcao.",
      href: customerRoute.href,
      hrefLabel: customerRoute.label,
      priority: "warning",
      customerMessage: `A integracao ${provider.label} esta pendente. Acesse Integracoes na ConnectyHub, revise a conexao e nos avise quando finalizar para validarmos.`,
    };
  }

  if (provider.status === "not_configured") {
    return {
      kind: "connect",
      title: "Pedir conexao ao cliente",
      detail: "Esse cliente ainda nao conectou o provedor. A proxima acao e orientar a conexao no painel do usuario.",
      href: customerRoute.href,
      hrefLabel: customerRoute.label,
      priority: "warning",
      customerMessage: `Para liberar os dados de ${provider.label}, acesse Integracoes na ConnectyHub e conecte sua conta. Depois da autorizacao, selecione os ativos solicitados e nos avise.`,
    };
  }

  if (!provider.lastActivityAt) {
    return {
      kind: "sync",
      title: "Rodar primeira sincronizacao",
      detail: "A conexao esta pronta, mas ainda nao ha evento, teste ou sincronizacao registrada para acompanhamento.",
      href: dashboardRoute.href,
      hrefLabel: dashboardRoute.label,
      priority: "info",
      customerMessage: `A integracao ${provider.label} esta conectada. Abra o dashboard do provedor na ConnectyHub e clique em Sincronizar para atualizar a primeira leitura.`,
    };
  }

  const days = daysSince(provider.lastActivityAt);

  if (days >= staleActivityDays) {
    return {
      kind: "sync",
      title: "Revisar sincronizacao",
      detail: `Ultima atividade ha ${days} dia(s). Vale sincronizar e confirmar se a leitura continua retornando dados.`,
      href: dashboardRoute.href,
      hrefLabel: dashboardRoute.label,
      priority: "info",
      customerMessage: `A integracao ${provider.label} esta conectada, mas esta sem atualizacao recente. Abra o dashboard do provedor na ConnectyHub e clique em Sincronizar.`,
    };
  }

  return {
    kind: "monitor",
    title: "Monitorar normalmente",
    detail: "Conexao ativa, selecao resolvida e atividade recente dentro da janela esperada.",
    href: dashboardRoute.href,
    hrefLabel: dashboardRoute.label,
    priority: "info",
    customerMessage: `A integracao ${provider.label} esta conectada e sem pendencias no momento.`,
  };
}

function missingAssetLabels(provider: Pick<AdminClientProviderStatus, "selectedAssets">) {
  return provider.selectedAssets
    .filter((asset) => asset.required && !asset.ready)
    .map((asset) => asset.label);
}

function buildCompanyAlerts(
  company: AdminClientIntegrationCompany,
  filters: AdminClientIntegrationFilters,
): AdminClientIntegrationAlert[] {
  const providers = filters.provider === "all"
    ? company.providers
    : company.providers.filter((provider) => provider.providerId === filters.provider);

  return providers.flatMap((provider) => {
    if (filters.status === "selection_pending" && provider.selectionStatus !== "partial") return [];
    if (filters.status !== "all" && filters.status !== "selection_pending" && provider.status !== filters.status) return [];
    return buildProviderAlerts(company, provider);
  });
}

function buildProviderAlerts(
  company: AdminClientIntegrationCompany,
  provider: AdminClientProviderStatus,
): AdminClientIntegrationAlert[] {
  if (hasAdminAcknowledgement(company, provider)) {
    return [];
  }

  if (provider.status === "error") {
    return [integrationAlert(company, provider, "critical", `${provider.label} com erro`, provider.issue ?? provider.detail)];
  }

  if (provider.status === "warning") {
    return [integrationAlert(company, provider, "warning", `${provider.label} pendente`, provider.issue ?? provider.detail)];
  }

  if (provider.status !== "connected") {
    return [];
  }

  if (!provider.lastActivityAt) {
    return [integrationAlert(
      company,
      provider,
      "info",
      `${provider.label} sem atividade registrada`,
      "A conexao existe, mas ainda nao ha sincronizacao, teste ou evento recente registrado.",
    )];
  }

  const days = daysSince(provider.lastActivityAt);

  if (days >= staleActivityDays) {
    return [integrationAlert(
      company,
      provider,
      "info",
      `${provider.label} sem atividade recente`,
      `Ultima atividade ha ${days} dia(s). Verifique se a sincronizacao continua ativa.`,
    )];
  }

  return [];
}

function hasAdminAcknowledgement(company: AdminClientIntegrationCompany, provider: AdminClientProviderStatus) {
  const lastProviderActivity = parseDateMs(provider.lastActivityAt);

  return company.events.some((event) => {
    if (event.providerId !== provider.providerId) return false;
    if (event.actionKey !== "admin_alert_acknowledged") return false;

    const acknowledgedAt = parseDateMs(event.createdAt);
    if (!acknowledgedAt) return false;

    return !lastProviderActivity || acknowledgedAt >= lastProviderActivity;
  });
}

function integrationAlert(
  company: AdminClientIntegrationCompany,
  provider: AdminClientProviderStatus,
  severity: AdminClientIntegrationAlertSeverity,
  title: string,
  detail: string,
): AdminClientIntegrationAlert {
  return {
    id: `${company.id}-${provider.providerId}-${severity}-${provider.lastActivityAt ?? "sem-data"}`,
    companyId: company.id,
    companyName: company.name,
    providerId: provider.providerId,
    providerLabel: provider.label,
    severity,
    title,
    detail,
    lastActivityAt: provider.lastActivityAt,
    supportAction: provider.supportAction,
  };
}

function sortAlerts(a: AdminClientIntegrationAlert, b: AdminClientIntegrationAlert) {
  const severityDiff = alertWeight(a.severity) - alertWeight(b.severity);
  if (severityDiff !== 0) return severityDiff;
  return parseDateMs(b.lastActivityAt) - parseDateMs(a.lastActivityAt);
}

function alertWeight(severity: AdminClientIntegrationAlertSeverity) {
  if (severity === "critical") return 0;
  if (severity === "warning") return 1;
  return 2;
}

function statusLabel(status: AdminClientIntegrationStatus) {
  if (status === "connected") return "Conectado";
  if (status === "warning") return "Pendente";
  if (status === "error") return "Erro";
  return "Sem conexao";
}

function normalizeEventStatus(status: string | null): AdminClientIntegrationEventStatus {
  if (status === "error") return "error";
  if (status === "warning") return "warning";
  return "success";
}

function normalizeProviderId(
  providerId: string | null,
  metadata: Record<string, unknown>,
): AdminClientIntegrationProviderId | null {
  const candidates = [
    providerId,
    readString(metadata, "provider_id"),
    readString(metadata, "provider"),
    readString(metadata, "integration_id"),
  ];

  for (const candidate of candidates) {
    if (isProviderId(candidate)) return candidate;
    if (candidate === "meta") return "meta-ads";
    if (candidate === "google-ads" || candidate === "google") return "google-growth";
    if (candidate === "mercado_pago") return "mercado-pago";
    if (candidate === "webhook") return "webhook-universal";
  }

  return null;
}

function humanizeAction(action: string) {
  if (action === "admin_alert_acknowledged") return "Acompanhamento registrado";
  if (action === "admin_retest_requested") return "Reteste solicitado";

  return action
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function resolveCompanyHealth(providers: AdminClientProviderStatus[]): AdminClientIntegrationStatus {
  if (providers.some((provider) => provider.status === "error")) return "error";
  if (providers.some((provider) => provider.status === "warning")) return "warning";
  if (providers.some((provider) => provider.status === "connected")) return "connected";
  return "not_configured";
}

function countProviderStatuses(companies: AdminClientIntegrationCompany[], status: AdminClientIntegrationStatus) {
  return companies.reduce((total, company) => total + company.providers.filter((provider) => provider.status === status).length, 0);
}

function countSelectionPending(companies: AdminClientIntegrationCompany[]) {
  return companies.reduce((total, company) => total + company.providers.filter((provider) => provider.selectionStatus === "partial").length, 0);
}

function matchesFilters(company: AdminClientIntegrationCompany, filters: AdminClientIntegrationFilters) {
  const providers = filters.provider === "all"
    ? company.providers
    : company.providers.filter((provider) => provider.providerId === filters.provider);

  if (filters.status === "all") {
    return providers.length > 0;
  }

  if (filters.status === "selection_pending") {
    return providers.some((provider) => provider.selectionStatus === "partial");
  }

  return providers.some((provider) => provider.status === filters.status);
}

function groupByOrganization<T extends { organization_id: string }>(rows: T[]) {
  const map = new Map<string, T[]>();

  for (const row of rows) {
    const existing = map.get(row.organization_id) ?? [];
    existing.push(row);
    map.set(row.organization_id, existing);
  }

  return map;
}

function latestIntegration(rows: OrganizationIntegrationRow[], providerId: string) {
  return latestByDate(rows.filter((row) => row.provider_id === providerId), ["last_sync_at", "last_test_at", "updated_at", "connected_at"]);
}

function latestPayment(rows: PaymentIntegrationRow[]) {
  return latestByDate(rows, ["connected_at", "updated_at", "created_at"]);
}

function latestByDate<T extends Record<string, unknown>>(rows: T[], fields: string[]): T | null {
  return rows.reduce<T | null>((latest, row) => {
    if (!latest) return row;
    return maxDateMs(row, fields) > maxDateMs(latest, fields) ? row : latest;
  }, null);
}

function maxDateMs(row: Record<string, unknown>, fields: string[]) {
  return Math.max(0, ...fields.map((field) => parseDateMs(typeof row[field] === "string" ? row[field] : null)));
}

function mostRecentDate(values: Array<string | null | undefined>) {
  const valid = values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => parseDateMs(b) - parseDateMs(a));

  return valid[0] ?? null;
}

function parseDateMs(value: string | null | undefined) {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function daysSince(value: string) {
  const ms = parseDateMs(value);
  if (!ms) return 0;
  return Math.floor((Date.now() - ms) / 86_400_000);
}

function credential(credentials: IntegrationCredentialRow[], integrationId: string, envName: string) {
  return latestByDate(
    credentials.filter((item) => item.integration_id === integrationId && item.env_name === envName),
    ["updated_at"],
  );
}

function readString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstString(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() ?? null;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeFilters(filters: Partial<AdminClientIntegrationFilters>): AdminClientIntegrationFilters {
  return {
    provider: isProviderId(filters.provider) ? filters.provider : "all",
    status: isFilterStatus(filters.status) ? filters.status : "all",
    companyId: filters.companyId?.trim() || null,
  };
}

function isProviderId(value: unknown): value is AdminClientIntegrationProviderId {
  return typeof value === "string" && providerIds.includes(value as AdminClientIntegrationProviderId);
}

function isFilterStatus(value: unknown): value is AdminClientIntegrationFilterStatus {
  return value === "all"
    || value === "connected"
    || value === "warning"
    || value === "error"
    || value === "not_configured"
    || value === "selection_pending";
}
