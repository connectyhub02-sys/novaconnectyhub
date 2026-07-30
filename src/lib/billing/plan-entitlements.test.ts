import { describe, expect, it } from "vitest";
import { resolveMetaSocialChannelsEntitlement } from "./plan-entitlements";

describe("resolveMetaSocialChannelsEntitlement", () => {
  it("allows Meta social channels during active trial", () => {
    const entitlement = resolveMetaSocialChannelsEntitlement({
      planCode: "trial",
      organizationStatus: "trial",
      billingState: "trial_active",
    });

    expect(entitlement.allowed).toBe(true);
    expect(entitlement.reason).toBe("trial_active");
  });

  it("blocks Meta social channels on starter after trial", () => {
    const entitlement = resolveMetaSocialChannelsEntitlement({
      planCode: "starter",
      organizationStatus: "active",
      billingState: "paid_active",
    });

    expect(entitlement.allowed).toBe(false);
    expect(entitlement.reason).toBe("plan_required");
  });

  it("allows Meta social channels on pro and scale", () => {
    expect(resolveMetaSocialChannelsEntitlement({
      planCode: "pro",
      organizationStatus: "active",
      billingState: "paid_active",
    }).allowed).toBe(true);

    expect(resolveMetaSocialChannelsEntitlement({
      planCode: "scale",
      organizationStatus: "active",
      billingState: "paid_active",
    }).allowed).toBe(true);
  });
});
