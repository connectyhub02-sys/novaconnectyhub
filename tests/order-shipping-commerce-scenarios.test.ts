import { describe, expect, it } from "vitest";
import type { ClientSalesCatalogItem, ClientSalesCatalogShippingSettings } from "@/lib/sales-catalog/shared";
import * as calculator from "@/lib/sales-catalog/shipping-calculator";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { serverModuleHarness } from "./helpers/server-module-harness";

const money = serverModuleHarness("src/lib/sales-catalog/mercado-pago.ts");
const { quoteOrderDelivery, chooseOrderDeliveryQuote } = serverModuleHarness<typeof import("@/lib/sales-catalog/order-shipping")>(
  "src/lib/sales-catalog/order-shipping.ts", { "./shipping-calculator": calculator, "./mercado-pago": money },
);
const call = runtimeHarness();
const destinations = [
  ["SP", "Sao Paulo", "01001000", "35,00"],
  ["RJ", "Rio de Janeiro", "20040020", "45,00"],
  ["DF", "Distrito Federal", "70040900", "55,00"],
  ["BA", "Bahia", "40020000", "60,00"],
  ["AM", "Amazonas", "69005040", "90,00"],
  ["AC", "Acre", "69900060", "95,00"],
  ["SC", "Santa Catarina", "88010000", "70,00"],
] as const;
function item(id: string, title: string, price: string, profile = "default") {
  return { id, title, tag: `{{produto_${id}}}`, price, currency: "BRL", status: "active",
    salesDestination: "connectyhub_checkout", inventory: { status: "in_stock", allowBackorder: false },
    offer: { salePrice: null }, skus: [], attributes: [], fulfillment: { mode: "physical" },
    shipping: { profile, weightGrams: 500 }, media: [], description: "", category: "", platformProductCode: null,
  } as unknown as ClientSalesCatalogItem;
}
const settings: ClientSalesCatalogShippingSettings = {
  id: "shipping-settings", companyId: "store", configured: true, shippingEnabled: true,
  localPickup: true, localDeliveryEnabled: false, localDeliveryZones: [], originCep: "01001000",
  defaultHandlingDays: 0, createdAt: null, updatedAt: null,
  rules: destinations.map(([uf, state, , price]) => ({ uf, state, active: true, price,
    freeShippingThreshold: "800,00", minDays: 3, maxDays: 10, services: [], cepStart: null, cepEnd: null, notes: null })),
};
function context(products: ClientSalesCatalogItem[], cep: string, configuration = settings) {
  return { salesCatalog: products, salesCatalogOrders: [], salesCatalogShippingSettings: configuration,
    organization: { id: "store" }, conversationId: "conversation", agent: { id: "agent" }, instance: { id: "instance" },
    messages: [{ id: "address", direction: "inbound", occurred_at: "2026-09-12T20:00:00Z", message_type: "text", payload: {},
      text_content: `Rua das Flores, numero 42, Centro, CEP ${cep}` }], lead: { id: "lead", metadata: {} },
  };
}
function quote(entries: { item: ClientSalesCatalogItem; quantity: number }[], subtotal: number, cep = "88010000", configuration = settings) {
  return quoteOrderDelivery({ entries, subtotal, cep, settings: configuration, address: `Rua das Flores, 42, Centro, CEP ${cep}` });
}

