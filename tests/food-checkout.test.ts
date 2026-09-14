import { describe, expect, it, vi } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { quoteFoodComposition, foodSnapshotForUnit } from "@/lib/sales-catalog/food-composition";
import { assertFoodOrderCurrent } from "@/lib/sales-catalog/food-order";
import * as input from "@/lib/sales-catalog/card-input";
import * as shipping from "@/lib/sales-catalog/shipping-calculator";
import type * as Checkout from "@/lib/sales-catalog/food-checkout";
import type * as Shipping from "@/lib/sales-catalog/order-shipping";
const policy = { enabled: true, pricing: "fixed", localOnly: true, sizes: [{ id: "regular", name: "Normal", active: true, price: "30", portions: 1, maxFlavors: 1 }], flavors: [],
  groups: [{ id: "extra", name: "Adicional", min: 0, max: 1, scope: "unit", options: [{ id: "bacon", name: "Bacon", active: true, price: "5", maxQuantity: 1 }] }] };
const unit = () => ({ sizeId: "regular", flavors: [], options: [] as Array<{ groupId: string; optionId: string; quantity: number }>, note: "Sem cebola" });
const money = serverModuleHarness<Record<string, unknown>>("src/lib/sales-catalog/mercado-pago.ts");
const delivery = serverModuleHarness<typeof Shipping>("src/lib/sales-catalog/order-shipping.ts", { "./shipping-calculator": shipping, "./mercado-pago": money });
function fixture() {
  const food = quoteFoodComposition(policy, [unit(), { ...unit(), note: "Sem queijo" }], 2)!;
  const items = food.units.map((_unit, index) => ({ id: `unit-${index}`, catalog_item_id: "burger", quantity: 1, unit_price: "30", sale_price: null, total: "30", title: "Hambúrguer", fulfillment: { mode: "physical" }, metadata: { food_composition: foodSnapshotForUnit(food, index) } }));
  const product = { id: "burger", title: "Hambúrguer", status: "active", price: "1", foodComposition: policy, offer: { salePrice: null }, fulfillment: { mode: "physical" }, shipping: { profile: "default", weightGrams: 100 } };
  const metadata = { status: "active", food_composition: policy, inventory: { status: "in_stock", quantity: 1 } };
  const db = commerceDatabase({ intelligence_memory: [{ id: "burger", organization_id: "org", memory_type: "sales_catalog_item", metadata }] });
  const revise = vi.fn(async () => ({}));
  const api = serverModuleHarness<typeof Checkout>("src/lib/sales-catalog/food-checkout.ts", {
    "@/lib/client-os/sales-catalog": { mapSalesCatalogItem: () => product, getOrganizationSalesCatalogShippingSettings: async () => ({ localPickup: true, localDeliveryEnabled: false, shippingEnabled: false, rules: [], localDeliveryZones: [] }) },
    "./card-input": input, "./order-shipping": delivery, "./order-revision": { applySalesCatalogOrderRevision: revise },
  });
  const snapshot = { order: { id: "order", lead_id: "lead", conversation_id: null, checkout_revision: 2, shipping_method: "Retirada na loja", shipping_total: "0", discount_total: "0", metadata: {} }, session: { id: "session", organization_id: "org" }, items, settings: null } as unknown as Parameters<typeof api.prepareFoodCheckoutRevision>[1];
  const changes = items.map(row => ({ id: row.id, selection: row.metadata.food_composition.units[0].selection }));
  changes[1] = { ...changes[1], selection: { ...changes[1].selection, options: [{ groupId: "extra", optionId: "bacon", quantity: 1 }] } };
  return { db, api, snapshot, changes, revise, items, metadata, product };
}
describe("food checkout revisions and payment validation", () => {
  it("reprices only the chosen unit and preserves both notes before saving", async () => {
    const f = fixture(), quote = await f.api.prepareFoodCheckoutRevision(f.db.client as never, f.snapshot, f.changes);
    expect(quote.total).toBe(65); expect(quote.rows.map(row => row.total)).toEqual(["30", "35"]);
    expect(quote.rows.map(row => row.metadata.food_composition.units[0].note)).toEqual(["Sem cebola", "Sem queijo"]);
    expect(f.revise).not.toHaveBeenCalled();
    await f.api.saveFoodCheckoutRevision(f.db.client as never, f.snapshot, { units: f.changes, revision: 2, total: 65, requestId: "fixture" });
    expect(f.revise).toHaveBeenCalledWith(expect.objectContaining({ checkoutSessionId: "session", conversationId: null, expectedRevision: 2, expectedTotal: 65, requestId: "food:fixture" }));
  });
  it("rejects omitted, duplicate or foreign units and a stale displayed total before retirement", async () => {
    const f = fixture();
    for (const units of [f.changes.slice(0, 1), [f.changes[0], f.changes[0]], [f.changes[0], { ...f.changes[1], id: "foreign" }]]) {
      await expect(f.api.prepareFoodCheckoutRevision(f.db.client as never, f.snapshot, units)).rejects.toThrow("todas as unidades");
    }
    await expect(f.api.saveFoodCheckoutRevision(f.db.client as never, f.snapshot, { units: f.changes, revision: 2, total: 1, requestId: "fixture" })).rejects.toThrow("pedido mudou");
    expect(f.revise).not.toHaveBeenCalled();
  });
  it("compares JSONB snapshots independently of object key order", async () => {
    const f = fixture();
    const reverse = (value: unknown): unknown => Array.isArray(value) ? value.map(reverse) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, v]) => [key, reverse(v)])) : value;
    const rows = reverse(f.items) as typeof f.items;
    await expect(assertFoodOrderCurrent(f.db.client as never, "org", rows)).resolves.toBeUndefined();
    rows[0].total = "1";
    await expect(assertFoodOrderCurrent(f.db.client as never, "org", rows)).rejects.toThrow("mudou");
  });
  it("sums repeated product units when stock tracking is enabled", async () => {
    const f = fixture();
    await expect(assertFoodOrderCurrent(f.db.client as never, "org", f.items, true)).rejects.toThrow("quantidade pedida");
    await expect(assertFoodOrderCurrent(f.db.client as never, "org", f.items, false)).resolves.toBeUndefined();
  });
  it("revalidates regional-only delivery and enabled pickup before payment", async () => {
    const f = fixture();
    const settings = { localPickup: false, localDeliveryEnabled: false, shippingEnabled: true, localDeliveryZones: [], rules: [{ uf: "SC", state: "Santa Catarina", active: true, price: "10", services: [] }] };
    const guard = serverModuleHarness<typeof import("@/lib/sales-catalog/food-payment-guard")>("src/lib/sales-catalog/food-payment-guard.ts", {
      "@/lib/client-os/sales-catalog": { mapSalesCatalogItem: () => f.product, getOrganizationSalesCatalogShippingSettings: async () => settings },
      "./card-input": input, "./order-shipping": delivery,
    });
    await expect(guard.assertFoodOrderDelivery(f.db.client as never,"org",{destination_cep:"88010000",shipping_method:"Frete",shipping_total:"10"},f.items)).rejects.toThrow();
    await expect(guard.assertFoodOrderDelivery(f.db.client as never,"org",{shipping_method:"Retirada na loja",shipping_total:"0"},f.items)).rejects.toThrow();
    settings.localPickup=true;
    await expect(guard.assertFoodOrderDelivery(f.db.client as never,"org",{shipping_method:"Retirada na loja",shipping_total:"0"},f.items)).resolves.toBeUndefined();
  });
  it("refuses disabled choices and cross-store catalog data before a new payment", async () => {
    const f = fixture();
    await expect(assertFoodOrderCurrent(f.db.client as never, "other-store", f.items)).rejects.toThrow("montagem");
    (f.db.tables.intelligence_memory[0].metadata as typeof f.metadata).food_composition = { ...policy, enabled: false };
    await expect(assertFoodOrderCurrent(f.db.client as never, "org", f.items)).rejects.toThrow("montagem");
  });
});
