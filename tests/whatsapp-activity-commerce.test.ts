import { describe, expect, it } from "vitest";
import { isCommerceBudgetStatement, requiresCommerceConversationReply, resolveActivityCommerceJourney } from "@/lib/whatsapp/commerce-conversation";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";

function fixture(activity: string, text = "ate um milhão eu consigo pagar") {
  const product = {
    id: "house", title: "Imovel comercial", tag: "{{produto_casa}}", price: "550.000,00", currency: "BRL", status: "active",
    salesDestination: "connectyhub_checkout", productUrl: null,
    inventory: { status: "in_stock", allowBackorder: false }, offer: { salePrice: null },
    skus: [], attributes: [], fulfillment: { mode: "service" }, shipping: { profile: "default" },
    media: [{ kind: "image", storageUrl: "https://media.example/house.jpg", title: "Imovel comercial" }],
    description: "Imovel comercial perto do centro", category: "Imoveis",
  };
  const inbound = { id: "inbound", direction: "inbound", text_content: text,
    occurred_at: new Date().toISOString(), message_type: "text", payload: {} };
  const context = {
    messages: [{ ...inbound, id: "question", direction: "outbound", text_content: "Qual faixa de valor fica confortável para seu investimento?", occurred_at: new Date(Date.now() - 60000).toISOString() }, inbound],
    salesCatalog: [product], salesCatalogOrders: [], salesCatalogShippingSettings: null,
    organization: { id: "store", name: "Empresa" }, agent: { id: "agent", metadata: { prompt_builder_config: { templateId: activity, mode: "manual" } } },
    instance: { id: "instance", metadata: {} }, conversationId: "conversation", conversationMetadata: {}, run: { id: "run" },
    lead: { id: "lead", display_name: "Maria", phone_number: "5511999999999", metadata: {} },
    behavior: { responseMode: "text", proactiveFollowUp: false, humanInterventionMinutes: 30 }, linkButtons: [], salesCatalogSettings: null,
    credentials: { baseUrl: "https://whatsapp.invalid" },
  };
  const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: {} }],
    conversation_messages: [{ ...inbound, conversation_id: "conversation", whatsapp_instance_id: "instance" }] });
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const call = runtimeHarness({ "@/lib/sales-catalog/public-urls": {
    buildLeadAwareSalesCatalogProductUrl: ({ productId }: { productId: string }) => `https://store.example/produto/${productId}`,
  } }, { fetch: async (url: string, init: { body: string }) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => JSON.stringify({ id: `sent-${requests.length}` }) };
  } });
  const send = (response: string) => call<Promise<unknown>>("sendAgentResponse", { client: db.client, context, token: "fake", phone: "5511999999999", text: response });
  return { product, context, db, requests, call, send };
}

