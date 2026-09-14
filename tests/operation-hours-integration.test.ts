import { describe, expect, it, vi } from "vitest";
import { defaultOperationHours } from "@/lib/sales-catalog/operation-hours";
import * as customer from "@/lib/sales-catalog/checkout-customer";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
const closed = { ...defaultOperationHours(), enabled: true, schedules: { ...defaultOperationHours().schedules, orders: { enabled: true, windows: [{ day: 0, start: "00:00", end: "24:00" }] } }, pausedUntil: "2099-01-01T00:00:00Z" };
const settings = { orderPolicy: { operations: closed } };
const currency = serverModuleHarness("src/lib/sales-catalog/mercado-pago.ts");
const order = { id: "order", organization_id: "store", lead_id: null, total: "100", subtotal: "100", shipping_method: "Entrega", destination_address: "Rua Exemplo, 10, Centro, Cidade", destination_cep: "01001000", metadata: {} };

describe("operation checks at server boundaries", () => {
  it.each([false, true])("blocks a fresh card attempt but preserves pending reconciliation: %s", async existing => {
    const sessionId = "10000000-0000-4000-8000-000000000001";
    const attempt = { id: "attempt", organization_id: "store", order_id: "order", payment_session_id: sessionId, state: "pending", updated_at: new Date().toISOString() };
    const db = commerceDatabase({ sales_catalog_orders: [order], sales_catalog_payment_sessions: [{ id: sessionId, order_id: "order", organization_id: "store", provider: "asaas" }], sales_catalog_order_items: [{ id: "item", order_id: "order", organization_id: "store", fulfillment: { mode: "physical" } }], sales_catalog_card_attempts: existing ? [attempt] : [] });
    const gateway = vi.fn();
    const api = serverModuleHarness<typeof import("@/lib/sales-catalog/transparent-checkout")>("src/lib/sales-catalog/transparent-checkout.ts", {
      "./public-commerce-access": { assertPublicCommerceAccess: vi.fn() },
      "@/lib/billing/contract-access": { assertContractAccess: vi.fn() },
      "@/lib/commerce/store-payment-guard": { assertStoreAgreementPayable: vi.fn() },
      "./checkout-customer": customer, "./mercado-pago": currency,
      "./card-input": serverModuleHarness("src/lib/sales-catalog/card-input.ts"),
      "./payment-diagnostics": { paymentOutcomeCopy: () => "Em processamento" },
      "@/lib/client-os/sales-catalog": { getOrganizationSalesCatalogSettings: async () => settings },
      "./asaas": { ensureAsaasAccessToken: gateway },
    });
    const result = api.payTransparentCheckout(db.client as never, sessionId, {}, "203.0.113.1");
    if (existing) expect(await result).toMatchObject({ status: "pending", approved: false });
    else await expect(result).rejects.toThrow("pausou");
    expect(gateway).not.toHaveBeenCalled();
  });

  it("blocks creation of even a deferred payment session before provider access", async () => {
    const db = commerceDatabase({ sales_catalog_orders: [order], sales_catalog_order_items: [{ order_id: "order", fulfillment: { mode: "physical" } }] });
    const gateway = vi.fn();
    const api = serverModuleHarness<typeof import("@/lib/sales-catalog/payment-sessions")>("src/lib/sales-catalog/payment-sessions.ts", {
      "./checkout-customer": customer, "./mercado-pago": currency,
      "@/lib/billing/contract-access": { assertContractAccess: vi.fn() },
      "@/lib/commerce/store-payment-guard": { assertStoreAgreementPayable: vi.fn() },
      "@/lib/platform-product-sales": { resolveSalesCatalogOrderPaymentOwner: async () => ({ owner: "seller" }) },
      "@/lib/client-os/sales-catalog": { getOrganizationSalesCatalogSettings: async () => settings },
      "./asaas": { ensureAsaasAccessToken: gateway },
    });
    await expect(api.createSalesCatalogPixPaymentSession({ client: { ...db.client, rpc: vi.fn(async () => ({ error: null })) } as never, organizationId: "store", orderId: "order", source: "whatsapp_agent" })).rejects.toThrow("pausou");
    expect(gateway).not.toHaveBeenCalled(); expect(db.tables.sales_catalog_payment_sessions ?? []).toHaveLength(0);
  });
  it("reports closed hours before public store order creation", async () => {
    const api = serverModuleHarness<typeof import("@/lib/sales-catalog/public-order-delivery")>("src/lib/sales-catalog/public-order-delivery.ts", {
      "./checkout-customer": customer,
      "@/lib/client-os/sales-catalog": { getOrganizationSalesCatalogSettings: async () => settings, getOrganizationSalesCatalogShippingSettings: async () => null },
      "./order-shipping": { quoteOrderDelivery: () => ({ physical: false, quotes: [] }), chooseOrderDeliveryQuote: () => null },
    });
    const result = await api.preparePublicOrderDelivery({ client: {} as never, organizationId: "store", customer: order, lead: null, entries: [], subtotal: 100 });
    expect(result.operation).toMatchObject({ allowed: false, state: "closed" });
  });
  it("filters closed delivery choices and refuses save before payment retirement", async () => {
    const db = commerceDatabase({ intelligence_memory: [] }); const retire = vi.fn();
    const api = serverModuleHarness<typeof import("@/lib/sales-catalog/checkout-delivery")>("src/lib/sales-catalog/checkout-delivery.ts", {
      "./transparent-checkout": { CheckoutError: class extends Error {}, loadTransparentCheckout: async () => ({ order, session: { organization_id: "store" }, items: [], settings }), retireCheckoutPaymentsBeforeCartChange: retire },
      "@/lib/client-os/sales-catalog": { getOrganizationSalesCatalogShippingSettings: async () => null },
      "./mercado-pago": currency, "./card-input": serverModuleHarness("src/lib/sales-catalog/card-input.ts"),
      "./checkout-customer": { ...customer, getCheckoutCustomerMissingFields: () => [] },
      "./order-shipping": { quoteOrderDelivery: () => ({ physical: true, quotes: [{ id: "delivery", name: "Entrega", amount: 10, pickup: false }], error: null }), chooseOrderDeliveryQuote: (quotes: unknown[]) => quotes[0] },
    });
    const loaded = await api.loadCheckoutDelivery(db.client as never, "session");
    expect(loaded.quotes).toEqual([]); expect(loaded.operationError).toContain("pausou");
    await expect(api.saveCheckoutDelivery(db.client as never, "session", { revision: 0, serviceId: "delivery", customer: order })).rejects.toThrow("pausou");
    expect(retire).not.toHaveBeenCalled();
  });
});
