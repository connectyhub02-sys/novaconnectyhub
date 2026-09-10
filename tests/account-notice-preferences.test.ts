import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

const key = "10000000-0000-4000-8000-000000000001";
function fixture() {
  const row = { organization_id: "account", phone: "5511999999999", public_key: key, enabled: true, welcome_contact_phone: null };
  const writes = vi.fn();
  const client = { from(table: string) {
    const q = { select: () => q, eq: () => q, update: (value: unknown) => { writes(table, value); return q; }, upsert: (value: unknown) => { writes(table, value); return q; },
      maybeSingle: async () => ({ data: table === "profiles" ? { phone: row.phone } : row }), then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
    }; return q;
  } };
  const mod = serverModuleHarness<typeof import("../src/lib/billing/account-notice-preferences")>("src/lib/billing/account-notice-preferences.ts", { "./notification-sender": { loadNotificationAccount: async () => ({ id: "account", ownerId: "owner" }) } });
  return { row, writes, mod, client: client as never };
}
it("offers the actual platform contact only in the initial welcome", async () => {
  const f = fixture();
  const input = { appUrl: "https://fixture.invalid", senderKind: "platform" as const, senderPhone: "+55 11 88888-8888", eventType: "trial_started" };
  expect(await f.mod.prepareNoticeActions(f.client, f.row, input)).toEqual({ unsubscribeUrl: `https://fixture.invalid/avisos/${key}`, contactUrl: `https://fixture.invalid/avisos/${key}/contato` });
  expect(f.writes).toHaveBeenCalledWith("account_notice_recipients", { welcome_contact_phone: "5511888888888" });
  f.writes.mockClear();
  for (const change of [{ senderKind: "customer" as const }, { eventType: "payment_approved" }, { senderPhone: null }]) {
    expect(await f.mod.prepareNoticeActions(f.client, f.row, { ...input, ...change })).not.toHaveProperty("contactUrl");
  }
  expect(f.writes).not.toHaveBeenCalled();
});
it("checks current consent again immediately before each sender's attempt", async () => {
  const f = fixture(); const snapshot = { ...f.row }; f.row.enabled = false;
  await expect(f.mod.prepareNoticeActions(f.client, snapshot, { appUrl: "https://fixture.invalid", senderKind: "platform", senderPhone: null, eventType: "trial_started" })).rejects.toBeInstanceOf(f.mod.AccountNoticesOptedOut);
  expect(f.writes).not.toHaveBeenCalled();
});
it("allows only the owner to re-enable their own current phone from the dashboard", async () => {
  const f = fixture();
  await expect(f.mod.saveOwnerNoticeDelivery(f.client, "account", "member", true)).rejects.toThrow("titular");
  expect(f.writes).not.toHaveBeenCalled();
  await f.mod.saveOwnerNoticeDelivery(f.client, "account", "owner", true);
  expect(f.writes).toHaveBeenCalledWith("account_notice_recipients", expect.objectContaining({ organization_id: "account", phone: "5511999999999", enabled: true, opted_out_at: null }));
});
