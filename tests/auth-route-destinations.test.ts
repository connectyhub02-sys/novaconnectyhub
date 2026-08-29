import { describe, expect, it } from "vitest";
import {
  CLIENT_PLANS_PATH,
  resolveAuthenticatedEntryPath,
  shouldRedirectPlatformAdminFromClientPage,
} from "../src/lib/auth/route-destinations";

describe("authenticated route destinations", () => {
  it("keeps platform admins inside Admin OS by default", () => {
    expect(resolveAuthenticatedEntryPath({ isPlatformAdmin: true })).toBe("/admin");
    expect(resolveAuthenticatedEntryPath({ isPlatformAdmin: true, nextPath: "/dashboard/planos" })).toBe("/admin");
    expect(resolveAuthenticatedEntryPath({ isPlatformAdmin: true, currentPath: "/iniciar", plan: "scale" })).toBe("/admin");
  });

  it("allows platform admin deep links only inside Admin OS", () => {
    expect(resolveAuthenticatedEntryPath({ isPlatformAdmin: true, nextPath: "/admin/financeiro" })).toBe("/admin/financeiro");
    expect(resolveAuthenticatedEntryPath({ isPlatformAdmin: true, nextPath: "//evil.example" })).toBe("/admin");
  });

  it("sends client users to requested client pages or the plans flow", () => {
    expect(resolveAuthenticatedEntryPath({ isPlatformAdmin: false, nextPath: "/dashboard/links" })).toBe("/dashboard/links");
    expect(resolveAuthenticatedEntryPath({ isPlatformAdmin: false, nextPath: "/admin" })).toBe("/dashboard");
    expect(resolveAuthenticatedEntryPath({ isPlatformAdmin: false, currentPath: "/iniciar", plan: "pro" })).toBe(`${CLIENT_PLANS_PATH}?plan=pro`);
  });

  it("identifies Client OS pages that platform admins should leave", () => {
    expect(shouldRedirectPlatformAdminFromClientPage("/dashboard")).toBe(true);
    expect(shouldRedirectPlatformAdminFromClientPage("/dashboard/planos")).toBe(true);
    expect(shouldRedirectPlatformAdminFromClientPage("/admin")).toBe(false);
  });
});
