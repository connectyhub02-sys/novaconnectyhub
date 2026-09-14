import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrganizationSalesCatalogShippingSettings, mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { readFoodOrderSnapshot, type FoodOrderRow } from "./food-order";
import { boundDeliveryCoordinates, deliveryMoneyCents } from "./local-delivery";
import { record } from "./card-input";
import { quoteOrderDelivery } from "./order-shipping";

/** Regional coverage, fees and minimums must still match before a new charge. */
export async function assertFoodOrderDelivery(client: SupabaseClient, organizationId: string, order: { destination_cep?: string | null; destination_address?: string | null; shipping_method?: string | null; shipping_total?: string | number | null; metadata?: unknown }, rows: FoodOrderRow[]) {
  if (!rows.some(row => readFoodOrderSnapshot(row.metadata))) return;
  const ids = [...new Set(rows.map(row => row.catalog_item_id).filter(Boolean))];
  const { data, error } = await client.from("intelligence_memory").select("id, organization_id, title, content, metadata, created_at, updated_at").eq("organization_id", organizationId).eq("memory_type", "sales_catalog_item").in("id", ids);
  if (error) throw new Error("Não foi possível conferir a entrega deste pedido.");
  const catalog = new Map((data ?? []).map(row => [row.id, mapSalesCatalogItem(row)]));
  const entries = rows.map(row => {
    const item = catalog.get(row.catalog_item_id ?? "");
    if (!item) throw new Error("Confira os produtos antes de pagar.");
    return { item, quantity: row.quantity ?? 1 };
  });
  const settings = await getOrganizationSalesCatalogShippingSettings(client, organizationId);
  const metadata = record(order.metadata);
  const result = quoteOrderDelivery({ entries, settings, subtotal: rows.reduce((sum, row) => sum + (deliveryMoneyCents(row.total) ?? 0), 0) / 100,
    cep: order.destination_cep ?? "", address: order.destination_address ?? "", coordinates: boundDeliveryCoordinates(metadata.shipping_quote ?? metadata.initial_shipping, order.destination_address, order.destination_cep) });
  const selected = result.quotes.find(quote => quote.name === order.shipping_method && Math.round(quote.amount * 100) === deliveryMoneyCents(order.shipping_total));
  if (result.physical && !selected) throw new Error(result.error ?? "A entrega ou a taxa mudou. Confira os dados e a entrega antes de pagar.");
}
