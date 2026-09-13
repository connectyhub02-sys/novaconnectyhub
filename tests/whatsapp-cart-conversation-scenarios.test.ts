import { describe, expect, it, vi } from "vitest";
import * as catalogShared from "@/lib/sales-catalog/shared";
import type { SalesCatalogOrderRevisionInput } from "@/lib/sales-catalog/order-revision";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Row = Record<string, unknown>;
type Outbound = { text: string; interactiveButton?: boolean };
const address = "Rua das Flores, numero 42, Centro, Balneario Camboriu, SC, CEP 88330786";
const mapOrder = serverModuleHarness<typeof import("@/lib/client-os/sales-catalog")>("src/lib/client-os/sales-catalog.ts", {
  "@/lib/sales-catalog/shared": catalogShared,
});
const product = (id: string, title: string, price: string) => ({
  id, title, tag: `{{produto_${id}}}`, price, currency: "BRL", status: "active",
  salesDestination: "connectyhub_checkout", inventory: { status: "in_stock", allowBackorder: false },
  offer: { salePrice: null }, skus: [], attributes: [], fulfillment: { mode: "physical" },
  shipping: { profile: "default", weightGrams: 500 }, media: [], description: "", category: "", platformProductCode: null,
});

function scenario(options: { quantities?: [string, number][]; freightAvailable?: boolean; paymentStatus?: string } = {}) {
  const catalog = [product("shirt", "Camiseta azul", "60,00"), product("cap", "Boné", "10,00"), product("redshirt", "Camiseta vermelha", "70,00")];
  let counter = 0;
  const timestamp = Date.now() - 120000;
  const message = (direction: string, text_content: string) => ({ id: `message-${++counter}`, provider_message_id: `provider-${counter}`,
    direction, text_content, occurred_at: new Date(timestamp + counter * 1000).toISOString(), message_type: "text", payload: {},
    conversation_id: "conversation", whatsapp_instance_id: "instance" });
  const quantities = options.quantities ?? [["shirt", 1]];
  const items = quantities.map(([id, quantity]) => {
    const item = catalog.find(candidate => candidate.id === id)!;
    return { id: `line-${id}`, order_id: "order", organization_id: "store", catalog_item_id: id, title: item.title,
      quantity, unit_price: item.price, sale_price: null, total: (Number(item.price.replace(",", ".")) * quantity).toFixed(2).replace(".", ","),
      sku_id: null, sku_code: null, tag: item.tag, product_origin_type: null, commercial_flow_type: null,
      revenue_owner_type: null, commission_eligible: null, platform_product_id: null,
      attributes: [], fulfillment: { mode: "physical" }, metadata: {}, created_at: new Date(timestamp - 60000).toISOString() };
  });
  const initialSubtotal = items.reduce((total, item) => total + Number(item.total.replace(",", ".")), 0);
  const initialShipping = initialSubtotal >= 100 ? 0 : 10;
  const initialTotal = (initialSubtotal + initialShipping).toFixed(2).replace(".", ",");
  const orderRow = { id: "order", organization_id: "store", lead_id: "lead", conversation_id: "conversation", status: "pending_payment",
    payment_status: options.paymentStatus ?? "pending", fulfillment_status: "pending", customer_name: "Maria Oliveira", customer_email: "cliente@example.com",
    source: "whatsapp", customer_phone: null, customer_document: null, payment_method: "card", agent_notes: null, internal_notes: null,
    commercial_flow_type: null, revenue_owner_type: null, contains_platform_products: false, commission_eligible: false, created_by: null,
    subtotal: initialSubtotal.toFixed(2).replace(".", ","), discount_total: "0,00", shipping_total: String(initialShipping), total: initialTotal, destination_address: address,
    destination_cep: "88330786", shipping_method: "Frete manual", latest_payment_session_id: "original-session", checkout_revision: 0,
    checkout_payment_lock: null, created_at: new Date(timestamp - 60000).toISOString(), updated_at: new Date(timestamp - 60000).toISOString(),
    metadata: { checkout_confirmed_at: new Date(timestamp - 60000).toISOString(), preferred_payment_method: "card" } };
  const originalMetadata = { checkout_runtime_state: { conversation_id: "conversation", instance_id: "instance", order_id: "order", preferred_payment_method: "card" },
    person_name: "Maria Oliveira", email: "cliente@example.com" };
  const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: originalMetadata }], sales_catalog_orders: [orderRow],
    sales_catalog_order_items: items, sales_catalog_payment_sessions: [{ id: "original-session", organization_id: "store", order_id: "order", provider: "asaas",
      method: "card", amount: initialTotal, status: "pending", checkout_url: "https://loja.example/checkout/original-session" }] });
  const ctx = {
    messages: [message("inbound", address), message("outbound", "O pedido foi confirmado. Finalize pelo checkout.")], salesCatalog: catalog,
    salesCatalogOrders: [{ ...mapOrder.mapSalesCatalogOrder(orderRow, items), checkoutRevision: 0, checkoutPaymentLock: null as string | null,
      checkoutConfirmedAt: orderRow.metadata.checkout_confirmed_at, preferredPaymentMethod: "card" as "card" | "pix" | null }],
    salesCatalogShippingSettings: { configured: true, shippingEnabled: true, localPickup: true, localDeliveryEnabled: false, localDeliveryZones: [], defaultHandlingDays: 0,
      rules: options.freightAvailable === false ? [] : [{ uf: "SC", state: "Santa Catarina", active: true, price: "10,00", freeShippingThreshold: "100,00", minDays: 1, maxDays: 2,
        services: [], cepStart: null, cepEnd: null }] },
    organization: { id: "store", name: "Loja de roupas de teste", plan_code: "pro" }, agent: { id: "agent", name: "Agente de teste" },
    instance: { id: "instance", metadata: {} }, conversationId: "conversation", conversationMetadata: {}, run: { id: "run" },
    lead: { id: "lead", display_name: "Maria Oliveira", metadata: structuredClone(originalMetadata) as Row },
    behavior: { proactiveFollowUp: false }, linkButtons: [], salesCatalogSettings: null, credentials: { baseUrl: "https://whatsapp.invalid" },
  };
  const requests: { url: string; body: Row }[] = [];
  const transport = { menuStatus: 200 };
  const persistence = vi.fn(async (input: SalesCatalogOrderRevisionInput) => {
    const row = db.tables.sales_catalog_orders[0];
    // Simulated durable I/O only: calculations and all preconditions belong to the real handler.
    db.tables.sales_catalog_order_items = input.rows.map((line, index) => ({ ...line, id: `revised-${index}` }));
    Object.assign(row, { total: String(input.expectedTotal).replace(".", ","), checkout_revision: input.expectedRevision + 1,
      destination_address: input.shipping.destinationAddress, destination_cep: input.shipping.destinationCep,
      shipping_method: input.shipping.method, shipping_total: String(input.shipping.total),
      latest_payment_session_id: null, metadata: { ...row.metadata as Row, preferred_payment_method: input.preferredPaymentMethod } });
    db.tables.sales_catalog_payment_sessions.forEach(session => { session.status = "cancelled"; });
    return row;
  });
  const createPayment = vi.fn(async (input: { amount: string; preferredMethod: string; orderId: string }) => {
    const session = { id: "revised-session", organization_id: "store", order_id: input.orderId, provider: "asaas", method: input.preferredMethod,
      amount: input.amount, status: "pending", checkout_url: "https://loja.example/checkout/revised-session", pix_qr_code: input.preferredMethod === "pix" ? "TEST-PIX-NOT-PAYABLE" : null };
    db.tables.sales_catalog_payment_sessions.push(session);
    return { session, checkoutUrl: session.checkout_url, pixQrCode: session.pix_qr_code };
  });
  const call = runtimeHarness({
    "@/lib/client-os/sales-catalog": mapOrder,
    "@/lib/sales-catalog/order-revision": { applySalesCatalogOrderRevision: persistence },
    "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment },
  }, { fetch: async (url: string, init: { body: string }) => {
    requests.push({ url, body: JSON.parse(init.body) });
    const status = url.endsWith("/send/menu") ? transport.menuStatus : 200;
    return { ok: status === 200, status, text: async () => JSON.stringify(status === 200 ? { id: `sent-${requests.length}` } : { error: "Simulated delivery uncertainty" }) };
  } });
  const input = (latestInbound: ReturnType<typeof message>) => ({ client: db.client, context: ctx, token: "fake", phone: "5500000000000", latestInbound, userText: latestInbound.text_content });
  async function turn(text: string, replay = false, recoverExisting = false) {
    const inbound = replay ? ctx.messages.filter(row => row.direction === "inbound").at(-1)! : message("inbound", text);
    if (!replay) ctx.messages.push(inbound);
    ctx.run.id = `run-${counter}`;
    db.tables.conversation_messages = [...ctx.messages];
    let result = await call<Promise<Outbound | null>>("maybeHandleSalesCatalogOrderRevision", input(inbound));
    if (!result && recoverExisting) result = await call<Promise<Outbound | null>>("maybeSendExistingSalesCatalogCheckoutLink", input(inbound));
    if (result) ctx.messages.push(message("outbound", result.text));
    return result;
  }
  function assistant(text: string) { ctx.messages.push(message("outbound", text)); }
  function customer(text: string) { ctx.messages.push(message("inbound", text)); }
  function draft() { return ctx.lead.metadata.checkout_order_revision as { ready: boolean; items: { id: string; quantity: number }[]; request_id: string; total: string;
    address: string | null; cep: string | null; method: string | null; delivery_update?: { address: string | null; cep: string | null } | null;
    pending_intent?: { kind: string; productText?: string } | null } | null; }
  function metadata(patch: Row) { Object.assign(ctx.lead.metadata, structuredClone(patch)); Object.assign(db.tables.leads[0].metadata as Row, structuredClone(patch)); }
  return { ctx, db, call, requests, transport, persistence, createPayment, turn, assistant, customer, draft, metadata };
}

