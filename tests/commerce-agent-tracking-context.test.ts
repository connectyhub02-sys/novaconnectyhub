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

it("keeps the checkout context when a stale store tracking response arrives", async () => {
  const { fillMissingPublicTrackingContext } = await import("@/lib/tracking/public-context");
  const checkout = { organization_id: "org", payment_session_id: "pay", tracking_source: "sales_catalog_checkout" };
  const staleStore = { organization_id: "org", lead_id: "lead", lead_name: "Magno", tracking_source: "sales_catalog_store" };
  expect(fillMissingPublicTrackingContext(checkout, staleStore)).toMatchObject({
    tracking_source: "sales_catalog_checkout",
    payment_session_id: "pay",
    lead_id: "lead",
    lead_name: "Magno",
  });
  expect(fillMissingPublicTrackingContext(checkout, { ...staleStore, organization_id: "other" })).toBe(checkout);
  expect(fillMissingPublicTrackingContext(null, staleStore)).toBe(staleStore);
});
