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
  async function model(text: string) {
    db.tables.conversation_messages = [...ctx.messages];
    const result = await call<Promise<Outbound[]>>("sendAgentResponse", { client: db.client, context: ctx, token: "fake", phone: "5500000000000", text });
    result.forEach(outbound => assistant(outbound.text));
    return result;
  }
  return { ctx, db, call, requests, transport, persistence, createPayment, turn, assistant, customer, draft, metadata, model };
}

const verbalPreview = "Seu pedido ficou assim:\n\n- 1x Camiseta azul - R$ 60,00\n- 1x Camiseta vermelha - R$ 70,00\n\nFrete grátis. Total: R$ 130,00. Pagamento: cartão.\n\nPosso fechar seu pedido e enviar o checkout?";

async function legacyScenario(kind: "clarify" | "add" = "add", customerNamedItem = true) {
  const s = scenario();
  await s.turn("sim coloca");
  const legacy = structuredClone(s.draft()) as unknown as Row;
  legacy.pending_intent = kind === "clarify" ? { kind: "clarify", reason: "ambiguous" }
    : { kind: "add", productText: "", quantity: 1 };
  legacy.source_message_id = "";
  delete legacy.pending_source_message_id;
  legacy.ready = false;
  legacy.preview_text = null;
  s.metadata({ checkout_order_revision: legacy, checkout_order_revisions: { conversation: legacy } });
  if (customerNamedItem) {
    s.customer("1 unidade de Camiseta vermelha (R$ 70,00)");
    s.assistant("A alteração ainda está pendente. Me informe o nome completo do produto, a versão e a quantidade desejada.");
  }
  s.assistant("Consegui incluir a Camiseta vermelha no pedido. Quando quiser finalizar, me avise.");
  const earlier = Date.now() - 4 * 60 * 60 * 1000;
  s.ctx.messages.forEach((message, index) => { message.occurred_at = new Date(earlier + index * 1000).toISOString(); });
  s.ctx.salesCatalogOrders[0].createdAt = new Date(earlier - 60000).toISOString();
  s.ctx.salesCatalogOrders[0].updatedAt = s.ctx.salesCatalogOrders[0].createdAt;
  s.db.tables.sales_catalog_orders[0].created_at = s.ctx.salesCatalogOrders[0].createdAt;
  s.db.tables.sales_catalog_orders[0].updated_at = s.ctx.salesCatalogOrders[0].updatedAt;
  return s;
}

function assertSavedOrderUntouched(s: ReturnType<typeof scenario>) {
  expect(s.db.tables.sales_catalog_orders).toHaveLength(1);
  expect(s.db.tables.sales_catalog_order_items.map(row => row.catalog_item_id)).toEqual(["shirt"]);
  expect(s.persistence).not.toHaveBeenCalled();
  expect(s.createPayment).not.toHaveBeenCalled();
  expect(s.db.tables.sales_catalog_payment_sessions).toHaveLength(1);
  expect(s.db.tables.sales_catalog_payment_sessions[0].status).toBe("pending");
}

