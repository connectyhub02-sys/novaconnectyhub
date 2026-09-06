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
      method, cache: "no-store", signal: AbortSignal.timeout(25000),
      headers: { access_token: connection.accessToken, "Content-Type": "application/json", "User-Agent": "ConnectyHub/1.0" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new AsaasDirectError(false, false); }
  if (response.ok && [204, 205].includes(response.status)) return {};
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const definitive = [400, 401, 403, 404, 422].includes(response.status);
    throw new AsaasDirectError(definitive, response.status === 400 && method === "POST" && endpoint === "/payments");
  }
  return data;
}

function safePayment(data: Record<string, unknown>): AsaasPaymentResponse {
  const string = (key: string) => typeof data[key] === "string" ? data[key] as string : undefined;
  return { id: string("id"), customer: string("customer"), status: string("status"), externalReference: string("externalReference"), paymentDate: string("paymentDate"), billingType: string("billingType"), value: typeof data.value === "number" ? data.value : undefined, deleted: data.deleted === true };
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
