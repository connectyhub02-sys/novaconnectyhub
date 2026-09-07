import { describe, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { commerceDatabase } from "./helpers/commerce-database";

type Gate = typeof import("../src/lib/sales-catalog/public-commerce-access");
function accessFixture(initial = false) {
  let allowed = initial;
  const contract = { getContractAccess: vi.fn(async () => ({ allowed, billing_organization_id: "parent" })) };
  const gate = serverModuleHarness<Gate>("src/lib/sales-catalog/public-commerce-access.ts", { "@/lib/billing/contract-access": contract }, [], { Response });
  return { gate, contract, setAllowed: (next: boolean) => { allowed = next; } };
}
const next = { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };
const session = { id: "session", organization_id: "child-store", order_id: "order", provider: "asaas", status: "created" };

describe("suspended public commerce", () => {
  it("uses the current contract for each request and restores without changing catalog or settings", async () => {
    const f = accessFixture();
    const blocked = await f.gate.publicCommerceBlockResponse("child-store", {} as never);
    expect(blocked?.status).toBe(503);
    expect(blocked?.headers.get("Cache-Control")).toContain("no-store");
    expect(await blocked?.json()).toEqual({ error: f.gate.storeUnavailableMessage, code: "store_temporarily_unavailable" });
    f.setAllowed(true);
    expect(await f.gate.publicCommerceBlockResponse("child-store", {} as never)).toBeNull();
    expect(f.contract.getContractAccess).toHaveBeenCalledTimes(2);
    expect(f.contract.getContractAccess).toHaveBeenCalledWith("child-store", {});
  });
  it("fails closed when the contract cannot be verified", async () => {
    const f = accessFixture(true);
    f.contract.getContractAccess.mockRejectedValueOnce(new Error("database unavailable"));
    expect(await f.gate.isPublicCommerceAvailable("store", {} as never)).toBe(false);
  });
  it.each(["asaas", "pagbank", "mercado_pago"])("blocks direct %s card POST before any payment or cart mutation", async provider => {
    const f = accessFixture();
    const db = commerceDatabase({ sales_catalog_payment_sessions: [{ ...session, provider }] });
    const pay = vi.fn();
    const route = serverModuleHarness<{ POST: (r: unknown, c: unknown) => Promise<Response> }>("src/app/api/checkout/[sessionId]/card/route.ts", {
      "next/server": next, "@/lib/supabase/service": { createServiceClient: () => db.client },
      "@/lib/sales-catalog/public-commerce-access": f.gate,
      "@/lib/security/public-request-guard": { validatePublicWriteRequest: () => ({ ok: true }) },
      "@/lib/sales-catalog/transparent-checkout": { payTransparentCheckout: pay },
    });
    const before = structuredClone(db.tables);
    const response = await route.POST({ headers: new Headers(), url: "https://store.test", json: async () => ({}) }, { params: Promise.resolve({ sessionId: "session" }) });
    expect(response.status).toBe(503);
    expect(pay).not.toHaveBeenCalled();
    expect(db.tables).toEqual(before);
  });
  it("does not expose an existing checkout's customer, products, Pix or agent when blocked", async () => {
    const f = accessFixture();
    const db = commerceDatabase({ sales_catalog_payment_sessions: [{ ...session, pix_qr_code: "private-pix" }] });
    const from = vi.spyOn(db.client, "from");
    const page = serverModuleHarness<{ loadCheckoutData: (c: unknown, id: string) => Promise<Record<string, unknown>> }>("src/app/checkout/[sessionId]/page.tsx", {
      "@/lib/sales-catalog/public-commerce-access": f.gate,
    }, ["loadCheckoutData"]);
    const data = await page.loadCheckoutData(db.client, "session");
    expect(data).toMatchObject({ storeUnavailable: true, session: null, order: null, items: [], whatsapp: null, orderBumps: [] });
    expect(from.mock.calls.map(([table]) => table)).toEqual(["sales_catalog_payment_sessions"]);
  });
  it("blocks the shared cart, delivery and upsell loader before loading or mutating an order", async () => {
    const f = accessFixture();
    const id = "33333333-3333-4333-8333-333333333333";
    const db = commerceDatabase({ sales_catalog_payment_sessions: [{ ...session, id }] });
    const from = vi.spyOn(db.client, "from");
    const service = serverModuleHarness<typeof import("../src/lib/sales-catalog/transparent-checkout")>("src/lib/sales-catalog/transparent-checkout.ts", {
      "./public-commerce-access": f.gate,
      "@/lib/sales-catalog/public-commerce-access": f.gate,
    });
    await expect(service.loadTransparentCheckout(db.client as never, id)).rejects.toThrow(f.gate.storeUnavailableMessage);
    expect(from.mock.calls.map(([table]) => table)).toEqual(["sales_catalog_payment_sessions"]);
  });
  it("blocks storefront catalog and lead hydration, preserving a neutral unavailable result", async () => {
    const f = accessFixture();
    const db = commerceDatabase({ organizations: [{ id: "child-store", slug: "store" }] });
    const from = vi.spyOn(db.client, "from");
    const loader = serverModuleHarness<typeof import("../src/lib/sales-catalog/public-storefront-loader")>("src/lib/sales-catalog/public-storefront-loader.ts", {
      "./public-commerce-access": f.gate, "@/lib/supabase/service": { createServiceClient: () => db.client },
    });
    expect(await loader.loadPublicStorefrontPageData({ storeSlug: "store", query: { lead_id: "lead" } })).toEqual({ unavailable: true });
    expect(from.mock.calls.map(([table]) => table)).toEqual(["organizations"]);
  });
  it("denies the old status endpoint without reading the order", async () => {
    const f = accessFixture();
    const db = commerceDatabase({ sales_catalog_payment_sessions: [session] });
    const from = vi.spyOn(db.client, "from");
    const route = serverModuleHarness<{ GET: (r: unknown, c: unknown) => Promise<Response> }>("src/app/api/checkout/[sessionId]/status/route.ts", {
      "next/server": next, "@/lib/supabase/service": { createServiceClient: () => db.client }, "@/lib/sales-catalog/public-commerce-access": f.gate,
    });
    const response = await route.GET({}, { params: Promise.resolve({ sessionId: "session" }) });
    expect(response.status).toBe(503);
    expect(from.mock.calls.map(([table]) => table)).toEqual(["sales_catalog_payment_sessions"]);
  });
});

describe("suspended asynchronous operations", () => {
  it.each([
    ["src/lib/whatsapp/proactive-followup.ts", "processWhatsappProactiveFollowUp"],
    ["src/lib/whatsapp/handoff-notifications.ts", "processWhatsappHandoffNotification"],
    ["src/lib/whatsapp/reconnect-catchup.ts", "processWhatsappReconnectCatchup"],
  ])("skips %s before external calls or a lead write", async (file, name) => {
    const f = accessFixture();
    const db = commerceDatabase({ whatsapp_instances: [{ id: "instance", organization_id: "child-store", status: "connected" }] });
    const fetch = vi.fn();
    const service = serverModuleHarness<Record<string, (i: unknown) => Promise<unknown>>>(file, { "@/lib/billing/contract-access": f.contract }, [], { fetch });
    expect(await service[name]({ client: db.client, data: { organizationId: "child-store", whatsappInstanceId: "instance" } })).toMatchObject({ status: "skipped", reason: "billing_blocked" });
    expect(fetch).not.toHaveBeenCalled();
    expect(Object.keys(db.tables)).toEqual(["whatsapp_instances"]);
  });
  it.each(["maybeNotifyPaymentApproved", "maybeNotifyResponsiblePaymentApproved", "maybeNotifyPaymentStatus", "maybeNotifyResponsiblePaymentStatus"])("suppresses %s without marking a notification as delivered", async name => {
    const f = accessFixture();
    const db = commerceDatabase();
    const service = serverModuleHarness<Record<string, (i: unknown) => Promise<boolean>>>("src/lib/sales-catalog/post-payment.ts", { "@/lib/billing/contract-access": f.contract }, [name]);
    expect(await service[name]({ client: db.client, order: { organization_id: "child-store" } })).toBe(false);
    expect(db.tables).toEqual({});
  });
});
