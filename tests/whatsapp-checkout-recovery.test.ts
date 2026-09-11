import { describe, expect, it, vi } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";

const product = {
  id: "kit", title: "Kit de escritório", tag: "{{produto_kit}}", price: "90,00", currency: "BRL",
  status: "active", salesDestination: "connectyhub_checkout", inventory: { status: "in_stock", allowBackorder: false },
  offer: { salePrice: null }, skus: [], attributes: [], fulfillment: { mode: "physical" },
  shipping: { profile: "default", weightGrams: 500 }, media: [], description: "", category: "", platformProductCode: null,
};
const address = "Rua das Flores, número 42, Centro, Florianópolis, CEP 88010000";
const message = (direction: string, text: string, minute: number) => ({
  id: `msg-${minute}`, direction, text_content: text, message_type: "text", payload: {},
  occurred_at: new Date(Date.UTC(2026, 8, 8, 12, minute)).toISOString(),
});
const preview = "Antes de fechar, confirma se o pedido ficou assim:\n- 1x Kit de escritório - R$ 90,00\n- Frete: R$ 0,00\nTotal: R$ 90,00.\nPosso fechar seu pedido e gerar o pagamento?";
const context = (reply = "sim") => ({
  messages: [message("outbound", `Tenho um endereço salvo: ${address}. Posso usar esse mesmo endereço?`, 0),
    message("inbound", "sim esse mesmo, vou pagar no Pix", 1), message("outbound", preview, 2), message("inbound", reply, 3)],
  salesCatalog: [product], salesCatalogOrders: [] as Record<string, unknown>[],
  salesCatalogShippingSettings: { configured: true, shippingEnabled: true, localPickup: true, localDeliveryEnabled: false,
    localDeliveryZones: [], defaultHandlingDays: 0, rules: [{ uf: "SC", state: "Santa Catarina", active: true,
      price: "10,00", freeShippingThreshold: "80,00", minDays: 1, maxDays: 3, services: [], cepStart: null, cepEnd: null }] },
  organization: { id: "store", name: "Loja teste" }, agent: { id: "agent" }, instance: { id: "instance", metadata: {} },
  conversationId: "conversation", conversationMetadata: {}, run: { id: "run" },
  lead: { id: "lead", display_name: "Maria Oliveira", phone_number: "5511999999999", metadata: {
    person_name: "Maria Oliveira", email: "maria@example.test", customer_document: "12345678901", delivery_address: address, delivery_cep: "88010000",
  } }, behavior: { proactiveFollowUp: false, humanInterventionMinutes: 30 }, linkButtons: [], salesCatalogSettings: null,
  credentials: { baseUrl: "https://whatsapp.invalid" },
});
const selections = [{ item: product, quantity: 1, source: "confirmation_preview", mentionText: "1x Kit de escritório" }];

