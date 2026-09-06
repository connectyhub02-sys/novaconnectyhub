import { describe, expect, it } from "vitest";
import { billingDeadline, billingLocalDate, billingPeriodEnd, isBillingDeadlineReached, readCommercialTerms } from "./commercial-terms";

describe("commercial billing boundaries", () => {
  it("blocks at exactly 72 hours, not the fourth day", () => {
    const due = "2026-09-02T18:57:00Z";
    expect(billingDeadline(due, 3)?.toISOString()).toBe("2026-09-05T18:57:00.000Z");
    expect(isBillingDeadlineReached(due, 3, new Date("2026-09-05T18:56:59.999Z"))).toBe(false);
    expect(isBillingDeadlineReached(due, 3, new Date("2026-09-05T18:57:00Z"))).toBe(true);
    expect(isBillingDeadlineReached(due, 0, new Date(due))).toBe(true);
  });
  it("preserves calendar renewal at month and leap-year boundaries", () => {
    expect(billingPeriodEnd(new Date("2028-01-31T18:57:00Z"), readCommercialTerms({})).toISOString()).toBe("2028-02-29T18:57:00.000Z");
    expect(billingPeriodEnd(new Date("2028-02-29T18:57:00Z"), readCommercialTerms({ billing_interval: "year" })).toISOString()).toBe("2029-02-28T18:57:00.000Z");
  });
  it("requires an explicit access period for a one-time service plan", () => {
    expect(() => billingPeriodEnd(new Date(), readCommercialTerms({ billing_cycle: "one_time" }))).toThrow();
    expect(billingPeriodEnd(new Date("2026-09-06T10:00:00Z"), readCommercialTerms({ billing_cycle: "one_time", access_duration_days: 90 })).toISOString()).toBe("2026-12-05T10:00:00.000Z");
  });
  it("deduplicates notices by the customer's Brazilian day", () => {
    expect(billingLocalDate(new Date("2026-09-07T00:01:00Z"))).toBe("2026-09-06");
  });
});
