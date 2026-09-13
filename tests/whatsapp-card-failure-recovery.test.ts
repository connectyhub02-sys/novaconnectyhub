import { describe, expect, it, vi } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { classifyCheckoutJourney, isEditableCheckoutOrder } from "@/lib/whatsapp/order-lifecycle";

const cardId = "00000000-0000-4000-8000-000000000001";
const pixId = "00000000-0000-4000-8000-000000000002";
const invalidDocument = "11111111111";
const correctedDocument = "52998224725";
const recovery = { safe_to_retry: true, stage: "customer_create", category: "validation", field: "customer_document" };
const message = (direction: string, text: string, minute: number) => ({ id: `message-${minute}`, direction,
  text_content: text, message_type: "text", payload: {}, occurred_at: new Date(Date.UTC(2026, 8, 12, 19, minute)).toISOString() });

function scenario() {
  const order = { id: "pizza-order", companyId: "shop", leadId: "customer", conversationId: "chat", latestPaymentSessionId: cardId,
    status: "pending_payment", paymentStatus: "failed", checkoutRevision: 0, checkoutPaymentLock: null,
    customerDocument: invalidDocument, customerEmail: "client@example.invalid", customerName: "Cliente Teste", customerPhone: "5511999999999",
    destinationAddress: "Rua de Teste, 10", destinationCep: "01001000", shippingTotal: "10,00", shippingMethod: "Entrega local",
    createdAt: message("outbound", "", 0).occurred_at, checkoutConfirmedAt: message("outbound", "", 0).occurred_at,
    total: "100,00", items: [{ catalogItemId: "pizza", title: "Pizza de queijo", quantity: 1 }] };
  const ctx = { messages: [message("outbound", "Deixei o checkout para concluir seu pedido.", 1)], salesCatalogOrders: [order],
    salesCatalog: [{ id: "pizza", title: "Pizza de queijo", tag: "{{produto_pizza}}", price: "90,00", currency: "BRL", status: "active",
      salesDestination: "connectyhub_checkout", inventory: { status: "in_stock", allowBackorder: false }, offer: { salePrice: null },
      skus: [], attributes: [], fulfillment: { mode: "digital" }, media: [], description: "", category: "" }],
    salesCatalogSettings: null, salesCatalogShippingSettings: null, organization: { id: "shop", name: "Pizzaria teste" },
    agent: { id: "agent" }, instance: { id: "instance", metadata: {} }, conversationId: "chat", conversationMetadata: {},
    run: { id: "run" }, linkButtons: [], lead: { id: "customer", display_name: "Cliente Teste", metadata: {} as Record<string, unknown> },
    behavior: { proactiveFollowUp: false }, credentials: { baseUrl: "https://whatsapp.invalid" } };
  const db = commerceDatabase({
    sales_catalog_orders: [{ id: order.id, organization_id: "shop", lead_id: "customer", conversation_id: "chat", checkout_revision: 0,
      checkout_payment_lock: null, status: "pending_payment", payment_status: "failed", total: "100,00", customer_document: invalidDocument,
      customer_email: order.customerEmail, customer_name: order.customerName, customer_phone: order.customerPhone,
      destination_address: order.destinationAddress, destination_cep: order.destinationCep, shipping_total: "10,00", metadata: {} }],
    sales_catalog_payment_sessions: [{ id: cardId, organization_id: "shop", order_id: order.id, provider: "asaas", method: "card",
      amount: "100,00", status: "error", provider_payment_id: null, checkout_url: null, provider_status: "error", metadata: {} }],
    sales_catalog_card_attempts: [{ id: "card-attempt", organization_id: "shop", order_id: order.id, state: "error",
      diagnostic: { stage: "customer_create", category: "validation", httpStatus: 400, code: "invalid_object" } }],
    sales_catalog_order_items: [{ id: "line", organization_id: "shop", order_id: order.id, catalog_item_id: "pizza", title: "Pizza de queijo", quantity: 1 }],
    leads: [{ id: "customer", organization_id: "shop", metadata: {} }],
  });
  const loadCheckout = serverModuleHarness<typeof import("../src/lib/sales-catalog/transparent-checkout")>("src/lib/sales-catalog/transparent-checkout.ts", {
    "./public-commerce-access": { assertPublicCommerceAccess: async () => undefined },
    "@/lib/client-os/sales-catalog": { getOrganizationSalesCatalogSettings: async () => null },
    "./checkout-customer": { loadCheckoutCustomer: async (_c: unknown, _o: string, row: unknown) => row,
      parseCheckoutAddress: () => ({ addressNumber: "10" }) },
    "./card-input": { record: (value: unknown) => value && typeof value === "object" ? value : {} },
    "./mercado-pago": { normalizeCurrencyAmount: (value: string) => Number(value.replace(",", ".")) },
  });
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const createPayment = vi.fn(async (input: { orderId: string }) => {
    expect(input.orderId).toBe(order.id);
    const valid = db.tables.sales_catalog_orders[0].customer_document === correctedDocument;
    const row = { id: pixId, organization_id: "shop", order_id: order.id, provider: "asaas", method: "pix", amount: "100,00",
      status: valid ? "pending" : "error", provider_status: valid ? "PENDING" : "gateway_error", provider_payment_id: valid ? "fake-pix" : null,
      checkout_url: "https://shop.example/checkout/fake", pix_qr_code: valid ? "TEST-PIX-NOT-PAYABLE" : null,
      metadata: { gateway_request_inflight: false, payment_recovery: valid ? null : recovery } };
    db.tables.sales_catalog_payment_sessions = [db.tables.sales_catalog_payment_sessions[0], row];
    order.latestPaymentSessionId = pixId;
    return { session: { id: pixId, amount: "100,00", provider: "asaas", providerStatus: row.provider_status,
      failureReason: valid ? null : "O CPF/CNPJ informado é inválido." }, checkoutUrl: row.checkout_url,
      pixQrCode: row.pix_qr_code, pixTicketUrl: null, gatewayUnavailable: !valid, paymentRecovery: valid ? undefined : recovery };
  });
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
    const saved = db.tables.sales_catalog_orders[0];
    if (saved.checkout_payment_lock || saved.checkout_revision !== args.p_expected_revision || saved.payment_status === "confirmed") {
      return { data: null, error: { message: "CHECKOUT_CHANGED" } };
    }
    saved[String(args.p_field)] = args.p_value;
    saved.checkout_revision = Number(saved.checkout_revision) + 1;
    const session = db.tables.sales_catalog_payment_sessions.find(row => row.id === args.p_session_id)!;
    session.metadata = { gateway_request_inflight: false, payment_recovery: { safe_to_retry: true, stage: "customer_create", category: "validation" } };
    return { data: { order_id: order.id, checkout_revision: saved.checkout_revision }, error: null };
  });
  const client = { ...db.client, rpc };
  const call = runtimeHarness({
    "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment },
    "@/lib/sales-catalog/transparent-checkout": { loadTransparentCheckout: loadCheckout.loadTransparentCheckout },
  }, { fetch: async (url: string, init: { body: string }) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => JSON.stringify({ id: `delivery-${requests.length}` }) };
  } });
  let minute = 2;
  async function turn(text: string, entry = "maybeSendExistingSalesCatalogCheckoutLink") {
    const inbound = message("inbound", text, minute++);
    ctx.messages.push(inbound);
    ctx.run.id = `run-${minute}`;
    db.tables.conversation_messages = [{ ...inbound, conversation_id: "chat", whatsapp_instance_id: "instance" }];
    const result = await call<Promise<{ text: string } | null>>(entry, {
      client, context: ctx, token: "fake", phone: "5500000000000", latestInbound: inbound, userText: text });
    if (result) ctx.messages.push(message("outbound", result.text, minute++));
    return result;
  }
  return { order, ctx, db, client, call, requests, createPayment, rpc, turn };
}

