import { describe, expect, it, vi } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";
import { extractFoodConversationProposal, foodConversationInstructions } from "@/lib/sales-catalog/food-conversation";
import { quoteFoodComposition, type FoodCompositionPolicy, type FoodUnitSelection } from "@/lib/sales-catalog/food-composition";
const policy: FoodCompositionPolicy = { enabled: true, pricing: "fixed", localOnly: true,
  sizes: [{ id: "regular", name: "Normal", active: true, portions: 1, maxFlavors: 1, price: "30" }], flavors: [],
  groups: [{ id: "extra", name: "Adicional", min: 0, max: 2, scope: "unit", options: [{ id: "bacon", name: "Bacon", active: true, price: "5", maxQuantity: 2 }] }] };
const units: FoodUnitSelection[] = [{ sizeId: "regular", flavors: [], options: [], note: "Sem cebola" }, { sizeId: "regular", flavors: [], options: [{ groupId: "extra", optionId: "bacon", quantity: 1 }], note: "Sem queijo" }];
const product = { id: "burger", title: "Hambúrguer da casa", tag: "{{produto_burger}}", foodComposition: policy, price: "1", currency: "BRL", status: "active", salesDestination: "connectyhub_checkout",
  inventory: { status: "in_stock", allowBackorder: false }, offer: { salePrice: null }, skus: [], attributes: [], fulfillment: { mode: "physical" }, shipping: { profile: "default", weightGrams: 300 }, media: [], description: "", category: "", platformProductCode: null };
const message = (direction: string, text_content: string, minute: number) => ({ id: `msg-${minute}`, direction, text_content, occurred_at: new Date(Date.UTC(2026, 8, 14, 12, minute)).toISOString(), message_type: "text", payload: {} });
const ctx = () => ({ messages: [message("inbound", "Quero dois Hambúrgueres da casa, o primeiro sem cebola e o segundo com bacon e sem queijo", 0)],
  organization: { id: "store" }, conversationId: "conversation", instance: { id: "instance", metadata: {} }, agent: { id: "agent", metadata: {} }, run: { id: "run" },
  lead: { id: "lead", metadata: {} as Record<string, unknown>, display_name: "Cliente Teste" }, salesCatalog: [product], salesCatalogOrders: [], salesCatalogSettings: null,
  salesCatalogShippingSettings: { shippingEnabled: false, localPickup: true, localDeliveryEnabled: false, localDeliveryZones: [], rules: [] },
  behavior: { proactiveFollowUp: false }, linkButtons: [], credentials: { baseUrl: "https://whatsapp.invalid" } });
