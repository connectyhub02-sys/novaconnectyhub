import { describe, expect, it, vi } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";

const product = { id: "kit", title: "Kit de escritório", tag: "{{produto_kit}}", price: "90,00", currency: "BRL", status: "active",
  salesDestination: "connectyhub_checkout", inventory: { status: "in_stock", allowBackorder: false }, offer: { salePrice: null },
  skus: [], attributes: [], fulfillment: { mode: "physical" }, shipping: { profile: "default", weightGrams: 500 }, media: [], description: "", category: "" };
const address = "Rua das Flores, número 42, Centro, Florianópolis, CEP 88010000";
const msg = (direction: string, text_content: string, minute: number) => ({ id: `message-${minute}`, direction, text_content,
  occurred_at: new Date(Date.UTC(2026, 8, 8, 20, minute)).toISOString(), message_type: "text", payload: {} });
const summary = "Antes de fechar, confirma se o pedido ficou assim:\n- 1x Kit de escritório - R$ 90,00\n- Frete: R$ 0,00\nTotal: R$ 90,00.\nPosso fechar seu pedido e gerar o Pix?";
const legacyRecovery = "Ainda preciso concluir a etapa de pagamento no sistema. Não tenho confirmação de envio do Pix nesta tentativa. Vamos retomar o pedido para disponibilizar o pagamento?";
function fixture(reply = "sim") {
  const context = {
    messages: [msg("outbound", `Tenho um endereço salvo: ${address}. Posso usar esse mesmo endereço?`, 0),
      msg("inbound", "sim esse mesmo", 1), msg("outbound", summary, 2), msg("inbound", "sim", 3),
      msg("inbound", "oi, bom dia", 270), msg("outbound", legacyRecovery, 271), msg("inbound", reply, 272)],
    salesCatalog: [structuredClone(product)], salesCatalogOrders: [] as Record<string, unknown>[],
    salesCatalogShippingSettings: { configured: true, shippingEnabled: true, localPickup: true, localDeliveryEnabled: false,
      localDeliveryZones: [], defaultHandlingDays: 0, rules: [{ uf: "SC", state: "Santa Catarina", active: true,
        price: "10,00", freeShippingThreshold: "80,00", minDays: 1, maxDays: 3, services: [], cepStart: null, cepEnd: null }] },
    organization: { id: "store", name: "Loja teste" }, agent: { id: "agent" }, instance: { id: "instance", metadata: {} },
    conversationId: "conversation", conversationMetadata: {}, run: { id: "run-1" },
    lead: { id: "lead", display_name: "Maria Oliveira", phone_number: "5511999999999", metadata: { person_name: "Maria Oliveira",
      email: "maria@example.test", customer_document: "12345678901", delivery_address: address, delivery_cep: "88010000" } as Record<string, unknown> },
    behavior: { proactiveFollowUp: false, humanInterventionMinutes: 30 }, linkButtons: [], salesCatalogSettings: null,
    credentials: { baseUrl: "https://whatsapp.invalid" },
  };
  const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: context.lead.metadata }],
    conversation_messages: [{ ...context.messages.at(-1), conversation_id: "conversation", whatsapp_instance_id: "instance" }] });
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const createPayment = vi.fn(async () => ({ session: { provider: "asaas", amount: "90,00" },
    checkoutUrl: "https://loja.example/checkout/test", pixQrCode: "000201-TEST-NOT-PAYABLE" }));
  const call = runtimeHarness({ "@/lib/client-os/sales-catalog": { mapSalesCatalogOrder: (row: Record<string, unknown>, items: Record<string, unknown>[]) => ({
    id: row.id, total: row.total, shippingTotal: row.shipping_total, items: items.map(item => ({ catalogItemId: item.catalog_item_id, title: item.title, quantity: item.quantity })),
  }) }, "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment } }, { fetch: async (url: string, init: { body: string }) => {
    requests.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, text: async () => JSON.stringify({ id: `sent-${requests.length}` }) };
  } });
  const send = (text: string) => call<Promise<{ text: string }[]>>("sendAgentResponse", { client: db.client, context, token: "fake", phone: "5511999999999", text });
  return { context, db, requests, createPayment, call, send };
}

