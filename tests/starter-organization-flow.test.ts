import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const profileSource = read("src/lib/supabase/profile.ts");
const accountCompletionRouteSource = read("src/app/api/account/completion/route.ts");
const planIntentRouteSource = read("src/app/api/dashboard/billing/plan-intent/route.ts");
const planCheckoutPageSource = read("src/app/dashboard/planos/checkout/[subscriptionId]/page.tsx");

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("starter organization flow", () => {
  it("delegates automatic creation to the PF/PJ policy without a personal-name fallback", () => {
    expect(profileSource).toContain("await createInitialCompany(");
    expect(profileSource).toContain("automatic: true");
    expect(profileSource).not.toContain("buildStarterOrganizationName");
  });

  it("creates the starter workspace as soon as account completion is saved", () => {
    expect(accountCompletionRouteSource).toContain("if (accountCompletion.isComplete)");
    expect(accountCompletionRouteSource).toContain("await ensureStarterOrganization();");
  });

  it("does not require a manually created company before plan checkout", () => {
    expect(planIntentRouteSource).toContain(
      "const organization = workspace.organization ?? await ensureStarterOrganization();",
    );
    expect(planIntentRouteSource).not.toContain("if (!workspace.organization)");
    expect(planIntentRouteSource).toContain("loadBlockingSubscription(client, organization.id)");
    expect(planIntentRouteSource).toContain("organization_id: organization.id");

    expect(planCheckoutPageSource).toContain(
      "const organization = workspace.organization ?? await ensureStarterOrganization();",
    );
    expect(planCheckoutPageSource).toContain("organizationId: organization.id");
    expect(planCheckoutPageSource).not.toContain("workspace.organization.id");
  });
});