describe("checkout continuation without repeating confirmed steps", () => {
  it("persists address consent across truncated history and invalidates changed destinations", async () => {
    const call = runtimeHarness(), ctx = context();
    const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: ctx.lead.metadata }] });
    await call("persistRuntimeSavedDeliveryConsent", db.client, ctx);
    expect(db.tables.leads[0].metadata).toHaveProperty("checkout_delivery_consent");
    ctx.messages = [message("inbound", "me manda o Pix", 4)];
    expect(call("resolveInitialSalesCatalogOrderShipping", { context: ctx, selections, intentText: "me manda o Pix" }))
      .toMatchObject({ destinationAddress: address });
    ctx.messages.push(message("inbound", "muda para outro endereço", 5));
    expect(call("resolveInitialSalesCatalogOrderShipping", { context: ctx, selections, intentText: "muda para outro endereço" })).toBeNull();
  });
  it("does not apply saved delivery consent to another conversation or the next day", async () => {
    const call = runtimeHarness(), ctx = context();
    const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: ctx.lead.metadata }] });
    await call("persistRuntimeSavedDeliveryConsent", db.client, ctx);
    ctx.messages = [message("inbound", "me manda o Pix", 4)];
    ctx.conversationId = "another-conversation";
    expect(call("resolveInitialSalesCatalogOrderShipping", { context: ctx, selections, intentText: "me manda o Pix" })).toBeNull();
    ctx.conversationId = "conversation";
    ctx.messages = [message("inbound", "me manda o Pix", 1444)];
    expect(call("resolveInitialSalesCatalogOrderShipping", { context: ctx, selections, intentText: "me manda o Pix" })).toBeNull();
  });
  it("does not let the AI claim a Pix was generated without an executed payment action", () => {
    const call = runtimeHarness();
    const replacement = call<string>("guardUnexecutedCheckoutClaim", "Pedido fechado com sucesso. Tô gerando o Pix!", context());
    expect(replacement).toContain("Não tenho confirmação de envio");
    expect(call("guardUnexecutedCheckoutClaim", "Você prefere Pix ou cartão?", context())).toBeNull();
  });
  it.each(["gostei kkkkkkkk pode finalizar", "perfeito, pode concluir", "beleza, pode prosseguir", "pode finalizar o pedido?"])("recognizes contextual consent: %s", reply => {
    const call = runtimeHarness();
    expect(call("hasRecentSalesCatalogCheckoutConfirmation", context(reply), reply)).toBe(true);
    const noPreview = { ...context(reply), messages: [message("inbound", reply, 0)] };
    expect(call("hasRecentSalesCatalogCheckoutConfirmation", noPreview, reply)).toBe(false);
  });
  it.each(["gostei, mas não pode finalizar", "antes de finalizar, quanto fica?", "sim, troca o endereço", "obrigado", "pode finalizar depois", "vou pensar"])("does not charge on a question, refusal or deferred decision: %s", reply => {
    expect(runtimeHarness()("hasRecentSalesCatalogCheckoutConfirmation", context(reply), reply)).toBe(false);
  });
  it("accepts a confirmed total with zero freight instead of repeating the summary", () => {
    const call = runtimeHarness(), ctx = context();
    expect(call("resolveInitialSalesCatalogOrderShipping", { context: ctx, selections, intentText: "sim" })).toMatchObject({ shippingTotal: "R$ 0,00" });
    expect(call("needsSalesCatalogCheckoutTotalConfirmation", { context: ctx, selections, intentText: "sim" })).toBe(false);
  });
  it("keeps saved delivery consent while the customer asks again for Pix", () => {
    const call = runtimeHarness(), ctx = context("me manda o píx");
    expect(call("resolveInitialSalesCatalogOrderShipping", { context: ctx, selections, intentText: "me manda o píx" }))
      .toMatchObject({ destinationCep: "88010000", destinationAddress: address, shippingTotal: "R$ 0,00" });
    expect(call("buildSalesCatalogDeliveryDetailsBeforeCheckoutPrompt", { context: ctx, latestInbound: ctx.messages.at(-1), selections,
      intentText: "me manda o píx", hasOrderIntent: true })).toBeNull();
  });
  it("requires new delivery details after an address change", () => {
    const ctx = context("A entrega agora é na Rua Nova, número 10, Centro, Curitiba");
    expect(runtimeHarness()("resolveInitialSalesCatalogOrderShipping", { context: ctx, selections, intentText: ctx.messages.at(-1)!.text_content })).toBeNull();
  });
  it("requires confirmation when freight or product prices change", () => {
    const ctx = context();
    ctx.salesCatalogShippingSettings.rules[0].freeShippingThreshold = "800,00";
    expect(runtimeHarness()("needsSalesCatalogCheckoutTotalConfirmation", { context: ctx, selections, intentText: "sim" })).toBe(true);
  });
  it("creates one real system action before sending a successful payment response", async () => {
    const ctx = context("gostei kkkkkkkk pode finalizar");
    const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: ctx.lead.metadata }],
      conversation_messages: [{ ...ctx.messages.at(-1), conversation_id: "conversation", whatsapp_instance_id: "instance" }] });
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const createPayment = vi.fn(async () => {
      expect(db.tables.sales_catalog_orders).toHaveLength(1);
      expect(db.tables.sales_catalog_orders[0]).toMatchObject({ total: "90,00", shipping_total: "R$ 0,00", destination_address: address });
      expect(requests).toHaveLength(0);
      return { session: { provider: "asaas", amount: "90,00" }, checkoutUrl: "https://loja.example/checkout/fake", pixQrCode: "000201-TEST-NOT-PAYABLE" };
    });
    const call = runtimeHarness({
      "@/lib/client-os/sales-catalog": { mapSalesCatalogOrder: (row: Record<string, unknown>, items: Record<string, unknown>[]) => ({
        id: row.id, total: row.total, shippingTotal: row.shipping_total, items: items.map(item => ({ catalogItemId: item.catalog_item_id, title: item.title, quantity: item.quantity })),
      }) }, "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment },
    }, { fetch: async (url: string, init: { body: string }) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "fake-delivery" }) };
    } });
    const result = await call<Promise<{ text: string }[]>>("sendAgentResponse", { client: db.client, context: ctx, token: "fake", phone: "5511999999999",
      text: "Pedido fechado com sucesso! Tô gerando o Pix. {{produto_kit}}" });
    expect(createPayment).toHaveBeenCalledOnce();
    expect(result).toHaveLength(1);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://whatsapp.invalid/send/menu");
    expect(requests[0].body).toMatchObject({ choices: ["Copiar Pix|copy:000201-TEST-NOT-PAYABLE"] });
  });
});

