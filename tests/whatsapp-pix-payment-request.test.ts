import { describe, expect, it, vi } from "vitest";
import * as billingMessages from "../src/lib/billing/platform-billing-messages";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";

type Request = { path: string; body: Record<string, unknown> };
function provider(statuses: number[] = [200]) {
  const requests: Request[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    requests.push({ path: new URL(url).pathname, body: JSON.parse(String(init.body)) });
    const status = statuses[requests.length - 1] ?? 200;
    return new Response(JSON.stringify(status === 200 ? { messageId: `message-${requests.length}` } : { error: "Message rejected" }), {
      status, headers: { "Content-Type": "application/json" },
    });
  });
  return { fetch, requests };
}

const billingInput = {
  credentials: { baseUrl: "https://uazapi.example.test" }, token: "test-token", phone: "5511999999999",
  message: "Seu Pix de R$ 9,99 está pronto. Renovação: R$ 497,00.",
  button: { label: "Finalizar pagamento", url: "https://www.connectyhub.com.br/dashboard/planos/checkout/subscription-1" },
  pixCode: "000201-PIX-TEST", paymentSummary: { amount: 9.99, itemName: "Scale", invoiceNumber: "INVOICE1" },
  trackId: "billing_notice_event-1",
};
type Notice = { deliveryMode: string; message: string; fallbackError: string | null };
function billing(fetch: unknown) {
  return serverModuleHarness<{ sendBillingWhatsappNotice: (input: typeof billingInput) => Promise<Notice> }>(
    "src/lib/billing/platform-billing-webhook.ts",
    { "@/lib/billing/platform-billing-messages": billingMessages }, ["sendBillingWhatsappNotice"], { fetch },
  );
}

function store(fetch: unknown) {
  const saved: { table: string; value: Record<string, unknown> }[] = [];
  const client = { from: (table: string) => ({
    insert: (value: Record<string, unknown>) => { saved.push({ table, value }); return Promise.resolve({ error: null }); },
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
  }) };
  const context = {
    credentials: { baseUrl: "https://uazapi.example.test" },
    run: { id: "run-1" }, organization: { id: "store-1", name: "Loja teste", plan_code: "scale" },
    agent: { id: "agent-1", name: "Gustavo" }, instance: { id: "instance-1" },
    lead: { id: "lead-1" }, conversationId: "conversation-1", providerChatId: "5511999999999@s.whatsapp.net",
    salesCatalogOrders: [{ id: "order-123", items: [{ title: "Produto A" }, { title: "Produto B" }] }],
  };
  const payment = {
    orderId: "order-123", amount: "573.80", pixQrCode: "000201-STORE-PIX", provider: "asaas", providerLabel: "Asaas",
    checkoutUrl: "https://www.connectyhub.com.br/checkout/session-1",
    trackingUrl: "https://www.connectyhub.com.br/checkout/session-1?lead_id=lead-1&utm_source=whatsapp",
  };
  const invoke = runtimeHarness({}, { fetch });
  return { saved, payment, send: () => invoke<Promise<unknown>>("sendSalesCatalogPixDirectWhatsapp", { client, context, payment, token: "test-token", phone: "5511999999999" }) };
}

