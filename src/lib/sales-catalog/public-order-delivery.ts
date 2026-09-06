import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrganizationSalesCatalogShippingSettings } from "@/lib/client-os/sales-catalog";
import { hasCheckoutBillingAddress, resolveCheckoutCustomer, type CheckoutCustomerOrder } from "./checkout-customer";
import { chooseOrderDeliveryQuote, quoteOrderDelivery, type OrderShippingEntry } from "./order-shipping";

/** Resolve customer and freight before creating a public order or requesting a payment. */
export async function preparePublicOrderDelivery(input: {
  client: SupabaseClient; organizationId: string; entries: OrderShippingEntry[]; subtotal: number;
  customer: CheckoutCustomerOrder;
  lead: Parameters<typeof resolveCheckoutCustomer>[1];
}) {
  const customer = resolveCheckoutCustomer(input.customer, input.lead);
  const settings = await getOrganizationSalesCatalogShippingSettings(input.client, input.organizationId);
  const result = quoteOrderDelivery({ entries: input.entries, settings, subtotal: input.subtotal, cep: customer.destination_cep ?? "", address: customer.destination_address ?? "" });
  const selected = hasCheckoutBillingAddress(customer) ? chooseOrderDeliveryQuote(result.quotes) : null;
  return {
    customer,
    shippingTotal: selected ? selected.amount.toFixed(2) : result.physical ? null : "0.00",
    shippingMethod: selected?.name ?? null,
    total: (input.subtotal + (selected?.amount ?? 0)).toFixed(2),
    shippingQuote: selected ? { ...selected, cep: customer.destination_cep, source: "public_store", calculated_at: new Date().toISOString() } : null,
  };
}
