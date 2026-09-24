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
    expect(result.faltam).toEqual(["endereço completo com rua, número, bairro, cidade e CEP", "CPF"]);
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
