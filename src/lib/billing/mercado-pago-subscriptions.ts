import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppBaseUrl, loadMercadoPagoPlatformBillingConfig } from "@/lib/sales-catalog/mercado-pago";

type JsonRecord = Record<string, unknown>;

type MercadoPagoPreapprovalResponse = {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
  status?: string;
  external_reference?: string;
  payer_email?: string;
  next_payment_date?: string;
  auto_recurring?: {
    frequency?: number;
    frequency_type?: string;
    start_date?: string;
    end_date?: string;
    transaction_amount?: number;
    currency_id?: string;
  };
  date_created?: string;
  last_modified?: string;
  message?: string;
  error?: string;
  error_description?: string;
  cause?: unknown;
};

export type MercadoPagoBillingSubscriptionCheckout = {
  id: string;
  initPoint: string;
  status: string | null;
  externalReference: string;
  idempotencyKey: string;
  raw: JsonRecord;
};

export type MercadoPagoBillingSubscriptionDetails = {
  id: string;
  status: string | null;
  externalReference: string | null;
  payerEmail: string | null;
  nextPaymentDate: string | null;
  amountBrl: number | null;
  currencyId: string | null;
  raw: JsonRecord;
};

export class MercadoPagoBillingSubscriptionError extends Error {
  readonly code: string | null;
  readonly httpStatus: number | null;
  readonly body: unknown;

  constructor(
    message: string,
    options: {
      code?: string | null;
      httpStatus?: number | null;
      body?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "MercadoPagoBillingSubscriptionError";
    this.code = options.code ?? null;
    this.httpStatus = options.httpStatus ?? null;
    this.body = options.body ?? null;
  }
}

const mercadoPagoApiBaseUrl = "https://api.mercadopago.com";

export function buildPlatformBillingPlanReturnUrl(planCode: string) {
  const url = new URL(`${getAppBaseUrl()}/dashboard/planos`);
  url.searchParams.set("billing", "mercado_pago_return");
  url.searchParams.set("plan", planCode);

  return url.toString();
}

export async function createMercadoPagoPendingBillingSubscription(input: {
  client?: SupabaseClient;
  amountBrl: number;
  planCode: string;
  planName: string;
  payerEmail: string;
  externalReference: string;
  backUrl?: string | null;
  idempotencyKey?: string | null;
}): Promise<MercadoPagoBillingSubscriptionCheckout> {
  const amount = normalizeAmount(input.amountBrl);
  const payerEmail = input.payerEmail.trim();

  if (!amount || amount <= 0) {
    throw new MercadoPagoBillingSubscriptionError("O plano precisa ter valor mensal maior que zero.");
  }

  if (!payerEmail) {
    throw new MercadoPagoBillingSubscriptionError("Informe um e-mail do pagador para criar a assinatura.");
  }

  const config = await loadMercadoPagoPlatformBillingConfig({ client: input.client });
  const idempotencyKey = input.idempotencyKey?.trim() || randomUUID();
  const body = {
    reason: sanitizeMercadoPagoText(`ConnectyHub ${input.planName}`, 255),
    external_reference: input.externalReference,
    payer_email: payerEmail,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: amount,
      currency_id: "BRL",
    },
    back_url: input.backUrl ?? buildPlatformBillingPlanReturnUrl(input.planCode),
    status: "pending",
  };