describe("cart and payment choices across consecutive customer messages", () => {
  it("resolves a missing product, changes to card and commits the complete proposal once", async () => {
    const s = scenario();
    const missing = await s.turn("adicione mais esse e gere o novo Pix");
    expect(missing?.text).toMatch(/produto|opção/i);
    expect(s.persistence).not.toHaveBeenCalled();

    const resolved = await s.turn("uma camiseta vermelha");
    expect(resolved?.text).toContain("Camiseta vermelha");
    expect(resolved?.text).toContain("130,00");
    expect(s.draft()?.items).toEqual(expect.arrayContaining([{ id: "redshirt", quantity: 1, mention_text: expect.any(String) }]));
    expect(s.db.tables.sales_catalog_order_items).toHaveLength(1);

    const card = await s.turn("muda pra pagamento em cartão");
    expect(card?.text).toContain("Camiseta vermelha");
    expect(card?.text).toContain("Pagamento: cartão");
    expect(s.persistence).not.toHaveBeenCalled();
    const payment = await s.turn("sim confirmado");
    expect(payment?.interactiveButton).toBe(true);
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.persistence.mock.calls[0][0]).toMatchObject({ orderId: "order", expectedTotal: 130, preferredPaymentMethod: "card" });
    expect(s.db.tables.sales_catalog_order_items.map(row => [row.catalog_item_id, row.quantity])).toEqual([["shirt", 1], ["redshirt", 1]]);
    expect(s.db.tables.sales_catalog_orders).toHaveLength(1);
    expect(s.createPayment).toHaveBeenCalledOnce();
    expect(s.createPayment.mock.calls[0][0].preferredMethod).toBe("card");
    await s.turn("sim confirmado", true);
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.createPayment).toHaveBeenCalledOnce();
  });

  it("retains the missing product through gratitude without inventing a completed addition", async () => {
    const s = scenario();
    await s.turn("adicione esse e gere um novo Pix");
    await s.turn("obrigado por ajudar");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
    const resolved = await s.turn("duas camisetas vermelhas");
    expect(resolved?.text).toContain("2x Camiseta vermelha");
    expect(resolved?.text).toContain("200,00");
    expect(resolved?.text).toContain("Pix");
    await s.turn("sim");
    expect(s.persistence.mock.calls[0][0]).toMatchObject({ preferredPaymentMethod: "pix", expectedTotal: 200 });
    expect(s.db.tables.sales_catalog_order_items.find(row => row.catalog_item_id === "redshirt")?.quantity).toBe(2);
  });

  it.each([
    "sim, mas não quero pagar agora",
    "sim, não gere o pagamento ainda",
    "sim, depois eu pago",
    "sim, mas quanto fica parcelado?",
    "pode fechar? Só estou perguntando",
    "se eu disser sim você já cobra?",
    "sim, mas antes me explica as taxas",
  ])("does not turn a refusal, deferral or question into financial consent: %s", async text => {
    const s = scenario();
    await s.turn("adicione uma camiseta vermelha");
    expect(s.draft()?.ready).toBe(true);
    await s.turn(text, false, true);
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
    expect(s.db.tables.sales_catalog_order_items).toHaveLength(1);
    expect(s.db.tables.sales_catalog_payment_sessions[0].status).toBe("pending");
    expect(s.requests.every(request => !request.url.endsWith("/send/menu"))).toBe(true);
  });

  it("waits for the pending item while remembering a separate card choice", async () => {
    const s = scenario();
    await s.turn("adicione esse e gere novo Pix");
    const incomplete = await s.turn("muda pra pagamento em cartão");
    expect(incomplete?.text).toMatch(/produto|opção/i);
    expect(s.draft()?.ready).toBe(false);
    await s.turn("sim");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
    const resolved = await s.turn("camiseta vermelha");
    expect(resolved?.text).toContain("Camiseta vermelha");
    expect(resolved?.text).toContain("Pagamento: cartão");
    await s.turn("sim");
    expect(s.persistence.mock.calls[0][0].preferredPaymentMethod).toBe("card");
  });

  it("processes an unanswered payment change before the burst's final confirmation", async () => {
    const s = scenario();
    await s.turn("adicione uma camiseta vermelha e gere o Pix");
    s.customer("muda o pagamento");
    s.customer("para cartão");
    const updated = await s.turn("sim");
    expect(updated?.text).toContain("Pagamento: cartão");
    expect(updated?.text).toContain("Camiseta vermelha");
    expect(s.persistence).not.toHaveBeenCalled();
    await s.turn("sim");
    expect(s.persistence.mock.calls[0][0].preferredPaymentMethod).toBe("card");
    expect(s.createPayment).toHaveBeenCalledOnce();
  });

  it("asks again after a split unrelated question instead of accepting an obsolete proposal", async () => {
    const s = scenario();
    await s.turn("adicione uma camiseta vermelha");
    expect(s.draft()?.ready).toBe(true);
    s.assistant("Quer que eu mostre");
    s.assistant("também os bonés?");
    const next = await s.turn("sim");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
    if (next) expect(next.text).toContain("Confirma essa alteração?");
  });

  it("accepts one complete preview delivered in several consecutive message bubbles", async () => {
    const s = scenario();
    const preview = await s.turn("adicione uma camiseta vermelha");
    expect(s.draft()?.ready).toBe(true);
    s.ctx.messages.pop();
    for (const paragraph of preview!.text.split("\n\n")) s.assistant(paragraph);
    await s.turn("sim confirmado");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.createPayment).toHaveBeenCalledOnce();
    expect(s.db.tables.sales_catalog_order_items).toHaveLength(2);
  });

  it("does not use the old proposal when a paid order begins a new purchase", async () => {
    const s = scenario();
    await s.turn("adicione uma camiseta vermelha");
    expect(s.draft()?.ready).toBe(true);
    s.ctx.salesCatalogOrders[0].paymentStatus = "confirmed";
    s.db.tables.sales_catalog_orders[0].payment_status = "confirmed";
    expect(await s.turn("quero fazer um novo pedido de duas camisetas azuis")).toBeNull();
    expect(s.draft()).toBeFalsy();
    expect(s.db.tables.sales_catalog_orders).toHaveLength(1);
    expect(s.db.tables.sales_catalog_order_items).toHaveLength(1);
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it("accumulates removal, replacement and quantity changes before one final payment choice", async () => {
    const s = scenario({ quantities: [["shirt", 2], ["cap", 1]] });
    const reduced = await s.turn("retire uma camiseta azul");
    expect(reduced?.text).toContain("Total: R$ 80,00");
    const replaced = await s.turn("troque o boné pela camiseta vermelha");
    expect(replaced?.text).toContain("Camiseta vermelha");
    expect(replaced?.text).not.toContain("Boné");
    const increased = await s.turn("aumente a camiseta vermelha para 2");
    expect(increased?.text).toContain("2x Camiseta vermelha");
    expect(increased?.text).toContain("Total: R$ 200,00");
    await s.turn("prefiro Pix");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.db.tables.sales_catalog_order_items.map(row => [row.catalog_item_id, row.quantity])).toEqual([["shirt", 2], ["cap", 1]]);
    await s.turn("sim confirmado");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.persistence.mock.calls[0][0]).toMatchObject({ preferredPaymentMethod: "pix", expectedTotal: 200, shipping: { total: 0 } });
    expect(s.db.tables.sales_catalog_order_items.map(row => [row.catalog_item_id, row.quantity])).toEqual([["shirt", 1], ["redshirt", 2]]);
    expect(s.db.tables.sales_catalog_orders).toHaveLength(1);
    expect(s.createPayment).toHaveBeenCalledOnce();
  });

  it("resolves which existing item to reduce without reducing either before the answer", async () => {
    const s = scenario({ quantities: [["shirt", 2], ["redshirt", 2]] });
    const missing = await s.turn("tire uma camiseta");
    expect(missing?.text).toMatch(/produto|opção/i);
    expect(s.draft()?.ready).toBe(false);
    expect(s.persistence).not.toHaveBeenCalled();
    const resolved = await s.turn("camiseta azul");
    expect(resolved?.text).toContain("1x Camiseta azul");
    expect(resolved?.text).toContain("2x Camiseta vermelha");
    await s.turn("sim");
    expect(s.db.tables.sales_catalog_order_items.map(row => [row.catalog_item_id, row.quantity])).toEqual([["shirt", 1], ["redshirt", 2]]);
    expect(s.persistence).toHaveBeenCalledOnce();
  });

  it("answers from the persisted cart after completion without denying the saved change or creating another charge", async () => {
    const s = scenario();
    await s.turn("adicione uma camiseta vermelha");
    await s.turn("sim");
    expect(s.draft()).toBeNull();
    s.customer("você já adicionou a camiseta vermelha?");
    s.db.tables.conversation_messages = [...s.ctx.messages];
    const reply = await s.call<Promise<Outbound[]>>("sendAgentResponse", {
      client: s.db.client, context: s.ctx, token: "fake", phone: "5500000000000",
      text: "Sim, adicionei a camiseta vermelha ao seu pedido.",
    });
    expect(reply.map(message => message.text).join("\n")).toContain("1x Camiseta vermelha");
    expect(reply.map(message => message.text).join("\n")).not.toContain("Ainda não há uma alteração confirmada");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.createPayment).toHaveBeenCalledOnce();
    expect(s.db.tables.sales_catalog_orders).toHaveLength(1);
  });

  it("does not turn a customer-name update into a request to revise products", async () => {
    const s = scenario();
    s.customer("Meu nome correto é Maria Silva");
    s.db.tables.conversation_messages = [...s.ctx.messages];
    const reply = await s.call<Promise<Outbound[]>>("sendAgentResponse", {
      client: s.db.client, context: s.ctx, token: "fake", phone: "5500000000000",
      text: "Atualizei seu nome para Maria Silva.",
    });
    expect(reply.map(message => message.text).join("\n")).not.toMatch(/produto|quantidade|alteração confirmada/i);
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it("does not use an applied revision as proof that a different item was also saved", async () => {
    const s = scenario();
    await s.turn("adicione uma camiseta vermelha");
    s.transport.menuStatus = 408;
    await expect(s.turn("sim")).rejects.toThrow();
    expect(s.draft()).toMatchObject({ applied: true });
    s.transport.menuStatus = 200;
    s.customer("separa também um boné");
    s.db.tables.conversation_messages = [...s.ctx.messages];
    const reply = await s.call<Promise<Outbound[]>>("sendAgentResponse", {
      client: s.db.client, context: s.ctx, token: "fake", phone: "5500000000000",
      text: "Adicionei um boné ao pedido.",
    });
    expect(reply.map(message => message.text).join("\n")).not.toContain("Adicionei um boné");
    expect(s.db.tables.sales_catalog_order_items.map(row => row.catalog_item_id)).toEqual(["shirt", "redshirt"]);
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.createPayment).toHaveBeenCalledOnce();
  });

  it("does not call a different SKU unchanged merely because product id, quantity and price match", async () => {
    const s = scenario();
    Object.assign(s.ctx.salesCatalog[0], { skus: [
      { id: "small", title: "Camiseta azul pequena", skuCode: "CAM-P", attributes: [], price: "60,00", salePrice: null, status: "active", stockStatus: "in_stock" },
      { id: "large", title: "Camiseta azul grande", skuCode: "CAM-G", attributes: [], price: "60,00", salePrice: null, status: "active", stockStatus: "in_stock" },
    ] });
    Object.assign(s.ctx.salesCatalogOrders[0].items[0], { skuId: "small", skuCode: "CAM-P", title: "Camiseta azul pequena" });
    Object.assign(s.db.tables.sales_catalog_order_items[0], { sku_id: "small", sku_code: "CAM-P", title: "Camiseta azul pequena" });
    const reply = await s.turn("troque a camiseta azul pequena pela camiseta azul grande");
    expect(reply?.text).toMatch(/opções|escolha/i);
    expect(reply?.text).not.toContain("já correspondem ao pedido salvo");
    expect(s.draft()?.ready).toBe(false);
    await s.turn("sim");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
    expect(s.db.tables.sales_catalog_order_items[0].sku_id).toBe("small");
  });
});
