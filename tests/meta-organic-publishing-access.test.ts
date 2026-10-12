import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ access: vi.fn(), billing: vi.fn(), entitlement: vi.fn(), owner: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/account/signup-completion", () => ({ AccountCompletionRequiredError: class extends Error {} }));
vi.mock("@/lib/billing/access-control", () => ({ assertOrganizationFeatureAccess: m.access, PlanFeatureAccessError: class extends Error {} }));
vi.mock("@/lib/billing/trial", () => ({ getOrganizationBillingAccess: m.billing }));
vi.mock("@/lib/billing/plan-entitlements", () => ({ resolvePlanFeatureEntitlement: m.entitlement }));
import { AccountCompletionRequiredError } from "@/lib/account/signup-completion";
import { PlanFeatureAccessError } from "@/lib/billing/access-control";
import { assertOrganicPublishingAccess } from "../src/lib/meta/organic-publishing-access";
const org = "4cd0a6bd-4e3c-4773-a9ef-511c802b48df";
const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: m.owner }) }) }), auth: { admin: { getUserById: m.user } } } as unknown as SupabaseClient;
let signup: Error;
const review = (overrides = {}) => ({ organization_id: org, expires_at: new Date(Date.now() + 60_000).toISOString(), ...overrides });
beforeEach(() => {
  vi.resetAllMocks();
  signup = Object.create(AccountCompletionRequiredError.prototype);
  m.access.mockRejectedValue(signup);
  m.owner.mockResolvedValue({ data: { owner_id: "review-owner" }, error: null });
  m.user.mockResolvedValue({ data: { user: { app_metadata: { meta_review: review() } } }, error: null });
  m.billing.mockResolvedValue({ planCode: "scale", organizationStatus: "active", state: "active" });
  m.entitlement.mockReturnValue({ allowed: true });
});
describe("organic publishing review signup exception", () => {
  it("preserves normal customer access without inspecting review metadata", async () => {
    m.access.mockResolvedValue({ entitlement: { allowed: true } });
    await assertOrganicPublishingAccess(client, org);
    expect(m.user).not.toHaveBeenCalled();
  });
  it("accepts only the actual owner grant and still evaluates billing and plan", async () => {
    await assertOrganicPublishingAccess(client, org);
    expect(m.user).toHaveBeenCalledWith("review-owner");
    expect(m.billing).toHaveBeenCalledWith({ client, organizationId: org });
    expect(m.entitlement).toHaveBeenCalled();
  });
  it.each([
    { app_metadata: {} },
    { user_metadata: { meta_review: review() } },
    { app_metadata: { meta_review: review({ organization_id: "ffffffff-ffff-ffff-ffff-ffffffffffff" }) } },
    { app_metadata: { meta_review: review({ expires_at: "2020-01-01" }) } },
  ])("rejects missing, untrusted, cross-tenant or expired grants", async user => {
    m.user.mockResolvedValue({ data: { user }, error: null });
    await expect(assertOrganicPublishingAccess(client, org)).rejects.toBe(signup);
    expect(m.billing).not.toHaveBeenCalled();
  });
  it("does not waive a plan denial", async () => {
    m.entitlement.mockReturnValue({ allowed: false });
    await expect(assertOrganicPublishingAccess(client, org)).rejects.toBeInstanceOf(PlanFeatureAccessError);
  });
  it("does not intercept unrelated failures", async () => {
    const failure = new Error("Database unavailable");
    m.access.mockRejectedValue(failure);
    await expect(assertOrganicPublishingAccess(client, org)).rejects.toBe(failure);
    expect(m.user).not.toHaveBeenCalled();
  });
});
