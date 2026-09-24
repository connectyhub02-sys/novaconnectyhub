import { describe, expect, it } from "vitest";
import { scenario, type Outbound, type Row } from "./helpers/order-revision-scenario";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";

type ToolResult = Row & { ok: boolean; motivo?: string; codigo_proposta?: string; resumo?: string };
type Deferred = () => Promise<Outbound>;

function tools(options: Parameters<typeof scenario>[0] = {}) {
  const s = scenario(options);
  s.ctx.instance.metadata = { order_tools: true };
  const deferred: Deferred[] = [];
  const inbound = (text: string) => {
    const message = s.message("inbound", text);
    s.ctx.messages.push(message);
    s.db.tables.conversation_messages = [...s.ctx.messages];
    s.ctx.run.id = `run-${message.id}`;
    return message;
  };
  let latest = inbound("oi");
  const scope = () => s.call<{ order: { id: string } } | null>("resolveOrderToolScope", s.ctx);
  // The runtime resolves the scope once per reply, as runOrderToolTurn does.
  let turnScope: ReturnType<typeof scope> = null;
  const tool = (name: string, args: Row = {}) => s.call<Promise<ToolResult>>("executeOrderTool", {
    client: s.db.client, context: s.ctx, scope: turnScope ??= scope(), latestInbound: latest, token: "fake", phone: "5500000000000", deferred, name, args });
  const say = (text: string) => {
    latest = inbound(text);
    deferred.length = 0;
    turnScope = null;
    (deferred as Deferred[] & { paymentQueued?: boolean }).paymentQueued = false;
  };
  const flush = async () => { const sent: Outbound[] = []; for (const action of deferred.splice(0)) sent.push(await action()); return sent; };
  return { ...s, scope, tool, say, flush, deferred, latest: () => latest };
}

const functionCall = (name: string, args: Row = {}) => ({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ functionCall: { name, args } }] } }] });
const modelText = (text: string) => ({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text }] } }] });

describe("order tools scope", () => {
  it("is off unless the WhatsApp instance enables it", () => {
    const t = tools();
    expect(t.scope()?.order.id).toBe("order");
    t.ctx.instance.metadata = {};
    expect(t.scope()).toBeNull();
  });
  it("leaves the first payment to the billing-data route until it was delivered (Gustavo, 24/09 09:30)", () => {
    const t = tools();
    t.metadata({ checkout_runtime_state: { conversation_id: "conversation", instance_id: "instance", order_id: "order", stage: "payment_data_pending" } });
    expect(t.scope()).toBeNull();
    t.metadata({ checkout_runtime_state: { conversation_id: "conversation", instance_id: "instance", order_id: "order", stage: "payment_sent" } });
    expect(t.scope()?.order.id).toBe("order");
  });
  it("is off while a payment is being processed", () => {
    const t = tools();
    t.ctx.salesCatalogOrders[0].checkoutPaymentLock = "card-attempt";
    expect(t.scope()).toBeNull();
  });
});

