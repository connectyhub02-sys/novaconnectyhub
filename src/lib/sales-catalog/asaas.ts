import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptCredentialValue,
  encryptCredentialValue,
  hashCredentialValue,
  previewCredentialValue,
} from "@/lib/security/credentials-crypto";
import type { SalesCatalogPaymentSessionStatus } from "./shared";

type JsonRecord = Record<string, unknown>;

type AsaasMode = "production" | "sandbox";

type AsaasIntegrationSecrets = {
  id: string;
  organizationId: string;
  accessToken: string;
  mode: AsaasMode;
  accountLabel: string | null;
  providerAccountId: string | null;
  webhookSecret: string | null;
  webhookUrl: string | null;
  metadata: JsonRecord;
};

type AsaasCustomerResponse = {
  object?: string;
  id?: string;
  dateCreated?: string;
  name?: string;
  email?: string;
  phone?: string;
  mobilePhone?: string;
  cpfCnpj?: string;
  deleted?: boolean;
  errors?: AsaasErrorItem[];
};

type AsaasWebhookResponse = {
  id?: string;
  name?: string;
  url?: string;
  email?: string;
  enabled?: boolean;
  interrupted?: boolean;
  apiVersion?: number;
  authToken?: string;
  sendType?: string;
  events?: string[];
  errors?: AsaasErrorItem[];
};

export type AsaasPaymentResponse = {
  object?: string;
  id?: string;
  dateCreated?: string;
  customer?: string;
  subscription?: string | null;
  installment?: string | null;
  paymentLink?: string | null;
  value?: number;
  netValue?: number;
  originalValue?: number | null;
  interestValue?: number | null;
  description?: string;
  billingType?: string;
  status?: string;
  dueDate?: string;
  originalDueDate?: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  installmentNumber?: number | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  transactionReceiptUrl?: string | null;
  externalReference?: string | null;
  deleted?: boolean;
  anticipated?: boolean;
  anticipable?: boolean;
  creditDate?: string | null;
  estimatedCreditDate?: string | null;
  errors?: AsaasErrorItem[];
};

export type AsaasCheckoutResponse = {
  id?: string;
  url?: string;
  link?: string;
  checkoutUrl?: string;
  status?: string;
  errors?: AsaasErrorItem[];
};

export type AsaasPixQrCodeResponse = {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
  success?: boolean;
  errors?: AsaasErrorItem[];
};

type AsaasErrorItem = {
  code?: string;
  description?: string;
  message?: string;
};

export type AsaasPaymentData = {
  status: SalesCatalogPaymentSessionStatus;
  providerStatus: string | null;
  providerStatusDetail: string | null;
  providerPaymentId: string | null;
  providerCustomerId: string | null;
  paidAt: string | null;
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  pixTicketUrl: string | null;
  pixExpirationDate: string | null;
};

export type AsaasCustomerInput = {
  accessToken: string;
  mode?: AsaasMode | null;
  name?: string | null;
  cpfCnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  postalCode?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  complement?: string | null;
  province?: string | null;
  externalReference?: string | null;
  notificationDisabled?: boolean | null;
};

