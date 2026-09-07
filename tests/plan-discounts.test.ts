import { describe, expect, it } from "vitest";
import { snapshotPlanCommercialTerms, billingPeriodEnd, readCommercialTerms } from "../src/lib/billing/commercial-terms";
import { parseDiscountPercent, previewPlanDiscounts, readCheckoutPlanAmounts, planDiscountNotice } from "../src/lib/billing/plan-discounts";

describe("plan promotion pricing", () => {
  it("charges 10 on a 100 plan with 90% off and retains 100 for renewal", () => {
    const plan = { monthly_price_brl: 100, first_purchase_discount_percent: 90 };
    expect(previewPlanDiscounts(plan)).toMatchObject({ firstAmount: 10, renewalAmount: 100 });
    expect(snapshotPlanCommercialTerms(plan).price_brl).toBe(100);
  });
  it("rounds discounts to cents and accepts two decimal percentages", () => {
    expect(parseDiscountPercent("99.99")).toBe(99.99);
    expect(previewPlanDiscounts({ monthly_price_brl: 97, first_purchase_discount_percent: 90 }).firstAmount).toBe(9.7);
    expect(previewPlanDiscounts({ monthly_price_brl: 10.01, first_purchase_discount_percent: 50 }).firstAmount).toBe(5);
  });
  it.each([-1, 100, 101, Infinity, NaN, "no", 10.001])("rejects invalid discount %s", value => {
    expect(() => parseDiscountPercent(value)).toThrow();
  });
  it("annual discount applies to the annual period price and does not stack", () => {
    const plan = { monthly_price_brl: 1200, billing_interval: "year", annual_discount_percent: 20, first_purchase_discount_percent: 90 };
    expect(previewPlanDiscounts(plan)).toMatchObject({ firstAmount: 120, renewalAmount: 960 });
    expect(previewPlanDiscounts({ ...plan, first_purchase_discount_percent: 10 }).firstAmount).toBe(960);
    const terms = snapshotPlanCommercialTerms(plan);
    expect(terms.price_brl).toBe(960);
    expect(billingPeriodEnd(new Date("2026-09-07T12:00:00Z"), readCommercialTerms(terms)).toISOString()).toBe("2027-09-07T12:00:00.000Z");
  });
  it("does not apply annual discounts to a monthly or one-time plan", () => {
    expect(previewPlanDiscounts({ monthly_price_brl: 100, annual_discount_percent: 20 }).renewalAmount).toBe(100);
    expect(previewPlanDiscounts({ monthly_price_brl: 100, annual_discount_percent: 20, billing_interval: "year", billing_cycle: "one_time" }).renewalAmount).toBe(100);
  });
  it("ignores a prior promotion copied into renewal metadata", () => {
    const intent = { checkoutKind: "initial", plan: { monthly_price_brl: 100 }, payment: { payload: { plan_pricing: { price_brl: 10, list_price_brl: 100, first_purchase_discount_percent: 90 } } } };
    expect(readCheckoutPlanAmounts(intent)).toMatchObject({ amount: 10, discountAmount: 90, renewalAmount: 100 });
    expect(readCheckoutPlanAmounts({ ...intent, checkoutKind: "renewal" })).toMatchObject({ amount: 100, discountAmount: 0 });
    expect(readCheckoutPlanAmounts({ ...intent, checkoutKind: "plan_change" }).amount).toBe(100);
  });
  it("explains the real next charge in the WhatsApp notification", () => {
    const metadata = { checkout_kind: "initial", plan_pricing: { first_purchase_discount_percent: 90, renewal_price_brl: 100 }, commercial_terms: { billing_interval: "month" } };
    expect(planDiscountNotice(metadata)).toContain("90%");
    expect(planDiscountNotice(metadata)).toContain("renovação mensal");
    expect(planDiscountNotice(metadata)).toContain("100,00");
    expect(planDiscountNotice({ ...metadata, checkout_kind: "renewal" })).toBe("");
  });
});