describe("editing an open order through tools", () => {
  it("adds a product, sends the official summary and applies it only after the customer's acceptance", async () => {
    const t = tools();
    t.say("coloca uma limonada junto pra eu pagar tudo junto");
    const proposal = await t.tool("propor_alteracao", { itens: [{ produto_id: "pizza", quantidade: 1 }, { produto_id: "lemonade", quantidade: 1 }] });
    expect(proposal).toMatchObject({ ok: true, total: "80,00" });
    expect(proposal.resumo).toContain("Limonada");
    expect(t.persistence).not.toHaveBeenCalled();
    // Accepting in the same turn the proposal was built is refused.
    expect(await t.tool("confirmar_alteracao", { codigo_proposta: proposal.codigo_proposta })).toMatchObject({ ok: false });
    const sent = await t.flush();
    expect(sent[0].text).toContain("Confirma essa alteração?");
    expect(t.draft()?.ready).toBe(true);

    t.say("sim, pode fechar");
    expect(await t.tool("confirmar_alteracao", { codigo_proposta: "000000000000" })).toMatchObject({ ok: false });
    expect(await t.tool("confirmar_alteracao", { codigo_proposta: proposal.codigo_proposta })).toMatchObject({ ok: true, total: "80,00" });
    expect(t.persistence).toHaveBeenCalledTimes(1);
    expect(t.persistence.mock.calls[0][0].rows.map((row: Row) => row.catalog_item_id)).toEqual(["pizza", "lemonade"]);
    const payment = await t.flush();
    expect(payment).toHaveLength(1);
    expect(t.createPayment).toHaveBeenCalledTimes(1);
  });

  it("calls it a delivery fee, never 'frete', for a local-only store", async () => {
    const t = tools();
    t.ctx.salesCatalogShippingSettings = { configured: true, shippingEnabled: false, localPickup: false, localDeliveryEnabled: true, defaultHandlingDays: 0, rules: [],
      localDeliveryZones: [{ id: "centro", name: "Centro", active: true, shape: "cep", cepStart: "88330000", cepEnd: "88339999", price: "8,00", priority: 0,
        minDays: null, maxDays: null, orderMinimum: null, freeDeliveryThreshold: null, neighborhoods: [], cities: [], polygon: [] }] } as never;
    t.say("coloca uma limonada");
    const proposal = await t.tool("propor_alteracao", { itens: [{ produto_id: "pizza", quantidade: 1 }, { produto_id: "lemonade", quantidade: 1 }] });
    expect(proposal.resumo).toContain("Taxa de entrega (Entrega local - Centro): R$ 8,00");
    expect(proposal.resumo).not.toMatch(/\bFrete\b/);
    expect(proposal.total).toBe("78,00");
  });

  it("confirms and sends a single payment button even when the model also asks to send it", async () => {
    const t = tools();
    t.say("coloca uma limonada");
    const proposal = await t.tool("propor_alteracao", { itens: [{ produto_id: "pizza", quantidade: 1 }, { produto_id: "lemonade", quantidade: 1 }] });
    await t.flush();
    t.say("top isso mesmo pode fechar");
    expect(await t.tool("confirmar_alteracao", { codigo_proposta: proposal.codigo_proposta })).toMatchObject({ ok: true });
    expect(await t.tool("enviar_pagamento")).toMatchObject({ ok: true });
    expect(t.deferred).toHaveLength(1);
  });

  it("changes only the payment method and prepares one payment access", async () => {
    const t = tools();
    t.say("me faz um favor troca por pix");
    expect(await t.tool("trocar_forma_pagamento", { forma_pagamento: "pix" })).toMatchObject({ ok: true, forma_pagamento: "pix" });
    await t.flush();
    expect(t.persistence).not.toHaveBeenCalled();
    expect(t.createPayment).toHaveBeenCalledWith(expect.objectContaining({ preferredMethod: "pix" }));
  });

  it("does not switch payment behind a proposal the customer has not answered", async () => {
    const t = tools();
    t.say("coloca uma limonada");
    await t.tool("propor_alteracao", { itens: [{ produto_id: "pizza", quantidade: 1 }, { produto_id: "lemonade", quantidade: 1 }] });
    await t.flush();
    t.say("tem como pagar no pix?");
    expect(await t.tool("trocar_forma_pagamento", { forma_pagamento: "pix" })).toMatchObject({ ok: false });
    expect(t.createPayment).not.toHaveBeenCalled();
  });

  it("rejects unknown products, invalid quantities and an unchanged order without writing", async () => {
    const t = tools();
    t.say("quero mudar");
    expect(await t.tool("propor_alteracao", { itens: [{ produto_id: "invented", quantidade: 1 }] })).toMatchObject({ ok: false });
    expect(await t.tool("propor_alteracao", { itens: [{ produto_id: "pizza", quantidade: 0 }] })).toMatchObject({ ok: false });
    expect(await t.tool("propor_alteracao", { itens: [{ produto_id: "pizza", quantidade: 1 }] })).toMatchObject({ ok: false });
    expect(t.deferred).toHaveLength(0);
    expect(t.persistence).not.toHaveBeenCalled();
  });

  it("finds a product from how the customer calls it", async () => {
    const t = tools();
    const found = await t.tool("buscar_produtos", { texto: "limonada gelada" });
    expect(found).toMatchObject({ ok: true });
    expect((found.produtos as Row[])[0]).toMatchObject({ produto_id: "lemonade" });
  });
});

