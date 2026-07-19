import "server-only";

import { createHmac, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue, encryptCredentialValue } from "@/lib/security/credentials-crypto";
import type { SalesCatalogPaymentSessionStatus } from "./shared";

type JsonRecord = Record<string, unknown>;

type MercadoPagoOAuthTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  public_key?: string;
  user_id?: number | string;
  scope?: string;
  expires_in?: number;
  token_type?: string;
  live_mode?: boolean;
};

type MercadoPagoOAuthErrorResponse = {
  message?: string;
  error?: string;
  error_description?: string;
  cause?: unknown;
};

type MercadoPagoPaymentResponse = {
  id?: number | string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  date_approved?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
};

type IntegrationSecrets = {
  id: string;
  organizationId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  webhookSecret: string | null;
};

type MercadoPagoOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  testTokenEnabled: boolean;
};

type MercadoPagoOAuthTokenRequestResult = {
  body: MercadoPagoOAuthTokenResponse;
  httpStatus: number;
};

export type MercadoPagoOAuthCredentialValidation = {
  httpStatus: number;
  liveMode: boolean | null;
  scope: string | null;
  tokenType: string | null;
  expiresIn: number | null;
};

export type MercadoPagoPlatformBillingConfig = {
  accessToken: string;
  publicKey: string | null;
  webhookSecret: string | null;
  mode: "production" | "sandbox";
};

type PlatformCredentialRow = {
  env_name: string;
  encrypted_value: string | null;
};

const mercadoPagoApiBaseUrl = "https://api.mercadopago.com";
const mercadoPagoAuthorizationUrl = "https://auth.mercadopago.com/authorization";
const mercadoPagoPlatformIntegrationId = "mercado-pago";
const mercadoPagoBillingIntegrationId = "mercado-pago-billing";
const mercadoPagoOAuthCredentialNames = [
  "MERCADO_PAGO_CLIENT_ID",
  "MERCADO_PAGO_CLIENT_SECRET",
  "MERCADO_PAGO_REDIRECT_URI",
  "MERCADO_PAGO_TEST_TOKEN",
];
const mercadoPagoWebhookCredentialNames = ["MERCADO_PAGO_WEBHOOK_SECRET"];
const mercadoPagoBillingCredentialNames = [
  "MERCADO_PAGO_BILLING_ACCESS_TOKEN",
  "MERCADO_PAGO_BILLING_PUBLIC_KEY",
  "MERCADO_PAGO_BILLING_WEBHOOK_SECRET",
  "MERCADO_PAGO_BILLING_MODE",
];

export class MercadoPagoOAuthRequestError extends Error {
  readonly code: string | null;
  readonly httpStatus: number | null;

  constructor(message: string, options: { code?: string | null; httpStatus?: number | null } = {}) {
    super(message);
    this.name = "MercadoPagoOAuthRequestError";
    this.code = options.code ?? null;
    this.httpStatus = options.httpStatus ?? null;
  }
}

export function getMercadoPagoOAuthConfig() {
  return buildMercadoPagoOAuthConfigFromCredentials(new Map());
}

export async function loadMercadoPagoOAuthConfig(input: { client?: SupabaseClient } = {}) {
  const credentials = await loadMercadoPagoPlatformCredentials(input.client, mercadoPagoOAuthCredentialNames);

  return buildMercadoPagoOAuthConfigFromCredentials(credentials);
}

export async function loadMercadoPagoWebhookSecret(input: { client?: SupabaseClient } = {}) {
  const credentials = await loadMercadoPagoPlatformCredentials(input.client, mercadoPagoWebhookCredentialNames);

  return getCredentialValue(credentials, ["MERCADO_PAGO_WEBHOOK_SECRET"]) || null;
}

export async function isMercadoPagoTestTokenEnabled(input: { client?: SupabaseClient } = {}) {
  const credentials = await loadMercadoPagoPlatformCredentials(input.client, ["MERCADO_PAGO_TEST_TOKEN"]);

  return readEnabledFlag(getCredentialValue(credentials, ["MERCADO_PAGO_TEST_TOKEN"]));
}

