import * as crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as tracking from "../src/lib/tracking/tracked-links";
import * as guards from "../src/lib/sales-catalog/checkout-guards";
import * as customer from "../src/lib/sales-catalog/checkout-customer";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Row = Record<string, unknown>;
type Response = { body: Row; status: number };
type Service = { createSalesCatalogPixPaymentSession: (input: Row) => Promise<Row> };
type Route = { POST: (request: Row, context?: Row) => Promise<Response> };
const next = { NextResponse: { json: (body: Row, init?: { status: number }) => ({ body, status: init?.status ?? 200 }), redirect: (url: string) => url } };
const mercadoPago = serverModuleHarness<Row>("src/lib/sales-catalog/mercado-pago.ts");
const order = {
  id: "order", organization_id: "store", lead_id: "lead", conversation_id: "conversation", customer_name: "Maria Exemplo",
  customer_email: "cliente@example.test", customer_document: "12345678909", customer_phone: "5500000000000",
  destination_cep: "88000000", destination_address: "Rua Exemplo, 10, Centro, Florianopolis SC",
  shipping_total: "70,00", shipping_method: "Entrega", subtotal: "503,80", total: "573,80", status: "pending_payment", payment_status: "pending", metadata: {},
};
const items = [{ id: "item", organization_id: "store", order_id: "order", title: "Produto de teste", quantity: 2, unit_price: "251,90", total: "503,80", fulfillment: { mode: "physical" } }];
const initialSession = { id: "internal", organization_id: "store", order_id: "order", provider: "asaas", method: "card", status: "created", amount: "573,80", provider_payment_id: null, checkout_url: "https://loja.example/checkout/internal", created_at: new Date().toISOString(), metadata: {} };

afterEach(() => vi.unstubAllEnvs());

