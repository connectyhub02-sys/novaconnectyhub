import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ensureTrialForCompletedSignup } from "../src/lib/account/signup-completion";
import { serverModuleHarness } from "./helpers/server-module-harness";

it("phone revalidation does not grant credits or schedule messages for an expired first company", async () => {
  const grant = vi.fn(); const schedule = vi.fn(); const notify = vi.fn();
  const organization = { id: "company", plan_code: "trial", status: "trial_expired" };
  const client = { from(table: string) {
    const result = table === "profiles" ? {
      full_name: "Pessoa Teste", account_type: "person", document_type: "cpf", cpf_hash: "hash",
      phone_normalized: "5547999999999", phone_verified_at: "2026-10-01", signup_completed_at: "2026-10-01",
    } : { organizations: organization };
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: result, error: null }) };
    return query;
  } } as unknown as SupabaseClient;
  const lib = serverModuleHarness<{ ensureTrialForCompletedSignup: typeof ensureTrialForCompletedSignup }>("src/lib/account/signup-completion.ts", {
    "@/lib/billing/trial": { TRIAL_PLAN_CODE: "trial", grantTrialCredits: grant, scheduleTrialConversionMessages: schedule },
    "@/lib/billing/trial-notifications": { sendTrialStartedNotification: notify },
  });
  expect(await lib.ensureTrialForCompletedSignup({ userId: "person", client })).toEqual(organization);
  expect(grant).not.toHaveBeenCalled(); expect(schedule).not.toHaveBeenCalled(); expect(notify).not.toHaveBeenCalled();
});
