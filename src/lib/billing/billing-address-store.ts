import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBillingAddress } from "./billing-address";
import { CheckoutError } from "@/lib/sales-catalog/transparent-checkout";

export async function loadBillingAddress(client: SupabaseClient, organizationId: string) {
  const result = await client.from("organization_billing_addresses").select("address").eq("organization_id", organizationId).maybeSingle();
  if (result.error) throw new CheckoutError("Não foi possível carregar o endereço de faturamento.", 503);
  return result.data ? parseBillingAddress(result.data.address) : null;
}

export async function requireBillingAddress(client: SupabaseClient, organizationId: string) {
  const address = await loadBillingAddress(client, organizationId);
  if (!address) throw new CheckoutError("Salve o endereço de faturamento antes de continuar.", 422);
  return address;
}
