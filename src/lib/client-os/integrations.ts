import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientCompany } from "@/lib/client-os/companies";
import { listClientCompanies } from "@/lib/client-os/companies";
import { listClientSalesCatalogPaymentIntegrations } from "@/lib/client-os/sales-catalog";
import type { ClientSalesCatalogPaymentIntegration } from "@/lib/sales-catalog/shared";
import { createServiceClient } from "@/lib/supabase/service";

export type IntegrationCategory =
  | "payments"
  | "ads"
  | "commerce"
  | "calendar"
  | "shipping"
  | "webhooks";

export type IntegrationProviderStatus = "active" | "next" | "planned" | "built_in";
export type IntegrationProviderMode = "external" | "internal" | "hybrid";
export type IntegrationConnectionStatus =
  | "connected"
  | "pending"
  | "available"
  | "planned"
  | "disabled"
  | "error"
  | "not_configured";

export type ClientIntegrationProvider = {
  id: string;
  name: string;
  category: IntegrationCategory;
  status: IntegrationProviderStatus;
  mode: IntegrationProviderMode;
  headline: string;
  summary: string;
  phase: string;
  primaryUse: string;
  actionLabel: string;
  actionHref: string | null;
  protectedFlow?: boolean;
  items: string[];
  metrics: string[];
};

export type ClientIntegrationConnection = {
  providerId: string;
  companyId: string;
  companyName: string;
  status: IntegrationConnectionStatus;
  label: string;
  detail: string;
  accountLabel: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  managementHref: string | null;
  metadata: Record<string, unknown>;
};

