import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
const m = vi.hoisted(() => ({ auth: vi.fn(), project: vi.fn(), audit: vi.fn(), broker: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/infrastructure/server", async () => { const actual = await vi.importActual<typeof import("@/lib/infrastructure/server")>("@/lib/infrastructure/server"); return { ...actual, access: m.auth, getProject: m.project, audit: m.audit }; });
vi.mock("@/lib/infrastructure/hosting-server", async () => { const actual = await vi.importActual<typeof import("@/lib/infrastructure/hosting-server")>("@/lib/infrastructure/hosting-server"); return { ...actual, hostingBroker: m.broker }; });
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc: m.rpc }) }));
import { PATCH, POST } from "@/app/api/admin/infrastructure/[project]/hosting/route";
const context = { params: Promise.resolve({ project: "vision" }) };
const requestId = "00000000-0000-4000-8000-000000000001";
const body = () => ({ action: "pause", confirmation: "vision:pause", revision: "a".repeat(64), requestId, reason: "Pedido administrativo" });
const req = (body: unknown, method = "POST", origin = "https://connectyhub.test") => new Request("https://connectyhub.test/api/admin/infrastructure/vision/hosting", { method, headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://connectyhub.test"); vi.clearAllMocks(); m.auth.mockResolvedValue({ userId: requestId, canOperate: true }); m.project.mockResolvedValue({ id: "vision" }); m.rpc.mockResolvedValue({ error: null }); m.audit.mockResolvedValue(undefined); m.broker.mockResolvedValue({ operation: { status: "running" } }); });
afterEach(() => vi.unstubAllEnvs());
it("does not operate without platform and infra access", async () => {
  m.auth.mockResolvedValue(NextResponse.json({}, { status: 401 })); expect((await POST(req(body()), context)).status).toBe(401);
  m.auth.mockResolvedValue({ userId: requestId, canOperate: false }); expect((await POST(req(body()), context)).status).toBe(403); expect(m.broker).not.toHaveBeenCalled();
});
it("rejects foreign origins and mismatched project confirmation", async () => {
  expect((await POST(req(body(), "POST", "https://evil.test"), context)).status).toBe(400);
  expect((await POST(req({ ...body(), confirmation: "immov-ai:pause" }), context)).status).toBe(400);
  expect(m.broker).not.toHaveBeenCalled();
});
it("fails closed if intent cannot be audited", async () => { m.audit.mockRejectedValue(new Error("DB_SECRET")); const r = await POST(req(body()), context); expect(r.status).toBe(503); expect(m.broker).not.toHaveBeenCalled(); expect(await r.text()).not.toContain("DB_SECRET"); });
it("forwards only the reviewed operation with authenticated actor", async () => {
  expect((await POST(req(body()), context)).status).toBe(200);
  expect(m.broker).toHaveBeenCalledWith("vision", { action: "pause", revision: "a".repeat(64), requestId, actor: requestId });
});
it("allows platform admins to assign clients without granting operational host access", async () => {
  m.auth.mockResolvedValue({ userId: requestId, canOperate: false });
  expect((await PATCH(req({ organizationId: requestId, visible: true, revision: 0 }, "PATCH"), context)).status).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith("infra_save_customer_binding", { p_project: "vision", p_organization: requestId, p_visible: true, p_revision: 0, p_actor: requestId });
  expect(m.broker).not.toHaveBeenCalled();
});
it("returns conflict for stale binding edits", async () => { m.rpc.mockResolvedValue({ error: { message: "binding_conflict" } }); expect((await PATCH(req({ organizationId: null, visible: false, revision: 0 }, "PATCH"), context)).status).toBe(409); });
it("saves behind the production HTTP proxy with the configured public HTTPS origin", async () => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.connectyhub.com.br");
  const r = new Request("http://0.0.0.0:3000/api/admin/infrastructure/vision/hosting", {
    method: "PATCH", headers: { origin: "https://www.connectyhub.com.br", "content-type": "application/json" },
    body: JSON.stringify({ organizationId: requestId, visible: true, revision: 0 }),
  });
  expect((await PATCH(r, context)).status).toBe(200);
  expect(m.rpc).toHaveBeenCalledOnce();
});
it.each([undefined, "null", "https://evil.test", "http://0.0.0.0:3000"])("rejects invalid origin %s before binding even with forged proxy headers", async origin => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.connectyhub.com.br");
  const r = new Request("http://0.0.0.0:3000/api/admin/infrastructure/vision/hosting", {
    method: "PATCH", headers: { ...(origin ? { origin } : {}), "x-forwarded-host": "evil.test", "content-type": "application/json" },
    body: JSON.stringify({ organizationId: requestId, visible: true, revision: 0 }),
  });
  expect((await PATCH(r, context)).status).toBe(400); expect(m.rpc).not.toHaveBeenCalled();
});
