import { describe, expect, it } from "vitest";
import { scenario, type Outbound, type Row } from "./helpers/order-revision-scenario";

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
  const tool = (name: string, args: Row = {}) => s.call<Promise<ToolResult>>("executeOrderTool", {
    client: s.db.client, context: s.ctx, scope: scope(), latestInbound: latest, token: "fake", phone: "5500000000000", deferred, name, args });
  const say = (text: string) => { latest = inbound(text); deferred.length = 0; };
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

  it("makes the model rewrite a claimed change that no tool executed", async () => {
    const t = tools();
    t.say("esse");
    t.modelReplies.push(modelText("Alteração confirmada no Pix com os dois produtos!"), modelText("Quer que eu inclua os dois produtos no pedido?"));
    const result = await turn(t);
    expect(result.response.text).toBe("Quer que eu inclua os dois produtos no pedido?");
    expect(t.modelRequests).toHaveLength(2);
  });
});
