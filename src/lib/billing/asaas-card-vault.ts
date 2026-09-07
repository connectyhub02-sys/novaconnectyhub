import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptCredentialValue, decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { AsaasDirectError, tokenizeAsaasBillingCard, type AsaasDirectConnection } from "@/lib/sales-catalog/asaas-direct";
import type { CheckoutCard, CheckoutCardHolder } from "@/lib/sales-catalog/card-input";
import { managedRenewalConsentVersion } from "./managed-renewal-policy";

export async function savePendingAsaasCard(client: SupabaseClient, input: AsaasDirectConnection & {organizationId: string; subscriptionId: string; attemptId: string; card: CheckoutCard; holder: CheckoutCardHolder; remoteIp: string}) {
  try {
    const credential = await tokenizeAsaasBillingCard(input);
    const saved = await client.from("billing_asaas_card_vault").insert({organization_id: input.organizationId, subscription_id: input.subscriptionId, activation_attempt_id: input.attemptId, customer_id: credential.customerId, token_encrypted: encryptCredentialValue(credential.token), consent_version: managedRenewalConsentVersion});
    if (saved.error) throw new Error("Não foi possível registrar a autorização de renovação.");
    return credential.customerId;
  } catch (error) {
    // Tokenization cannot debit a card. A charge requires a durably saved authorization.
    throw new AsaasDirectError(true, false, error instanceof AsaasDirectError ? error.diagnostic : undefined);
  }
}

export async function loadActiveAsaasCard(client: SupabaseClient, organizationId: string, subscriptionId: string) {
  const {data,error} = await client.from("billing_asaas_card_vault").select("id,customer_id,token_encrypted").eq("organization_id",organizationId).eq("subscription_id",subscriptionId).eq("status","active").maybeSingle();
  if(error) throw new Error("Não foi possível conferir a autorização de renovação.");
  return data ? {id:data.id as string,customerId:data.customer_id as string,token:decryptCredentialValue(data.token_encrypted)} : null;
}