describe("Pix payment card across the platform and storefronts", () => {
  it("sends the discounted invoice amount with the same Pix and internal checkout", async () => {
    const p = provider();
    const result = await billing(p.fetch).sendBillingWhatsappNotice(billingInput);
    expect(p.requests).toHaveLength(1);
    expect(p.requests[0]).toMatchObject({ path: "/send/request-payment", body: {
      amount: 9.99, itemName: "Scale", invoiceNumber: "INVOICE1", pixCode: billingInput.pixCode,
      paymentLink: billingInput.button.url, track_id: billingInput.trackId, track_source: "connectyhub",
    } });
    expect(p.requests[0].body).not.toHaveProperty("pixKey");
    expect(result.deliveryMode).toBe("payment_request");
    expect(result.message).toContain("R$ 497,00");
  });

  it("keeps a usable checkout and copy button when the native format is rejected", async () => {
    const p = provider([400, 200]);
    const result = await billing(p.fetch).sendBillingWhatsappNotice(billingInput);
    expect(p.requests.map(r => r.path)).toEqual(["/send/request-payment", "/send/menu"]);
    expect(p.requests[1].body.choices).toEqual([`Copiar código Pix|copy:${billingInput.pixCode}`]);
    expect(p.requests[1].body.text).toContain(billingInput.button.url);
    expect(result.message).toBe(p.requests[1].body.text);
    expect(result.fallbackError).toBeTruthy();
  });

  it("archives the exact text including code and checkout when both interactive formats fail", async () => {
    const p = provider([400, 400, 200]);
    const result = await billing(p.fetch).sendBillingWhatsappNotice(billingInput);
    expect(p.requests.map(r => r.path)).toEqual(["/send/request-payment", "/send/menu", "/send/text"]);
    expect(result.message).toContain(billingInput.pixCode);
    expect(result.message).toContain(billingInput.button.url);
    expect(result.message).toBe(p.requests[2].body.text);
    expect(result.deliveryMode).toBe("text_fallback");
  });

  it.each([408, 500])("does not duplicate a billing message after ambiguous HTTP %s", async status => {
    const p = provider([status]);
    await expect(billing(p.fetch).sendBillingWhatsappNotice(billingInput)).rejects.toThrow();
    expect(p.requests).toHaveLength(1);
  });

  it("keeps checkout-only notices as link buttons", async () => {
    const p = provider();
    await billing(p.fetch).sendBillingWhatsappNotice({ ...billingInput, pixCode: "" });
    expect(p.requests[0].path).toBe("/send/menu");
    expect(p.requests[0].body.choices).toEqual([`Finalizar pagamento|${billingInput.button.url}`]);
  });

  it("does not invent a total for old notices missing an invoice amount", async () => {
    const p = provider();
    await billing(p.fetch).sendBillingWhatsappNotice({ ...billingInput, paymentSummary: { ...billingInput.paymentSummary, amount: NaN } });
    expect(p.requests[0].path).toBe("/send/menu");
    expect(p.requests[0].body.text).toContain(billingInput.button.url);
  });

  it("sends only Copiar Pix for stores and keeps reconciliation data internal", async () => {
    const p = provider(), s = store(p.fetch);
    await s.send();
    expect(p.requests).toHaveLength(1);
    expect(p.requests[0]).toMatchObject({ path: "/send/menu", body: {
      type: "button", choices: [`Copiar Pix|copy:${s.payment.pixQrCode}`], footerText: "Loja teste",
    } });
    expect(p.requests[0].body).not.toHaveProperty("paymentLink");
    expect(p.requests[0].body.text).toContain("573,80");
    expect(p.requests[0].body.text).not.toMatch(/checkout|https?:|revisar|abrir link/i);
    const message = s.saved.find(r => r.table === "conversation_messages")?.value;
    expect(message).toMatchObject({ lead_id: "lead-1", conversation_id: "conversation-1", organization_id: "store-1" });
    expect(message?.payload).toMatchObject({ provider_response: {
      delivery: "whatsapp_pix_copy_button", orderId: "order-123", amount: 573.8, trackingUrl: s.payment.trackingUrl,
    } });
  });

  it("sends the exact code alone after definitive copy rejection, without a checkout detour", async () => {
    const p = provider([400, 200]), s = store(p.fetch);
    await s.send();
    expect(p.requests.map(r => r.path)).toEqual(["/send/menu", "/send/text", "/send/text"]);
    expect(p.requests[1].body.text).not.toMatch(/checkout|https?:|revisar/i);
    expect(p.requests[2].body.text).toBe(s.payment.pixQrCode);
    const messages = s.saved.filter(r => r.table === "conversation_messages");
    expect(messages.map(r => r.value.text_content)).toEqual(p.requests.slice(1).map(r => r.body.text));
    expect(messages[1].value.payload).toMatchObject({ interactive_button: false, button_fallback: true,
      provider_response: { delivery: "whatsapp_pix_code_separate_message", orderId: s.payment.orderId } });
  });

  it.each([408, 500])("does not duplicate a store message when copy delivery is uncertain (%s)", async status => {
    const p = provider([status]), s = store(p.fetch);
    await expect(s.send()).rejects.toThrow();
    expect(p.requests).toHaveLength(1);
    expect(s.saved).toHaveLength(0);
  });
  it("preserves punctuation and case in the gateway code, removing only transport newlines", async () => {
    const p = provider(), s = store(p.fetch);
    s.payment.pixQrCode = "  000201AbC./:xyz\r\n6304EF12  ";
    await s.send();
    expect(p.requests[0].body.choices).toEqual(["Copiar Pix|copy:000201AbC./:xyz6304EF12"]);
  });
  it.each(["", "\r\n"])("never sends an empty copy code", async code => {
    const p = provider(), s = store(p.fetch);
    s.payment.pixQrCode = code;
    await expect(s.send()).rejects.toThrow("Pix sem código");
    expect(p.requests).toHaveLength(0);
  });
});
