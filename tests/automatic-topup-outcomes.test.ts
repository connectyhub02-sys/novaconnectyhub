import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

function setup(outcome: string | Error) {
  const authorizedAt = "2026-09-10T12:00:00Z";
  const attempt = { id: "attempt", payment_id: "payment", amount: 47, external_reference: "reference" };
  const updates: { table: string; value: Record<string, unknown>; filters: Record<string, unknown> }[] = [];
  const client = {
    rpc: vi.fn(async () => ({ data: { claimed: true, attempt, method_id: "card" } })),
    from(table: string) {
      let update: typeof updates[number] | undefined;
      const q = {
        select: () => q, order: () => q, limit: () => q,
        eq: (key: string, value: unknown) => { if (update) update.filters[key] = value; return q; },
        update: (value: Record<string, unknown>) => { update = { table, value, filters: {} }; updates.push(update); return q; },
        single: async () => ({ data: table === "billing_asaas_card_vault" ? { customer_id: "customer", token_encrypted: "fixture" } : attempt }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [{ organization_id: "account", authorized_at: authorizedAt }], error: null }).then(resolve),
      };
      return q;
    },
  };
  class DirectError extends Error { definitive = false; declined = false; }
  const finish = vi.fn(async (_client, _attempt, state: string) => ({ state }));
  const pay = vi.fn(async () => { if (outcome instanceof Error) throw outcome; return { status: outcome }; });
  const mod = serverModuleHarness<{ processAutomaticTopups: (client: unknown) => Promise<{ attempted: number }> }>("src/lib/billing/automatic-topups.ts", {
    "@/lib/security/credentials-crypto": { decryptCredentialValue: () => "fixture" },
    "@/lib/sales-catalog/asaas": { loadAsaasPlatformBillingConfig: async () => ({}) },
    "@/lib/sales-catalog/asaas-direct": { AsaasDirectError: DirectError, createManagedAsaasInvoice: async () => ({ id: "provider-payment" }), payManagedAsaasInvoice: pay },
    "@/lib/sales-catalog/transparent-checkout": { directPaymentState: (payment: { status: string }) => payment.status },
    "./commercial-terms": { billingLocalDate: () => "2026-09-10" },
    "./native-card-checkout": { finishNativeBilling: finish },
  });
  return { run: () => mod.processAutomaticTopups(client), updates, finish, pay, authorizedAt, client };
}

it.each(["rejected", "error", "cancelled"])("pauses the original authorization after a returned %s outcome", async state => {
  const f = setup(state);
  expect(await f.run()).toMatchObject({ attempted: 1 });
  expect(f.pay).toHaveBeenCalledTimes(1);
  expect(f.updates.filter(update => update.value.enabled === false)).toEqual([{
    table: "credit_topup_policies", value: { enabled: false, updated_at: expect.any(String) },
    filters: { organization_id: "account", authorized_at: f.authorizedAt },
  }]);
});
it.each(["approved", "pending", "unknown"])("preserves authorization and makes no second charge after %s", async state => {
  const f = setup(state); await f.run();
  expect(f.pay).toHaveBeenCalledTimes(1);
  expect(f.updates.some(update => update.value.enabled === false)).toBe(false);
});
it("keeps an uncertain network result for reconciliation without retrying the card", async () => {
  const f = setup(new Error("timeout")); await f.run();
  expect(f.finish).toHaveBeenCalledWith(expect.anything(), expect.anything(), "unknown");
  expect(f.pay).toHaveBeenCalledTimes(1);
  expect(f.updates.some(update => update.value.enabled === false)).toBe(false);
});

it('reports and persists a claim failure without a provider call or disabling consent',async()=>{const f=setup('approved');f.client.rpc.mockResolvedValueOnce({data:null,error:{message:'fixture error'}} as never);expect(await f.run()).toMatchObject({checked:1,attempted:0,failed:1});expect(f.pay).not.toHaveBeenCalled();expect(f.updates.some(u=>u.value.last_error_code==='claim_failed')).toBe(true);expect(f.updates.some(u=>u.value.enabled===false)).toBe(false);});
