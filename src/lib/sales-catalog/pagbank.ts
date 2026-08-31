import "server-only";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptCredentialValue,
  encryptCredentialValue,
} from "@/lib/security/credentials-crypto";
import type { SalesCatalogPaymentSessionStatus } from "./shared";

type JsonRecord = Record<string, unknown>;

type PlatformCredentialRow = {
  env_name: string;
  encrypted_value: string | null;
};

type PagBankOAuthConfig = {
  clientId: string;
  clientSecret: string;
  authorizationToken: string;
  redirectUri: string;
  mode: "production" | "sandbox";
  apiBaseUrl: string;
  connectBaseUrl: string;
  affiliateConnectUrl: string | null;
};

type IntegrationSecrets = {
  id: string;
  organizationId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  webhookSecret: string | null;
  mode: "production" | "sandbox";
};

export type PagBankOAuthTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  account_id?: string | number;
  user_id?: string | number;
  seller_id?: string | number;
  merchant_id?: string | number;
};

type PagBankOAuthErrorResponse = {
  code?: string;
  error?: string;
  error_description?: string;
  message?: string;
  description?: string;
  cause?: unknown;
};

type PagBankOrderResponse = {
  id?: string;
  reference_id?: string;
  status?: string;
  created_at?: string;
  charges?: PagBankChargeResponse[];
  qr_codes?: PagBankQrCodeResponse[];
  qr_code?: PagBankQrCodeResponse[];
  links?: PagBankLinkResponse[];
  message?: string;
  error?: string;
  error_description?: string;
  description?: string;
  cause?: unknown;
};

type PagBankChargeResponse = {
  id?: string;
  reference_id?: string;
  status?: string;
  paid_at?: string;
  created_at?: string;
  payment_response?: {
    code?: string;
    message?: string;
    reference?: string;
  };
  payment_method?: {
    type?: string;
    pix?: {
      expiration_date?: string;
      end_to_end_id?: string;
    };
  };
  qr_code?: PagBankQrCodeResponse;
  links?: PagBankLinkResponse[];
};

type PagBankQrCodeResponse = {
  id?: string;
  text?: string;
  amount?: {
    value?: number;
  };
  expiration_date?: string;
  links?: PagBankLinkResponse[];
};

type PagBankLinkResponse = {
  rel?: string;
  href?: string;
  media?: string;
  type?: string;
  method?: string;
};

export type PagBankPixOrderInput = {
  accessToken: string;
  mode?: "production" | "sandbox" | null;
  amount: number;
  description: string;
  externalReference: string;
  payerEmail: string;
  payerName?: string | null;
  payerDocument?: string | null;
  payerPhone?: string | null;
  notificationUrl?: string | null;
  idempotencyKey?: string | null;
  items?: Array<{
    id?: string | null;
    title?: string | null;
    skuCode?: string | null;
    quantity?: number | null;
    unitPrice?: string | number | null;
    salePrice?: string | number | null;
    total?: string | number | null;
  }>;
};

const pagBankPlatformIntegrationId = "pagbank";
const pagBankDefaultScopes = [
  "payments.read",
  "payments.create",
  "payments.refund",
  "accounts.read",
].join("+");
const pagBankCredentialNames = [
  "PAGBANK_CLIENT_ID",
  "PAGBANK_CLIENT_SECRET",
  "PAGBANK_REDIRECT_URI",
  "PAGBANK_CONNECT_TOKEN",
  "PAGBANK_AUTHORIZATION_TOKEN",
  "PAGBANK_APP_TOKEN",
  "PAGSEGURO_AUTH_TOKEN",
  "PAGSEGURO_CONNECT_TOKEN",
  "PAGBANK_ENVIRONMENT",
  "PAGBANK_SANDBOX",
  "PAGBANK_API_BASE_URL",
  "PAGBANK_CONNECT_BASE_URL",
  "PAGBANK_AFFILIATE_CONNECT_URL",
];
const pagBankWebhookCredentialNames = [
  "PAGBANK_WEBHOOK_TOKEN",
  "PAGBANK_CONNECT_TOKEN",
  "PAGBANK_AUTHORIZATION_TOKEN",
  "PAGBANK_APP_TOKEN",
  "PAGSEGURO_AUTH_TOKEN",
];

