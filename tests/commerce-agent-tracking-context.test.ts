import { expect, it } from "vitest";
import { getCommerceAgentTrackingSignature } from "@/lib/commerce-agent/tracking-context";

it("does not restart a store session when only the platform tracking label changes", () => {
  const context = { organization_id: "org", agent_id: "agent", lead_id: "lead", product_id: "item" };
  const initial = getCommerceAgentTrackingSignature({ ...context, scope: "organization" });
  expect(getCommerceAgentTrackingSignature({ ...context, scope: "platform" })).toBe(initial);
  for (const key of ["organization_id", "agent_id", "lead_id", "product_id"] as const) {
    expect(getCommerceAgentTrackingSignature({ ...context, [key]: "another" })).not.toBe(initial);
  }
  expect(getCommerceAgentTrackingSignature(null)).toBe("");
});
