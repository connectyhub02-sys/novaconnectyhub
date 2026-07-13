import type { StatusTone, Tone } from "@/lib/connectyhub-os-data";
import { getUazapiConfig } from "@/lib/uazapi/client";
import { uazapiOperations } from "@/lib/uazapi/operations";

export type CredentialKind = "secret" | "public" | "endpoint" | "identifier";
export type CredentialRequirement = "required" | "recommended" | "optional";

export type CredentialDefinition = {
  label: string;
  env: string;
  aliases?: string[];
  kind: CredentialKind;
  requirement: CredentialRequirement;
  help: string;
};

export type IntegrationDefinition = {
  id: string;
  name: string;
  sector: string;
  owner: string;
  description: string;
  tone: Tone;
  modules: string[];
  fields: CredentialDefinition[];
};

export type CredentialSnapshot = CredentialDefinition & {
  configured: boolean;
  displayValue: string;
  resolvedEnv: string;
  source: "environment" | "vault" | "missing";
};

export type IntegrationSnapshot = Omit<IntegrationDefinition, "fields"> & {
  status: StatusTone;
  readiness: number;
  configuredFields: number;
  missingRequired: number;
  fields: CredentialSnapshot[];
};

export type MaintenanceDiagnostic = {
  label: string;
  value: string;
  detail: string;
  status: StatusTone;
};

export type MaintenanceVaultSnapshot = {
  generatedAt: string;
  environment: string;
  summary: {
    integrations: number;
    readyIntegrations: number;
    warningIntegrations: number;
    criticalIntegrations: number;
    fields: number;
    configuredFields: number;
    missingRequired: number;
    uazapiOperations: number;
  };
  integrations: IntegrationSnapshot[];
  diagnostics: MaintenanceDiagnostic[];
};

export type MaintenanceStoredCredential = {
  integration_id: string;
  env_name: string;
  value_preview: string;
};

type StoredCredentialMap = Map<string, MaintenanceStoredCredential>;

