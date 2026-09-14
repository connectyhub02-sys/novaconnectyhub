import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
type Route = { POST(request: Request): Promise<Response>; GET(): Promise<Response> };
const id = "00000000-0000-4000-8000-000000000001";
const access = { tokenHash: "trusted-hash", targetSessionId: "trusted-session", targetUserId: "client", adminUserId: "operator", expiresAt: "2026-10-01T00:00:00Z" };
const workspace = { user: { id: "client" }, organization: { id: "company" }, profile: { id: "client", isPlatformAdmin: false } };
function fixture(current: unknown = workspace, grant: unknown = access, reset = vi.fn(async () => ({ complete: true, deleted: true }))) {
  const route = serverModuleHarness<Route>("src/app/api/dashboard/leads/reset/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/supabase/profile": { getCurrentWorkspace: async () => current },
    "@/lib/supabase/service": { createServiceClient: () => ({}) },
    "@/lib/admin-assisted-access": { getAdminAssistedAccess: async () => { if (grant instanceof Error) throw grant; return grant; }, isSameOriginRequest: (req: Request) => req.headers.get("origin") === new URL(req.url).origin },
    "@/lib/leads/reset": { resetLead: reset },
  }, [], { Error });
  const call = (body: unknown = { leadId: id, confirmation: "RESETAR", organizationId: "attacker-company", actorId: "attacker", isPlatformAdmin: true }, origin = "https://app.test") => route.POST(new Request("https://app.test/api/dashboard/leads/reset", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { call, reset, route };
}
it("rejects anonymous and every authenticated role without verified assisted access", async () => {
  expect((await fixture(null, null).call()).status).toBe(401);
  for (const role of ["owner", "admin", "member", "platform_admin"]) {
    const f = fixture({ ...workspace, organization: { id: "company", role }, profile: { id: "client", isPlatformAdmin: role === "platform_admin" } }, null);
    expect((await f.call()).status).toBe(403); expect(f.reset).not.toHaveBeenCalled();
    expect(await (await f.route.GET()).json()).toEqual({ canResetLead: false, expiresAt: null });
  }
});
it("requires same origin, effective company, client panel and explicit confirmation", async () => {
  expect((await fixture({ ...workspace, organization: null }).call()).status).toBe(403);
  const f = fixture();
  expect((await f.call({ leadId: id })).status).toBe(400);
  expect((await f.call({ leadId: id, confirmation: "RESETAR", panelScope: "platform_internal" })).status).toBe(403);
  expect((await f.call(undefined, "https://attacker.test")).status).toBe(403);
  expect(f.reset).not.toHaveBeenCalled();
});
it("uses only verified tenant and capability, ignoring forged actor/tenant/admin claims", async () => {
  const f = fixture(); expect((await f.call()).status).toBe(200);
  expect(f.reset).toHaveBeenCalledWith({}, "company", id, access);
  const status = await f.route.GET(); expect(status.headers.get("cache-control")).toBe("private, no-store");
  expect(await status.json()).toEqual({ canResetLead: true, expiresAt: access.expiresAt });
});
it("fails closed on outage and revocation between HTTP authorization and SQL execution", async () => {
  const f = fixture(workspace, new Error("offline"));
  expect((await f.call()).status).toBe(503); expect(f.reset).not.toHaveBeenCalled();
  expect((await fixture(workspace, access, vi.fn(async () => { throw new Error("RESET_ASSISTED_ACCESS_REQUIRED"); })).call()).status).toBe(403);
});
it("preserves pending media, busy, missing lead and generic error responses", async () => {
  const pending = fixture(workspace, access, vi.fn(async () => ({ complete: false, deleted: true })));
  const response = await pending.call(); expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({ ok: false, deleted: true, complete: false });
  for (const [message, status] of [["RESET_ATTENDANCE_BUSY", 409], ["RESET_LEAD_NOT_FOUND", 404], ["offline", 503]] as const) {
    expect((await fixture(workspace, access, vi.fn(async () => { throw new Error(message); })).call()).status).toBe(status);
  }
});
