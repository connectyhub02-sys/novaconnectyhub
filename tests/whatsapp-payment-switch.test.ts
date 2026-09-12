import { describe, expect, it, vi } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

const msg = (direction: string, text_content: string, minute: number) => ({
  id: `message-${minute}`, direction, text_content, message_type: "text", payload: {},
  occurred_at: new Date(Date.UTC(2026, 8, 12, 0, minute)).toISOString(),
});

function scenario(options: { realCheckout?: boolean; deliveryStatus?: number } = {}) {
  const session = { id: options.realCheckout ? "00000000-0000-4000-8000-000000000001" : "session", organization_id: "store", order_id: "order", method: "pix", provider: "asaas",
    amount: "90,00", status: "pending", expires_at: "2099-01-01T00:00:00Z", provider_payment_id: "existing-pix",
    pix_qr_code: "TEST-PIX-NOT-PAYABLE", checkout_url: "https://shop.example/checkout/session", metadata: { preferred_payment_method: "pix" } };
  const order = { id: "order", companyId: "store", leadId: "lead", conversationId: "conversation", latestPaymentSessionId: session.id, status: "pending_payment", paymentStatus: "pending",
    createdAt: msg("outbound", "", 0).occurred_at, checkoutConfirmedAt: msg("outbound", "", 0).occurred_at,
    total: "90,00", items: [{ catalogItemId: "kit", title: "Pizza de queijo", quantity: 1 }] };
  const ctx = {
    messages: [msg("outbound", "Pedido fechado. Gerei o Pix para você pagar direto por aqui.", 1)],
    salesCatalog: [{ id: "kit", title: "Pizza de queijo", tag: "{{produto_kit}}", price: "90,00", currency: "BRL",
      status: "active", salesDestination: "connectyhub_checkout", inventory: { status: "in_stock", allowBackorder: false },
      offer: { salePrice: null }, skus: [], attributes: [], fulfillment: { mode: "digital" }, media: [], description: "", category: "" }],
    salesCatalogOrders: [order], salesCatalogSettings: null as unknown, salesCatalogShippingSettings: null,
    organization: { id: "store", name: "Loja teste" }, agent: { id: "agent" }, instance: { id: "instance", metadata: {} },
    conversationId: "conversation", conversationMetadata: {}, run: { id: "run" }, linkButtons: [],
    lead: { id: "lead", display_name: "Maria Oliveira", metadata: {} as Record<string, unknown> },
    behavior: { proactiveFollowUp: false }, credentials: { baseUrl: "https://whatsapp.invalid" },
  };
  const db = commerceDatabase({ sales_catalog_payment_sessions: [session],
    sales_catalog_orders: [{ id: "order", organization_id: "store", total: "90,00", status: "pending_payment", payment_status: "pending", lead_id: "lead" }],
    sales_catalog_order_items: [{ id: "line", organization_id: "store", order_id: "order", catalog_item_id: "kit", title: "Pizza de queijo", quantity: 1 }],
    leads: [{ id: "lead", organization_id: "store", metadata: {} }] });
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const createPayment = vi.fn(() => { throw new Error("Must not create a second charge"); });
  const snapshot = { session, order: { id: "order", payment_status: "pending", status: "pending_payment" },
    enabled: true, review: false, amount: 90, attempt: null as unknown,
    settings: { asaas: { enabledMethods: ["pix", "credit_card"] } } };
  const checkout = serverModuleHarness<typeof import("../src/lib/sales-catalog/transparent-checkout")>("src/lib/sales-catalog/transparent-checkout.ts", {
    "./public-commerce-access": { assertPublicCommerceAccess: async () => undefined },
    "@/lib/client-os/sales-catalog": { getOrganizationSalesCatalogSettings: async () => snapshot.settings },
    "./checkout-customer": { loadCheckoutCustomer: async (_client: unknown, _organizationId: string, row: unknown) => row,
      parseCheckoutAddress: () => ({ addressNumber: "10" }) },
    "./card-input": { record: (value: unknown) => value && typeof value === "object" ? value : {} },
    "./mercado-pago": { normalizeCurrencyAmount: (value: string) => Number(value.replace(",", ".")) },
  });
  const loadCheckout = vi.fn(options.realCheckout ? checkout.loadTransparentCheckout : async () => snapshot);
  const call = runtimeHarness({
    "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment },
    "@/lib/sales-catalog/transparent-checkout": { loadTransparentCheckout: loadCheckout },
  }, { fetch: async (url: string, init: { body: string }) => {
    requests.push({ url, body: JSON.parse(init.body) });
    const status = url.endsWith("/send/menu") ? options.deliveryStatus ?? 200 : 200;
    return { ok: status === 200, status, text: async () => JSON.stringify(status === 200
      ? { id: `delivery-${requests.length}` } : { error: "Payment button unavailable" }) };
  } });
  let minute = 2;
  async function turn(text: string) {
    const inbound = msg("inbound", text, minute++);
    ctx.messages.push(inbound);
    ctx.run.id = `run-${minute}`;
    db.tables.conversation_messages = [{ ...inbound, conversation_id: "conversation", whatsapp_instance_id: "instance" }];
    const result = await call<Promise<{ text: string } | null>>("maybeSendExistingSalesCatalogCheckoutLink", {
      client: db.client, context: ctx, token: "fake", phone: "5500000000000", latestInbound: inbound, userText: text,
    });
    if (result) ctx.messages.push(msg("outbound", result.text, minute++));
    return result;
  }
  return { call, ctx, db, requests, createPayment, snapshot, loadCheckout, turn };
}