export const maintenanceIntegrations: IntegrationDefinition[] = [
  {
    id: "uazapi",
    name: "Uazapi / WhatsApp Gateway",
    sector: "Conexao da plataforma",
    owner: "Setor de Atendimento IA",
    description:
      "Credenciais-mae da conta UazapiGO: Server URL e Admin Token. Instancias, QR Code, token da instancia e webhooks sao gerados quando cada WhatsApp e conectado.",
    tone: "green",
    modules: ["Server URL", "Admin Token", "Criacao de instancias", "Conexao por QR"],
    fields: [
      {
        label: "Server URL",
        env: "UAZAPI_BASE_URL",
        aliases: ["UAZAPI_ACCOUNT_EMAIL"],
        kind: "endpoint",
        requirement: "required",
        help: "URL do servidor exibida no painel UazapiGO, por exemplo https://connectyhub.uazapi.com.",
      },
      {
        label: "Admin token",
        env: "UAZAPI_ADMIN_TOKEN",
        kind: "secret",
        requirement: "required",
        help: "Token administrativo para a ConnectyHub criar e controlar instancias WhatsApp automaticamente.",
      },
    ],
  },
  {
    id: "gemini",
    name: "Gemini / Google AI Core",
    sector: "LLM de atendimento e agentes",
    owner: "Setor de Inteligencia Artificial",
    description:
      "LLM global usado pelos agentes de atendimento, analise de leads, CEO Digital e revenda de tokens com margem.",
    tone: "cyan",
    modules: ["Google Gemini", "Modelo global", "Teste de conexao", "CEO Digital"],
    fields: [
      {
        label: "Google Gemini API Key",
        env: "GEMINI_API_KEY",
        aliases: ["GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_AI_API_KEY"],
        kind: "secret",
        requirement: "required",
        help: "Chave da conta Google AI usada pela ConnectyHub para comprar tokens e revender creditos aos clientes.",
      },
      {
        label: "Modelo Gemini global",
        env: "GEMINI_DEFAULT_MODEL",
        kind: "identifier",
        requirement: "recommended",
        help: "Modelo padrao usado pelos agentes. Pode ser alterado por plano, setor ou agente no futuro.",
      },
    ],
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs / Voz e clonagem",
    sector: "Audio, voz e personalizacao",
    owner: "Setor de Experiencia",
    description:
      "Camada de voz para responder leads por audio, clonar vozes autorizadas e criar experiencias mais humanas.",
    tone: "violet",
    modules: ["Resposta por audio", "Clone digital", "Treinamento de voz", "Midias R2"],
    fields: [
      {
        label: "API key",
        env: "ELEVENLABS_API_KEY",
        kind: "secret",
        requirement: "recommended",
        help: "Token da conta ElevenLabs usada pela ConnectyHub. Vozes, clonagem e recursos liberados por plano ficam no financeiro.",
      },
    ],
  },
  {
    id: "meta",
    name: "Meta Ads / Instagram / Facebook",
    sector: "Conexao Meta",
    owner: "Manutencao de Credenciais",
    description:
      "Credenciais de conexao com o app Meta, conta de anuncios, paginas Facebook, Instagram Business e webhooks.",
    tone: "amber",
    modules: ["App Meta", "Graph API", "Webhooks", "Contas conectadas"],
    fields: [
      {
        label: "App ID",
        env: "META_APP_ID",
        kind: "identifier",
        requirement: "recommended",
        help: "Aplicativo Meta conectado a paginas, Instagram e webhooks.",
      },
      {
        label: "App secret",
        env: "META_APP_SECRET",
        kind: "secret",
        requirement: "recommended",
        help: "Segredo do aplicativo Meta.",
      },
      {
        label: "Graph API version",
        env: "META_GRAPH_API_VERSION",
        kind: "identifier",
        requirement: "optional",
        help: "Versao usada nas chamadas Graph API, por exemplo v23.0. Se ficar vazio, usamos o padrao do sistema.",
      },
      {
        label: "Access token",
        env: "META_ACCESS_TOKEN",
        kind: "secret",
        requirement: "recommended",
        help: "Token de acesso de longa duracao para Graph API.",
      },
      {
        label: "Verify token",
        env: "META_VERIFY_TOKEN",
        kind: "secret",
        requirement: "optional",
        help: "Token para validacao de webhooks Meta.",
      },
      {
        label: "Ad Account ID",
        env: "META_AD_ACCOUNT_ID",
        kind: "identifier",
        requirement: "optional",
        help: "Conta de anuncios usada para leitura autorizada via API Meta.",
      },
      {
        label: "Meta Pixel ID",
        env: "META_PIXEL_ID",
        kind: "identifier",
        requirement: "optional",
        help: "Pixel usado para associar eventos e conversoes quando a integracao precisar desse identificador.",
      },
      {
        label: "Instagram Business ID",
        env: "INSTAGRAM_BUSINESS_ACCOUNT_ID",
        kind: "identifier",
        requirement: "optional",
        help: "Conta Instagram Business autorizada na integracao Meta.",
      },
      {
        label: "Facebook Page ID",
        env: "FACEBOOK_PAGE_ID",
        kind: "identifier",
        requirement: "optional",
        help: "Pagina conectada para comentarios, mensagens e eventos.",
      },
    ],
  },
  {
    id: "google-ads",
    name: "Google Ads / Search Console",
    sector: "Conexao Google",
    owner: "Manutencao de Credenciais",
    description:
      "Credenciais de conexao com Google Ads, OAuth, conta de cliente e propriedades usadas pelas APIs Google.",
    tone: "cyan",
    modules: ["OAuth Google", "Google Ads API", "Search Console", "Contas conectadas"],
    fields: [
      {
        label: "Developer token",
        env: "GOOGLE_ADS_DEVELOPER_TOKEN",
        kind: "secret",
        requirement: "recommended",
        help: "Token de desenvolvedor da API Google Ads.",
      },
      {
        label: "Client ID",
        env: "GOOGLE_ADS_CLIENT_ID",
        kind: "identifier",
        requirement: "recommended",
        help: "OAuth client ID do Google Cloud.",
      },
      {
        label: "Client secret",
        env: "GOOGLE_ADS_CLIENT_SECRET",
        kind: "secret",
        requirement: "recommended",
        help: "OAuth client secret do Google Cloud.",
      },
      {
        label: "Refresh token",
        env: "GOOGLE_ADS_REFRESH_TOKEN",
        kind: "secret",
        requirement: "recommended",
        help: "Refresh token para acesso server-side.",
      },
      {
        label: "Customer ID",
        env: "GOOGLE_ADS_CUSTOMER_ID",
        kind: "identifier",
        requirement: "optional",
        help: "Conta de anuncios padrao usada para chamadas autorizadas na API Google Ads.",
      },
      {
        label: "Google Ads Conversion ID",
        env: "GOOGLE_ADS_CONVERSION_ID",
        kind: "identifier",
        requirement: "optional",
        help: "ID AW usado pelas tags de conversao das campanhas Google Ads.",
      },
      {
        label: "GA4 Measurement ID",
        env: "GOOGLE_ANALYTICS_MEASUREMENT_ID",
        kind: "identifier",
        requirement: "optional",
        help: "ID G- do GA4 quando a conexao precisar associar eventos e propriedades.",
      },
      {
        label: "Login Customer ID",
        env: "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
        kind: "identifier",
        requirement: "optional",
        help: "Conta gerente MCC usada no cabecalho login-customer-id quando o Customer ID estiver abaixo de uma conta gerente.",
      },
      {
        label: "Search Console site",
        env: "GOOGLE_SEARCH_CONSOLE_SITE_URL",
        kind: "endpoint",
        requirement: "optional",
        help: "Propriedade autorizada do Search Console.",
      },
    ],
  },
  {
    id: "supabase",
    name: "Supabase / Banco e Auth",
    sector: "Dados, usuarios e auditoria",
    owner: "Setor de Infraestrutura",
    description:
      "Banco de dados, autenticacao, perfis, leads, empresas, logs, billing e dashboards estruturados.",
    tone: "green",
    modules: ["Auth", "Leads", "Dashboards", "Auditoria", "Multi-tenant"],
    fields: [
      {
        label: "Project URL",
        env: "NEXT_PUBLIC_SUPABASE_URL",
        kind: "endpoint",
        requirement: "required",
        help: "URL publica do projeto Supabase.",
      },
      {
        label: "Publishable key",
        env: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        kind: "public",
        requirement: "required",
        help: "Chave publica para clientes autenticados.",
      },
      {
        label: "Service role key",
        env: "SUPABASE_SECRET_KEY",
        kind: "secret",
        requirement: "required",
        help: "Chave server-side para rotinas administrativas. Nunca expor ao cliente.",
      },
    ],
  },
  {
    id: "r2",
    name: "Cloudflare R2 / Storage",
    sector: "Midias, audios e documentos",
    owner: "Setor de Infraestrutura",
    description:
      "Armazenamento de audios, imagens, anexos, exports, videos de treinamento e artefatos gerados pelos agentes.",
    tone: "violet",
    modules: ["Audios WhatsApp", "Clonagem de voz", "Arquivos de leads", "Backups"],
    fields: [
      {
        label: "Account ID",
        env: "R2_ACCOUNT_ID",
        kind: "identifier",
        requirement: "recommended",
        help: "Conta Cloudflare usada para buckets R2.",
      },
      {
        label: "Endpoint",
        env: "R2_ENDPOINT",
        kind: "endpoint",
        requirement: "recommended",
        help: "Endpoint S3 compativel do R2.",
      },
      {
        label: "Access key ID",
        env: "R2_ACCESS_KEY_ID",
        kind: "secret",
        requirement: "recommended",
        help: "Credencial de acesso ao bucket.",
      },
      {
        label: "Secret access key",
        env: "R2_SECRET_ACCESS_KEY",
        kind: "secret",
        requirement: "recommended",
        help: "Segredo do par de acesso R2.",
      },
      {
        label: "Bucket",
        env: "R2_BUCKET",
        kind: "identifier",
        requirement: "recommended",
        help: "Bucket padrao da ConnectyHub.",
      },
      {
        label: "Public URL",
        env: "R2_PUBLIC_URL",
        kind: "endpoint",
        requirement: "optional",
        help: "URL publica para midias permitidas.",
      },
      {
        label: "API token",
        env: "CLOUDFLARE_R2_API_TOKEN",
        kind: "secret",
        requirement: "optional",
        help: "Token Cloudflare para administracao automatizada.",
      },
    ],
  },
  {
    id: "inngest",
    name: "Inngest / Cron e jobs",
    sector: "Automacoes, filas e rotinas",
    owner: "Setor de Automacao",
    description:
      "Agenda jobs de remarketing, relatorios, agentes autonomos, rotinas de carrinho e tarefas recorrentes.",
    tone: "amber",
    modules: ["Cron", "Remarketing", "Relatorios", "Agentes autonomos"],
    fields: [
      {
        label: "Event key",
        env: "INNGEST_EVENT_KEY",
        kind: "secret",
        requirement: "recommended",
        help: "Chave para publicar eventos no Inngest.",
      },
      {
        label: "Signing key",
        env: "INNGEST_SIGNING_KEY",
        kind: "secret",
        requirement: "recommended",
        help: "Chave de assinatura para validar chamadas.",
      },
    ],
  },
  {
    id: "push",
    name: "VAPID / Push e rastreamento",
    sector: "Notificacoes e leads",
    owner: "Setor de Marketing",
    description:
      "Base para push permission, eventos do navegador, rastreamento de botoes e notificacoes para administradores.",
    tone: "green",
    modules: ["Push web", "Lead tracker", "Eventos de botoes", "Alertas admin"],
    fields: [
      {
        label: "Public key",
        env: "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
        kind: "public",
        requirement: "recommended",
        help: "Chave publica gerada no VAPIDKeys.",
      },
      {
        label: "Private key",
        env: "VAPID_PRIVATE_KEY",
        kind: "secret",
        requirement: "recommended",
        help: "Chave privada usada somente no servidor.",
      },
      {
        label: "Subject",
        env: "VAPID_SUBJECT",
        kind: "identifier",
        requirement: "recommended",
        help: "Contato/subject usado nas notificacoes web push.",
      },
    ],
  },
  {
    id: "mercado-pago",
    name: "Mercado Pago / Checkout WhatsApp",
    sector: "Pagamentos no WhatsApp",
    owner: "Setor Financeiro IA",
    description:
      "Aplicativo OAuth da ConnectyHub usado para que cada cliente autorize a propria conta Mercado Pago sem informar token manual no painel.",
    tone: "cyan",
    modules: ["OAuth guiado", "Pix", "Cartao", "Checkout transparente", "Webhooks"],
    fields: [
      {
        label: "Client ID",
        env: "MERCADO_PAGO_CLIENT_ID",
        kind: "identifier",
        requirement: "required",
        help: "Client ID do aplicativo Mercado Pago criado pela ConnectyHub Developers.",
      },
      {
        label: "Client Secret",
        env: "MERCADO_PAGO_CLIENT_SECRET",
        kind: "secret",
        requirement: "required",
        help: "Client Secret do aplicativo Mercado Pago. Fica somente no servidor da ConnectyHub.",
      },
      {
        label: "Redirect URI",
        env: "MERCADO_PAGO_REDIRECT_URI",
        kind: "endpoint",
        requirement: "recommended",
        help: "URL de retorno cadastrada no app Mercado Pago: https://www.connectyhub.com.br/api/dashboard/sales-catalog/payments/mercado-pago/callback.",
      },
      {
        label: "Webhook signature",
        env: "MERCADO_PAGO_WEBHOOK_SECRET",
        kind: "secret",
        requirement: "recommended",
        help: "Assinatura secreta configurada no webhook do Mercado Pago para validar notificacoes de pagamento.",
      },
      {
        label: "Modo teste OAuth",
        env: "MERCADO_PAGO_TEST_TOKEN",
        kind: "identifier",
        requirement: "optional",
        help: "Use true apenas em sandbox. Em producao deixe vazio ou false.",
      },
    ],
  },
  {
    id: "mercado-pago-billing",
    name: "Mercado Pago / Cobranca ConnectyHub",
    sector: "Assinaturas e creditos",
    owner: "Setor Financeiro IA",
    description:
      "Credenciais da conta Mercado Pago da ConnectyHub usadas para cobrar mensalidade, pacotes e creditos excedentes dos clientes da plataforma.",
    tone: "amber",
    modules: ["Assinaturas", "Cartao salvo", "Creditos extras", "Webhooks de billing"],
    fields: [
      {
        label: "Access Token ConnectyHub",
        env: "MERCADO_PAGO_BILLING_ACCESS_TOKEN",
        kind: "secret",
        requirement: "required",
        help: "Access Token de producao da conta Mercado Pago da ConnectyHub. Usado somente no servidor para assinaturas e pagamentos da plataforma.",
      },
      {
        label: "Public Key ConnectyHub",
        env: "MERCADO_PAGO_BILLING_PUBLIC_KEY",
        kind: "public",
        requirement: "recommended",
        help: "Public Key da conta Mercado Pago da ConnectyHub para checkout transparente quando habilitarmos assinatura por cartao.",
      },
      {
        label: "Webhook secret billing",
        env: "MERCADO_PAGO_BILLING_WEBHOOK_SECRET",
        kind: "secret",
        requirement: "recommended",
        help: "Assinatura secreta do webhook dedicado a cobranca da ConnectyHub: /api/webhooks/mercado-pago/platform-billing.",
      },
      {
        label: "Modo cobranca",
        env: "MERCADO_PAGO_BILLING_MODE",
        kind: "identifier",
        requirement: "optional",
        help: "Use production para cobranca real. Use sandbox apenas nos testes de assinatura e pagamento.",
      },
    ],
  },
];

