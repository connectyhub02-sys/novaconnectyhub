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

function withVariants(s: ReturnType<typeof scenario>, patch: Partial<Row> = {}) {
  const variants: Row[] = [
    { id: "red-m", title: "Camiseta vermelha M", skuCode: "RED-M", status: "active", stockStatus: "in_stock", allowBackorder: false,
      price: "70,00", salePrice: null, attributes: [{ name: "Tamanho", values: ["M"] }], weightGrams: 500 },
    { id: "red-g", title: "Camiseta vermelha G", skuCode: "RED-G", status: "active", stockStatus: "in_stock", allowBackorder: false,
      price: "80,00", salePrice: null, attributes: [{ name: "Tamanho", values: ["G"] }], weightGrams: 500 },
  ];
  Object.assign(variants[0], patch);
  (s.ctx.salesCatalog[2] as Row).skus = variants;
  return variants;
}
function assertAwaitingVariant(s: ReturnType<typeof scenario>, reply: Outbound | null) {
  expect(reply?.text).toMatch(/versão|versao|opção|opcao|tamanho|produto/i);
  expect(s.draft()?.ready ?? false).toBe(false);
  expect(s.draft()?.items.some(item => item.id === "redshirt") ?? false).toBe(false);
  assertUncharged(s);
}

describe("order revision requires an unambiguous SKU choice", () => {
  it("keeps an offered item with unspecified variants pending without choosing array order", async () => {
    const s = scenario();
    withVariants(s);
    s.assistant(offer);
    const reply = await s.turn("sim coloca");
    assertAwaitingVariant(s, reply);
    expect(s.draft()?.pending_intent?.kind).toBe("add");
  });

  it("keeps equally named variants ambiguous even when the product is unique", async () => {
    const s = scenario();
    const variants = withVariants(s);
    variants.forEach(variant => { variant.title = "Camiseta vermelha especial"; });
    s.assistant("Quer adicionar 1 Camiseta vermelha especial ao seu pedido atual?");
    const reply = await s.turn("sim coloca");
    assertAwaitingVariant(s, reply);
  });

  it("uses the explicitly offered version and its current catalog price", async () => {
    const s = scenario();
    withVariants(s);
    s.assistant("Quer adicionar 1 Camiseta vermelha G ao seu pedido atual?");
    const reply = await s.turn("sim coloca");
    expect(reply?.text).toContain("1x Camiseta vermelha G");
    expect(reply?.text).toContain("Total: R$ 140,00");
    expect(s.draft()?.ready).toBe(true);
    assertUncharged(s);
  });

  it("identifies an explicit unique SKU code instead of another variant title", async () => {
    const s = scenario();
    withVariants(s);
    s.assistant("Quer adicionar 1 Camiseta vermelha RED-G ao seu pedido atual?");
    const reply = await s.turn("sim coloca");
    expect(reply?.text).toContain("1x Camiseta vermelha G");
    expect(reply?.text).toContain("Total: R$ 140,00");
    assertUncharged(s);
  });

  it("accepts the later complete product and version once, preserving the offered quantity", async () => {
    const s = scenario();
    withVariants(s);
    s.assistant("Quer adicionar 2 Camiseta vermelha ao seu pedido atual?");
    assertAwaitingVariant(s, await s.turn("sim coloca"));
    const reply = await s.turn("Camiseta vermelha G");
    expect(reply?.text).toContain("2x Camiseta vermelha G");
    expect(reply?.text).toContain("Total: R$ 220,00");
    expect(s.draft()?.items.filter(item => item.id === "redshirt")).toEqual([expect.objectContaining({ quantity: 2 })]);
    assertUncharged(s);
    await s.turn("Camiseta vermelha G");
    expect(s.draft()?.items.filter(item => item.id === "redshirt")).toEqual([expect.objectContaining({ quantity: 2 })]);
    assertUncharged(s);
    await s.turn("sim confirmado");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.createPayment).toHaveBeenCalledOnce();
    expect(s.db.tables.sales_catalog_order_items.find(row => row.catalog_item_id === "redshirt"))
      .toEqual(expect.objectContaining({ sku_id: "red-g", quantity: 2 }));
  });

  it.each([
    ["inactive", { status: "inactive" }],
    ["out of stock", { stockStatus: "out_of_stock" }],
  ] as const)("does not silently replace an explicitly offered %s SKU with the available one", async (_label, patch) => {
    const s = scenario();
    withVariants(s, patch);
    s.assistant("Quer adicionar 1 Camiseta vermelha M ao seu pedido atual?");
    assertAwaitingVariant(s, await s.turn("sim coloca"));
  });

  it("asks which version when several were configured even if only one remains available", async () => {
    const s = scenario();
    withVariants(s, { status: "inactive" });
    s.assistant(offer);
    assertAwaitingVariant(s, await s.turn("sim coloca"));
    const reply = await s.turn("Camiseta vermelha G");
    expect(reply?.text).toContain("1x Camiseta vermelha G");
    expect(reply?.text).toContain("Total: R$ 140,00");
    assertUncharged(s);
  });

  it("can add the configured single SKU without inventing a variant choice", async () => {
    const s = scenario();
    const variants = withVariants(s);
    (s.ctx.salesCatalog[2] as Row).skus = [variants[1]];
    s.assistant(offer);
    const reply = await s.turn("sim coloca");
    expect(reply?.text).toContain("1x Camiseta vermelha G");
    expect(reply?.text).toContain("Total: R$ 140,00");
    assertUncharged(s);
  });

  it("accepts a short version answer while preserving the pending product and quantity", async () => {
    const s = scenario();
    withVariants(s);
    s.assistant("Quer adicionar 2 Camiseta vermelha ao seu pedido atual?");
    assertAwaitingVariant(s, await s.turn("sim coloca"));
    const reply = await s.turn("G");
    expect(reply?.text).toContain("2x Camiseta vermelha G");
    expect(reply?.text).toContain("Total: R$ 220,00");
    expect(s.draft()?.items.filter(item => item.id === "redshirt")).toEqual([expect.objectContaining({ quantity: 2 })]);
    assertUncharged(s);
  });
});


