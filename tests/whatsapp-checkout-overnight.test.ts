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
  it("recovers a transcribed resend request whose last complaint ends with não", async () => {
    const { context, db, send, createPayment, requests } = fixture("Cara, manda de novo pra mim aqui que eu não tô conseguindo não. Manda de novo o Pix pra mim aí, o botão do Pix");
    context.messages.at(-1)!.message_type = "AudioMessage";
    const response = (await send("Opa, tranquilo! Deixa eu mandar de novo para você agora mesmo.\n{{produto_kit}}\nAssim que der certo o pagamento, me avisa."))
      .map(message => message.text).join("\n");
    expect(response).toContain("Posso usar esse mesmo endereço");
    expect(response).toContain("Kit de escritório");
    expect(response).not.toContain("Deixa eu mandar");
    expect(createPayment).not.toHaveBeenCalled();
    context.messages.push(msg("outbound", response, 273), msg("inbound", "sim, pode mandar o Pix", 274));
    context.run.id = "audio-recovery-confirmed";
    db.tables.conversation_messages = [{ ...context.messages.at(-1), conversation_id: "conversation", whatsapp_instance_id: "instance" }];
    requests.length = 0;
    await send("Fechado!");
    expect(createPayment).toHaveBeenCalledOnce();
    expect(requests).toHaveLength(1);
    expect(requests[0].body.choices).toEqual(["Copiar Pix|copy:000201-TEST-NOT-PAYABLE"]);
  });
  it("removes the invented button above from a greeting without changing the clone's voice", async () => {
    const { send, createPayment } = fixture("Fala, você tá bom, meu amigo? Como é que tá aí?");
    const response = (await send("Fala! Tudo ótimo por aqui, e com você?\nO botão do Pix tá logo aí em cima. Me avisa assim que fizer!"))
      .map(message => message.text).join("\n");
    expect(response).toBe("Fala! Tudo ótimo por aqui, e com você?");
    expect(createPayment).not.toHaveBeenCalled();
  });
  it.each(["o código Pix", "Pix", "o link do cartão de crédito"])("resumes a fragmented payment request and completes checkout: %s", async reply => {
    const { context, db, requests, createPayment, send } = fixture(reply);
    context.messages.splice(-1, 0, { ...msg("inbound", "me manda o código para eu pagar", 272), id: "payment-request",
      occurred_at: new Date(Date.parse(context.messages.at(-1)!.occurred_at) - 4000).toISOString() });
    const replies = await send("Opa, tá na mão! Pode usar o botão abaixo para pagar. {{produto_kit}}");
    const text = replies.map(message => message.text).join("\n");
    expect(text).toContain("Kit de escritório");
    expect(text).toContain("Posso usar esse mesmo endereço");
    expect(text).not.toContain("Ainda preciso concluir");
    expect(createPayment).not.toHaveBeenCalled();
    const card = reply.includes("cartão");
    context.messages.push(msg("outbound", text, 273), msg("inbound", card ? "sim, cartão de crédito" : "sim, Pix", 274));
    context.run.id = "confirmed-fragmented-turn";
    db.tables.conversation_messages = [{ ...context.messages.at(-1), conversation_id: "conversation", whatsapp_instance_id: "instance" }];
    requests.length = 0;
    await send("Fechado, já vou te passar.");
    expect(createPayment).toHaveBeenCalledOnce();
    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ preferredMethod: card ? "card" : "pix" }));
    expect(db.tables.sales_catalog_orders).toHaveLength(1);
    expect(requests).toHaveLength(1);
    if (card) expect(requests[0].body.choices).toEqual(["Finalizar pedido|https://loja.example/checkout/test?payment_method=card"]);
    else expect(requests[0]).toMatchObject({ url: "https://whatsapp.invalid/send/menu", body: { choices: ["Copiar Pix|copy:000201-TEST-NOT-PAYABLE"] } });
  });
  it.each(["o código Pix", "Pix", "o link do cartão", "me passa o Pix", "mande o código Pix", "me passa o Pix?", "pode me passar o link do cartão?"])("understands contextual payment requests without requiring a particular verb: %s", async reply => {
    const { send, createPayment } = fixture(reply);
    const text = (await send("Já vou te passar.")).map(message => message.text).join("\n");
    expect(text).toContain("Kit de escritório");
    expect(text).toContain("Posso usar esse mesmo endereço");
    expect(createPayment).not.toHaveBeenCalled();
  });
  it.each(["não", "não, espera", "amanhã", "mas quanto demora a entrega?", "tira um item", "quero falar com um atendente"])("lets a later interruption override the payment request: %s", async reply => {
    const { context, send, createPayment } = fixture(reply);
    context.messages.splice(-1, 0, { ...msg("inbound", "sim, pode gerar o Pix", 272), id: "previous-request",
      occurred_at: new Date(Date.parse(context.messages.at(-1)!.occurred_at) - 4000).toISOString() });
    const text = (await send("Certo, vamos ver isso.")).map(message => message.text).join("\n");
    expect(text).toBe("Certo, vamos ver isso.");
    expect(createPayment).not.toHaveBeenCalled();
  });
  it("keeps the clone's greeting when discarding an invented payment promise", async () => {
    const { send, createPayment } = fixture("bom dia");
    const text = (await send("Bom dia! Tudo joia por aí?\n\nTô enviando o botão do Pix aqui novamente.\n\n{{produto_kit}}\n\nAssim que pagar, me avisa."))
      .map(message => message.text).join("\n");
    expect(text).toBe("Bom dia! Tudo joia por aí?");
    expect(createPayment).not.toHaveBeenCalled();
  });
  it.each(["Opa! Como você tá?", "Show, combinado!", "Pode deixar, vou te explicar direitinho."])("preserves ordinary clone responses verbatim: %s", async response => {
    const { send, createPayment } = fixture("bom dia");
    expect((await send(response)).map(message => message.text).join("\n")).toBe(response);
    expect(createPayment).not.toHaveBeenCalled();
  });
  it("preserves the clone's explanation about payment while removing only a false sending claim", async () => {
    const { send, createPayment } = fixture("Pix tem desconto?");
    const text = (await send("No Pix o valor é o mesmo. Tô enviando o botão do Pix.\nO Kit de escritório vem com três peças."))
      .map(message => message.text).join("\n");
    expect(text).toBe("No Pix o valor é o mesmo.\nO Kit de escritório vem com três peças.");
    expect(createPayment).not.toHaveBeenCalled();
  });
  it("does not borrow an old or already answered payment request", () => {
    const { context, call } = fixture("obrigado");
    const latest = context.messages.at(-1)!;
    context.messages.splice(-1, 0, msg("inbound", "pode gerar Pix", 200));
    expect(call("buildSalesCatalogOrderIntentText", latest, "", context)).toBe("obrigado");
    context.messages.splice(-1, 0, { ...msg("inbound", "pode gerar Pix", 272), id: "answered-request",
      occurred_at: new Date(Date.parse(latest.occurred_at) - 4000).toISOString() },
    { ...msg("outbound", "Aqui está o pagamento.", 272), id: "answer",
      occurred_at: new Date(Date.parse(latest.occurred_at) - 2000).toISOString() });
    expect(call("buildSalesCatalogOrderIntentText", latest, "", context)).toBe("obrigado");
  });
  it("keeps an affirmative reply even when the burst starts with a conversational interjection", async () => {
    const { context, db, createPayment, send } = fixture("o código Pix");
    const text = (await send("Já vou te passar.")).map(message => message.text).join("\n");
    context.messages.push(msg("outbound", text, 273),
      { ...msg("inbound", "meu fi", 274), occurred_at: new Date(Date.parse(msg("inbound", "", 274).occurred_at) - 4000).toISOString() },
      { ...msg("inbound", "sim", 274), id: "affirmation" });
    context.run.id = "affirmed";
    db.tables.conversation_messages = [{ ...context.messages.at(-1), conversation_id: "conversation", whatsapp_instance_id: "instance" }];
    await send("Fechado!");
    expect(createPayment).toHaveBeenCalledOnce();
  });
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
    expect(requests[0]).toMatchObject({ url: "https://whatsapp.invalid/send/menu", body: { choices: ["Copiar Pix|copy:000201-TEST-NOT-PAYABLE"] } });
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