  const response = await fetch(`${mercadoPagoApiBaseUrl}/preapproval`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as MercadoPagoPreapprovalResponse | null;

  if (!response.ok || !payload?.id) {
    throw createMercadoPagoSubscriptionError(
      payload,
      response.status,
      "Mercado Pago nao criou a assinatura recorrente.",
    );
  }

  const initPoint = readOptionalString(payload.init_point) ?? readOptionalString(payload.sandbox_init_point);

  if (!initPoint) {
    throw new MercadoPagoBillingSubscriptionError("Mercado Pago criou a assinatura, mas nao retornou o link de checkout.", {
      httpStatus: response.status,
      body: payload,
    });
  }

  return {
    id: payload.id,
    initPoint,
    status: readOptionalString(payload.status),
    externalReference: input.externalReference,
    idempotencyKey,
    raw: {
      id: payload.id,
      init_point: payload.init_point ?? null,
      sandbox_init_point: payload.sandbox_init_point ?? null,
      status: payload.status ?? null,
      external_reference: payload.external_reference ?? null,
      date_created: payload.date_created ?? null,
      last_modified: payload.last_modified ?? null,
    },
  };
}

export async function getMercadoPagoBillingSubscription(input: {
  client?: SupabaseClient;
  subscriptionId: string;
}): Promise<MercadoPagoBillingSubscriptionDetails> {
  const subscriptionId = input.subscriptionId.trim();

  if (!subscriptionId) {
    throw new MercadoPagoBillingSubscriptionError("Identificador da assinatura Mercado Pago ausente.");
  }

  const config = await loadMercadoPagoPlatformBillingConfig({ client: input.client });
  const response = await fetch(`${mercadoPagoApiBaseUrl}/preapproval/${encodeURIComponent(subscriptionId)}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.accessToken}`,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as MercadoPagoPreapprovalResponse | null;

  if (!response.ok || !payload?.id) {
    throw createMercadoPagoSubscriptionError(
      payload,
      response.status,
      "Nao foi possivel consultar a assinatura no Mercado Pago.",
    );
  }

  return {
    id: payload.id,
    status: readOptionalString(payload.status),
    externalReference: readOptionalString(payload.external_reference),
    payerEmail: readOptionalString(payload.payer_email),
    nextPaymentDate: readOptionalString(payload.next_payment_date),
    amountBrl: normalizeAmount(Number(payload.auto_recurring?.transaction_amount ?? 0)),
    currencyId: readOptionalString(payload.auto_recurring?.currency_id),
    raw: {
      id: payload.id,
      status: payload.status ?? null,
      external_reference: payload.external_reference ?? null,
      payer_email: payload.payer_email ?? null,
      next_payment_date: payload.next_payment_date ?? null,
      auto_recurring: payload.auto_recurring ?? null,
      date_created: payload.date_created ?? null,
      last_modified: payload.last_modified ?? null,
    },
  };
}

export async function cancelMercadoPagoBillingSubscription(input: {
  client?: SupabaseClient;
  subscriptionId: string;
  idempotencyKey?: string | null;
}): Promise<MercadoPagoBillingSubscriptionDetails> {
  const subscriptionId = input.subscriptionId.trim();

  if (!subscriptionId) {
    throw new MercadoPagoBillingSubscriptionError("Identificador da assinatura Mercado Pago ausente.");
  }

  const config = await loadMercadoPagoPlatformBillingConfig({ client: input.client });
  const response = await fetch(`${mercadoPagoApiBaseUrl}/preapproval/${encodeURIComponent(subscriptionId)}`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": input.idempotencyKey?.trim() || randomUUID(),
    },
    body: JSON.stringify({ status: "canceled" }),
  });
  const payload = await response.json().catch(() => null) as MercadoPagoPreapprovalResponse | null;

  if (!response.ok || !payload?.id) {
    throw createMercadoPagoSubscriptionError(
      payload,
      response.status,
      "Nao foi possivel cancelar a assinatura no Mercado Pago.",
    );
  }

  return {
    id: payload.id,
    status: readOptionalString(payload.status),
    externalReference: readOptionalString(payload.external_reference),
    payerEmail: readOptionalString(payload.payer_email),
    nextPaymentDate: readOptionalString(payload.next_payment_date),
    amountBrl: normalizeAmount(Number(payload.auto_recurring?.transaction_amount ?? 0)),
    currencyId: readOptionalString(payload.auto_recurring?.currency_id),
    raw: {
      id: payload.id,
      status: payload.status ?? null,
      external_reference: payload.external_reference ?? null,
      payer_email: payload.payer_email ?? null,
      next_payment_date: payload.next_payment_date ?? null,
      auto_recurring: payload.auto_recurring ?? null,
      date_created: payload.date_created ?? null,
      last_modified: payload.last_modified ?? null,
    },
  };
}

export function mapMercadoPagoPreapprovalStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();

  if (normalized === "authorized" || normalized === "active") return "active";
  if (normalized === "paused") return "paused";
  if (normalized === "cancelled" || normalized === "canceled") return "canceled";
  if (normalized === "pending") return "pending";

  return "incomplete";
}

export function isMercadoPagoPreapprovalActive(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();
  return normalized === "authorized" || normalized === "active";
}

function createMercadoPagoSubscriptionError(
  body: MercadoPagoPreapprovalResponse | null,
  httpStatus: number,
  fallbackMessage: string,
) {
  const code = readOptionalString(body?.error);
  const message = readOptionalString(body?.message)
    ?? readOptionalString(body?.error_description)
    ?? readOptionalString(body?.error)
    ?? readMercadoPagoCauseMessage(body?.cause)
    ?? fallbackMessage;

  return new MercadoPagoBillingSubscriptionError(message, {
    code,
    httpStatus,
    body,
  });
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

function normalizeAmount(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

function sanitizeMercadoPagoText(value: string, maxLength: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}