export type AsaasPixPaymentInput = {
  accessToken: string;
  mode?: AsaasMode | null;
  amount: number;
  description: string;
  externalReference: string;
  payerName?: string | null;
  payerDocument?: string | null;
  payerEmail?: string | null;
  payerPhone?: string | null;
  payerZipCode?: string | null;
  payerAddress?: string | null;
  dueDate?: string | null;
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

export type AsaasCheckoutInput = Omit<AsaasPixPaymentInput, "dueDate"> & {
  billingTypes?: Array<"CREDIT_CARD" | "PIX"> | null;
  minutesToExpire?: number | null;
  successUrl?: string | null;
  cancelUrl?: string | null;
  expiredUrl?: string | null;
};

const asaasProviderId = "asaas";

export function buildAsaasWebhookUrl() {
  return `${getAppBaseUrl()}/api/webhooks/asaas`;
}

export function buildAsaasAffiliateLandingUrl(input: { companyId?: string | null } = {}) {
  const configured = process.env.ASAAS_AFFILIATE_URL?.trim()
    || process.env.NEXT_PUBLIC_ASAAS_AFFILIATE_URL?.trim()
    || "https://www.asaas.com/";
  const url = new URL(configured);

  url.searchParams.set("utm_source", url.searchParams.get("utm_source") ?? "connectyhub");
  url.searchParams.set("utm_medium", url.searchParams.get("utm_medium") ?? "integration");
  url.searchParams.set("utm_campaign", url.searchParams.get("utm_campaign") ?? "asaas_connect");
  if (input.companyId) {
    url.searchParams.set("company_id", input.companyId);
  }

  return url.toString();
}

export async function saveAsaasPaymentIntegration(input: {
  client: SupabaseClient;
  organizationId: string;
  accessToken: string;
  mode?: AsaasMode | null;
  actorId?: string | null;
  webhookEmail?: string | null;
}) {
  const accessToken = normalizeAsaasAccessToken(input.accessToken);

  if (!accessToken) {
    throw new Error("Informe a API Key do Asaas para conectar a conta.");
  }

  const mode = input.mode === "sandbox" ? "sandbox" : "production";
  const account = await validateAsaasAccessToken({ accessToken, mode });
  const now = new Date().toISOString();
  const webhookSecret = createAsaasWebhookSecret();
  const webhookUrl = buildAsaasWebhookUrl();
  const webhookProvisioning = await createAsaasPaymentWebhook({
    accessToken,
    mode,
    url: webhookUrl,
    authToken: webhookSecret,
    email: input.webhookEmail,
  })
    .then((webhook) => ({
      ok: true,
      id: webhook.id ?? null,
      name: webhook.name ?? null,
      events: webhook.events ?? null,
      error: null,
    }))
    .catch((error: unknown) => ({
      ok: false,
      id: null,
      name: null,
      events: null,
      error: error instanceof Error ? error.message : "Nao foi possivel criar webhook Asaas automaticamente.",
    }));
  const accountLabel = account.label ?? previewCredentialValue(accessToken);
  const providerAccountId = account.id ?? account.walletId ?? null;
  const { data, error } = await input.client
    .from("sales_catalog_payment_integrations")
    .upsert({
      organization_id: input.organizationId,
      provider: asaasProviderId,
      mode,
      status: "connected",
      account_label: accountLabel,
      provider_account_id: providerAccountId,
      access_token_encrypted: encryptCredentialValue(accessToken),
      access_token_hash: hashCredentialValue(accessToken),
      refresh_token_encrypted: null,
      refresh_token_hash: null,
      token_type: "api_key",
      token_scope: "customers payments pix checkouts webhooks",
      token_expires_at: null,
      webhook_secret_encrypted: encryptCredentialValue(webhookSecret),
      webhook_secret_hash: hashCredentialValue(webhookSecret),
      webhook_url: webhookUrl,
      last_error: webhookProvisioning.ok ? null : webhookProvisioning.error,
      connected_at: now,
      metadata: {
        connected_by: input.actorId ?? null,
        connected_at: now,
        auth_type: "api_key",
        account_status: account.status,
        account_label: accountLabel,
        wallet_id: account.walletId,
        has_active_pix_key: account.hasActivePixKey,
        pix_key_count: account.pixKeyCount,
        pix_without_key_supported_but_transitional: true,
        webhook_provider_id: webhookProvisioning.id,
        webhook_provisioned: webhookProvisioning.ok,
        webhook_provision_error: webhookProvisioning.error,
        webhook_events: webhookProvisioning.events,
        provider_docs: "https://docs.asaas.com/docs/cobrancas-via-pix",
      },
      updated_at: now,
    }, { onConflict: "organization_id,provider" })
    .select("id, organization_id, provider, mode, status, account_label, provider_account_id, public_key, access_token_encrypted, refresh_token_encrypted, token_scope, token_expires_at, connected_at, last_error, webhook_secret_encrypted, webhook_url, metadata, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel salvar a conexao Asaas.");
  }

  return data;
}

