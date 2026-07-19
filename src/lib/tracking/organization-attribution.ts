import { createHmac, timingSafeEqual } from "node:crypto";

export type OrganizationAttributionDecision = {
  scope: "platform" | "organization";
  organizationId: string | null;
  reason:
    | "not_requested"
    | "authenticated_member"
    | "signed_token"
    | "untrusted_organization";
};

type DecideOrganizationAttributionInput = {
  requestedOrganizationId: string | null;
  requestedScope?: string | null;
  allowOrganizationIdWithoutScope?: boolean;
  authenticatedCanAccessOrganization?: boolean;
  hasValidTrackingToken?: boolean;
};

const trackingTokenVersion = "v1";

export function decideOrganizationAttribution(
  input: DecideOrganizationAttributionInput,
): OrganizationAttributionDecision {
  const requestedOrganization = Boolean(
    input.requestedOrganizationId
      && (input.requestedScope === "organization" || input.allowOrganizationIdWithoutScope),
  );

  if (!requestedOrganization || !input.requestedOrganizationId) {
    return {
      scope: "platform",
      organizationId: null,
      reason: "not_requested",
    };
  }

  if (input.authenticatedCanAccessOrganization) {
    return {
      scope: "organization",
      organizationId: input.requestedOrganizationId,
      reason: "authenticated_member",
    };
  }

  if (input.hasValidTrackingToken) {
    return {
      scope: "organization",
      organizationId: input.requestedOrganizationId,
      reason: "signed_token",
    };
  }

  return {
    scope: "platform",
    organizationId: null,
    reason: "untrusted_organization",
  };
}

export function createOrganizationTrackingToken(organizationId: string, secret: string) {
  return `${trackingTokenVersion}.${organizationId}.${signOrganizationId(organizationId, secret)}`;
}

export function verifyOrganizationTrackingToken(
  organizationId: string | null,
  token: string | null,
  secret = process.env.TRACKING_PUBLIC_TOKEN_SECRET,
) {
  if (!organizationId || !token || !secret) {
    return false;
  }

  const [version, tokenOrganizationId, signature, ...extra] = token.split(".");

  if (
    extra.length > 0
    || version !== trackingTokenVersion
    || tokenOrganizationId !== organizationId
    || !signature
  ) {
    return false;
  }

  return safeEqual(signature, signOrganizationId(organizationId, secret));
}

function signOrganizationId(organizationId: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${trackingTokenVersion}.${organizationId}`)
    .digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
