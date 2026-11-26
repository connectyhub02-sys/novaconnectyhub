import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MetaMessageBillingError, metaMessageBillingCode, type MetaMessageCategory } from "./message-billing-policy";

type ReserveInput = { organizationId: string; phoneNumberId: string; requestKey: string; phone: string; category: MetaMessageCategory; campaignId?: string | null };

/** Reserves the customer price before the Meta call. No-op for senders billed by the customer at Meta. */
export async function reserveOfficialMessageCharge(client: SupabaseClient, input: ReserveInput) {
  const result = await client.rpc("reserve_meta_message_charge", {
    p_org: input.organizationId,
    p_phone_number_id: input.phoneNumberId,
    p_request_key: input.requestKey,
    p_phone: input.phone,
    p_category: input.category,
    p_campaign: input.campaignId ?? null,
  });
  if (result.error) throw new MetaMessageBillingError(metaMessageBillingCode(result.error.message));
  return result.data as { billing: "customer_meta" | "connectyhub"; charge_id?: string; reserved_brl?: number };
}

export async function linkOfficialMessageCharge(client: SupabaseClient, organizationId: string, requestKey: string, messageId: string) {
  const result = await client.rpc("link_meta_message_charge", { p_org: organizationId, p_request_key: requestKey, p_message: messageId });
  if (result.error) throw new Error("Envio registrado, mas a reserva do saldo não foi vinculada. Não reenvie.");
}

/** Returns the reservation of a message Meta never accepted. Settled charges are untouched. */
export async function releaseOfficialMessageCharge(client: SupabaseClient, organizationId: string, requestKey: string, detail: string) {
  await client.rpc("release_meta_message_charge", { p_org: organizationId, p_request_key: requestKey, p_detail: detail.slice(0, 300) });
}

/** Reconciles a message charge from its stored receipts (pricing, delivery, failure). */
export async function recordOfficialMessagePricing(client: SupabaseClient, phoneNumberId: string, providerMessageId: string) {
  const result = await client.rpc("record_meta_message_pricing", { p_phone_number_id: phoneNumberId, p_provider_message_id: providerMessageId });
  if (result.error) throw new Error("Falha ao registrar a cobrança da mensagem WhatsApp.");
  return String(result.data);
}

export async function expireOfficialMessageCharges(client: SupabaseClient) {
  const result = await client.rpc("expire_meta_message_charges");
  if (result.error) throw new Error("Falha ao conferir reservas do saldo WhatsApp.");
  return result.data as { released: number; settled: number };
}

export type MetaMessageWalletSummary = {
  wallet: { balance_brl: number; reserved_brl: number; debt_brl: number; lifetime_topup_brl: number; lifetime_charged_brl: number } | null;
  shared_wallet: boolean;
  senders: Array<{ phone_number_id: string; display_phone: string; verified_name: string | null; billing_mode: string; status: string }>;
  rates: Array<{ market: string; category: string; customer_price_brl: number; effective_from: string }>;
  month: Array<{ category: string; status: string; messages: number; charged_brl: number }>;
  ledger: Array<{ id: string; entry_type: string; amount_brl: number; balance_after_brl: number; debt_after_brl: number; description: string; created_at: string; category: string | null }>;
  packages: Array<{ id: string; name: string; amount_brl: number }>;
};

export async function loadMetaMessageWalletSummary(client: SupabaseClient, organizationId: string) {
  const result = await client.rpc("meta_message_wallet_summary", { p_org: organizationId });
  if (result.error || !result.data) throw new Error("Não foi possível consultar o saldo do WhatsApp oficial.");
  return result.data as MetaMessageWalletSummary;
}

export function walletAvailable(summary: MetaMessageWalletSummary) {
  const wallet = summary.wallet;
  return wallet ? Math.max(0, Number(wallet.balance_brl) - Number(wallet.reserved_brl)) : 0;
}

export function currentRate(summary: MetaMessageWalletSummary, category: string, market = "BR") {
  const rate = summary.rates.find((item) => item.market === market && item.category === category);
  return rate ? Number(rate.customer_price_brl) : null;
}
