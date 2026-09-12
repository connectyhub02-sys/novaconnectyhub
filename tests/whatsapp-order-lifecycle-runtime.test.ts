import { describe, expect, it } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";

const now = "2026-09-13T19:30:00.000Z";
const address = "Rua das Flores, número 42, Centro, Florianópolis, CEP 88010000";
const product = (id: string, title: string) => ({ id, title, tag: `{{produto_${id}}}`, price: "30,00", currency: "BRL", status: "active",
  salesDestination: "connectyhub_checkout", inventory: { status: "in_stock", allowBackorder: false }, offer: { salePrice: null },
  attributes: [], skus: [], fulfillment: { mode: "physical" }, shipping: { profile: "default", weightGrams: 500 }, media: [], description: "", category: "" });
const pizza = product("pizza", "Pizza de queijo");
const lemonade = product("lemonade", "Limonada");
const order = { id: "order", companyId: "store", leadId: "lead", conversationId: "conversation", status: "pending_payment", paymentStatus: "pending",
  createdAt: "2026-09-13T19:00:00.000Z", updatedAt: "2026-09-13T19:25:00.000Z", checkoutConfirmedAt: "2026-09-13T19:01:00.000Z",
  latestPaymentSessionId: "session", items: [{ catalogItemId: "pizza", title: pizza.title, quantity: 1 }],
  destinationAddress: address, destinationCep: "88010000", shippingMethod: "Frete", shippingTotal: "10,00", total: "40,00" };
const msg = (text: string, at = now, direction = "inbound") => ({ id: `msg-${at}`, direction, text_content: text, occurred_at: at, message_type: "text", payload: {} });
function fixture(text: string, orders: Record<string, unknown>[] = [structuredClone(order)]) {
  const latest = msg(text);
  const context = { organization: { id: "store" }, conversationId: "conversation", instance: { id: "instance", metadata: {} },
    lead: { id: "lead", metadata: {} as Record<string, unknown> }, salesCatalogOrders: orders, messages: [latest], salesCatalog: [pizza, lemonade],
    agent: { id: "agent" }, behavior: {}, salesCatalogSettings: null,
    salesCatalogShippingSettings: { configured: true, shippingEnabled: true, localPickup: true, localDeliveryEnabled: true,
      localDeliveryZones: [{ id: "center", name: "Centro", active: true, price: "10,00" }], rules: [] } };
  return { context, latest, call: runtimeHarness() };
}

