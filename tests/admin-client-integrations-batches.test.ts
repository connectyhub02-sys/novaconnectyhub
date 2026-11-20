import { describe, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

const mod = serverModuleHarness<typeof import("../src/lib/admin/client-integrations")>("src/lib/admin/client-integrations.ts", {
  "@/lib/supabase/service": {},
});

describe("admin client integrations batching", () => {
  it("splits hundreds of companies into URL-safe batches and merges the rows", async () => {
    const ids = Array.from({ length: 528 }, (_, i) => `org-${i}`);
    const run = vi.fn(async (batch: string[]) => ({ ready: true, rows: batch.map((id) => ({ id })), error: null }));
    const result = await mod.inOrganizationBatches(ids, run);
    expect(run).toHaveBeenCalledTimes(Math.ceil(528 / mod.organizationBatchSize));
    expect(Math.max(...run.mock.calls.map(([batch]) => batch.length))).toBeLessThanOrEqual(mod.organizationBatchSize);
    expect(result.rows).toHaveLength(528);
  });
  it("reports the first failing batch", async () => {
    const result = await mod.inOrganizationBatches(["a", "b"], async () => ({ ready: false, rows: [], error: "integration_credentials: down" }));
    expect(result).toEqual({ ready: false, rows: [], error: "integration_credentials: down" });
  });
});