export async function disconnectAsaasPaymentIntegration(input: {
  client: SupabaseClient;
  organizationId: string;
  actorId?: string | null;
}) {
  const { data, error } = await input.client
    .from("sales_catalog_payment_integrations")
    .update({
      status: "disabled",
      access_token_encrypted: null,
      access_token_hash: null,
      refresh_token_encrypted: null,
      refresh_token_hash: null,
      token_expires_at: null,
      webhook_secret_encrypted: null,
      webhook_secret_hash: null,
      last_error: null,
      metadata: {
        disconnected_by: input.actorId ?? null,
        disconnected_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId)
    .eq("provider", asaasProviderId)
    .select("id, organization_id, provider, mode, status, account_label, provider_account_id, public_key, access_token_encrypted, refresh_token_encrypted, token_scope, token_expires_at, connected_at, last_error, webhook_secret_encrypted, webhook_url, metadata, created_at, updated_at")
    .maybeSingle();

  if (error) {
    throw new Error(`Nao foi possivel desconectar Asaas: ${error.message}`);
  }

  if (!data) {
    throw new Error("Nenhuma conexao Asaas encontrada para esta empresa.");
  }

  return data;
}

export async function loadAsaasIntegrationSecrets(
  client: SupabaseClient,
  organizationId: string,
): Promise<AsaasIntegrationSecrets | null> {
  const { data, error } = await client
    .from("sales_catalog_payment_integrations")
    .select("id, organization_id, mode, status, account_label, provider_account_id, access_token_encrypted, webhook_secret_encrypted, webhook_url, metadata")
    .eq("organization_id", organizationId)
    .eq("provider", asaasProviderId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      mode: string | null;
      status: string | null;
      account_label: string | null;
      provider_account_id: string | null;
      access_token_encrypted: string | null;
      webhook_secret_encrypted: string | null;
      webhook_url: string | null;
      metadata: JsonRecord | null;
    }>();

  if (error || !data || data.status !== "connected" || !data.access_token_encrypted) {
    return null;
  }

  return {
    id: data.id,
    organizationId: data.organization_id,
    accessToken: decryptCredentialValue(data.access_token_encrypted),
    mode: data.mode === "sandbox" ? "sandbox" : "production",
    accountLabel: data.account_label,
    providerAccountId: data.provider_account_id,
    webhookSecret: data.webhook_secret_encrypted ? decryptCredentialValue(data.webhook_secret_encrypted) : null,
    webhookUrl: data.webhook_url,
    metadata: data.metadata ?? {},
  };
}

export async function ensureAsaasAccessToken(input: {
  client: SupabaseClient;
  organizationId: string;
}) {
  const secrets = await loadAsaasIntegrationSecrets(input.client, input.organizationId);

  if (!secrets) {
    throw new Error("Conecte uma conta Asaas para gerar cobranca automatica.");
  }

  return secrets;
}

export async function createAsaasPixPayment(input: AsaasPixPaymentInput) {
  const customer = await createAsaasCustomer({
    accessToken: input.accessToken,
    mode: input.mode,
    name: input.payerName,
    cpfCnpj: input.payerDocument,
    email: input.payerEmail,
    mobilePhone: input.payerPhone,
    postalCode: input.payerZipCode,
    ...parseAsaasAddress(input.payerAddress),
    externalReference: input.externalReference,
    notificationDisabled: true,
  });
  const dueDate = input.dueDate ?? formatAsaasDueDate(new Date());
  const payment = await requestAsaas<AsaasPaymentResponse>({
    accessToken: input.accessToken,
    mode: input.mode,
    endpoint: "/payments",
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    payload: {
      customer: customer.id,
      billingType: "PIX",
      value: normalizeAsaasAmount(input.amount),
      dueDate,
      description: sanitizeAsaasText(input.description, 500) ?? "Pedido ConnectyHub",
      externalReference: input.externalReference,
    },
    fallbackMessage: "Nao foi possivel gerar Pix no Asaas.",
  });
  const pixQrCode = payment.id
    ? await getAsaasPixQrCode({
        accessToken: input.accessToken,
        mode: input.mode,
        paymentId: payment.id,
      })
    : null;

  return { payment, customer, pixQrCode };
}

export async function createAsaasCheckout(input: AsaasCheckoutInput) {
  const billingTypes = input.billingTypes?.length ? input.billingTypes : ["CREDIT_CARD"];
  const amount = normalizeAsaasAmount(input.amount);
  const fallbackItemName = sanitizeAsaasText(input.description, 80) ?? "Pedido ConnectyHub";
  const items = buildAsaasCheckoutItems(input.items, amount, fallbackItemName);
  const checkout = await requestAsaas<AsaasCheckoutResponse>({
    accessToken: input.accessToken,
    mode: input.mode,
    endpoint: "/checkouts",
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    payload: {
      billingTypes,
      chargeTypes: ["DETACHED"],
      minutesToExpire: normalizeAsaasCheckoutExpiration(input.minutesToExpire),
      externalReference: input.externalReference,
      items,
      customerData: buildAsaasCheckoutCustomerData(input),
      callback: buildAsaasCheckoutCallback(input),
    },
    fallbackMessage: "Nao foi possivel criar o checkout Asaas.",
  });

  return checkout;
}

export async function getAsaasPayment(input: {
  accessToken: string;
  mode?: AsaasMode | null;
  paymentId: string;
}) {
  return requestAsaas<AsaasPaymentResponse>({
    accessToken: input.accessToken,
    mode: input.mode,
    endpoint: `/payments/${encodeURIComponent(input.paymentId)}`,
    method: "GET",
    fallbackMessage: "Nao foi possivel consultar a cobranca Asaas.",
  });
}

export async function getAsaasPixQrCode(input: {
  accessToken: string;
  mode?: AsaasMode | null;
  paymentId: string;
}) {
  return requestAsaas<AsaasPixQrCodeResponse>({
    accessToken: input.accessToken,
    mode: input.mode,
    endpoint: `/payments/${encodeURIComponent(input.paymentId)}/pixQrCode`,
    method: "GET",
    fallbackMessage: "Nao foi possivel obter o Pix copia e cola no Asaas.",
  });
}

async function createAsaasPaymentWebhook(input: {
  accessToken: string;
  mode: AsaasMode;
  url: string;
  authToken: string;
  email?: string | null;
}) {
  return requestAsaas<AsaasWebhookResponse>({
    accessToken: input.accessToken,
    mode: input.mode,
    endpoint: "/webhooks",
    method: "POST",
    payload: {
      name: "ConnectyHub - Pagamentos",
      url: input.url,
      email: normalizeAsaasWebhookEmail(input.email),
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      authToken: input.authToken,
      sendType: "SEQUENTIALLY",
      events: [
        "PAYMENT_CREATED",
        "PAYMENT_UPDATED",
        "PAYMENT_CONFIRMED",
        "PAYMENT_RECEIVED",
        "PAYMENT_OVERDUE",
        "PAYMENT_DELETED",
        "PAYMENT_RESTORED",
        "PAYMENT_REFUNDED",
        "PAYMENT_CHARGEBACK_REQUESTED",
        "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
        "PAYMENT_AWAITING_RISK_ANALYSIS",
        "PAYMENT_APPROVED_BY_RISK_ANALYSIS",
        "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
      ],
    },
    fallbackMessage: "Nao foi possivel criar webhook Asaas automaticamente.",
  });
}

export function extractAsaasPaymentData(payment: AsaasPaymentResponse, qrCode?: AsaasPixQrCodeResponse | null): AsaasPaymentData {
  const providerStatus = payment.status ?? null;

  return {
    status: mapAsaasPaymentStatus(providerStatus),
    providerStatus,
    providerStatusDetail: readAsaasErrorMessage(payment) ?? null,
    providerPaymentId: payment.id ?? null,
    providerCustomerId: payment.customer ?? null,
    paidAt: payment.paymentDate ?? payment.clientPaymentDate ?? null,
    pixQrCode: qrCode?.payload ?? null,
    pixQrCodeBase64: qrCode?.encodedImage ?? null,
    pixTicketUrl: payment.invoiceUrl ?? null,
    pixExpirationDate: qrCode?.expirationDate ?? null,
  };
}

export function mapAsaasPaymentStatus(status: string | null | undefined): SalesCatalogPaymentSessionStatus {
  const normalized = status?.trim().toUpperCase();

  if (normalized === "RECEIVED" || normalized === "CONFIRMED" || normalized === "RECEIVED_IN_CASH") return "approved";
  if (normalized === "OVERDUE" || normalized === "PENDING") return "pending";
  if (normalized === "REFUNDED" || normalized === "PARTIALLY_REFUNDED" || normalized === "REFUND_REQUESTED" || normalized === "CHARGEBACK_REQUESTED" || normalized === "CHARGEBACK_DISPUTE" || normalized === "AWAITING_CHARGEBACK_REVERSAL" || normalized === "DUNNING_RECEIVED" || normalized === "DUNNING_REQUESTED") return "refunded";
  if (normalized === "DELETED" || normalized === "CANCELLED" || normalized === "CANCELED") return "cancelled";
  if (normalized === "PAYMENT_REFUSED" || normalized === "FAILED") return "rejected";
  return "created";
}

export function buildAsaasCheckoutUrl(checkout: AsaasCheckoutResponse) {
  const explicit = checkout.url ?? checkout.checkoutUrl ?? checkout.link;
  if (explicit) return explicit;
  if (!checkout.id) return null;

  return `https://asaas.com/checkoutSession/show?id=${encodeURIComponent(checkout.id)}`;
}

export function verifyAsaasWebhookToken(input: {
  header: string | null;
  token: string | null;
}) {
  if (!input.token) {
    return { ok: false, skipped: true, reason: "missing_webhook_token" };
  }

  if (!input.header) {
    return { ok: false, skipped: false, reason: "missing_asaas_access_token_header" };
  }

  const header = input.header.trim();

  return {
    ok: timingSafeStringEqual(header, input.token),
    skipped: false,
    reason: header ? "signature_mismatch" : "missing_asaas_access_token_header",
  };
}

async function createAsaasCustomer(input: AsaasCustomerInput) {
  const cpfCnpj = normalizeAsaasDocument(input.cpfCnpj);
  const name = sanitizeAsaasText(input.name, 120);

  if (!name) {
    throw new Error("Informe o nome do cliente para criar cobranca no Asaas.");
  }

  if (!cpfCnpj) {
    throw new Error("Informe CPF ou CNPJ do cliente para criar cobranca no Asaas.");
  }

  const customer = await requestAsaas<AsaasCustomerResponse>({
    accessToken: input.accessToken,
    mode: input.mode,
    endpoint: "/customers",
    method: "POST",
    payload: {
      name,
      cpfCnpj,
      email: sanitizeAsaasText(input.email, 120) ?? undefined,
      phone: normalizeAsaasPhone(input.phone),
      mobilePhone: normalizeAsaasPhone(input.mobilePhone ?? input.phone),
      postalCode: normalizeAsaasPostalCode(input.postalCode) ?? undefined,
      address: sanitizeAsaasText(input.address, 120) ?? undefined,
      addressNumber: sanitizeAsaasText(input.addressNumber, 20) ?? undefined,
      complement: sanitizeAsaasText(input.complement, 255) ?? undefined,
      province: sanitizeAsaasText(input.province, 80) ?? undefined,
      externalReference: input.externalReference,
      notificationDisabled: input.notificationDisabled ?? true,
    },
    fallbackMessage: "Nao foi possivel cadastrar o cliente no Asaas.",
  });

  if (!customer.id) {
    throw new Error("Asaas nao retornou o cliente da cobranca.");
  }

  return customer;
}

async function validateAsaasAccessToken(input: { accessToken: string; mode: AsaasMode }) {
  const [account, pixKeys] = await Promise.all([
    requestAsaas<JsonRecord>({
      accessToken: input.accessToken,
      mode: input.mode,
      endpoint: "/myAccount",
      method: "GET",
      fallbackMessage: "Nao foi possivel validar a API Key do Asaas.",
    }).catch(() => null),
    requestAsaas<{ data?: Array<{ status?: string; key?: string; id?: string; type?: string }> }>({
      accessToken: input.accessToken,
      mode: input.mode,
      endpoint: "/pix/addressKeys?status=ACTIVE&limit=100&offset=0",
      method: "GET",
      fallbackMessage: "Nao foi possivel validar as chaves Pix do Asaas.",
    }).catch(() => null),
  ]);

  if (!account && !pixKeys) {
    throw new Error("API Key Asaas invalida ou sem acesso ao ambiente selecionado.");
  }

  const label = readString(account?.name)
    ?? readString(account?.commercialName)
    ?? readString(account?.companyName)
    ?? readString(account?.email)
    ?? null;
  const id = readString(account?.id)
    ?? readString(account?.accountId)
    ?? readString(account?.walletId)
    ?? null;
  const walletId = readString(account?.walletId) ?? readString(account?.wallet_id) ?? null;
  const activePixKeys = (pixKeys?.data ?? []).filter((key) => key.status === "ACTIVE");

  return {
    id,
    walletId,
    label,
    status: readString(account?.status) ?? "validated",
    hasActivePixKey: activePixKeys.length > 0,
    pixKeyCount: activePixKeys.length,
  };
}

async function requestAsaas<T>(input: {
  accessToken: string;
  mode?: AsaasMode | null;
  endpoint: string;
  method: "GET" | "POST";
  payload?: JsonRecord;
  idempotencyKey?: string | null;
  fallbackMessage: string;
}): Promise<T> {
  const response = await fetch(`${getAsaasApiBaseUrl(input.mode)}${input.endpoint}`, {
    method: input.method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": buildAsaasUserAgent(input.mode),
      access_token: input.accessToken,
      ...(input.idempotencyKey ? { "asaas-idempotency-key": input.idempotencyKey } : {}),
    },
    body: input.method === "POST" ? JSON.stringify(compactObject(input.payload ?? {})) : undefined,
  });
  const body = await response.json().catch(() => null) as (T & { errors?: AsaasErrorItem[]; error?: string; message?: string }) | null;

  if (!response.ok || !body) {
    throw new Error(readAsaasErrorMessage(body) ?? input.fallbackMessage);
  }

  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw new Error(readAsaasErrorMessage(body) ?? input.fallbackMessage);
  }

  return body as T;
}