export type ClientIntegrationWebhookEndpoint = {
  id: string;
  companyId: string;
  providerId: string;
  label: string;
  status: "active" | "paused" | "disabled";
  urlPath: string;
  endpointUrl: string | null;
  events: string[];
  receivedCount: number;
  lastReceivedAt: string | null;
  lastError: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ClientIntegrationHubState = {
  schemaReady: boolean;
  schemaMessage: string | null;
  appBaseUrl: string | null;
  companies: ClientCompany[];
  selectedCompanyId: string | null;
  providers: ClientIntegrationProvider[];
  connections: ClientIntegrationConnection[];
  webhookEndpoints: ClientIntegrationWebhookEndpoint[];
};

type OrganizationIntegrationRow = {
  id: string;
  organization_id: string;
  provider_id: string;
  status: string | null;
  connection_label: string | null;
  external_account_label: string | null;
  last_sync_at: string | null;
  last_test_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown> | null;
};

type WebhookEndpointRow = {
  id: string;
  organization_id: string;
  provider_id: string;
  label: string | null;
  status: string | null;
  url_path: string | null;
  events: string[] | null;
  received_count: number | null;
  last_received_at: string | null;
  last_error: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const integrationProviders: ClientIntegrationProvider[] = [
  {
    id: "mercado-pago",
    name: "Mercado Pago",
    category: "payments",
    status: "active",
    mode: "external",
    headline: "Recebimento por Pix e cartao no catalogo",
    summary: "Gateway unico nesta etapa. A Central apenas espelha a conexao existente do Catalogo de Vendas.",
    phase: "Fase 1 - protegido",
    primaryUse: "Checkout, Pix, cartao, webhook de pagamento e status de pedido.",
    actionLabel: "Abrir Catalogo",
    actionHref: "/dashboard/links",
    protectedFlow: true,
    items: ["OAuth existente", "Pix e cartao", "Webhook ja criado"],
    metrics: ["pagamentos", "pedidos", "receita"],
  },
  {
    id: "meta-ads",
    name: "Meta Ads / Instagram / Facebook",
    category: "ads",
    status: "next",
    mode: "external",
    headline: "Acompanhamento de campanhas e leads",
    summary: "Primeiro entra em modo leitura para gasto, leads, CTR, CPL e alertas. Execucao com IA fica para fase futura.",
    phase: "Fase 3 - leitura",
    primaryUse: "Monitorar campanhas, criativos, formularios, direct e comentarios.",
    actionLabel: "Planejado",
    actionHref: null,
    items: ["Campanhas", "Leads", "Criativos", "Alertas IA"],
    metrics: ["gasto", "CPL", "leads", "CTR"],
  },
  {
    id: "google-growth",
    name: "Google Ads / Business / Search Console",
    category: "ads",
    status: "next",
    mode: "external",
    headline: "Painel de aquisicao e presenca Google",
    summary: "Primeiro acompanha campanhas, conversoes, palavras-chave, avaliacoes e presenca local.",
    phase: "Fase 3 - leitura",
    primaryUse: "Unir anuncios, busca organica, Google Business e recomendacoes da IA.",
    actionLabel: "Planejado",
    actionHref: null,
    items: ["Google Ads", "Business Profile", "Search Console"],
    metrics: ["cliques", "CPC", "conversoes", "avaliacoes"],
  },
  {
    id: "ecommerce-hub",
    name: "E-commerce",
    category: "commerce",
    status: "planned",
    mode: "external",
    headline: "Produtos, estoque, pedidos e carrinho",
    summary: "Camada para Shopify, WooCommerce e Nuvemshop. A ConnectyHub centraliza venda e atendimento.",
    phase: "Fase 4",
    primaryUse: "Sincronizar catalogo, estoque, pedidos e abandono de carrinho.",
    actionLabel: "Planejado",
    actionHref: null,
    items: ["Shopify", "WooCommerce", "Nuvemshop"],
    metrics: ["pedidos", "estoque", "carrinhos", "receita"],
  },
  {
    id: "calendar-hub",
    name: "Agenda ConnectyHub",
    category: "calendar",
    status: "built_in",
    mode: "hybrid",
    headline: "Agenda propria com Google Calendar opcional",
    summary: "A agenda principal sera nossa; Google Calendar entra como espelho para conflitos e convites.",
    phase: "Fase 4",
    primaryUse: "Agendamentos do WhatsApp, CRM, follow-up e sincronizacao externa opcional.",
    actionLabel: "Planejado",
    actionHref: null,
    items: ["Agenda interna", "Google Calendar opcional", "Follow-up"],
    metrics: ["reunioes", "comparecimento", "tarefas"],
  },
  {
    id: "shipping-hub",
    name: "Envios e frete",
    category: "shipping",
    status: "planned",
    mode: "hybrid",
    headline: "Camada propria de logistica",
    summary: "Comeca com provedores externos, mas preparada para regras internas de frete e retirada.",
    phase: "Fase 5",
    primaryUse: "Cotacao, rastreio, prazos, retirada e atualizacao do pedido no WhatsApp.",
    actionLabel: "Planejado",
    actionHref: null,
    items: ["Melhor Envio", "Correios", "Jadlog", "Kangu", "Loggi"],
    metrics: ["prazo", "frete", "rastreamento"],
  },
  {
    id: "webhook-universal",
    name: "Webhook Universal",
    category: "webhooks",
    status: "active",
    mode: "hybrid",
    headline: "Entrada e saida generica de eventos",
    summary: "Para receber leads externos e enviar eventos quando algo acontecer na ConnectyHub.",
    phase: "Fase 2 - base",
    primaryUse: "Conectar sistemas que ainda nao tem integracao nativa.",
    actionLabel: "Criar endpoint",
    actionHref: null,
    items: ["Entrada assinada", "Eventos no CRM", "Logs"],
    metrics: ["eventos", "erros", "ultima entrega"],
  },
];

export async function getClientIntegrationHub(input: {
  userId: string;
  preferredCompanyId?: string | null;
  client?: SupabaseClient;
}): Promise<ClientIntegrationHubState> {
  const client = input.client ?? createServiceClient();
  const companies = await listClientCompanies(input.userId, client);
  const selectedCompanyId = resolveSelectedCompanyId(companies, input.preferredCompanyId);
  const companyIds = companies.map((company) => company.id);

  const [paymentIntegrations, genericResult, webhookResult] = await Promise.all([
    listClientSalesCatalogPaymentIntegrations({ userId: input.userId, client }).catch(() => []),
    loadOrganizationIntegrations(client, companyIds),
    loadWebhookEndpoints(client, companyIds),
  ]);

  const connections = [
    ...buildMercadoPagoConnections(companies, paymentIntegrations),
    ...buildGenericConnections(companies, genericResult.rows),
    ...buildFallbackConnections(companies, genericResult.rows, webhookResult.rows),
  ];
  const schemaReady = genericResult.ready && webhookResult.ready;

  return {
    schemaReady,
    schemaMessage: schemaReady ? null : "A migration 0028 ainda precisa ser aplicada no Supabase para ativar conexoes novas e Webhook Universal.",
    appBaseUrl: resolveAppBaseUrl(),
    companies,
    selectedCompanyId,
    providers: integrationProviders,
    connections,
    webhookEndpoints: webhookResult.rows.map((row) => mapWebhookEndpoint(row)),
  };
}

export function getIntegrationProviders() {
  return integrationProviders;
}

function resolveSelectedCompanyId(companies: ClientCompany[], preferred?: string | null) {
  if (preferred && companies.some((company) => company.id === preferred)) {
    return preferred;
  }

  return companies[0]?.id ?? null;
}

function buildMercadoPagoConnections(
  companies: ClientCompany[],
  integrations: ClientSalesCatalogPaymentIntegration[],
): ClientIntegrationConnection[] {
  return companies.map((company) => {
    const integration = integrations.find((item) => item.companyId === company.id && item.provider === "mercado_pago");

    if (!integration) {
      return {
        providerId: "mercado-pago",
        companyId: company.id,
        companyName: company.name,
        status: "not_configured",
        label: "Aguardando conexao",
        detail: "Conecte pelo Catalogo de Vendas para liberar checkout Pix/cartao.",
        accountLabel: null,
        lastSyncAt: null,
        lastError: null,
        managementHref: "/dashboard/links",
        metadata: {},
      };
    }

    return {
      providerId: "mercado-pago",
      companyId: company.id,
      companyName: company.name,
      status: mapPaymentStatus(integration.status),
      label: formatPaymentStatus(integration.status),
      detail: integration.connectedAt
        ? `Conectado em ${formatDateTime(integration.connectedAt)}`
        : "Fluxo Mercado Pago iniciado no Catalogo de Vendas.",
      accountLabel: integration.accountLabel ?? integration.providerAccountId,
      lastSyncAt: integration.updatedAt ?? integration.connectedAt,
      lastError: integration.lastError,
      managementHref: "/dashboard/links",
      metadata: {
        has_access_token: integration.hasAccessToken,
        has_refresh_token: integration.hasRefreshToken,
        has_webhook_secret: integration.hasWebhookSecret,
        webhook_url: integration.webhookUrl,
      },
    };
  });
}

function buildGenericConnections(
  companies: ClientCompany[],
  rows: OrganizationIntegrationRow[],
): ClientIntegrationConnection[] {
  return rows.map((row) => {
    const company = companies.find((item) => item.id === row.organization_id);

    return {
      providerId: row.provider_id,
      companyId: row.organization_id,
      companyName: company?.name ?? "Empresa",
      status: mapGenericStatus(row.status),
      label: row.connection_label ?? formatGenericStatus(row.status),
      detail: row.last_sync_at ? `Ultima sincronizacao ${formatDateTime(row.last_sync_at)}` : "Conexao registrada na Central.",
      accountLabel: row.external_account_label,
      lastSyncAt: row.last_sync_at ?? row.last_test_at,
      lastError: row.last_error,
      managementHref: null,
      metadata: row.metadata ?? {},
    };
  });
}

function buildFallbackConnections(
  companies: ClientCompany[],
  rows: OrganizationIntegrationRow[],
  webhookRows: WebhookEndpointRow[],
): ClientIntegrationConnection[] {
  const existing = new Set(rows.map((row) => `${row.organization_id}:${row.provider_id}`));
  const connections: ClientIntegrationConnection[] = [];

  for (const company of companies) {
    for (const provider of integrationProviders) {
      const key = `${company.id}:${provider.id}`;

      if (provider.id === "mercado-pago" || existing.has(key)) {
        continue;
      }

      const webhookCount = provider.id === "webhook-universal"
        ? webhookRows.filter((row) => row.organization_id === company.id).length
        : 0;

      connections.push({
        providerId: provider.id,
        companyId: company.id,
        companyName: company.name,
        status: resolveFallbackStatus(provider, webhookCount),
        label: webhookCount > 0 ? `${webhookCount} endpoint(s)` : fallbackLabel(provider),
        detail: fallbackDetail(provider, webhookCount),
        accountLabel: null,
        lastSyncAt: null,
        lastError: null,
        managementHref: provider.actionHref,
        metadata: webhookCount > 0 ? { webhook_endpoints: webhookCount } : {},
      });
    }
  }

  return connections;
}

async function loadOrganizationIntegrations(client: SupabaseClient, companyIds: string[]) {
  if (companyIds.length === 0) {
    return { ready: true, rows: [] as OrganizationIntegrationRow[] };
  }

  const { data, error } = await client
    .from("organization_integrations")
    .select("id, organization_id, provider_id, status, connection_label, external_account_label, last_sync_at, last_test_at, last_error, metadata")
    .in("organization_id", companyIds)
    .order("updated_at", { ascending: false });

  if (error) {
    return { ready: false, rows: [] as OrganizationIntegrationRow[] };
  }

  return { ready: true, rows: (data ?? []) as OrganizationIntegrationRow[] };
}

async function loadWebhookEndpoints(client: SupabaseClient, companyIds: string[]) {
  if (companyIds.length === 0) {
    return { ready: true, rows: [] as WebhookEndpointRow[] };
  }

  const { data, error } = await client
    .from("integration_webhook_endpoints")
    .select("id, organization_id, provider_id, label, status, url_path, events, received_count, last_received_at, last_error, created_at, updated_at")
    .in("organization_id", companyIds)
    .order("created_at", { ascending: false });

  if (error) {
    return { ready: false, rows: [] as WebhookEndpointRow[] };
  }

  return { ready: true, rows: (data ?? []) as WebhookEndpointRow[] };
}

function mapWebhookEndpoint(row: WebhookEndpointRow): ClientIntegrationWebhookEndpoint {
  const urlPath = row.url_path ?? `/api/webhooks/universal/${row.id}`;
  const appBaseUrl = resolveAppBaseUrl();

  return {
    id: row.id,
    companyId: row.organization_id,
    providerId: row.provider_id,
    label: row.label ?? "Webhook Universal",
    status: normalizeWebhookStatus(row.status),
    urlPath,
    endpointUrl: appBaseUrl ? `${appBaseUrl}${urlPath}` : null,
    events: Array.isArray(row.events) ? row.events : [],
    receivedCount: typeof row.received_count === "number" ? row.received_count : 0,
    lastReceivedAt: row.last_received_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPaymentStatus(status: ClientSalesCatalogPaymentIntegration["status"]): IntegrationConnectionStatus {
  if (status === "connected") return "connected";
  if (status === "disabled") return "disabled";
  if (status === "error") return "error";
  return "pending";
}

function mapGenericStatus(status: string | null): IntegrationConnectionStatus {
  if (status === "connected" || status === "available" || status === "disabled" || status === "error" || status === "pending") {
    return status;
  }

  return "pending";
}

function resolveFallbackStatus(provider: ClientIntegrationProvider, webhookCount: number): IntegrationConnectionStatus {
  if (webhookCount > 0) return "connected";
  if (provider.status === "active" || provider.status === "built_in") return "available";
  if (provider.status === "next") return "planned";
  return "planned";
}

function fallbackLabel(provider: ClientIntegrationProvider) {
  if (provider.id === "webhook-universal") return "Pronto para criar";
  if (provider.status === "built_in") return "Base interna";
  if (provider.status === "next") return "Proxima etapa";
  return "Planejado";
}

function fallbackDetail(provider: ClientIntegrationProvider, webhookCount: number) {
  if (webhookCount > 0) return "Endpoint universal criado para esta empresa.";
  if (provider.id === "webhook-universal") return "Aplique a migration e crie o primeiro endpoint assinado.";
  return provider.primaryUse;
}

function formatPaymentStatus(status: ClientSalesCatalogPaymentIntegration["status"]) {
  if (status === "connected") return "Conectado";
  if (status === "disabled") return "Desativado";
  if (status === "error") return "Com erro";
  return "Pendente";
}

function formatGenericStatus(status: string | null) {
  if (status === "connected") return "Conectado";
  if (status === "available") return "Disponivel";
  if (status === "disabled") return "Desativado";
  if (status === "error") return "Com erro";
  return "Pendente";
}

function normalizeWebhookStatus(status: string | null): ClientIntegrationWebhookEndpoint["status"] {
  if (status === "paused" || status === "disabled") return status;
  return "active";
}

function resolveAppBaseUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "",
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const url = new URL(candidate);
      return url.origin;
    } catch {
      continue;
    }
  }

  return null;
}

function formatDateTime(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}
