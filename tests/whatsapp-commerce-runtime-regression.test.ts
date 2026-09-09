import { describe, expect, it, vi } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";

const product = (id: string, title: string, price = "39,90") => ({
  id, title, tag: `{{produto_${id}}}`, price, currency: "BRL", status: "active", salesDestination: "connectyhub_checkout",
  inventory: { status: "in_stock", allowBackorder: false }, offer: { salePrice: null }, skus: [], attributes: [],
  fulfillment: { mode: "digital" }, media: [], description: "", category: "", platformProductCode: null,
});
const pizza = product("pizza", "Pizza Margherita");
const bebida = product("bebida", "Suco de Laranja", "12,90");
const message = (direction: string, text_content: string, minute: number) => ({
  id: `message-${minute}`, direction, text_content, occurred_at: new Date(Date.UTC(2026, 8, 5, 12, minute)).toISOString(),
  message_type: "text", payload: {},
});
type Selection = { item: { id: string }; quantity: number };
const context = (messages: ReturnType<typeof message>[]) => ({
  messages, salesCatalog: [pizza, bebida], salesCatalogOrders: [], salesCatalogShippingSettings: null,
  organization: { id: "store" }, agent: { id: "agent" }, instance: { metadata: {} }, conversationId: "conversation", run: { id: "run" },
  lead: { id: "lead", display_name: null as string | null, metadata: {} as Record<string, unknown> },
});

