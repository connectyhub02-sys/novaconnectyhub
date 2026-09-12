import { describe, expect, it, vi } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";

const msg = (direction: string, text_content: string, minute: number) => ({
  id: `message-${minute}`, direction, text_content, message_type: "text", payload: {},
  occurred_at: new Date(Date.UTC(2026, 8, 12, 0, minute)).toISOString(),
});

function scenario() {
  const session = { id: "session", organization_id: "store", order_id: "order", method: "pix", provider: "asaas",
    amount: "90,00", status: "pending", expires_at: "2099-01-01T00:00:00Z", provider_payment_id: "existing-pix",
    pix_qr_code: "TEST-PIX-NOT-PAYABLE", checkout_url: "https://shop.example/checkout/session", metadata: { preferred_payment_method: "pix" } };
  const order = { id: "order", latestPaymentSessionId: "session", status: "pending_payment", paymentStatus: "pending",
    createdAt: msg("outbound", "", 0).occurred_at, checkoutConfirmedAt: msg("outbound", "", 0).occurred_at,
    total: "90,00", items: [{ catalogItemId: "kit", title: "Kit de escritório", quantity: 1 }] };
  const ctx = {
    messages: [msg("outbound", "Pedido fechado. Gerei o Pix para você pagar direto por aqui.", 1)],
    salesCatalog: [{ id: "kit", title: "Kit de escritório", tag: "{{produto_kit}}", price: "90,00", currency: "BRL",
      status: "active", salesDestination: "connectyhub_checkout", inventory: { status: "in_stock", allowBackorder: false },
      offer: { salePrice: null }, skus: [], attributes: [], fulfillment: { mode: "digital" }, media: [], description: "", category: "" }],
    salesCatalogOrders: [order], salesCatalogSettings: null as unknown, salesCatalogShippingSettings: null,
    organization: { id: "store", name: "Loja teste" }, agent: { id: "agent" }, instance: { id: "instance", metadata: {} },
    conversationId: "conversation", conversationMetadata: {}, run: { id: "run" }, linkButtons: [],
    lead: { id: "lead", display_name: "Maria Oliveira", metadata: {} as Record<string, unknown> },
    behavior: { proactiveFollowUp: false }, credentials: { baseUrl: "https://whatsapp.invalid" },
  };
  const db = commerceDatabase({ sales_catalog_payment_sessions: [session],
    sales_catalog_orders: [{ id: "order", organization_id: "store", total: "90,00" }],
    leads: [{ id: "lead", organization_id: "store", metadata: {} }] });
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const createPayment = vi.fn(() => { throw new Error("Must not create a second charge"); });
  const snapshot = { session, order: { id: "order", payment_status: "pending", status: "pending_payment" },
    enabled: true, review: false, amount: 90, attempt: null as unknown,
    settings: { asaas: { enabledMethods: ["pix", "credit_card"] } } };
  const call = runtimeHarness({
    "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment },
    "@/lib/sales-catalog/transparent-checkout": { loadTransparentCheckout: async () => snapshot },
  }, { fetch: async (url: string, init: { body: string }) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => JSON.stringify({ id: `delivery-${requests.length}` }) };
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
  return { call, ctx, db, requests, createPayment, snapshot, turn };
}

describe("payment method changes throughout the same WhatsApp conversation", () => {
  it.each([
    "otimo eu faço para pagar no cartão",
    "como faço para pagar no cartão?",
    "tem como pagar no crédito?",
    "no cartão não tenho como pagar no pix",
    "não quero Pix, quero cartão",
    "não, no cartão",
    "cartão em vez de Pix",
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

  it.each(["quais os juros do cartão?", "não quero comprar", "quero cartão mas cancela o pedido", "cartão, muda o endereço",
    "no cartão, mas antes de pagar quero falar com um humano", "vou pagar no cartão amanhã", "não tenho como pagar no Pix", "não, manda o Pix"]) (
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
  ])("blocks the screenshot's unsupported checkout claim: %s", async text => {
    const s = scenario();
    s.ctx.salesCatalogOrders = [];
    const inbound = msg("inbound", "quero pagar no cartão", 2);
    s.ctx.messages.push(inbound);
    dbLatest(s.db, inbound);
    const result = await s.call<Promise<{ text: string }[]>>("sendAgentResponse", {
      client: s.db.client, context: s.ctx, token: "fake", phone: "5500000000000", text,
    });
    expect(result.map(item => item.text).join(" ")).not.toMatch(/só clicar|aqui está|conseguiu abrir/i);
    expect(s.createPayment).not.toHaveBeenCalled();
  });
});

function dbLatest(db: ReturnType<typeof commerceDatabase>, inbound: ReturnType<typeof msg>) {
  db.tables.conversation_messages = [{ ...inbound, conversation_id: "conversation", whatsapp_instance_id: "instance" }];
}
