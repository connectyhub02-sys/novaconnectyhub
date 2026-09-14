import type { SupabaseClient } from "@supabase/supabase-js";
import { foodSnapshotsEqual, quoteFoodComposition, type FoodCompositionSnapshot } from "./food-composition";
import { deliveryMoneyCents } from "./local-delivery";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export type FoodOrderRow = { catalog_item_id?: string | null; quantity?: number | null; unit_price?: string | number | null; sale_price?: string | number | null; total?: string | number | null; metadata?: unknown };
export function readFoodOrderSnapshot(metadata: unknown): FoodCompositionSnapshot | null {
  const snapshot = record(record(metadata).food_composition);
  return snapshot.version === 1 && Array.isArray(snapshot.units) && snapshot.units.length === 1 && typeof snapshot.summary === "string"
    ? snapshot as FoodCompositionSnapshot : null;
}
/** Called before a new charge, never when reconciling a previously issued payment. */
export async function assertFoodOrderCurrent(client: SupabaseClient, organizationId: string, rows: FoodOrderRow[], trackInventory = false) {
  const ids = [...new Set(rows.map(row => row.catalog_item_id).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  const { data, error } = await client.from("intelligence_memory").select("id, metadata").eq("organization_id", organizationId).eq("memory_type", "sales_catalog_item").in("id", ids);
  if (error) throw new Error("Não foi possível conferir a disponibilidade da montagem. Tente novamente.");
  const products = new Map((data ?? []).map(row => [row.id, record(row.metadata)]));
  for (const row of rows) {
    const metadata = products.get(row.catalog_item_id ?? "");
    const saved = readFoodOrderSnapshot(row.metadata);
    if (!saved && record(metadata?.food_composition).enabled !== true) continue;
    if (!saved || !metadata || metadata.status && metadata.status !== "active" || record(metadata.food_composition).enabled !== true || row.quantity !== 1) throw new Error("Confira a montagem de cada unidade antes de pagar.");
    const inventory = record(metadata.inventory), needed = rows.filter(other => other.catalog_item_id === row.catalog_item_id).reduce((sum, other) => sum + (other.quantity ?? 1), 0);
    if (inventory.allow_backorder !== true && inventory.allowBackorder !== true && (inventory.status === "out_of_stock" || trackInventory && typeof inventory.quantity === "number" && inventory.quantity < needed)) throw new Error("Este produto ficou indisponível para a quantidade pedida. Confira com a loja.");
    const quote = quoteFoodComposition(metadata.food_composition, saved.units.map(unit => unit.selection), 1)!;
    // Names and instructions are fulfillment facts too. Do not silently change them.
    if (!foodSnapshotsEqual(quote, saved)
      || row.sale_price != null || deliveryMoneyCents(row.unit_price) !== quote.totalCents || deliveryMoneyCents(row.total) !== quote.totalCents) {
      throw new Error("Uma opção da montagem mudou. Confira as escolhas e confirme o novo total antes de pagar.");
    }
  }
}