const block = () => `<food_order>${JSON.stringify({ items: [{ productId: "burger", units }] })}</food_order>`;
describe("structured food conversation", () => {
  it("recomputes a proposal and strips internal JSON from customer text", () => {
    const result = extractFoodConversationProposal(`Confira o pedido. ${block()}`, [product]);
    expect(result.text).toBe("Confira o pedido."); expect(result.items?.[0].snapshot.totalCents).toBe(6500);
    expect(result.items?.[0].units.map(unit => unit.note)).toEqual(["Sem cebola", "Sem queijo"]);
  });
  it("rejects unknown catalog identifiers and malformed blocks without leaking syntax", () => {
    for (const text of [block().replace('"burger"', '"foreign"'), "Olá <food_order>{truncated", `${block()}${block()}`]) {
      const result = extractFoodConversationProposal(text, [product]); expect(result.items).toBeNull(); expect(result.text).not.toContain("food_order");
    }
  });
  it("bounds prompt size and directs extensive choice lists to the complete builder", () => {
    const large = { ...product, foodComposition: { ...policy, groups: Array(40).fill(policy.groups[0]) } };
    expect(foodConversationInstructions(Array(40).fill(large)).join("\n").length).toBeLessThan(50000);
  });
  it("uses exact unit prices and free notes in the financial rows", () => {
    const call = runtimeHarness();
    const priced = call<Array<Record<string, unknown>>>("priceRuntimeSalesCatalogSelections", [{ item: product, quantity: 2, foodUnits: units }], "", "");
    const rows = call<Array<{ quantity: number; unit_price: string; sale_price: null; metadata: { food_composition: { units: Array<{ note: string }> } } }>>("buildRuntimeSalesCatalogOrderRows", priced, "store", "order");
    expect(rows.map(row => [row.quantity, row.unit_price, row.sale_price])).toEqual([[1, "30,00", null], [1, "35,00", null]]);
    expect(rows.map(row => row.metadata.food_composition.units[0].note)).toEqual(["Sem cebola", "Sem queijo"]);
    expect(() => call("priceRuntimeSalesCatalogSelections", [{ item: product, quantity: 2 }], "", "")).toThrow("cada unidade");
  });
  it("recovers a scoped food draft after the system preview without collapsing units", () => {
    const context = ctx(), snapshot = quoteFoodComposition(policy, units, 2)!;
    context.lead.metadata.checkout_cart_draft = { organization_id: "store", conversation_id: "conversation", instance_id: "instance", updated_at: context.messages[0].occurred_at,
      items: [{ id: product.id, quantity: 2, food_units: units }] };
    context.messages.push(message("outbound", `Antes de fechar, confirma se o pedido ficou assim:\n- 2x Hambúrguer da casa\n${snapshot.summary}\nTotal: R$ 65,00.\nPosso fechar seu pedido e gerar o pagamento?`, 1), message("inbound", "sim", 2));
    const result = runtimeHarness()<Array<{ foodUnits: FoodUnitSelection[]; quantity: number }>>("resolveSalesCatalogOrderSelections", { context, currentItems: [], responseText: "", intentText: "sim" });
    expect(result).toHaveLength(1); expect(result[0].foodUnits).toEqual(units); expect(result[0].quantity).toBe(2);
    context.conversationId = "elsewhere";
    expect(runtimeHarness()<Array<{ foodUnits?: unknown }>>("resolveSalesCatalogOrderSelections", { context, currentItems: [], responseText: "", intentText: "sim" }).every(row => !row.foodUnits)).toBe(true);
  });
  it("persists the recomputed proposal before asking for confirmation without creating a payment", async () => {
    const context = ctx(); context.messages[0].text_content += ", vou retirar na loja";
    const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: {} }], conversation_messages: [{ ...context.messages[0], conversation_id: "conversation", whatsapp_instance_id: "instance" }] });
    const createPayment = vi.fn(), sent: string[] = [];
    const call = runtimeHarness({ "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment } }, { fetch: async (_url: string, init: { body: string }) => {
      sent.push(init.body); return new Response(JSON.stringify({ messageid: "fictional" }), { status: 200 });
    } });
    await call("sendAgentResponse", { client: db.client, context, token: "fake", phone: "550000000000", text: `Confira ${product.tag}. ${block()}` });
    expect(sent.join("\n")).toContain("65,00"); expect(sent.join("\n")).toContain("Sem cebola"); expect(sent.join("\n")).not.toContain("food_order");
    expect(context.lead.metadata.checkout_cart_draft).toMatchObject({ items: [{ id: "burger", quantity: 2, food_units: units }] });
    expect(createPayment).not.toHaveBeenCalled(); expect(db.tables.sales_catalog_orders ?? []).toHaveLength(0);
  });
  it("creates one checkout with separate food rows only after confirmation of its total", async () => {
    const context = ctx(), food = quoteFoodComposition(policy, units, 2)!;
    context.messages[0].text_content += ", vou retirar na loja";
    context.lead.metadata.checkout_cart_draft = { organization_id: "store", conversation_id: "conversation", instance_id: "instance", updated_at: context.messages[0].occurred_at,
      items: [{ id: "burger", quantity: 2, food_units: units, food_snapshot: food }] };
    const preview = runtimeHarness()<string>("buildSalesCatalogOrderConfirmationPrompt", { context, latestInbound: context.messages[0], selections: [{ item: product, quantity: 2, foodUnits: units }], intentText: context.messages[0].text_content });
    context.messages.push(message("outbound", preview, 1), message("inbound", "sim pode fechar no Pix", 2));
    const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: context.lead.metadata }], conversation_messages: [{ ...context.messages[2], conversation_id: "conversation", whatsapp_instance_id: "instance" }] });
    const createPayment = vi.fn(async () => ({ session: { provider: "asaas", amount: "65,00" }, checkoutUrl: "https://fixture.invalid/checkout/fictional", deferred: true, deferredReason: "lead_details_required" }));
    const call = runtimeHarness({ "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment }, "@/lib/client-os/sales-catalog": { mapSalesCatalogOrder: (row: Record<string, unknown>, items: unknown[]) => ({ ...row, id: row.id, items }) } });
    await call("recordSalesCatalogOrderIntent", { client: db.client, context, items: [], text: "", intentText: "sim pode fechar no Pix" });
    expect(db.tables.sales_catalog_orders).toHaveLength(1);
    expect(db.tables.sales_catalog_order_items.map(row => [row.quantity, row.unit_price, row.sale_price])).toEqual([[1, "30,00", null], [1, "35,00", null]]);
    expect(createPayment).toHaveBeenCalledOnce();
    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: "65,00", preferredMethod: "pix" }));
  });
});
