import "server-only";
import type { AsaasMode, AsaasPaymentResponse } from "./asaas";
import type { CheckoutCard, CheckoutCardHolder } from "./card-input";

export type AsaasDirectConnection = { accessToken: string; mode?: AsaasMode | null };
export class AsaasDirectError extends Error {
  constructor(public readonly definitive: boolean, public readonly declined: boolean) {
    super(declined ? "O cartão não foi autorizado. Confira os dados ou use outra forma de pagamento." : definitive ? "Não foi possível preparar o pagamento. Tente novamente mais tarde." : "Estamos verificando o resultado do pagamento. Não repita a cobrança agora.");
  }
}

/** Never return or log a gateway body containing card details, tokens or customer data. */
async function request(connection: AsaasDirectConnection, endpoint: string, method = "GET", body?: unknown): Promise<Record<string, unknown>> {
  const base = connection.mode === "sandbox" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
  let response: Response;
  try {
    response = await fetch(`${base}${endpoint}`, {
      method, cache: "no-store", signal: AbortSignal.timeout(method === "POST" ? 65000 : 25000),
      headers: { access_token: connection.accessToken, "Content-Type": "application/json", "User-Agent": "ConnectyHub/1.0" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new AsaasDirectError(false, false); }
  if (response.ok && [204, 205].includes(response.status)) return {};
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const definitive = [400, 401, 403, 404, 422].includes(response.status);
    throw new AsaasDirectError(definitive, response.status === 400 && method === "POST" && ["/payments", "/subscriptions"].includes(endpoint));
  }
  return data;
}

function safePayment(data: Record<string, unknown>): AsaasPaymentResponse {
  const string = (key: string) => typeof data[key] === "string" ? data[key] as string : undefined;
  return { id: string("id"), customer: string("customer"), status: string("status"), externalReference: string("externalReference"), paymentDate: string("paymentDate"), billingType: string("billingType"), value: typeof data.value === "number" ? data.value : undefined, deleted: data.deleted === true };
}

export type AsaasNativeSubscription = { id: string; value: number; externalReference: string; nextDueDate: string; status: string; deleted: boolean };
function safeSubscription(data: Record<string, unknown>): AsaasNativeSubscription {
  return { id: String(data.id ?? ""), value: Number(data.value), externalReference: String(data.externalReference ?? ""), nextDueDate: String(data.nextDueDate ?? ""), status: String(data.status ?? ""), deleted: data.deleted === true };
}

export async function createAsaasNativeSubscription(input: AsaasDirectConnection & { card: CheckoutCard; holder: CheckoutCardHolder; amount: number; externalReference: string; remoteIp: string; nextDueDate: string }) {
  let customer: Record<string, unknown>;
  try {
    const matches = await request(input, `/customers?cpfCnpj=${encodeURIComponent(input.holder.cpfCnpj)}&limit=1`);
    customer = Array.isArray(matches.data) && matches.data[0]?.id ? matches.data[0] : await request(input, "/customers", "POST", { ...input.holder, notificationDisabled: true });
  } catch { throw new AsaasDirectError(true, false); }
  if (!customer.id) throw new AsaasDirectError(true, false);
  const subscription = safeSubscription(await request(input, "/subscriptions", "POST", {
    customer: customer.id, billingType: "CREDIT_CARD", value: input.amount, cycle: "MONTHLY", nextDueDate: input.nextDueDate,
    description: "Plano ConnectyHub", externalReference: input.externalReference, creditCard: input.card, creditCardHolderInfo: input.holder, remoteIp: input.remoteIp,
  }));
  if (!subscription.id || subscription.externalReference !== input.externalReference || Math.round(subscription.value * 100) !== Math.round(input.amount * 100)) throw new AsaasDirectError(false, false);
  return subscription;
}

export async function findAsaasNativeSubscription(connection: AsaasDirectConnection, reference: string) {
  const list = await request(connection, `/subscriptions?externalReference=${encodeURIComponent(reference)}&includeDeleted=true&limit=100`);
  const rows = Array.isArray(list.data) ? list.data.map(safeSubscription).filter(row => row.externalReference === reference) : [];
  if (list.hasMore || rows.length > 1) throw new AsaasDirectError(false, false);
  return rows[0] ?? null;
}

export async function cancelAsaasNativeSubscription(connection: AsaasDirectConnection, id: string, expectedReference: string) {
  const current = safeSubscription(await request(connection, `/subscriptions/${encodeURIComponent(id)}`));
  if (current.externalReference !== expectedReference) throw new AsaasDirectError(false, false);
  if (!current.deleted) await request(connection, `/subscriptions/${encodeURIComponent(id)}`, "DELETE");
}

export async function getAsaasNativePayment(connection: AsaasDirectConnection, id: string) {
  return safePayment(await request(connection, `/payments/${encodeURIComponent(id)}`));
}

export async function findAsaasBillingPix(connection: AsaasDirectConnection, reference: string, amount: number) {
  const list = await request(connection, `/payments?externalReference=${encodeURIComponent(reference)}&limit=100`);
  const rows = Array.isArray(list.data) ? list.data.map(safePayment).filter(payment => payment.externalReference === reference && payment.billingType === "PIX" && !payment.deleted) : [];
  if (list.hasMore || rows.length > 1 || rows.some(payment => Math.round(Number(payment.value) * 100) !== Math.round(amount * 100))) throw new AsaasDirectError(false, false);
  return rows[0] ?? null;
}

/** Called only after a webhook signature and a fresh provider read have been verified. */
export function applyAsaasPaymentEvent(payment: AsaasPaymentResponse, event: unknown): AsaasPaymentResponse {
  if (["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH", "REFUNDED"].includes(payment.status ?? "") || payment.deleted) return payment;
  if (event === "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED") return { ...payment, status: "CREDIT_CARD_CAPTURE_REFUSED" };
  if (event === "PAYMENT_REPROVED_BY_RISK_ANALYSIS") return { ...payment, status: "REPROVED_BY_RISK_ANALYSIS" };
  return payment;
}

export async function createAsaasDirectCardPayment(input: AsaasDirectConnection & {
  card: CheckoutCard; holder: CheckoutCardHolder; amount: number; installments: number; externalReference: string; remoteIp: string;
}) {
  let customer: Record<string, unknown>;
  try {
    const matches = await request(input, `/customers?cpfCnpj=${encodeURIComponent(input.holder.cpfCnpj)}&limit=1`);
    customer = Array.isArray(matches.data) && matches.data[0]?.id ? matches.data[0] : await request(input, "/customers", "POST", { ...input.holder, notificationDisabled: true });
  } catch {
    // Customer lookup/creation cannot charge a card. A retry starts by looking it up again.
    throw new AsaasDirectError(true, false);
  }
  if (typeof customer.id !== "string") throw new AsaasDirectError(true, false);
  // Processing occurs exactly once, after the durable application attempt has been claimed.
  const payment = await request(input, "/payments", "POST", {
    customer: customer.id, billingType: "CREDIT_CARD", dueDate: new Date().toISOString().slice(0, 10),
    ...(input.installments > 1 ? { installmentCount: input.installments, totalValue: input.amount } : { value: input.amount }),
    description: "Pedido ConnectyHub", externalReference: input.externalReference,
    creditCard: input.card, creditCardHolderInfo: input.holder, remoteIp: input.remoteIp,
  });
  if (!payment.id) throw new AsaasDirectError(false, false);
  const safe = safePayment(payment);
  const expectedInstallment = input.amount / input.installments;
  if (safe.externalReference !== input.externalReference || safe.billingType !== "CREDIT_CARD" || typeof safe.value !== "number" || Math.abs(safe.value - expectedInstallment) > 0.011) throw new AsaasDirectError(false, false);
  return safe;
}

export async function findAsaasDirectPayment(connection: AsaasDirectConnection, reference: string, expected?: { amount: number; installments: number }) {
  const result = await request(connection, `/payments?externalReference=${encodeURIComponent(reference)}&limit=100`);
  const values = Array.isArray(result.data) ? result.data.map(safePayment) : [];
  if (expected && values.length) {
    const valid = result.hasMore !== true && values.length === expected.installments
      && new Set(values.map(item => item.id)).size === values.length
      && values.every(item => item.id && item.externalReference === reference && item.billingType === "CREDIT_CARD" && typeof item.value === "number" && item.value > 0)
      && values.reduce((sum, item) => sum + Math.round((item.value ?? 0) * 100), 0) === Math.round(expected.amount * 100);
    if (!valid) throw new AsaasDirectError(false, false);
    if (values.every(item => ["CONFIRMED", "RECEIVED"].includes(item.status ?? ""))) return { ...values[0], status: "CONFIRMED" };
    if (values.every(item => item.status === "REFUNDED")) return { ...values[0], status: "REFUNDED" };
    if (values.some(item => ["REFUNDED", "CONFIRMED", "RECEIVED"].includes(item.status ?? ""))) return { ...values[0], status: "PARTIALLY_SETTLED" };
  }
  const approved = values.find(item => ["CONFIRMED", "RECEIVED"].includes(item.status ?? ""));
  if (approved) return approved;
  if (values.some(item => item.status === "REFUNDED") && !values.every(item => item.status === "REFUNDED")) {
    return { ...values[0], status: "PARTIALLY_REFUNDED" };
  }
  return values[0] ?? null;
}

export async function retireAsaasPayment(connection: AsaasDirectConnection, paymentId: string, hosted: boolean) {
  if (hosted) { await request(connection, `/checkouts/${encodeURIComponent(paymentId)}/cancel`, "POST"); return; }
  const payment = safePayment(await request(connection, `/payments/${encodeURIComponent(paymentId)}`));
  if (payment.deleted || ["DELETED", "CANCELED", "CANCELLED"].includes(payment.status ?? "")) return;
  if (!["PENDING", "OVERDUE"].includes(payment.status ?? "")) throw new AsaasDirectError(false, false);
  await request(connection, `/payments/${encodeURIComponent(paymentId)}`, "DELETE");
}
