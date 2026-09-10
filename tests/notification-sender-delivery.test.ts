import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as policy from "../src/lib/billing/notification-sender-policy";
import * as voice from "../src/lib/billing/account-notice-voice";
import * as actions from "../src/lib/billing/account-notice-actions";

function setup(responses: (number | Error)[] = [200], eventType = "paid_no_credits") {
  const current = { organization_id: "account", event_type: eventType, subscription_id: null, invoice_id: null, metadata: { platform_sender_agent_id: "global-agent" } };
  const updates: Record<string, unknown>[] = [];
  const client = { rpc: vi.fn(async () => ({ data: true })), from(table: string) {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: table === "platform_billing_settings" ? { notification_whatsapp_enabled: true } : current }), update: (value: Record<string, unknown>) => { if (table === "billing_notification_events") updates.push(value); return q; }, then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
    return q;
  } };
  const customer = { kind: "customer", agentId: "customer-agent", agentName: "Ana", instance: { id: "customer-instance", instance_token_encrypted: "customer-secret" } };
  const platform = { kind: "platform", agentId: "global-agent", instance: { id: "platform-instance", instance_token_encrypted: "global-secret" } };
  const resolver = { resolveNotificationSender: vi.fn(async () => customer), loadPlatformNotificationSender: vi.fn(async () => platform) };
  const fetch = vi.fn(async (_url: string, _options: RequestInit) => { // eslint-disable-line @typescript-eslint/no-unused-vars
    const response = responses.shift() ?? 200;
    if (response instanceof Error) throw response;
    return { ok: response === 200, status: response, text: async () => JSON.stringify(response === 200 ? { id: "message-id" } : { error: "Sender unavailable" }) };
  });
  class OptedOut extends Error {}
  const preferences = { AccountNoticesOptedOut: OptedOut, ensureNoticeRecipient: vi.fn(async () => ({ enabled: true })), prepareNoticeActions: vi.fn(async () => ({ unsubscribeUrl: "https://fixture.invalid/avisos/key" })) };
  const mod = serverModuleHarness<{ sendBillingNotificationNow: (client: unknown, input: unknown) => Promise<boolean> }>("src/lib/billing/platform-billing-webhook.ts", {
    "./notification-sender": resolver, "./notification-sender-policy": policy,
    "./account-notice-voice": voice,
    "./account-notice-actions": actions,
    "./account-notice-preferences": preferences,
    "@/lib/sales-catalog/mercado-pago": { getAppBaseUrl: () => "https://fixture.invalid" },
    "@/lib/billing/platform-billing-messages": { PLATFORM_BILLING_MESSAGE_TEMPLATE_DEFINITIONS: [] },
    "@/lib/whatsapp/uazapi-credentials": { loadUazapiCredentials: async () => ({ baseUrl: "https://fixture.invalid" }) },
    "@/lib/security/credentials-crypto": { decryptCredentialValue: (v: string) => v },
  }, ["sendBillingNotificationNow"], { fetch });
  return { client, updates, resolver, fetch, preferences, deliver: () => mod.sendBillingNotificationNow(client, { eventId: "notice", agentId: "global-agent", phone: "5511999999999", message: "Seus créditos acabaram." }) };
}
it("routes a zero-credit notice through the customer's connection without a credit or payment gate", async () => {
  const f = setup(); expect(await f.deliver()).toBe(true);
  expect(f.client.rpc.mock.calls).toEqual([["claim_billing_notice", { p_event: "notice" }]]);
  expect(f.fetch).toHaveBeenCalledTimes(1);
  expect(f.fetch).toHaveBeenCalledWith("https://fixture.invalid/send/menu", expect.objectContaining({ headers: expect.objectContaining({ token: "customer-secret" }) }));
  expect(f.updates.find(update => update.status === "sent")).toMatchObject({ selected_agent_id: "customer-agent", metadata: { sender_kind: "customer", sender_instance_id: "customer-instance" } });
  const body = JSON.parse(String(f.fetch.mock.calls[0]?.[1]?.body));
  expect(body.text).toContain("Sou Ana, seu assistente virtual.");
  expect(body.text).toContain("Fiquei sem créditos");
});
it.each(["trial_started", "subscription_pending", "checkout_payment_started", "payment_pending", "payment_approved", "payment_rejected", "payment_canceled", "payment_refunded", "manual_plan_activated", "manual_plan_renewed", "paid_plan_three_days_remaining", "paid_plan_one_day_remaining", "paid_plan_due_today", "paid_plan_grace_period", "paid_plan_expired", "subscription_canceled", "subscription_paused", "credit_topup_enabled", "credit_topup_disabled", "credit_topup_action_required", "paid_access_ending", "paid_access_ended"])("routes %s through the customer's agent with the same administrator recipient", async eventType => {
  const f = setup([200], eventType); expect(await f.deliver()).toBe(true);
  expect(f.fetch).toHaveBeenCalledWith("https://fixture.invalid/send/menu", expect.objectContaining({ headers: expect.objectContaining({ token: "customer-secret" }), body: expect.stringContaining('"number":"5511999999999"') }));
  expect(f.resolver.loadPlatformNotificationSender).not.toHaveBeenCalled();
});
it("records one successful notice after a definite customer sender failure and a global fallback", async () => {
  const f = setup([401, 200]); expect(await f.deliver()).toBe(true);
  expect(f.fetch).toHaveBeenCalledTimes(2); expect(f.client.rpc).toHaveBeenCalledTimes(1);
  expect(f.updates.filter(update => update.status === "sent")).toHaveLength(1);
  expect(f.updates.find(update => update.status === "sent")).toMatchObject({ selected_agent_id: "global-agent", metadata: { sender_fallback: true, sender_kind: "platform" } });
  const firstBody = JSON.parse(String(f.fetch.mock.calls[0]?.[1]?.body));
  const fallbackBody = JSON.parse(String(f.fetch.mock.calls[1]?.[1]?.body));
  expect(firstBody.text).toContain("Fiquei sem créditos");
  expect(fallbackBody.text).toBe("Seus créditos acabaram.\n\nSair da lista de avisos da conta: https://fixture.invalid/avisos/key");
  expect(f.updates.find(update => update.status === "sent")).toMatchObject({ message_preview: fallbackBody.text, metadata: { sent_message_body: fallbackBody.text } });
  expect(fallbackBody.choices).toContain("Sair da lista|https://fixture.invalid/avisos/key");
});
it("records uncertain delivery and never switches sender after a network timeout", async () => {
  const f = setup([new Error("timeout")]); expect(await f.deliver()).toBe(false);
  expect(f.fetch).toHaveBeenCalledTimes(1); expect(f.resolver.loadPlatformNotificationSender).not.toHaveBeenCalled();
  expect(f.updates.at(-1)).toMatchObject({ status: "failed", delivery_uncertain: true });
});
it("does nothing when another worker owns the same notice", async () => {
  const f = setup(); f.client.rpc.mockResolvedValueOnce({ data: false });
  expect(await f.deliver()).toBe(false); expect(f.fetch).not.toHaveBeenCalled(); expect(f.updates).toHaveLength(0);
});
it("suppresses a queued notice after the recipient leaves the list", async () => {
  const f = setup(); f.preferences.ensureNoticeRecipient.mockResolvedValueOnce({ enabled: false });
  expect(await f.deliver()).toBe(false);
  expect(f.fetch).not.toHaveBeenCalled(); expect(f.resolver.resolveNotificationSender).not.toHaveBeenCalled();
  expect(f.updates.at(-1)).toMatchObject({ status: "skipped", delivery_claimed_at: null, next_attempt_at: null });
});
it("does not bypass an opt-out received between the customer failure and platform fallback", async () => {
  const f = setup([401, 200]);
  f.preferences.prepareNoticeActions.mockResolvedValueOnce({ unsubscribeUrl: "https://fixture.invalid/avisos/key" }).mockRejectedValueOnce(new f.preferences.AccountNoticesOptedOut("Opted out"));
  expect(await f.deliver()).toBe(false); expect(f.fetch).toHaveBeenCalledTimes(1);
  expect(f.updates.at(-1)).toMatchObject({ status: "skipped" });
});
it("keeps a working unsubscribe link when interactive buttons are rejected", async () => {
  const f = setup([422, 200]); expect(await f.deliver()).toBe(true);
  expect(f.fetch.mock.calls[1][0]).toBe("https://fixture.invalid/send/text");
  expect(JSON.parse(String(f.fetch.mock.calls[1][1].body)).text).toContain("Sair da lista de avisos da conta: https://fixture.invalid/avisos/key");
  expect(f.resolver.loadPlatformNotificationSender).not.toHaveBeenCalled();
});
