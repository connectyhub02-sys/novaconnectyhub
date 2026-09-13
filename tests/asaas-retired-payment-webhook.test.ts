import * as crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import type * as Asaas from "@/lib/sales-catalog/asaas";
import type * as Direct from "@/lib/sales-catalog/asaas-direct";
import type * as Checkout from "@/lib/sales-catalog/transparent-checkout";

type Row = Record<string, unknown>;
type Reply = { body: Row; status: number };
type Route = { POST: (request: Row) => Promise<Reply> };
const next = { NextResponse: { json: (body: Row, init?: { status: number }) => ({ body, status: init?.status ?? 200 }) } };
const token = "fixture-webhook-token";

function fixture(superseded = true) {
  const db = commerceDatabase({
    sales_catalog_orders: [{ id: "order-test", organization_id: "store-test", lead_id: "lead-test", conversation_id: "conversation-test",
      checkout_payment_lock: null, status: "pending_payment", payment_status: "pending", total: "100,00",
      checkout_revision: 0,
      latest_payment_session_id: superseded ? "new-session" : "old-session", metadata: {} }],
    sales_catalog_order_items: [{ id: "line-test", organization_id: "store-test", order_id: "order-test", title: "Caderno de teste", quantity: 1, total: "100,00" }],
    sales_catalog_payment_sessions: [{ id: "old-session", organization_id: "store-test", order_id: "order-test", provider: "asaas", method: "pix",
      status: "pending", amount: 100, provider_payment_id: "pay_test_old", external_reference: "reference-test", pix_qr_code: "FAKE-NOT-PAYABLE",
      updated_at: "2026-09-12T12:00:00Z", created_at: "2026-09-12T11:00:00Z", metadata: {} }],
  });
  const session = db.tables.sales_catalog_payment_sessions[0];
  const order = db.tables.sales_catalog_orders[0];
  let remote: Row = { id: "pay_test_old", status: "PENDING", deleted: false, value: 100, externalReference: "reference-test" };
  let unavailable = false;
  let afterRead: (() => void) | null = null;
  let afterDelete: (() => Promise<void> | void) | null = null;
  let beforeOrderUpdate: (() => void) | null = null;
  let hostedPayments: Row[] = [];
  let hostedHasMore = false;
  const client = { from(table: string) {
    const query = db.client.from(table);
    if (table === "sales_catalog_orders") {
      const update = query.update;
      query.update = value => { beforeOrderUpdate?.(); return update(value); };
    }
    return query;
  } };
  const transport = vi.fn(async (url: string, init: { method?: string }) => {
    const location = new URL(url);
    if (location.pathname === "/v3/payments") {
      expect(init.method).toBe("GET");
      expect(Object.fromEntries(location.searchParams)).toEqual({ checkoutSession: "checkout-test", limit: "100" });
      if (unavailable) throw new Error("Simulated provider outage");
      return { ok: true, status: 200, json: async () => ({ data: structuredClone(hostedPayments), hasMore: hostedHasMore }) };
    }
    if (location.pathname === "/v3/checkouts/checkout-test/cancel") {
      expect(init.method).toBe("POST");
      return { ok: true, status: 200, json: async () => ({ cancelled: true }) };
    }
    expect(location.pathname).toBe("/v3/payments/pay_test_old");
    expect(["GET", "DELETE"]).toContain(init.method);
    if (unavailable) throw new Error("Simulated provider outage");
    if (init.method === "DELETE") {
      remote.deleted = true;
      await afterDelete?.();
      return { ok: true, status: 200, json: async () => ({ deleted: true }) };
    }
    const snapshot = structuredClone(remote);
    afterRead?.();
    return { ok: true, status: 200, json: async () => snapshot };
  });
  const api = serverModuleHarness<typeof Asaas>("src/lib/sales-catalog/asaas.ts", { "node:crypto": crypto }, [], { fetch: transport, Error });
  const connection = async () => ({ accessToken: "fixture-key", webhookSecret: token, mode: "sandbox" as const });
  const direct = serverModuleHarness<typeof Direct>("src/lib/sales-catalog/asaas-direct.ts", {
    "./payment-diagnostics": { classifyAsaasFailure: () => ({ stage: "payment_lookup", category: "unknown" }) },
  }, [], { fetch: transport, Error });
  const checkout = serverModuleHarness<typeof Checkout>("src/lib/sales-catalog/transparent-checkout.ts", {
    "./asaas": { ...api, ensureAsaasAccessToken: connection }, "./asaas-direct": direct,
    "./card-input": { record: (value: unknown) => value && typeof value === "object" ? value : {} },
    "@/lib/platform-product-sales": { resolveSalesCatalogOrderPaymentOwner: async () => ({ owner: "client" }) },
  });
  const effects = vi.fn(async () => ({}));
  const money = serverModuleHarness("src/lib/sales-catalog/mercado-pago.ts");
  const route = serverModuleHarness<Route>("src/app/api/webhooks/asaas/route.ts", {
    "next/server": next, "next/cache": { revalidatePath: () => {} },
    "@/lib/supabase/service": { createServiceClient: () => client },
    "@/lib/sales-catalog/asaas": { ...api, ensureAsaasAccessToken: connection },
    "@/lib/sales-catalog/mercado-pago": money,
    "@/lib/sales-catalog/transparent-checkout": { ...checkout, processTransparentWebhook: async () => null },
    "@/lib/security/payment-audit": { sanitizePaymentAuditPayload: (value: unknown) => value },
    "@/lib/sales-catalog/post-payment": { handleSalesCatalogPaymentStatusChange: effects },
    "@/lib/platform-product-sales": { markPlatformProductCommissionsForPaymentStatus: async () => null },
  });
  async function event(type: string, payload: Row = {}, id = "event-test", header = token) {
    return route.POST({ text: async () => JSON.stringify({ id, event: type, payment: { id: "pay_test_old", ...payload } }),
      headers: new Headers({ "asaas-access-token": header }) });
  }
  async function checkoutEvent(type = "CHECKOUT_PAID") {
    return route.POST({ text: async () => JSON.stringify({ id: "hosted-event-test", event: type, checkout: {
      id: "checkout-test", items: [{ value: 999999, quantity: 1 }] } }), headers: new Headers({ "asaas-access-token": token }) });
  }
  return { db, session, order, api, checkout, event, effects, transport,
    setRemote: (patch: Row) => { remote = { ...remote, ...patch }; }, failProvider: () => { unavailable = true; },
    onRead: (fn: () => void) => { afterRead = fn; }, onDelete: (fn: () => Promise<void> | void) => { afterDelete = fn; },
    onOrderUpdate: (fn: () => void) => { beforeOrderUpdate = fn; }, checkoutEvent,
    setHosted: (payments: Row[], more = false) => { hostedPayments = payments; hostedHasMore = more;
      session.provider_payment_id = "checkout-test"; session.metadata = { asaas_checkout_id: "checkout-test" }; } };
}