export class PagBankOAuthRequestError extends Error {
  readonly code: string | null;
  readonly httpStatus: number | null;

  constructor(message: string, options: { code?: string | null; httpStatus?: number | null } = {}) {
    super(message);
    this.name = "PagBankOAuthRequestError";
    this.code = options.code ?? null;
    this.httpStatus = options.httpStatus ?? null;
  }
}

export function getPagBankOAuthConfig() {
  return buildPagBankOAuthConfigFromCredentials(new Map());
}

export async function loadPagBankOAuthConfig(input: { client?: SupabaseClient } = {}) {
  const credentials = await loadPagBankPlatformCredentials(input.client, pagBankCredentialNames);

  return buildPagBankOAuthConfigFromCredentials(credentials);
}

export async function isPagBankSandboxMode(input: { client?: SupabaseClient } = {}) {
  const credentials = await loadPagBankPlatformCredentials(input.client, ["PAGBANK_ENVIRONMENT", "PAGBANK_SANDBOX"]);

  return resolvePagBankMode(credentials) === "sandbox";
}

export async function buildPagBankAuthorizationUrl(input: {
  companyId: string;
  state: string;
  client?: SupabaseClient;
}) {
  const config = await loadPagBankOAuthConfig({ client: input.client });

  return buildPagBankAuthorizationUrlFromConfig({ config, state: input.state });
}

export async function buildPagBankSellerConnectUrl(input: {
  companyId: string;
  state: string;
  client?: SupabaseClient;
}) {
  const config = await loadPagBankOAuthConfig({ client: input.client });
  const authorizationUrl = buildPagBankAuthorizationUrlFromConfig({ config, state: input.state });

  if (!config.affiliateConnectUrl) {
    return {
      authorizationUrl,
      redirectUrl: authorizationUrl,
      affiliateUrlUsed: false,
    };
  }

  const redirectUrl = buildPagBankAffiliateUrl({
    affiliateUrl: config.affiliateConnectUrl,
    authorizationUrl,
    companyId: input.companyId,
    state: input.state,
  });

  return {
    authorizationUrl,
    redirectUrl,
    affiliateUrlUsed: true,
  };
}

export async function exchangePagBankAuthorizationCode(input: {
  code: string;
  client?: SupabaseClient;
}) {
  const config = await loadPagBankOAuthConfig({ client: input.client });
  const { body } = await requestPagBankOAuthToken({
    config,
    endpoint: "/oauth2/token",
    payload: {
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: config.redirectUri,
    },
    fallbackMessage: "PagBank nao retornou Access Token.",
  });

  return body;
}

export async function refreshPagBankAccessToken(input: {
  refreshToken: string;
  client?: SupabaseClient;
}) {
  const config = await loadPagBankOAuthConfig({ client: input.client });
  const { body } = await requestPagBankOAuthToken({
    config,
    endpoint: "/oauth2/refresh",
    payload: {
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    },
    fallbackMessage: "Nao foi possivel renovar o token PagBank.",
  });

  return body;
}

export function serializePagBankOAuthTokens(tokens: PagBankOAuthTokenResponse): JsonRecord {
  return {
    token_type: tokens.token_type ?? null,
    scope: tokens.scope ?? null,
    expires_in: tokens.expires_in ?? null,
    account_id: readProviderAccountId(tokens),
  };
}

export function calculatePagBankTokenExpiration(expiresIn?: number) {
  return expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
}

export function readPagBankProviderAccountId(tokens: PagBankOAuthTokenResponse) {
  return readProviderAccountId(tokens);
}

export function buildPagBankWebhookUrl() {
  return `${getAppBaseUrl()}/api/webhooks/pagbank`;
}

