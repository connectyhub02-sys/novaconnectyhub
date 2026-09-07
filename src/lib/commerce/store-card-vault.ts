import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  tokenizeAsaasBillingCard,
  type AsaasDirectConnection,
} from "@/lib/sales-catalog/asaas-direct";
import {
  encryptCredentialValue,
  decryptCredentialValue,
} from "@/lib/security/credentials-crypto";
import type {
  CheckoutCard,
  CheckoutCardHolder,
} from "@/lib/sales-catalog/card-input";
import { storeRecurringConsentVersion } from "./store-recurring-policy";
export { storeRecurringConsentVersion } from "./store-recurring-policy";
const fingerprint = (connection: AsaasDirectConnection) =>
  createHash("sha256")
    .update(connection.accessToken ?? "")
    .digest("hex");
export async function saveStoreRecurringCard(
  client: SupabaseClient,
  connection: AsaasDirectConnection,
  input: {
    organizationId: string;
    agreementId: string;
    attemptId: string;
    card: CheckoutCard;
    holder: CheckoutCardHolder;
    remoteIp: string;
  },
) {
  const credential = await tokenizeAsaasBillingCard({
    ...connection,
    card: input.card,
    holder: input.holder,
    remoteIp: input.remoteIp,
  });
  const saved = await client.from("commercial_card_vault").insert({
    organization_id: input.organizationId,
    agreement_id: input.agreementId,
    activation_attempt_id: input.attemptId,
    customer_id: credential.customerId,
    token_encrypted: encryptCredentialValue(credential.token),
    connection_fingerprint: fingerprint(connection),
    consent_version: storeRecurringConsentVersion,
  });
  if (saved.error)
    throw new Error(
      "Não foi possível registrar a autorização. Nenhuma cobrança foi enviada.",
    );
  return credential.customerId;
}
export async function loadStoreRecurringCard(
  client: SupabaseClient,
  connection: AsaasDirectConnection,
  organizationId: string,
  agreementId: string,
) {
  const saved = await client
    .from("commercial_card_vault")
    .select("id,customer_id,token_encrypted,connection_fingerprint")
    .eq("organization_id", organizationId)
    .eq("agreement_id", agreementId)
    .eq("status", "active")
    .maybeSingle();
  if (saved.error) throw new Error("Não foi possível conferir a autorização.");
  if (!saved.data) return null;
  if (saved.data.connection_fingerprint !== fingerprint(connection))
    throw new Error(
      "A conta de recebimento mudou. Uma nova autorização é necessária.",
    );
  return {
    id: saved.data.id as string,
    customerId: saved.data.customer_id as string,
    token: decryptCredentialValue(saved.data.token_encrypted),
  };
}