describe("offered revision identity boundaries", () => {
  it("does not resolve an explicit quote of an older other product as the latest offer", async () => {
    const s = scenario();
    s.assistant("Quer adicionar 1 Boné ao seu pedido atual?");
    const quoted = s.ctx.messages.at(-1)!;
    s.customer("talvez depois");
    s.assistant(offer);
    s.customer("sim coloca");
    s.ctx.messages.at(-1)!.payload = { quotedMsg: { text: quoted.text_content }, contextInfo: { stanzaId: quoted.provider_message_id } };
    const reply = await s.turn("", true);
    expect(reply?.text).toContain("1x Boné");
    expect(s.draft()?.items.some(item => item.id === "redshirt") ?? false).toBe(false);
    assertUncharged(s);
  });

  it("does not promote a category into a product identity", async () => {
    const s = scenario();
    s.ctx.salesCatalog[2].category = "vestuário";
    s.assistant("Quer adicionar 1 peça de vestuário ao seu pedido atual?");
    const reply = await s.turn("sim coloca");
    expect(reply?.text).toMatch(/produto|nome|opção/i);
    expect(s.draft()?.items.some(item => item.id === "redshirt") ?? false).toBe(false);
    assertUncharged(s);
  });

  it("does not accept an item that became inactive after its offer", async () => {
    const s = scenario();
    s.assistant(offer);
    s.ctx.salesCatalog[2].status = "inactive";
    const reply = await s.turn("sim coloca");
    expect(reply?.text).toMatch(/produto|nome|opção/i);
    expect(s.draft()?.items.some(item => item.id === "redshirt") ?? false).toBe(false);
    assertUncharged(s);
  });

  it("does not send payment for an applied earlier revision when a valid quoted item offer requests another proposal", async () => {
    const s = scenario();
    await s.turn("adicione 1 Boné");
    const retained = structuredClone(s.ctx.lead.metadata.checkout_order_revision) as Row;
    await s.turn("sim confirmado");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.createPayment).toHaveBeenCalledOnce();
    // Durable revision already succeeded, but its delivery acknowledgment was
    // uncertain. This is the real applied-draft recovery state.
    s.metadata({ checkout_order_revision: { ...retained, applied: true } });
    s.assistant("Quer adicionar 1 Boné ao seu pedido atual?");
    const quoted = s.ctx.messages.at(-1)!;
    s.customer("talvez depois");
    s.assistant(offer);
    s.customer("sim");
    s.ctx.messages.at(-1)!.payload = { quotedMsg: { text: quoted.text_content }, contextInfo: { stanzaId: quoted.provider_message_id } };
    const reply = await s.turn("", true);
    expect(reply?.text).toContain("2x Boné");
    expect(reply?.text).not.toMatch(/checkout seguro|finalizar pedido/i);
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.createPayment).toHaveBeenCalledOnce();
    expect(s.db.tables.sales_catalog_orders).toHaveLength(1);
  });
});

