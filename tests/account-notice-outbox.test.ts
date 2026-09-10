import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function fixture(eventType = "credit_topup_action_required") {
  const auth = "2026-09-10T10:00:00Z";
  const row = { id: "notice", organization_id: "account", payment_id: null as string | null, event_type: eventType, dedupe_key: "stable-key", metadata: { policy_authorized_at: auth, reason: "card_unavailable" }, attempts: 0 };
  const tables: Record<string, Row[]> = { account_billing_notice_outbox: [row], credit_topup_policies: [{ enabled: true, authorized_at: auth, agreed_amount_brl: 47, agreed_credits: 5000, threshold_credits: 1000, monthly_cap_brl: 94, card_method_id: "card" }], credit_wallets: [{ balance_credits: 500 }], billing_asaas_card_vault: [{ status: "inactive" }] };
  const deleted = vi.fn(), updated = vi.fn();
  const client = { from(table: string) {
    const q: Row = {}; let single = false;
    q.select = q.eq = q.lte = q.order = q.limit = () => q;
    q.single = q.maybeSingle = () => { single = true; return q; };
    q.delete = () => { deleted(table); return q; };
    q.update = (value: Row) => { updated(table, value); return q; };
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: single ? tables[table]?.[0] ?? null : tables[table] ?? [], error: null }).then(resolve);
    return q;
  } };
  const mod = serverModuleHarness<typeof import("../src/lib/billing/account-notice-outbox")>("src/lib/billing/account-notice-outbox.ts");
  const enqueue = vi.fn(async () => ({ id: "durable-notice" }));
  return { row, tables, deleted, updated, enqueue, process: () => mod.processAccountBillingNoticeOutbox(client as never, enqueue, "https://fixture.invalid") };
}
it("passes blocked recargas into the common account sender with their stable key", async () => {
  const f = fixture(); expect(await f.process()).toEqual({ checked: 1, queued: 1 });
  expect(f.enqueue).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "account", eventType: "credit_topup_action_required", dedupeKey: "stable-key", metadata: expect.objectContaining({ reason: "card_unavailable", credit_amount: 5000, checkout_url: "https://fixture.invalid/dashboard/creditos" }) }));
  expect(f.deleted).toHaveBeenCalledWith("account_billing_notice_outbox");
});
it.each(["new-authorization", "recharged", "card-fixed"])("drops a stale warning after %s", async condition => {
  const f = fixture();
  if (condition === "new-authorization") f.tables.credit_topup_policies[0].authorized_at = "2026-09-10T11:00:00Z";
  if (condition === "recharged") f.tables.credit_wallets[0].balance_credits = 6000;
  if (condition === "card-fixed") f.tables.billing_asaas_card_vault[0].status = "active";
  await f.process(); expect(f.enqueue).not.toHaveBeenCalled(); expect(f.deleted).toHaveBeenCalled();
});
it("keeps the intent for retry if creating the notification fails", async () => {
  const f = fixture(); f.enqueue.mockRejectedValueOnce(new Error("database offline"));
  await f.process(); expect(f.deleted).not.toHaveBeenCalled(); expect(f.updated).toHaveBeenCalledWith("account_billing_notice_outbox", expect.objectContaining({ attempts: 1, next_attempt_at: expect.any(String) }));
});
it("notifies a direct refund and suppresses a cancellation superseded by approval", async () => {
  const f = fixture("payment_refunded"); f.row.payment_id = "payment";
  f.tables.billing_payments = [{ id: "payment", organization_id: "account", subscription_id: "subscription", invoice_id: "invoice", status: "refunded", amount_brl: 47, payload: { target_plan_code: "pro", commercial_terms: { name: "Pro" } } }];
  await f.process(); expect(f.enqueue).toHaveBeenCalledWith(expect.objectContaining({ eventType: "payment_refunded", paymentId: "payment", planName: "Pro", amountBrl: 47 }));
  f.row.event_type = "payment_canceled"; f.tables.billing_payments[0].status = "approved"; f.enqueue.mockClear();
  await f.process(); expect(f.enqueue).not.toHaveBeenCalled();
});
