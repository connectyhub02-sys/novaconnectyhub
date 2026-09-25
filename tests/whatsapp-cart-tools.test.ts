import { describe, expect, it } from "vitest";
import { address, scenario, type Outbound, type Row } from "./helpers/order-revision-scenario";

type ToolResult = Row & { ok: boolean; motivo?: string; faltam?: string[]; codigo_resumo?: string; resumo?: string; total?: string };
type Deferred = () => Promise<Outbound>;

const localZones = { configured: true, shippingEnabled: false, localPickup: false, localDeliveryEnabled: true, defaultHandlingDays: 0, rules: [],
  localDeliveryZones: [{ id: "centro", name: "Centro", active: true, shape: "cep", cepStart: "88330000", cepEnd: "88339999", price: "8,00", priority: 0,
    minDays: null, maxDays: null, orderMinimum: null, freeDeliveryThreshold: null, neighborhoods: [], cities: [], polygon: [] }] };

/** A fresh conversation with no order yet, on an instance with order tools enabled. */
function cart() {
  const s = scenario();
  s.ctx.instance.metadata = { order_tools: true };
  s.ctx.salesCatalogOrders = [];
  s.db.tables.sales_catalog_orders = [];
  s.db.tables.sales_catalog_order_items = [];
  s.db.tables.sales_catalog_payment_sessions = [];
  s.ctx.lead.metadata = { person_name: "Maria Oliveira", email: "cliente@example.com" };
  s.db.tables.leads[0].metadata = structuredClone(s.ctx.lead.metadata);
  s.ctx.messages = [];
  const deferred: Deferred[] = [];
  let latest = s.message("inbound", "oi");
  const say = (text: string) => {
    latest = s.message("inbound", text);
    s.ctx.messages.push(latest);
    s.db.tables.conversation_messages = [...s.ctx.messages];
    s.ctx.run.id = `run-${latest.id}`;
    deferred.length = 0;
    (deferred as Deferred[] & { paymentQueued?: boolean }).paymentQueued = false;
  };
  const scope = () => s.call<{ kind: string } | null>("resolveCartToolScope", s.ctx);
  const tool = (name: string, args: Row = {}) => s.call<Promise<ToolResult>>("executeOrderTool", {
    client: s.db.client, context: s.ctx, scope: { kind: "cart" }, latestInbound: latest, token: "fake", phone: "5500000000000", deferred, name, args });
  const flush = async () => { const sent: Outbound[] = []; for (const action of deferred.splice(0)) sent.push(await action()); return sent; };
  const state = () => s.ctx.lead.metadata.checkout_tool_cart as Row | null | undefined;
  return { ...s, say, scope, tool, flush, deferred, state };
}

const pizzaAndLemonade = { itens: [{ produto_id: "pizza", quantidade: 1 }, { produto_id: "lemonade", quantidade: 1 }] };

