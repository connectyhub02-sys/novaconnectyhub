import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getContractAccess } from "./contract-access";
export type CustomContract = { id: string; organization_id: string; version: number; name: string; base_plan_code: string; monthly_price_brl: number; included_credits: number; effective_at: string; first_period_end: string; resource_limits: Record<string, number>; features: Record<string, boolean> };
export async function loadCustomContract(client: SupabaseClient, organizationId: string, when = new Date()) {
  const access = await getContractAccess(organizationId, client);
  const { data, error } = await client.from("organization_custom_contracts").select("*").eq("organization_id", access.billing_organization_id).lte("effective_at", when.toISOString()).order("effective_at", { ascending: false }).order("version", { ascending: false }).limit(1).maybeSingle<CustomContract>();
  if (error) throw new Error("Não foi possível conferir o contrato personalizado.");
  return data;
}
export async function loadAcceptedCustomTerms(client: SupabaseClient, organizationId: string) {
  const access = await getContractAccess(organizationId, client);
  if (!access.allowed || !access.subscription_id) return null;
  const { data, error } = await client.from("organization_subscriptions").select("metadata").eq("id", access.subscription_id).single();
  if (error) throw new Error("Não foi possível conferir os recursos do contrato.");
  const terms = data?.metadata?.commercial_terms;
  return terms?.custom_contract_id ? terms as { custom_contract_id: string; included_credits: number; name: string; features: Record<string, boolean>; resource_limits: Record<string, number> } : null;
}
