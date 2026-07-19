import { describe, expect, it } from "vitest";
import {
  createOrganizationTrackingToken,
  decideOrganizationAttribution,
  verifyOrganizationTrackingToken,
} from "../src/lib/tracking/organization-attribution";

const organizationId = "11111111-1111-4111-8111-111111111111";
const secret = "test-secret";

describe("organization attribution", () => {
  it("verifies signed organization tracking tokens", () => {
    const token = createOrganizationTrackingToken(organizationId, secret);

    expect(verifyOrganizationTrackingToken(organizationId, token, secret)).toBe(true);
    expect(verifyOrganizationTrackingToken("22222222-2222-4222-8222-222222222222", token, secret)).toBe(false);
    expect(verifyOrganizationTrackingToken(organizationId, `${token}tampered`, secret)).toBe(false);
  });

  it("keeps unauthenticated organization requests in platform scope", () => {
    const decision = decideOrganizationAttribution({
      requestedOrganizationId: organizationId,
      requestedScope: "organization",
    });

    expect(decision).toEqual({
      scope: "platform",
      organizationId: null,
      reason: "untrusted_organization",
    });
  });

  it("allows organization scope for authenticated members", () => {
    const decision = decideOrganizationAttribution({
      requestedOrganizationId: organizationId,
      requestedScope: "organization",
      authenticatedCanAccessOrganization: true,
    });

    expect(decision).toEqual({
      scope: "organization",
      organizationId,
      reason: "authenticated_member",
    });
  });

  it("allows organization scope for valid public tokens", () => {
    const decision = decideOrganizationAttribution({
      requestedOrganizationId: organizationId,
      requestedScope: "organization",
      hasValidTrackingToken: true,
    });

    expect(decision).toEqual({
      scope: "organization",
      organizationId,
      reason: "signed_token",
    });
  });
});