describe("payment recovery and duplicate prevention", () => {
  it.each([408, 500])("records uncertain card-link delivery without sending a second format after HTTP %s", async status => {
    const ctx = context(), db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: ctx.lead.metadata }] });
    const requests: string[] = [];
    const call = runtimeHarness({}, { fetch: async (url: string) => {
      requests.push(url);
      return { ok: false, status, text: async () => JSON.stringify({ error: "Delivery outcome unknown" }) };
    } });
    await expect(call<Promise<unknown>>("sendSalesCatalogPaymentLink", { client: db.client, context: ctx, token: "fake", phone: "5511999999999",
      payment: { orderId: "order", amount: "90,00", provider: "asaas", preferredMethod: "card",
        checkoutUrl: "https://loja.example/checkout/session", pixQrCode: null } })).rejects.toThrow();
    expect(requests).toEqual(["https://whatsapp.invalid/send/menu"]);
    expect(db.tables.leads[0].metadata).toMatchObject({ checkout_runtime_state: { stage: "payment_delivery_unconfirmed", order_id: "order" } });
  });
  it("falls back to the same internal card checkout URL after a definitive button rejection", async () => {
    const ctx = context(), db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: ctx.lead.metadata }] });
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const call = runtimeHarness({}, { fetch: async (url: string, init: { body: string }) => {
      requests.push({ url, body: JSON.parse(init.body) });
      const ok = url.endsWith("/send/text");
      return { ok, status: ok ? 200 : 422, text: async () => JSON.stringify(ok ? { id: "delivered" } : { error: "Unsupported button" }) };
    } });
    await call("sendSalesCatalogPaymentLink", { client: db.client, context: ctx, token: "fake", phone: "5511999999999",
      payment: { orderId: "order", amount: "90,00", provider: "asaas", preferredMethod: "card",
        checkoutUrl: "https://loja.example/checkout/session", pixQrCode: null } });
    expect(requests.map(request => request.url)).toEqual(["https://whatsapp.invalid/send/menu", "https://whatsapp.invalid/send/menu", "https://whatsapp.invalid/send/text"]);
    expect(requests[2].body.text).toContain("https://loja.example/checkout/session?payment_method=card");
    expect(db.tables.leads[0].metadata).toMatchObject({ checkout_runtime_state: { stage: "payment_sent" } });
  });
  const pendingSession = (patch = {}) => ({ id: "session", organization_id: "store", order_id: "order",
    method: "pix", provider: "asaas", amount: "90,00", status: "pending", expires_at: "2099-01-01T00:00:00Z",
    pix_qr_code: "000201-TEST-NOT-PAYABLE", checkout_url: "https://loja.example/checkout/session", metadata: {}, ...patch });
  const cardSnapshot = (patch = {}) => ({ session: pendingSession(),
    order: { id: "order", payment_status: "pending", status: "pending_payment" }, amount: 90,
    enabled: true, review: false, attempt: null, settings: { asaas: { enabledMethods: ["pix", "credit_card"] } }, ...patch });
  it("opens the existing checkout for card after an overdue Pix without creating another charge", async () => {
    const createPayment = vi.fn(), load = vi.fn(async () => cardSnapshot());
    const db = commerceDatabase({ sales_catalog_payment_sessions: [pendingSession({ provider_status: "OVERDUE", provider_payment_id: "existing-pix" })] });
    const call = runtimeHarness({
      "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment },
      "@/lib/sales-catalog/transparent-checkout": { loadTransparentCheckout: load },
    });
    const result = await call<{ checkoutUrl: string }>("maybeCreateSalesCatalogPaymentLink", {
      client: db.client, context: context("vou pagar no cartão"), orderId: "order", total: "90,00", preferredMethod: "card" });
    expect(result).toMatchObject({ orderId: "order", preferredMethod: "card", pixQrCode: null, pixTicketUrl: null });
    expect(new URL(result.checkoutUrl).pathname).toBe("/checkout/session");
    expect(load).toHaveBeenCalledOnce();
    expect(createPayment).not.toHaveBeenCalled();
    expect(db.tables.sales_catalog_payment_sessions).toHaveLength(1);
  });
  it.each([
    { review: true }, { enabled: false }, { amount: 100 },
    { session: { ...pendingSession(), organization_id: "other" } },
    { order: { id: "another-order", payment_status: "pending", status: "pending_payment" } },
    { order: { id: "order", payment_status: "confirmed", status: "paid" } },
    { order: { id: "order", payment_status: "pending", status: "pending_payment", checkout_payment_lock: "locked" } },
    { attempt: { state: "unknown" } }, { settings: { asaas: { enabledMethods: ["pix"] } } },
  ])("does not bypass a checkout guard when switching to card: %j", async patch => {
    const createPayment = vi.fn();
    const db = commerceDatabase({ sales_catalog_payment_sessions: [pendingSession({ provider_payment_id: "existing-pix" })] });
    const call = runtimeHarness({
      "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment },
      "@/lib/sales-catalog/transparent-checkout": { loadTransparentCheckout: async () => cardSnapshot(patch) },
    });
    expect(await call("maybeCreateSalesCatalogPaymentLink", { client: db.client, context: context(), orderId: "order", total: "90,00", preferredMethod: "card" }))
      .toMatchObject({ gatewayUnavailable: true, confirmationPending: true, checkoutUrl: "" });
    expect(createPayment).not.toHaveBeenCalled();
  });
  it.each(["Vou te enviar o checkout agora", "Já vou te mandar o link de pagamento", "Estou enviando o botão de compra"])("blocks an unexecuted checkout promise: %s", text => {
    expect(runtimeHarness()("guardUnexecutedCheckoutClaim", text, context())).toBeTruthy();
  });
  it("reuses the unexpired Pix and checkout without another gateway call", async () => {
    const createPayment = vi.fn(), db = commerceDatabase({ sales_catalog_payment_sessions: [pendingSession()] });
    const call = runtimeHarness({ "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment } });
    const result = await call("maybeCreateSalesCatalogPaymentLink", { client: db.client, context: context(), orderId: "order", total: "90,00", preferredMethod: "pix" });
    expect(result).toMatchObject({ orderId: "order", pixQrCode: "000201-TEST-NOT-PAYABLE", checkoutUrl: "https://loja.example/checkout/session" });
    expect(createPayment).not.toHaveBeenCalled();
  });
  it.each([
    { metadata: { gateway_request_inflight: true } },
    { status: "paid" },
    { provider_payment_id: "provider-existing", expires_at: "2000-01-01T00:00:00Z" },
  ])("does not create a replacement when an existing attempt needs reconciliation: %j", async patch => {
    const createPayment = vi.fn(), db = commerceDatabase({ sales_catalog_payment_sessions: [pendingSession(patch)] });
    const call = runtimeHarness({ "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment } });
    expect(await call("maybeCreateSalesCatalogPaymentLink", { client: db.client, context: context(), orderId: "order", total: "90,00", preferredMethod: "pix" }))
      .toMatchObject({ confirmationPending: true, gatewayUnavailable: true });
    expect(createPayment).not.toHaveBeenCalled();
  });
  it("records a gateway failure against the lead and returns a controlled failure", async () => {
    const db = commerceDatabase();
    const call = runtimeHarness({ "@/lib/sales-catalog/payment-sessions": {
      createSalesCatalogPixPaymentSession: vi.fn(async () => { throw new Error("Test gateway unavailable"); }),
    } });
    expect(await call("maybeCreateSalesCatalogPaymentLink", { client: db.client, context: context(), orderId: "order", total: "90,00", preferredMethod: "pix" }))
      .toMatchObject({ gatewayUnavailable: true, pixQrCode: null });
    expect(db.tables.intelligence_events[0]).toMatchObject({ event_type: "sales_catalog.payment_session_failed",
      payload: { lead_id: "lead", order_id: "order", conversation_id: "conversation", stage: "payment_generation_failed" } });
  });
  it("explains a pending reconciliation instead of claiming success or starting another charge", async () => {
    const ctx = context(), db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: ctx.lead.metadata }] });
    const requests: string[] = [];
    const call = runtimeHarness({}, { fetch: async (_url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body).text);
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "fake-delivery" }) };
    } });
    await call("sendSalesCatalogPaymentLink", { client: db.client, context: ctx, token: "fake", phone: "5511999999999",
      payment: { orderId: "order", amount: "90,00", gatewayUnavailable: true, confirmationPending: true,
        checkoutUrl: "", providerLabel: "Provedor", pixQrCode: null } });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("conferir a tentativa");
    expect(requests[0]).not.toMatch(/Pix pronto|gerado com sucesso|nenhuma cobrança/i);
    expect(db.tables.leads[0].metadata).toMatchObject({ checkout_runtime_state: { stage: "payment_confirmation_pending", order_id: "order" } });
    expect(db.tables.intelligence_events.some(event => event.event_type === "whatsapp.handoff.payment_issue_requested")).toBe(true);
  });
  it("records uncertain WhatsApp delivery and escalates without sending a second Pix", async () => {
    const ctx = context(), db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: ctx.lead.metadata }] });
    const requests: string[] = [];
    const call = runtimeHarness({}, { fetch: async (url: string) => {
      requests.push(url);
      return { ok: false, status: 500, text: async () => JSON.stringify({ error: "Delivery outcome unknown" }) };
    } });
    await expect(call<Promise<unknown>>("sendSalesCatalogPaymentLink", { client: db.client, context: ctx, token: "fake", phone: "5511999999999",
      payment: { orderId: "order", amount: "90,00", provider: "asaas", providerLabel: "Asaas", preferredMethod: "pix",
        checkoutUrl: "https://loja.example/checkout/session", pixQrCode: "000201-TEST-NOT-PAYABLE" } })).rejects.toThrow();
    expect(requests).toEqual(["https://whatsapp.invalid/send/menu"]);
    expect(db.tables.leads[0].metadata).toMatchObject({ checkout_runtime_state: { stage: "payment_delivery_unconfirmed", order_id: "order" } });
    expect(db.tables.intelligence_events.some(event => event.event_type === "whatsapp.handoff.payment_issue_requested")).toBe(true);
  });
  it("reserves one order for concurrent workers and reuses its Pix on a later retry", async () => {
    const ctx = context("sim, Pix"), db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: ctx.lead.metadata }] });
    const createPayment = vi.fn(async (input: { orderId: string }) => {
      db.tables.sales_catalog_payment_sessions.push(pendingSession({ order_id: input.orderId }));
      return { session: { provider: "asaas", amount: "90,00" }, checkoutUrl: "https://loja.example/checkout/session", pixQrCode: "000201-TEST-NOT-PAYABLE" };
    });
    const call = runtimeHarness({
      "@/lib/client-os/sales-catalog": { mapSalesCatalogOrder: (row: Record<string, unknown>) => ({ id: row.id, items: [] }) },
      "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment },
    });
    const run = (id: string) => call<Promise<Record<string, unknown>>>("recordSalesCatalogOrderIntent", { client: db.client,
      context: { ...structuredClone(ctx), run: { id } }, items: [], text: "Pedido confirmado", intentText: "sim, Pix" });
    const results = await Promise.all([run("run-a"), run("run-b")]);
    expect(db.tables.sales_catalog_orders).toHaveLength(1);
    expect(db.tables.sales_catalog_order_items).toHaveLength(1);
    expect(createPayment).toHaveBeenCalledOnce();
    expect(results.some(result => result.pixQrCode)).toBe(true);
    expect(await run("run-c")).toMatchObject({ pixQrCode: "000201-TEST-NOT-PAYABLE" });
    expect(createPayment).toHaveBeenCalledOnce();
  });
});
