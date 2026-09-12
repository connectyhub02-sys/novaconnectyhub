import { describe, expect, it, vi } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";

type Row = Record<string, unknown>;
const savedAddress = "Rua das Flores, numero 42, Centro, Balneario Camboriu, SC, CEP 88330786";
const product = (id: string, title: string, price: string) => ({ id, title, price, tag: `{{produto_${id}}}`, currency: "BRL", status: "active",
  salesDestination: "connectyhub_checkout", inventory: { status: "in_stock", allowBackorder: false }, offer: { salePrice: null },
  skus: [], attributes: [], fulfillment: { mode: "physical" }, shipping: { profile: "default", weightGrams: 500 }, media: [], description: "", category: "" });

function scenario(summary = "Resumindo seu pedido: 2 Pizza de queijo e 1 Limonada.\nTotal: R$ 130,00 com entrega no seu endereço.") {
  let tick = 0;
  const start = Date.now() - 600000;
  const message = (direction: string, text_content: string) => ({ id: `message-${++tick}`, direction, text_content, message_type: "text", payload: {},
    conversation_id: "luna-conversation", whatsapp_instance_id: "luna-instance", occurred_at: new Date(start + tick * 10000).toISOString() });
  const oldOrder = { id: "gustavo-order", organization_id: "store", lead_id: "lead", conversation_id: "gustavo-conversation", total: "70,00",
    status: "pending_payment", payment_status: "pending", metadata: { preferred_payment_method: "pix" }, created_at: new Date(start - 3600000).toISOString() };
  const ctx = { messages: [message("inbound", "preciso de duas pizzas de queijo e uma limonada"),
    message("outbound", `Posso mandar para o seu endereço cadastrado, ${savedAddress}? Você prefere Pix ou cartão?`),
    message("inbound", "sim no mesmo endereço"), message("inbound", "cartão"),
    message("outbound", summary), message("outbound", "Posso fechar seu pedido e gerar o link do cartão de crédito agora?"), message("inbound", "sim pode")],
    salesCatalog: [product("pizza", "Pizza de queijo", "60,00"), product("lemonade", "Limonada", "10,00")],
    salesCatalogOrders: [{ id: oldOrder.id, companyId: "store", leadId: "lead", conversationId: oldOrder.conversation_id,
      createdAt: oldOrder.created_at, status: "pending_payment", paymentStatus: "pending", total: oldOrder.total,
      items: [{ catalogItemId: "pizza", title: "Pizza de queijo", quantity: 1 }] }],
    salesCatalogShippingSettings: { configured: true, shippingEnabled: true, localPickup: false, localDeliveryEnabled: false, localDeliveryZones: [], defaultHandlingDays: 0,
      rules: [{ uf: "SC", state: "Santa Catarina", active: true, price: "10,00", freeShippingThreshold: null, minDays: 1, maxDays: 2, services: [], cepStart: null, cepEnd: null }] },
    organization: { id: "store", name: "Pizzaria de teste", plan_code: "pro" }, agent: { id: "luna-agent" }, instance: { id: "luna-instance", metadata: {} },
    conversationId: "luna-conversation", conversationMetadata: {}, run: { id: "run" },
    lead: { id: "lead", display_name: "Maria Oliveira", metadata: { address: savedAddress, cep: "88330786", person_name: "Maria Oliveira", email: "cliente@example.com", cpf_cnpj: "12345678901" } as Row },
    behavior: { proactiveFollowUp: false }, linkButtons: [], salesCatalogSettings: null, credentials: { baseUrl: "https://whatsapp.invalid" } };
  const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: ctx.lead.metadata }], sales_catalog_orders: [oldOrder], sales_catalog_order_items: [] });
  const requests: { url: string; body: Row }[] = [];
  const refreshFinance = vi.fn();
  const createPayment = vi.fn(async (input: { amount: string; orderId: string; preferredMethod: string }) => ({ session: { provider: "asaas", amount: input.amount },
    checkoutUrl: `https://loja.example/checkout/${input.orderId}`, pixQrCode: null }));
  const call = runtimeHarness({
    "@/lib/sales-catalog/payment-reviews": { getLeadPaymentReviews: async () => [], refreshLeadOrderFinance: refreshFinance, loadOrderFinancialSummary: async () => new Map() },
    "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment },
    "@/lib/client-os/sales-catalog": { mapSalesCatalogOrder: (row: Row, items: Row[]) => ({
      id: row.id, companyId: row.organization_id, leadId: row.lead_id, conversationId: row.conversation_id,
      status: row.status, paymentStatus: row.payment_status, total: row.total, subtotal: row.subtotal,
      destinationCep: row.destination_cep, destinationAddress: row.destination_address, shippingTotal: row.shipping_total,
      shippingMethod: row.shipping_method, customerName: row.customer_name, customerEmail: row.customer_email, customerDocument: row.customer_document,
      items: items.map(item => ({ catalogItemId: item.catalog_item_id, title: item.title, quantity: item.quantity, fulfillment: item.fulfillment })),
    }) },
  }, { fetch: async (url: string, init: { body: string }) => { requests.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => JSON.stringify({ id: `delivery-${requests.length}` }) }; } });
  async function reply(text: string) {
    db.tables.conversation_messages = [...ctx.messages];
    const result = await call<Promise<{ text: string }[]>>("sendAgentResponse", { client: db.client, context: ctx, token: "fake", phone: "5500000000000", text });
    ctx.messages.push(message("outbound", result.map(row => row.text).join("\n\n")));
    return result.map(row => row.text).join("\n\n");
  }
  function inbound(text: string) { ctx.messages.push(message("inbound", text)); ctx.run.id = `run-${tick}`; }
  return { ctx, db, oldOrder, requests, call, createPayment, refreshFinance, reply, inbound };
}

