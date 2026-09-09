import { describe, expect, it, vi } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";

const product = (id: string, title: string) => ({
  id, title, tag: `{{produto_${id}}}`, price: "251,90", currency: "BRL", status: "active",
  salesDestination: "connectyhub_checkout", inventory: { status: "in_stock", allowBackorder: false },
  offer: { salePrice: null }, skus: [], attributes: [], fulfillment: { mode: "physical" },
  shipping: { profile: "default", weightGrams: 500 }, media: [], description: "", category: "", platformProductCode: null,
});
const catalog = [
  product("serum", "Serum 10ml / 250mg – Flora Lab"),
  product("oleo", "Oleo Flora Lab 10ml / 300mg"),
  product("serum-gold", "Serum Plus Gold 250mg/10ml – Marca Gold"),
  product("oleo-gold", "Oleo Plus Gold 300mg/10ml – Marca Gold"),
];
const message = (direction: string, text_content: string, minute: number) => ({
  id: `message-${minute}`, direction, text_content, occurred_at: new Date(Date.UTC(2026, 8, 5, 12, minute)).toISOString(),
  message_type: "text", payload: {},
});
const shippingSettings = {
  configured: true, shippingEnabled: true, localPickup: false, localDeliveryEnabled: false, localDeliveryZones: [], defaultHandlingDays: 0,
  rules: [{ uf: "SC", state: "Santa Catarina", active: true, price: "70,00", freeShippingThreshold: "800,00", minDays: 5, maxDays: 10, services: [], cepStart: null, cepEnd: null }],
};
const customerData = "Pix\nMaria Oliveira\ncliente@example.com\n12345678901\nRua das Flores, numero 42, Cep 88330786, Centro, Balneario Camboriu, apartamento 101";
const abbreviatedPreview = "Ficou assim o resumo do pedido:\n1x Serum 10ml Flora Lab (R$ 251,90)\n1x Oleo 10ml Flora Lab (R$ 251,90)\nTotal: R$ 503,80 no Pix.";
const confirmation = "Tudo certinho! Posso fechar seu pedido e gerar o código do Pix agora?";
const context = () => ({
  messages: [message("outbound", "Você prefere Pix ou cartão? Me passa seu nome, e-mail e endereço completo com CEP.", 0),
    message("inbound", customerData, 1), message("outbound", "Resumo do seu pedido:\n1x Serum 10ml Flora Lab (R$ 251,90)\n1x Oleo 10ml Flora Lab (R$ 2", 2),
    message("inbound", "?", 3), message("outbound", abbreviatedPreview, 4), message("outbound", confirmation, 5), message("inbound", "sim pode aguardando", 6)],
  salesCatalog: catalog, salesCatalogOrders: [], salesCatalogShippingSettings: shippingSettings,
  organization: { id: "store" }, agent: { id: "agent" }, instance: { id: "instance", metadata: {} }, conversationId: "conversation", run: { id: "run" },
  lead: { id: "lead", display_name: "Maria Oliveira", metadata: { person_name: "Maria Oliveira", email: "cliente@example.com", customer_document: "12345678901" } },
  behavior: { proactiveFollowUp: false }, linkButtons: [], salesCatalogSettings: null, credentials: { baseUrl: "https://whatsapp.invalid" },
});
type Selection = { item: { id: string }; quantity: number };