describe("WhatsApp commerce regression: real runtime decisions", () => {
  it("saves the card billing address even for a service without physical delivery", async () => {
    const latest = message("inbound", "Rua Exemplo, número 61, Centro, Florianópolis, CEP 88000-000", 2);
    const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: {} }] });
    const ctx = context([latest]);
    const call = runtimeHarness();
    await call("maybePersistSalesCatalogLeadContactDetailsFromMessage", { client: db.client, context: ctx, userText: latest.text_content });
    expect(db.tables.leads[0].metadata).toMatchObject({ billing_cep: "88000000", billing_address: expect.stringContaining("61") });
    expect(ctx.lead.metadata).toMatchObject({ billing_cep: "88000000" });
  });
  it.each([false, true])("keeps billing details when address and postal code arrive separately (postal first: %s)", async postalFirst => {
    const texts = ["Rua Exemplo, número 61, Centro, Florianópolis", "Meu CEP é 88000-000"];
    if (postalFirst) texts.reverse();
    const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: {} }] });
    const ctx = context([]);
    const call = runtimeHarness();
    for (const [index, text] of texts.entries()) {
      ctx.messages.push(message("inbound", text, index));
      await call("maybePersistSalesCatalogLeadContactDetailsFromMessage", { client: db.client, context: ctx, userText: text });
    }
    expect(ctx.lead.metadata).toMatchObject({ billing_cep: "88000000", billing_address: texts.find(text => text.startsWith("Rua")) });
    expect(call<string[]>("buildSalesCatalogCheckoutStateLines", ctx.lead).join("\n")).toContain("CEP ja informado: 88000000");
  });
  it("resends the internal tracked card checkout after the hosted gateway checkout has been created", async () => {
    const latest = message("inbound", "Me manda o link do cartão de novo", 3);
    const db = commerceDatabase({
      sales_catalog_payment_sessions: [{ id: "session", organization_id: "store", order_id: "order", method: "card", provider: "asaas", amount: "573,80", checkout_url: "https://asaas.example/checkout/hosted", metadata: { preferred_payment_method: "card", public_checkout_url: "https://loja.example/checkout/session", public_checkout_tracking_url: "https://loja.example/r/internal", checkout_tracking_url: "https://loja.example/r/provider" } }],
      conversation_messages: [{ ...latest, conversation_id: "conversation" }],
    });
    const createPayment = vi.fn();
    const requests: Record<string, unknown>[] = [];
    const call = runtimeHarness({ "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment } }, { fetch: async (_url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body));
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "delivery" }) };
    } });
    const ctx = { ...context([message("outbound", "Gerei o checkout do cartão", 2), latest]), instance: { id: "instance", metadata: {} }, behavior: {}, credentials: { baseUrl: "https://whatsapp.invalid" },
      salesCatalogOrders: [{ id: "order", latestPaymentSessionId: "session", items: [{ catalogItemId: "pizza", title: "Pizza Margherita" }], createdAt: "2026-09-04T12:00:00Z", total: "573,80", checkoutConfirmedAt: "2026-09-04T12:00:00Z" }],
    };
    await call("maybeSendExistingSalesCatalogCheckoutLink", { client: db.client, context: ctx, latestInbound: latest, userText: latest.text_content, token: "fake", phone: "5500000000000" });
    expect(createPayment).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    expect((requests[0].choices as string[])[0]).toContain("/r/internal?payment_method=card");
  });
  it.each([
    ["pix", "Tem como pagar no credito", "Posso gerar o link de pagamento no cartão para você?", "Sim me manda por favor", "card"],
    ["card", "Dá para pagar com Pix?", "Posso gerar o código Pix para você?", "pode mandar", "pix"],
  ])("keeps the method offered before a generic confirmation from %s to %s", async (oldMethod, question, offer, confirmation, preferredMethod) => {
    const latest = message("inbound", confirmation, 6);
    const db = commerceDatabase({
      sales_catalog_payment_sessions: [{ id: "session", organization_id: "store", order_id: "order", method: oldMethod, provider: "asaas", amount: "573,80", checkout_url: "https://loja.example/checkout/old", metadata: { preferred_payment_method: oldMethod }, pix_qr_code: null }],
      conversation_messages: [{ ...latest, conversation_id: "conversation" }],
    });
    const createPayment = vi.fn(async () => ({ session: { provider: "asaas", amount: "573,80" }, checkoutUrl: "https://loja.example/checkout/new", trackingUrl: "https://loja.example/r/tracked", pixQrCode: preferredMethod === "pix" ? "test-pix" : null }));
    const requests: Record<string, unknown>[] = [];
    const call = runtimeHarness({ "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment } }, { fetch: async (_url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body));
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "delivery" }) };
    } });
    const ctx = { ...context([message("inbound", question, 4), message("outbound", offer, 5), latest]),
      instance: { id: "instance", metadata: {} }, behavior: {}, credentials: { baseUrl: "https://whatsapp.invalid" },
      salesCatalogOrders: [{ id: "order", latestPaymentSessionId: "session", items: [{ catalogItemId: "pizza", title: "Pizza Margherita" }], createdAt: "2026-09-04T12:00:00Z", updatedAt: "2026-09-04T12:00:00Z", total: "573,80", checkoutConfirmedAt: "2026-09-04T12:00:00Z" }],
    };
    const result = await call<{ text: string }>("maybeSendExistingSalesCatalogCheckoutLink", { client: db.client, context: ctx, latestInbound: latest, userText: confirmation, token: "fake", phone: "5500000000000" });
    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ orderId: "order", preferredMethod, amount: "573,80" }));
    expect(requests).toHaveLength(1);
    expect(result.text).not.toContain("não consegui");
    expect((requests[0].choices as string[])[0]).toContain(preferredMethod === "card" ? "/r/tracked?payment_method=card" : "test-pix");
  });
  it("captures the explicit name when the billing reply starts with Pix on its own line", () => {
    const call = runtimeHarness();
    expect(call("extractRuntimeCustomerNameFromStructuredReply", "Pix\nMaria Pereira Dias\ncliente@example.test\n12345678909\nRua Exemplo, 10, CEP 88000000")).toBe("Maria Pereira Dias");
    expect(call("extractRuntimeCustomerNameFromStructuredReply", "Nome completo: João de Sá\nCPF: 12345678909")).toBe("João de Sá");
    expect(call("extractRuntimeCustomerNameFromStructuredReply", "Qual o valor\ncliente@example.test")).toBeNull();
  });
  it.each([["card", "Pix", "pix"], ["pix", "Cartão", "card"]])("switches an existing %s checkout to %s using the same order", async (oldMethod, reply, preferredMethod) => {
    const latest = message("inbound", reply, 2);
    const db = commerceDatabase({
      sales_catalog_payment_sessions: [{ id: "session", organization_id: "store", order_id: "order", method: oldMethod, provider: "asaas", amount: "52,80", checkout_url: "https://loja.example/checkout/existing", metadata: { preferred_payment_method: oldMethod }, pix_qr_code: oldMethod === "pix" ? "pix-antigo" : null }],
      conversation_messages: [{ ...latest, conversation_id: "conversation", whatsapp_instance_id: "instance" }],
    });
    const createPayment = vi.fn(async () => ({ session: { provider: "asaas", amount: "52,80" }, checkoutUrl: "https://loja.example/checkout/updated", pixQrCode: preferredMethod === "pix" ? "pix-atual" : null }));
    const requests: Record<string, unknown>[] = [];
    const call = runtimeHarness({ "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment } }, { fetch: async (_url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body));
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "fake-delivery" }) };
    } });
    const ctx = { ...context([message("outbound", "Gerei o checkout para finalizar pedido", 1), latest]),
      instance: { id: "instance", metadata: {} }, behavior: {}, credentials: { baseUrl: "https://whatsapp.invalid" },
      salesCatalogOrders: [{ id: "order", latestPaymentSessionId: "session", status: "pending_payment", paymentStatus: "pending", items: [{ catalogItemId: "pizza", title: "Pizza Margherita" }], updatedAt: message("outbound", "", 1).occurred_at, total: "52,80", checkoutConfirmedAt: message("outbound", "", 1).occurred_at }],
    };
    await call("maybeSendExistingSalesCatalogCheckoutLink", { client: db.client, context: ctx, latestInbound: latest, userText: reply, token: "fake", phone: "5500000000000" });
    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ orderId: "order", preferredMethod }));
    expect(requests).toHaveLength(1);
    expect((requests[0].choices as string[])[0]).toContain(preferredMethod === "pix" ? "pix-atual" : "payment_method=card");
  });

  it("treats already-sent data as payment recovery, only in an active checkout context", () => {
    const call = runtimeHarness();
    const latest = message("inbound", "Mas eu já te passei", 2);
    expect(call("isSalesCatalogPaymentLinkFollowUp", latest.text_content, [message("outbound", "Antes de gerar o pagamento, preciso confirmar seus dados", 1), latest], latest)).toBe(true);
    expect(call("isSalesCatalogPaymentLinkFollowUp", latest.text_content, [latest], latest)).toBe(false);
  });

  it("keeps configured niche restrictions even when a stored generic prompt exists", () => {
    const call = runtimeHarness();
    const lines = call<string[]>("buildConfiguredNicheCareLines", { prompt: "Atendimento genérico", metadata: { prompt_builder_config: { templateId: "academia_suplementos", neverRules: "Não prescreva protocolos." } } });
    expect(lines.join("\n")).toContain("Nao prescreva dose, ciclo, tratamento ou uso medico.");
    expect(lines.join("\n")).toContain("Não prescreva protocolos.");
  });

  it.each(["pix", "card"])("carries customer data and the accepted cart into one %s payment action", async (method) => {
    const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: {} }] });
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const createPayment = vi.fn(async () => {
      const order = db.tables.sales_catalog_orders[0];
      expect(order).toMatchObject({ customer_name: "Maria Oliveira", customer_email: "cliente@example.com", customer_document: "12345678901", total: "52,80" });
      return { session: { provider: "asaas", amount: "52,80" }, checkoutUrl: "https://loja.example/checkout/teste", pixQrCode: method === "pix" ? "000201pix-ficticio" : null };
    });
    const call = runtimeHarness({
      "@/lib/client-os/sales-catalog": {
        mapSalesCatalogOrder: (row: Record<string, unknown>, items: Record<string, unknown>[]) => ({
          id: row.id, conversationId: row.conversation_id, customerName: row.customer_name, customerEmail: row.customer_email,
          customerDocument: row.customer_document, items: items.map(item => ({ catalogItemId: item.catalog_item_id, title: item.title, quantity: item.quantity, fulfillment: item.fulfillment })),
        }),
      },
      "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment },
    }, { fetch: async (url: string, init: { body: string }) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "fake-whatsapp-message" }) };
    } });
    const ctx = { ...context([
      message("inbound", "Maria Oliveira\ncliente@example.com\n12345678901", 0),
      message("outbound", "Antes de fechar, confirma se o pedido ficou assim:\n- 1x Pizza Margherita - R$ 39,90\n- 1x Suco de Laranja - R$ 12,90\nTotal: R$ 52,80.\nPosso fechar seu pedido e gerar o pagamento?", 1),
      message("inbound", "Sim", 2),
      message("outbound", "Perfeito, pedido confirmado. Qual forma de pagamento você prefere: Pix ou cartão de crédito?", 3),
      message("inbound", method === "pix" ? "Pix" : "Cartão", 4),
    ]), behavior: { proactiveFollowUp: false }, linkButtons: [], instance: { id: "instance", metadata: {} }, salesCatalogSettings: null, credentials: { baseUrl: "https://whatsapp.invalid" } };
    await call("maybePersistSalesCatalogLeadContactDetailsFromMessage", { client: db.client, context: ctx, userText: ctx.messages.at(-1)?.text_content });
    db.tables.conversation_messages = [{ ...ctx.messages.at(-1), conversation_id: "conversation", whatsapp_instance_id: "instance" }];
    const outbound = await call<unknown[]>("sendAgentResponse", { client: db.client, context: ctx, token: "fake", phone: "5500000000000", text: "Pedido confirmado. Me envie seu nome e CPF novamente. Quer mais um Suco de Laranja?" });
    expect(outbound).toHaveLength(1);
    expect(db.tables.sales_catalog_orders).toHaveLength(1);
    expect(db.tables.sales_catalog_order_items.map(row => [row.catalog_item_id, row.quantity])).toEqual([["pizza", 1], ["bebida", 1]]);
    expect(createPayment).toHaveBeenCalledOnce();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://whatsapp.invalid/send/menu");
    const choice = (requests[0].body.choices as string[])[0];
    expect(choice).toContain(method === "pix" ? "000201pix-ficticio" : "/checkout/teste?payment_method=card");
    expect(requests[0].body.text).not.toMatch(/me envie|nome completo|cpf|e-mail/i);
  });

  it.each([
    ["sales_catalog_orders", "select"],
    ["sales_catalog_order_items", "insert"],
  ])("does not create a payment when %s %s fails", async (table, operation) => {
    const db = commerceDatabase({}, { table, operation });
    const createPayment = vi.fn();
    const call = runtimeHarness({ "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment } });
    const ctx = { ...context([
      message("outbound", "Antes de fechar, confirma se o pedido ficou assim:\n- 1x Pizza Margherita - R$ 39,90\nTotal: R$ 39,90.\nPosso fechar seu pedido e gerar o pagamento?", 0),
      message("inbound", "Sim, Pix", 1),
    ]), behavior: { proactiveFollowUp: false }, salesCatalogSettings: null };
    ctx.lead.display_name = "Maria Oliveira";
    ctx.lead.metadata = { person_name: "Maria Oliveira", email: "cliente@example.com", customer_document: "12345678901" };
    await expect(call<Promise<unknown>>("recordSalesCatalogOrderIntent", {
      client: db.client, context: ctx, items: [], text: "Pedido confirmado", intentText: "Sim, Pix",
    })).rejects.toThrow("Simulated database failure");
    expect(createPayment).not.toHaveBeenCalled();
    if (operation === "insert") expect(db.tables.sales_catalog_orders[0].status).toBe("needs_human");
    else expect(db.tables.sales_catalog_orders).toHaveLength(0);
  });

  it("keeps the accepted two-item cart after an older one-item delivery prompt", () => {
    const call = runtimeHarness();
    const ctx = context([
      message("outbound", "Antes de fechar, preciso do endereço de entrega desse pedido:\n- 1x Pizza Margherita\nMe envie rua, número e CEP.", 0),
      message("inbound", "Quero algo para beber também", 1),
      message("outbound", "Quer montar o pedido com Pizza Margherita e Suco de Laranja juntos?", 2),
      message("inbound", "Sim", 3),
      message("outbound", "O resumo do seu pedido fica assim:\n1x Pizza Margherita - R$ 39,90\n1x Suco de Laranja - R$ 12,90\nTotal: R$ 52,80", 4),
      message("inbound", "Sim", 5),
      message("outbound", "Me envia seu endereço completo", 6),
      message("inbound", "Rua das Flores, 42, Centro, São Paulo, CEP 01001000", 7),
    ]);
    const selections = call<Selection[]>("resolveSalesCatalogOrderSelections", { context: ctx, currentItems: [], responseText: "", intentText: ctx.messages.at(-1)?.text_content });
    expect(selections.map(s => s.item.id)).toEqual(["pizza", "bebida"]);
    expect(selections.map(s => s.quantity)).toEqual([1, 1]);
  });

  it("invalidates an old payment preview when a new cart is proposed", () => {
    const call = runtimeHarness();
    const ctx = context([
      message("outbound", "Antes de fechar, confirma o pedido:\n- 1x Pizza Margherita\nTotal: R$ 39,90\nPosso fechar e gerar o pagamento?", 0),
      message("inbound", "Também quero uma bebida", 1),
      message("outbound", "Quer montar o pedido com Pizza Margherita e Suco de Laranja juntos?", 2),
      message("inbound", "Sim", 3),
    ]);
    expect(call("hasRecentSalesCatalogCheckoutConfirmation", ctx, "Sim")).toBe(false);
    const selections = call<Selection[]>("resolveSalesCatalogOrderSelections", { context: ctx, currentItems: [], responseText: "", intentText: "Sim" });
    expect(selections.map(s => s.item.id)).toEqual(["pizza", "bebida"]);
  });

  it("does not buy both alternatives on an ambiguous yes", () => {
    const call = runtimeHarness();
    const ctx = context([
      message("outbound", "Quer montar o pedido com Pizza Margherita ou Suco de Laranja?", 0),
      message("inbound", "Sim", 1),
    ]);
    expect(call("resolveSalesCatalogOrderSelections", { context: ctx, currentItems: [], responseText: "", intentText: "Sim" })).toEqual([]);
  });

  it.each([
    ["Pizza Margherita (R$ 403,67) + Suco de Laranja (R$ 12,90)", 1],
    ["Pizza Margherita (R$403,67) + 2x Suco de Laranja", 2],
    ["Quero 3 Suco de Laranja", 3],
    ["Quero duas unidades Suco de Laranja", 2],
  ])("uses requested quantities without reading cents as units: %s", (text, quantity) => {
    const call = runtimeHarness();
    expect(call<{ quantity: number }>("resolveSalesCatalogMentionQuantity", text, bebida).quantity).toBe(quantity);
  });

  it("recovers lead-authored billing details sent before the checkout preview", async () => {
    const stored: Record<string, unknown> = {};
    const update = vi.fn(async (input) => {
      const patch = input.buildUpdate(stored);
      Object.assign(stored, patch.metadata);
      return patch;
    });
    const call = runtimeHarness({ "@/lib/leads/metadata-update": { updateLeadMetadata: update } });
    const ctx = context([
      message("outbound", "Exemplo de e-mail: errado@example.com", 0),
      message("inbound", "Maria Oliveira\ncliente@example.com\n12345678901", 1),
      message("outbound", "Antes de fechar, confirma o pedido?", 2),
      message("inbound", "Pix", 3),
    ]);
    await call("maybePersistSalesCatalogLeadContactDetailsFromMessage", { context: ctx, client: {}, userText: "Pix" });
    expect(stored).toMatchObject({ email: "cliente@example.com", customer_document: "12345678901", person_name: "Maria Oliveira" });
    expect(ctx.lead.metadata).toMatchObject({ email: "cliente@example.com", customer_document: "12345678901" });
    expect(ctx.lead.display_name).toBe("Maria Oliveira");
  });

  it("a slow AI memory completion preserves newer checkout facts and the confirmed name", async () => {
    const stored = { email: "novo@example.com", customer_document: "12345678901", person_name: "Maria Oliveira", lead_memory: { email: "novo@example.com", cpfCnpj: "12345678901" } };
    const update = vi.fn(async input => input.buildUpdate(stored));
    const call = runtimeHarness({
      "@/lib/leads/metadata-update": { updateLeadMetadata: update },
      "@/lib/billing/gemini-metering": { meterGeminiGenerationUsage: async () => null },
    }, { fetch: async () => ({ ok: true, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ personName: "Nome Antigo", summary: "Aguardando Pix" }) }] } }] }) }) });
    const ctx = { ...context([message("inbound", "Olá", 0), message("outbound", "Oi", 1)]), behavior: { leadMemory: true }, geminiCredentials: { apiKey: "fake", model: "fake" } };
    await call("extractLeadMemory", {}, ctx, "Pix");
    expect(update).toHaveBeenCalledOnce();
    expect(ctx.lead.metadata).toMatchObject({ email: "novo@example.com", customer_document: "12345678901", person_name: "Maria Oliveira", lead_memory: { email: "novo@example.com", cpfCnpj: "12345678901", personName: "Maria Oliveira", summary: "Aguardando Pix" } });
  });
});
