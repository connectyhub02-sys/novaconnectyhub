import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBillingAddress } from "./billing-address";
import { CheckoutError } from "@/lib/sales-catalog/transparent-checkout";

export async function loadBillingAddress(client: SupabaseClient, organizationId: string) {
  const result = await client.from("organization_billing_addresses").select("address,address_confirmed").eq("organization_id", organizationId).maybeSingle();
  if (result.error) throw new CheckoutError("Não foi possível carregar o endereço de faturamento.", 503);
  return result.data && result.data.address_confirmed !== false ? parseBillingAddress(result.data.address) : null;
}

export async function loadBillingProfile(client: SupabaseClient, organizationId: string) {
  const result = await client.from("organization_billing_addresses").select("address,contact,address_confirmed,suggestion,updated_at").eq("organization_id", organizationId).maybeSingle();
  if (result.error) throw new CheckoutError("Não foi possível carregar os dados de faturamento.", 503);
  const row = result.data;
  return { address: row && row.address_confirmed !== false ? parseBillingAddress(row.address) : null, contact: row?.contact ?? null, suggestion: row?.suggestion ?? null, updatedAt: row?.updated_at ?? null };
}

export async function requireBillingAddress(client: SupabaseClient, organizationId: string) {
  const address = await loadBillingAddress(client, organizationId);
  if (!address) throw new CheckoutError("Salve o endereço de faturamento antes de continuar.", 422);
  return address;
}
