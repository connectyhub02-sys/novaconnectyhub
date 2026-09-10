import { describe, expect, it, vi } from "vitest";
import * as policy from "../src/lib/billing/notification-sender-policy";
import { serverModuleHarness } from "./helpers/server-module-harness";
import type { NotificationSender } from "../src/lib/billing/notification-sender";

const account = "10000000-0000-4000-8000-000000000001", child = "10000000-0000-4000-8000-000000000002", foreign = "10000000-0000-4000-8000-000000000003";
const agent = "20000000-0000-4000-8000-000000000001", other = "20000000-0000-4000-8000-000000000002";
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function fixture() {
  const tables: Record<string, Row[]> = {
    organizations: [{ id: account, owner_id: "owner", billing_organization_id: null }, { id: child, owner_id: "owner", billing_organization_id: account }, { id: foreign, owner_id: "stranger", billing_organization_id: null }],
    agent_registry: [{ id: agent, organization_id: child, scope: "organization", name: "Meu agente", persona_name: "Ana", status: "online", metadata: { agent_kind: "whatsapp" } }, { id: other, organization_id: foreign, scope: "organization", status: "online", metadata: { agent_kind: "whatsapp" } }],
    whatsapp_instances: [{ id: "customer-instance", organization_id: child, provider: "uazapi", status: "connected", instance_token_encrypted: "private", phone_number: "5511999990001", metadata: { agent_id: agent } }, { id: "platform-instance", organization_id: "global", provider: "uazapi", status: "connected", instance_token_encrypted: "global-private", metadata: { agent_id: "global-agent", platform_whatsapp: true, admin_whatsapp: true } }],
    notification_sender_preferences: [], platform_billing_settings: [{ setting_key: "default", billing_whatsapp_agent_id: "global-agent", notification_whatsapp_enabled: true }],
  };
  const writes = vi.fn();
  const client = { from(table: string) {
    let rows = [...(tables[table] ?? [])]; let single = false;
    const q: Row = {};
    q.select = q.order = () => q;
    q.eq = (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return q; };
    q.neq = (key: string, value: unknown) => { rows = rows.filter(row => row[key] !== value); return q; };
    q.in = (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return q; };
    q.contains = (key: string, values: Row) => { rows = rows.filter(row => Object.entries(values).every(([k, v]) => row[key]?.[k] === v)); return q; };
    q.limit = (limit: number) => { rows = rows.slice(0, limit); return q; };
    q.single = q.maybeSingle = () => { single = true; return q; };
    q.upsert = (value: Row) => { writes(table, value); return q; };
    q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve);
    return q;
  } };
  const mod = serverModuleHarness<typeof import("../src/lib/billing/notification-sender")>("src/lib/billing/notification-sender.ts", { "./notification-sender-policy": policy });
  return { tables, writes, mod, client: client as never };
}
describe("sender selection for the shared account", () => {
  it("automatically adopts a connected customer agent, including a child company", async () => {
    const f = fixture();
    expect(await f.mod.resolveNotificationSender(f.client, account, null)).toMatchObject({ kind: "customer", agentId: agent });
    expect((await f.mod.loadNotificationSenderOptions(f.client, child)).candidates.map(a => a.id)).toEqual([agent]);
  });
  it.each(["api-only", "disconnected", "paused", "disabled", "self-recipient", "platform-mode", "deleted-choice"])("uses the platform for %s", async reason => {
    const f = fixture();
    if (reason === "api-only") f.tables.agent_registry = [];
    if (reason === "disconnected") f.tables.whatsapp_instances[0].status = "disconnected";
    if (reason === "paused") f.tables.agent_registry[0].status = "paused";
    if (reason === "disabled") f.tables.agent_registry[0].metadata.whatsapp_behavior_config = { agentEnabled: false };
    if (reason === "platform-mode") f.tables.notification_sender_preferences = [{ organization_id: account, mode: "platform", agent_id: null }];
    if (reason === "deleted-choice") f.tables.notification_sender_preferences = [{ organization_id: account, mode: "agent", agent_id: null }];
    expect(await f.mod.resolveNotificationSender(f.client, account, null, reason === "self-recipient" ? "5511999990001" : undefined)).toMatchObject({ kind: "platform", agentId: "global-agent" });
  });
  it("honors an explicit disconnected choice instead of switching to another customer agent", () => {
    expect(policy.chooseNotificationAgent({ mode: "agent", agent_id: "selected" }, [{ id: "selected", name: "A", available: false }, { id: "other", name: "B", available: true }])).toBeNull();
  });
  it("never uses another account's agent or a platform-marked instance as a customer sender", async () => {
    const f = fixture(); f.tables.notification_sender_preferences = [{ organization_id: account, mode: "agent", agent_id: other }];
    expect(await f.mod.resolveNotificationSender(f.client, account, null)).toMatchObject({ kind: "platform" });
    f.tables.notification_sender_preferences = []; f.tables.whatsapp_instances[0].metadata.platform_whatsapp = true;
    expect(await f.mod.resolveNotificationSender(f.client, account, null)).toMatchObject({ kind: "platform" });
  });
  it("rejects non-owners and foreign agents; stores legitimate choice on the billing account", async () => {
    const f = fixture();
    await expect(f.mod.saveNotificationSenderPreference(f.client, account, "member", { mode: "automatic" })).rejects.toThrow("titular");
    await expect(f.mod.saveNotificationSenderPreference(f.client, account, "owner", { mode: "agent", agentId: other })).rejects.toThrow("desta conta");
    expect(f.writes).not.toHaveBeenCalled();
    await f.mod.saveNotificationSenderPreference(f.client, child, "owner", { mode: "agent", agentId: agent, organizationId: foreign });
    expect(f.writes).toHaveBeenCalledWith("notification_sender_preferences", expect.objectContaining({ organization_id: account, agent_id: agent }));
  });
  it("does not claim an unavailable global sender is connected", async () => {
    const f = fixture(); f.tables.whatsapp_instances.forEach(instance => instance.status = "disconnected");
    expect(await f.mod.resolveNotificationSender(f.client, account, null)).toBeNull();
  });
  it("does not borrow a connected API instance or its customer-supplied agent metadata", async () => {
    const f = fixture();
    f.tables.whatsapp_instances[0].metadata = { api_gateway: true, customer_metadata: { agent_id: agent } };
    expect(await f.mod.resolveNotificationSender(f.client, account, null)).toMatchObject({ kind: "platform" });
    expect(f.writes).not.toHaveBeenCalled();
  });
});

describe("safe fallback within one claimed notice", () => {
  const customer = { kind: "customer" } as NotificationSender, platform = { kind: "platform" } as NotificationSender;
  it("switches to the platform after definite non-delivery", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("disconnected")).mockResolvedValueOnce("sent");
    const result = await policy.deliverWithPlatformFallback({ sender: customer, send, fallback: async () => platform, isDefinitiveFailure: () => true });
    expect(result).toMatchObject({ sender: platform, fallbackUsed: true, result: "sent" });
    expect(send.mock.calls.map(([s]) => s.kind)).toEqual(["customer", "platform"]);
  });
  it("does not send again after a timeout or ambiguous provider failure", async () => {
    const fallback = vi.fn(); const send = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(policy.deliverWithPlatformFallback({ sender: customer, send, fallback, isDefinitiveFailure: () => false })).rejects.toThrow("timeout");
    expect(send).toHaveBeenCalledTimes(1); expect(fallback).not.toHaveBeenCalled();
  });
});
