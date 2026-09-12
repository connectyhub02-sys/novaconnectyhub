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
  const catalog = [product("pizza", "Pizza de queijo", "60,00"), product("lemonade", "Limonada", "10,00"), product("tomato", "Pizza de tomate", "70,00")];
  let counter = 0;
  const timestamp = Date.now() - 120000;
  const message = (direction: string, text_content: string) => ({ id: `message-${++counter}`, provider_message_id: `provider-${counter}`,
    direction, text_content, occurred_at: new Date(timestamp + counter * 1000).toISOString(), message_type: "text", payload: {},
    conversation_id: "conversation", whatsapp_instance_id: "instance" });
  const quantities = options.quantities ?? [["pizza", 1]];
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
    organization: { id: "store", name: "Pizzaria de teste", plan_code: "pro" }, agent: { id: "agent", name: "Agente de teste" },
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
  async function turn(text: string, replay = false) {
    const inbound = replay ? ctx.messages.filter(row => row.direction === "inbound").at(-1)! : message("inbound", text);
    if (!replay) ctx.messages.push(inbound);
    ctx.run.id = `run-${counter}`;
    db.tables.conversation_messages = [...ctx.messages];
    const result = await call<Promise<Outbound | null>>("maybeHandleSalesCatalogOrderRevision", input(inbound));
    if (result) ctx.messages.push(message("outbound", result.text));
    return result;
  }
  function assistant(text: string) { ctx.messages.push(message("outbound", text)); }
  function customer(text: string) { ctx.messages.push(message("inbound", text)); }
  function draft() { return ctx.lead.metadata.checkout_order_revision as { ready: boolean; items: { id: string; quantity: number }[]; request_id: string; total: string;
    address: string | null; cep: string | null; method: string | null; delivery_update?: { address: string | null; cep: string | null } | null;
    pending_intent?: { kind: string; productText?: string } | null } | null; }
  function metadata(patch: Row) { Object.assign(ctx.lead.metadata, structuredClone(patch)); Object.assign(db.tables.leads[0].metadata as Row, structuredClone(patch)); }
  function legacyCart(includePreview = true) {
    customer("adicione uma limonada");
    const updated_at = ctx.messages.at(-1)!.occurred_at;
    metadata({ checkout_cart_draft: { organization_id: "store", conversation_id: "conversation", instance_id: "instance", updated_at,
      items: [{ id: "pizza", quantity: 1 }, { id: "lemonade", quantity: 1 }] } });
    if (includePreview) assistant("Antes de fechar, confirma se o pedido ficou assim:\n- 1x Pizza de queijo - R$ 60,00\n- 1x Limonada - R$ 10,00\nFrete: R$ 10,00.\nTotal: R$ 80,00.\nPosso fechar seu pedido e gerar o pagamento?");
    else assistant("Você quer continuar por aqui?");
  }
  function corruptedRevision() {
    customer("quero alterar nada não so estou agradecendo pelo frete gratis");
    const source_message_id = ctx.messages.at(-1)!.id;
    const draft = { organization_id: "store", conversation_id: "conversation", instance_id: "instance", order_id: "order", request_id: "corrupted-proposal",
      expected_revision: 0, source_message_id, items: [{ id: "pizza", quantity: 1, mention_text: catalog[0].title }],
      address: null, cep: null, method: null, ready: false, preview_text: null, total: null, preferred_method: "card" };
    metadata({ checkout_order_revision: draft, checkout_order_revisions: { conversation: draft } });
    assistant("Me informe o novo endereço completo com CEP para eu recalcular a entrega.");
  }
  return { ctx, db, call, requests, transport, persistence, createPayment, turn, assistant, customer, draft, metadata, legacyCart, corruptedRevision };
}