describe("Asaas deleted payments: real normalization, webhook and retirement with I/O replaced", () => {
  it.each([
    ["PENDING", true, undefined, "cancelled"], ["OVERDUE", true, undefined, "cancelled"],
    ["PENDING", undefined, "PAYMENT_DELETED", "cancelled"], ["PENDING", false, "PAYMENT_DELETED", "pending"],
    ["CONFIRMED", true, "PAYMENT_DELETED", "approved"], ["REFUNDED", true, "PAYMENT_DELETED", "refunded"],
    ["PENDING", false, "PAYMENT_CREATED", "pending"], ["CANCELLED", undefined, undefined, "cancelled"],
  ])("normalizes status=%s deleted=%s event=%s as %s", (status, deleted, event, expected) => {
    expect(fixture().api.extractAsaasPaymentData({ id: "fake", status: status as string, deleted: deleted as boolean | undefined }, null, event as string | undefined).status).toBe(expected);
  });

  it.each([false, true])("keeps the retired Pix cancelled when its deletion webhook arrives %s", async webhookFirst => {
    const f = fixture();
    if (webhookFirst) f.onDelete(async () => { expect((await f.event("PAYMENT_DELETED", { status: "PENDING", deleted: true })).status).toBe(200); });
    await f.checkout.retireCheckoutPaymentsBeforeCartChange(f.db.client as never, "store-test", "order-test");
    if (!webhookFirst) expect((await f.event("PAYMENT_DELETED", { status: "PENDING", deleted: true })).status).toBe(200);
    expect(f.session).toMatchObject({ status: "cancelled", provider_status: "DELETED", pix_qr_code: "FAKE-NOT-PAYABLE" });
    expect(f.order.latest_payment_session_id).toBe("new-session");
    expect(f.effects).not.toHaveBeenCalled();
  });

  it.each(["PAYMENT_CREATED", "PAYMENT_UPDATED", "PAYMENT_DELETED"])("ignores an old %s when a retired session is still reported pending", async type => {
    const f = fixture(); f.session.status = "cancelled";
    expect((await f.event(type, { status: "PENDING" })).body).toMatchObject({ ignored: true });
    expect(f.session.status).toBe("cancelled"); expect(f.effects).not.toHaveBeenCalled();
    expect(f.order.latest_payment_session_id).toBe("new-session");
  });

  it("uses deletion event evidence when a fresh response omits the deleted field", async () => {
    const f = fixture(); f.setRemote({ deleted: undefined });
    await f.event("PAYMENT_DELETED", { status: "PENDING" });
    expect(f.session.status).toBe("cancelled");
  });

  it.each([["RECEIVED", "approved", "confirmed"], ["REFUNDED", "refunded", "refunded"]])("does not hide verified %s after retirement", async (remote, session, order) => {
    const f = fixture(remote !== "REFUNDED"); f.session.status = "cancelled"; f.setRemote({ status: remote, deleted: true });
    expect((await f.event("PAYMENT_DELETED", { status: "PENDING" })).status).toBe(200);
    expect(f.session.status).toBe(session); expect(f.order.payment_status).toBe(order); expect(f.effects).toHaveBeenCalledOnce();
  });

  it.each(["approved", "refunded"])("cannot downgrade local %s with an old pending response", async state => {
    const f = fixture(false); f.session.status = state; f.order.payment_status = state === "approved" ? "confirmed" : "refunded";
    await f.event("PAYMENT_UPDATED", { status: "PENDING" });
    expect(f.session.status).toBe(state); expect(f.effects).not.toHaveBeenCalled();
  });

  it("cannot revert a refund with a delayed approval", async () => {
    const f = fixture(false); f.session.status = "refunded"; f.session.provider_status = "REFUNDED"; f.order.payment_status = "refunded"; f.setRemote({ status: "RECEIVED" });
    await f.event("PAYMENT_RECEIVED"); expect(f.session.status).toBe("refunded"); expect(f.order.payment_status).toBe("refunded");
    expect(f.db.tables.sales_catalog_payment_reviews).toHaveLength(1);
    expect(f.session.metadata).toMatchObject({ financial_conflict: { verified_provider_status: "RECEIVED" } });
    expect(f.effects).not.toHaveBeenCalled();
  });

  it.each(["CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL", "REFUND_REQUESTED"])("records a fresh confirmation after %s instead of hiding it", async previous => {
    const f = fixture(false); f.session.status = "refunded"; f.session.provider_status = previous;
    f.order.payment_status = "refunded"; f.setRemote({ status: "CONFIRMED" });
    expect((await f.event("PAYMENT_CONFIRMED")).status).toBe(200);
    expect(f.session).toMatchObject({ status: "approved", provider_status: "CONFIRMED" });
    expect(f.db.tables.sales_catalog_payment_reviews).toHaveLength(1); expect(f.order.payment_status).toBe("refunded");
    expect(f.effects).not.toHaveBeenCalled();
  });

  it.each(["larger_order", "provider_amount", "missing_amount", "another_revision", "superseded_refund"])("records money and opens review for %s without settling the current order", async reason => {
    const f = fixture(); f.session.status = "cancelled";
    f.setRemote({ status: reason === "superseded_refund" ? "REFUNDED" : "RECEIVED" });
    if (reason === "larger_order") f.order.total = "130,00";
    if (reason === "provider_amount") f.setRemote({ value: 80 });
    if (reason === "missing_amount") f.setRemote({ value: undefined });
    if (reason === "another_revision") { f.session.metadata = { checkout_revision: 1 }; f.order.checkout_revision = 2; }
    for (let index = 0; index < 2; index++) expect((await f.event("PAYMENT_RECEIVED", {}, "same-event")).status).toBe(200);
    expect(f.session.status).toBe(reason === "superseded_refund" ? "refunded" : "approved");
    expect(f.order.payment_status).toBe("pending"); expect(f.order.latest_payment_session_id).toBe("new-session");
    expect(f.db.tables.sales_catalog_payment_reviews).toHaveLength(1); expect(f.effects).not.toHaveBeenCalled();
  });

  it("opens review if the cart changes after the provider read and before order settlement", async () => {
    const f = fixture(); f.setRemote({ status: "RECEIVED" });
    f.onOrderUpdate(() => { f.order.total = "130,00"; f.order.checkout_revision = 1; });
    expect((await f.event("PAYMENT_RECEIVED")).status).toBe(200);
    expect(f.session.status).toBe("approved"); expect(f.order.payment_status).toBe("pending");
    expect(f.db.tables.sales_catalog_payment_reviews).toHaveLength(1); expect(f.effects).not.toHaveBeenCalled();
  });

  it("cannot overwrite a concurrently refunded order with approval effects", async () => {
    const f = fixture(); f.setRemote({ status: "RECEIVED" });
    f.onOrderUpdate(() => { f.order.payment_status = "refunded"; });
    await f.event("PAYMENT_RECEIVED"); expect(f.order.payment_status).toBe("refunded");
    expect(f.db.tables.sales_catalog_payment_reviews).toHaveLength(1); expect(f.effects).not.toHaveBeenCalled();
  });

  it("reconciles duplicate and reordered events from the fresh provider state", async () => {
    const f = fixture(); f.setRemote({ deleted: true });
    for (const type of ["PAYMENT_DELETED", "PAYMENT_CREATED", "PAYMENT_DELETED", "PAYMENT_UPDATED"]) await f.event(type, { status: "PENDING" }, "same-event-id");
    expect(f.session.status).toBe("cancelled"); expect(f.order.latest_payment_session_id).toBe("new-session"); expect(f.effects).not.toHaveBeenCalled();
  });

  it.each(["PAYMENT_CREATED", "PAYMENT_RECEIVED", "PAYMENT_REFUNDED"])("defers %s without trusting an old payload when the provider read fails", async type => {
    const f = fixture(); const before = structuredClone(f.db.tables); f.failProvider();
    const result = await f.event(type, { status: "RECEIVED" });
    expect(result.status).toBe(503); expect(f.session).toEqual(before.sales_catalog_payment_sessions[0]);
    expect(f.order).toEqual(before.sales_catalog_orders[0]); expect(f.effects).not.toHaveBeenCalled();
  });

  it("does not overwrite retirement committed while the webhook reads the provider", async () => {
    const f = fixture(); f.onRead(() => { f.session.status = "cancelled"; f.session.updated_at = "2026-09-12T12:01:00Z"; });
    expect((await f.event("PAYMENT_CREATED")).status).toBe(503);
    expect(f.session.status).toBe("cancelled"); expect(f.effects).not.toHaveBeenCalled();
  });

  it("advances the stored version and rejects an intervening update even if status returns to pending", async () => {
    const f = fixture(false); const originalVersion = f.session.updated_at;
    expect((await f.event("PAYMENT_UPDATED")).status).toBe(200);
    expect(f.session.updated_at).not.toBe(originalVersion);
    f.onRead(() => { f.session.status = "cancelled"; f.session.status = "pending"; f.session.updated_at = "2030-01-01T00:00:00Z"; });
    const calls = f.effects.mock.calls.length;
    expect((await f.event("PAYMENT_UPDATED")).status).toBe(503);
    expect(f.session.updated_at).toBe("2030-01-01T00:00:00Z"); expect(f.effects.mock.calls).toHaveLength(calls);
  });

  it("defers an unexpected provider payment instead of attaching it to this order", async () => {
    const f = fixture(); f.setRemote({ id: "some_other_payment" });
    expect((await f.event("PAYMENT_RECEIVED")).status).toBe(503); expect(f.effects).not.toHaveBeenCalled();
    expect(f.session.provider_payment_id).toBe("pay_test_old");
  });

  it("rejects an invalid webhook token before any provider access", async () => {
    const f = fixture(); expect((await f.event("PAYMENT_DELETED", {}, "event", "wrong-token")).status).toBe(401);
    expect(f.transport).not.toHaveBeenCalled(); expect(f.session.status).toBe("pending");
  });

  it("does not retire another organization's session", async () => {
    const f = fixture(); await expect(f.checkout.retireCheckoutPaymentsBeforeCartChange(f.db.client as never, "other-store", "order-test")).rejects.toThrow();
    expect(f.transport).not.toHaveBeenCalled(); expect(f.session.status).toBe("pending");
  });

  it("does not report retirement as complete when approval wins the local update", async () => {
    const f = fixture(); f.onDelete(() => { f.session.status = "approved"; });
    await expect(f.checkout.retireCheckoutPaymentsBeforeCartChange(f.db.client as never, "store-test", "order-test")).rejects.toThrow(/conferindo/);
    expect(f.session.status).toBe("approved");
  });

  it("keeps a failed remote deletion unresolved", async () => {
    const f = fixture(); f.failProvider();
    await expect(f.checkout.retireCheckoutPaymentsBeforeCartChange(f.db.client as never, "store-test", "order-test")).rejects.toThrow();
    expect(f.session.status).toBe("pending");
  });

  it("confirms a legacy hosted checkout using its fresh exact payment, not payload items or an invented amount", async () => {
    const f = fixture(false); f.setHosted([{ id: "pay_checkout_test", checkoutSession: "checkout-test", status: "CONFIRMED", value: 100 }]);
    expect((await f.checkoutEvent()).status).toBe(200);
    expect(f.session).toMatchObject({ status: "approved", provider_payment_id: "pay_checkout_test" });
    expect(f.order.payment_status).toBe("confirmed"); expect(f.effects).toHaveBeenCalledOnce();
    expect(f.transport).toHaveBeenCalledOnce();
    expect((await f.checkoutEvent("CHECKOUT_CREATED")).body.ignored).toBe(true);
    expect(f.order.payment_status).toBe("confirmed");
  });

  it.each(["multiple_installments", "has_more", "different_checkout", "missing_amount", "not_yet_confirmed", "empty"])("opens review for ambiguous hosted %s without hiding records or inferring a paid total", async reason => {
    const f = fixture(false);
    const payment = { id: "pay_checkout_test", checkoutSession: "checkout-test", status: "CONFIRMED", value: 100 };
    const payments: Row[] = reason === "empty" ? [] : reason === "multiple_installments"
      ? [{ ...payment, id: "parcel_one", value: 50 }, { ...payment, id: "parcel_two", value: 50 }] : [payment];
    if (reason === "different_checkout") payments[0].checkoutSession = "other-checkout";
    if (reason === "missing_amount") payments[0].value = undefined;
    if (reason === "not_yet_confirmed") payments[0].status = "PENDING";
    f.setHosted(payments, reason === "has_more");
    expect((await f.checkoutEvent()).status).toBe(200);
    expect(f.order.payment_status).toBe("pending"); expect(f.effects).not.toHaveBeenCalled();
    expect(f.db.tables.sales_catalog_payment_reviews).toHaveLength(1);
    expect(f.session.metadata).toMatchObject({ hosted_payment_evidence: { count: payments.length, has_more: reason === "has_more" } });
  });

  it("defers hosted payment when its fresh list cannot be read", async () => {
    const f = fixture(false); f.setHosted([]); f.failProvider();
    expect((await f.checkoutEvent()).status).toBe(503);
    expect(f.session.status).toBe("pending"); expect(f.order.payment_status).toBe("pending"); expect(f.effects).not.toHaveBeenCalled();
  });

  it.each(["cancelled", "expired", "rejected", "approved", "refunded"])("keeps %s and its remote identity intact when hosted reconciliation is ambiguous", async state => {
    const f = fixture(); f.setHosted([]);
    f.session.status = state; f.session.provider_payment_id = "pay_known_identity";
    f.session.provider_status = state === "refunded" ? "REFUNDED" : state.toUpperCase();
    const previousStatus = f.session.provider_status;
    expect((await f.checkoutEvent()).status).toBe(200);
    expect(f.session).toMatchObject({ status: state, provider_payment_id: "pay_known_identity", provider_status: previousStatus,
      provider_status_detail: "verification_pending" });
    expect(f.db.tables.sales_catalog_payment_reviews).toHaveLength(1); expect(f.effects).not.toHaveBeenCalled();
  });

  it("uses the hosted checkout identity to retire a session whose payment ID was reconciled", async () => {
    const f = fixture(); f.setHosted([]); f.session.provider_payment_id = "pay_native_after_hosted";
    await f.checkout.retireCheckoutPaymentsBeforeCartChange(f.db.client as never, "store-test", "order-test");
    expect(f.transport).toHaveBeenCalledOnce();
    expect(new URL(f.transport.mock.calls[0][0]).pathname).toBe("/v3/checkouts/checkout-test/cancel");
    expect(f.session.status).toBe("cancelled");
  });
});
