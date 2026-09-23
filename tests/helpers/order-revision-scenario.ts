import { vi } from "vitest";
import * as catalogShared from "@/lib/sales-catalog/shared";
import type { SalesCatalogOrderRevisionInput } from "@/lib/sales-catalog/order-revision";
import { runtimeHarness } from "./whatsapp-runtime-harness";
import { commerceDatabase } from "./commerce-database";
import { serverModuleHarness } from "./server-module-harness";

export type Row = Record<string, unknown>;
export type Outbound = { text: string; interactiveButton?: boolean };
export const address = "Rua das Flores, numero 42, Centro, Balneario Camboriu, SC, CEP 88330786";
const mapOrder = serverModuleHarness<typeof import("@/lib/client-os/sales-catalog")>("src/lib/client-os/sales-catalog.ts", {
  "@/lib/sales-catalog/shared": catalogShared,
});
const product = (id: string, title: string, price: string) => ({
  id, title, tag: `{{produto_${id}}}`, price, currency: "BRL", status: "active",
  salesDestination: "connectyhub_checkout", inventory: { status: "in_stock", allowBackorder: false },
  offer: { salePrice: null }, skus: [], attributes: [], fulfillment: { mode: "physical" },
  shipping: { profile: "default", weightGrams: 500 }, media: [], description: "", category: "", platformProductCode: null,
});

export function scenario(options: { quantities?: [string, number][]; freightAvailable?: boolean; paymentStatus?: string } = {}) {
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
  const modelReplies: unknown[] = [];
  const modelRequests: Row[] = [];
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
    "@/lib/gemini/credentials": { normalizeGeminiModel: (model: string) => model },
    "@/lib/billing/metered-usage": { extractGeminiUsageMetadata: () => null },
  }, { fetch: async (target: string | URL, init: { body: string }) => {
    const url = String(target);
    if (url.includes("generativelanguage.googleapis.com")) {
      // Scripted model turns for the order-tools loop; never a real provider call.
      modelRequests.push(JSON.parse(init.body));
      const next = modelReplies.shift();
      if (!next) throw new Error("Unexpected model request");
      return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => next, text: async () => JSON.stringify(next) };
    }
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
  return { ctx, db, call, requests, modelReplies, modelRequests, message, transport, persistence, createPayment, turn, assistant, customer, draft, metadata, legacyCart, corruptedRevision };
}
