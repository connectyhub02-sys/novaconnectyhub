import { expect, it } from "vitest";
import * as presentation from "../src/lib/billing/custom-plan-presentation";
import { serverModuleHarness } from "./helpers/server-module-harness";

const metadata = { commercial_terms: { custom_contract_id: "contract-a", custom_contract_version: 1, name: "Plataforma A", price_brl: 10000, included_credits: 150000, resource_limits: { whatsapp_instance_limit: 8 } } };
it("identifies accepted custom terms and never labels a catalog subscription as custom", () => {
  expect(presentation.readCustomPlan(metadata)).toMatchObject({ label: "Personalizado", priceBrl: 10000, includedCredits: 150000 });
  expect(presentation.readCustomPlan({ commercial_terms: { name: "Scale", included_credits: 25000 } })).toBeNull();
  expect(presentation.readCustomPlan(null)).toBeNull();
});
it("shows the accepted price and allowance in the customer's account without changing the technical plan", () => {
  const { mapSubscription } = serverModuleHarness<{ mapSubscription: (row: object) => Record<string, unknown> }>("src/app/api/dashboard/account/route.ts", { "@/lib/billing/custom-plan-presentation": presentation }, ["mapSubscription"]);
  const row = { id: "sub", plan_code: "scale", status: "active", metadata, billing_plans: { name: "Scale", monthly_price_brl: 497, included_credits: 25000 } };
  expect(mapSubscription(row)).toMatchObject({ planCode: "scale", planName: "Personalizado · Plataforma A", monthlyPriceBrl: 10000, includedCredits: 150000 });
  expect(mapSubscription({ ...row, metadata: {} })).toMatchObject({ planName: "Scale", monthlyPriceBrl: 497, includedCredits: 25000 });
});
it("labels new custom payments from their own snapshot while preserving old catalog history", () => {
  const { mapPayment } = serverModuleHarness<{ mapPayment: (row: object) => Record<string, unknown> }>("src/app/api/dashboard/account/route.ts", {
    "@/lib/billing/custom-plan-presentation": presentation,
    "@/lib/billing/account-payment-notice": { accountPaymentNotice: () => null },
  }, ["mapPayment"]);
  const row = { id: "payment", status: "approved", organization_subscriptions: { plan_code: "scale" }, billing_invoices: null, payload: metadata };
  expect(mapPayment(row)).toMatchObject({ planName: "Personalizado", planCode: "scale" });
  expect(mapPayment({ ...row, payload: {} })).toMatchObject({ planName: null, planCode: "scale" });
});
it("lists each customer's own drafts separately from their accepted contract", async () => {
  const rows: Record<string, Record<string, unknown>[]> = {
    profiles: [{ id: "owner-a" }, { id: "owner-b" }],
    organization_members: ["a", "b"].map(id => ({ user_id: `owner-${id}`, role: "owner", organizations: { id, name: id, status: "active", plan_code: "scale" } })),
    organization_subscriptions: [{ id: "sub", organization_id: "a", subscription_kind: "plan", plan_code: "scale", metadata }],
    organization_custom_contracts: [{ id: "draft-a", organization_id: "a", version: 2, monthly_price_brl: 12000 }, { id: "draft-b", organization_id: "b", version: 1 }],
  };
  const service = {
    auth: { admin: { listUsers: async () => ({ data: { users: ["a", "b"].map(id => ({ id: `owner-${id}`, email: `${id}@example.test` })) } }) } },
    from: (table: string) => {
      let data = rows[table] ?? [];
      const query = { select: () => query, order: () => query, limit: () => query,
        in: (key: string, values: unknown[]) => { data = data.filter(row => values.includes(row[key])); return query; },
        eq: (key: string, value: unknown) => { data = data.filter(row => row[key] === value); return query; },
        then: (resolve: (value: object) => unknown) => Promise.resolve(resolve({ data, error: null })),
      }; return query;
    },
  };
  const adminUsers = serverModuleHarness<{ getAdminPlatformUsers: (service: unknown) => Promise<{ users: Array<{ id: string; customPlan: unknown; customContracts: Array<{ id: string }> }> }> }>("src/lib/admin/users.ts", {
    "@/lib/billing/custom-plan-presentation": presentation,
    "@/lib/account/profile-avatar-sync": Object.fromEntries(["readAuthUserAvatarSource", "readAuthUserAvatarUrl", "readAuthUserWhatsappAvatarStatus", "readAuthUserWhatsappAvatarSyncedAt"].map(key => [key, () => null])),
  });
  const { users } = await adminUsers.getAdminPlatformUsers(service);
  expect(users[0].customPlan).toMatchObject({ id: "contract-a", priceBrl: 10000, includedCredits: 150000 });
  expect(users[0].customContracts.map(c => c.id)).toEqual(["draft-a"]);
  expect(users[1].customPlan).toBeNull();
  expect(users[1].customContracts.map(c => c.id)).toEqual(["draft-b"]);
});
