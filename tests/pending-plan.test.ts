import { describe, expect, it } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

const checkout = serverModuleHarness<typeof import("../src/lib/billing/plan-checkout")>("src/lib/billing/plan-checkout.ts");
const fixtures = [
  { id: "other-org", organization_id: "other", subscription_kind: "plan", status: "past_due" },
  { id: "product", organization_id: "org", subscription_kind: "product", status: "past_due" },
  { id: "paid", organization_id: "org", subscription_kind: "plan", status: "active" },
  { id: "renewal", organization_id: "org", subscription_kind: "plan", status: "past_due" },
];

function setup(fail = false, paid = false) {
  let rows = fixtures;
  const query = {
    select: () => query,
    eq: (key: string, value: string) => { rows = rows.filter(row => row[key as keyof typeof row] === value); return query; },
    in: (key: string, values: string[]) => { rows = rows.filter(row => values.includes(row[key as keyof typeof row])); return query; },
    order: async () => ({ data: rows, error: fail ? new Error("unavailable") : null }),
  };
  const billingModule = serverModuleHarness<typeof import("../src/lib/billing/pending-plan")>("src/lib/billing/pending-plan.ts", {
    "./plan-checkout": { ...checkout, loadBillingCheckoutIntent: async (_: unknown, { subscriptionId }: { subscriptionId: string }) => ({
      subscription: fixtures.find(row => row.id === subscriptionId),
      invoice: { status: paid || subscriptionId === "paid" ? "paid" : "open", total_brl: "497.00" },
      payment: { status: paid || subscriptionId === "paid" ? "approved" : "pending" },
      plan: { name: "Scale" }, targetPlanCode: "scale", checkoutKind: "renewal",
    }) },
  });
  return () => billingModule.loadPendingPlan({ from: () => query } as never, "org");
}

describe("plan payment entry for suspended customers", () => {
  it("offers the existing overdue invoice, excluding paid invoices, products and other organizations", async () => {
    expect(await setup()()).toEqual({ subscriptionId: "renewal", planCode: "scale", planName: "Scale", amountBrl: 497, renewal: true, checkoutUrl: "/dashboard/planos/checkout/renewal" });
  });
  it("does not present an already settled invoice for another payment", async () => {
    expect(await setup(false, true)()).toBeNull();
  });
  it("does not represent a failed financial lookup as absence of a bill", async () => {
    await expect(setup(true)()).rejects.toThrow("Não foi possível consultar");
  });
});