export function getMaintenanceVaultSnapshot(options: { storedCredentials?: MaintenanceStoredCredential[] } = {}): MaintenanceVaultSnapshot {
  const storedCredentials = buildStoredCredentialMap(options.storedCredentials ?? []);
  const integrations = sortMaintenanceIntegrations(
    maintenanceIntegrations.map((integration) => buildIntegrationSnapshot(integration, storedCredentials)),
  );
  const fields = integrations.flatMap((integration) => integration.fields);
  const uazapiConfig = getUazapiConfig();

  const configuredFields = fields.filter((field) => field.configured).length;
  const missingRequired = integrations.reduce((total, integration) => total + integration.missingRequired, 0);

  return {
    generatedAt: new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "medium",
      timeZone: "America/Sao_Paulo",
    }).format(new Date()),
    environment: process.env.NODE_ENV || "unknown",
    summary: {
      integrations: integrations.length,
      readyIntegrations: integrations.filter((integration) => integration.status === "online").length,
      warningIntegrations: integrations.filter((integration) => integration.status === "warning").length,
      criticalIntegrations: integrations.filter((integration) => integration.status === "critical").length,
      fields: fields.length,
      configuredFields,
      missingRequired,
      uazapiOperations: uazapiOperations.length,
    },
    integrations,
    diagnostics: [
      {
        label: "Server URL Uazapi",
        value: uazapiConfig.baseUrl,
        detail: "URL do servidor da conta UazapiGO usada pelo gateway da ConnectyHub.",
        status: uazapiConfig.baseUrl ? "online" : "critical",
      },
      {
        label: "Catalogo Uazapi importado",
        value: `${uazapiOperations.length} operacoes`,
        detail: "Operacoes catalogadas para WhatsApp, instancias, grupos, contatos, midias e webhooks.",
        status: uazapiOperations.length > 100 ? "online" : "warning",
      },
      {
        label: "Chave interna do console",
        value: process.env.CONNECTYHUB_INTERNAL_API_KEY ? "Configurada" : "Ausente",
        detail: "Protege a execucao de operacoes administrativas no gateway.",
        status: process.env.CONNECTYHUB_INTERNAL_API_KEY ? "online" : "critical",
      },
      {
        label: "Instancias e webhooks",
        value: uazapiConfig.webhookUrl ?? "Aguardando NEXT_PUBLIC_APP_URL",
        detail: "Serao gerados no fluxo Conectar WhatsApp, por cliente e por numero conectado.",
        status: uazapiConfig.webhookUrl ? "online" : "warning",
      },
    ],
  };
}