describe("physical WhatsApp checkout after a natural multipart summary", () => {
  it("resolves shortened and reordered titles without buying the other brand", () => {
    const call = runtimeHarness();
    const selections = call<Selection[]>("resolveSalesCatalogOrderSelections", { context: context(), currentItems: [], responseText: "", intentText: "sim pode aguardando" });
    expect(selections.map(s => [s.item.id, s.quantity])).toEqual([["serum", 1], ["oleo", 1]]);
  });

  it("recovers the customer CEP sent before a repaired preview and includes the configured freight", () => {
    const ctx = context();
    const call = runtimeHarness();
    const text = call<string>("buildSalesCatalogOrderConfirmationPrompt", { context: ctx, latestInbound: ctx.messages.at(-1),
      selections: catalog.slice(0, 2).map(item => ({ item, quantity: 1, source: "confirmation_preview" })), intentText: "sim pode aguardando" });
    expect(text).toContain("70,00");
    expect(text).toContain("573,80");
    expect(text).not.toContain("Ainda preciso calcular");
  });

  it("does not create a charge for an accepted total that omitted freight", async () => {
    const ctx = context();
    const db = commerceDatabase();
    const createPayment = vi.fn();
    const call = runtimeHarness({ "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment } });
    await call("recordSalesCatalogOrderIntent", { client: db.client, context: ctx, items: [], text: "Tô gerando o Pix", intentText: "sim pode aguardando" });
    expect(db.tables.sales_catalog_orders ?? []).toHaveLength(0);
    expect(createPayment).not.toHaveBeenCalled();
  });

  it.each(["pix", "card"])("sends a corrected summary, then one %s action after consent without collecting data again", async method => {
    const ctx = context();
    if (method === "card") ctx.messages[1].text_content = customerData.replace("Pix", "Cartão");
    const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: ctx.lead.metadata }],
      conversation_messages: [{ ...ctx.messages.at(-1), conversation_id: "conversation", whatsapp_instance_id: "instance" }] });
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const createPayment = vi.fn(async (input: { amount: string; preferredMethod: string }) => {
      expect(input).toMatchObject({ amount: "573,80", preferredMethod: method });
      expect(db.tables.sales_catalog_orders[0]).toMatchObject({ subtotal: "503,80", total: "573,80", shipping_total: "70,00",
        destination_cep: "88330786", customer_name: "Maria Oliveira", customer_email: "cliente@example.com", customer_document: "12345678901" });
      expect(db.tables.sales_catalog_orders[0].destination_address).toContain("Rua das Flores");
      return { session: { provider: "asaas", amount: "573,80" }, checkoutUrl: "https://loja.example/checkout/teste", pixQrCode: method === "pix" ? "000201pix-ficticio" : null };
    });
    const call = runtimeHarness({
      "@/lib/client-os/sales-catalog": { mapSalesCatalogOrder: (row: Record<string, unknown>, items: Record<string, unknown>[]) => ({
        id: row.id, conversationId: row.conversation_id, customerName: row.customer_name, customerEmail: row.customer_email,
        customerDocument: row.customer_document, total: row.total, destinationAddress: row.destination_address,
        destinationCep: row.destination_cep, shippingMethod: row.shipping_method, shippingTotal: row.shipping_total,
        items: items.map(item => ({ catalogItemId: item.catalog_item_id, title: item.title, quantity: item.quantity, fulfillment: item.fulfillment })),
      }) },
      "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment },
    }, { fetch: async (url: string, init: { body: string }) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "fake-message" }) };
    } });
    const outbound = await call<{ text: string }[]>("sendAgentResponse", { client: db.client, context: ctx, token: "fake", phone: "5500000000000", text: "Fechado! Tô gerando o Pix de R$ 503,80. O botão vai aparecer logo abaixo." });
    const corrected = outbound.map(message => message.text).join("\n");
    expect(corrected).toContain("70,00");
    expect(corrected).toContain("573,80");
    expect(corrected).not.toMatch(/gerando|logo abaixo|me envia|seu nome|CPF/i);
    expect(createPayment).not.toHaveBeenCalled();
    expect(db.tables.sales_catalog_orders ?? []).toHaveLength(0);

    ctx.messages.push(message("outbound", corrected, 7), message("inbound", "Sim pode gerar", 8));
    ctx.run.id = "run-2";
    db.tables.conversation_messages = [{ ...ctx.messages.at(-1), conversation_id: "conversation", whatsapp_instance_id: "instance" }];
    requests.length = 0;
    expect(call("hasRecentSalesCatalogCheckoutConfirmation", ctx, "Sim pode gerar")).toBe(true);
    const selections = call<Selection[]>("resolveSalesCatalogOrderSelections", { context: ctx, currentItems: [], responseText: "", intentText: "Sim pode gerar" });
    expect(call("needsSalesCatalogCheckoutTotalConfirmation", { context: ctx, selections, intentText: "Sim pode gerar" })).toBe(false);
    const result = await call<unknown[]>("sendAgentResponse", { client: db.client, context: ctx, token: "fake", phone: "5500000000000", text: "Tudo certo, vou gerar!" });
    expect(result).toHaveLength(1);
    expect(createPayment, JSON.stringify(result)).toHaveBeenCalledOnce();
    expect(db.tables.sales_catalog_orders).toHaveLength(1);
    expect(db.tables.sales_catalog_order_items.map(item => [item.catalog_item_id, item.quantity])).toEqual([["serum", 1], ["oleo", 1]]);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`https://whatsapp.invalid/send/${method === "pix" ? "request-payment" : "menu"}`);
    expect(method === "pix" ? requests[0].body.pixCode : (requests[0].body.choices as string[])[0]).toContain(method === "pix" ? "000201pix-ficticio" : "payment_method=card");
  });

  it.each(["1x Oleo 10ml", "1x Produto inexistente"]) ("does not silently charge a partial or ambiguous cart: %s", line => {
    const ctx = context();
    ctx.messages[4].text_content = abbreviatedPreview.replace("1x Oleo 10ml Flora Lab (R$ 251,90)", line);
    const call = runtimeHarness();
    expect(call("resolveSalesCatalogOrderSelections", { context: ctx, currentItems: [], responseText: "", intentText: "sim pode aguardando" })).toEqual([]);
  });

  it("keeps quantities per line when titles share brand and volume", () => {
    const ctx = context();
    ctx.messages[4].text_content = abbreviatedPreview.replace("1x Serum", "2x Serum").replace("1x Oleo", "3x Oleo");
    const call = runtimeHarness();
    expect(call<Selection[]>("resolveSalesCatalogOrderSelections", { context: ctx, currentItems: [], responseText: "", intentText: "sim pode aguardando" })
      .map(s => [s.item.id, s.quantity])).toEqual([["serum", 2], ["oleo", 3]]);
  });

  it("applies the free-shipping threshold to the full cart and sums the shipped weight", () => {
    const ctx = context();
    const call = runtimeHarness();
    const shipping = call<{ shippingTotal: string; metadata: { weight_grams: number } }>("resolveInitialSalesCatalogOrderShipping", {
      context: ctx, selections: catalog.slice(0, 2).map(item => ({ item, quantity: 2 })), intentText: "Sim",
    });
    expect(shipping.shippingTotal).toContain("0,00");
    expect(shipping.metadata.weight_grams).toBe(2000);
  });

  it.each(["free", "custom"])("does not let the first item's %s profile erase the rest of the cart's shipping", profile => {
    const call = runtimeHarness();
    const shipping = call<{ shippingTotal: string } | null>("resolveInitialSalesCatalogOrderShipping", {
      context: context(), intentText: "Sim", selections: [
        { item: { ...catalog[0], shipping: { ...catalog[0].shipping, profile } }, quantity: 1 }, { item: catalog[1], quantity: 1 },
      ],
    });
    if (profile === "custom") expect(shipping).toBeNull();
    else expect(shipping?.shippingTotal).toBe("70,00");
  });

  it("uses a newer customer CEP instead of an assistant suggestion or an old destination", () => {
    const ctx = context();
    ctx.messages.push(message("outbound", "Exemplo de CEP: 01001000", 7), message("inbound", "Meu CEP correto é 88010000", 8));
    const call = runtimeHarness();
    const shipping = call<{ destinationAddress: string }>("resolveInitialSalesCatalogOrderShipping", { context: ctx, selections: [{ item: catalog[0], quantity: 1 }], intentText: "Meu CEP correto é 88010000" });
    expect(shipping)
      .toMatchObject({ destinationCep: "88010000", shippingTotal: "70,00" });
    expect(shipping.destinationAddress).not.toContain("88330786");
  });

  it("explains unavailable freight without requesting the same customer data or promising payment", () => {
    const ctx = context();
    ctx.salesCatalogShippingSettings = { ...shippingSettings, rules: [] };
    const call = runtimeHarness();
    const prompt = call<string>("buildSalesCatalogDeliveryDetailsBeforeCheckoutPrompt", { context: ctx, latestInbound: ctx.messages.at(-1),
      selections: [{ item: catalog[0], quantity: 1 }], intentText: "Sim", hasOrderIntent: true });
    expect(prompt).toContain("não encontrei uma tarifa");
    expect(prompt).not.toMatch(/me passa|me envia|gerando|gerar o Pix/);
  });

  it("asks only for the missing CEP when the customer changes the address", () => {
    const ctx = context();
    ctx.messages.push(message("inbound", "A entrega é na Rua Nova, número 10, Centro, Curitiba", 7));
    const call = runtimeHarness();
    const input = { context: ctx, latestInbound: ctx.messages.at(-1), selections: [{ item: catalog[0], quantity: 1 }], intentText: "Sim", hasOrderIntent: true };
    expect(call("resolveInitialSalesCatalogOrderShipping", input)).toBeNull();
    expect(call("buildSalesCatalogDeliveryDetailsBeforeCheckoutPrompt", input)).toContain("só o CEP");
  });
});
