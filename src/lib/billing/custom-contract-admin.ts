import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getContractAccess } from "./contract-access";

export async function loadCustomContractAccount(client: SupabaseClient, organizationId: string) {
  const access = await getContractAccess(organizationId, client);
  const result = access.subscription_id
    ? await client.from("organization_subscriptions").select("id,status,current_period_start,current_period_end,included_credits_granted,metadata").eq("id", access.subscription_id).single()
    : { data: null, error: null };
  if (result.error) throw new Error("Não foi possível conferir a assinatura vinculada.");
  const subscription = result.data;
  const terms = subscription?.metadata?.commercial_terms;
  const activations = await client.from("custom_contract_activations").select("contract_id").eq("organization_id", access.billing_organization_id);
  if (activations.error) throw new Error("Não foi possível conferir as ativações.");
  return {
    organizationId: access.billing_organization_id,
    subscriptionId: subscription?.id ?? null,
    allowed: access.allowed,
    reason: access.reason,
    activeContractId: terms?.custom_contract_id ?? null,
    activeVersion: terms?.custom_contract_version ?? null,
    periodEnd: subscription?.current_period_end ?? null,
    grantedCredits: Number(subscription?.included_credits_granted ?? 0),
    activatedIds: (activations.data ?? []).map(row => row.contract_id as string),
  };
}
export type CustomContractAccount = Awaited<ReturnType<typeof loadCustomContractAccount>>;