describe("first purchase with cart tools", () => {
  it("is active only with the instance flag and while no order exists in the conversation", () => {
    const t = cart();
    expect(t.scope()).toEqual({ kind: "cart" });
    t.ctx.instance.metadata = {};
    expect(t.scope()).toBeNull();
  });

  it("asks for the address and the missing billing data together instead of building a partial order", async () => {
    const t = cart();
    t.say("quero uma pizza de queijo e uma limonada");
    const result = await t.tool("montar_pedido", pizzaAndLemonade);
    expect(result).toMatchObject({ ok: false, motivo: "Falta o endereço de entrega." });
    expect(result.faltam).toEqual(["endereço completo com rua, número, bairro, cidade e CEP", "CPF", "forma de pagamento (Pix ou cartão)"]);
    expect(t.deferred).toHaveLength(0);
  });

  it("builds the whole cart, sends one official summary and creates the order only after acceptance", async () => {
    const t = cart();
    t.say(address);
    t.say("quero uma pizza de queijo e uma limonada, no cartão");
    const summary = await t.tool("montar_pedido", { ...pizzaAndLemonade, forma_pagamento: "card" });
    expect(summary).toMatchObject({ ok: true, total: "80,00", forma_pagamento: "card" });
    expect(summary.resumo).toContain("Pizza de queijo");
    expect(summary.resumo).toContain("Limonada");
    // Same turn: never closes before the customer answered the summary.
    expect(await t.tool("fechar_pedido", { codigo_resumo: summary.codigo_resumo })).toMatchObject({ ok: false });
    const sent = await t.flush();
    expect(sent[0].text).toContain("Posso fechar seu pedido e gerar o pagamento?");
    expect(t.state()).toMatchObject({ ready: true });

    t.say("sim, pode fechar");
    expect(await t.tool("fechar_pedido", { codigo_resumo: "000000000000" })).toMatchObject({ ok: false });
    expect(await t.tool("fechar_pedido", { codigo_resumo: summary.codigo_resumo })).toMatchObject({ ok: true, forma_pagamento: "card" });
    const order = t.db.tables.sales_catalog_orders[0];
    expect(order).toMatchObject({ status: "pending_payment", total: "80,00" });
    expect(t.db.tables.sales_catalog_order_items.map(row => row.catalog_item_id).sort()).toEqual(["lemonade", "pizza"]);
    expect(t.state()).toBeNull();
    await t.flush();
    expect(t.createPayment).toHaveBeenCalledTimes(1);
  });

  it("creates the same order once when the acceptance is processed again", async () => {
    const t = cart();
    t.say(address);
    t.say("pizza de queijo e limonada no pix");
    const summary = await t.tool("montar_pedido", { ...pizzaAndLemonade, forma_pagamento: "pix" });
    await t.flush();
    t.say("sim");
    await t.tool("fechar_pedido", { codigo_resumo: summary.codigo_resumo });
    expect(await t.tool("fechar_pedido", { codigo_resumo: summary.codigo_resumo })).toMatchObject({ ok: false });
    expect(t.db.tables.sales_catalog_orders).toHaveLength(1);
  });

  it("asks which version instead of guessing, and accepts the exact version id", async () => {
    const t = cart();
    const shirt = { ...t.ctx.salesCatalog[0], id: "shirt", title: "Camiseta", price: "40,00", tag: "{{produto_shirt}}",
      skus: [{ id: "p", title: "P", skuCode: "CAM-P", status: "active", stockStatus: "in_stock", price: "40,00", salePrice: null, attributes: [] },
        { id: "g", title: "G", skuCode: "CAM-G", status: "active", stockStatus: "in_stock", price: "40,00", salePrice: null, attributes: [] }] };
    t.ctx.salesCatalog.push(shirt as never);
    t.say(address);
    t.say("quero a camiseta");
    const ambiguous = await t.tool("montar_pedido", { itens: [{ produto_id: "shirt", quantidade: 1 }] });
    expect(ambiguous.ok).toBe(false);
    expect(ambiguous.motivo).toContain("versões");
    expect(await t.tool("montar_pedido", { itens: [{ produto_id: "shirt", quantidade: 1, versao_id: "g" }] })).toMatchObject({ ok: true });
  });

  it("accepts the product tag shown in the catalog as the product id (Gustavo, 25/09)", async () => {
    const t = cart();
    t.say(address);
    t.say("pizza e limonada");
    const result = await t.tool("montar_pedido", { itens: [{ produto_id: "{{produto_pizza}}", quantidade: 1 }, { produto_id: "produto_lemonade", quantidade: 1 }] });
    expect(result).toMatchObject({ ok: true, total: "80,00" });
  });

  it("closes on a plain 'pode' even if the model rebuilds the same summary first (Gustavo, 25/09 11:10)", async () => {
    const t = cart();
    t.say(address);
    t.say("pizza e limonada no cartão");
    const summary = await t.tool("montar_pedido", { ...pizzaAndLemonade, forma_pagamento: "card" });
    await t.flush();
    t.say("Pode");
    const again = await t.tool("montar_pedido", { ...pizzaAndLemonade, forma_pagamento: "card" });
    expect(again).toMatchObject({ ok: true, ja_enviado: true, codigo_resumo: summary.codigo_resumo });
    expect(t.deferred).toHaveLength(0);
    expect(await t.tool("fechar_pedido", { codigo_resumo: summary.codigo_resumo })).toMatchObject({ ok: true });
    expect(t.db.tables.sales_catalog_orders).toHaveLength(1);
  });

  it("asks the payment method together with the other missing data", async () => {
    const t = cart();
    t.say("quero pizza e limonada");
    const result = await t.tool("montar_pedido", pizzaAndLemonade);
    expect(result.faltam).toContain("forma de pagamento (Pix ou cartão)");
  });

  it("tells the agent a typed CPF is invalid, without flagging a phone number", () => {
    const t = cart();
    const lines = (messages: Row[]) => t.call<string[]>("buildCustomerCheckoutDataLines", t.ctx.lead, messages).join("\n");
    const asked = t.message("outbound", "Me passa nome completo, e-mail, CPF e endereço?");
    expect(lines([asked, t.message("inbound", "Magno macedo Gomes\n97114659191")])).toContain("não é válido");
    expect(lines([t.message("outbound", "Qual seu telefone?"), t.message("inbound", "47988577996")])).not.toContain("não é válido");
    expect(t.call("normalizeRuntimeCustomerDocument", "97114659191")).toBeNull();
    expect(t.call("normalizeRuntimeCustomerDocument", "529.982.247-25")).toBe("52998224725");
  });

  it("treats 'já solicitei à equipe' without a tool as an unexecuted claim (Gustavo, 25/09 11:16)", () => {
    const t = cart();
    expect(t.call("claimsUnexecutedOrderAction", "Prontinho, Magno! Já solicitei a alteração para Pix no sistema.")).toBe(true);
  });

  it("never sends two identical summaries in one reply (Gustavo, 25/09 12:20)", async () => {
    const t = cart();
    t.say(address);
    t.say("pode incluir");
    expect(await t.tool("montar_pedido", pizzaAndLemonade)).toMatchObject({ ok: true });
    expect(await t.tool("montar_pedido", pizzaAndLemonade)).toMatchObject({ ok: true, ja_enviado: true });
    expect(t.deferred).toHaveLength(1);
  });

  it("stores the clean product name in the order, without gallery artifacts", async () => {
    const t = cart();
    t.ctx.salesCatalog[0].title = "Pizza de queijo - Imagem 2 Pizza de queijo - Imagem 3 Pizza";
    t.say(address);
    t.say("pizza e limonada no pix");
    const summary = await t.tool("montar_pedido", { ...pizzaAndLemonade, forma_pagamento: "pix" });
    await t.flush();
    t.say("pode");
    await t.tool("fechar_pedido", { codigo_resumo: summary.codigo_resumo });
    expect(t.db.tables.sales_catalog_order_items.map(row => row.title)).toContain("Pizza de queijo");
  });

  it("completes a profile first name with the full name typed in the billing data", async () => {
    const t = cart();
    t.ctx.lead.display_name = "Magno";
    t.ctx.lead.metadata = {};
    t.db.tables.leads[0].metadata = {};
    t.say("Magno macedo\nCPF 52998224725\nRua 1131, numero 61, cep 88330786, bairro centro, cidade balneário camboriu\nPagamento no pix");
    await t.call("maybePersistSalesCatalogLeadContactDetailsFromMessage", { client: t.db.client, context: t.ctx, userText: t.ctx.messages.at(-1)!.text_content });
    expect(t.ctx.lead.metadata).toMatchObject({ person_name: "Magno macedo" });
  });

  it("does not build a delivery summary from a CEP alone (Gustavo, 24/09 22:13)", async () => {
    const t = cart();
    t.say("cliente@example.com\n52998224725\n88330786");
    const result = await t.tool("montar_pedido", pizzaAndLemonade);
    expect(result).toMatchObject({ ok: false, motivo: "Falta o endereço completo de entrega." });
    expect(result.faltam?.[0]).toBe("endereço completo com rua, número, bairro e cidade");
    expect(t.deferred).toHaveLength(0);
  });

  it("always answers the customer when the model keeps calling tools (Gustavo, 24/09 22:15)", async () => {
    const t = cart();
    t.say(address);
    t.say("Tem como pagar no cartao crédito");
    const loop = { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ functionCall: { name: "ver_carrinho", args: {} } }] } }] };
    t.modelReplies.push(loop, loop, loop, loop, loop, loop, loop, { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: "Tem sim! No cartão dá para parcelar." }] } }] });
    const result = await t.call<Promise<{ response: { text: string }; calls: Row[] }>>("runOrderToolTurn", {
      systemInstruction: "Você é o agente de teste.", credentials: { apiKey: "not-real", model: "gemini-test" }, agent: { id: "agent", name: "Agente", model_id: "gemini-test" },
      behavior: { proactiveFollowUp: false }, messages: t.ctx.messages, userText: "Tem como pagar no cartao crédito",
      client: t.db.client, context: t.ctx, scope: { kind: "cart" }, token: "fake", phone: "5500000000000", latestInbound: t.ctx.messages.at(-1) });
    expect(result.response.text).toBe("Tem sim! No cartão dá para parcelar.");
    expect((t.modelRequests.at(-1)?.toolConfig as { functionCallingConfig: { mode: string } }).functionCallingConfig.mode).toBe("NONE");
    // Only the first identical call runs; the repeats are refused as a loop.
    expect(result.calls.filter(call => call.ok)).toHaveLength(1);
  });

  it("sends the summary instead of failing when the steps run out after it was built (Gustavo, 25/09 10:16)", async () => {
    const t = cart();
    t.say(`magno macedo\n52998224725\n${address}`);
    const call = (name: string, args: Row) => ({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ functionCall: { name, args } }] } }] });
    t.modelReplies.push(call("montar_pedido", pizzaAndLemonade));
    for (let round = 1; round < 8; round++) t.modelReplies.push(call("buscar_produtos", { texto: `limonada ${round}` }));
    const result = await t.call<Promise<{ response: { text: string }; calls: Row[]; deferred: Deferred[] }>>("runOrderToolTurn", {
      systemInstruction: "Você é o agente de teste.", credentials: { apiKey: "not-real", model: "gemini-test" }, agent: { id: "agent", name: "Agente", model_id: "gemini-test" },
      behavior: { proactiveFollowUp: false }, messages: t.ctx.messages, userText: "dados",
      client: t.db.client, context: t.ctx, scope: { kind: "cart" }, token: "fake", phone: "5500000000000", latestInbound: t.ctx.messages.at(-1) });
    expect(result.response.text).toBe("");
    expect(result.deferred).toHaveLength(1);
    // The call attempted on the last round is ignored, never executed.
    expect(result.calls).toHaveLength(7);
  });

  it("tells the customer the last concrete reason when nothing could be done", () => {
    const t = cart();
    expect(t.call("orderToolFallbackText", [{ name: "montar_pedido", ok: false, reason: "Falta o endereço completo de entrega." }], []))
      .toBe("Para seguir com o seu pedido: Falta o endereço completo de entrega.");
  });

  it("offers the cart tools to the model and returns the real summary result", async () => {
    const t = cart();
    t.say(address);
    t.say("quero uma pizza de queijo e uma limonada");
    t.modelReplies.push({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ functionCall: { name: "montar_pedido", args: pizzaAndLemonade } }] } }] },
      { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: "Perfeito! Te mando o resumo para conferir." }] } }] });
    const result = await t.call<Promise<{ response: { text: string }; calls: Row[]; deferred: Deferred[] }>>("runOrderToolTurn", {
      systemInstruction: "Você é o agente de teste.", credentials: { apiKey: "not-real", model: "gemini-test" }, agent: { id: "agent", name: "Agente", model_id: "gemini-test" },
      behavior: { proactiveFollowUp: false }, messages: t.ctx.messages, userText: "quero uma pizza de queijo e uma limonada",
      client: t.db.client, context: t.ctx, scope: { kind: "cart" }, token: "fake", phone: "5500000000000", latestInbound: t.ctx.messages.at(-1) });
    const declared = (t.modelRequests[0].tools as Array<{ functionDeclarations: Array<{ name: string }> }>)[0].functionDeclarations.map(tool => tool.name);
    expect(declared).toEqual(["buscar_produtos", "ver_carrinho", "montar_pedido", "fechar_pedido", "mostrar_produto"]);
    expect(result.calls).toEqual([{ name: "montar_pedido", ok: true }]);
    expect(result.response.text).toBe("Perfeito! Te mando o resumo para conferir.");
    expect(result.deferred).toHaveLength(1);
  });

  it("builds a half-and-half pizza with the local delivery fee and rejects an invalid composition", async () => {
    const t = cart();
    t.ctx.salesCatalogShippingSettings = localZones as never;
    const pizza = t.ctx.salesCatalog[0] as Row;
    pizza.foodComposition = { enabled: true, pricing: "highest", localOnly: true,
      sizes: [{ id: "grande", name: "Grande", active: true, price: "", maxFlavors: 2, portions: 8 }],
      flavors: [{ id: "calabresa", name: "Calabresa", active: true, prices: { grande: "60,00" }, incompatibleWith: [] },
        { id: "queijo", name: "Queijo", active: true, prices: { grande: "55,00" }, incompatibleWith: [] },
        { id: "atum", name: "Atum", active: true, prices: { grande: "65,00" }, incompatibleWith: [] }], groups: [] };
    t.say(address);
    t.say("uma grande meia calabresa meia queijo");
    const half = { tamanho_id: "grande", sabores: [{ sabor_id: "calabresa", fracoes: 4 }, { sabor_id: "queijo", fracoes: 4 }] };
    const summary = await t.tool("montar_pedido", { itens: [{ produto_id: "pizza", quantidade: 1, montagem: [half] }] });
    expect(summary).toMatchObject({ ok: true, total: "68,00" });
    expect(summary.resumo).toContain("Calabresa");
    expect(summary.resumo).toContain("Taxa de entrega");
    const three = { tamanho_id: "grande", sabores: [{ sabor_id: "calabresa", fracoes: 3 }, { sabor_id: "queijo", fracoes: 3 }, { sabor_id: "atum", fracoes: 2 }] };
    expect(await t.tool("montar_pedido", { itens: [{ produto_id: "pizza", quantidade: 1, montagem: [three] }] })).toMatchObject({ ok: false });
  });
});