describe("activity-specific commercial execution", () => {
  it("retains the selected appointment without a price across a short confirmation", () => {
    const { product, context, call } = fixture("dentista", "Sim, pode consultar");
    const service = { ...product, title: "Avaliação odontológica", salesDestination: "appointment", price: "", fulfillment: { mode: "service", agendaResourceId: "dentist-agenda" } };
    context.messages[0].text_content = "Quer consultar os horários da Avaliação odontológica?";
    const focus = call<typeof service>("resolveCatalogAgendaFocus", [service], "Sim, pode consultar", context.messages);
    expect(focus.fulfillment.agendaResourceId).toBe("dentist-agenda");
    expect(call("runtimeAllowsCheckout", { ...context, salesCatalog: [service] }, "Quero a Avaliação odontológica")).toBe(false);
    expect(call("resolveCatalogAgendaFocus", [service], "Quero outro serviço", context.messages)).toBeUndefined();
  });
  it("does not choose an agenda when the latest offer mentions two services", () => {
    const { product, context, call } = fixture("dentista");
    const services = [
      { ...product, title: "Avaliação odontológica", salesDestination: "appointment", price: "" },
      { ...product, id: "cleaning", title: "Limpeza dental", tag: "{{produto_limpeza}}", salesDestination: "appointment", price: "" },
    ];
    context.messages[1].text_content = "Quer Avaliação odontológica ou Limpeza dental?";
    expect(call("resolveCatalogAgendaFocus", services, "Sim", context.messages)).toBeUndefined();
  });
  it.each(["corretor_imoveis", "imobiliaria", "revenda_veiculos"])("blocks the screenshot order preview for %s even with a manual prompt", async activity => {
    const { send, requests, db } = fixture(activity);
    await send("Antes de fechar, confirma se o pedido ficou assim: 1x Imovel comercial R$550000. Posso fechar seu pedido e gerar o pagamento? {{produto_casa}}");
    const output = JSON.stringify(requests);
    expect(output).toContain("faixa de investimento");
    expect(output).not.toMatch(/seu pedido|550000|gerar o pagamento|checkout/i);
    expect(db.tables.sales_catalog_orders ?? []).toHaveLength(0);
    expect(JSON.stringify(db.tables.leads)).not.toContain("checkout_cart_draft");
  });

  it.each(["corretor_imoveis", "imobiliaria", "revenda_veiculos"])("blocks confirmed purchases, old checkout recovery and payment entry points for %s", async activity => {
    const { call, context, db, send, requests } = fixture(activity, "Confirmo o pedido, pode fechar e manda o Pix");
    const args = { client: db.client, context, items: context.salesCatalog, text: "Confirmo o pedido", userText: "reenvia o Pix",
      latestInbound: context.messages[1], total: "550000", orderId: "old-order", payment: {}, token: "fake", phone: "5511999999999" };
    for (const method of ["recordSalesCatalogOrderIntent", "maybeCreateSalesCatalogPaymentLink", "maybeSendExistingSalesCatalogCheckoutLink"]) {
      expect(await call(method, args)).toBeNull();
    }
    for (const method of ["sendSalesCatalogPaymentLink", "sendSalesCatalogPixDirectWhatsapp", "sendSalesCatalogPaymentDeferredWhatsapp"]) {
      await expect(call(method, args)).rejects.toThrow("negociacao com o responsavel");
    }
    await send("Vou gerar o pagamento do seu pedido. {{produto_casa}}");
    expect(JSON.stringify(requests)).toContain("visita");
    expect(db.tables.sales_catalog_orders ?? []).toHaveLength(0);
  });

  it("keeps property photos available while checkout is blocked", async () => {
    const { send, requests } = fixture("corretor_imoveis", "Me manda uma foto do Imovel comercial");
    await send("Esta é a foto do Imovel comercial. {{produto_casa}}");
    expect(requests.filter(request => request.url.endsWith("/send/media"))).toHaveLength(1);
    expect(JSON.stringify(requests)).toContain("https://media.example/house.jpg");
  });

  it("allows an explicit retail product in a dentist catalog but not the appointment", () => {
    const { context, call, product } = fixture("dentista", "Quero comprar o creme dental");
    const toothpaste = { ...product, id: "paste", title: "Creme dental", tag: "{{produto_creme}}", actionVersion: 1, price: "20,00" };
    context.salesCatalog = [{ ...product, title: "Avaliação odontológica", salesDestination: "appointment" }, toothpaste];
    expect(call("runtimeAllowsCheckout", context, "Quero comprar o creme dental")).toBe(true);
    expect(call("runtimeAllowsCheckout", context, "Quero agendar a avaliação odontológica")).toBe(false);
    expect(call("runtimeAllowsCheckout", context, "Meu orçamento é 500 reais")).toBe(false);
  });
  it("does not add a second property when the customer requested photos of one", async () => {
    const { context, product, send, requests } = fixture("corretor_imoveis", "Me envie fotos da Casa TV Morena");
    context.salesCatalog.push({ ...product, id: "tv", title: "Casa TV Morena", tag: "{{produto_tv}}", media: [{ kind: "image", storageUrl: "https://media.example/tv.jpg", title: "Casa TV Morena" }] });
    await send("Fotos da Casa TV Morena {{produto_tv}} e do Imovel comercial {{produto_casa}}");
    const images = requests.filter(request => request.url.endsWith("/send/media"));
    expect(images).toHaveLength(1);
    expect(JSON.stringify(images)).toContain("/tv.jpg");
    expect(JSON.stringify(images)).not.toContain("/house.jpg");
  });

  it("does not turn a retail budget into an order even if the model proposes checkout", async () => {
    const { send, call, requests, db } = fixture("generic_sales");
    expect(call("hasSalesCatalogOrderIntent", "ate um milhão eu consigo pagar")).toBe(false);
    await send("Posso fechar seu pedido e gerar o pagamento? {{produto_casa}}");
    expect(JSON.stringify(requests)).not.toContain("gerar o pagamento");
    expect(db.tables.sales_catalog_orders ?? []).toHaveLength(0);
  });

  it("keeps normal retail purchase intent and checkout instructions", () => {
    const { call, product } = fixture("pizzaria_delivery");
    expect(resolveActivityCommerceJourney("pizzaria_delivery")).toBe("checkout");
    expect(resolveActivityCommerceJourney("autopecas")).toBe("checkout");
    expect(call("hasSalesCatalogOrderIntent", "Pode fechar o pedido e mandar o Pix")).toBe(true);
    expect(call<string[]>("buildSalesCatalogLines", [product]).join("\n")).toContain("Posso fechar seu pedido");
  });

  it.each(["property", "vehicle"])("removes the retail checkout playbook from the %s catalog", journey => {
    const { call, product } = fixture("imobiliaria");
    const prompt = call<string[]>("buildSalesCatalogLines", [product], journey).join("\n");
    expect(prompt).toContain("ATENDIMENTO CONSULTIVO");
    expect(prompt).toContain("550.000,00");
    expect(prompt).not.toContain("Posso fechar seu pedido");
  });
});

describe("budget qualification", () => {
  it.each(["ate um milhão eu consigo pagar", "Posso pagar até 500 reais", "Meu orçamento é 800", "Consigo investir 200 mil", "Pretendo gastar 300 reais", "Até 850000", "Até R$ 850.000,00"])("treats %s as qualification", text => {
    expect(isCommerceBudgetStatement(text)).toBe(true);
    expect(requiresCommerceConversationReply(text)).toBe(true);
  });
  it("preserves a clearly chosen retail purchase alongside a budget", () => {
    expect(isCommerceBudgetStatement("Quero comprar essa televisão. Posso pagar 2000 reais")).toBe(false);
  });
});
