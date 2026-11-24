import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

function fixture(assisted: boolean) {
  const writes = vi.fn(() => { throw new Error("Unexpected write during support"); });
  const user = { id: "customer", email: "customer@example.invalid", user_metadata: {} };
  const profile = { id: user.id, email: user.email, full_name: "Customer", is_platform_admin: false };
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query, order: () => query,
        limit: () => query, maybeSingle: async () => ({ data: profile }),
        returns: async () => ({ data: [] }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: [] }),
        insert: writes, update: writes,
      };
      if (!["profiles", "organization_members", "organizations"].includes(table)) throw new Error(table);
      return query;
    },
  };
  const complete = vi.fn(async () => false);
  const checkAssisted = vi.fn(async () => assisted ? { adminUserId: "operator" } : null);
  const lib = serverModuleHarness<{ensureStarterOrganization(): Promise<unknown>}>("src/lib/supabase/profile.ts", {
    "./env": { isSupabaseAuthConfigured: () => true },
    "./server": { createClient: async () => client },
    "./service": { createServiceClient: () => client },
    "@/lib/account/profile-avatar-sync": { readAuthUserAvatarUrl: () => null },
    "@/lib/auth/meta-review-access": { readMetaReviewAccess: () => null },
    "@/lib/admin-assisted-access": { getAdminAssistedAccess: checkAssisted },
    "@/lib/account/signup-completion": { isAccountSignupComplete: complete },
  });
  return { lib, writes, complete, checkAssisted };
}
it("does not provision a workspace, trial, or notifications when opening account-only support", async () => {
  const f = fixture(true);
  expect(await f.lib.ensureStarterOrganization()).toBeNull();
  expect(f.checkAssisted).toHaveBeenCalledOnce();
  expect(f.complete).not.toHaveBeenCalled();
  expect(f.writes).not.toHaveBeenCalled();
});
it("keeps normal signup validation when there is no verified support session", async () => {
  const f = fixture(false);
  expect(await f.lib.ensureStarterOrganization()).toBeNull();
  expect(f.complete).toHaveBeenCalledOnce();
  expect(f.writes).not.toHaveBeenCalled();
});