function sortMaintenanceIntegrations(integrations: IntegrationSnapshot[]) {
  const priority = new Map([
    ["meta", 0],
    ["google-ads", 1],
  ]);

  return [...integrations].sort((left, right) => {
    const leftPriority = priority.get(left.id) ?? 100;
    const rightPriority = priority.get(right.id) ?? 100;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return maintenanceIntegrations.findIndex((integration) => integration.id === left.id)
      - maintenanceIntegrations.findIndex((integration) => integration.id === right.id);
  });
}

function buildIntegrationSnapshot(integration: IntegrationDefinition, storedCredentials: StoredCredentialMap): IntegrationSnapshot {
  const fields = integration.fields.map((field) => buildCredentialSnapshot(integration.id, field, storedCredentials));
  const requiredFields = fields.filter((field) => field.requirement === "required");
  const missingRequired = requiredFields.filter((field) => !field.configured).length;
  const configuredFields = fields.filter((field) => field.configured).length;
  const requiredReadiness =
    requiredFields.length === 0
      ? configuredFields > 0
        ? 100
        : 0
      : Math.round(((requiredFields.length - missingRequired) / requiredFields.length) * 100);

  return {
    ...integration,
    fields,
    configuredFields,
    missingRequired,
    readiness: requiredReadiness,
    status: resolveIntegrationStatus(requiredFields.length, missingRequired, configuredFields),
  };
}