describe("Asaas checkout and lead attribution", () => {
  it("opens the brand checkout from WhatsApp, then creates the hosted card checkout with the full amount and CRM links", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://loja.example");
    const db = commerceDatabase({ sales_catalog_orders: [order], sales_catalog_order_items: items, sales_catalog_payment_integrations: [{ organization_id: "store", provider: "asaas", status: "connected" }] });
    const createHosted = vi.fn(async () => ({ id: "hosted", link: "https://asaas.example/checkout/hosted", status: "ACTIVE" }));
    const createPix = vi.fn();
    const service = serverModuleHarness<Service>("src/lib/sales-catalog/payment-sessions.ts", {
      "./checkout-customer": customer,
      "node:crypto": crypto, "./mercado-pago": mercadoPago, "@/lib/tracking/tracked-links": tracking,
      "@/lib/sales-catalog/checkout-guards": guards,
      "@/lib/client-os/sales-catalog": { getOrganizationSalesCatalogSettings: async () => null, mapSalesCatalogPaymentSession: (row: Row) => row },
      "@/lib/platform-product-sales": { resolveSalesCatalogOrderPaymentOwner: async () => ({ owner: "seller", commercialFlowType: "direct", revenueOwnerType: "seller", commissionEligible: false, catalogItemIds: [], platformProductIds: [] }) },
      "./asaas": { ensureAsaasAccessToken: async () => ({ id: "integration", accessToken: "fake", mode: "sandbox" }), createAsaasCheckout: createHosted, createAsaasPixPayment: createPix, buildAsaasCheckoutUrl: (result: Row) => result.link },
    });
    const input = { client: db.client, organizationId: "store", orderId: "order", preferredMethod: "card" };
    const internal = await service.createSalesCatalogPixPaymentSession({ ...input, source: "whatsapp_agent" });
    expect(internal.gatewayUnavailable).toBe(false);
    expect(internal.checkoutUrl).toMatch(/^https:\/\/loja.example\/checkout\//);
    expect((internal.session as Row).provider_payment_id).toBeNull();
    expect(createHosted).not.toHaveBeenCalled();
    const hosted = await service.createSalesCatalogPixPaymentSession({ ...input, source: "checkout" });
    expect(hosted.gatewayUnavailable).toBe(false);
    expect(hosted.checkoutUrl).toBe("https://asaas.example/checkout/hosted");
    expect((hosted.session as Row).metadata).toMatchObject({ public_checkout_url: expect.stringMatching(/^https:\/\/loja.example\/checkout\//), public_checkout_tracking_url: expect.stringMatching(/^https:\/\/loja.example\/r\//) });
    expect(createHosted).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ amount: 573.8, billingTypes: ["CREDIT_CARD"], payerName: "Maria Exemplo" }));
    expect(createPix).not.toHaveBeenCalled();
    for (const result of [internal, hosted]) {
      const link = db.tables.intelligence_memory.find(row => (row.metadata as Row).tracking_url === result.trackingUrl);
      expect(link?.metadata).toMatchObject({ lead_id: "lead", conversation_id: "conversation", order_id: "order", payment_session_id: (result.session as Row).id, amount: 573.8 });
    }
    expect(db.tables.sales_catalog_orders[0]).toMatchObject({ total: "573,80", shipping_total: "70,00" });
    expect(db.tables.intelligence_events.filter(row => row.event_type === "sales_catalog.card_checkout_created")).toHaveLength(2);
  });

  it.each(["new", "reused", "changed_amount", "gateway_failure"])("handles %s card checkout without redirecting back into the internal session", async mode => {
    const providerSession = { ...initialSession, id: "hosted", provider_payment_id: "asaas-checkout", checkout_url: "https://asaas.example/checkout/hosted", amount: mode === "changed_amount" ? "500,00" : "573,80", metadata: { checkout_tracking_url: "https://loja.example/r/provider" } };
    const db = commerceDatabase({ sales_catalog_orders: [order], sales_catalog_order_items: items, sales_catalog_payment_sessions: [initialSession, ...(["reused", "changed_amount"].includes(mode) ? [providerSession] : [])] });
    const createPayment = vi.fn(async () => ({ session: { id: "new", status: "created", failureReason: "Gateway indisponivel" }, checkoutUrl: "https://asaas.example/checkout/new", trackingUrl: "https://loja.example/r/new", gatewayUnavailable: mode === "gateway_failure" }));
    const route = serverModuleHarness<Route>("src/app/api/checkout/[sessionId]/card/route.ts", {
      "next/server": next, "next/cache": { revalidatePath: vi.fn() }, "@/lib/supabase/service": { createServiceClient: () => db.client },
      "@/lib/sales-catalog/mercado-pago": mercadoPago, "@/lib/sales-catalog/checkout-guards": guards,
      "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: createPayment },
      "@/lib/sales-catalog/checkout-order-bumps": { applySalesCatalogCheckoutOrderBumps: async () => ({ order, items, totalAmount: 573.8, appliedBumps: [], addedBumps: [] }) },
    });
    const response = await route.POST({ json: async () => ({}) }, { params: Promise.resolve({ sessionId: "internal" }) });
    if (mode === "reused") {
      expect(createPayment).not.toHaveBeenCalled();
      expect(response.body).toMatchObject({ reused: true, trackingUrl: "https://loja.example/r/provider" });
      expect(db.tables.intelligence_events[0].payload).toMatchObject({ lead_id: "lead", order_id: "order" });
    } else {
      expect(createPayment).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ preferredMethod: "card", source: "checkout", amount: 573.8, orderId: "order" }));
      if (mode === "gateway_failure") {
        expect(response.status).toBe(503);
        expect(response.body.checkoutUrl).toBeUndefined();
      } else expect(response.body.trackingUrl).toBe("https://loja.example/r/new");
    }
  });

  it.each([
    ["approved", false, true], ["pending", false, true], ["pending", true, false], ["expired", true, false], ["approved", true, true],
  ])("preserves Pix artifacts and handles %s from superseded session %s (order updated: %s)", async (status, superseded, orderUpdated) => {
    const db = commerceDatabase({ sales_catalog_orders: [{ ...order, latest_payment_session_id: superseded ? "new-card" : "internal" }], sales_catalog_order_items: items, sales_catalog_payment_sessions: [{ ...initialSession, method: "pix", provider_payment_id: "payment", pix_qr_code: "saved-code", pix_qr_code_base64: "saved-image", pix_ticket_url: "saved-url", paid_at: "2026-09-05T12:00:00Z" }] });
    const postPayment = vi.fn(async () => ({}));
    const route = serverModuleHarness<Route>("src/app/api/webhooks/asaas/route.ts", {
      "next/server": next, "next/cache": { revalidatePath: vi.fn() }, "@/lib/supabase/service": { createServiceClient: () => db.client },
      "@/lib/sales-catalog/asaas": { ensureAsaasAccessToken: async () => ({ accessToken: "fake", webhookSecret: "fake" }), verifyAsaasWebhookToken: () => ({ ok: true }), getAsaasPayment: async () => ({ id: "payment" }), extractAsaasPaymentData: () => ({ providerPaymentId: "payment", providerStatus: status, status, pixQrCode: null, pixQrCodeBase64: null, pixTicketUrl: null, paidAt: null }) },
      "@/lib/sales-catalog/post-payment": { handleSalesCatalogPaymentStatusChange: postPayment },
      "@/lib/platform-product-sales": { markPlatformProductCommissionsForPaymentStatus: async () => null },
    });
    const response = await route.POST({ text: async () => JSON.stringify({ id: "event", event: "PAYMENT_RECEIVED", payment: { id: "payment" } }), headers: new Headers() });
    expect(response.body).toEqual({ ok: true });
    expect(db.tables.sales_catalog_payment_sessions[0]).toMatchObject({ status, pix_qr_code: "saved-code", pix_qr_code_base64: "saved-image", pix_ticket_url: "saved-url", paid_at: "2026-09-05T12:00:00Z" });
    expect(db.tables.intelligence_events[0].payload).toMatchObject({ lead_id: "lead", conversation_id: "conversation", order_id: "order", status, order_updated: orderUpdated });
    expect(postPayment).toHaveBeenCalledTimes(orderUpdated ? 1 : 0);
    expect(db.tables.sales_catalog_orders[0].latest_payment_session_id).toBe(orderUpdated ? "internal" : "new-card");
  });

  it("records a card button click against its bound lead and keeps attribution and method on the internal checkout redirect", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://loja.example");
    const db = commerceDatabase({ intelligence_memory: [{ id: "link", organization_id: "store", title: "Pagamento", content: "https://loja.example/checkout/session", tags: ["tracked_link_button"], metadata: { lead_id: "lead", order_id: "order", conversation_id: "conversation", payment_session_id: "session" } }] });
    const route = serverModuleHarness<{ GET: (request: Row, context: Row) => Promise<string> }>("src/app/r/[linkId]/route.ts", {
      "next/server": next, "@/lib/supabase/service": { createServiceClient: () => db.client }, "@/lib/tracking/tracked-links": tracking,
      "@/lib/tracking/organization-attribution": { createOrganizationTrackingToken: () => "signed-token" },
    });
    const redirect = await route.GET({ nextUrl: new URL("https://loja.example/r/link?payment_method=card&lead_id=wrong&order_id=wrong&payment_session_id=wrong"), headers: new Headers(), cookies: { get: () => undefined } }, { params: Promise.resolve({ linkId: "link" }) });
    const url = new URL(redirect);
    expect(url.pathname).toBe("/checkout/session");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ payment_method: "card", lead_id: "lead", conversation_id: "conversation", order_id: "order", payment_session_id: "session" });
    expect(db.tables.intelligence_events[0]).toMatchObject({ event_type: "tracked_link.clicked", organization_id: "store", payload: { lead_id: "lead", order_id: "order", payment_session_id: "session", payment_method: "card" } });
  });
});