describe("natural conversation reaches a real checkout action", () => {
  it.each(["Show, Maria! Já estou gerando o checkout no cartão.", "Show, Maria!"])("uses the confirmed cart even when the model only replies: %s", async replyText => {
    const s = scenario();
    const corrected = await s.reply("Show, Maria! Já estou gerando o checkout no cartão.\n\n{{produto_pizza}}\n{{produto_lemonade}}");
    expect(corrected).toContain("2x Pizza de queijo");
    expect(corrected).toContain("1x Limonada");
    expect(corrected).toContain("140,00");
    expect(s.createPayment).not.toHaveBeenCalled();
    expect(s.db.tables.sales_catalog_orders).toEqual([s.oldOrder]);
    s.inbound("sim pode");
    const final = await s.reply(replyText);
    expect(final).not.toBe("Show, Maria!");
    expect(s.createPayment).toHaveBeenCalledOnce();
    expect(s.createPayment.mock.calls[0][0]).toMatchObject({ amount: "140,00", preferredMethod: "card" });
    expect(s.db.tables.sales_catalog_orders).toHaveLength(2);
    expect(s.db.tables.sales_catalog_orders.find(row => row.id === "gustavo-order")).toEqual(s.oldOrder);
    const created = s.db.tables.sales_catalog_orders.find(row => row.id !== "gustavo-order")!;
    expect(created).toMatchObject({ conversation_id: "luna-conversation", total: "140,00", destination_cep: "88330786" });
    expect(s.db.tables.sales_catalog_order_items.map(row => [row.catalog_item_id, row.quantity])).toEqual([["pizza", 2], ["lemonade", 1]]);
    expect(s.requests.at(-1)?.url).toContain("/send/menu");
  });

  it.each([
    "Resumindo seu pedido: 2 Pizza de queijo e 1 produto inexistente.\nTotal: R$ 130,00.",
    "Resumindo seu pedido: 2 Pizza de queijo e Limonada.\nTotal: R$ 130,00.",
  ])("does not silently omit an unresolved product or count from a prose summary: %s", async summary => {
    const s = scenario(summary);
    const result = await s.reply("Show, Maria! Já estou gerando seu checkout.");
    expect(result).toMatch(/confirmar os produtos|quantidades|nome e a versão/i);
    expect(s.createPayment).not.toHaveBeenCalled();
    expect(s.db.tables.sales_catalog_orders).toEqual([s.oldOrder]);
  });

  it.each([
    "Resumo do pedido: duas Pizza de queijo e uma Limonada.\nTotal: R$ 130,00.",
    "Resumindo seu pedido: 2 Pizza de queijo\n1 Limonada\nTotal: R$ 130,00.",
  ])("retains counts written as words or across lines: %s", async summary => {
    const s = scenario(summary);
    const result = await s.reply("Vou gerar seu checkout.");
    expect(result).toContain("2x Pizza de queijo");
    expect(result).toContain("1x Limonada");
    expect(result).toContain("140,00");
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it("keeps a concrete pending step after filtering an unsupported payment promise", () => {
    const s = scenario("Os itens já estão separados. Total de R$ 130,00.");
    const text = s.call<string>("buildUnexecutedCheckoutReply", "Show, Maria! Já estou gerando o checkout no cartão.", s.ctx, "sim pode");
    expect(text).toMatch(/não consegui|preciso conferir/i);
    expect(text).not.toBe("Show, Maria!");
  });

  it("does not refresh another conversation's payment when this customer merely chooses card", async () => {
    const s = scenario();
    await s.call("handleLeadFinancialEvidence", { client: s.db.client, context: s.ctx, latestInbound: s.ctx.messages.at(-1), userText: "cartão", token: "fake", phone: "5500000000000" });
    expect(s.refreshFinance).not.toHaveBeenCalled();
    expect(s.db.tables.sales_catalog_orders).toEqual([s.oldOrder]);
  });
});

describe("the provider response must finish before becoming a customer preview", () => {
  it("does not cache or send a product list truncated by the shared thinking/output budget", () => {
    const call = runtimeHarness();
    const result = call<string>("extractCompleteGeminiAgentText", { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "2x Pizza de queijo\n1" }] } }] });
    expect(result).toContain("incompleta");
    expect(result).not.toContain("2x Pizza");
  });

  it("keeps complete provider text intact", () => {
    const call = runtimeHarness();
    expect(call("extractCompleteGeminiAgentText", { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Posso confirmar os produtos?" }] } }] })).toBe("Posso confirmar os produtos?");
    expect(call("buildAgentResponseGenerationConfig", "gemini-3.6-flash")).toMatchObject({ maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "LOW" } });
  });
});
