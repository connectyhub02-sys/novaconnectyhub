import { expect, it } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as copy from "../src/lib/billing/account-notice-copy";

function fixture(existing = false) {
  const inserted: Record<string, unknown>[] = [];
  const reads: { table: string; filters: Record<string, unknown> }[] = [];
  const client = { from(table: string) {
    const filters: Record<string, unknown> = {}; reads.push({ table, filters });
    let value: Record<string, unknown> | null = null;
    const q = {
      select: () => q, order: () => q, limit: () => q,
      eq: (key: string, v: unknown) => { filters[key] = v; return q; },
      is: (key: string, v: unknown) => { filters[key] = v; return q; },
      insert: (v: Record<string, unknown>) => { value = v; inserted.push(v); return q; },
      maybeSingle: async () => {
        const tables: Record<string, unknown> = {
          platform_billing_settings: { notification_whatsapp_enabled: true },
          organizations: { id: "account", owner_id: "owner" },
          profiles: { id: "owner", full_name: "Titular", phone: "5511999999999" },
          billing_payments: { payload: { purchase_kind: "product", automatic_topup: true, commercial_terms: { included_credits: 5000, billing_cycle: "one_time" } } },
          billing_notification_events: value ? { id: "new-notice", status: "pending" } : existing ? { id: "legacy-notice", status: "sent" } : null,
        };
        return { data: tables[table] ?? null };
      },
    };
    return q;
  } };
  const mod = serverModuleHarness<{ enqueuePlatformBillingNotification: (client: unknown, input: unknown) => Promise<unknown> }>("src/lib/billing/platform-billing-webhook.ts", {
    "./account-notice-copy": copy,
    "@/lib/billing/platform-billing-messages": { PLATFORM_BILLING_MESSAGE_TEMPLATE_DEFINITIONS: [] },
    "@/lib/sales-catalog/mercado-pago": { getAppBaseUrl: () => "https://fixture.invalid" },
    "@/lib/automations/platform-automations": { findPlatformAutomationForNotification: async () => ({ delayMinutes: 5 }) },
    "@/lib/billing/renewal-policy": { normalizePlatformBillingRenewalPolicy: () => ({ notifyResponsibleHumans: false }) },
  }, ["enqueuePlatformBillingNotification"]);
  const enqueue = (key = "provider-event") => mod.enqueuePlatformBillingNotification(client, {
    organizationId: "account", subscriptionId: "subscription", invoiceId: "invoice", paymentId: "payment",
    planCode: "product-pack", planName: "Pacote", amountBrl: 47, includedCredits: 5000, eventType: "payment_refunded",
    dedupeKey: key, providerStatus: "refunded", providerReference: "reference", metadata: {},
  });
  return { inserted, reads, enqueue };
}

it("queues the credit refund to the account owner with its correct copy and scoped payment data", async () => {
  const f = fixture(); await f.enqueue();
  expect(f.reads).toContainEqual({ table: "profiles", filters: { id: "owner" } });
  expect(f.reads).toContainEqual({ table: "billing_payments", filters: { id: "payment", organization_id: "account" } });
  expect(f.inserted).toHaveLength(1);
  expect(f.inserted[0]).toMatchObject({
    recipient_phone: "5511999999999", dedupe_key: "billing:payment:payment:payment_refunded", status: "pending",
    metadata: { credit_topup: true, checkout_public_url: "https://fixture.invalid/dashboard/creditos", message_body: expect.stringContaining("estorno do pagamento da sua recarga automática") },
  });
});
it.each(["provider-event", "billing:payment:payment:payment_refunded"])("does not requeue an already sent legacy notice via %s", async key => {
  const f = fixture(true);
  expect(await f.enqueue(key)).toEqual({ id: "legacy-notice", status: "sent" });
  expect(f.inserted).toHaveLength(0);
});
