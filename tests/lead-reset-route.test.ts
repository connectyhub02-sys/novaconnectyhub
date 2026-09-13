import { expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Route = { POST(request: { json(): Promise<unknown> }): Promise<Response> };
const id = "00000000-0000-4000-8000-000000000001";
function fixture(workspace: unknown, reset = vi.fn(async () => ({ complete: true, deleted: true }))) {
  const route = serverModuleHarness<Route>("src/app/api/dashboard/leads/reset/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/supabase/profile": { getCurrentWorkspace: async () => workspace },
    "@/lib/supabase/service": { createServiceClient: () => ({}) },
    "@/lib/whatsapp/conversation-panel-scope": { parseConversationPanelScope: (v: unknown) => v === "platform_internal" ? v : null, ensureConversationPanelScope: async () => ({ ok: true }) },
    "@/lib/leads/reset": { resetLead: reset },
  }, [], { Error });
  const call = (body: unknown = { leadId: id, confirmation: "RESETAR", organizationId: "attacker-company" }) => route.POST({ json: async () => body });
  return { call, reset };
}
const workspace = { organization: { id: "company" }, profile: { id: "actor", isPlatformAdmin: false } };
it("requires session, effective company and explicit destructive confirmation", async () => {
  expect((await fixture(null).call()).status).toBe(401);
  expect((await fixture({ ...workspace, organization: null }).call()).status).toBe(403);
  const f = fixture(workspace);
  expect((await f.call({ leadId: id })).status).toBe(400);
  expect((await f.call({ leadId: id, confirmation: "RESETAR", panelScope: "platform_internal" })).status).toBe(403);
  expect(f.reset).not.toHaveBeenCalled();
});
it("uses the authenticated company even for an impersonating platform administrator", async () => {
  for (const admin of [false, true]) {
    const f = fixture({ ...workspace, profile: { ...workspace.profile, isPlatformAdmin: admin } });
    expect((await f.call()).status).toBe(200);
    expect(f.reset).toHaveBeenCalledWith({}, "company", id, "actor");
  }
});
it("does not claim completion when object deletion is pending and returns a retryable busy response", async () => {
  const pending = fixture(workspace, vi.fn(async () => ({ complete: false, deleted: true })));
  const response = await pending.call();
  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({ ok: false, deleted: true, complete: false });
  const busy = fixture(workspace, vi.fn(async () => { throw new Error("RESET_ATTENDANCE_BUSY"); }));
  expect((await busy.call()).status).toBe(409);
});