function buildCredentialSnapshot(
  integrationId: string,
  field: CredentialDefinition,
  storedCredentials: StoredCredentialMap,
): CredentialSnapshot {
  const stored = resolveStoredCredential(integrationId, field, storedCredentials);

  if (stored) {
    return {
      ...field,
      configured: true,
      displayValue: stored.value_preview,
      resolvedEnv: stored.env_name,
      source: "vault",
    };
  }

  const resolved = resolveEnvValue(field);

  return {
    ...field,
    configured: Boolean(resolved.value),
    displayValue: resolved.value ? maskValue(resolved.value, field.kind) : "Nao configurado",
    resolvedEnv: resolved.env,
    source: resolved.value ? "environment" : "missing",
  };
}

function buildStoredCredentialMap(credentials: MaintenanceStoredCredential[]) {
  const map: StoredCredentialMap = new Map();

  credentials.forEach((credential) => {
    if (credential.integration_id && credential.env_name && credential.value_preview) {
      map.set(getStoredCredentialKey(credential.integration_id, credential.env_name), credential);
    }
  });

  return map;
}

function resolveStoredCredential(
  integrationId: string,
  field: CredentialDefinition,
  storedCredentials: StoredCredentialMap,
) {
  const envNames = [field.env, ...(field.aliases ?? [])];

  for (const envName of envNames) {
    const credential = storedCredentials.get(getStoredCredentialKey(integrationId, envName));

    if (credential) {
      return credential;
    }
  }

  return null;
}

function getStoredCredentialKey(integrationId: string, envName: string) {
  return `${integrationId}:${envName}`;
}

function resolveIntegrationStatus(requiredCount: number, missingRequired: number, configuredFields: number): StatusTone {
  if (requiredCount > 0 && missingRequired === 0) {
    return "online";
  }

  if (requiredCount > 0 && missingRequired < requiredCount) {
    return "warning";
  }

  if (requiredCount > 0) {
    return "critical";
  }

  return configuredFields > 0 ? "online" : "idle";
}

function resolveEnvValue(field: CredentialDefinition): { env: string; value: string | undefined } {
  const envNames = [field.env, ...(field.aliases ?? [])];

  for (const envName of envNames) {
    const value = process.env[envName];
    if (value && value.trim()) {
      return { env: envName, value };
    }
  }

  return { env: field.env, value: undefined };
}

function maskValue(value: string, kind: CredentialKind) {
  if (kind === "endpoint") {
    return value.length > 72 ? `${value.slice(0, 46)}...${value.slice(-18)}` : value;
  }

  if (kind === "identifier" && value.length <= 24) {
    return value;
  }

  if (kind === "public") {
    return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
  }

  if (value.length <= 8) {
    return "********";
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