function buildAsaasUserAgent(mode?: AsaasMode | null) {
  const normalizedMode = mode === "sandbox" ? "sandbox" : "production";

  return `ConnectyHub/1.0 (Next.js; ${normalizedMode})`;
}

function getAsaasApiBaseUrl(mode?: AsaasMode | null) {
  const normalizedMode = mode === "sandbox" ? "sandbox" : "production";
  const configured = normalizedMode === "sandbox"
    ? process.env.ASAAS_SANDBOX_API_BASE_URL?.trim()
    : process.env.ASAAS_API_BASE_URL?.trim();
  const baseUrl = configured || (normalizedMode === "sandbox"
    ? "https://api-sandbox.asaas.com/v3"
    : "https://api.asaas.com/v3");

  return baseUrl.replace(/\/+$/, "");
}

function buildAsaasCheckoutCustomerData(input: AsaasCheckoutInput) {
  const document = normalizeAsaasDocument(input.payerDocument);
  const name = sanitizeAsaasText(input.payerName, 120);
  const customerData = compactObject({
    name: name ?? undefined,
    cpfCnpj: document ?? undefined,
    email: sanitizeAsaasText(input.payerEmail, 120) ?? undefined,
    phone: normalizeAsaasPhone(input.payerPhone) ?? undefined,
    mobilePhone: normalizeAsaasPhone(input.payerPhone) ?? undefined,
    postalCode: normalizeAsaasPostalCode(input.payerZipCode) ?? undefined,
    ...parseAsaasAddress(input.payerAddress),
  });

  return Object.keys(customerData).length > 0 ? customerData : undefined;
}