describe("unknown quoted offer and duplicate inbound delivery", () => {
  it("asks clarification for an unverified quote instead of sending a previous applied revision's payment", async () => {
    const s = scenario();
    await s.turn("adicione 1 Boné");
    const retained = structuredClone(s.ctx.lead.metadata.checkout_order_revision) as Row;
    await s.turn("sim confirmado");
    s.metadata({ checkout_order_revision: { ...retained, applied: true } });
    s.assistant(offer);
    s.customer("sim");
    s.ctx.messages.at(-1)!.payload = { quotedMsg: { text: "Quer adicionar 1 Boné ao seu pedido atual?" }, contextInfo: { stanzaId: "not-saved-in-this-conversation" } };
    const reply = await s.turn("", true);
    expect(reply?.text).toMatch(/produto|nome|opção|versão/i);
    expect(reply?.text).not.toMatch(/checkout seguro|finalizar pedido/i);
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.createPayment).toHaveBeenCalledOnce();
  });

  it("replays the same inbound acceptance without adding its quantity again or creating payment", async () => {
    const s = scenario();
    s.assistant(offer);
    const reply = await s.turn("sim coloca");
    expect(reply?.text).toContain("1x Camiseta vermelha");
    await s.turn("", true);
    expect(s.draft()?.items.filter(item => item.id === "redshirt")).toEqual([expect.objectContaining({ quantity: 1 })]);
    assertUncharged(s);
  });
});

describe("catalog availability and an abbreviated offer", () => {
  it("does not substitute a similarly named item when the offered product disappears from the active catalog", async () => {
    const s = scenario();
    s.assistant(offer);
    s.ctx.salesCatalog.splice(2, 1);
    const reply = await s.turn("sim coloca");
    expect(reply?.text).toMatch(/produto|nome|opção/i);
    expect(s.draft()?.ready ?? false).toBe(false);
    expect(s.draft()?.items).toEqual([expect.objectContaining({ id: "shirt", quantity: 1 })]);
    assertUncharged(s);
  });

  it("grounds an abbreviated offer in the single full product identity described in the same outbound burst", async () => {
    const s = scenario();
    s.assistant("Temos a Camiseta vermelha, por R$ 70,00.");
    s.assistant("Quer adicionar 1 camiseta ao seu pedido atual?");
    const reply = await s.turn("sim coloca");
    expect(reply?.text).toContain("1x Camiseta vermelha");
    expect(reply?.text).toContain("1x Camiseta azul");
    expect(reply?.text).toContain("Total: R$ 130,00");
    expect(reply?.text).toContain("Confirma essa alteração?");
    assertUncharged(s);
  });
});
