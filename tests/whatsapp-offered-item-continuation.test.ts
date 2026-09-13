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

const offer = "Quer aproveitar e adicionar 1 Camiseta vermelha ao seu pedido atual?";

function assertUncharged(s: ReturnType<typeof scenario>) {
  expect(s.persistence).not.toHaveBeenCalled();
  expect(s.createPayment).not.toHaveBeenCalled();
  expect(s.db.tables.sales_catalog_order_items).toHaveLength(1);
  expect(s.db.tables.sales_catalog_payment_sessions).toHaveLength(1);
  expect(s.db.tables.sales_catalog_payment_sessions[0].status).toBe("pending");
}

describe("continuing a specific additional-product offer", () => {
  it.each(["sim coloca", "sim, pode adicionar", "sim", "pode colocar essa"])("turns acceptance of one recent concrete offer into a new priced proposal: %s", async answer => {
    const s = scenario();
    s.assistant(offer);
    const proposal = await s.turn(answer, false, true);
    expect(proposal?.text).toContain("1x Camiseta vermelha");
    expect(proposal?.text).toContain("1x Camiseta azul");
    expect(proposal?.text).toContain("Total: R$ 130,00");
    expect(proposal?.text).toContain("Confirma essa alteração?");
    expect(s.draft()?.ready).toBe(true);
    assertUncharged(s);
    await s.turn("sim confirmado");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.createPayment).toHaveBeenCalledOnce();
    expect(s.db.tables.sales_catalog_order_items.map(row => [row.catalog_item_id, row.quantity])).toEqual([["shirt", 1], ["redshirt", 1]]);
    expect(s.db.tables.sales_catalog_orders).toHaveLength(1);
  });

  it("preserves the offer's explicit quantity instead of assuming one", async () => {
    const s = scenario();
    s.assistant("Quer adicionar duas camisetas vermelhas ao pedido atual por R$ 140,00?");
    const proposal = await s.turn("sim coloca");
    expect(proposal?.text).toContain("2x Camiseta vermelha");
    expect(proposal?.text).toContain("Total: R$ 200,00");
    assertUncharged(s);
  });

  it("resolves a pending addition from a repeated full product name with its quoted price", async () => {
    const s = scenario();
    const clarification = await s.turn("sim coloca");
    expect(clarification?.text).toMatch(/produto|nome|quantidade/i);
    assertUncharged(s);
    const proposal = await s.turn("Camiseta vermelha - R$ 70,00");
    expect(proposal?.text).toContain("1x Camiseta vermelha");
    expect(proposal?.text).toContain("Total: R$ 130,00");
    expect(s.draft()?.ready).toBe(true);
    assertUncharged(s);
  });

  it("understands quantity, unit phrase and parenthesized price without adding the price as quantity", async () => {
    const s = scenario();
    await s.turn("sim coloca");
    const proposal = await s.turn("1 unidade de Camiseta vermelha (R$ 70,00)");
    expect(proposal?.text).toContain("1x Camiseta vermelha");
    expect(proposal?.text).toContain("Total: R$ 130,00");
    expect(s.draft()?.ready).toBe(true);
    assertUncharged(s);
    const repeated = await s.turn("1 unidade de Camiseta vermelha (R$ 70,00)");
    if (repeated) expect(repeated.text).not.toContain("2x Camiseta vermelha");
    expect(s.draft()?.items.filter(item => item.id === "redshirt")).toEqual([expect.objectContaining({ quantity: 1 })]);
    assertUncharged(s);
  });

  it("keeps an unfinished addition while quantity and product arrive in separate messages", async () => {
    const s = scenario();
    await s.turn("adicione esse produto");
    const quantityReply = await s.turn("2 unidades");
    expect(quantityReply?.text).toMatch(/produto|nome|opção/i);
    expect(s.draft()?.ready).toBe(false);
    assertUncharged(s);
    const proposal = await s.turn("Camiseta vermelha");
    expect(proposal?.text).toContain("2x Camiseta vermelha");
    expect(proposal?.text).toContain("Total: R$ 200,00");
    assertUncharged(s);
  });

  it.each([
    ["Camiseta vermelha - R$ 70,00", 1, "130,00"],
    ["1 unidade de Camiseta vermelha (R$ 70,00)", 1, "130,00"],
    ["2 unidades de Camiseta vermelha - R$ 70,00 cada", 2, "200,00"],
  ] as const)("can parse a product-and-price clarification when the add operation is already known: %s", async (answer, quantity, total) => {
    const s = scenario();
    await s.turn("adicione esse produto");
    expect(s.draft()?.pending_intent?.kind).toBe("add");
    const proposal = await s.turn(answer);
    expect(proposal?.text).toContain(`${quantity}x Camiseta vermelha`);
    expect(proposal?.text).toContain(`Total: R$ ${total}`);
    assertUncharged(s);
  });

  it.each(["não", "não coloca", "não quero adicionar", "quanto fica se eu colocar?", "sim, mas não coloca ainda"])("does not treat refusal or a conditional question as accepting an offer: %s", async answer => {
    const s = scenario();
    s.assistant(offer);
    const reply = await s.turn(answer, false, true);
    expect(s.draft()?.items.some(item => item.id === "redshirt") ?? false).toBe(false);
    if (reply) expect(reply.text).not.toContain("1x Camiseta vermelha");
    assertUncharged(s);
  });

  it("does not choose one of two proposed alternatives from a generic yes", async () => {
    const s = scenario();
    s.assistant("Você quer adicionar uma Camiseta vermelha ou um Boné ao pedido?");
    const reply = await s.turn("sim coloca", false, true);
    expect(reply?.text).toMatch(/nome|produto|opção|qual/i);
    expect(s.draft()?.items.length ?? 1).toBe(1);
    assertUncharged(s);
  });

  it("does not recover an earlier offer after a newer unrelated assistant question", async () => {
    const s = scenario();
    s.assistant(offer);
    s.customer("quero saber as cores primeiro");
    s.assistant("Você quer ver as opções disponíveis?");
    const reply = await s.turn("sim coloca", false, true);
    expect(reply?.text).toMatch(/nome|produto|opção|qual/i);
    expect(s.draft()?.items.some(item => item.id === "redshirt") ?? false).toBe(false);
    assertUncharged(s);
  });

  it("does not choose the item offer when the same outbound burst ends with another question", async () => {
    const s = scenario();
    s.assistant(offer);
    s.assistant("Quer que eu mostre as outras cores disponíveis?");
    await s.turn("sim", false, true);
    expect(s.draft()?.items.some(item => item.id === "redshirt") ?? false).toBe(false);
    assertUncharged(s);
  });

  it("understands one offer whose sentence was delivered in consecutive message bubbles", async () => {
    const s = scenario();
    s.assistant("Quer aproveitar e adicionar");
    s.assistant("1 Camiseta vermelha ao seu pedido atual?");
    const proposal = await s.turn("sim coloca");
    expect(proposal?.text).toContain("1x Camiseta vermelha");
    expect(proposal?.text).toContain("Total: R$ 130,00");
    assertUncharged(s);
  });

  it("does not borrow an unanswered offer from another conversation", async () => {
    const s = scenario();
    s.assistant(offer);
    s.ctx.messages.at(-1)!.conversation_id = "another-conversation";
    const reply = await s.turn("sim coloca", false, true);
    expect(reply?.text).toMatch(/nome|produto|opção|qual/i);
    expect(s.draft()?.items.some(item => item.id === "redshirt") ?? false).toBe(false);
    assertUncharged(s);
  });

  it("does not borrow an offer from another WhatsApp instance", async () => {
    const s = scenario();
    s.assistant(offer);
    s.ctx.messages.at(-1)!.whatsapp_instance_id = "another-instance";
    const reply = await s.turn("sim coloca", false, true);
    expect(reply?.text).toMatch(/nome|produto|opção|qual/i);
    expect(s.draft()?.items.some(item => item.id === "redshirt") ?? false).toBe(false);
    assertUncharged(s);
  });

  it("does not infer a quantity that the offer never specified", async () => {
    const s = scenario();
    s.assistant("Quer adicionar Camiseta vermelha ao pedido atual?");
    const reply = await s.turn("sim coloca", false, true);
    expect(reply?.text).toMatch(/nome|produto|quantidade/i);
    expect(s.draft()?.items.some(item => item.id === "redshirt") ?? false).toBe(false);
    assertUncharged(s);
  });

  it("replays the same acceptance without adding the offered product twice or confirming payment", async () => {
    const s = scenario();
    s.assistant(offer);
    const first = await s.turn("sim coloca");
    expect(first?.text).toContain("1x Camiseta vermelha");
    const replay = await s.turn("sim coloca", true);
    expect(replay?.text).not.toContain("2x Camiseta vermelha");
    expect(s.draft()?.items.filter(item => item.id === "redshirt")).toEqual([expect.objectContaining({ quantity: 1 })]);
    assertUncharged(s);
    await s.turn("sim confirmado");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.createPayment).toHaveBeenCalledOnce();
    expect(s.db.tables.sales_catalog_order_items.filter(row => row.catalog_item_id === "redshirt")).toEqual([expect.objectContaining({ quantity: 1 })]);
  });

  it("does not treat yesterday's offer as a fresh proposal after the conversation resumes", async () => {
    const s = scenario();
    s.assistant(offer);
    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    s.ctx.messages.forEach((message, index) => { message.occurred_at = new Date(yesterday + index * 1000).toISOString(); });
    const reply = await s.turn("sim coloca", false, true);
    expect(reply?.text).toMatch(/nome|produto|opção|qual/i);
    expect(s.draft()?.items.some(item => item.id === "redshirt") ?? false).toBe(false);
    assertUncharged(s);
  });

  it("rechecks the current catalog price even when the accepted offer quoted an old price", async () => {
    const s = scenario();
    s.assistant("Quer adicionar 1 Camiseta vermelha por R$ 70,00 ao pedido atual?");
    s.ctx.salesCatalog[2].price = "85,00";
    const proposal = await s.turn("sim coloca");
    expect(proposal?.text).toContain("1x Camiseta vermelha - R$ 85,00");
    expect(proposal?.text).toContain("Total: R$ 145,00");
    assertUncharged(s);
  });
});