export async function validateMercadoPagoOAuthCredentials(input: {
  client?: SupabaseClient;
  clientId?: string;
  clientSecret?: string;
  testTokenEnabled?: boolean;
} = {}): Promise<MercadoPagoOAuthCredentialValidation> {
  const clientId = input.clientId?.trim();
  const clientSecret = input.clientSecret?.trim();
  const hasExplicitCredentials = Boolean(clientId || clientSecret);
  const config = hasExplicitCredentials
    ? buildMercadoPagoOAuthConfigFromCredentials(new Map([
        ["MERCADO_PAGO_CLIENT_ID", clientId ?? ""],
        ["MERCADO_PAGO_CLIENT_SECRET", clientSecret ?? ""],
        ["MERCADO_PAGO_TEST_TOKEN", input.testTokenEnabled ? "true" : "false"],
      ]))
    : await loadMercadoPagoOAuthConfig({ client: input.client });
  const payload: Record<string, string> = {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "client_credentials",
  };
  const clientIdShapeError = readMercadoPagoClientIdShapeError(config.clientId);

  if (clientIdShapeError) {
    throw new MercadoPagoOAuthRequestError(clientIdShapeError, {
      code: "invalid_client_id_format",
      httpStatus: null,
    });
  }

  const { body, httpStatus } = await requestMercadoPagoOAuthToken(
    payload,
    "Mercado Pago nao aceitou Client ID e Client Secret.",
  );

  return {
    httpStatus,
    liveMode: typeof body.live_mode === "boolean" ? body.live_mode : null,
    scope: body.scope ?? null,
    tokenType: body.token_type ?? null,
    expiresIn: typeof body.expires_in === "number" ? body.expires_in : null,
  };
}

export async function loadMercadoPagoPlatformBillingConfig(input: { client?: SupabaseClient } = {}): Promise<MercadoPagoPlatformBillingConfig> {
  const credentials = await loadMercadoPagoPlatformCredentials(
    input.client,
    mercadoPagoBillingCredentialNames,
    mercadoPagoBillingIntegrationId,
  );
  const accessToken = getCredentialValue(credentials, ["MERCADO_PAGO_BILLING_ACCESS_TOKEN"]);
  const publicKey = getCredentialValue(credentials, ["MERCADO_PAGO_BILLING_PUBLIC_KEY"]) || null;
  const webhookSecret = getCredentialValue(credentials, ["MERCADO_PAGO_BILLING_WEBHOOK_SECRET"]) || null;
  const modeValue = getCredentialValue(credentials, ["MERCADO_PAGO_BILLING_MODE"]).toLowerCase();

  if (!accessToken) {
    throw new Error("Configure MERCADO_PAGO_BILLING_ACCESS_TOKEN para cobrar produtos ConnectyHub importados.");
  }

  return {
    accessToken,
    publicKey,
    webhookSecret,
    mode: modeValue === "sandbox" ? "sandbox" : "production",
  };
}

function buildMercadoPagoOAuthConfigFromCredentials(credentials: Map<string, string>): MercadoPagoOAuthConfig {
  const clientId = getCredentialValue(credentials, ["MERCADO_PAGO_CLIENT_ID"]);
  const clientSecret = getCredentialValue(credentials, ["MERCADO_PAGO_CLIENT_SECRET"]);
  const redirectUri = getCredentialValue(credentials, ["MERCADO_PAGO_REDIRECT_URI"])
    || `${getAppBaseUrl()}/api/dashboard/sales-catalog/payments/mercado-pago/callback`;
  const testTokenEnabled = readEnabledFlag(getCredentialValue(credentials, ["MERCADO_PAGO_TEST_TOKEN"]));

  if (!clientId || !clientSecret) {
    throw new Error("Configure Mercado Pago no painel admin da ConnectyHub antes de conectar contas de clientes.");
  }

  return { clientId, clientSecret, redirectUri, testTokenEnabled };
}

async function loadMercadoPagoPlatformCredentials(
  client: SupabaseClient | undefined,
  envNames: string[],
  integrationId = mercadoPagoPlatformIntegrationId,
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
          // If the vault cannot be decrypted in this runtime, fall back to env vars below.
        }
      }
    }
  }

  return credentials;
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

