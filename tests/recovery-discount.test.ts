import { describe, expect, it, vi } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

type DiscountModule = typeof import("@/lib/automations/recovery-discount");

function setup(options: { percent?: number | null; provider?: string; discountTotal?: string; earlierDiscount?: boolean; applied?: boolean; cycles?: string[] } = {}) {
  const now = new Date().toISOString();
  const db = commerceDatabase({
    automation_policies: [{ id: "policy", organization_id: "org", recovery_discount_percent: options.percent === undefined ? 10 : options.percent }],
    sales_catalog_orders: [
      { id: "order", organization_id: "org", lead_id: "lead", conversation_id: "conversation", status: "pending_payment", payment_status: "pending",
        subtotal: "100", discount_total: options.discountTotal ?? null, total: "115", shipping_total: "15", shipping_method: "Correios", destination_cep: "88330000",
        destination_address: "Rua das Flores, 42, Centro", checkout_revision: 2, latest_payment_session_id: "session",
        metadata: { preferred_payment_method: "pix", billing_cycles: options.cycles ?? ["one_time"] }, created_at: now },
      { id: "older", organization_id: "org", lead_id: "lead", conversation_id: "conversation", status: "cancelled", payment_status: "pending", created_at: now },
    ],
    sales_catalog_order_revisions: [
      ...(options.earlierDiscount ? [{ organization_id: "org", order_id: "older", request_id: "recovery-discount:older", state: "applied", created_at: now }] : []),
      ...(options.applied ? [{ organization_id: "org", order_id: "order", request_id: "recovery-discount:order", state: "applied", created_at: now }] : []),
    ],
    sales_catalog_payment_sessions: [{ id: "session", organization_id: "org", order_id: "order", provider: options.provider ?? "asaas", created_at: now }],
    sales_catalog_order_items: [
      { organization_id: "org", order_id: "order", catalog_item_id: "product", title: "Whey", quantity: 2, unit_price: "35", total: "70" },
      { organization_id: "org", order_id: "order", catalog_item_id: "shirt", title: "Camiseta", quantity: 1, unit_price: "30", total: "30" },
    ],
  });
  const revision = vi.fn(async () => ({}));
  const session = vi.fn(async () => ({}));
  const discount = serverModuleHarness<DiscountModule>("src/lib/automations/recovery-discount.ts", {
    "@/lib/sales-catalog/order-revision": { applySalesCatalogOrderRevision: revision },
    "@/lib/sales-catalog/payment-sessions": { createSalesCatalogPixPaymentSession: session },
  });
  const plan = () => discount.planRecoveryDiscount(db.client as never, { organizationId: "org", leadId: "lead", conversationId: "conversation", orderId: "order" });
  return { db, revision, session, plan };
}

describe("payment recovery discount", () => {
  it("offers nothing unless the owner set a percentage", async () => {
    expect(await setup({ percent: null }).plan()).toBeNull();
  });

  it("plans the owner's percentage over the items only and changes nothing before apply", async () => {
    const s = setup();
    const plan = await s.plan();
    expect(plan).toMatchObject({ percent: 10, discount: 10, total: 105, applied: false });
    expect(s.revision).not.toHaveBeenCalled();
    await plan!.apply();
    expect(s.revision).toHaveBeenCalledWith(expect.objectContaining({ orderId: "order", expectedRevision: 2, requestId: "recovery-discount:order",
      discountTotal: 10, expectedTotal: 105, preferredPaymentMethod: "pix" }));
    expect(s.session).toHaveBeenCalledWith(expect.objectContaining({ deferProvider: true, deferReason: "recovery_discount", amount: 105 }));
  });

  it.each([
    ["another discount on the order", { discountTotal: "5" }],
    ["a recovery discount in the last 30 days", { earlierDiscount: true }],
    ["a provider other than Asaas", { provider: "pagbank" }],
    ["a subscription", { cycles: ["monthly"] }],
  ])("gives no discount with %s", async (_label, options) => {
    expect(await setup(options).plan()).toBeNull();
  });

  it("returns the discount already applied on a retry without revising again", async () => {
    const s = setup({ applied: true, discountTotal: "10" });
    s.db.tables.sales_catalog_orders[0].total = "105";
    const plan = await s.plan();
    expect(plan).toMatchObject({ discount: 10, total: 105, applied: true });
    await plan!.apply();
    expect(s.revision).not.toHaveBeenCalled();
    expect(s.session).not.toHaveBeenCalled();
  });
});
