import { describe, expect, it } from "vitest";
import type { ClientSalesCatalogItem, SalesCatalogOrderBumpItem } from "../src/lib/sales-catalog/shared";
import { serverModuleHarness } from "./helpers/server-module-harness";

const rules = serverModuleHarness<typeof import("../src/lib/sales-catalog/commerce-offers")>("src/lib/sales-catalog/commerce-offers.ts", {
  "./mercado-pago": { normalizeCurrencyAmount: (value: unknown) => value == null || value === "" ? null : Number(String(value).replace(",", ".")) },
  "./shared": { isSalesCatalogDisplayableProduct: () => true },
});
const product = { id: "main", title: "Produto principal", category: "Acessórios", price: "100", status: "active", salesDestination: "connectyhub_checkout", billingCycle: "one_time", skus: [], attributes: [], fulfillment: { schedulingRequired: false }, inventory: { status: "in_stock", quantity: 3, allowBackorder: false }, offer: { salePrice: "80", saleStartsAt: "2026-09-01T00:00:00Z", saleEndsAt: "2026-09-30T23:59:59Z" } } as unknown as ClientSalesCatalogItem;

describe("shared commerce offer rules", () => {
  it("respects promotion dates instead of charging an expired advertised price", () => {
    expect(rules.getCommerceOfferPrice(product, Date.parse("2026-09-05"))).toBe(80);
    expect(rules.getCommerceOfferPrice(product, Date.parse("2026-10-01"))).toBe(100);
  });
  it("requires the configured product, category and validated subtotal", () => {
    const rule = { triggerProductId: "main", triggerCategory: "acessorios", minimumSubtotal: 150 } as SalesCatalogOrderBumpItem;
    expect(rules.matchesCommerceOfferConditions(rule, [product], 200)).toBe(true);
    expect(rules.matchesCommerceOfferConditions(rule, [product], 100)).toBe(false);
    expect(rules.matchesCommerceOfferConditions(rule, [], 200)).toBe(false);
    expect(rules.matchesCommerceOfferConditions(rule, [{ ...product, category: "Outra" }], 200)).toBe(false);
  });
  it("requires variant selection and keeps unavailable or recurring products out of automatic additions", () => {
    expect(rules.canAddCommerceOfferDirectly({ ...product, attributes: [{ id: "size", name: "Tamanho", values: ["P", "G"] }] })).toBe(false);
    expect(rules.canAddCommerceOfferDirectly({ ...product, fulfillment: { ...product.fulfillment, schedulingRequired: true } })).toBe(false);
    expect(rules.isEligibleCommerceOffer({ ...product, inventory: { ...product.inventory, quantity: 0 } })).toBe(false);
    expect(rules.isEligibleCommerceOffer({ ...product, billingCycle: "monthly" } as unknown as ClientSalesCatalogItem)).toBe(false);
  });
});
