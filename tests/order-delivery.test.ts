import { describe, expect, it, vi } from "vitest";
import * as calculator from "@/lib/sales-catalog/shipping-calculator";
import * as customers from "@/lib/sales-catalog/checkout-customer";
import { serverModuleHarness } from "./helpers/server-module-harness";
import type { ClientSalesCatalogItem, ClientSalesCatalogShippingSettings } from "@/lib/sales-catalog/shared";

const currency = serverModuleHarness<typeof import("@/lib/sales-catalog/mercado-pago")>("src/lib/sales-catalog/mercado-pago.ts");
const shipping = serverModuleHarness<typeof import("@/lib/sales-catalog/order-shipping")>("src/lib/sales-catalog/order-shipping.ts", { "./mercado-pago": currency, "./shipping-calculator": calculator });
const product = (mode = "physical", profile = "default", weight = 500) => ({ id: "product", price: "100", fulfillment: { mode }, shipping: { profile, weightGrams: weight, notes: null } } as ClientSalesCatalogItem);
const settings = { configured: true, shippingEnabled: true, localPickup: false, localDeliveryEnabled: false, localDeliveryZones: [], defaultHandlingDays: 0, rules: [{ uf: "SC", active: true, price: "70", freeShippingThreshold: "800", services: [], minDays: 3, maxDays: 5 }] } as unknown as ClientSalesCatalogShippingSettings;
const input = () => ({ entries: [{ item: product(), quantity: 1 }], settings, subtotal: 467.41, cep: "88330786", address: "Rua Exemplo, 61, Centro, Balneário Camboriú" });

describe("self-service shipping", () => {
  it("calculates configured freight for a repeat store purchase", () => {
    const result = shipping.quoteOrderDelivery(input());
    expect(result.quotes).toMatchObject([{ id: "manual", amount: 70, name: "Frete" }]);
    expect(result.error).toBeNull();
  });
  it("quotes the whole parcel including quantities across products", () => {
    const weighted = structuredClone(settings);
    weighted.rules[0].services = [{ id: "pac", name: "PAC", active: true, provider: "correios", tiers: [
      { id: "light", active: true, maxWeightGrams: 1000, price: "20", minDays: 2, maxDays: 4 },
      { id: "heavy", active: true, maxWeightGrams: 5000, price: "45", minDays: 3, maxDays: 6 },
    ] }] as never;
    const result = shipping.quoteOrderDelivery({ ...input(), settings: weighted, entries: [{ item: product(), quantity: 2 }, { item: product(), quantity: 1 }] });
    expect(result.quotes[0].amount).toBe(45);
  });
  it("accepts zero-price freight after crossing the cart threshold", () => {
    expect(shipping.quoteOrderDelivery({ ...input(), subtotal: 900 }).quotes[0].amount).toBe(0);
    expect(shipping.quoteOrderDelivery({ ...input(), entries: [{ item: product("physical", "free"), quantity: 1 }] }).quotes[0]).toMatchObject({ amount: 0 });
  });
  it("does not enable shipping through a free profile when the store disabled it", () => {
    expect(shipping.quoteOrderDelivery({ ...input(), settings: { ...settings, shippingEnabled: false }, entries: [{ item: product("physical", "free"), quantity: 1 }] }).quotes).toEqual([]);
  });
  it("does not auto-select pickup or invent a price for an uncovered CEP", () => {
    const result = shipping.quoteOrderDelivery({ ...input(), cep: "01001000", settings: { ...settings, localPickup: true } });
    expect(result.quotes).toMatchObject([{ id: "pickup", amount: 0 }]);
    expect(shipping.chooseOrderDeliveryQuote(result.quotes)).toBeNull();
  });
  it("does not require freight for digital or service products", () => {
    for (const mode of ["digital", "service"]) expect(shipping.quoteOrderDelivery({ ...input(), entries: [{ item: product(mode), quantity: 1 }], cep: "" })).toEqual({ physical: false, quotes: [], error: null });
  });
  it("keeps custom freight pending and does not charge the standard table", () => {
    expect(shipping.quoteOrderDelivery({ ...input(), entries: [{ item: product("physical", "custom"), quantity: 1 }] }).quotes).toEqual([]);
  });
  it("only offers local neighborhood delivery when the configured city also matches", () => {
    const local = { ...settings, shippingEnabled: false, localDeliveryEnabled: true, localDeliveryZones: [{ id: "zone", name: "Centro", active: true, shape: "neighborhoods", neighborhoods: ["Centro"], cities: ["Balneário Camboriú"], price: "10", minDays: 0, maxDays: 0 }] } as ClientSalesCatalogShippingSettings;
    expect(shipping.quoteOrderDelivery({ ...input(), settings: local }).quotes[0]).toMatchObject({ id: "local:zone", amount: 10 });
    expect(shipping.quoteOrderDelivery({ ...input(), settings: local, address: "Rua Exemplo, 61, Centro, Outra Cidade" }).quotes).toEqual([]);
  });
  it("reuses CRM delivery data before a new order is sent for payment", async () => {
    const prepare = serverModuleHarness<typeof import("@/lib/sales-catalog/public-order-delivery")>("src/lib/sales-catalog/public-order-delivery.ts", { "@/lib/client-os/sales-catalog": { getOrganizationSalesCatalogShippingSettings: vi.fn().mockResolvedValue(settings) }, "./checkout-customer": customers, "./order-shipping": shipping });
    const result = await prepare.preparePublicOrderDelivery({ client: {} as never, organizationId: "store", entries: input().entries, subtotal: 467.41, customer: { id: "new", customer_name: "Maria Exemplo" }, lead: { metadata: { email: "cliente@example.com", customer_document: "12345678909", delivery_cep: "88330786", delivery_address: input().address } } });
    expect(result).toMatchObject({ shippingTotal: "70.00", total: "537.41", customer: { destination_cep: "88330786", destination_address: input().address } });
  });
});