describe("resuming a legacy unresolved revision after a conversational response", () => {
  it("recovers the customer's recorded product into one authoritative proposal after a greeting", async () => {
    const s = await legacyScenario("add");
    const resumed = await s.turn("oi bom dia");
    const output = resumed ? resumed.text : (await s.model(verbalPreview)).map(row => row.text).join("\n");
    expect(output).toContain("1x Camiseta vermelha");
    expect(output).toContain("130,00");
    expect(s.draft()?.ready).toBe(true);
    expect(s.draft()?.pending_intent).toBeFalsy();
    assertSavedOrderUntouched(s);
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.createPayment).toHaveBeenCalledOnce();
    expect(s.persistence.mock.calls[0][0]).toMatchObject({ orderId: "order", preferredPaymentMethod: "card", expectedTotal: 130 });
    expect(s.db.tables.sales_catalog_order_items.map(row => [row.catalog_item_id, row.quantity])).toEqual([["shirt", 1], ["redshirt", 1]]);
    await s.turn("sim", true);
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.createPayment).toHaveBeenCalledOnce();
  });

  it("does not invent an operation from a legacy clarification whose original action is unknown", async () => {
    const s = await legacyScenario("clarify");
    await s.turn("bom dia");
    const replies = await s.model(verbalPreview);
    expect(replies.map(row => row.text).join("\n")).not.toContain("Posso fechar seu pedido e enviar o checkout?");
    expect(s.draft()?.ready).toBe(false);
    expect(s.draft()?.items.some(item => item.id === "redshirt")).toBe(false);
    await s.turn("sim");
    assertSavedOrderUntouched(s);
  });

  it("does not emit a checkout-ready summary of an item named only by the assistant", async () => {
    const s = await legacyScenario("add", false);
    await s.turn("bom dia");
    const replies = await s.model(verbalPreview);
    const output = replies.map(row => row.text).join("\n");
    expect(output).not.toBe(verbalPreview);
    expect(output).not.toContain("Posso fechar seu pedido e enviar o checkout?");
    expect(s.draft()?.ready).toBe(false);
    expect(s.draft()?.items.some(item => item.id === "redshirt")).toBe(false);
    assertSavedOrderUntouched(s);
    await s.turn("sim");
    assertSavedOrderUntouched(s);
  });

  it("does not present an invented total after a bare greeting while a valid draft still needs a product", async () => {
    const s = await legacyScenario("add", false);
    await s.turn("oi");
    const replies = await s.model(verbalPreview.replace("130,00", "129,00"));
    const output = replies.map(row => row.text).join("\n");
    expect(output).not.toContain("129,00");
    expect(output).not.toContain("Posso fechar seu pedido e enviar o checkout?");
    expect(s.draft()?.ready).toBe(false);
    assertSavedOrderUntouched(s);
  });

  it("keeps the current refusal authoritative over an earlier named product and an optimistic follow-up", async () => {
    const s = await legacyScenario();
    await s.turn("não quero mais adicionar a camiseta vermelha");
    assertSavedOrderUntouched(s);
    await s.turn("bom dia");
    const replies = await s.model(verbalPreview);
    const output = replies.map(row => row.text).join("\n");
    expect(output).not.toContain("Posso fechar seu pedido e enviar o checkout?");
    expect(s.draft()?.items.some(item => item.id === "redshirt") ?? false).toBe(false);
    await s.turn("sim");
    assertSavedOrderUntouched(s);
  });

  it("does not turn a product question from the customer into consent to add it", async () => {
    const s = await legacyScenario("add", false);
    s.customer("quanto custa a Camiseta vermelha?");
    s.assistant("Ela custa R$ 70,00.");
    await s.turn("bom dia");
    const replies = await s.model(verbalPreview);
    expect(replies.map(row => row.text).join("\n")).not.toContain("Posso fechar seu pedido e enviar o checkout?");
    expect(s.draft()?.items.some(item => item.id === "redshirt") ?? false).toBe(false);
    await s.turn("sim");
    assertSavedOrderUntouched(s);
  });

  it("does not rebuild the current conversation from a product answer belonging to another instance", async () => {
    const s = await legacyScenario("add", false);
    s.customer("1 unidade de Camiseta vermelha (R$ 70,00)");
    s.ctx.messages.at(-1)!.whatsapp_instance_id = "another-instance";
    s.assistant("Bom dia, vamos continuar.");
    await s.turn("oi");
    const replies = await s.model(verbalPreview);
    expect(replies.map(row => row.text).join("\n")).not.toContain("Posso fechar seu pedido e enviar o checkout?");
    expect(s.draft()?.items.some(item => item.id === "redshirt") ?? false).toBe(false);
    await s.turn("sim");
    assertSavedOrderUntouched(s);
  });

  it("quotes the current price before asking for new consent to a recovered addition", async () => {
    const s = await legacyScenario("add");
    s.ctx.salesCatalog[2].price = "85,00";
    const resumed = await s.turn("bom dia");
    const output = resumed ? resumed.text : (await s.model(verbalPreview)).map(row => row.text).join("\n");
    expect(output).toContain("1x Camiseta vermelha - R$ 85,00");
    expect(output).toContain("145,00");
    expect(s.draft()?.ready).toBe(true);
    assertSavedOrderUntouched(s);
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.persistence.mock.calls[0][0].expectedTotal).toBe(145);
  });

  it("does not recover product consent beyond the bounded history window", async () => {
    const s = await legacyScenario("add");
    const earlier = Date.now() - 8 * 24 * 60 * 60 * 1000;
    s.ctx.messages.forEach((message, index) => { message.occurred_at = new Date(earlier + index * 1000).toISOString(); });
    s.ctx.salesCatalogOrders[0].createdAt = new Date(earlier - 60000).toISOString();
    s.ctx.salesCatalogOrders[0].updatedAt = s.ctx.salesCatalogOrders[0].createdAt;
    s.db.tables.sales_catalog_orders[0].created_at = s.ctx.salesCatalogOrders[0].createdAt;
    s.db.tables.sales_catalog_orders[0].updated_at = s.ctx.salesCatalogOrders[0].updatedAt;
    await s.turn("bom dia");
    const replies = await s.model(verbalPreview);
    expect(replies.map(row => row.text).join("\n")).not.toContain("Posso fechar seu pedido e enviar o checkout?");
    expect(s.draft()?.items.some(item => item.id === "redshirt") ?? false).toBe(false);
    await s.turn("sim");
    assertSavedOrderUntouched(s);
  });

  it("does not charge the recovered proposal when the latest reply postpones payment", async () => {
    const s = await legacyScenario("add");
    const resumed = await s.turn("bom dia");
    if (!resumed) await s.model(verbalPreview);
    expect(s.draft()?.ready).toBe(true);
    await s.turn("sim, mas não quero pagar agora", false, true);
    assertSavedOrderUntouched(s);
  });
});