describe("commerce delivery remains consistent when a clothes or electronics cart changes", () => {
  it.each(destinations)("recalculates a full cart across the free-freight boundary in %s", (_uf, _state, cep, fee) => {
    const shirt = item("shirt", "Camiseta azul tamanho M", "399,99");
    const jacket = item("jacket", "Jaqueta preta tamanho G", "400,00");
    for (const [extraPrice, expectedShipping] of [["0,00", Number(fee.replace(",", "."))], ["0,01", 0], ["0,02", 0]] as const) {
      const adjustment = Number(extraPrice.replace(",", "."));
      const entries = [{ item: shirt, quantity: 1 }, { item: { ...jacket, price: (400 + adjustment).toFixed(2) }, quantity: 1 }];
      const revised = chooseOrderDeliveryQuote(quote(entries, 799.99 + adjustment, cep).quotes);
      const initial = call<{ shippingTotal: string }>("resolveInitialSalesCatalogOrderShipping", {
        context: context(entries.map(entry => entry.item), cep), selections: entries, intentText: "sim",
      });
      expect(revised?.amount).toBe(expectedShipping);
      expect(Number(initial.shippingTotal.replace("R$", "").trim().replace(",", "."))).toBe(expectedShipping);
    }
  });

  it("restores the freight after removing an item that qualified a cart for free shipping", () => {
    const entries = [{ item: item("headset", "Fone sem fio", "450,00"), quantity: 1 },
      { item: item("keyboard", "Teclado mecanico", "350,00"), quantity: 1 }];
    expect(chooseOrderDeliveryQuote(quote(entries, 800).quotes)?.amount).toBe(0);
    expect(chooseOrderDeliveryQuote(quote(entries.slice(0, 1), 450).quotes)?.amount).toBe(70);
  });

  it("does not let an accessory with free freight waive delivery for the remaining products", () => {
    const paid = { item: item("mouse", "Mouse sem fio", "150,00"), quantity: 1 };
    const free = { item: item("cable", "Cabo USB", "20,00", "free"), quantity: 1 };
    for (const entries of [[paid, free], [free, paid]]) {
      expect(chooseOrderDeliveryQuote(quote(entries, 170).quotes)?.amount).toBe(70);
      const initial = call<{ shippingTotal: string }>("resolveInitialSalesCatalogOrderShipping", {
        context: context(entries.map(entry => entry.item), "88010000"), selections: entries, intentText: "sim",
      });
      expect(initial.shippingTotal).toBe("70,00");
    }
  });

  it("keeps delivery unchanged when the same physical quantity is split into equivalent lines", () => {
    const shirt = item("shirt", "Camiseta branca tamanho M", "200,00");
    const together = quote([{ item: shirt, quantity: 4 }], 800);
    const separate = quote([{ item: shirt, quantity: 1 }, { item: shirt, quantity: 3 }], 800);
    expect(separate).toEqual(together);
  });

  it.each(["custom", "default"])("does not replace unavailable %s delivery with pickup without a customer's choice", profile => {
    const entries = [{ item: item("screen", "Monitor 32 polegadas", "1200,00", profile), quantity: 1 }];
    const disabled = { ...settings, shippingEnabled: false };
    const result = quote(entries, 1200, "88010000", disabled);
    expect(result.quotes.filter(entry => entry.pickup)).toHaveLength(1);
    expect(chooseOrderDeliveryQuote(result.quotes)).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it.each(["", "123", "00000000", "100000000"])("does not reuse the previous destination's fee for an invalid CEP: %s", cep => {
    const result = quote([{ item: item("shirt", "Camiseta vermelha tamanho P", "200,00"), quantity: 1 }], 200, cep);
    expect(chooseOrderDeliveryQuote(result.quotes)).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("uses the new state's own tariff after an address change instead of the previous quote", () => {
    const entries = [{ item: item("router", "Roteador Wi-Fi", "350,00"), quantity: 2 }];
    expect(chooseOrderDeliveryQuote(quote(entries, 700, "01001000").quotes)?.amount).toBe(35);
    expect(chooseOrderDeliveryQuote(quote(entries, 700, "69005040").quotes)?.amount).toBe(90);
  });

  it("does not borrow shipping settings from another store", () => {
    const entries = [{ item: item("shirt", "Camiseta azul tamanho M", "250,00"), quantity: 2 }];
    const otherStore = { ...settings, companyId: "other-store", rules: settings.rules.map(rule => ({ ...rule, price: "15,00", freeShippingThreshold: "300,00" })) };
    expect(chooseOrderDeliveryQuote(quote(entries, 500).quotes)?.amount).toBe(70);
    expect(chooseOrderDeliveryQuote(quote(entries, 500, "88010000", otherStore).quotes)?.amount).toBe(0);
    expect(chooseOrderDeliveryQuote(quote(entries, 500).quotes)?.amount).toBe(70);
  });
});
