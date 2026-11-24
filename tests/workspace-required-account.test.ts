import { expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import * as missing from "../src/lib/account/workspace-required";
import { serverModuleHarness } from "./helpers/server-module-harness";

function fixture(signedIn = true) {
  const ensureStarterOrganization = vi.fn(async () => null);
  const from = vi.fn(() => { throw new Error("No organization data should be queried"); });
  const completion = { isComplete: true, fullName: "Pessoa", email: "person@example.test", phone: null,
    phoneNormalized: null, phoneVerified: true, phoneWhatsappExists: true, cpfPreview: "***", signupCompletedAt: "2026-11-01", companyName: null };
  const imports = {
    "next/server": { NextResponse },
    "@/lib/account/workspace-required": missing,
    "@/lib/supabase/profile": { ensureStarterOrganization, getCurrentWorkspace: async () => signedIn ? {
      user: { id: "self", email: completion.email }, profile: { id: "self", email: completion.email, avatarUrl: null }, organization: null,
    } : null },
    "@/lib/supabase/service": { createServiceClient: () => ({ from }) },
    "@/lib/account/signup-completion": { getAccountCompletionStatusForUser: async () => completion },
  };
  return { from, ensureStarterOrganization, imports };
}
it("returns a readable own account without a fabricated company or wallet", async () => {
  const f=fixture();
  const route=serverModuleHarness<{GET(): Promise<NextResponse>}>("src/app/api/dashboard/account/route.ts",f.imports);
  const response=await route.GET(); expect(response.status).toBe(200);
  const data=await response.json();
  expect(data).toMatchObject({workspaceRequired:true, account:{organization:null,profile:{id:"self",fullName:"Pessoa"},wallet:{status:"not_created",balanceCredits:0},payments:[]}});
  expect(f.from).not.toHaveBeenCalled();
});
it("returns an explicit restricted onboarding status instead of an error interpreted as full navigation", async () => {
  const f=fixture();
  const route=serverModuleHarness<{GET(): Promise<NextResponse>}>("src/app/api/dashboard/billing/status/route.ts",f.imports);
  const response=await route.GET(); expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({workspaceRequired:true,billingAccess:{state:"inactive",canUseBillableFeatures:false,ctaHref:"/dashboard/empresa"}});
  expect(f.from).not.toHaveBeenCalled();
});
it("keeps anonymous account and billing reads denied", async () => {
  const f=fixture(false);
  for(const file of ["src/app/api/dashboard/account/route.ts","src/app/api/dashboard/billing/status/route.ts"]) {
    expect((await serverModuleHarness<{GET(): Promise<NextResponse>}>(file,f.imports).GET()).status).toBe(401);
  }
  expect(f.ensureStarterOrganization).not.toHaveBeenCalled();
});
