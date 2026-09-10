import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

function fixture(authenticated = true) {
  const workspace = vi.fn(async () => authenticated ? { organization: { id: "session-account" }, user: { id: "session-user" } } : null);
  const load = vi.fn(async () => ({ account: { ownerId: "session-user" }, preference: { mode: "automatic", agent_id: null }, candidates: [{ id: "agent", name: "Ana", available: true, instance: { instance_token_encrypted: "private" } }] }));
  const save = vi.fn(async () => {});
  const mod = serverModuleHarness<typeof import("../src/app/api/dashboard/notification-sender/route")>("src/app/api/dashboard/notification-sender/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) } },
    "@/lib/supabase/profile": { getCurrentWorkspace: workspace }, "@/lib/supabase/service": { createServiceClient: () => "service" },
    "@/lib/billing/notification-sender": { loadNotificationSenderOptions: load, saveNotificationSenderPreference: save },
    "@/lib/billing/account-notice-preferences": { loadOwnerNoticeDelivery: async () => ({ enabled: true, phone: "5511999999999" }) },
  });
  return { mod, workspace, save, load };
}
it("returns only public settings and remains accessible when billing is restricted", async () => {
  const f = fixture(); const response = await f.mod.GET();
  expect(await response.json()).toEqual({ canManage: true, preference: { mode: "automatic", agent_id: null }, agents: [{ id: "agent", name: "Ana", available: true }], delivery: { enabled: true, hasPhone: true } });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(f.workspace).toHaveBeenCalledWith({ allowRestricted: true });
});
it("takes the account and actor from the session, never from the submitted preference", async () => {
  const f = fixture();
  await f.mod.POST(new Request("https://fixture.invalid", { method: "POST", body: JSON.stringify({ mode: "automatic", organizationId: "foreign", userId: "stranger" }) }));
  expect(f.save).toHaveBeenCalledWith("service", "session-account", "session-user", expect.any(Object));
});
it("rejects unauthenticated reads and updates", async () => {
  const f = fixture(false);
  expect((await f.mod.GET()).status).toBe(401);
  expect((await f.mod.POST(new Request("https://fixture.invalid"))).status).toBe(401);
  expect(f.load).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled();
});