export async function loadPagBankIntegrationSecrets(
  client: SupabaseClient,
  organizationId: string,
): Promise<IntegrationSecrets | null> {
  const { data, error } = await client
    .from("sales_catalog_payment_integrations")
    .select("id, organization_id, mode, status, access_token_encrypted, refresh_token_encrypted, token_expires_at, webhook_secret_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", "pagbank")
    .maybeSingle<{
      id: string;
      organization_id: string;
      mode: string | null;
      status: string | null;
      access_token_encrypted: string | null;
      refresh_token_encrypted: string | null;
      token_expires_at: string | null;
      webhook_secret_encrypted: string | null;
    }>();

  if (error || !data || data.status !== "connected" || !data.access_token_encrypted) {
    return null;
  }

  return {
    id: data.id,
    organizationId: data.organization_id,
    accessToken: decryptCredentialValue(data.access_token_encrypted),
    refreshToken: data.refresh_token_encrypted ? decryptCredentialValue(data.refresh_token_encrypted) : null,
    tokenExpiresAt: data.token_expires_at,
    webhookSecret: data.webhook_secret_encrypted ? decryptCredentialValue(data.webhook_secret_encrypted) : null,
    mode: data.mode === "sandbox" ? "sandbox" : "production",
  };
}

export async function ensurePagBankAccessToken(input: {
  client: SupabaseClient;
  organizationId: string;
}) {
  const secrets = await loadPagBankIntegrationSecrets(input.client, input.organizationId);

  if (!secrets) {
    throw new Error("Conecte uma conta PagBank para gerar Pix automatico.");
  }

  if (!secrets.refreshToken || !isTokenNearExpiry(secrets.tokenExpiresAt)) {
    return secrets;
  }

  const refreshed = await refreshPagBankAccessToken({
    refreshToken: secrets.refreshToken,
    client: input.client,
  });
  const expiresAt = calculatePagBankTokenExpiration(refreshed.expires_in) ?? secrets.tokenExpiresAt;

  await input.client
    .from("sales_catalog_payment_integrations")
    .update({
      access_token_encrypted: encryptCredentialValue(refreshed.access_token!),
      refresh_token_encrypted: refreshed.refresh_token ? encryptCredentialValue(refreshed.refresh_token) : null,
      token_scope: refreshed.scope ?? null,
      token_expires_at: expiresAt,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", secrets.id)
    .eq("organization_id", input.organizationId);

  return {
    ...secrets,
    accessToken: refreshed.access_token!,
    refreshToken: refreshed.refresh_token ?? secrets.refreshToken,
    tokenExpiresAt: expiresAt,
  };
}

export async function createPagBankPixOrder(input: PagBankPixOrderInput) {
  const config = getPagBankRuntimeConfig(input.mode);
  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const response = await fetch(`${config.apiBaseUrl}/orders`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      "x-idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(buildPagBankPixOrderPayload(input)),
  });
  const body = await response.json().catch(() => null) as PagBankOrderResponse | null;

  if (!response.ok || !body?.id) {
    throw new Error(readPagBankErrorMessage(body) ?? "Nao foi possivel gerar Pix no PagBank.");
  }

  return { order: body, idempotencyKey };
}

export async function getPagBankOrder(input: {
  accessToken: string;
  mode?: "production" | "sandbox" | null;
  orderId: string;
}) {
  const config = getPagBankRuntimeConfig(input.mode);
  const response = await fetch(`${config.apiBaseUrl}/orders/${encodeURIComponent(input.orderId)}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
  });
  const body = await response.json().catch(() => null) as PagBankOrderResponse | null;

  if (!response.ok || !body?.id) {
    throw new Error(readPagBankErrorMessage(body) ?? "Nao foi possivel consultar pedido PagBank.");
  }

  return body;
}

export function mapPagBankPaymentStatus(status: string | null | undefined): SalesCatalogPaymentSessionStatus {
  const normalized = status?.trim().toUpperCase();

  if (normalized === "PAID" || normalized === "AUTHORIZED") return "approved";
  if (normalized === "DECLINED") return "rejected";
  if (normalized === "CANCELED" || normalized === "CANCELLED") return "cancelled";
  if (normalized === "EXPIRED") return "expired";
  if (normalized === "REFUNDED" || normalized === "CHARGEBACK") return "refunded";
  if (normalized === "WAITING" || normalized === "IN_ANALYSIS") return "pending";
  return "created";
}

export function extractPagBankPixData(order: PagBankOrderResponse) {
  const charge = order.charges?.[0] ?? null;
  const qrCode = charge?.qr_code
    ?? order.qr_codes?.[0]
    ?? order.qr_code?.[0]
    ?? null;
  const links = [
    ...(charge?.links ?? []),
    ...(qrCode?.links ?? []),
    ...(order.links ?? []),
  ];
  const providerStatus = charge?.status ?? order.status ?? null;
  const providerPaymentId = charge?.id ?? order.id ?? null;

  return {
    providerPaymentId,
    providerOrderId: order.id ?? null,
    providerStatus,
    providerStatusDetail: charge?.payment_response?.message ?? charge?.payment_response?.code ?? null,
    status: mapPagBankPaymentStatus(providerStatus),
    pixQrCode: qrCode?.text ?? null,
    pixQrCodeBase64: readPagBankQrCodeBase64(qrCode) ?? null,
    pixTicketUrl: readPagBankLink(links, "PAY")
      ?? readPagBankLink(links, "QRCODE.PNG")
      ?? null,
    pixQrCodePngUrl: readPagBankLink(links, "QRCODE.PNG") ?? null,
    pixQrCodeBase64Url: readPagBankLink(links, "QRCODE.BASE64") ?? null,
    paidAt: charge?.paid_at ?? null,
  };
}

export async function loadPagBankWebhookToken(input: {
  client?: SupabaseClient;
  organizationId?: string | null;
} = {}) {
  if (input.client && input.organizationId) {
    const { data } = await input.client
      .from("sales_catalog_payment_integrations")
      .select("webhook_secret_encrypted")
      .eq("organization_id", input.organizationId)
      .eq("provider", "pagbank")
      .maybeSingle<{ webhook_secret_encrypted: string | null }>();

    if (data?.webhook_secret_encrypted) {
      return decryptCredentialValue(data.webhook_secret_encrypted);
    }
  }

  const credentials = await loadPagBankPlatformCredentials(input.client, pagBankWebhookCredentialNames);

  return getCredentialValue(credentials, pagBankWebhookCredentialNames) || null;
}

export function verifyPagBankWebhookSignature(input: {
  rawPayload: string;
  signatureHeader: string | null;
  token: string | null;
}) {
  if (!input.token) {
    return {
      ok: shouldAllowUnsignedPagBankWebhook(),
      skipped: true,
      reason: "missing_webhook_token",
    };
  }

  if (!input.signatureHeader) {
    return { ok: false, skipped: false, reason: "missing_signature_header" };
  }

  const digest = createHash("sha256")
    .update(`${input.token}-${input.rawPayload}`, "utf8")
    .digest("hex");
  const matches = timingSafeHexEqual(digest, input.signatureHeader.trim());

  return {
    ok: matches,
    skipped: false,
    reason: matches ? null : "signature_mismatch",
  };
}

export function isPagBankInvalidClientError(error: unknown) {
  const code = error instanceof PagBankOAuthRequestError ? error.code : null;
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  return code === "invalid_client"
    || message.includes("client_id")
    || message.includes("client secret")
    || message.includes("client_secret")
    || message.includes("x_client_secret");
}

export function formatPagBankOAuthError(error: unknown) {
  if (isPagBankInvalidClientError(error)) {
    return "Client ID, Client Secret ou token do aplicativo PagBank da ConnectyHub nao foram aceitos pelo PagBank.";
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Falha ao validar OAuth PagBank.";
}

function buildPagBankOAuthConfigFromCredentials(credentials: Map<string, string>): PagBankOAuthConfig {
  const clientId = getCredentialValue(credentials, ["PAGBANK_CLIENT_ID"]);
  const clientSecret = getCredentialValue(credentials, ["PAGBANK_CLIENT_SECRET"]);
  const authorizationToken = getCredentialValue(credentials, [
    "PAGBANK_CONNECT_TOKEN",
    "PAGBANK_AUTHORIZATION_TOKEN",
    "PAGBANK_APP_TOKEN",
    "PAGSEGURO_AUTH_TOKEN",
    "PAGSEGURO_CONNECT_TOKEN",
  ]);
  const redirectUri = getCredentialValue(credentials, ["PAGBANK_REDIRECT_URI"])
    || `${getAppBaseUrl()}/api/dashboard/sales-catalog/payments/pagbank/callback`;
  const mode = resolvePagBankMode(credentials);
  const apiBaseUrl = getCredentialValue(credentials, ["PAGBANK_API_BASE_URL"])
    || (mode === "sandbox" ? "https://sandbox.api.pagseguro.com" : "https://api.pagseguro.com");
  const connectBaseUrl = getCredentialValue(credentials, ["PAGBANK_CONNECT_BASE_URL"])
    || (mode === "sandbox" ? "https://connect.sandbox.pagbank.com.br" : "https://connect.pagbank.com.br");
  const affiliateConnectUrl = getCredentialValue(credentials, ["PAGBANK_AFFILIATE_CONNECT_URL"]) || null;

  if (!clientId || !clientSecret || !authorizationToken) {
    throw new Error("Configure PagBank no painel admin da ConnectyHub antes de conectar contas de clientes.");
  }

  return {
    clientId,
    clientSecret,
    authorizationToken,
    redirectUri,
    mode,
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ""),
    connectBaseUrl: connectBaseUrl.replace(/\/+$/, ""),
    affiliateConnectUrl,
  };
}

function buildPagBankAuthorizationUrlFromConfig(input: {
  config: PagBankOAuthConfig;
  state: string;
}) {
  const url = new URL("/oauth2/authorize", input.config.connectBaseUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set("redirect_uri", input.config.redirectUri);
  url.searchParams.set("scope", pagBankDefaultScopes);
  url.searchParams.set("state", input.state);

  return url.toString();
}

function buildPagBankAffiliateUrl(input: {
  affiliateUrl: string;
  authorizationUrl: string;
  companyId: string;
  state: string;
}) {
  const replaced = input.affiliateUrl
    .replaceAll("{authorizationUrl}", encodeURIComponent(input.authorizationUrl))
    .replaceAll("{continueUrl}", encodeURIComponent(input.authorizationUrl))
    .replaceAll("{state}", encodeURIComponent(input.state))
    .replaceAll("{companyId}", encodeURIComponent(input.companyId));

  const url = new URL(replaced);
  if (!input.affiliateUrl.includes("{authorizationUrl}") && !input.affiliateUrl.includes("{continueUrl}")) {
    url.searchParams.set("continue_url", input.authorizationUrl);
    url.searchParams.set("oauth_url", input.authorizationUrl);
  }

  url.searchParams.set("utm_source", url.searchParams.get("utm_source") ?? "connectyhub");
  url.searchParams.set("utm_medium", url.searchParams.get("utm_medium") ?? "integration");
  url.searchParams.set("utm_campaign", url.searchParams.get("utm_campaign") ?? "pagbank_connect");
  url.searchParams.set("company_id", input.companyId);
  url.searchParams.set("state", input.state);

  return url.toString();
}

async function requestPagBankOAuthToken(input: {
  config: PagBankOAuthConfig;
  endpoint: "/oauth2/token" | "/oauth2/refresh";
  payload: Record<string, string>;
  fallbackMessage: string;
}) {
  const response = await fetch(`${input.config.apiBaseUrl}${input.endpoint}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${input.config.authorizationToken}`,
      "Content-Type": "application/json",
      X_CLIENT_ID: input.config.clientId,
      X_CLIENT_SECRET: input.config.clientSecret,
    },
    body: JSON.stringify(input.payload),
  });
  const body = await response.json().catch(() => null) as (PagBankOAuthTokenResponse & PagBankOAuthErrorResponse) | null;

  if (!response.ok || !body?.access_token) {
    throw createPagBankOAuthError(body, response.status, input.fallbackMessage);
  }

  return { body, httpStatus: response.status };
}

async function loadPagBankPlatformCredentials(
  client: SupabaseClient | undefined,
  envNames: string[],
  integrationId = pagBankPlatformIntegrationId,
) {
  const credentials = new Map<string, string>();

  for (const envName of envNames) {
    const value = process.env[envName]?.trim();

    if (value) {
      credentials.set(envName, value);
    }
  }

  if (client) {
    const { data, error } = await client
      .from("integration_credentials")
      .select("env_name, encrypted_value")
      .eq("scope", "platform")
      .eq("integration_id", integrationId)
      .is("organization_id", null)
      .in("env_name", envNames)
      .order("updated_at", { ascending: false });

    if (!error) {
      for (const credential of (data ?? []) as PlatformCredentialRow[]) {
        if (!credential.env_name || !credential.encrypted_value || credentials.has(credential.env_name)) {
          continue;
        }

        try {
          credentials.set(credential.env_name, decryptCredentialValue(credential.encrypted_value));
        } catch {
          // Environment variables remain the fallback if this runtime cannot decrypt the vault.
        }
      }
    }
  }

  return credentials;
}

function getPagBankRuntimeConfig(modeOverride?: "production" | "sandbox" | null) {
  const credentials = new Map<string, string>();
  const mode = modeOverride ?? resolvePagBankMode(credentials);
  const apiBaseUrl = process.env.PAGBANK_API_BASE_URL?.trim()
    || (mode === "sandbox" ? "https://sandbox.api.pagseguro.com" : "https://api.pagseguro.com");

  return {
    mode,
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ""),
  };
}

function buildPagBankPixOrderPayload(input: PagBankPixOrderInput) {
  const amountCents = Math.max(1, Math.round(input.amount * 100));
  const description = sanitizePagBankText(input.description, 255) ?? "Pedido ConnectyHub";
  const chargeReference = sanitizePagBankText(input.externalReference, 200) ?? input.externalReference;

  return {
    reference_id: chargeReference,
    customer: buildPagBankCustomer(input),
    items: buildPagBankOrderItems(input.items ?? [], amountCents),
    charges: [
      {
        reference_id: chargeReference,
        description,
        amount: {
          value: amountCents,
          currency: "BRL",
        },
        payment_method: {
          type: "PIX",
          pix: {
            expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        },
      },
    ],
    notification_urls: input.notificationUrl ? [input.notificationUrl] : undefined,
  };
}

function buildPagBankCustomer(input: PagBankPixOrderInput) {
  const customer: JsonRecord = {
    name: sanitizePagBankText(input.payerName, 120) ?? "Cliente ConnectyHub",
    email: sanitizePagBankText(input.payerEmail, 120) ?? "cliente@connectyhub.local",
  };
  const document = normalizePagBankDocument(input.payerDocument);
  const phone = buildPagBankPhone(input.payerPhone);

  if (document) {
    customer.tax_id = document;
  }

  if (phone) {
    customer.phones = [phone];
  }

  return customer;
}

function buildPagBankOrderItems(items: NonNullable<PagBankPixOrderInput["items"]>, fallbackAmountCents: number) {
  const mapped = items.flatMap((item, index) => {
    const quantity = normalizePagBankQuantity(item.quantity);
    const unitAmount = normalizePagBankItemUnitAmount(item, quantity);
    const name = sanitizePagBankText(item.title, 100);

    if (!name || !unitAmount) {
      return [];
    }

    return [{
      reference_id: sanitizePagBankText(item.skuCode ?? item.id ?? `item-${index + 1}`, 60) ?? `item-${index + 1}`,
      name,
      quantity,
      unit_amount: unitAmount,
    }];
  });

  if (mapped.length > 0) {
    return mapped;
  }

  return [{
    reference_id: "pedido",
    name: "Pedido ConnectyHub",
    quantity: 1,
    unit_amount: fallbackAmountCents,
  }];
}

function normalizePagBankQuantity(value: number | null | undefined) {
  return Number.isFinite(value) && value && value > 0 ? Math.max(1, Math.round(value)) : 1;
}

function normalizePagBankItemUnitAmount(
  item: NonNullable<PagBankPixOrderInput["items"]>[number],
  quantity: number,
) {
  const unitPrice = normalizeCurrencyAmount(item.unitPrice) ?? normalizeCurrencyAmount(item.salePrice);
  const total = normalizeCurrencyAmount(item.total);
  const amount = unitPrice ?? (total ? total / Math.max(1, quantity) : null);

  return amount ? Math.max(1, Math.round(amount * 100)) : null;
}

function buildPagBankPhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  const local = digits.startsWith("55") ? digits.slice(2) : digits;

  if (local.length < 10) {
    return null;
  }

  return {
    country: "55",
    area: local.slice(0, 2),
    number: local.slice(2).slice(0, 9),
    type: "MOBILE",
  };
}

function normalizePagBankDocument(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";

  if (digits.length === 11 || digits.length === 14) {
    return digits;
  }

  return null;
}

function readPagBankQrCodeBase64(qrCode: PagBankQrCodeResponse | null) {
  if (!qrCode || typeof qrCode !== "object") {
    return null;
  }

  const record = qrCode as JsonRecord;
  return readOptionalString(record.base64)
    ?? readOptionalString(record.qr_code_base64)
    ?? readOptionalString(record.image_base64);
}

function readPagBankLink(links: PagBankLinkResponse[], rel: string) {
  const link = links.find((item) => item.rel?.toUpperCase() === rel);

  return readOptionalString(link?.href);
}

function readProviderAccountId(tokens: PagBankOAuthTokenResponse) {
  const value = tokens.account_id ?? tokens.user_id ?? tokens.seller_id ?? tokens.merchant_id;

  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function createPagBankOAuthError(
  body: PagBankOAuthErrorResponse | null,
  httpStatus: number,
  fallbackMessage: string,
) {
  const code = readOptionalString(body?.code) ?? readOptionalString(body?.error);
  const message = readOptionalString(body?.message)
    ?? readOptionalString(body?.description)
    ?? readOptionalString(body?.error_description)
    ?? readOptionalString(body?.error)
    ?? readPagBankCauseMessage(body?.cause)
    ?? fallbackMessage;

  return new PagBankOAuthRequestError(message, { code, httpStatus });
}

function readPagBankErrorMessage(body: (PagBankOrderResponse & PagBankOAuthErrorResponse) | null) {
  return readOptionalString(body?.message)
    ?? readOptionalString(body?.description)
    ?? readOptionalString(body?.error_description)
    ?? readOptionalString(body?.error)
    ?? readPagBankCauseMessage(body?.cause);
}

function readPagBankCauseMessage(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = readPagBankCauseMessage(item);

      if (message) return message;
    }
  }

  if (typeof value === "object") {
    const record = value as JsonRecord;
    return readOptionalString(record.description)
      ?? readOptionalString(record.message)
      ?? readOptionalString(record.code);
  }

  return null;
}

function getCredentialValue(credentials: Map<string, string>, envNames: string[]) {
  for (const envName of envNames) {
    const value = credentials.get(envName) ?? process.env[envName];

    if (value?.trim()) {
      return value.trim();
    }
  }

  return "";
}

function resolvePagBankMode(credentials: Map<string, string>): "production" | "sandbox" {
  const explicit = getCredentialValue(credentials, ["PAGBANK_ENVIRONMENT"]).toLowerCase();
  const sandboxFlag = getCredentialValue(credentials, ["PAGBANK_SANDBOX"]).toLowerCase();

  if (explicit === "sandbox" || sandboxFlag === "true") {
    return "sandbox";
  }

  return "production";
}

function getAppBaseUrl() {
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : null;
  const deploymentUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || process.env.APP_URL
    || productionUrl
    || deploymentUrl
    || "http://localhost:3000";

  return baseUrl.replace(/\/+$/, "");
}

function normalizeCurrencyAmount(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100) / 100;
  }

  if (!value) return null;

  const cleaned = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")
    .trim();
  const amount = Number(cleaned);

  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

function sanitizePagBankText(value: string | null | undefined, maxLength: number) {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";

  if (!text) return null;

  return text.slice(0, maxLength);
}

function isTokenNearExpiry(value: string | null) {
  if (!value) return false;

  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;

  return time - Date.now() < 7 * 24 * 60 * 60 * 1000;
}

function shouldAllowUnsignedPagBankWebhook() {
  if (process.env.PAGBANK_ALLOW_UNSIGNED_WEBHOOKS === "true") {
    return true;
  }

  return process.env.NODE_ENV !== "production" && process.env.PAGBANK_ALLOW_UNSIGNED_WEBHOOKS !== "false";
}

function timingSafeHexEqual(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right) || left.length !== right.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
  } catch {
    return false;
  }
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