function buildAsaasCheckoutCallback(input: AsaasCheckoutInput) {
  const callback = compactObject({
    successUrl: input.successUrl ?? undefined,
    cancelUrl: input.cancelUrl ?? undefined,
    expiredUrl: input.expiredUrl ?? undefined,
  });

  return Object.keys(callback).length > 0 ? callback : undefined;
}

function buildAsaasCheckoutItems(
  items: AsaasCheckoutInput["items"] | undefined,
  fallbackAmount: number,
  fallbackName: string,
) {
  const mapped = (items ?? []).flatMap((item) => {
    const name = sanitizeAsaasText(item.title, 80);
    const quantity = normalizeAsaasQuantity(item.quantity);
    const value = normalizeAsaasItemValue(item, quantity);

    if (!name || !value) return [];

    return [{ name, quantity, value }];
  });
  const mappedTotal = mapped.reduce((total, item) => total + item.quantity * item.value, 0);

  if (mapped.length > 0 && Math.round(mappedTotal * 100) === Math.round(fallbackAmount * 100)) {
    return mapped;
  }

  return [{ name: fallbackName, quantity: 1, value: fallbackAmount }];
}

function normalizeAsaasItemValue(
  item: NonNullable<AsaasCheckoutInput["items"]>[number],
  quantity: number,
) {
  const total = normalizeNullableAsaasAmount(item.total);
  if (total && quantity > 0) return roundAsaasAmount(total / quantity);

  return normalizeNullableAsaasAmount(item.salePrice)
    ?? normalizeNullableAsaasAmount(item.unitPrice)
    ?? null;
}