describe("revising a persisted WhatsApp order", () => {
  it("interprets an unanswered inbound burst before accepting its final sim", async () => {
    const s = scenario();
    s.customer("adicione uma limonada");
    const preview = await s.turn("sim");
    expect(preview?.text).toContain("Limonada");
    expect(s.draft()?.items.map(item => [item.id, item.quantity])).toEqual([["pizza", 1], ["lemonade", 1]]);
    expect(s.persistence).not.toHaveBeenCalled();
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
  });
  it("adds the requested item, preserves delivery/payment, and updates the same order only after its preview is accepted", async () => {
    const s = scenario();
    const preview = await s.turn("top faz o seguinte adicione uma limonada");
    expect(preview?.text).toContain("Pizza de queijo");
    expect(preview?.text).toContain("Limonada");
    expect(preview?.text).toContain("80,00");
    expect(preview?.text).toContain("Rua das Flores");
    expect(s.draft()?.items.map(item => [item.id, item.quantity])).toEqual([["pizza", 1], ["lemonade", 1]]);
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.persistence.mock.calls[0][0]).toMatchObject({ orderId: "order", expectedRevision: 0, expectedTotal: 80, preferredPaymentMethod: "card",
      shipping: { total: 10, destinationAddress: address, destinationCep: "88330786" } });
    expect(s.createPayment).toHaveBeenCalledOnce();
    expect(s.createPayment.mock.calls[0][0]).toMatchObject({ orderId: "order", amount: "80,00", preferredMethod: "card" });
    expect(s.db.tables.sales_catalog_orders).toHaveLength(1);
    expect(s.requests.at(-1)?.url).toContain("/send/menu");
    expect(s.requests.at(-1)?.body.choices).toEqual([expect.stringContaining("revised-session")]);
  });

  it.each([
    ["tire uma pizza de queijo", [["pizza", 2], ["lemonade", 1]], [["pizza", 1], ["lemonade", 1]], 80],
    ["retire a limonada", [["pizza", 1], ["lemonade", 2]], [["pizza", 1]], 70],
    ["aumente a pizza de queijo para 3", [["pizza", 1], ["lemonade", 1]], [["pizza", 3], ["lemonade", 1]], 190],
    ["reduza a pizza de queijo para 1", [["pizza", 3], ["lemonade", 1]], [["pizza", 1], ["lemonade", 1]], 80],
    ["troque a pizza de queijo pela pizza de tomate", [["pizza", 2], ["lemonade", 1]], [["lemonade", 1], ["tomato", 2]], 150],
  ] as [string, [string, number][], [string, number][], number][])("applies %s to the persisted lines and recalculates freight", async (text, quantities, expected, total) => {
    const s = scenario({ quantities });
    await s.turn(text);
    expect(s.draft()?.items.map(item => [item.id, item.quantity])).toEqual(expected);
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
    const applied = s.persistence.mock.calls[0][0];
    expect(applied.rows.map(item => [item.catalog_item_id, item.quantity])).toEqual(expected);
    expect(applied.expectedTotal).toBe(total);
    expect(applied.shipping.total).toBe(total >= 100 ? 0 : 10);
  });

  it("does not increment the cart or create a charge again on a retry or repeated confirmation", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    const requestId = s.draft()?.request_id;
    await s.turn("adicione uma limonada", true);
    expect(s.draft()?.request_id).toBe(requestId);
    expect(s.draft()?.items).toContainEqual(expect.objectContaining({ id: "lemonade", quantity: 1 }));
    await s.turn("sim");
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.createPayment).toHaveBeenCalledOnce();
  });

  it("treats 'sim mas tira' as a further edit, never acceptance of the obsolete preview", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    const before = s.draft()?.request_id;
    await s.turn("sim mas tira a limonada");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.draft()?.items).toEqual([expect.objectContaining({ id: "pizza", quantity: 1 })]);
    expect(s.draft()?.request_id).not.toBe(before);
    await s.turn("sim");
    expect(s.persistence.mock.calls[0][0].rows).toHaveLength(1);
  });

  it("requires a fresh preview after an unrelated assistant question", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    s.assistant("Você prefere conversar por aqui?");
    await s.turn("sim");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
  });

  it("asks for clarification instead of guessing a product shared by multiple variants", async () => {
    const s = scenario();
    const result = await s.turn("adicione uma pizza");
    expect(result?.text).toMatch(/nome completo|única opção/);
    expect(s.draft()?.ready).toBe(false);
    expect(s.persistence).not.toHaveBeenCalled();
    await s.turn("Pizza de tomate");
    expect(s.draft()?.items).toContainEqual(expect.objectContaining({ id: "tomato", quantity: 1 }));
    expect(s.persistence).not.toHaveBeenCalled();
  });

  it.each(["confirmed", "refunded"])("keeps a %s payment immutable", async paymentStatus => {
    const s = scenario({ paymentStatus });
    const result = await s.turn("adicione uma limonada");
    expect(result).not.toBeNull();
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
    expect(s.db.tables.sales_catalog_order_items).toHaveLength(1);
  });

  it("blocks a payment lock even when the order still appears pending", async () => {
    const s = scenario();
    s.ctx.salesCatalogOrders[0].checkoutPaymentLock = "processing";
    await s.turn("retire a pizza de queijo");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.draft()).toBeFalsy();
  });

  it("keeps the revision but gives a concrete next step when freight cannot be quoted", async () => {
    const s = scenario({ freightAvailable: false });
    const result = await s.turn("adicione uma limonada");
    expect(result?.text).toMatch(/tarifa|entrega/);
    expect(result?.text).not.toMatch(/confirma essa|posso fechar/i);
    expect(s.draft()?.ready).toBe(false);
    await s.turn("sim");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it("recalculates and asks again when a catalog price changes after the displayed preview", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    s.ctx.salesCatalog[1].price = "15,00";
    const result = await s.turn("sim");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(result?.text).toContain("85,00");
    await s.turn("sim");
    expect(s.persistence.mock.calls[0][0].expectedTotal).toBe(85);
  });

  it("does not send a payment checkout when persistence rejects a concurrent or financial change", async () => {
    const s = scenario();
    s.persistence.mockRejectedValueOnce(new Error("CHECKOUT_REVISION_CONFLICT"));
    await s.turn("adicione uma limonada");
    const result = await s.turn("sim");
    expect(result?.text).toMatch(/não consegui|confer/i);
    expect(s.createPayment).not.toHaveBeenCalled();
    expect(s.requests.every(request => request.url.endsWith("/send/text"))).toBe(true);
    expect(s.db.tables.sales_catalog_order_items).toHaveLength(1);
  });

  it("requires a new preview for changed line prices even if their changes cancel out in the total", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    s.ctx.salesCatalog[0].price = "55,00";
    s.ctx.salesCatalog[1].price = "15,00";
    const result = await s.turn("sim");
    expect(result?.text).toContain("80,00");
    expect(s.persistence).not.toHaveBeenCalled();
    await s.turn("sim");
    expect(s.persistence.mock.calls[0][0].rows.map(row => row.unit_price)).toEqual(["55,00", "15,00"]);
  });

  it("asks for the new address and CEP instead of reusing the old address as the requested change", async () => {
    const s = scenario();
    const result = await s.turn("mude o endereço");
    expect(result?.text).toMatch(/novo endereço|endereço completo/);
    expect(s.draft()?.ready).toBe(false);
    expect(s.draft()?.address).toBe(address);
    expect(s.draft()?.cep).toBe("88330786");
    expect(s.draft()?.delivery_update).toEqual({ address: null, cep: null });
    await s.turn("sim");
    expect(s.persistence).not.toHaveBeenCalled();
    await s.turn("Rua das Rosas, numero 70, Centro, Balneario Camboriu, SC, CEP 88330786");
    expect(s.draft()?.ready).toBe(true);
    await s.turn("sim");
    expect(s.persistence.mock.calls[0][0].shipping.destinationAddress).toContain("Rua das Rosas");
  });

  it("repairs an old false revision without erasing the second item previously proposed", async () => {
    const s = scenario();
    s.legacyCart();
    s.corruptedRevision();
    const reply = await s.turn("pode fechar o pedido");
    expect(reply?.text).toContain("Limonada");
    expect(reply?.text).toContain(address);
    expect(reply?.text).toContain("80,00");
    expect(reply?.text).toContain("ainda não foram gravados");
    expect(s.draft()?.items.map(item => [item.id, item.quantity])).toEqual([["pizza", 1], ["lemonade", 1]]);
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.db.tables.sales_catalog_order_items).toHaveLength(1);
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.persistence.mock.calls[0][0].rows).toHaveLength(2);
    expect(s.persistence.mock.calls[0][0].shipping.destinationAddress).toBe(address);
  });

  it("cancels an unresolved address change when the customer explicitly asks to keep the order", async () => {
    const s = scenario();
    await s.turn("mude o endereço");
    const reply = await s.turn("quero alterar nada não so estou agradecendo pelo frete gratis");
    expect(reply?.text).toContain("Não fiz nenhuma alteração");
    expect(s.draft()).toBeNull();
    expect(s.db.tables.sales_catalog_orders[0].destination_address).toBe(address);
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it("does not accept a pending item proposal from a generic no-change declaration", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    const reply = await s.turn("não quero alterar nada só pode fechar");
    expect(reply?.text).toContain("Limonada");
    expect(reply?.text).toContain("Confirma essa alteração?");
    expect(s.persistence).not.toHaveBeenCalled();
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
  });

  it.each(["top pode fechar obrigado por tirar o frete pode fechar", "quero alterar nada não so estou agradecendo pelo frete gratis"])("does not create a product or address revision from courtesy: %s", async text => {
    const s = scenario();
    const reply = await s.turn(text);
    expect(reply).toBeNull();
    expect(s.draft()).toBeFalsy();
    expect(s.persistence).not.toHaveBeenCalled();
  });

  it("accumulates a replacement destination without overwriting the old one with only a CEP", async () => {
    const s = scenario();
    await s.turn("mude o endereço");
    await s.turn("88330800");
    expect(s.draft()?.address).toBe(address);
    expect(s.draft()?.cep).toBe("88330786");
    expect(s.draft()?.delivery_update).toEqual({ address: null, cep: "88330800" });
    expect(s.draft()?.ready).toBe(false);
    await s.turn("Rua das Rosas, numero 70, Centro, Balneario Camboriu, SC");
    expect(s.draft()?.address).toContain("Rua das Rosas");
    expect(s.draft()?.cep).toBe("88330800");
    expect(s.draft()?.delivery_update).toBeNull();
    expect(s.persistence).not.toHaveBeenCalled();
  });

  it("reconciles a scoped legacy cart as a new proposal, never as old consent", async () => {
    const s = scenario();
    s.legacyCart();
    const reply = await s.turn("sim");
    expect(reply?.text).toContain("Limonada");
    expect(reply?.text).toContain("Confirma essa alteração?");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
  });

  it.each(["no_preview", "conversation", "instance", "organization", "old", "unknown_product", "invalid_quantity"])("does not recover an unverified legacy cart: %s", invalid => {
    const s = scenario();
    s.legacyCart(invalid !== "no_preview");
    const draft = structuredClone(s.ctx.lead.metadata.checkout_cart_draft) as Row;
    if (["conversation", "instance", "organization"].includes(invalid)) draft[`${invalid}_id`] = "another";
    if (invalid === "old") draft.updated_at = s.db.tables.sales_catalog_orders[0].created_at;
    if (invalid === "unknown_product") draft.items = [{ id: "unknown", quantity: 1 }];
    if (invalid === "invalid_quantity") draft.items = [{ id: "pizza", quantity: "1" }, { id: "lemonade", quantity: "1" }];
    s.metadata({ checkout_cart_draft: draft });
    return s.turn("sim").then(reply => {
      expect(reply).toBeNull();
      expect(s.draft()).toBeFalsy();
      expect(s.persistence).not.toHaveBeenCalled();
    });
  });

  it("does not reintroduce a legacy item after the customer explicitly removed it from the revision", async () => {
    const s = scenario();
    s.legacyCart();
    await s.turn("sim");
    await s.turn("retire a limonada");
    expect(s.draft()?.items.map(item => item.id)).toEqual(["pizza"]);
    await s.turn("sim");
    expect(s.persistence.mock.calls[0][0].rows.map(item => item.catalog_item_id)).toEqual(["pizza"]);
  });

  it("does not revive a legacy proposal for an isolated sim answering a different conversation prompt", async () => {
    const s = scenario();
    s.legacyCart();
    s.customer("oi");
    s.assistant("Olá! Quer conversar por aqui?");
    expect(await s.turn("sim")).toBeNull();
    expect(s.draft()).toBeFalsy();
    expect(s.persistence).not.toHaveBeenCalled();
  });

  it("does not attach an earlier legacy cart to a new purchase journey", async () => {
    const s = scenario();
    s.legacyCart();
    s.customer("quero fazer um novo pedido");
    s.metadata({ checkout_journey: { organization_id: "store", conversation_id: "conversation", instance_id: "instance", started_at: s.ctx.messages.at(-1)!.occurred_at } });
    s.assistant("Qual pizza você quer para o novo pedido?");
    expect(await s.turn("pode fechar o pedido")).toBeNull();
    expect(s.draft()).toBeFalsy();
    expect(s.persistence).not.toHaveBeenCalled();
  });

  it("preserves a pending product choice through unrelated gratitude", async () => {
    const s = scenario();
    await s.turn("adicione uma pizza");
    expect(s.draft()?.pending_intent?.productText).toBe("pizza");
    const reply = await s.turn("obrigado");
    expect(reply).toBeNull();
    expect(s.draft()?.pending_intent?.productText).toBe("pizza");
    expect(s.draft()?.address).toBe(address);
    expect(s.persistence).not.toHaveBeenCalled();
  });

  it.each(["obrigado por não tirar a pizza de queijo", "obrigado por não tirar a pizza de queijo do pedido", "obrigado pelo frete da pizza de queijo", "qual é a pizza de queijo?"])("does not complete a pending removal from gratitude or a question: %s", async text => {
    const s = scenario();
    await s.turn("remova o item da promoção");
    expect(s.draft()?.pending_intent?.kind).toBe("remove");
    const reply = await s.turn(text);
    expect(reply).toBeNull();
    expect(s.draft()?.items).toEqual([expect.objectContaining({ id: "pizza", quantity: 1 })]);
    expect(s.draft()?.pending_intent?.kind).toBe("remove");
    expect(s.persistence).not.toHaveBeenCalled();
  });

  it("replaces the preview instead of accepting its old destination when sim includes a new address", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    const reply = await s.turn("sim, Rua dos Ipês, numero 30, Centro, Florianópolis, SC, CEP 88010000");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
    expect(reply?.text).toContain("Rua dos Ipês");
    expect(reply?.text).toContain("Confirma essa alteração?");
    expect(s.draft()?.cep).toBe("88010000");
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.persistence.mock.calls[0][0].shipping.destinationCep).toBe("88010000");
  });

  it("can confirm the displayed proposal when the customer repeats the same saved destination", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    await s.turn(`sim, ${address}`);
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.persistence.mock.calls[0][0].shipping.destinationAddress).toBe(address);
  });

  it("requires the rest of the new destination when sim supplies only a different CEP", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    await s.turn("sim, CEP 88010000");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.draft()?.ready).toBe(false);
    expect(s.draft()?.address).toBe(address);
    expect(s.draft()?.delivery_update?.cep).toBe("88010000");
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it("updates payment preference within the revision without losing the newly added item", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    const result = await s.turn("muda o pagamento para Pix");
    expect(result?.text).toContain("Limonada");
    expect(result?.text).toContain("Pix");
    expect(s.persistence).not.toHaveBeenCalled();
    await s.turn("sim");
    expect(s.persistence.mock.calls[0][0]).toMatchObject({ preferredPaymentMethod: "pix", expectedTotal: 80 });
    expect(s.createPayment.mock.calls[0][0].preferredMethod).toBe("pix");
  });

  it("does not turn removal of the final item into a zero-value checkout", async () => {
    const s = scenario();
    const result = await s.turn("retire a pizza de queijo");
    expect(result?.text).toMatch(/sem itens/);
    expect(s.draft()?.ready).toBe(false);
    await s.turn("sim");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it.each(["leadId", "companyId", "conversationId"] as const)("does not adopt an order from another %s", async field => {
    const s = scenario();
    s.ctx.salesCatalogOrders[0][field] = "other";
    await s.turn("adicione uma limonada");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
    expect(s.draft()).toBeFalsy();
  });

  it("retains the applied revision after uncertain button delivery and retries without another revision or charge", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    s.transport.menuStatus = 408;
    await expect(s.turn("sim")).rejects.toThrow();
    expect(s.draft()).toMatchObject({ applied: true });
    s.transport.menuStatus = 200;
    await s.turn("sim", true);
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.createPayment).toHaveBeenCalledOnce();
    expect(s.draft()).toBeNull();
  });

  it("normalizes a persisted CEP with a hyphen before quoting and committing a revision", async () => {
    const s = scenario();
    s.ctx.salesCatalogOrders[0].destinationCep = "88330-786";
    s.db.tables.sales_catalog_orders[0].destination_cep = "88330-786";
    const result = await s.turn("adicione uma limonada");
    expect(result?.text).toContain("80,00");
    await s.turn("sim");
    expect(s.persistence.mock.calls[0][0].shipping.destinationCep).toBe("88330786");
  });

  it("retains the committed proposal when the gateway is unavailable and retries only the payment step", async () => {
    const s = scenario();
    s.createPayment.mockImplementationOnce(async input => ({
      session: { id: "failed-session", organization_id: "store", order_id: input.orderId, provider: "asaas", method: input.preferredMethod,
        amount: input.amount, status: "error", providerStatus: "gateway_error", checkout_url: "https://loja.example/checkout/failed-session", pix_qr_code: null },
      checkoutUrl: "https://loja.example/checkout/failed-session", pixQrCode: null, gatewayUnavailable: true,
    }));
    await s.turn("adicione uma limonada");
    const proposal = s.draft()?.request_id;
    await s.turn("sim");
    expect(s.draft()).toMatchObject({ applied: true, request_id: proposal });
    expect(s.requests.some(request => request.url.endsWith("/send/menu"))).toBe(false);
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.createPayment).toHaveBeenCalledTimes(2);
    expect(s.draft()).toBeNull();
  });

  it("preserves another conversation's revision while creating and completing the current revision", async () => {
    const s = scenario();
    const other = { organization_id: "store", conversation_id: "other-conversation", instance_id: "other-instance", order_id: "other-order",
      request_id: "other-proposal", expected_revision: 4, items: [{ id: "lemonade", quantity: 2 }], ready: true };
    s.ctx.lead.metadata.checkout_order_revision = structuredClone(other);
    (s.db.tables.leads[0].metadata as Row).checkout_order_revision = structuredClone(other);
    await s.turn("adicione uma limonada");
    expect((s.ctx.lead.metadata.checkout_order_revisions as Row)["other-conversation"]).toEqual(other);
    await s.turn("sim");
    expect((s.ctx.lead.metadata.checkout_order_revisions as Row)["other-conversation"]).toEqual(other);
    expect((s.ctx.lead.metadata.checkout_order_revisions as Row).conversation).toBeUndefined();
  });
});