describe("runtime order lifecycle boundaries", () => {
  it.each(["oi", "bom dia", "sim", "top"])("never recovers a checkout from an isolated ordinary turn: %s", text => {
    const s = fixture(text);
    expect(s.call("findRecentPendingSalesCatalogCheckoutOrder", s.context.salesCatalogOrders, s.latest, s.context)).toBeNull();
  });
  it.each(["oi", "sim", "quero um novo pedido", "quero outra pizza", "me manda o link para pagar"])("never reopens a paid order: %s", text => {
    const s = fixture(text, [{ ...order, status: "paid", paymentStatus: "confirmed" }]);
    expect(s.call("findRecentPendingSalesCatalogCheckoutOrder", s.context.salesCatalogOrders, s.latest, s.context)).toBeNull();
  });
  it.each([{ conversationId: "other" }, { companyId: "other" }, { leadId: "other" }, { conversationId: undefined },
    { status: "paid" }, { status: "in_preparation" }, { paymentStatus: "proof_sent" }])("rejects wrong scope or noneditable state: %j", change => {
    const s = fixture("me manda o link para pagar", [{ ...order, ...change }]);
    expect(s.call("findRecentPendingSalesCatalogCheckoutOrder", s.context.salesCatalogOrders, s.latest, s.context)).toBeNull();
  });
  it("can explicitly resume the single pending checkout from yesterday", () => {
    const s = fixture("me manda o link para pagar", [{ ...order, createdAt: "2026-09-12T19:00:00.000Z" }]);
    expect(s.call("findRecentPendingSalesCatalogCheckoutOrder", s.context.salesCatalogOrders, s.latest, s.context)).toBe(s.context.salesCatalogOrders[0]);
  });
  it("does not choose arbitrarily among pending orders", () => {
    const s = fixture("me manda o link para pagar", [order, { ...order, id: "another-order" }]);
    expect(s.call("findRecentPendingSalesCatalogCheckoutOrder", s.context.salesCatalogOrders, s.latest, s.context)).toBeNull();
  });
  it("does not revive an old order after a new purchase marker", () => {
    const s = fixture("me manda o link para pagar");
    s.context.lead.metadata.checkout_journey = { organization_id: "store", conversation_id: "conversation", instance_id: "instance", started_at: "2026-09-13T19:20:00.000Z" };
    expect(s.call("findRecentPendingSalesCatalogCheckoutOrder", s.context.salesCatalogOrders, s.latest, s.context)).toBeNull();
  });
  it("uses order creation and the scoped new-purchase boundary, not arbitrary bookkeeping", () => {
    const s = fixture("sim", [order, { ...order, conversationId: "other", updatedAt: now, createdAt: now }]);
    expect(s.call("resolveSalesCatalogCartBoundaryMs", s.context.salesCatalogOrders, s.context)).toBe(Date.parse(order.checkoutConfirmedAt));
    s.context.messages.unshift(msg("quero outro pedido", "2026-09-13T19:20:00.000Z"));
    expect(s.call("resolveSalesCatalogCartBoundaryMs", s.context.salesCatalogOrders, s.context)).toBe(Date.parse("2026-09-13T19:20:00.000Z"));
  });
  it("requires the complete cart and quantities before inheriting delivery resolution", () => {
    const s = fixture("sim");
    const selected = (item: typeof pizza, quantity: number) => ({ item, quantity, source: "confirmation_preview" });
    expect(s.call("findRecentSalesCatalogOrderForSelections", [order], [selected(pizza, 1)], s.latest, s.context)).toBe(order);
    expect(s.call("findRecentSalesCatalogOrderForSelections", [order], [selected(pizza, 1), selected(lemonade, 1)], s.latest, s.context)).toBeNull();
    expect(s.call("findRecentSalesCatalogOrderForSelections", [order], [selected(pizza, 2)], s.latest, s.context)).toBeNull();
    expect(s.call("findRecentSalesCatalogOrderForSelections", [{ ...order, conversationId: "other" }], [selected(pizza, 1)], s.latest, s.context)).toBeNull();
  });
  it("preserves the existing order's address when revising its items", () => {
    const s = fixture("adicione uma limonada");
    s.context.messages.unshift(msg(address, "2026-09-13T18:50:00.000Z"));
    expect(s.call<string>("buildSalesCatalogShippingIntentText", s.context, s.latest.text_content)).toContain("Rua das Flores");
  });
  it("does not borrow that address for an explicitly new purchase", () => {
    const s = fixture("quero outro pedido");
    expect(s.call("buildSalesCatalogShippingIntentText", s.context, s.latest.text_content)).toBe(s.latest.text_content);
  });
  it.each(["paid", "new_marker", "new_message"])("does not reuse the previous order preview after %s", boundary => {
    const s = fixture("sim");
    s.context.messages.unshift(msg("Antes de fechar, confirma se o pedido ficou assim:\n- 1x Pizza de queijo - R$ 30,00\n- Frete: R$ 10,00\nTotal: R$ 40,00.\nPosso fechar seu pedido e gerar o pagamento?", "2026-09-13T18:55:00.000Z", "outbound"));
    if (boundary === "paid") s.context.salesCatalogOrders = [{ ...order, status: "paid", paymentStatus: "confirmed" }];
    if (boundary === "new_marker") s.context.lead.metadata.checkout_journey = { organization_id: "store", conversation_id: "conversation", instance_id: "instance", started_at: "2026-09-13T19:20:00.000Z" };
    if (boundary === "new_message") s.context.messages.splice(1, 0, msg("quero outro pedido", "2026-09-13T19:20:00.000Z"));
    expect(s.call("hasRecentSalesCatalogCheckoutConfirmation", s.context, "sim")).toBe(false);
    expect(s.call("resolveSalesCatalogOrderSelections", { context: s.context, currentItems: [], responseText: "Vamos montar seu pedido.", intentText: "sim" })).toEqual([]);
  });
  it.each(["top, adicione uma limonada", "sim, retire a limonada", "sim, troque a pizza por limonada", "sim, reduza para uma pizza", "quero outro pedido"])("does not classify a cart change as checkout confirmation: %s", text => {
    const s = fixture(text);
    expect(s.call("hasSalesCatalogCheckoutConfirmationIntent", text)).toBe(false);
  });
  it.each(["maybeAttachSalesCatalogShippingQuoteToOrder", "maybeAttachSalesCatalogDeliveryAddressToOrder", "maybeAttachSalesCatalogLocalDeliveryToOrder", "maybeAttachSalesCatalogPickupToOrder"])("does not touch out-of-scope or paid orders while collecting delivery: %s", async fn => {
    for (const blocked of [{ ...order, companyId: "other" }, { ...order, conversationId: "other" }, { ...order, status: "paid" }]) {
      const s = fixture(fn.endsWith("PickupToOrder") ? "vou retirar na loja" : address, [{ ...blocked, destinationAddress: null, shippingMethod: null, shippingTotal: null }]);
      const client = { from: () => { throw new Error("Historical order must not be touched"); } };
      expect(await s.call(fn, { client, context: s.context, latestInbound: s.latest, userText: s.latest.text_content })).toBeNull();
    }
  });
});