describe("first purchase payment choice (Gustavo, 23/09 20:58)", () => {
  it("delivers the model's request for delivery details instead of a false 'which order to resume' prompt", async () => {
    const s = scenario();
    s.ctx.salesCatalogOrders = [];
    s.db.tables.sales_catalog_orders = [];
    s.ctx.lead.metadata = {};
    s.ctx.messages = [];
    s.assistant("Então fechamos 2 unidades da Pizza de queijo (R$ 60,00 cada).");
    s.assistant("Como temos mais de uma forma de pagamento (Pix e Cartão de crédito parcelado em até 12x), qual você prefere para este pedido?");
    s.customer("cartão");
    s.db.tables.conversation_messages = [...s.ctx.messages];
    const sent = await s.call<Promise<Outbound[]>>("sendAgentResponse", { client: s.db.client, context: s.ctx, token: "fake", phone: "5500000000000",
      text: "Show de bola! No cartão de crédito fica perfeito.\n\nPara eu calcular o frete certinho, me passa seu e-mail e seu endereço completo com CEP, por favor?" });
    const text = sent.map(message => message.text).join("\n");
    expect(text).not.toContain("retomar");
    expect(text).toContain("CEP");
  });
});

describe("payment method chosen the night before (Gustavo, 23/09 21:10 → 24/09 09:28)", () => {
  it("remembers the choice instead of asking 'Pix ou cartão?' again", () => {
    const s = scenario();
    s.ctx.salesCatalogOrders = [];
    s.ctx.lead.metadata = {};
    const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600000).toISOString();
    // The real sequence, relative to the final "Sim" (09:28:57).
    const line = (direction: string, text: string, hoursAgo: number) => ({ ...s.message(direction, text), occurred_at: at(hoursAgo) });
    s.ctx.messages = [
      line("outbound", "Como temos mais de uma forma de pagamento (Pix e Cartão de crédito parcelado em até 12x), qual você prefere para este pedido?", 12.51),
      line("inbound", "cartão", 12.5),
      line("outbound", "O pagamento ainda não foi enviado. Preciso conferir qual pedido você quer retomar: me confirma os produtos e as quantidades?", 12.49),
      line("inbound", "Cartão", 12.31),
      line("outbound", "Perfeito, Magno! Vamos no cartão então.", 12.3),
      line("outbound", "Para eu montar o seu pedido e mandar o link seguro do cartão, me passa só o seu e-mail e o seu CPF, por favor?", 12.29),
      line("outbound", "Olá, Magno! Consegue me passar o seu e-mail e o seu CPF para eu gerar o link do cartão para você?", 0.38),
      line("inbound", "cliente@example.com\n\n00000000000", 0.06),
      line("outbound", "Show, Magno! Já salvei seu e-mail e CPF aqui.", 0.05),
      line("outbound", "Agora, me confirma seu endereço completo com CEP, rua, número, bairro e cidade, por favor?", 0.045),
      line("inbound", "Rua das Flores numero 42 cep 88330786 centro de balneário camboriu", 0.02),
      line("outbound", "Antes de fechar, confirma se o pedido ficou assim:\n- 2x Pizza de queijo - R$ 120,00\n- Frete: R$ 10,00\nTotal: R$ 130,00.\nPosso fechar seu pedido e gerar o pagamento?", 0.01),
      line("inbound", "Sim", 0),
    ];
    expect(s.call("resolveSalesCatalogConfirmedPaymentPreference", s.ctx, "Sim")).toBe("card");
  });
});

describe("fewer repetitions in the sales conversation", () => {
  it("drops a product line that repeats the prose price or a line already sent (Gustavo, 23/09 20:56)", () => {
    const s = scenario();
    const pizza = s.ctx.salesCatalog[0];
    const card = s.call<string>("formatSalesCatalogCustomerMention", pizza);
    const reply = `Excelente escolha! Tenho a Pizza de queijo por R$ 60,00.\n${card}\nQuer levar 1 ou 2?`;
    expect(s.call<string>("dropRepeatedCatalogMentionLines", reply, [pizza], [])).not.toContain(card);
    const alreadySent = [s.message("outbound", card)];
    expect(s.call<string>("dropRepeatedCatalogMentionLines", `Olha essa opção:\n${card}`, [pizza], alreadySent)).not.toContain(card);
    expect(s.call<string>("dropRepeatedCatalogMentionLines", `Olha essa opção:\n${card}`, [pizza], [])).toContain(card);
  });

  it("removes a product mention rendered inside a sentence that already has its price (Gustavo, 24/09 11:59)", () => {
    const s = scenario();
    const pizza = s.ctx.salesCatalog[0];
    const card = s.call<string>("formatSalesCatalogCustomerMention", pizza);
    const reply = `A Pizza de queijo por R$ 60,00 ${card} é a mais pedida.`;
    const result = s.call<string>("dropRepeatedCatalogMentionLines", reply, [pizza], []);
    expect(result).toBe("A Pizza de queijo por R$ 60,00 é a mais pedida.");
  });

  it("tells the agent what the customer already gave and to ask the rest at once", () => {
    const s = scenario();
    const lines = s.call<string[]>("buildCustomerCheckoutDataLines", { id: "lead", display_name: "Magno", metadata: { email: "cliente@example.com", cpf: "529.982.247-25" } }).join("\n");
    expect(lines).toContain("Já informados: e-mail, CPF");
    expect(lines).toContain("Faltam: nome completo, endereço completo com CEP");
    expect(lines).toContain("UMA única mensagem");
  });
});

