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

const mercadoPagoApiBaseUrl = "https://api.mercadopago.com";
const mercadoPagoAuthorizationUrl = "https://auth.mercadopago.com/authorization";

export function getMercadoPagoOAuthConfig() {
  const clientId = process.env.MERCADO_PAGO_CLIENT_ID?.trim();
  const clientSecret = process.env.MERCADO_PAGO_CLIENT_SECRET?.trim();
  const redirectUri = process.env.MERCADO_PAGO_REDIRECT_URI?.trim()
    || `${getAppBaseUrl()}/api/dashboard/sales-catalog/payments/mercado-pago/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("Configure MERCADO_PAGO_CLIENT_ID e MERCADO_PAGO_CLIENT_SECRET para conectar contas Mercado Pago.");
  }

  return { clientId, clientSecret, redirectUri };
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

export function buildMercadoPagoAuthorizationUrl(input: {
  companyId: string;
  state: string;
}) {
  const config = getMercadoPagoOAuthConfig();
  const url = new URL(mercadoPagoAuthorizationUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", input.state);
  url.searchParams.set("redirect_uri", config.redirectUri);

  return url.toString();
}

export async function exchangeMercadoPagoAuthorizationCode(code: string) {
  const config = getMercadoPagoOAuthConfig();
  const response = await fetch(`${mercadoPagoApiBaseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
      test_token: process.env.MERCADO_PAGO_TEST_TOKEN === "true" ? "true" : "false",
    }),
  });
  const body = await response.json().catch(() => null) as MercadoPagoOAuthTokenResponse & { message?: string; error?: string } | null;

  if (!response.ok || !body?.access_token) {
    throw new Error(body?.message ?? body?.error ?? "Mercado Pago nao retornou Access Token.");
  }

  return body;
}

export async function refreshMercadoPagoAccessToken(input: {
  refreshToken: string;
}) {
  const config = getMercadoPagoOAuthConfig();
  const response = await fetch(`${mercadoPagoApiBaseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    }),
  });
  const body = await response.json().catch(() => null) as MercadoPagoOAuthTokenResponse & { message?: string; error?: string } | null;

  if (!response.ok || !body?.access_token) {
    throw new Error(body?.message ?? body?.error ?? "Nao foi possivel renovar o token Mercado Pago.");
  }

  return body;
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

  const refreshed = await refreshMercadoPagoAccessToken({ refreshToken: secrets.refreshToken });
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

export function serializeMercadoPagoOAuthTokens(tokens: MercadoPagoOAuthTokenResponse): JsonRecord {
  return {
    provider_account_id: tokens.user_id ? String(tokens.user_id) : null,
    live_mode: tokens.live_mode ?? null,
    token_type: tokens.token_type ?? null,
    scope: tokens.scope ?? null,
  };
}