describe("card refusal and payer correction on the same WhatsApp order", () => {
  it("selects a failed order for payment recovery without making its cart editable", () => {
    const s = scenario();
    expect(isEditableCheckoutOrder(s.order)).toBe(false);
    expect(classifyCheckoutJourney({ text: "troca por Pix", conversationId: "chat", organizationId: "shop", leadId: "customer", orders: [s.order] }))
      .toMatchObject({ kind: "payment_resume", order: s.order });
  });

  it.each(["error", "rejected"])("recovers %s → Pix, asks only for the rejected document and replaces it before retrying", async state => {
    const s = scenario();
    s.db.tables.sales_catalog_card_attempts[0].state = state;
    s.db.tables.sales_catalog_checkout_capabilities = [{ organization_id: "shop", transparent_card_enabled: false }];
    const first = await s.turn("faz o seguinte troca por pix por favor");
    expect(first?.text).toMatch(/CPF ou CNPJ.*correto/);
    expect(first?.text).not.toMatch(/confirm|equipe|humano|endereço/i);
    expect(s.createPayment).toHaveBeenCalledTimes(1);
    expect(await s.turn("sim pode")).toMatchObject({ text: first?.text });
    expect(s.createPayment).toHaveBeenCalledTimes(1);
    const correction = await s.turn(`meu CPF é ${correctedDocument}`);
    expect(correction).not.toBeNull();
    expect(s.rpc).toHaveBeenCalledWith("recover_sales_catalog_payment_customer_field", expect.objectContaining({
      p_order_id: "pizza-order", p_conversation_id: "chat", p_lead_id: "customer", p_session_id: pixId,
      p_expected_revision: 0, p_field: "customer_document", p_value: correctedDocument }));
    expect(s.createPayment).toHaveBeenCalledTimes(2);
    expect(s.requests.at(-1)?.body.choices).toEqual(["Copiar Pix|copy:TEST-PIX-NOT-PAYABLE"]);
    expect(s.db.tables.sales_catalog_orders).toHaveLength(1);
    expect(s.db.tables.sales_catalog_orders[0]).toMatchObject({ customer_document: correctedDocument,
      customer_email: "client@example.invalid", destination_address: "Rua de Teste, 10", shipping_total: "10,00", total: "100,00" });
    expect(s.db.tables.sales_catalog_order_items).toHaveLength(1);
    expect(s.db.tables.conversations ?? []).toHaveLength(0);
  });

  it.each(["processing", "unknown", "pending", "approved", "refunded", "unclassified_error"])("does not create Pix from an unsafe card state: %s", async state => {
    const s = scenario();
    s.db.tables.sales_catalog_card_attempts[0].state = state === "unclassified_error" ? "error" : state;
    if (state === "unclassified_error") s.db.tables.sales_catalog_card_attempts[0].diagnostic = null;
    expect((await s.turn("troca por Pix"))?.text).toContain("conferir a tentativa");
    expect(s.createPayment).not.toHaveBeenCalled();
    expect(s.rpc).not.toHaveBeenCalled();
  });

  it.each(["review", "paid", "lock", "changed_total", "changed_revision", "another_conversation"])("revalidates live %s before resuming", async guard => {
    const s = scenario();
    const saved = s.db.tables.sales_catalog_orders[0];
    if (guard === "review") s.db.tables.sales_catalog_payment_reviews = [{ organization_id: "shop", order_id: "pizza-order", lead_id: "customer", status: "open" }];
    if (guard === "paid") saved.payment_status = "confirmed";
    if (guard === "lock") saved.checkout_payment_lock = "attempt-in-progress";
    if (guard === "changed_total") saved.total = "110,00";
    if (guard === "changed_revision") saved.checkout_revision = 1;
    if (guard === "another_conversation") saved.conversation_id = "other-chat";
    await s.turn("troca por Pix");
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it("keeps an uncertain Pix locked even when the customer supplies another document", async () => {
    const s = scenario();
    await s.turn("troca por Pix");
    s.db.tables.sales_catalog_payment_sessions[1].metadata = { gateway_request_inflight: true, payment_recovery: { safe_to_retry: false, stage: "payment_create", category: "unknown" } };
    await s.turn(`CPF ${correctedDocument}`);
    expect(s.rpc).not.toHaveBeenCalled();
    expect(s.createPayment).toHaveBeenCalledTimes(1);
  });

  it("uses the atomic rejection when a payment starts after the snapshot", async () => {
    const s = scenario();
    await s.turn("troca por Pix");
    s.rpc.mockImplementationOnce(async () => ({ data: null, error: { message: "CHECKOUT_CHANGED" } }));
    await s.turn(`CPF ${correctedDocument}`);
    expect(s.createPayment).toHaveBeenCalledTimes(1);
    expect(s.db.tables.sales_catalog_orders[0].customer_document).toBe(invalidDocument);
  });

  it("keeps an invalid replacement document in conversation without retrying or escalating", async () => {
    const s = scenario();
    await s.turn("troca por Pix");
    expect((await s.turn("CPF 11111111111"))?.text).toMatch(/CPF ou CNPJ.*correto/);
    expect(s.rpc).not.toHaveBeenCalled();
    expect(s.createPayment).toHaveBeenCalledTimes(1);
    s.rpc.mockImplementationOnce(async () => ({ data: null, error: { message: "CHECKOUT_RECOVERY_INVALID_VALUE" } }));
    expect((await s.turn(`CPF ${correctedDocument}`))?.text).toMatch(/CPF ou CNPJ.*correto/);
    expect(s.createPayment).toHaveBeenCalledTimes(1);
    expect(s.db.tables.conversations ?? []).toHaveLength(0);
  });

  it.each([
    ["customer_email", "novo@example.invalid", "customerEmail"],
    ["customer_name", "Maria Oliveira", "customerName"],
    ["customer_phone", "11988887777", "customerPhone"],
  ])("corrects only %s and uses the current order's value for the retry", async (field, value, property) => {
    const s = scenario();
    s.ctx.lead.metadata = { email: "stale@example.invalid", customer_email: "stale@example.invalid" };
    await s.turn("troca por Pix");
    const updatedRecovery = { ...recovery, field };
    (s.ctx.lead.metadata.checkout_runtime_state as Record<string, unknown>).payment_recovery = updatedRecovery;
    s.db.tables.sales_catalog_payment_sessions[1].metadata = { gateway_request_inflight: false, payment_recovery: updatedRecovery };
    await s.turn(value);
    expect(s.rpc).toHaveBeenCalledWith("recover_sales_catalog_payment_customer_field", expect.objectContaining({ p_field: field }));
    expect(s.order).toHaveProperty(property, field === "customer_phone" ? `55${value}` : value);
    expect(s.createPayment).toHaveBeenCalledTimes(2);
    if (field === "customer_email") expect(s.createPayment).toHaveBeenLastCalledWith(expect.objectContaining({ payerEmail: value }));
  });

  it("does not bring another conversation's pending correction into this order", async () => {
    const s = scenario();
    await s.turn("troca por Pix");
    (s.ctx.lead.metadata.checkout_runtime_state as Record<string, unknown>).conversation_id = "other-chat";
    await s.turn(`CPF ${correctedDocument}`);
    expect(s.rpc).not.toHaveBeenCalled();
    expect(s.createPayment).toHaveBeenCalledTimes(1);
  });

  it("resumes the explicitly active order when an older failed duplicate also exists", async () => {
    const s = scenario();
    s.ctx.salesCatalogOrders.push({ ...s.order, id: "older-failed-order" });
    s.ctx.lead.metadata.checkout_runtime_state = { organization_id: "shop", conversation_id: "chat", instance_id: "instance",
      order_id: "pizza-order", stage: "payment_confirmation_pending", preferred_payment_method: "pix" };
    expect((await s.turn("gera o Pix por favor"))?.text).toMatch(/CPF ou CNPJ.*correto/);
    expect(s.createPayment).toHaveBeenCalledTimes(1);
    expect(s.createPayment).toHaveBeenCalledWith(expect.objectContaining({ orderId: "pizza-order" }));
  });

  it.each(["meu telefone é 11999999999", "meu email é 52998224725@example.invalid"])("does not replace the document with another labelled field: %s", async text => {
    const s = scenario();
    await s.turn("troca por Pix");
    expect((await s.turn(text))?.text).toMatch(/CPF ou CNPJ.*correto/);
    expect(s.rpc).not.toHaveBeenCalled();
    expect(s.createPayment).toHaveBeenCalledTimes(1);
  });

  it("does not retry the same rejected value even when its document checksum is valid", async () => {
    const s = scenario();
    await s.turn("troca por Pix");
    s.order.customerDocument = correctedDocument;
    s.db.tables.sales_catalog_orders[0].customer_document = correctedDocument;
    expect((await s.turn(`CPF ${correctedDocument}`))?.text).toMatch(/CPF ou CNPJ.*correto/);
    expect(s.rpc).not.toHaveBeenCalled();
    expect(s.createPayment).toHaveBeenCalledTimes(1);
  });

  it("shows the rejected field in context instead of prohibiting its correction", async () => {
    const s = scenario();
    await s.turn("troca por Pix");
    s.ctx.lead.metadata.customer_document = invalidDocument;
    const lines = s.call<string[]>("buildSalesCatalogCheckoutStateLines", s.ctx.lead,
      { organizationId: "shop", conversationId: "chat", instanceId: "instance" });
    expect(lines.join(" ")).toContain("CPF/CNPJ informado. Solicite apenas o documento correto");
    expect(lines.join(" ")).not.toContain("CPF/CNPJ ja recebido. Nao solicite novamente");
  });

  describe.each(["maybeSendExistingSalesCatalogCheckoutLink", "maybeHandleRuntimePaymentDataRecovery"])("consent in %s", entry => {
    it.each([
      "mas não quero pagar agora",
      "mas não vou pagar",
      "mas deixa para amanhã",
      "mas vou pagar mais tarde",
      "mas cancela o pedido",
      "mas quanto fica a taxa?",
      "e adiciona uma Pizza de queijo",
      "e aumenta a Pizza de queijo para duas unidades",
      "mas muda o endereço para Rua Nova, 20",
      "endereço Rua Nova, 20, CEP 02002-000",
      "mas não gere o Pix, quero pensar",
    ])("does not turn a valid corrected document into payment consent: %s", async interruption => {
      const s = scenario();
      await s.turn("troca por Pix");
      const before = structuredClone(s.db.tables.sales_catalog_orders);
      expect(await s.turn(`Meu CPF é ${correctedDocument}, ${interruption}`, entry)).toBeNull();
      expect(s.rpc).not.toHaveBeenCalled();
      expect(s.createPayment).toHaveBeenCalledTimes(1);
      expect(s.db.tables.sales_catalog_orders).toEqual(before);
      expect(s.requests).toHaveLength(1);
    });

    it("accepts a payer-only correction under the existing payment request", async () => {
      const s = scenario();
      await s.turn("troca por Pix");
      await s.turn(`corrige meu CPF para ${correctedDocument}`, entry);
      expect(s.rpc).toHaveBeenCalledTimes(1);
      expect(s.createPayment).toHaveBeenCalledTimes(2);
    });

    it("accepts a corrected document with an explicit positive Pix request", async () => {
      const s = scenario();
      await s.turn("troca por Pix");
      await s.turn(`Meu CPF é ${correctedDocument}, pode gerar o Pix`, entry);
      expect(s.rpc).toHaveBeenCalledTimes(1);
      expect(s.createPayment).toHaveBeenCalledTimes(2);
    });
  });

  it.each([
    ["customer_document", "customerDocument", `Meu CPF é ${correctedDocument}`],
    ["customer_email", "customerEmail", "novo@example.invalid"],
    ["customer_name", "customerName", "Maria Oliveira"],
  ])("leaves an empty rejected %s for the atomic recovery even when the order is pending", async (field, property, text) => {
    const s = scenario();
    await s.turn("troca por Pix");
    s.order.paymentStatus = "pending";
    s.db.tables.sales_catalog_orders[0].payment_status = "pending";
    Object.assign(s.order, { [property]: "" });
    s.db.tables.sales_catalog_orders[0][field] = null;
    const updatedRecovery = { ...recovery, field };
    (s.ctx.lead.metadata.checkout_runtime_state as Record<string, unknown>).payment_recovery = updatedRecovery;
    s.db.tables.sales_catalog_payment_sessions[1].metadata = { gateway_request_inflight: false, payment_recovery: updatedRecovery };
    for (const attach of ["maybeAttachSalesCatalogCustomerNameToOrder", "maybeAttachSalesCatalogCustomerBillingDetailsToOrder"]) {
      expect(await s.call(attach, { client: s.client, context: s.ctx, userText: text })).toBeNull();
    }
    expect(s.db.tables.sales_catalog_orders[0][field]).toBeNull();
    await s.turn(text);
    expect(s.rpc).toHaveBeenCalledTimes(1);
    expect(s.createPayment).toHaveBeenCalledTimes(2);
  });

  it("prompts for legacy explicit CPF validation without lifting its lock before the RPC", async () => {
    const s = scenario();
    s.db.tables.sales_catalog_payment_sessions[0] = { id: cardId, organization_id: "shop", order_id: "pizza-order", provider: "asaas",
      method: "pix", status: "error", amount: "100,00", provider_status: "gateway_error", provider_payment_id: null,
      failure_reason: "O CPF/CNPJ informado é inválido.", metadata: { gateway_request_inflight: true, gateway_error: "O CPF/CNPJ informado é inválido." } };
    s.db.tables.sales_catalog_card_attempts = [];
    expect((await s.turn("gera o Pix por favor"))?.text).toMatch(/CPF ou CNPJ.*correto/);
    expect(s.createPayment).not.toHaveBeenCalled();
    expect(s.db.tables.sales_catalog_payment_sessions[0].metadata).toMatchObject({ gateway_request_inflight: true });
    await s.turn(`CPF ${correctedDocument}`);
    expect(s.rpc).toHaveBeenCalledTimes(1);
    expect(s.createPayment).toHaveBeenCalledTimes(1);
  });
});
