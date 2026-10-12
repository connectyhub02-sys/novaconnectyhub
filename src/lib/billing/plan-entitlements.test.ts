import { describe, expect, it } from "vitest";
import {
  planFeatureDefinitions,
  resolveMetaSocialChannelsEntitlement,
  resolvePlanFeatureEntitlement,
} from "./plan-entitlements";

const allFeatureCodes = Object.keys(planFeatureDefinitions) as Array<keyof typeof planFeatureDefinitions>;

describe("resolvePlanFeatureEntitlement", () => {
  it("allows every feature during active trial", () => {
    for (const featureCode of allFeatureCodes) {
      const entitlement = resolvePlanFeatureEntitlement(featureCode, {
        planCode: "trial",
        organizationStatus: "trial",
        billingState: "trial_active",
      });

      expect(entitlement.allowed).toBe(true);
      expect(entitlement.reason).toBe("trial_active");
    }
  });

  it("allows every feature on every active commercial plan with and without billing context", () => {
    for (const planCode of ["start", "starter", "pro", "scale"]) {
      for (const featureCode of allFeatureCodes) {
        for (const billingState of [undefined, "paid_active"] as const) {
          const access = resolvePlanFeatureEntitlement(featureCode, {planCode, organizationStatus: "active", billingState});
          expect(access.allowed, `${planCode}/${featureCode}`).toBe(true);
          expect(access.requiredPlanCodes).toEqual(["starter", "pro", "scale"]);
        }
      }
    }
  });
  it("preserves inactive accounts, exhausted AI credits and explicit restrictions", () => {
    for (const planCode of ["starter", "pro", "scale"]) {
      expect(resolvePlanFeatureEntitlement("ai_traffic_manager", {planCode, billingState: "paid_no_credits"}).allowed).toBe(false);
      expect(resolvePlanFeatureEntitlement("meta_ads_analytics", {planCode, organizationStatus: "suspended"}).allowed).toBe(false);
      expect(resolvePlanFeatureEntitlement("meta_ads_analytics", {planCode, organizationStatus: "active", featureOverrides: {meta_ads_analytics: false}}).allowed).toBe(false);
    }
    expect(resolvePlanFeatureEntitlement("ai_traffic_manager", {planCode: "trial", organizationStatus: "trial_expired"}).allowed).toBe(false);
  });

  it("blocks paid plans when billing access is inactive", () => {
    const entitlement = resolvePlanFeatureEntitlement("meta_ads_analytics", {
      planCode: "scale",
      organizationStatus: "active",
      billingState: "paid_expired",
    });

    expect(entitlement.allowed).toBe(false);
    expect(entitlement.reason).toBe("billing_blocked");
  });
});

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

  it("allows Meta social channels on starter after trial", () => {
    const entitlement = resolveMetaSocialChannelsEntitlement({
      planCode: "starter",
      organizationStatus: "active",
      billingState: "paid_active",
    });

    expect(entitlement.allowed).toBe(true);
    expect(entitlement.reason).toBe("allowed");
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
