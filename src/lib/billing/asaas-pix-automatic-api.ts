import "server-only";
import { record, text } from "@/lib/sales-catalog/card-input";
import type { AsaasDirectConnection } from "@/lib/sales-catalog/asaas-direct";
import type { AsaasPaymentResponse } from "@/lib/sales-catalog/asaas";

export class PixAutomaticError extends Error {
  constructor(readonly code: string, readonly status = 409, readonly definitive = false) {
    super(({ unavailable: "Pix Automático indisponível neste ambiente. Use cartão ou Pix comum.", invalid_input: "Confira os dados e aceite a autorização recorrente.", busy: "Há uma operação em conferência. Aguarde antes de tentar novamente.", provider_rejected: "O Asaas não permitiu esta autorização. Seu plano não foi alterado.", unknown: "Estamos conferindo a autorização. Não gere outro QR Code agora.", mismatch: "Os dados do pagamento precisam de conferência.", forbidden: "Somente titular ou administrador pode gerenciar pagamentos.", not_found: "Assinatura não encontrada.", replacement_requires_payment: "O Asaas exige um primeiro pagamento para autorizar Pix Automático. A troca sem cobrança agora não está disponível; mantenha o cartão até existir uma jornada compatível." } as Record<string, string>)[code] ?? "Não foi possível conferir o Pix Automático.");
  }
}
export type PixAuthorization = {
  id: string; status: string; contractId: string; customerId: string; subscriptionId: string;
  value: number; frequency: string; startDate: string; paymentCreationMode: string;
  payload: string; encodedImage: string; conciliationIdentifier: string; expirationDate: string;
};
export type PixPayment = AsaasPaymentResponse & { conciliationIdentifier?: string; pixAutomaticAuthorizationId?: string };
export async function pixRequest(connection: AsaasDirectConnection, path: string, method = "GET", body?: unknown): Promise<Record<string, unknown>> {
  const base = connection.mode === "sandbox" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
  let response: Response;
  try { response = await fetch(base + path, { method, cache: "no-store", headers: { access_token: connection.accessToken, "Content-Type": "application/json", "User-Agent": "ConnectyHub/1.0" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000) }); }
  catch { throw new PixAutomaticError("unknown", 503); }
  if (!response.ok) throw new PixAutomaticError(response.status >= 400 && response.status < 500 && ![408, 409, 429].includes(response.status) ? "provider_rejected" : "unknown", 503, response.status >= 400 && response.status < 500 && ![408, 409, 429].includes(response.status));
  try { return record(await response.json()); } catch { throw new PixAutomaticError("unknown", 503); }
}
function authorization(value: unknown): PixAuthorization {
  const row = record(value), qr = record(row.immediateQrCode);
  return { id: text(row.id), status: text(row.status), contractId: text(row.contractId), customerId: text(row.customerId), subscriptionId: text(row.subscriptionId), value: Number(row.value), frequency: text(row.frequency), startDate: text(row.startDate), paymentCreationMode: text(row.paymentCreationMode), payload: text(row.payload), encodedImage: text(row.encodedImage), conciliationIdentifier: text(qr.conciliationIdentifier), expirationDate: text(qr.expirationDate) };
}
export async function getPixAuthorization(config: AsaasDirectConnection, id: string) { return authorization(await pixRequest(config, `/pix/automatic/authorizations/${encodeURIComponent(id)}`)); }
export async function cancelPixAuthorization(config: AsaasDirectConnection, id: string) { return authorization(await pixRequest(config, `/pix/automatic/authorizations/${encodeURIComponent(id)}`, "DELETE")); }
export async function createPixAuthorization(config: AsaasDirectConnection, input: { customerId: string; contractId: string; frequency: string; startDate: string; amount: number; recurringAmount: number }) {
  return authorization(await pixRequest(config, "/pix/automatic/authorizations", "POST", { customerId: input.customerId, contractId: input.contractId, frequency: input.frequency, startDate: input.startDate, value: input.recurringAmount, description: "Plano ConnectyHub", paymentCreationMode: "SUBSCRIPTION", retryPolicy: "NOT_ALLOWED", immediateQrCode: { originalValue: input.amount, expirationSeconds: 3600, description: "Primeiro pagamento ConnectyHub" } }));
}
export async function findPixAuthorization(config: AsaasDirectConnection, customerId: string, contractId: string) {
  let found: PixAuthorization | null = null;
  for (let offset = 0; offset < 10000; offset += 100) {
    const page = await pixRequest(config, `/pix/automatic/authorizations?customerId=${encodeURIComponent(customerId)}&limit=100&offset=${offset}`);
    for (const row of Array.isArray(page.data) ? page.data : []) {
      const item = authorization(row);
      if (item.contractId !== contractId) continue;
      if (found && found.id !== item.id) throw new PixAutomaticError("mismatch");
      found = item;
    }
    if (!page.hasMore) return found;
  }
  throw new PixAutomaticError("unknown", 503);
}
export async function pixCustomer(config: AsaasDirectConnection, holder: { name: string; email: string; cpfCnpj: string; phone: string }) {
  const list = await pixRequest(config, `/customers?cpfCnpj=${encodeURIComponent(holder.cpfCnpj)}&limit=1`);
  const existing = record(Array.isArray(list.data) ? list.data[0] : null);
  if (text(existing.id) && existing.deleted !== true) return text(existing.id);
  const created = await pixRequest(config, "/customers", "POST", { ...holder, notificationDisabled: true });
  if (!text(created.id)) throw new PixAutomaticError("unknown", 503);
  return text(created.id);
}
export async function getPixPayment(config: AsaasDirectConnection, id: string): Promise<PixPayment> { return await pixRequest(config, `/payments/${encodeURIComponent(id)}`) as PixPayment; }
export async function listPixPayments(config: AsaasDirectConnection, customerId: string, subscriptionId?: string) {
  const payments: PixPayment[] = [];
  for (let offset = 0; offset < 10000; offset += 100) {
    const page = await pixRequest(config, `/payments?customer=${encodeURIComponent(customerId)}${subscriptionId ? `&subscription=${encodeURIComponent(subscriptionId)}` : ""}&limit=100&offset=${offset}`);
    payments.push(...(Array.isArray(page.data) ? page.data as PixPayment[] : []));
    if (!page.hasMore) return payments;
  }
  throw new PixAutomaticError("unknown", 503);
}