describe("automatic cart complement (pizzaria)", () => {
  const item = (id: string, title: string, price: string, category: string, highlightLabel: string | null = null) => ({
    id, title, tag: `{{produto_${id}}}`, price, currency: "BRL", status: "active", salesDestination: "connectyhub_checkout", billingCycle: "one_time",
    inventory: { status: "in_stock", allowBackorder: false }, offer: { salePrice: null }, skus: [], attributes: [], fulfillment: { mode: "physical" },
    shipping: { profile: "default", weightGrams: 500 }, media: [], description: "", category, highlightLabel, platformProductCode: null });
  const menu = [item("calabresa", "Pizza Calabresa", "60,00", "Pizzas"), item("queijo", "Pizza de Queijo", "55,00", "Pizzas"),
    item("coca", "Coca-Cola 2L", "12,00", "Bebidas"), item("guarana", "Guaraná 2L", "10,00", "Bebidas", "Mais pedido"),
    item("petit", "Petit Gâteau", "18,00", "Sobremesas"), item("familia", "Combo Família", "120,00", "Pizzas")];
  const msg = (direction: string, text_content: string) => ({ id: `${direction}-${text_content.length}`, direction, text_content, occurred_at: new Date().toISOString(), payload: {} });
  const pick = (settings: unknown, messages: unknown[]) => runtimeHarness()<Array<{ id: string }>>("selectCartComplements", settings, menu, messages, null).map(entry => entry.id);

  it("offers a drink with the pizza, not another pizza, without any configuration", () => {
    expect(pick(null, [msg("inbound", "quero uma pizza calabresa grande")])).toEqual(["guarana"]);
  });
  it("offers it only once per conversation", () => {
    expect(pick(null, [msg("inbound", "quero uma pizza calabresa"), msg("outbound", "Quer aproveitar e levar também um Guaraná 2L?"), msg("inbound", "não, só a pizza")])).toEqual([]);
  });
  it("does not offer a second complement after the first was accepted", () => {
    expect(pick(null, [msg("inbound", "quero uma pizza calabresa"), msg("outbound", "Quer aproveitar e levar também um Guaraná 2L?"), msg("inbound", "sim, coloca o guaraná 2l")])).toEqual([]);
  });
  it("still suggests a complement when the agent recommended the main products itself", () => {
    expect(pick(null, [msg("outbound", "Para hoje recomendo a Pizza Calabresa."), msg("inbound", "fechado, quero a pizza calabresa")])).toEqual(["guarana"]);
  });
  it("puts the store's configured offer first", () => {
    const settings = { orderBumps: { enabled: true, whatsappEnabled: true, autoSuggestionsEnabled: true, maxOffersPerOrder: 1,
      items: [{ productId: "petit", active: true, triggerCategory: "Pizzas", badge: null, title: null, description: null, triggerText: null }] } };
    expect(pick(settings, [msg("inbound", "quero uma pizza calabresa")])).toEqual(["petit"]);
  });
  it("offers a one-time item with a gym plan, never another plan", () => {
    const gym = [{ ...item("mensal", "Plano Mensal", "99,00", "Planos"), billingCycle: "recurring" },
      { ...item("anual", "Plano Anual", "89,00", "Planos"), billingCycle: "recurring" },
      item("camiseta", "Camiseta da Academia", "59,90", "Acessórios"), { ...item("clube", "Clube de Vantagens", "19,90", "Assinaturas"), billingCycle: "recurring" }];
    const chosen = runtimeHarness()<Array<{ id: string }>>("selectCartComplements", null, gym, [msg("inbound", "quero o plano mensal")], null).map(entry => entry.id);
    expect(chosen).toEqual(["camiseta"]);
  });
  it("offers nothing when the store has nothing complementary", () => {
    const onlyPlans = [{ ...item("mensal", "Plano Mensal", "99,00", "Planos"), billingCycle: "recurring" }, { ...item("anual", "Plano Anual", "89,00", "Planos"), billingCycle: "recurring" }];
    expect(runtimeHarness()("selectCartComplements", null, onlyPlans, [msg("inbound", "quero o plano mensal")], null)).toEqual([]);
  });
  it("stays quiet with no product chosen or with offers turned off", () => {
    expect(pick(null, [msg("inbound", "boa noite, vocês abrem hoje?")])).toEqual([]);
    expect(pick({ orderBumps: { enabled: false, whatsappEnabled: true, autoSuggestionsEnabled: true, items: [] } }, [msg("inbound", "quero uma pizza calabresa")])).toEqual([]);
  });
});

