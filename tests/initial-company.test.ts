import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverModuleHarness } from "./helpers/server-module-harness";
import type { createInitialCompany } from "../src/lib/account/initial-company";

function fixture(accountType = "person", isComplete = true, companyName: string | null = null) {
  const rpc = vi.fn(async () => ({ data: { id: "new-company", name: companyName ?? "Nome escolhido" }, error: null }));
  const lib = serverModuleHarness<{ createInitialCompany: typeof createInitialCompany }>("src/lib/account/initial-company.ts", {
    "./signup-completion": { getAccountCompletionStatusForUser: async () => ({ accountType, isComplete, companyName }) },
  });
  const client = { rpc } as unknown as SupabaseClient;
  return { rpc, run: (automatic: boolean, name?: string) => lib.createInitialCompany({ userId: "verified-user", client, automatic, name }) };
}
it("does not create a company for a completed physical-person signup, even with an old company-name field", async () => {
  for (const name of [null, "Nome antigo"]) {
    const f = fixture("person", true, name);
    expect(await f.run(true)).toBeNull(); expect(f.rpc).not.toHaveBeenCalled();
  }
});
it("uses the legal-person company name, never the personal name or a caller override", async () => {
  const f = fixture("company", true, "  Loja   Azul ");
  await f.run(true, "Pessoa");
  expect(f.rpc).toHaveBeenCalledWith("create_initial_client_company", { p_user_id: "verified-user", p_name: "Loja Azul", p_automatic: true });
});
it("accepts an explicitly chosen name for the physical person's first company", async () => {
  const f = fixture(); await f.run(false, "  Oficina   Nova ");
  expect(f.rpc).toHaveBeenCalledWith("create_initial_client_company", expect.objectContaining({ p_name: "Oficina Nova", p_automatic: false }));
});
it("does not create for incomplete signup or missing/invalid names", async () => {
  const f = fixture("person", false);
  expect(await f.run(true)).toBeNull(); await expect(f.run(false, "Loja")).rejects.toThrow("Complete");
  expect(f.rpc).not.toHaveBeenCalled();
  for (const name of ["", "a", "a".repeat(121)]) await expect(fixture().run(false, name)).rejects.toThrow("nome");
  await expect(fixture("company").run(true)).rejects.toThrow("nome");
});