function normalizeAsaasCheckoutExpiration(value: number | null | undefined) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : 60;

  return Math.min(1440, Math.max(10, Math.round(parsed)));
}

function normalizeAsaasQuantity(value: number | null | undefined) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : 1;

  return Math.max(1, Math.trunc(parsed));
}

function normalizeAsaasAmount(value: string | number) {
  const parsed = normalizeNullableAsaasAmount(value);

  if (!parsed || parsed <= 0) {
    throw new Error("Informe um valor valido para criar cobranca no Asaas.");
  }

  return parsed;
}

function normalizeNullableAsaasAmount(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return roundAsaasAmount(value);
  }

  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? roundAsaasAmount(parsed) : null;
}

function roundAsaasAmount(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeAsaasAccessToken(value: string | null | undefined) {
  return value?.trim() || null;
}

function normalizeAsaasWebhookEmail(value: string | null | undefined) {
  const configured = value?.trim()
    || process.env.ASAAS_WEBHOOK_ALERT_EMAIL?.trim()
    || process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim()
    || "connectyhub@gmail.com";

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configured) ? configured.toLowerCase() : "connectyhub@gmail.com";
}

function normalizeAsaasDocument(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";

  return digits.length === 11 || digits.length === 14 ? digits : null;
}

function normalizeAsaasPostalCode(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";

  return digits.length === 8 ? digits : null;
}

function normalizeAsaasPhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";

  return digits.length >= 10 && digits.length <= 13 ? digits : undefined;
}

function parseAsaasAddress(value: string | null | undefined) {
  const text = sanitizeAsaasText(value, 255);
  if (!text) return {};

  const numberMatch = text.match(/\b(?:n(?:umero|um|o)?\.?\s*)?(\d{1,6})\b/i);

  return compactObject({
    address: text,
    addressNumber: numberMatch?.[1],
  });
}

function sanitizeAsaasText(value: string | null | undefined, maxLength: number) {
  const text = value?.replace(/\s+/g, " ").trim();

  return text ? text.slice(0, maxLength) : null;
}

function compactObject(record: JsonRecord) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function formatAsaasDueDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function readAsaasErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as { errors?: AsaasErrorItem[]; error?: string; message?: string };
  const errors = Array.isArray(record.errors) ? record.errors : [];
  const errorMessages = errors
    .map((error) => error.description ?? error.message ?? error.code)
    .filter((item): item is string => Boolean(item));

  return errorMessages[0] ?? record.message ?? record.error ?? null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function createAsaasWebhookSecret() {
  return randomBytes(32).toString("hex");
}

function timingSafeStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
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
