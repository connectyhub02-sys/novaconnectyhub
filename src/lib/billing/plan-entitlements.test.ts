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

  it("allows only Start-tier features on starter", () => {
    expect(resolvePlanFeatureEntitlement("whatsapp_core", {
      planCode: "starter",
      organizationStatus: "active",
      billingState: "paid_active",
    }).allowed).toBe(true);

    expect(resolvePlanFeatureEntitlement("whatsapp_campaigns", {
      planCode: "starter",
      organizationStatus: "active",
      billingState: "paid_active",
    }).allowed).toBe(true);

    expect(resolvePlanFeatureEntitlement("whatsapp_groups_channels", {
      planCode: "starter",
      organizationStatus: "active",
      billingState: "paid_active",
    }).allowed).toBe(true);

    expect(resolvePlanFeatureEntitlement("meta_social_inbox", {
      planCode: "starter",
      organizationStatus: "active",
      billingState: "paid_active",
    }).allowed).toBe(false);

    expect(resolvePlanFeatureEntitlement("connectyhub_api", {
      planCode: "starter",
      organizationStatus: "active",
      billingState: "paid_active",
    }).allowed).toBe(false);
  });

  it("allows Pro-tier Meta features on pro and blocks Scale traffic analytics", () => {
    expect(resolvePlanFeatureEntitlement("meta_social_inbox", {
      planCode: "pro",
      organizationStatus: "active",
      billingState: "paid_active",
    }).allowed).toBe(true);

    expect(resolvePlanFeatureEntitlement("meta_comment_to_direct", {
      planCode: "pro",
      organizationStatus: "active",
      billingState: "paid_active",
    }).allowed).toBe(true);

    expect(resolvePlanFeatureEntitlement("meta_organic_insights", {
      planCode: "pro",
      organizationStatus: "active",
      billingState: "paid_active",
    }).allowed).toBe(true);

    const trafficEntitlement = resolvePlanFeatureEntitlement("meta_ads_analytics", {
      planCode: "pro",
      organizationStatus: "active",
      billingState: "paid_active",
    });

    expect(trafficEntitlement.allowed).toBe(false);
    expect(trafficEntitlement.reason).toBe("plan_required");

    const apiEntitlement = resolvePlanFeatureEntitlement("connectyhub_api", {
      planCode: "pro",
      organizationStatus: "active",
      billingState: "paid_active",
    });

    expect(apiEntitlement.allowed).toBe(false);
    expect(apiEntitlement.reason).toBe("plan_required");
  });

  it("allows Scale-tier traffic features on scale", () => {
    expect(resolvePlanFeatureEntitlement("meta_ads_analytics", {
      planCode: "scale",
      organizationStatus: "active",
      billingState: "paid_active",
    }).allowed).toBe(true);

    expect(resolvePlanFeatureEntitlement("google_ads_analytics", {
      planCode: "scale",
      organizationStatus: "active",
      billingState: "paid_active",
    }).allowed).toBe(true);

    expect(resolvePlanFeatureEntitlement("ai_traffic_manager", {
      planCode: "scale",
      organizationStatus: "active",
      billingState: "paid_active",
    }).allowed).toBe(true);

    expect(resolvePlanFeatureEntitlement("connectyhub_api", {
      planCode: "scale",
      organizationStatus: "active",
      billingState: "paid_active",
    }).allowed).toBe(true);
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