describe("payment method changes throughout the same WhatsApp conversation", () => {
  it.each([200, 422, 408, 500])("loads the existing checkout, sends the selected method and records the delivery outcome (HTTP %s)", async deliveryStatus => {
    const s = scenario({ realCheckout: true, deliveryStatus });
    const uncertain = deliveryStatus === 408 || deliveryStatus === 500;
    const request = s.turn("melhor muda pra mim estou sem saldo no pix muda para cartão de credito");
    if (uncertain) await expect(request).rejects.toThrow();
    else expect(await request).not.toBeNull();
    expect(s.loadCheckout).toHaveBeenCalledWith(s.db.client, s.snapshot.session.id);
    expect(s.createPayment).not.toHaveBeenCalled();
    expect(s.db.tables.sales_catalog_payment_sessions).toHaveLength(1);
    expect(s.db.tables.sales_catalog_orders).toHaveLength(1);
    expect(s.db.tables.leads[0].metadata).toMatchObject({ checkout_runtime_state: {
      stage: uncertain ? "payment_delivery_unconfirmed" : "payment_sent", preferred_payment_method: "card",
    } });
    const url = `/checkout/${s.snapshot.session.id}?payment_method=card`;
    expect(s.requests[0].body.choices).toEqual([expect.stringContaining(url)]);
    if (deliveryStatus === 422) expect(s.requests.at(-1)?.body.text).toContain(url);
    else expect(s.requests).toHaveLength(1);
    expect(s.db.tables.conversation_messages.filter(row => row.direction === "outbound")).toHaveLength(uncertain ? 0 : 1);
  });

  it.each(["capability", "review", "attempt", "lock"])("keeps real checkout %s guards before sending card access", async guard => {
    const s = scenario({ realCheckout: true });
    if (guard === "capability") s.db.tables.sales_catalog_checkout_capabilities = [{ organization_id: "store", transparent_card_enabled: false }];
    if (guard === "review") s.db.tables.sales_catalog_payment_reviews = [{ organization_id: "store", order_id: "order", lead_id: "lead", status: "open" }];
    if (guard === "attempt") s.db.tables.sales_catalog_card_attempts = [{ organization_id: "store", order_id: "order", state: "unknown" }];
    if (guard === "lock") s.db.tables.sales_catalog_orders[0].checkout_payment_lock = "pending";
    await s.turn("muda pra mim quero pagar no cartão");
    expect(s.loadCheckout).toHaveBeenCalled();
    expect(s.requests.every(request => request.body.choices === undefined)).toBe(true);
    expect(s.createPayment).not.toHaveBeenCalled();
    expect(s.db.tables.leads[0].metadata).toMatchObject({ checkout_runtime_state: { stage: "payment_confirmation_pending" } });
  });
  it.each([
    "otimo eu faço para pagar no cartão",
    "como faço para pagar no cartão?",
    "tem como pagar no crédito?",
    "no cartão não tenho como pagar no pix",
    "não quero Pix, quero cartão",
    "não, no cartão",
    "cartão em vez de Pix",
    "melhor muda pra mim estou sem saldo no pix muda para cartão de credito",
    "muda pra mim, quero pagar no cartão",
    "troca pra mim por favor para cartão de crédito",
    "quero pagar no cartão, estou sem saldo no Pix",
    "muda pra mim para cartão, não tenho saldo no Pix",
  ])("sends a real card button for the existing order: %s", async text => {
    const s = scenario();
    expect(await s.turn(text)).not.toBeNull();
    expect(s.requests).toHaveLength(1);
    expect(s.requests[0].url).toBe("https://whatsapp.invalid/send/menu");
    expect(s.requests[0].body.choices).toEqual([expect.stringMatching(/Finalizar pedido\|https?:.*\/checkout\/session\?payment_method=card$/)]);
    expect(s.createPayment).not.toHaveBeenCalled();
    expect(s.db.tables.sales_catalog_orders).toHaveLength(1);
    expect(s.db.tables.sales_catalog_payment_sessions).toHaveLength(1);
  });

  it("keeps card through a generic link request, a correction, truncated history and a later switch back to Pix", async () => {
    const s = scenario();
    for (const text of ["como faço para pagar no cartão?", "me manda o link para eu pagar", "no cartão não tenho como pagar no pix"]) {
      expect(await s.turn(text)).not.toBeNull();
      expect(s.requests.at(-1)?.body.choices).toEqual([expect.stringContaining("payment_method=card")]);
    }
    s.ctx.messages = [];
    expect(await s.turn("me manda o link para eu pagar")).not.toBeNull();
    expect(s.requests.at(-1)?.body.choices).toEqual([expect.stringContaining("payment_method=card")]);
    expect(await s.turn("agora quero pagar no Pix")).not.toBeNull();
    expect(s.requests.at(-1)?.body.choices).toEqual(["Copiar Pix|copy:TEST-PIX-NOT-PAYABLE"]);
    expect(s.createPayment).not.toHaveBeenCalled();
    expect(s.db.tables.sales_catalog_orders).toHaveLength(1);
  });

  it("uses the customer's card request even after an assistant incorrectly offers Pix", async () => {
    const s = scenario();
    s.ctx.messages.push(msg("inbound", "como faço para pagar no cartão?", 1.1),
      msg("outbound", "Gerei o Pix para você pagar direto por aqui.", 1.2));
    await s.turn("me manda o link para eu pagar");
    expect(s.requests.at(-1)?.body.choices).toEqual([expect.stringContaining("payment_method=card")]);
  });

  it.each(["?", "que botão ? não apareceu nada aqui"])("recovers the missing card checkout after an unsupported assistant claim: %s", async text => {
    const s = scenario();
    s.ctx.messages.push(msg("inbound", "melhor muda pra mim estou sem saldo no pix muda para cartão de credito", 1.1),
      msg("outbound", "Alterei a forma de pagamento para cartão de crédito. É só acessar o checkout seguro pelo botão para finalizar no cartão.", 1.2));
    expect(await s.turn(text)).not.toBeNull();
    expect(s.requests.at(-1)?.body.choices).toEqual([expect.stringContaining("payment_method=card")]);
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it("reopens the confirmed pizza order with its earlier preview and saved cart still in history", async () => {
    const s = scenario();
    s.ctx.messages = [
      msg("outbound", "Antes de fechar, confirma se o pedido ficou assim:\n- 1x Pizza de queijo - R$ 90,00\nTotal: R$ 90,00.\nPosso fechar seu pedido e gerar o pagamento?", -3),
      msg("inbound", "sim pode", -2),
      msg("outbound", "Pedido fechado. Gerei o Pix para você pagar direto por aqui.", 1),
    ];
    s.ctx.lead.metadata.checkout_cart_draft = { organization_id: "store", conversation_id: "conversation", instance_id: "instance",
      updated_at: msg("outbound", "", -3).occurred_at, items: [{ id: "kit", quantity: 1 }] };
    expect(await s.turn("melhor muda pra mim estou sem saldo no pix muda para cartão de credito")).not.toBeNull();
    expect(s.requests.at(-1)?.body.choices).toEqual([expect.stringContaining("payment_method=card")]);
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it.each(["muda o endereço", "troca a pizza", "cancela o pedido"])("does not reopen the old order after an unresolved change: %s", async text => {
    const s = scenario();
    s.ctx.messages.unshift(msg("outbound", "Antes de fechar, confirma se o pedido ficou assim:\n- 1x Pizza de queijo - R$ 90,00\nTotal: R$ 90,00.\nPosso fechar seu pedido e gerar o pagamento?", -3));
    s.ctx.messages.push(msg("inbound", text, 1.1), msg("outbound", "Vou conferir o pedido.", 1.2));
    expect(await s.turn("me manda o link para pagar no cartão")).toBeNull();
    expect(s.requests).toHaveLength(0);
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it.each(["muda pra mim quero pagar no cartão", "?"])("recovers the same order using the persisted cart when its preview has left history: %s", async text => {
    const s = scenario();
    s.ctx.lead.metadata.checkout_cart_draft = { organization_id: "store", conversation_id: "conversation", instance_id: "instance",
      updated_at: msg("outbound", "", -3).occurred_at, items: [{ id: "kit", quantity: 1 }] };
    s.ctx.messages = [msg("inbound", "melhor muda pra mim estou sem saldo no pix muda para cartão de credito", 1.1),
      msg("outbound", "É só acessar o checkout seguro pelo botão para finalizar no cartão.", 1.2)];
    expect(await s.turn(text)).not.toBeNull();
    expect(s.requests.at(-1)?.body.choices).toEqual([expect.stringContaining("payment_method=card")]);
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it.each(["quais os juros do cartão?", "não quero comprar", "quero cartão mas cancela o pedido", "cartão, muda o endereço",
    "no cartão, mas antes de pagar quero falar com um humano", "vou pagar no cartão amanhã", "não tenho como pagar no Pix", "não, manda o Pix",
    "muda pra mim o endereço e quero cartão", "muda pra mim quero cartão mas troca a pizza", "muda pra mim quero cartão mas não quero comprar",
    "que botão? não apareceu nada aqui, cancela o pedido", "que botão? antes de pagar quero falar com um humano"]) (
    "does not treat questions, cancellation or a rejected method alone as consent: %s", async text => {
      const s = scenario();
      expect(await s.turn(text)).toBeNull();
      expect(s.requests).toHaveLength(0);
      expect(s.createPayment).not.toHaveBeenCalled();
    });

  it("does not create a checkout from a card question without an existing payment session", async () => {
    const s = scenario();
    s.ctx.salesCatalogOrders[0].latestPaymentSessionId = "";
    expect(await s.turn("como faço para pagar no cartão?")).toBeNull();
    expect(s.requests).toHaveLength(0);
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it("does not recover an appointment item as a payable order", async () => {
    const s = scenario();
    s.ctx.salesCatalog[0].salesDestination = "appointment";
    expect(await s.turn("como faço para pagar no cartão?")).toBeNull();
    expect(s.requests).toHaveLength(0);
  });

  it("keeps reconciliation guards when the customer requests a different method", async () => {
    const s = scenario();
    s.snapshot.attempt = { state: "unknown" };
    expect(await s.turn("no cartão não tenho como pagar no pix")).not.toBeNull();
    expect(s.requests[0].body.text).toContain("conferir a tentativa");
    expect(s.requests[0].body.choices).toBeUndefined();
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it("opens the card checkout after the Pix code expires without creating a replacement charge", async () => {
    const s = scenario();
    s.db.tables.sales_catalog_payment_sessions[0].expires_at = "2000-01-01T00:00:00Z";
    await s.turn("quero pagar no cartão");
    expect(s.requests[0].body.choices).toEqual([expect.stringContaining("payment_method=card")]);
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it("does not silently fall back to Pix when card is disabled", async () => {
    const s = scenario();
    s.ctx.salesCatalogSettings = { configured: true, asaas: { enabledMethods: ["pix"] } };
    await s.turn("quero pagar no cartão");
    expect(s.requests[0].body.text).toContain("não está disponível");
    expect(s.requests[0].body.choices).toBeUndefined();
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it.each(["order_id", "organization_id", "conversation_id", "instance_id"])("never inherits a payment preference from another %s", async field => {
    const s = scenario();
    await s.turn("quero pagar no cartão");
    (s.ctx.lead.metadata.checkout_runtime_state as Record<string, unknown>)[field] = "another";
    s.ctx.messages = [];
    await s.turn("me manda o link para eu pagar");
    expect(s.requests.at(-1)?.body.choices).toEqual(["Copiar Pix|copy:TEST-PIX-NOT-PAYABLE"]);
  });

  it.each([
    "É só clicar para abrir o checkout e preencher os dados do seu cartão.",
    "Aqui está para você finalizar no cartão de crédito com toda a segurança: Conseguiu abrir aí certinho?",
    "Alterei a forma de pagamento para cartão de crédito. É só acessar o checkout seguro pelo botão para finalizar no cartão.",
    "Liberantei o pagamento no cartão de crédito. Conseguiu visualizar o botão por aí?",
  ])("blocks the screenshot's unsupported checkout claim: %s", async text => {
    const s = scenario();
    s.ctx.salesCatalogOrders = [];
    const inbound = msg("inbound", "quero pagar no cartão", 2);
    s.ctx.messages.push(inbound);
    dbLatest(s.db, inbound);
    const result = await s.call<Promise<{ text: string }[]>>("sendAgentResponse", {
      client: s.db.client, context: s.ctx, token: "fake", phone: "5500000000000", text,
    });
    expect(result.map(item => item.text).join(" ")).not.toMatch(/só clicar|aqui está|conseguiu abrir|alterei|liberantei|visualizar o botão|acessar o checkout/i);
    expect(s.createPayment).not.toHaveBeenCalled();
  });
});

function dbLatest(db: ReturnType<typeof commerceDatabase>, inbound: ReturnType<typeof msg>) {
  db.tables.conversation_messages = [{ ...inbound, conversation_id: "conversation", whatsapp_instance_id: "instance" }];
}
