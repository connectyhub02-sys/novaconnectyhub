import { describe, expect, it } from "vitest";
import {
  campaignCyclePrice,
  isCampaignEligible,
  parseCampaign,
  quoteCampaign,
  type CampaignConfig,
} from "@/lib/commerce/campaigns";
const config: CampaignConfig = {
  name: "Oferta",
  description: "",
  status: "active",
  startsAt: "2026-09-01T03:00:00Z",
  endsAt: "2026-10-01T03:00:00Z",
  targetIds: ["pro"],
  originIds: [],
  audience: "all",
  buyerIds: [],
  operations: ["initial", "reactivation", "upgrade"],
  options: [
    { id: "month", interval: "month", price: 100, permanentDiscount: 0 },
    { id: "semester", interval: "semester", price: 600, permanentDiscount: 30 },
  ],
  stages: [
    { cycles: 1, kind: "percent", value: 90 },
    { cycles: 2, kind: "percent", value: 50 },
  ],
  maxUses: 1,
  message: "",
};
describe("commercial campaign contract", () => {
  it("prices staged monthly benefits and returns to the contractual price", () => {
    const c = parseCampaign(config);
    expect(
      [0, 1, 2, 3, 4].map((i) => campaignCyclePrice(c.options[0], c.stages, i)),
    ).toEqual([10, 50, 50, 100, 100]);
  });
  it("separates a prepaid semester from six monthly debits", () => {
    const c = parseCampaign({ ...config, stages: [] });
    const q = quoteCampaign("id", 1, c, "semester");
    expect(q.price_brl).toBe(420);
    expect(q.next_price_brl).toBe(420);
    expect(q.interval).toBe("semester");
  });
  it("does not stack a 30% package discount with a 20% introductory discount", () => {
    const c = parseCampaign({
      ...config,
      stages: [{ cycles: 1, kind: "percent", value: 20 }],
    });
    expect(quoteCampaign("id", 1, c, "semester").price_brl).toBe(420);
  });
  it("keeps contracted stages valid after the enrollment window closes", () => {
    const context = {
      targetId: "pro",
      buyerId: "buyer",
      previousPurchase: false,
      inactive: false,
      operation: "initial" as const,
      uses: 0,
      now: Date.parse(config.endsAt),
    };
    expect(isCampaignEligible(config, context)).toBe(false);
    expect(quoteCampaign("id", 1, config, "month", 1).price_brl).toBe(50);
  });
  it("allows old customers in a reactivation campaign and isolates selected buyers", () => {
    const context = {
      targetId: "pro",
      buyerId: "buyer",
      previousPurchase: true,
      inactive: true,
      operation: "reactivation" as const,
      uses: 0,
      now: Date.parse("2026-09-07"),
    };
    expect(
      isCampaignEligible({ ...config, audience: "inactive" }, context),
    ).toBe(true);
    expect(isCampaignEligible({ ...config, audience: "new" }, context)).toBe(
      false,
    );
    expect(
      isCampaignEligible(
        { ...config, audience: "selected", buyerIds: ["someone_else"] },
        context,
      ),
    ).toBe(false);
  });
  it("enforces origin, target, usage limit and exact end time", () => {
    const context = {
      targetId: "pro",
      originId: "start",
      buyerId: "buyer",
      previousPurchase: true,
      inactive: false,
      operation: "upgrade" as const,
      uses: 0,
      now: Date.parse("2026-09-07"),
    };
    expect(
      isCampaignEligible({ ...config, originIds: ["scale"] }, context),
    ).toBe(false);
    expect(isCampaignEligible(config, { ...context, uses: 1 })).toBe(false);
    expect(isCampaignEligible(config, { ...context, targetId: "scale" })).toBe(
      false,
    );
  });
  it("does cent rounding and rejects zero, excess precision and invalid stages", () => {
    expect(
      campaignCyclePrice(
        { id: "month", interval: "month", price: 97.99, permanentDiscount: 0 },
        [{ cycles: 1, kind: "percent", value: 90 }],
        0,
      ),
    ).toBe(9.8);
    expect(() =>
      parseCampaign({
        ...config,
        stages: [{ cycles: 0, kind: "percent", value: 10 }],
      }),
    ).toThrow();
    expect(() =>
      parseCampaign({
        ...config,
        stages: [{ cycles: 1, kind: "percent", value: 100 }],
      }),
    ).toThrow();
    expect(() =>
      parseCampaign({
        ...config,
        options: [{ id: "month", interval: "month", price: 100.001 }],
      }),
    ).toThrow();
  });
  it("does not promise future monthly discounts on an avulso", () => {
    expect(() => quoteCampaign("id", 1, config, "month", 0, false)).toThrow();
    expect(
      quoteCampaign(
        "id",
        1,
        { ...config, stages: [config.stages[0]] },
        "month",
        0,
        false,
      ).next_price_brl,
    ).toBe(0);
  });
});