function readEnabledFlag(value: string | null | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export function getAppBaseUrl() {
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

export async function buildMercadoPagoAuthorizationUrl(input: {
  companyId: string;
  state: string;
  client?: SupabaseClient;
}) {
  const config = await loadMercadoPagoOAuthConfig({ client: input.client });
  const url = new URL(mercadoPagoAuthorizationUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", input.state);
  url.searchParams.set("redirect_uri", config.redirectUri);

  return url.toString();
}

export async function exchangeMercadoPagoAuthorizationCode(input: {
  code: string;
  client?: SupabaseClient;
}) {
  const config = await loadMercadoPagoOAuthConfig({ client: input.client });
  const payload: Record<string, string> = {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  };

  if (config.testTokenEnabled) {
    payload.test_token = "true";
  }

  const { body } = await requestMercadoPagoOAuthToken(payload, "Mercado Pago nao retornou Access Token.");

  return body;
}

export async function refreshMercadoPagoAccessToken(input: {
  refreshToken: string;
  client?: SupabaseClient;
}) {
  const config = await loadMercadoPagoOAuthConfig({ client: input.client });
  const { body } = await requestMercadoPagoOAuthToken({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  }, "Nao foi possivel renovar o token Mercado Pago.");

  return body;
}

async function requestMercadoPagoOAuthToken(
  payload: Record<string, string>,
  fallbackMessage: string,
): Promise<MercadoPagoOAuthTokenRequestResult> {
  const bodyParams = new URLSearchParams(payload);
  const response = await fetch(`${mercadoPagoApiBaseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: bodyParams,
  });
  const body = await response.json().catch(() => null) as (MercadoPagoOAuthTokenResponse & MercadoPagoOAuthErrorResponse) | null;

  if (!response.ok || !body?.access_token) {
    throw createMercadoPagoOAuthError(body, response.status, fallbackMessage);
  }

  return { body, httpStatus: response.status };
}

function createMercadoPagoOAuthError(
  body: MercadoPagoOAuthErrorResponse | null,
  httpStatus: number,
  fallbackMessage: string,
) {
  const code = readOptionalString(body?.error);
  const message = readOptionalString(body?.message)
    ?? readOptionalString(body?.error_description)
    ?? readOptionalString(body?.error)
    ?? readMercadoPagoCauseMessage(body?.cause)
    ?? fallbackMessage;

  return new MercadoPagoOAuthRequestError(message, { code, httpStatus });
}

function readMercadoPagoCauseMessage(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = readMercadoPagoCauseMessage(item);

      if (message) return message;
    }
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return readOptionalString(record.description)
      ?? readOptionalString(record.message)
      ?? readOptionalString(record.code);
  }

  return null;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readMercadoPagoClientIdShapeError(value: string) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "O Client ID do Mercado Pago precisa ser o ID/App ID do aplicativo, nao o e-mail da conta Mercado Pago.";
  }

  if (/^(APP_USR|TEST)-/i.test(value)) {
    return "O Client ID do Mercado Pago parece ser um Access Token ou Public Key. Use o ID/App ID do aplicativo OAuth.";
  }

  return null;
}

export function isMercadoPagoInvalidClientError(error: unknown) {
  const code = error instanceof MercadoPagoOAuthRequestError ? error.code : null;
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  return code === "invalid_client"
    || code === "invalid_client_id_format"
    || (message.includes("client_id") && message.includes("client_secret"))
    || message.includes("invalid_client");
}

export function formatMercadoPagoOAuthError(error: unknown) {
  if (error instanceof MercadoPagoOAuthRequestError && error.code === "invalid_client_id_format") {
    return error.message;
  }

  if (isMercadoPagoInvalidClientError(error)) {
    return "Client ID ou Client Secret do aplicativo Mercado Pago da ConnectyHub nao foram aceitos pelo Mercado Pago.";
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Falha ao validar OAuth Mercado Pago.";
}

export async function loadMercadoPagoIntegrationSecrets(
  client: SupabaseClient,
  organizationId: string,
): Promise<IntegrationSecrets | null> {
  const { data, error } = await client
    .from("sales_catalog_payment_integrations")
    .select("id, organization_id, status, access_token_encrypted, refresh_token_encrypted, token_expires_at, webhook_secret_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", "mercado_pago")
    .maybeSingle<{
      id: string;
      organization_id: string;
      status: string | null;
      access_token_encrypted: string | null;
      refresh_token_encrypted: string | null;
      token_expires_at: string | null;
      webhook_secret_encrypted: string | null;
    }>();

  if (error || !data || data.status !== "connected" || !data.access_token_encrypted) {
    return null;
  }

  const accessToken = decryptCredentialValue(data.access_token_encrypted);
  const refreshToken = data.refresh_token_encrypted ? decryptCredentialValue(data.refresh_token_encrypted) : null;
  const webhookSecret = data.webhook_secret_encrypted ? decryptCredentialValue(data.webhook_secret_encrypted) : null;

  return {
    id: data.id,
    organizationId: data.organization_id,
    accessToken,
    refreshToken,
    tokenExpiresAt: data.token_expires_at,
    webhookSecret,
  };
}

export async function ensureMercadoPagoAccessToken(input: {
  client: SupabaseClient;
  organizationId: string;
}) {
  const secrets = await loadMercadoPagoIntegrationSecrets(input.client, input.organizationId);

  if (!secrets) {
    throw new Error("Conecte uma conta Mercado Pago para gerar Pix automatico.");
  }

  if (!secrets.refreshToken || !isTokenNearExpiry(secrets.tokenExpiresAt)) {
    return secrets;
  }

  const refreshed = await refreshMercadoPagoAccessToken({
    refreshToken: secrets.refreshToken,
    client: input.client,
  });
  const expiresAt = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    : secrets.tokenExpiresAt;

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

export async function createMercadoPagoPixPayment(input: {
  accessToken: string;
  amount: number;
  description: string;
  externalReference: string;
  payerEmail: string;
  payerName?: string | null;
  payerDocument?: string | null;
  payerZipCode?: string | null;
  notificationUrl?: string | null;
  idempotencyKey?: string | null;
}) {
  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const payer = buildPixPayer(input);
  const response = await fetch(`${mercadoPagoApiBaseUrl}/v1/payments`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      Authorization: `Bearer ${input.accessToken}`,
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      transaction_amount: input.amount,
      description: input.description,
      payment_method_id: "pix",
      external_reference: input.externalReference,
      notification_url: input.notificationUrl ?? undefined,
      payer,
    }),
  });
  const body = await response.json().catch(() => null) as MercadoPagoPaymentResponse & { message?: string; error?: string } | null;

  if (!response.ok || !body?.id) {
    throw new Error(body?.message ?? body?.error ?? "Nao foi possivel gerar Pix no Mercado Pago.");
  }

  return { payment: body, idempotencyKey };
}

export async function createMercadoPagoCardPayment(input: {
  accessToken: string;
  amount: number;
  description: string;
  externalReference: string;
  payerEmail: string;
  token: string;
  paymentMethodId: string;
  installments: number;
  issuerId?: string | number | null;
  payerIdentification?: {
    type: string | null;
    number: string | null;
  } | null;
  notificationUrl?: string | null;
  idempotencyKey?: string | null;
}) {
  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const response = await fetch(`${mercadoPagoApiBaseUrl}/v1/payments`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      Authorization: `Bearer ${input.accessToken}`,
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      transaction_amount: input.amount,
      token: input.token,
      description: input.description,
      installments: input.installments,
      payment_method_id: input.paymentMethodId,
      issuer_id: input.issuerId ?? undefined,
      external_reference: input.externalReference,
      notification_url: input.notificationUrl ?? undefined,
      payer: {
        email: input.payerEmail,
        identification: normalizePayerIdentification(input.payerIdentification),
      },
    }),
  });
  const body = await response.json().catch(() => null) as MercadoPagoPaymentResponse & { message?: string; error?: string } | null;

  if (!response.ok || !body?.id) {
    throw new Error(body?.message ?? body?.error ?? "Nao foi possivel processar cartao no Mercado Pago.");
  }

  return { payment: body, idempotencyKey };
}

export async function getMercadoPagoPayment(input: {
  accessToken: string;
  paymentId: string;
}) {
  const response = await fetch(`${mercadoPagoApiBaseUrl}/v1/payments/${encodeURIComponent(input.paymentId)}`, {
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
  });
  const body = await response.json().catch(() => null) as MercadoPagoPaymentResponse & { message?: string; error?: string } | null;

  if (!response.ok || !body?.id) {
    throw new Error(body?.message ?? body?.error ?? "Nao foi possivel consultar pagamento Mercado Pago.");
  }

  return body;
}

export function mapMercadoPagoPaymentStatus(status: string | null | undefined): SalesCatalogPaymentSessionStatus {
  if (status === "approved" || status === "authorized") return "approved";
  if (status === "cancelled") return "cancelled";
  if (status === "refunded" || status === "charged_back") return "refunded";
  if (status === "rejected") return "rejected";
  if (status === "pending" || status === "in_process" || status === "in_mediation") return "pending";
  return "created";
}

export function extractMercadoPagoPixData(payment: MercadoPagoPaymentResponse) {
  const transactionData = payment.point_of_interaction?.transaction_data;

  return {
    providerPaymentId: payment.id ? String(payment.id) : null,
    providerStatus: payment.status ?? null,
    providerStatusDetail: payment.status_detail ?? null,
    status: mapMercadoPagoPaymentStatus(payment.status),
    pixQrCode: transactionData?.qr_code ?? null,
    pixQrCodeBase64: transactionData?.qr_code_base64 ?? null,
    pixTicketUrl: transactionData?.ticket_url ?? null,
    paidAt: payment.date_approved ?? null,
  };
}

export function verifyMercadoPagoWebhookSignature(input: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string | null;
}) {
  if (!input.secret) return { ok: true, skipped: true };
  if (!input.signatureHeader || !input.requestId || !input.dataId) {
    return { ok: false, skipped: false };
  }

  const parts = Object.fromEntries(input.signatureHeader.split(",").map((part) => {
    const [key, value] = part.trim().split("=");
    return [key, value];
  }));
  const ts = parts.ts;
  const expected = parts.v1;

  if (!ts || !expected) {
    return { ok: false, skipped: false };
  }

  const manifest = `id:${input.dataId};request-id:${input.requestId};ts:${ts};`;
  const digest = createHmac("sha256", input.secret).update(manifest).digest("hex");

  return { ok: digest === expected, skipped: false };
}

export function normalizeCurrencyAmount(value: string | number | null | undefined) {
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

export function buildSalesCatalogCheckoutUrl(sessionId: string) {
  return `${getAppBaseUrl()}/checkout/${sessionId}`;
}

export function buildMercadoPagoWebhookUrl() {
  return `${getAppBaseUrl()}/api/webhooks/mercado-pago`;
}

export function calculateMercadoPagoTokenExpiration(expiresIn?: number) {
  return expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
}

function isTokenNearExpiry(value: string | null) {
  if (!value) return false;

  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;

  return time - Date.now() < 7 * 24 * 60 * 60 * 1000;
}

function buildPixPayer(input: {
  payerEmail: string;
  payerName?: string | null;
  payerDocument?: string | null;
  payerZipCode?: string | null;
}) {
  const [firstName, ...rest] = (input.payerName ?? "").trim().split(/\s+/).filter(Boolean);
  const document = input.payerDocument?.replace(/\D/g, "");

  return {
    email: input.payerEmail,
    first_name: firstName || undefined,
    last_name: rest.join(" ") || undefined,
    identification: document && (document.length === 11 || document.length === 14)
      ? {
          type: document.length === 14 ? "CNPJ" : "CPF",
          number: document,
        }
      : undefined,
    address: input.payerZipCode
      ? { zip_code: input.payerZipCode.replace(/\D/g, "") }
      : undefined,
  };
}

function normalizePayerIdentification(value: {
  type: string | null;
  number: string | null;
} | null | undefined) {
  const type = value?.type?.trim().toUpperCase();
  const number = value?.number?.replace(/\D/g, "");

  if (!type || !number) {
    return undefined;
  }

  return { type, number };
}

export function serializeMercadoPagoOAuthTokens(tokens: MercadoPagoOAuthTokenResponse): JsonRecord {
  return {
    provider_account_id: tokens.user_id ? String(tokens.user_id) : null,
    live_mode: tokens.live_mode ?? null,
    token_type: tokens.token_type ?? null,
    scope: tokens.scope ?? null,
  };
}
