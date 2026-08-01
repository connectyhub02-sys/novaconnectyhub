import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DashboardCompanyScopeError,
  resolveDashboardCompanyId,
  statusForDashboardCompanyScopeError,
} from "./dashboard-route-scope";
import type { CurrentWorkspace } from "@/lib/supabase/profile";

const workspace = {
  user: { id: "user-a" },
  profile: {
    id: "user-a",
    email: null,
    fullName: null,
    phone: null,
    companyName: null,
    avatarUrl: null,
    trialWhatsappOptIn: false,
    trialWhatsappOptInAt: null,
    isPlatformAdmin: false,
  },
  organization: {
    id: "org-a",
    name: "Empresa A",
    slug: "empresa-a",
    role: "owner",
    planCode: "pro",
    status: "active",
  },
} as unknown as CurrentWorkspace;

describe("resolveDashboardCompanyId", () => {
  it("uses the active organization when the request does not send a company", () => {
    expect(resolveDashboardCompanyId({ workspace })).toBe("org-a");
  });

  it("accepts a requested company only when it matches the active organization", () => {
    expect(resolveDashboardCompanyId({ workspace, requestedCompanyId: " org-a " })).toBe("org-a");
  });

  it("rejects a requested company outside the active organization", () => {
    expect(() => resolveDashboardCompanyId({ workspace, requestedCompanyId: "org-b" }))
      .toThrow(DashboardCompanyScopeError);

    try {
      resolveDashboardCompanyId({ workspace, requestedCompanyId: "org-b" });
    } catch (error) {
      expect(statusForDashboardCompanyScopeError(error, 500)).toBe(403);
    }
  });

  it("rejects requests when the user has no active organization", () => {
    const workspaceWithoutOrganization = {
      ...workspace,
      organization: null,
    } as CurrentWorkspace;

    try {
      resolveDashboardCompanyId({ workspace: workspaceWithoutOrganization });
    } catch (error) {
      expect(error).toBeInstanceOf(DashboardCompanyScopeError);
      expect(statusForDashboardCompanyScopeError(error, 500)).toBe(422);
    }
  });
});