describe("checkout recovery after the conversation resumes hours later", () => {
  it.each(["Tô liberando o botão do Pix abaixo para você realizar o pagamento", "Pode clicar no botão abaixo para pagar via Pix", "Seu Pix está disponível no botão abaixo"])("blocks an unsupported payment button claim: %s", text => {
    const { call, context } = fixture();
    expect(call("guardUnexecutedCheckoutClaim", text, context)).toBeTruthy();
  });
  it("recovers the old cart, rechecks the address and total once, then actually sends Pix", async () => {
    const { context, db, requests, createPayment, send } = fixture();
    const replies = await send("Fechado! Pedido confirmado. Tô liberando o botão do Pix abaixo. {{produto_kit}}");
    const text = replies.map(message => message.text).join("\n");
    expect(createPayment).not.toHaveBeenCalled();
    expect(text).toContain("Kit de escritório");
    expect(text).toContain("90,00");
    expect(text).toContain("Rua das Flores");
    expect(text).toContain("Posso usar esse mesmo endereço");
    expect(text).not.toMatch(/liberando o bot[aã]o|clicar no bot[aã]o/i);
    context.messages.push(msg("outbound", text, 273), msg("inbound", "sim, pode mandar o Pix", 274));
    context.run.id = "run-2";
    db.tables.conversation_messages = [{ ...context.messages.at(-1), conversation_id: "conversation", whatsapp_instance_id: "instance" }];
    requests.length = 0;
    await send("Tô liberando o botão do Pix abaixo.");
    expect(createPayment).toHaveBeenCalledOnce();
    expect(db.tables.sales_catalog_orders).toHaveLength(1);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ url: "https://whatsapp.invalid/send/request-payment", body: { pixCode: "000201-TEST-NOT-PAYABLE", amount: 90 } });
  });
  it.each(["mas cadê", "cadê?", "não apareceu o botão", "sim"])("recovers after an unsupported button promise: %s", async reply => {
    const { context, createPayment, send } = fixture(reply);
    context.messages.splice(-1, 0, msg("outbound", "Pode clicar no botão abaixo para pagar via Pix. {{produto_kit}}", 271.5));
    const replies = await send("Pode clicar no botão abaixo para pagar via Pix. {{produto_kit}}");
    expect(replies.map(message => message.text).join("\n")).toContain("Posso usar esse mesmo endereço");
    expect(createPayment).not.toHaveBeenCalled();
  });
  it("recovers a persisted draft when the original messages are no longer loaded", async () => {
    const { context, db, send, createPayment } = fixture();
    await send("Tô liberando o botão do Pix abaixo. {{produto_kit}}");
    expect(db.tables.leads[0].metadata).toHaveProperty("checkout_cart_draft");
    context.messages = [msg("inbound", "me manda o Pix", 550)];
    context.run.id = "run-next-day";
    db.tables.conversation_messages = [{ ...context.messages.at(-1), conversation_id: "conversation", whatsapp_instance_id: "instance" }];
    const replies = await send("Aqui está seu Pix.");
    expect(replies.map(message => message.text).join("\n")).toContain("Kit de escritório");
    expect(replies.map(message => message.text).join("\n")).toContain("Posso usar esse mesmo endereço");
    expect(createPayment).not.toHaveBeenCalled();
  });
  it("quotes current product prices and shipping before obtaining fresh consent", async () => {
    const { context, createPayment, send } = fixture();
    context.salesCatalog[0].price = "100,00";
    context.salesCatalogShippingSettings.rules[0].freeShippingThreshold = "800,00";
    const replies = await send("Pode clicar no botão abaixo para pagar via Pix.");
    const text = replies.map(message => message.text).join("\n");
    expect(text).toContain("100,00");
    expect(text).toContain("10,00");
    expect(text).toContain("Total: R$ 110,00");
    expect(createPayment).not.toHaveBeenCalled();
  });
  it.each(["bom dia", "não quero mais", "sim, mas quanto custa?", "pode mandar o Pix depois"])("does not resume the cart on a greeting, objection or deferred request: %s", async reply => {
    const { send, createPayment } = fixture(reply);
    const replies = await send("Tudo bem, estou por aqui.");
    expect(replies.map(message => message.text).join("\n")).not.toContain("Antes de fechar");
    expect(createPayment).not.toHaveBeenCalled();
  });
  it("does not revive a cancelled cart and clears its durable snapshot", async () => {
    const { context, db, send, createPayment } = fixture();
    await send("Tô liberando o botão do Pix abaixo. {{produto_kit}}");
    context.messages.push(msg("inbound", "cancela esse pedido", 274));
    context.run.id = "cancel";
    db.tables.conversation_messages = [{ ...context.messages.at(-1), conversation_id: "conversation", whatsapp_instance_id: "instance" }];
    await send("Tudo bem.");
    expect(db.tables.leads[0].metadata).toHaveProperty("checkout_cart_draft", null);
    context.messages = [msg("inbound", "me manda o Pix", 550)];
    context.run.id = "after-cancel";
    db.tables.conversation_messages = [{ ...context.messages.at(-1), conversation_id: "conversation", whatsapp_instance_id: "instance" }];
    const replies = await send("Pode clicar no botão abaixo para pagar via Pix.");
    expect(replies.map(message => message.text).join("\n")).toContain("me confirma os produtos e as quantidades");
    expect(createPayment).not.toHaveBeenCalled();
  });
  it("does not reuse the durable draft in another conversation", async () => {
    const { context, db, send, createPayment } = fixture();
    await send("Tô liberando o botão do Pix abaixo. {{produto_kit}}");
    context.messages = [msg("inbound", "me manda o Pix", 550)];
    context.conversationId = "another-conversation";
    context.run.id = "another-run";
    db.tables.conversation_messages = [{ ...context.messages.at(-1), conversation_id: "another-conversation", whatsapp_instance_id: "instance" }];
    const replies = await send("Aqui está seu Pix.");
    expect(replies.map(message => message.text).join("\n")).not.toContain("Kit de escritório");
    expect(createPayment).not.toHaveBeenCalled();
  });
  it("does not recover only part of an unavailable cart", async () => {
    const { context, send, createPayment } = fixture();
    context.salesCatalog[0].status = "inactive";
    const replies = await send("Tô liberando o botão do Pix abaixo.");
    expect(replies.map(message => message.text).join("\n")).toContain("me confirma os produtos e as quantidades");
    expect(createPayment).not.toHaveBeenCalled();
  });
  it.each(["active", "inactive"])("does not send a different old order when the expired cart contains an %s item", async status => {
    const { context, call, db, createPayment, requests } = fixture("me manda o Pix");
    context.salesCatalog[0].status = status;
    context.salesCatalogOrders = [{ id: "different-order", status: "pending", paymentStatus: "pending", total: "50,00",
      createdAt: msg("inbound", "", -1000).occurred_at, updatedAt: msg("inbound", "", -1000).occurred_at,
      checkoutConfirmedAt: msg("inbound", "", -1000).occurred_at, latestPaymentSessionId: "old-session",
      items: [{ catalogItemId: "another-product", quantity: 1 }] }];
    const result = await call("maybeSendExistingSalesCatalogCheckoutLink", { client: db.client, context, token: "fake",
      phone: "5511999999999", userText: "me manda o Pix", latestInbound: context.messages.at(-1) });
    expect(result).toBeNull();
    expect(createPayment).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  });
});
