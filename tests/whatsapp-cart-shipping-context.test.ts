import { describe, expect, it } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";

const call = runtimeHarness();
type QuoteContext = { itemId: string; quotes: Array<{ price: string; notes: string | null }> };
const product = (id: string, price: string) => ({ id, title: id === "pizza" ? "Pizza de queijo" : "Kit de limonadas", tag: `{{produto_${id}}}`,
  price, currency: "BRL", status: "active", salesDestination: "connectyhub_checkout", inventory: { status: "in_stock", allowBackorder: false },
  offer: { salePrice: null }, attributes: [], skus: [], fulfillment: { mode: "physical" }, shipping: { profile: "default", weightGrams: 500 },
  media: [], description: "", category: null });
const items = [product("pizza", "450,00"), product("lemonade", "400,00")];
const settings = { configured: true, shippingEnabled: true, localPickup: false, localDeliveryEnabled: false, localDeliveryZones: [],
  rules: [{ uf: "SC", state: "Santa Catarina", active: true, price: "70", freeShippingThreshold: "800", services: [], minDays: 3, maxDays: 5 }] };
function fixture(quantities = [1, 1]) {
  const latest = { id: "inbound", direction: "inbound", text_content: "oi, tudo bem?", occurred_at: "2026-09-12T21:15:00Z", payload: {} };
  const context = { organization: { id: "store" }, conversationId: "conversation", instance: { id: "instance" },
    agent: { id: "agent" }, salesCatalog: items, salesCatalogOrders: [], messages: [latest],
    lead: { id: "lead", metadata: { delivery_address: "Rua das Flores, 42, Centro, Florianópolis", delivery_cep: "88010-000",
      checkout_cart_draft: { organization_id: "store", conversation_id: "conversation", instance_id: "instance", updated_at: "2026-09-12T21:14:00Z",
        items: items.map((item, index) => ({ id: item.id, quantity: quantities[index] })).filter(row => row.quantity > 0) } } } };
  return { context, input: { context, items, orders: [], settings, userText: latest.text_content } };
}

describe("authoritative cart shipping in conversation context", () => {
  it("quotes the complete saved cart after a greeting, without borrowing an old item's freight", () => {
    const { input } = fixture();
    const result = call<QuoteContext[]>("buildRuntimeSalesCatalogShippingQuoteContext", input);
    expect(result).toHaveLength(1);
    expect(result[0].itemId).toBe("current_cart");
    expect(result[0].quotes[0].price).toBe("R$ 0,00");
    expect(result[0].quotes[0].notes).toContain("800");
  });
  it("counts all quantities when crossing the free freight threshold", () => {
    const { input } = fixture([2, 0]);
    expect(call<QuoteContext[]>("buildRuntimeSalesCatalogShippingQuoteContext", input)[0].quotes[0].price).toBe("R$ 0,00");
  });
  it("restores the configured fee when the cart is below the threshold", () => {
    const { input } = fixture([1, 0]);
    expect(call<QuoteContext[]>("buildRuntimeSalesCatalogShippingQuoteContext", input)[0].quotes[0].price).toBe("70");
  });
  it("does not inherit a different conversation's cart", () => {
    const { input, context } = fixture();
    context.lead.metadata.checkout_cart_draft.conversation_id = "other-conversation";
    expect(call("buildRuntimeSalesCatalogShippingQuoteContext", input)).toEqual([]);
  });
  it("does not carry an old quote into an explicitly new purchase", () => {
    const { input } = fixture();
    input.userText = "quero fazer um novo pedido";
    expect(call("buildRuntimeSalesCatalogShippingQuoteContext", input)).toEqual([]);
  });
  it("keeps custom freight unresolved even with a high subtotal", () => {
    const { input } = fixture();
    input.context.salesCatalog = items.map(item => ({ ...item, shipping: { ...item.shipping, profile: "custom" } }));
    expect(call<QuoteContext[]>("buildRuntimeSalesCatalogShippingQuoteContext", input)[0].quotes[0].price).toBe("A combinar");
  });
  it("gives the conversation model the configured automatic threshold", () => {
    const lines = call<string[]>("buildSalesCatalogShippingPolicyLines", settings).join("\n");
    expect(lines).toContain("800");
    expect(lines).toContain("carrinho completo");
    expect(lines).toContain("SC");
  });
  it.each(["top pode fechar obrigado por tirar o frete pode fechar", "quero alterar nada não so estou agradecendo pelo frete gratis", "não remova a pizza", "se eu tirar a pizza?"])("preserves the existing cart after an ordinary or nonauthorizing comment: %s", text => {
    expect(call("isRuntimeCheckoutDraftChange", text, fixture().context)).toBe(false);
  });
  it.each(["adicione mais uma pizza", "adicione limonada", "remova a pizza de queijo", "reduza a pizza de queijo para 1"])("invalidates a previous confirmation after an actual cart change: %s", text => {
    expect(call("isRuntimeCheckoutDraftChange", text, fixture().context)).toBe(true);
  });
  it("does not tell one agent that another agent's checkout was sent", () => {
    const lead = { id: "lead", metadata: { checkout_runtime_state: { stage: "payment_sent", order_id: "other-order",
      organization_id: "store", conversation_id: "other-conversation", instance_id: "other-instance" } } };
    const lines = call<string[]>("buildSalesCatalogCheckoutStateLines", lead, { organizationId: "store", conversationId: "conversation", instanceId: "instance" }).join("\n");
    expect(lines).not.toContain("other-order");
    expect(lines).not.toContain("Última etapa registrada");
  });
  it("preserves the chosen SKU price when calculating a saved cart's free freight", () => {
    const s = fixture([1, 0]);
    const item = { ...items[0], skus: [
      { id: "small", title: "Pizza pequena", skuCode: "PIZ-P", attributes: [], price: "450,00", salePrice: null, status: "active", stockStatus: "in_stock" },
      { id: "large", title: "Pizza grande", skuCode: "PIZ-G", attributes: [], price: "900,00", salePrice: null, status: "active", stockStatus: "in_stock" },
    ] };
    const context = { ...s.context, salesCatalog: [item], lead: { ...s.context.lead, metadata: { ...s.context.lead.metadata,
      checkout_cart_draft: { ...s.context.lead.metadata.checkout_cart_draft, items: [{ id: "pizza", quantity: 1, mention_text: "Pizza grande" }] } } } };
    expect(call<QuoteContext[]>("buildRuntimeSalesCatalogShippingQuoteContext", { ...s.input, context, items: [item] })[0].quotes[0].price).toBe("R$ 0,00");
  });
  it("uses the persisted order subtotal rather than today's base item price", () => {
    const s = fixture();
    const order = { id: "order", companyId: "store", leadId: "lead", conversationId: "conversation", status: "pending_payment", paymentStatus: "pending",
      createdAt: "2026-09-12T21:14:30Z", subtotal: "900,00", destinationCep: "88010000", items: [{ catalogItemId: "pizza", title: "Pizza de queijo", quantity: 1 }] };
    const context = { ...s.context, lead: { ...s.context.lead, metadata: {} }, salesCatalogOrders: [order] };
    expect(call<QuoteContext[]>("buildRuntimeSalesCatalogShippingQuoteContext", { ...s.input, context, orders: [order] })[0].quotes[0].price).toBe("R$ 0,00");
  });
});