describe("order tools conversation loop", () => {
  const turn = (t: ReturnType<typeof tools>) => t.call<Promise<{ response: { text: string }; deferred: Deferred[]; calls: Row[] }>>("runOrderToolTurn", {
    systemInstruction: "Você é o agente de teste.", credentials: { apiKey: "not-real", model: "gemini-test" }, agent: { id: "agent", name: "Agente", model_id: "gemini-test" },
    behavior: { proactiveFollowUp: false }, messages: t.ctx.messages, userText: t.latest().text_content,
    client: t.db.client, context: t.ctx, scope: t.scope(), token: "fake", phone: "5500000000000", latestInbound: t.latest() });

  it("answers an installment question without touching the order", async () => {
    const t = tools();
    t.say("Tem como parcelar no cartão?");
    t.modelReplies.push(modelText("Tem sim! No cartão dá para parcelar no checkout."));
    const result = await turn(t);
    expect(result.response.text).toContain("parcelar");
    expect(result.calls).toEqual([]);
    expect(t.persistence).not.toHaveBeenCalled();
  });

  it("executes the requested tool and returns its real result to the model", async () => {
    const t = tools();
    t.say("coloca uma limonada junto");
    t.modelReplies.push(functionCall("propor_alteracao", { itens: [{ produto_id: "pizza", quantidade: 1 }, { produto_id: "lemonade", quantidade: 1 }] }),
      modelText("Perfeito, montei a alteração para você conferir."));
    const result = await turn(t);
    expect(result.calls).toEqual([{ name: "propor_alteracao", ok: true }]);
    expect(result.deferred).toHaveLength(1);
    const followUp = t.modelRequests[1].contents as Array<{ parts: Array<{ functionResponse?: { response: Row } }> }>;
    expect(followUp.at(-1)?.parts[0].functionResponse?.response).toMatchObject({ ok: true, total: "80,00" });
  });

  it("makes the model call the payment tool instead of promising it (Gustavo, 24/09 09:31)", async () => {
    const t = tools();
    t.say("Sim");
    t.modelReplies.push(modelText("Show! Estou preparando tudo para gerar o código do Pix para você agora mesmo!"),
      functionCall("enviar_pagamento"), modelText("Pronto, Magno! Segue o acesso ao pagamento."));
    const result = await turn(t);
    expect(result.calls).toEqual([{ name: "enviar_pagamento", ok: true }]);
    expect(result.deferred).toHaveLength(1);
    // The active session with the same method and amount is reused: no second charge.
    expect(t.createPayment).not.toHaveBeenCalled();
    await result.deferred[0]();
    expect(JSON.stringify(t.requests.at(-1)?.body)).toContain("original-session");
  });

  it("does not let a proposal be announced as already added (Gustavo, 24/09 13:04)", async () => {
    const t = tools();
    t.say("pode ser esse de 60 mg");
    t.modelReplies.push(functionCall("propor_alteracao", { itens: [{ produto_id: "pizza", quantidade: 1 }, { produto_id: "lemonade", quantidade: 1 }] }),
      modelText("Perfeito! Adicionei a limonada ao seu pedido."), modelText("Perfeito! Montei a alteração com a limonada para você conferir."));
    const result = await turn(t);
    expect(result.response.text).toBe("Perfeito! Montei a alteração com a limonada para você conferir.");
  });

  it("makes the model rewrite a claimed change that no tool executed", async () => {
    const t = tools();
    t.say("esse");
    t.modelReplies.push(modelText("Alteração confirmada no Pix com os dois produtos!"), modelText("Quer que eu inclua os dois produtos no pedido?"));
    const result = await turn(t);
    expect(result.response.text).toBe("Quer que eu inclua os dois produtos no pedido?");
    expect(t.modelRequests).toHaveLength(2);
  });
});
