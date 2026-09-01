import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptCredentialValue,
  encryptCredentialValue,
} from "@/lib/security/credentials-crypto";

type JsonRecord = Record<string, unknown>;

type BillingPaymentMethodRow = {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  provider: string;
  method_type: string;
  status: string;
  provider_token_encrypted: string;
  provider_card_id: string | null;
  brand: string | null;
  first_digits: string | null;
  last_digits: string | null;
  exp_month: string | null;
  exp_year: string | null;
  holder_name: string | null;
  holder_tax_id: string | null;
  recurring_reference_id: string | null;
  metadata: JsonRecord | null;
};

export type BillingCardPaymentMethod = {
  id: string;
  organizationId: string;
  subscriptionId: string | null;
  provider: "pagbank";
  token: string;
  providerCardId: string | null;
  brand: string | null;
  firstDigits: string | null;
  lastDigits: string | null;
  expMonth: string | null;
  expYear: string | null;
  holderName: string | null;
  holderTaxId: string | null;
  recurringReferenceId: string | null;
  metadata: JsonRecord;
};

export async function saveDefaultPagBankBillingCardMethod(
  client: SupabaseClient,
  input: {
    organizationId: string;
    subscriptionId: string;
    token: string;
    providerCardId?: string | null;
    brand?: string | null;
    firstDigits?: string | null;
    lastDigits?: string | null;
    expMonth?: string | null;
    expYear?: string | null;
    holderName?: string | null;
    holderTaxId?: string | null;
    recurringReferenceId?: string | null;
    metadata?: JsonRecord;
  },
) {
  const token = input.token.trim();

  if (!token) {
    return null;
  }

  const deactivate = await client
    .from("billing_payment_methods")
    .update({
      is_default: false,
      status: "inactive",
      metadata: {
        replacement_source: "pagbank_card_checkout",
        replaced_at: new Date().toISOString(),
      },
    })
    .eq("organization_id", input.organizationId)
    .eq("subscription_id", input.subscriptionId)
    .eq("provider", "pagbank")
    .eq("method_type", "card")
    .eq("status", "active");

  if (deactivate.error) {
    throw new Error(`Nao foi possivel substituir cartao salvo: ${deactivate.error.message}`);
  }

  const insert = await client
    .from("billing_payment_methods")
    .insert({
      organization_id: input.organizationId,
      subscription_id: input.subscriptionId,
      provider: "pagbank",
      method_type: "card",
      status: "active",
      is_default: true,
      provider_token_encrypted: encryptCredentialValue(token),
      provider_card_id: input.providerCardId ?? null,
      brand: normalizeCardText(input.brand),
      first_digits: normalizeDigits(input.firstDigits, 8),
      last_digits: normalizeDigits(input.lastDigits, 8),
      exp_month: normalizeDigits(input.expMonth, 2),
      exp_year: normalizeDigits(input.expYear, 4),
      holder_name: normalizeCardText(input.holderName),
      holder_tax_id: normalizeDigits(input.holderTaxId, 14),
      recurring_reference_id: normalizeCardText(input.recurringReferenceId),
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single<{ id: string }>();

  if (insert.error) {
    throw new Error(`Nao foi possivel salvar cartao recorrente PagBank: ${insert.error.message}`);
  }

  return insert.data?.id ?? null;
}

export async function loadDefaultPagBankBillingCardMethod(
  client: SupabaseClient,
  input: {
    organizationId: string;
    subscriptionId: string;
  },
): Promise<BillingCardPaymentMethod | null> {
  const { data, error } = await client
    .from("billing_payment_methods")
    .select("id, organization_id, subscription_id, provider, method_type, status, provider_token_encrypted, provider_card_id, brand, first_digits, last_digits, exp_month, exp_year, holder_name, holder_tax_id, recurring_reference_id, metadata")
    .eq("organization_id", input.organizationId)
    .eq("provider", "pagbank")
    .eq("method_type", "card")
    .eq("status", "active")
    .eq("is_default", true)
    .limit(10)
    .returns<BillingPaymentMethodRow[]>();

  if (error) {
    throw new Error(`Nao foi possivel carregar cartao recorrente PagBank: ${error.message}`);
  }

  const rows = data ?? [];
  const row = rows.find((item) => item.subscription_id === input.subscriptionId)
    ?? rows.find((item) => item.subscription_id === null)
    ?? null;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    subscriptionId: row.subscription_id,
    provider: "pagbank",
    token: decryptCredentialValue(row.provider_token_encrypted),
    providerCardId: row.provider_card_id,
    brand: row.brand,
    firstDigits: row.first_digits,
    lastDigits: row.last_digits,
    expMonth: row.exp_month,
    expYear: row.exp_year,
    holderName: row.holder_name,
    holderTaxId: row.holder_tax_id,
    recurringReferenceId: row.recurring_reference_id,
    metadata: row.metadata ?? {},
  };
}

export async function markBillingPaymentMethodFailed(
  client: SupabaseClient,
  input: {
    id: string;
    organizationId: string;
    reason: string;
    metadata?: JsonRecord;
  },
) {
  const { error } = await client
    .from("billing_payment_methods")
    .update({
      status: "failed",
      is_default: false,
      metadata: {
        ...(input.metadata ?? {}),
        failed_at: new Date().toISOString(),
        failure_reason: input.reason,
      },
    })
    .eq("id", input.id)
    .eq("organization_id", input.organizationId);

  if (error) {
    throw new Error(`Nao foi possivel marcar cartao como falho: ${error.message}`);
  }
}

function normalizeCardText(value: string | null | undefined) {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  return text ? text.slice(0, 160) : null;
}

function normalizeDigits(value: string | null | undefined, maxLength: number) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits ? digits.slice(0, maxLength) : null;
}
