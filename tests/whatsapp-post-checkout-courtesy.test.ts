import { describe, expect, it, vi } from "vitest";
import { normalizeOrderRevisionSpeech, parseOrderRevisionIntent } from "@/lib/whatsapp/order-revision-intent";
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

async function completedCheckout() {
  const s = scenario();
  await s.turn("adicione uma camiseta vermelha");
  const checkout = await s.turn("sim confirmado");
  expect(checkout?.interactiveButton).toBe(true);
  expect(s.persistence).toHaveBeenCalledOnce();
  expect(s.createPayment).toHaveBeenCalledOnce();
  return s;
}

function expectUnchangedCheckout(s: Awaited<ReturnType<typeof completedCheckout>>) {
  expect(s.persistence).toHaveBeenCalledOnce();
  expect(s.createPayment).toHaveBeenCalledOnce();
  expect(s.db.tables.sales_catalog_orders).toHaveLength(1);
  expect(s.db.tables.sales_catalog_orders[0]).toMatchObject({ payment_status: "pending", total: "130", checkout_revision: 1 });
  expect(s.db.tables.sales_catalog_order_items.map(row => [row.catalog_item_id, row.quantity])).toEqual([["shirt", 1], ["redshirt", 1]]);
  expect(s.db.tables.sales_catalog_payment_sessions).toHaveLength(2);
  expect(s.db.tables.sales_catalog_payment_sessions.at(-1)).toMatchObject({ id: "revised-session", status: "pending", method: "card" });
  expect(s.ctx.salesCatalogOrders[0].preferredPaymentMethod).toBe("card");
  expect(s.ctx.lead.metadata.checkout_order_revision).toBeFalsy();
}

describe("courtesy after a successfully sent checkout", () => {
  it.each(["blz obrigado", "beleza, obrigado", "ok muito obrigado", "show valeu", "perfeito, obrigada", "legal obrigado"])(
    "does not turn %s into consent by stripping the gratitude",
    text => {
      expect(normalizeOrderRevisionSpeech(text)).toBe("");
      expect(parseOrderRevisionIntent(text)).toBeNull();
      expect(scenario().call<boolean>("hasSalesCatalogCheckoutConfirmationIntent", text)).toBe(false);
    },
  );

  it.each(["obrigado, pode enviar o link", "valeu, pode finalizar o pedido", "sim, pode gerar o pagamento, obrigado"])(
    "keeps an actual payment request inside %s",
    text => {
      expect(normalizeOrderRevisionSpeech(text)).toMatch(/pode (?:enviar|finalizar|gerar)/i);
      expect(scenario().call<boolean>("hasSalesCatalogCheckoutConfirmationIntent", text)).toBe(true);
    },
  );

  it("keeps a new explicit cart edit or payment change inside a polite message", () => {
    expect(parseOrderRevisionIntent("obrigado, adicione um boné")).toMatchObject({ kind: "add", productText: "bone", quantity: 1 });
    expect(parseOrderRevisionIntent("blz obrigado, troca para Pix")).toMatchObject({ kind: "payment", paymentMethod: "pix" });
  });

  it.each(["obrigado, mas o pedido está errado", "obrigado, ainda não paguei"])(
    "preserves substantive customer statements in %s", text => {
      expect(normalizeOrderRevisionSpeech(text)).toMatch(/pedido está errado|ainda não paguei/);
    },
  );

  it("preserves the clone's two courtesy replies and the same card payment after checkout", async () => {
    const s = await completedCheckout();
    expect(await s.turn("legal obrigado", false, true)).toBeNull();
    const first = "Por nada! Assim que concluir o pagamento no cartão, me avisa. Qualquer coisa, estou por aqui.";
    expect((await s.model(first)).map(row => row.text).join("\n")).toBe(first);

    expect(await s.turn("blz obrigado", false, true)).toBeNull();
    const second = "Por nada! Tenha um ótimo dia.";
    const outbound = (await s.model(second)).map(row => row.text).join("\n");
    expect(outbound).toBe(second);
    expect(outbound).not.toMatch(/qual forma|confirma|produto|checkout|pix/i);
    expectUnchangedCheckout(s);
  });

  it("does not treat an acknowledgment after the farewell as another acceptance of the old total", async () => {
    const s = await completedCheckout();
    await s.turn("legal obrigado", false, true);
    await s.model("Disponha! Assim que concluir o pagamento no cartão, me avisa.");
    expect(await s.turn("ok", false, true)).toBeNull();
    const response = "Combinado! Estou por aqui se precisar.";
    expect((await s.model(response)).map(row => row.text).join("\n")).toBe(response);
    expectUnchangedCheckout(s);
  });

  it("does not revive a completed confirmation when courtesy arrives in separate message bubbles", async () => {
    const s = await completedCheckout();
    s.customer("blz");
    s.customer("obrigado");
    const response = "Disponha! Estou por aqui se precisar.";
    expect((await s.model(response)).map(row => row.text).join("\n")).toBe(response);
    expectUnchangedCheckout(s);
  });

  it("answers confusion about a pending payment without opening a cart alteration", async () => {
    const s = await completedCheckout();
    await s.turn("legal obrigado", false, true);
    await s.model("Disponha! Assim que concluir o pagamento no cartão, me avisa.");
    expect(await s.turn("o que não entendi", false, true)).toBeNull();
    const response = "O pagamento ainda está pendente. Você pode concluir pelo checkout que já enviei.";
    expect((await s.model(response)).map(row => row.text).join("\n")).toBe(response);
    expectUnchangedCheckout(s);
  });
});