describe("tool turn delivery", () => {
  it("sends every block with typing between them, quoted replies and no repeat on retry", async () => {
    const c = cart();
    c.ctx.behavior = { ...c.ctx.behavior, splitMessages: true, quoteReplyMode: "always", wpmTypingModel: true, wpmSpeed: 45 } as typeof c.ctx.behavior;
    c.say("oi, quero pizza");
    const text = "Oi Maria!\n\nTemos pizza sim.\n\nQuer de queijo?\n\nOu de tomate?\n\nAs duas saem hoje.";
    const send = () => c.call<Promise<Outbound[]>>("sendOrderToolTurn", { client: c.db.client, context: c.ctx, token: "fake", phone: "5500000000000",
      text, deferred: [], latestInbound: c.ctx.messages.at(-1) });
    await send();
    const texts = c.requests.filter(request => request.url.endsWith("/send/text"));
    const presence = c.requests.filter(request => request.url.endsWith("/message/presence"));
    expect(texts).toHaveLength(5);
    expect(texts.every(request => request.body.replyid === c.ctx.messages.at(-1)!.provider_message_id)).toBe(true);
    expect(presence.filter(request => request.body.presence === "composing")).toHaveLength(4);
    // A retried run finds the blocks already persisted and sends nothing again.
    c.db.tables.conversation_messages = [...c.ctx.messages, ...[1, 2, 3, 4, 5].map(chunk => ({ id: `sent-${chunk}`, direction: "outbound",
      conversation_id: "conversation", payload: { agent_run_id: c.ctx.run.id, chunk_index: chunk, delivery_mode: "text" } }))];
    await send();
    expect(c.requests.filter(request => request.url.endsWith("/send/text"))).toHaveLength(5);
  }, 30000);
});
